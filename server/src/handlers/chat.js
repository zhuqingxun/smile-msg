import { users, socketToUser } from '../store.js'
import { sendToUser } from '../bridge.js'
import {
  handleLogin, handleCreatePrivateChat, handleSendMessage,
  handleLeaveConversation, handleRegisterPushToken,
  handleAppState, handleDisconnect
} from './chatLogic.js'

function parsePlatform(ua) {
  if (ua.includes('Electron')) return 'desktop'
  if (ua.includes('HarmonyOS')) return 'harmony'
  if (ua.includes('Android')) return 'android'
  return 'web'
}

export function setupChatHandlers(io, socket) {

  socket.on('login', ({ uuid, nickname }, callback) => {
    const ua = socket.handshake.headers['user-agent'] || ''
    const platform = parsePlatform(ua)
    const result = handleLogin(uuid, nickname, socket.id, platform)

    if (!result.success) return callback({ success: false, error: result.error })

    // Socket.io 特有：踢掉旧连接
    if (result.oldSocketId && result.oldSocketId !== socket.id) {
      io.to(result.oldSocketId).emit('force_disconnect', { reason: '账号在其他地方登录' })
      const oldSocket = io.sockets.sockets.get(result.oldSocketId)
      if (oldSocket) oldSocket.disconnect(true)
    }

    // Socket.io 特有：延迟补发离线消息
    if (result.offlineMessages) {
      setTimeout(() => {
        for (const msg of result.offlineMessages) {
          socket.emit('new_message', msg)
        }
      }, 500)
    }

    // Socket.io 特有：加入房间（保留 room 机制作为冗余）
    if (result.restored && result.conversationId) {
      socket.join(result.conversationId)
      return callback({
        success: true, restored: true,
        conversationId: result.conversationId,
        target: result.target
      })
    }

    callback({ success: true })
  })

  socket.on('create_private_chat', ({ targetNickname }, callback) => {
    const uuid = socketToUser.get(socket.id)
    const result = handleCreatePrivateChat(uuid, targetNickname)

    if (!result.success) return callback({ success: false, error: result.error })

    // Socket.io 特有：双方加入房间
    socket.join(result.conversationId)
    const targetUser = users.get(result.targetUuid)
    if (targetUser?.socketId) {
      const targetSocket = io.sockets.sockets.get(targetUser.socketId)
      if (targetSocket) targetSocket.join(result.conversationId)
    }

    // 通知被连接方（通过桥接层，Socket.io 和 WS 用户都能收到）
    sendToUser(result.targetUuid, 'conversation_created', {
      conversationId: result.conversationId,
      target: { uuid, nickname: result.initiatorNickname }
    }, io)

    callback({
      success: true,
      conversationId: result.conversationId,
      target: result.target
    })
  })

  socket.on('send_message', ({ conversationId, content }) => {
    const uuid = socketToUser.get(socket.id)
    handleSendMessage(uuid, conversationId, content, io)
  })

  socket.on('leave_conversation', ({ conversationId }, callback) => {
    const uuid = socketToUser.get(socket.id)
    const result = handleLeaveConversation(uuid, conversationId, io)
    socket.leave(conversationId)  // Socket.io 特有：离开房间
    callback?.({ success: result.success })
  })

  socket.on('register_push_token', ({ token }) => {
    const uuid = socketToUser.get(socket.id)
    handleRegisterPushToken(uuid, token)
  })

  socket.on('app_state', ({ inBackground }) => {
    const uuid = socketToUser.get(socket.id)
    handleAppState(uuid, inBackground)
  })

  socket.on('client_log', ({ tag, message }) => {
    const uuid = socketToUser.get(socket.id)
    const user = uuid ? users.get(uuid) : null
    console.log(`[${tag || 'CLIENT'}] (${user?.nickname || 'unknown'}): ${message}`)
  })

  socket.on('disconnect', () => {
    const uuid = socketToUser.get(socket.id)
    if (!uuid) return

    const user = users.get(uuid)
    if (!user) return

    // socketId 不匹配（已被新连接取代），只清理旧映射
    if (user.socketId !== socket.id) {
      socketToUser.delete(socket.id)
      return
    }

    socketToUser.delete(socket.id)
    handleDisconnect(uuid, io)
  })
}
