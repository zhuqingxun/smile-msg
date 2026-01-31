import { users, socketToUser, conversations } from './store.js'

// WS 连接注册表: uuid → WebSocket 实例
export const wsConnections = new Map()

// 注册 WS 连接
export function registerWsConnection(uuid, ws) {
  wsConnections.set(uuid, ws)
}

// 移除 WS 连接
export function removeWsConnection(uuid) {
  wsConnections.delete(uuid)
}

/**
 * 向指定用户发送事件（自动路由到 Socket.io 或 WebSocket）
 * 路由优先级：先 Socket.io（socketId 非空且在映射中），后 WebSocket
 * WS 用户在 store 中 socketId 为 null，因此 Socket.io 分支不会命中
 */
export function sendToUser(uuid, event, data, io) {
  const user = users.get(uuid)
  if (!user) return false

  // 尝试 Socket.io 通道（WS 用户 socketId 为 null，此分支自动跳过）
  if (user.socketId && socketToUser.has(user.socketId)) {
    io.to(user.socketId).emit(event, data)
    return true
  }

  // 尝试 WebSocket 通道
  const ws = wsConnections.get(uuid)
  if (ws && ws.readyState === 1) { // WebSocket.OPEN = 1
    ws.send(JSON.stringify({ type: 'event', event, data }))
    return true
  }

  return false
}

/**
 * 向会话内所有成员广播事件
 */
export function broadcastToConversation(conversationId, event, data, io) {
  const conv = conversations.get(conversationId)
  if (!conv) return
  for (const memberUuid of conv.members) {
    sendToUser(memberUuid, event, data, io)
  }
}

/**
 * 检查用户是否有活跃连接（Socket.io 或 WS）
 */
export function hasActiveConnection(uuid) {
  const user = users.get(uuid)
  if (!user) return false
  // Socket.io 连接
  if (user.socketId && socketToUser.has(user.socketId)) return true
  // WebSocket 连接
  const ws = wsConnections.get(uuid)
  return ws != null && ws.readyState === 1
}

/**
 * 断开指定用户的 WS 连接（管理页面踢出用）
 * 先移除映射再关闭连接，防止 close 回调触发 disconnectLogic
 */
export function closeWsConnection(uuid, reason) {
  const ws = wsConnections.get(uuid)
  wsConnections.delete(uuid)
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify({ type: 'event', event: 'force_disconnect', data: { reason } }))
    ws.close()
  }
}
