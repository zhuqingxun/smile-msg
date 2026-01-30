import {
  registerUser, removeUser, createConversation,
  users, socketToUser, nicknameToUuid, conversations,
  disconnectTimers
} from '../store.js'

const GRACE_PERIOD_MS = 30 * 60 * 1000 // 30 分钟

export function setupChatHandlers(io, socket) {

  // 登录
  socket.on('login', ({ uuid, nickname }, callback) => {
    if (!uuid || !nickname || nickname.trim().length === 0 || nickname.length > 20) {
      return callback({ success: false, error: '昵称无效' })
    }

    const result = registerUser(uuid, nickname.trim(), socket.id)

    if (!result.success) {
      return callback({ success: false, error: result.error })
    }

    // 踢掉旧连接
    if (result.oldSocketId && result.oldSocketId !== socket.id) {
      io.to(result.oldSocketId).emit('force_disconnect', { reason: '账号在其他地方登录' })
      const oldSocket = io.sockets.sockets.get(result.oldSocketId)
      if (oldSocket) oldSocket.disconnect(true)
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
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      senderUuid: uuid,
      senderNickname: user.nickname,
      content: content,
      timestamp: Date.now(),
      type: 'text'
    }

    // 广播给房间内所有人（包括发送者）
    io.to(conversationId).emit('new_message', { conversationId, message })
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

    // 启动宽限期定时器
    const timerId = setTimeout(() => {
      disconnectTimers.delete(uuid)

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
