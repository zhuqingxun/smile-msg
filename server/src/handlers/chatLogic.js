import {
  registerUser, createConversation,
  users, socketToUser, nicknameToUuid, conversations,
  disconnectTimers, disconnectTimes, offlineMessages
} from '../store.js'
import { sendToUser, broadcastToConversation, hasActiveConnection } from '../bridge.js'
import { sendPush, isPushEnabled } from '../push.js'

export const GRACE_PERIOD_MS = 30 * 60 * 1000

/**
 * 清理会话并通知对端（多处共用）
 */
export function cleanupConversation(uuid, convId, io) {
  const conv = conversations.get(convId)
  if (!conv) return
  const peerUuid = [...conv.members].find(id => id !== uuid)
  if (peerUuid) {
    const peer = users.get(peerUuid)
    if (peer) {
      sendToUser(peerUuid, 'peer_offline', { conversationId: convId }, io)
      peer.conversationId = null
    }
  }
  conversations.delete(convId)
}

// 尝试向指定用户发送推送通知
function trySendPush(peer, payload) {
  if (isPushEnabled(peer.platform) && peer.pushToken) {
    sendPush(peer.pushToken, peer.platform, payload).then(result => {
      if (result === 'token_invalid') peer.pushToken = null
    }).catch(e => console.warn('[push] 推送异常:', e.message))
  }
}

/**
 * 处理登录
 * @param {string} uuid
 * @param {string} nickname
 * @param {string|null} connectionId - Socket.io 的 socket.id 或 WS 的 null
 * @param {string} platform
 * @returns {{ success, error?, oldSocketId?, restored?, conversationId?, target?, offlineMessages? }}
 */
export function handleLogin(uuid, nickname, connectionId, platform) {
  const trimmedNickname = nickname?.trim()
  if (!uuid || !trimmedNickname || trimmedNickname.length > 20) {
    return { success: false, error: '昵称无效' }
  }
  console.log(`[login] 用户登录: nickname=${trimmedNickname}, platform=${platform}, connId=${connectionId || 'ws'}`)

  const result = registerUser(uuid, trimmedNickname, connectionId, platform)
  if (!result.success) {
    return { success: false, error: result.error }
  }

  // 收集离线消息（由调用方决定如何发送）
  const pending = offlineMessages.get(uuid)
  const pendingList = (pending && pending.length > 0) ? [...pending] : null
  if (pendingList) offlineMessages.delete(uuid)

  // 检查会话恢复
  const user = users.get(uuid)
  if (user?.conversationId) {
    const conv = conversations.get(user.conversationId)
    if (conv) {
      const peerUuid = [...conv.members].find(id => id !== uuid)
      const peer = peerUuid ? users.get(peerUuid) : null
      return {
        success: true, restored: true,
        conversationId: user.conversationId,
        target: peer ? { uuid: peerUuid, nickname: peer.nickname } : null,
        oldSocketId: result.oldSocketId,
        offlineMessages: pendingList
      }
    }
  }

  return { success: true, oldSocketId: result.oldSocketId, offlineMessages: pendingList }
}

/**
 * 处理创建私聊
 * @param {string} uuid - 发起方 UUID
 * @param {string} targetNickname
 * @returns {{ success, error?, conversationId?, target?, targetUuid?, initiatorNickname? }}
 */
export function handleCreatePrivateChat(uuid, targetNickname) {
  if (!uuid) return { success: false, error: '未登录' }

  const targetUuid = nicknameToUuid.get(targetNickname)
  if (!targetUuid) return { success: false, error: '该用户不在线' }
  if (targetUuid === uuid) return { success: false, error: '不能和自己聊天' }

  const targetUser = users.get(targetUuid)
  if (!targetUser) return { success: false, error: '该用户不在线' }
  if (targetUser.conversationId) return { success: false, error: '对方正忙' }

  const currentUser = users.get(uuid)
  if (currentUser?.conversationId) return { success: false, error: '你已在聊天中' }

  const conversationId = createConversation(uuid, targetUuid)

  return {
    success: true,
    conversationId,
    target: { uuid: targetUuid, nickname: targetUser.nickname },
    targetUuid,
    initiatorNickname: currentUser.nickname
  }
}

