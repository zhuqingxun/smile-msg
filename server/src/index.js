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
import { getOnlineUsers, kickUser, removeUser, disconnectTimers, disconnectTimes, users, nicknameToUuid, offlineMessages, runtimeConfig } from './store.js'
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
  console.log(`[server] Web静态资源已挂载: path=${webDistPath}`)
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
    .config-section { margin-top: 32px; padding: 20px; background: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb; }
    .config-section h2 { margin: 0 0 16px; font-size: 18px; color: #333; }
    .config-row { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
    .config-row label { font-size: 14px; color: #374151; min-width: 160px; }
    .config-row select { padding: 6px 12px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 14px; }
    .config-row .desc { font-size: 12px; color: #9ca3af; }
    .save-btn { background: #2563eb; color: #fff; border: none; padding: 6px 20px; border-radius: 4px; cursor: pointer; font-size: 14px; }
    .save-btn:hover { background: #1d4ed8; }
    .toast { display: none; position: fixed; top: 20px; right: 20px; background: #16a34a; color: #fff; padding: 10px 20px; border-radius: 6px; font-size: 14px; z-index: 100; }
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
  <div class="config-section">
    <h2>推送配置</h2>
    <div class="config-row">
      <label>华为推送通知级别</label>
      <select id="cfg_huaweiImportance">
        <option value="LOW"${runtimeConfig.huaweiImportance === 'LOW' ? ' selected' : ''}>LOW — 静默，仅通知栏</option>
        <option value="NORMAL"${runtimeConfig.huaweiImportance === 'NORMAL' ? ' selected' : ''}>NORMAL — 铃声+振动</option>
        <option value="HIGH"${runtimeConfig.huaweiImportance === 'HIGH' ? ' selected' : ''}>HIGH — 横幅弹出通知</option>
      </select>
    </div>
    <div class="config-row">
      <label>FCM 推送优先级</label>
      <select id="cfg_fcmPriority">
        <option value="high"${runtimeConfig.fcmPriority === 'high' ? ' selected' : ''}>high — 立即投递</option>
        <option value="normal"${runtimeConfig.fcmPriority === 'normal' ? ' selected' : ''}>normal — 延迟投递</option>
      </select>
    </div>
  </div>
  <div class="config-section">
    <h2>连接配置</h2>
    <div class="config-row">
      <label>断线宽限期（分钟）</label>
      <input type="number" id="cfg_gracePeriodMin" value="${Math.round(runtimeConfig.gracePeriodMs / 60000)}" min="1" max="180" style="width:80px;padding:6px;border:1px solid #d1d5db;border-radius:4px;font-size:14px">
    </div>
    <div class="config-row">
      <label>WS 心跳间隔（秒）</label>
      <input type="number" id="cfg_heartbeatSec" value="${Math.round(runtimeConfig.heartbeatIntervalMs / 1000)}" min="5" max="60" style="width:80px;padding:6px;border:1px solid #d1d5db;border-radius:4px;font-size:14px">
      <span class="desc">仅对新连接生效</span>
    </div>
    <div class="config-row">
      <label>心跳最大丢失次数</label>
      <input type="number" id="cfg_heartbeatMaxMissed" value="${runtimeConfig.heartbeatMaxMissed}" min="1" max="10" style="width:80px;padding:6px;border:1px solid #d1d5db;border-radius:4px;font-size:14px">
    </div>
    <div class="config-row">
      <label>离线消息补发延迟（ms）</label>
      <input type="number" id="cfg_offlineMsgDelayMs" value="${runtimeConfig.offlineMsgDelayMs}" min="0" max="5000" style="width:80px;padding:6px;border:1px solid #d1d5db;border-radius:4px;font-size:14px">
    </div>
  </div>
  <div class="config-section">
    <h2>业务限制</h2>
    <div class="config-row">
      <label>最大昵称长度</label>
      <input type="number" id="cfg_maxNicknameLength" value="${runtimeConfig.maxNicknameLength}" min="3" max="50" style="width:80px;padding:6px;border:1px solid #d1d5db;border-radius:4px;font-size:14px">
    </div>
    <div class="config-row">
      <label>最大离线消息缓存数</label>
      <input type="number" id="cfg_maxOfflineMessages" value="${runtimeConfig.maxOfflineMessages}" min="10" max="500" style="width:80px;padding:6px;border:1px solid #d1d5db;border-radius:4px;font-size:14px">
    </div>
    <div class="config-row">
      <label>客户端最大消息数</label>
      <input type="number" id="cfg_maxClientMessages" value="${runtimeConfig.maxClientMessages}" min="50" max="1000" style="width:80px;padding:6px;border:1px solid #d1d5db;border-radius:4px;font-size:14px">
      <span class="desc">客户端重新登录后生效</span>
    </div>
  </div>
  <div style="margin-top:16px">
    <button id="saveAllBtn" class="save-btn">保存全部配置</button>
    <span class="desc" style="margin-left:12px">修改即时生效（心跳间隔仅对新连接生效），服务重启后恢复默认值</span>
  </div>
  <div class="toast" id="toast">保存成功</div>
  <p><small>刷新页面获取最新数据</small></p>
  <script>
    document.getElementById('saveAllBtn').addEventListener('click', async () => {
      const body = {
        huaweiImportance: document.getElementById('cfg_huaweiImportance').value,
        fcmPriority: document.getElementById('cfg_fcmPriority').value,
        gracePeriodMin: Number(document.getElementById('cfg_gracePeriodMin').value),
        heartbeatSec: Number(document.getElementById('cfg_heartbeatSec').value),
        heartbeatMaxMissed: Number(document.getElementById('cfg_heartbeatMaxMissed').value),
        offlineMsgDelayMs: Number(document.getElementById('cfg_offlineMsgDelayMs').value),
        maxNicknameLength: Number(document.getElementById('cfg_maxNicknameLength').value),
        maxOfflineMessages: Number(document.getElementById('cfg_maxOfflineMessages').value),
        maxClientMessages: Number(document.getElementById('cfg_maxClientMessages').value),
      }
      const res = await fetch('/admin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      const result = await res.json()
      const toast = document.getElementById('toast')
      if (res.ok && result.ok) {
        toast.textContent = '保存成功'
        toast.style.background = '#16a34a'
      } else {
        toast.textContent = result.error || '保存失败'
        toast.style.background = '#dc2626'
      }
      toast.style.display = 'block'
      setTimeout(() => toast.style.display = 'none', 2000)
    })
  </script>
</body>
</html>`)
})

// 踢出用户 API
app.post('/admin/kick', express.urlencoded({ extended: false }), (req, res) => {
  const { uuid } = req.body
  if (!uuid) return res.redirect('/admin')

  const target = kickUser(uuid)
  if (target) {
    const connType = target.socketId ? 'Socket.io' : 'WebSocket'
    console.log(`[admin] 踢出用户: uuid=${uuid.slice(0, 8)}, nickname=${target.nickname}, 连接类型=${connType}`)
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
  if (!target && !user) {
    console.warn(`[admin] 踢出失败-用户不存在: uuid=${uuid.slice(0, 8)}`)
  }
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

// 运行时配置 API
app.post('/admin/config', express.json(), (req, res) => {
  const b = req.body
  const errors = []

  // 推送
  if (b.huaweiImportance != null) {
    if (['LOW', 'NORMAL', 'HIGH'].includes(b.huaweiImportance)) {
      runtimeConfig.huaweiImportance = b.huaweiImportance
    } else errors.push('huaweiImportance 值无效')
  }
  if (b.fcmPriority != null) {
    if (['high', 'normal'].includes(b.fcmPriority)) {
      runtimeConfig.fcmPriority = b.fcmPriority
    } else errors.push('fcmPriority 值无效')
  }

  // 连接（前端用用户友好单位，这里转为毫秒）
  if (b.gracePeriodMin != null) {
    const v = Number(b.gracePeriodMin)
    if (v >= 1 && v <= 180) runtimeConfig.gracePeriodMs = v * 60 * 1000
    else errors.push('gracePeriodMin 范围 1-180')
  }
  if (b.heartbeatSec != null) {
    const v = Number(b.heartbeatSec)
    if (v >= 5 && v <= 60) runtimeConfig.heartbeatIntervalMs = v * 1000
    else errors.push('heartbeatSec 范围 5-60')
  }
  if (b.heartbeatMaxMissed != null) {
    const v = Number(b.heartbeatMaxMissed)
    if (Number.isInteger(v) && v >= 1 && v <= 10) runtimeConfig.heartbeatMaxMissed = v
    else errors.push('heartbeatMaxMissed 范围 1-10')
  }
  if (b.offlineMsgDelayMs != null) {
    const v = Number(b.offlineMsgDelayMs)
    if (Number.isInteger(v) && v >= 0 && v <= 5000) runtimeConfig.offlineMsgDelayMs = v
    else errors.push('offlineMsgDelayMs 范围 0-5000')
  }

  // 业务限制
  if (b.maxNicknameLength != null) {
    const v = Number(b.maxNicknameLength)
    if (Number.isInteger(v) && v >= 3 && v <= 50) runtimeConfig.maxNicknameLength = v
    else errors.push('maxNicknameLength 范围 3-50')
  }
  if (b.maxOfflineMessages != null) {
    const v = Number(b.maxOfflineMessages)
    if (Number.isInteger(v) && v >= 10 && v <= 500) runtimeConfig.maxOfflineMessages = v
    else errors.push('maxOfflineMessages 范围 10-500')
  }
  if (b.maxClientMessages != null) {
    const v = Number(b.maxClientMessages)
    if (Number.isInteger(v) && v >= 50 && v <= 1000) runtimeConfig.maxClientMessages = v
    else errors.push('maxClientMessages 范围 50-1000')
  }

  if (errors.length > 0) {
    console.warn(`[admin] 配置校验失败: ${errors.join(', ')}`)
    return res.status(400).json({ ok: false, error: errors.join('; ') })
  }

  console.log(`[admin] 运行时配置已更新:`, JSON.stringify(runtimeConfig))
  res.json({ ok: true, runtimeConfig })
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
