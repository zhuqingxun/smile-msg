import { users, socketToUser } from '../store.js'
import { wsConnections, registerWsConnection, removeWsConnection, sendToUser } from '../bridge.js'
import {
  handleLogin as loginLogic,
  handleCreatePrivateChat as createChatLogic,
  handleSendMessage as sendMsgLogic,
  handleLeaveConversation as leaveLogic,
  handleRegisterPushToken as registerTokenLogic,
  handleAppState as appStateLogic,
  handleDisconnect as disconnectLogic
} from './chatLogic.js'

function parsePlatform(req) {
  const url = new URL(req.url, `http://${req.headers.host}`)
  return url.searchParams.get('platform') || 'harmony'
}

/**
 * 处理新的 WebSocket 连接
 */
export function handleWsConnection(ws, req, io) {
  let userUuid = null
  const platform = parsePlatform(req)

  // 心跳：服务端定期 ping，客户端回 pong；连续 2 次未收到 pong 则判定假死并关闭
  let missedPongs = 0
  const heartbeatInterval = setInterval(() => {
    if (ws.readyState === 1) {
      if (missedPongs >= 2) {
        console.log(`[ws] 心跳超时，关闭连接: uuid=${userUuid}`)
        ws.close()
        return
      }
      missedPongs++
      ws.send(JSON.stringify({ type: 'ping' }))
    }
  }, 10000)

  ws.on('message', (raw) => {
    let msg
    try {
      msg = JSON.parse(raw.toString())
    } catch {
      return
    }

    if (msg.type === 'pong') {
      missedPongs = 0
      return
    }

    if (msg.type !== 'event') return

    const { event, data, ackId } = msg

    const ack = (response) => {
      if (ackId != null && ws.readyState === 1) {
        ws.send(JSON.stringify({ type: 'ack', ackId, data: response }))
      }
    }

    // login 之前的其他事件忽略
    if (!userUuid && event !== 'login') return

    switch (event) {
      case 'login': {
        const result = loginLogic(data.uuid, data.nickname, null, platform)
        if (!result.success) {
          ack({ success: false, error: result.error })
          break
        }

        userUuid = data.uuid

        // 踢掉旧 WS 连接（如果有）
        const oldWs = wsConnections.get(userUuid)
        if (oldWs && oldWs !== ws && oldWs.readyState === 1) {
          oldWs.send(JSON.stringify({ type: 'event', event: 'force_disconnect', data: { reason: '账号在其他地方登录' } }))
          oldWs.close()
        }

        // 注册新 WS 连接到桥接层（覆盖旧映射）
        registerWsConnection(userUuid, ws)

        // 踢掉旧 Socket.io 连接
        if (result.oldSocketId) {
          if (socketToUser.has(result.oldSocketId)) {
            io.to(result.oldSocketId).emit('force_disconnect', { reason: '账号在其他地方登录' })
            const oldSocket = io.sockets.sockets.get(result.oldSocketId)
            if (oldSocket) oldSocket.disconnect(true)
          }
        }

        // 补发离线消息
        if (result.offlineMessages) {
          setTimeout(() => {
            for (const msg of result.offlineMessages) {
              if (ws.readyState === 1) {
                ws.send(JSON.stringify({ type: 'event', event: 'new_message', data: msg }))
              }
            }
          }, 500)
        }

        if (result.restored) {
          ack({
            success: true, restored: true,
            conversationId: result.conversationId,
            target: result.target
          })
        } else {
          ack({ success: true })
        }
        break
      }

      case 'create_private_chat': {
        const result = createChatLogic(userUuid, data.targetNickname)
        if (!result.success) {
          ack({ success: false, error: result.error })
          break
        }

        // 通知被连接方（通过桥接层，Socket.io 和 WS 用户都能收到）
        sendToUser(result.targetUuid, 'conversation_created', {
          conversationId: result.conversationId,
          target: { uuid: userUuid, nickname: result.initiatorNickname }
        }, io)

        // 如果被连接方是 Socket.io 用户，让其加入房间（冗余保护）
        const targetUser = users.get(result.targetUuid)
        if (targetUser?.socketId) {
          const targetSocket = io.sockets.sockets.get(targetUser.socketId)
          if (targetSocket) targetSocket.join(result.conversationId)
        }

        ack({
          success: true,
          conversationId: result.conversationId,
          target: result.target
        })
        break
      }

      case 'send_message': {
        sendMsgLogic(userUuid, data.conversationId, data.content, io)
        break
      }

      case 'leave_conversation': {
        const result = leaveLogic(userUuid, data.conversationId, io)
        ack({ success: result.success })
        break
      }

      case 'register_push_token': {
        registerTokenLogic(userUuid, data.token)
        break
      }

      case 'app_state': {
        appStateLogic(userUuid, data.inBackground)
        break
      }
    }
  })

  ws.on('close', () => {
    clearInterval(heartbeatInterval)
    if (userUuid) {
      // 身份守卫：仅当 wsConnections 中仍是本连接时才执行清理
      // 已被新连接替换的旧 WS 不应触发 disconnectLogic
      if (wsConnections.get(userUuid) === ws) {
        removeWsConnection(userUuid)
        disconnectLogic(userUuid, io)
      }
    }
  })

  // error 事件后 ws 会自动触发 close 事件，用户清理由 close handler 完成
  ws.on('error', () => {
    clearInterval(heartbeatInterval)
  })
}