/**
 * 处理发送消息，返回构造好的消息对象和推送决策信息
 * @param {string} uuid - 发送方 UUID
 * @param {string} convId - 会话 ID
 * @param {string} content - 消息内容
 * @param {Server} io - Socket.io 实例
 * @returns {{ ok: boolean, message? }}
 */
export function handleSendMessage(uuid, convId, content, io) {
  if (!uuid) return { ok: false }
  const user = users.get(uuid)
  if (!user || user.conversationId !== convId) return { ok: false }
  if (!content || content.trim().length === 0) return { ok: false }

  const message = {
    id: crypto.randomUUID(),
    senderUuid: uuid,
    senderNickname: user.nickname,
    content,
    timestamp: Date.now(),
    type: 'text'
  }

  // 通过桥接层广播给会话成员
  broadcastToConversation(convId, 'new_message', { conversationId: convId, message }, io)

  // 推送决策：找到对端，判断是否需要推送
  const conv = conversations.get(convId)
  if (conv) {
    const peerUuid = [...conv.members].find(id => id !== uuid)
    const peer = peerUuid ? users.get(peerUuid) : null
    if (peer) {
      const peerOnline = hasActiveConnection(peerUuid)

      if (!peerOnline) {
        // 对端离线 → 缓存离线消息
        if (!offlineMessages.has(peerUuid)) offlineMessages.set(peerUuid, [])
        const queue = offlineMessages.get(peerUuid)
        if (queue.length < 100) queue.push({ conversationId: convId, message })
      }

      // 离线或后台均尝试推送通知
      if (!peerOnline || peer.inBackground) {
        trySendPush(peer, { senderNickname: user.nickname, content, conversationId: convId })
      }
    }
  }

  return { ok: true, message }
}

/**
 * 处理离开会话
 * @param {string} uuid
 * @param {string} convId
 * @param {Server} io
 * @returns {{ success: boolean }}
 */
export function handleLeaveConversation(uuid, convId, io) {
  if (!uuid) return { success: false }
  const user = users.get(uuid)
  if (!user || user.conversationId !== convId) return { success: false }

  cleanupConversation(uuid, convId, io)
  user.conversationId = null
  return { success: true }
}

/**
 * 处理注册推送 token
 */
export function handleRegisterPushToken(uuid, token) {
  if (!token || typeof token !== 'string' || token.length > 500) return
  if (!uuid) return
  const user = users.get(uuid)
  if (user) {
    user.pushToken = token
    console.log(`[push] token 已注册: user=${user.nickname}, token=${token.slice(0, 20)}...`)
  }
}

/**
 * 处理前后台状态上报
 */
export function handleAppState(uuid, inBackground) {
  if (!uuid) return
  const user = users.get(uuid)
  if (user) {
    user.inBackground = !!inBackground
    console.log(`[lifecycle] app_state: user=${user.nickname}, inBackground=${user.inBackground}`)
  }
}

/**
 * 处理断连（启动宽限期）
 * @param {string} uuid
 * @param {Server} io
 */
export function handleDisconnect(uuid, io) {
  const user = users.get(uuid)
  if (!user) return

  console.log(`[disconnect] 用户断开: user=${user.nickname}`)

  // 清除已有的宽限期定时器，防止同一用户多次断连产生重复定时器
  const existingTimer = disconnectTimers.get(uuid)
  if (existingTimer) {
    clearTimeout(existingTimer)
    disconnectTimers.delete(uuid)
  }

  disconnectTimes.set(uuid, Date.now())
  const timerId = setTimeout(() => {
    disconnectTimers.delete(uuid)
    disconnectTimes.delete(uuid)

    // 如果用户已重连，不清理
    if (hasActiveConnection(uuid)) return

    const deadUser = users.get(uuid)
    if (!deadUser) return

    users.delete(uuid)
    nicknameToUuid.delete(deadUser.nickname)
    offlineMessages.delete(uuid)

    if (deadUser.conversationId) {
      cleanupConversation(uuid, deadUser.conversationId, io)
    }
  }, GRACE_PERIOD_MS)

  disconnectTimers.set(uuid, timerId)
}
