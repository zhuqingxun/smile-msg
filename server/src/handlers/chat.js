import {
  registerUser, removeUser, createConversation,
  users, socketToUser, nicknameToUuid, conversations,
  disconnectTimers, disconnectTimes, offlineMessages
} from '../store.js'
import { sendPushNotification, isFcmEnabled } from '../push.js'

const GRACE_PERIOD_MS = 30 * 60 * 1000 // 30 分钟

function parsePlatform(ua) {
  if (ua.includes('Electron')) return 'desktop'
  if (ua.includes('Android')) return 'android'
  return 'web'
}

export function setupChatHandlers(io, socket) {

  // 登录
  socket.on('login', ({ uuid, nickname }, callback) => {
    if (!uuid || !nickname || nickname.trim().length === 0 || nickname.length > 20) {
      return callback({ success: false, error: '昵称无效' })
    }

    const ua = socket.handshake.headers['user-agent'] || ''
    const platform = parsePlatform(ua)
    const result = registerUser(uuid, nickname.trim(), socket.id, platform)

    if (!result.success) {
      return callback({ success: false, error: result.error })
    }

    // 踢掉旧连接
    if (result.oldSocketId && result.oldSocketId !== socket.id) {
      io.to(result.oldSocketId).emit('force_disconnect', { reason: '账号在其他地方登录' })
      const oldSocket = io.sockets.sockets.get(result.oldSocketId)
      if (oldSocket) oldSocket.disconnect(true)
    }

    // 下发离线消息缓存
    const pendingMessages = offlineMessages.get(uuid)
    if (pendingMessages && pendingMessages.length > 0) {
      offlineMessages.delete(uuid)
      // 延迟发送，确保客户端已准备好接收
      setTimeout(() => {
        for (const msg of pendingMessages) {
          socket.emit('new_message', msg)
        }
      }, 500)
    }

    // 检查是否有未完成的会话（断线重连场景）
    const user = users.get(uuid)
    if (user?.conversationId) {
      const conv = conversations.get(user.conversationId)
      if (conv) {
        socket.join(user.conversationId)
        const peerUuid = [...conv.members].find(id => id !== uuid)
        const peer = peerUuid ? users.get(peerUuid) : null
        return callback({
          success: true,
          restored: true,
          conversationId: user.conversationId,
          target: peer ? { uuid: peerUuid, nickname: peer.nickname } : null
        })
      }
    }

    callback({ success: true })
  })

  // 创建私聊
  socket.on('create_private_chat', ({ targetNickname }, callback) => {
    const uuid = socketToUser.get(socket.id)
    if (!uuid) return callback({ success: false, error: '未登录' })

    const targetUuid = nicknameToUuid.get(targetNickname)
    if (!targetUuid) return callback({ success: false, error: '该用户不在线' })

    if (targetUuid === uuid) return callback({ success: false, error: '不能和自己聊天' })

    const targetUser = users.get(targetUuid)
    if (!targetUser) return callback({ success: false, error: '该用户不在线' })

    if (targetUser.conversationId) return callback({ success: false, error: '对方正忙' })

    const currentUser = users.get(uuid)
    if (currentUser?.conversationId) return callback({ success: false, error: '你已在聊天中' })

    // 创建会话
    const conversationId = createConversation(uuid, targetUuid)

    // 双方加入 Socket.io 房间
    socket.join(conversationId)
    const targetSocket = io.sockets.sockets.get(targetUser.socketId)
    if (targetSocket) targetSocket.join(conversationId)

    // 通知被连接方
    io.to(targetUser.socketId).emit('conversation_created', {
      conversationId,
      target: { uuid, nickname: currentUser.nickname }
    })

    callback({
      success: true,
      conversationId,
      target: { uuid: targetUuid, nickname: targetUser.nickname }
    })
  })

  // 发送消息
  socket.on('send_message', ({ conversationId, content }) => {
    const uuid = socketToUser.get(socket.id)
    if (!uuid) return

    const user = users.get(uuid)
    if (!user || user.conversationId !== conversationId) return

    if (!content || content.trim().length === 0) return

    const message = {
      id: crypto.randomUUID(),
      senderUuid: uuid,
      senderNickname: user.nickname,
      content: content,
      timestamp: Date.now(),
      type: 'text'
    }

    // 广播给房间内所有人（包括发送者）
    io.to(conversationId).emit('new_message', { conversationId, message })

    // 检查对端是否离线（socket 断开但仍在宽限期内），触发 FCM 推送 + 离线缓存
    const conv = conversations.get(conversationId)
    if (conv) {
      const peerUuid = [...conv.members].find(id => id !== uuid)
      if (peerUuid) {
        const peer = users.get(peerUuid)
        if (peer) {
          const peerSocketExists = peer.socketId && socketToUser.has(peer.socketId)
          console.log(`[FCM] 消息推送决策: sender=${user.nickname} → peer=${peer.nickname}, socketExists=${peerSocketExists}, inBackground=${peer.inBackground}, hasToken=${!!peer.pushToken}, fcmEnabled=${isFcmEnabled()}`)

          if (!peerSocketExists) {
            // 对端 socket 已断开 → 缓存离线消息（上限 100 条）
            if (!offlineMessages.has(peerUuid)) {
              offlineMessages.set(peerUuid, [])
            }
            const queue = offlineMessages.get(peerUuid)
            if (queue.length < 100) {
              queue.push({ conversationId, message })
            }

            // 通过 FCM 推送通知
            if (isFcmEnabled() && peer.pushToken) {
              sendPushNotification(peer.pushToken, {
                senderNickname: user.nickname,
                content: content,
                conversationId
              }).then(result => {
                if (result === 'token_invalid') {
                  peer.pushToken = null
                }
              }).catch(e => console.warn('[FCM] 推送异常:', e.message))
            }
          } else if (peer.inBackground) {
            // 对端在线但 App 在后台 → WebView JS 可能被暂停，补发 FCM 推送
            // 不缓存离线消息，因为 socket 连接仍在，消息已通过房间广播送达
            if (isFcmEnabled() && peer.pushToken) {
              sendPushNotification(peer.pushToken, {
                senderNickname: user.nickname,
                content: content,
                conversationId
              }).then(result => {
                if (result === 'token_invalid') {
                  peer.pushToken = null
                }
              }).catch(e => console.warn('[FCM] 推送异常:', e.message))
            }
          }
        }
      }
    }
  })

  // 主动离开会话（不断开连接，不触发宽限期）
  socket.on('leave_conversation', ({ conversationId }, callback) => {
    const uuid = socketToUser.get(socket.id)
    if (!uuid) return callback?.({ success: false })

    const user = users.get(uuid)
    if (!user || user.conversationId !== conversationId) return callback?.({ success: false })

    const conv = conversations.get(conversationId)
    if (conv) {
      const peerUuid = [...conv.members].find(id => id !== uuid)
      if (peerUuid) {
        const peer = users.get(peerUuid)
        if (peer) {
          io.to(peer.socketId).emit('peer_offline', { conversationId })
          peer.conversationId = null
        }
      }
      conversations.delete(conversationId)
    }

    user.conversationId = null
    socket.leave(conversationId)
    callback?.({ success: true })
  })

  // 注册推送 token（Android FCM）
  socket.on('register_push_token', ({ token }) => {
    if (!token || typeof token !== 'string' || token.length > 500) {
      console.log(`[FCM] register_push_token 参数无效: token=${typeof token}, len=${token?.length}`)
      return
    }

    const uuid = socketToUser.get(socket.id)
    if (!uuid) {
      console.log(`[FCM] register_push_token 失败: socket ${socket.id} 未关联用户`)
      return
    }

    const user = users.get(uuid)
    if (user) {
      user.pushToken = token
      console.log(`[FCM] token 已注册: user=${user.nickname}, token=${token.slice(0, 20)}...`)
    }
  })

  // 客户端上报前后台状态（Android）
  socket.on('app_state', ({ inBackground }) => {
    const uuid = socketToUser.get(socket.id)
    if (!uuid) return
    const user = users.get(uuid)
    if (user) {
      user.inBackground = !!inBackground
      console.log(`[FCM] app_state: user=${user.nickname}, inBackground=${user.inBackground}, hasToken=${!!user.pushToken}`)
    }
  })

  // 断开连接：启动宽限期而非立即清理
  socket.on('disconnect', () => {
    const uuid = socketToUser.get(socket.id)
    if (!uuid) return

    const user = users.get(uuid)
    if (!user) return

    // 如果 socketId 不匹配（已被新连接取代），只清理旧映射
    if (user.socketId !== socket.id) {
      socketToUser.delete(socket.id)
      return
    }

    // 清理 socket 映射，但保留用户数据和会话
    socketToUser.delete(socket.id)
    console.log(`[FCM] 用户断开: user=${user.nickname}, hasToken=${!!user.pushToken}, hasConv=${!!user.conversationId}`)

    // 启动宽限期定时器
    disconnectTimes.set(uuid, Date.now())
    const timerId = setTimeout(() => {
      disconnectTimers.delete(uuid)
      disconnectTimes.delete(uuid)

      // 再次检查：如果用户已重连（socketId 已更新），不清理
      const currentUser = users.get(uuid)
      if (currentUser && currentUser.socketId && socketToUser.has(currentUser.socketId)) {
        return
      }

      // 宽限期到期，真正清理
      const deadUser = users.get(uuid)
      if (!deadUser) return

      const { nickname, conversationId: convId } = deadUser

      users.delete(uuid)
      nicknameToUuid.delete(nickname)
      offlineMessages.delete(uuid)

      // 通知对端并清理会话
      if (convId) {
        const conv = conversations.get(convId)
        if (conv) {
          const peerUuid = [...conv.members].find(id => id !== uuid)
          if (peerUuid) {
            const peer = users.get(peerUuid)
            if (peer) {
              io.to(peer.socketId).emit('peer_offline', { conversationId: convId })
              peer.conversationId = null
            }
          }
          conversations.delete(convId)
        }
      }
    }, GRACE_PERIOD_MS)

    disconnectTimers.set(uuid, timerId)
  })
}
