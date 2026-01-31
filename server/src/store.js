// 在线用户表: uuid → { socketId, nickname, conversationId }
export const users = new Map()

// 会话表: conversationId → { members: Set<uuid> }
export const conversations = new Map()

// Socket 映射: socketId → uuid
export const socketToUser = new Map()

// 昵称 → uuid 快速查找
export const nicknameToUuid = new Map()

// 断线宽限定时器: uuid → timerId
export const disconnectTimers = new Map()

// 断连时间记录: uuid → timestamp (断连时刻)
export const disconnectTimes = new Map()

// 离线消息缓存: uuid → message[]
export const offlineMessages = new Map()

/**
 * 注册用户
 * @returns {{ success: boolean, error?: string, oldSocketId?: string }}
 */
export function registerUser(uuid, nickname, socketId, platform) {
  // 检查昵称是否被其他 UUID 占用
  const existingUuid = nicknameToUuid.get(nickname)
  if (existingUuid && existingUuid !== uuid) {
    return { success: false, error: '昵称已被使用' }
  }

  // 重连时取消宽限定时器
  const pendingTimer = disconnectTimers.get(uuid)
  if (pendingTimer) {
    clearTimeout(pendingTimer)
    disconnectTimers.delete(uuid)
  }
  disconnectTimes.delete(uuid)

  // 如果该 UUID 已在线（重连或多开），踢掉旧连接
  const existingUser = users.get(uuid)
  const oldSocketId = existingUser?.socketId

  users.set(uuid, {
    socketId, nickname,
    conversationId: existingUser?.conversationId || null,
    pushToken: existingUser?.pushToken || null,
    loginTime: existingUser?.loginTime || Date.now(),
    platform,
  })
  // 仅当 socketId 非空时写入映射（WS 连接不需要此映射）
  if (socketId) {
    socketToUser.set(socketId, uuid)
  }
  nicknameToUuid.set(nickname, uuid)

  return { success: true, oldSocketId }
}

/**
 * 移除用户（断线/登出）
 * @returns {{ uuid, nickname, conversationId } | null}
 */
export function removeUser(socketId) {
  const uuid = socketToUser.get(socketId)
  if (!uuid) return null

  const user = users.get(uuid)
  if (!user) return null

  // 只有当前 socketId 匹配时才移除（避免踢掉重连后的新连接）
  if (user.socketId !== socketId) {
    socketToUser.delete(socketId)
    return null
  }

  const { nickname, conversationId } = user

  socketToUser.delete(socketId)
  users.delete(uuid)
  nicknameToUuid.delete(nickname)

  // 清理相关会话中该用户的成员记录
  if (conversationId) {
    const conv = conversations.get(conversationId)
    if (conv) {
      conv.members.delete(uuid)
      if (conv.members.size === 0) {
        conversations.delete(conversationId)
      }
    }
  }

  return { uuid, nickname, conversationId }
}

/**
 * 创建私聊会话
 */
export function createConversation(uuid1, uuid2) {
  const id = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  conversations.set(id, { members: new Set([uuid1, uuid2]) })

  const user1 = users.get(uuid1)
  const user2 = users.get(uuid2)
  if (user1) user1.conversationId = id
  if (user2) user2.conversationId = id

  return id
}

/**
 * 获取所有在线用户昵称
 */
export function getOnlineNicknames() {
  return Array.from(users.values()).map(u => u.nickname)
}

/**
 * 获取所有在线用户详情（管理页面用）
 */
export function getOnlineUsers() {
  const GRACE_PERIOD_MS = 30 * 60 * 1000
  const now = Date.now()
  return Array.from(users.entries()).map(([uuid, u]) => {
    let peerNickname = null
    let status = 'idle'
    let graceRemaining = null

    if (disconnectTimers.has(uuid) && (!u.socketId || !socketToUser.has(u.socketId))) {
      status = 'disconnected'
      const disconnectTime = disconnectTimes.get(uuid)
      if (disconnectTime) {
        graceRemaining = Math.max(0, GRACE_PERIOD_MS - (now - disconnectTime))
      }
    } else if (u.conversationId) {
      status = 'chatting'
      const conv = conversations.get(u.conversationId)
      if (conv) {
        const peerUuid = [...conv.members].find(id => id !== uuid)
        const peer = peerUuid ? users.get(peerUuid) : null
        peerNickname = peer?.nickname || null
      }
    }

    return {
      uuid,
      nickname: u.nickname,
      loginTime: u.loginTime,
      platform: u.platform,
      status,
      peerNickname,
      graceRemaining,
    }
  })
}

/**
 * 踢出用户（管理页面用），返回被踢用户信息
 */
export function kickUser(uuid) {
  const user = users.get(uuid)
  if (!user) return null
  return { socketId: user.socketId, nickname: user.nickname }
}
