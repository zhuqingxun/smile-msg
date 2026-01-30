import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { existsSync } from 'fs'
import { setupChatHandlers } from './handlers/chat.js'
import { getOnlineNicknames } from './store.js'

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

// 管理页面
app.get('/admin', (req, res) => {
  const nicknames = getOnlineNicknames()
  res.send(`
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>SmileMsg Admin</title>
      <style>
        body { font-family: system-ui, sans-serif; max-width: 600px; margin: 40px auto; padding: 0 20px; }
        h1 { color: #333; }
        .count { color: #666; margin-bottom: 16px; }
        ul { list-style: none; padding: 0; }
        li { padding: 8px 12px; border-bottom: 1px solid #eee; }
        .empty { color: #999; font-style: italic; }
      </style>
    </head>
    <body>
      <h1>SmileMsg 管理面板</h1>
      <p class="count">在线用户：${nicknames.length} 人</p>
      ${nicknames.length > 0
        ? `<ul>${nicknames.map(n => `<li>${escapeHtml(n)}</li>`).join('')}</ul>`
        : '<p class="empty">暂无在线用户</p>'}
      <p><small>刷新页面获取最新数据</small></p>
    </body>
    </html>
  `)
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

const PORT = process.env.PORT || 3000
httpServer.listen(PORT, () => {
  console.log(`SmileMsg server running on port ${PORT}`)
})
