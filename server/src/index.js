import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { existsSync } from 'fs'
import { WebSocketServer } from 'ws'
import { setupChatHandlers } from './handlers/chat.js'
import { cleanupConversation } from './handlers/chatLogic.js'
import { handleWsConnection } from './handlers/ws.js'
import { closeWsConnection } from './bridge.js'
import { getOnlineUsers, kickUser, removeUser, disconnectTimers, disconnectTimes, users, nicknameToUuid, offlineMessages } from './store.js'
import { initPush } from './push.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()
const httpServer = createServer(app)

const io = new Server(httpServer, {
  cors: {
    origin: process.env.NODE_ENV === 'production' ? false : '*',
    methods: ['GET', 'POST']
  },
  pingInterval: 10000,
  pingTimeout: 15000
})

// HTML 转义函数（防 XSS）
function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// 托管 Web 客户端静态文件（生产环境）
const webDistPath = join(__dirname, '../../web/dist')
if (existsSync(webDistPath)) {
  app.use(express.static(webDistPath))
}

// 格式化持续时长
function formatDuration(ms) {
  if (ms < 0) ms = 0
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}小时${minutes}分`
  if (minutes > 0) return `${minutes}分${seconds}秒`
  return `${seconds}秒`
}

// 终端类型中文映射
function platformLabel(platform) {
  const map = { desktop: 'Desktop', android: 'Android', web: 'Web', harmony: 'HarmonyOS' }
  return map[platform] || platform || 'Unknown'
}

// 管理页面
app.get('/admin', (req, res) => {
  const onlineUsers = getOnlineUsers()
  const now = Date.now()
  const rows = onlineUsers.map(u => {
    const loginTimeStr = new Date(u.loginTime).toLocaleTimeString('zh-CN', { hour12: false })
    const duration = formatDuration(now - u.loginTime)

    let statusHtml = ''
    if (u.status === 'idle') {
      statusHtml = '<span style="color:#16a34a">空闲</span>'
    } else if (u.status === 'chatting') {
      const peer = u.peerNickname ? ` (与 ${escapeHtml(u.peerNickname)})` : ''
      statusHtml = `<span style="color:#2563eb">聊天中${peer}</span>`
    } else if (u.status === 'disconnected') {
      const remaining = u.graceRemaining != null ? ` (剩余 ${formatDuration(u.graceRemaining)})` : ''
      statusHtml = `<span style="color:#ea580c">断连${remaining}</span>`
    }

    return `<tr>
      <td>${escapeHtml(u.nickname)}</td>
      <td>${platformLabel(u.platform)}</td>
      <td>${loginTimeStr}</td>
      <td>${duration}</td>
      <td>${statusHtml}</td>
      <td>
        <form method="POST" action="/admin/kick" style="margin:0">
          <input type="hidden" name="uuid" value="${escapeHtml(u.uuid)}">
          <button type="submit" style="background:#dc2626;color:#fff;border:none;padding:4px 12px;border-radius:4px;cursor:pointer;font-size:13px">踢出</button>
        </form>
      </td>
    </tr>`
  }).join('')

  res.send(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SmileMsg Admin</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 900px; margin: 40px auto; padding: 0 20px; }
    h1 { color: #333; }
    .count { color: #666; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #e5e7eb; }
    th { background: #f9fafb; color: #374151; font-weight: 600; font-size: 14px; }
    td { font-size: 14px; }
    tr:hover { background: #f3f4f6; }
    .empty { color: #999; font-style: italic; }
    small { color: #9ca3af; }
  </style>
</head>
<body>
  <h1>SmileMsg 管理面板</h1>
  <p class="count">在线用户：${onlineUsers.length} 人</p>
  ${onlineUsers.length > 0
    ? `<table>
        <thead><tr><th>昵称</th><th>终端</th><th>登录时间</th><th>持续时长</th><th>状态</th><th>操作</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`
    : '<p class="empty">暂无在线用户</p>'}
  <p><small>刷新页面获取最新数据</small></p>
</body>
</html>`)
})

// 踢出用户 API
app.post('/admin/kick', express.urlencoded({ extended: false }), (req, res) => {
  const { uuid } = req.body
  if (!uuid) return res.redirect('/admin')

  const target = kickUser(uuid)
  if (target) {
    if (target.socketId) {
      // Socket.io 用户：通知并断开
      io.to(target.socketId).emit('force_disconnect', { reason: '被管理员踢出' })
      const sock = io.sockets.sockets.get(target.socketId)
      if (sock) sock.disconnect(true)
      removeUser(target.socketId)
    } else {
      closeWsConnection(uuid, '被管理员踢出')
    }
  }

  // 无论有无 socket，都清理用户数据（处理断连宽限期中的用户）
  const user = users.get(uuid)
  if (user) {
    const timer = disconnectTimers.get(uuid)
    if (timer) {
      clearTimeout(timer)
      disconnectTimers.delete(uuid)
    }
    disconnectTimes.delete(uuid)

    if (user.conversationId) {
      cleanupConversation(uuid, user.conversationId, io)
    }

    users.delete(uuid)
    nicknameToUuid.delete(user.nickname)
    offlineMessages.delete(uuid)
  }

  res.redirect('/admin')
})

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok' })
})

// SPA fallback：非 API 路由返回 index.html（仅当 web/dist 存在时）
const indexHtmlPath = join(webDistPath, 'index.html')
if (existsSync(indexHtmlPath)) {
  app.get('*', (req, res) => {
    res.sendFile(indexHtmlPath)
  })
}

// Socket.io 连接处理
io.on('connection', (socket) => {
  setupChatHandlers(io, socket)
})

// 原生 WebSocket 端点（鸿蒙客户端用）
const wss = new WebSocketServer({ server: httpServer, path: '/ws' })
wss.on('connection', (ws, req) => {
  handleWsConnection(ws, req, io)
})

// 初始化推送通道（FCM + Push Kit，无配置时对应通道禁用）
initPush()

const PORT = process.env.PORT || 3000
httpServer.listen(PORT, () => {
  console.log(`SmileMsg server running on port ${PORT}`)
})
