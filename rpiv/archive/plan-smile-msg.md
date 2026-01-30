---
description: "功能实施计划: SmileMsg 即时通讯应用 MVP"
status: archived
created_at: 2026-01-29T23:45:00
updated_at: 2026-01-30T01:05:00
archived_at: 2026-01-30T01:05:00
related_files:
  - rpiv/requirements/prd-smile-msg.md
---

# 功能：SmileMsg 即时通讯应用 MVP

以下计划应该是完整的，但在开始实施之前，验证文档和代码库模式以及任务合理性非常重要。

特别注意现有工具、类型和模型的命名。从正确的文件导入等。

## 功能描述

SmileMsg 是一款轻量级"阅后即焚"即时通讯工具。所有消息仅存于服务器内存，重启即清零。用户输入昵称即可登录、输入对方昵称即可私聊。提供 Windows 桌面端（Electron）和 Web 端（浏览器直接访问）两种使用方式，功能一致。

## 用户故事

作为一个小团队成员
我想要打开软件后输入昵称就能和指定的人私聊
以便拥有一个不留痕迹、零配置的即时沟通工具

## 问题陈述

主流 IM 工具都会持久化聊天记录，部署配置复杂，且需要注册登录。小团队需要一个开箱即用、不留痕迹的临时沟通工具。

## 解决方案陈述

基于 Socket.io 构建纯内存即时通讯系统，服务端零持久化。客户端提供 Electron 桌面端和 Web 浏览器端两种接入方式。昵称登录，按昵称发起私聊。

## 功能元数据

**功能类型**：新功能
**估计复杂度**：中
**主要受影响的系统**：服务端（Node.js + Socket.io + Express）、Web 客户端（Vue 3）、桌面客户端（Electron + Vue 3）
**依赖项**：Node.js ≥18, Electron, Vue 3, Vite, Socket.io, Tailwind CSS, electron-builder
**范围外**：Zeabur 部署（作为后续独立任务处理）

---

## 架构决策

### 项目结构方案

采用 **三模块 monorepo**（pnpm workspaces）：

```
smile-msg/
├── pnpm-workspace.yaml
├── package.json              # 根：workspace 脚本
├── .gitignore
├── server/                   # Node.js 服务端
│   ├── src/
│   │   ├── index.js          # 入口：Express + Socket.io
│   │   ├── store.js          # 内存数据存储
│   │   └── handlers/
│   │       └── chat.js       # Socket 事件处理器
│   └── package.json
├── web/                      # Vue 3 Web 客户端
│   ├── src/
│   │   ├── App.vue
│   │   ├── main.js
│   │   ├── components/
│   │   │   ├── LoginView.vue
│   │   │   └── ChatView.vue
│   │   ├── composables/
│   │   │   └── useSocket.js
│   │   └── assets/
│   │       └── main.css
│   ├── index.html
│   ├── vite.config.js
│   ├── .env.development      # VITE_SERVER_URL=http://localhost:3000
│   ├── .env.production       # VITE_SERVER_URL=（空，同源访问）
│   └── package.json
├── desktop/                  # Electron 桌面客户端
│   ├── src/
│   │   ├── main/
│   │   │   └── index.js      # Electron 主进程（窗口、托盘）
│   │   ├── preload/
│   │   │   └── index.js
│   │   └── renderer/         # Vue 3 渲染进程
│   │       ├── src/
│   │       │   ├── App.vue
│   │       │   ├── main.js
│   │       │   ├── components/
│   │       │   │   ├── LoginView.vue
│   │       │   │   └── ChatView.vue
│   │       │   ├── composables/
│   │       │   │   └── useSocket.js
│   │       │   └── assets/
│   │       │       └── main.css
│   │       └── index.html
│   ├── resources/            # electron-vite 脚手架自带默认图标
│   ├── electron.vite.config.js
│   ├── electron-builder.yml
│   ├── .env.development      # VITE_SERVER_URL=http://localhost:3000
│   ├── .env.production       # VITE_SERVER_URL=https://smile-msg.zeabur.app
│   └── package.json
└── rpiv/                     # 过程文档
```

**关键架构说明：**

1. **Web 端与桌面端代码独立**：两端各自维护 Vue 组件，核心文件仅 5 个（App.vue、LoginView.vue、ChatView.vue、useSocket.js、main.css），复制成本低于引入共享代码的架构复杂度。
2. **环境变量文件位于各子项目目录**：Vite 和 electron-vite 只从各自项目根目录加载 `.env` 文件。Web 端生产环境 `VITE_SERVER_URL` 为空（依赖同源访问），桌面端生产环境写完整 URL。
3. **不使用 Pinia/Vue Router**：应用状态简单，一个 composable 管理全部状态，两个视图通过 `phase` 切换。

### 服务端架构

- Express 提供 HTTP 服务：静态文件托管（Web 构建产物）、管理页面（`/admin`）、健康检查
- Socket.io 挂载在同一 HTTP server 上，提供 WebSocket 通信
- 所有数据存储在 `store.js` 的 Map/Set 中，零持久化
- 事件处理器统一放在 `handlers/chat.js`
- Socket.io 在 HTTP Server 层拦截 `/socket.io` 请求，不经过 Express 路由

### 服务器地址配置

| 端 | 开发环境 | 生产环境 |
|---|---|---|
| Web 端 | `http://localhost:3000`（跨域，server 开启 CORS） | 空字符串（同源，由 server 托管静态文件） |
| 桌面端 | `http://localhost:3000` | `https://smile-msg.zeabur.app` |

---

## 上下文参考

### 相关文档（实施前应阅读）

- [Socket.io 官方文档 - 服务端 API](https://socket.io/docs/v4/server-api/)
  - 事件处理、房间、命名空间
  - 原因：服务端核心通信实现
- [Socket.io 官方文档 - Vue 3 集成](https://socket.io/how-to/use-with-vue)
  - Composable 模式
  - 原因：客户端 Socket 管理
- [electron-vite 文档 - 快速开始](https://electron-vite.org/guide/)
  - 项目结构、配置
  - 原因：桌面端脚手架
- [Tailwind CSS v4 - Vite 安装](https://tailwindcss.com/docs/installation/vite)
  - `@tailwindcss/vite` 插件
  - 原因：UI 样式
- [Electron - Tray API](https://www.electronjs.org/docs/latest/api/tray)
  - 系统托盘
  - 原因：桌面端托盘功能
- [electron-builder - 配置](https://www.electron.build/configuration)
  - Windows 打包
  - 原因：生成 .exe

### 要遵循的模式

**命名约定：**
- Vue 组件文件名：PascalCase（`LoginView.vue`、`ChatView.vue`），Vue 社区惯例
- 变量/函数：camelCase
- Socket 事件名：snake_case（`create_private_chat`、`send_message`），与 PRD 一致

**Socket.io 事件模式：**
- 客户端 → 服务端：使用回调（callback）返回结果，而非额外事件
- 服务端 → 客户端：使用事件推送（`new_message`、`peer_offline` 等）

**Vue 组件模式：**
- Composition API + `<script setup>` 语法
- 状态管理：使用 `ref`/`reactive`，不引入 Pinia
- Socket 逻辑封装为 composable（`useSocket.js`），模块级单例

---

## 实施计划

### 阶段 1：项目脚手架（任务 1-2）

搭建 monorepo 结构，初始化三个子项目。

### 阶段 2：服务端核心（任务 3-5）

实现服务端所有功能：内存存储、Socket 事件处理、管理页面。

### 阶段 3：Web 客户端（任务 6-11）

实现完整的 Vue 3 Web 前端，浏览器可用，与服务端联调。

### 阶段 4：桌面端集成（任务 12-14）

用 electron-vite 搭建 Electron 桌面端，复用 Web 端的 Vue 组件逻辑，增加托盘等桌面特性。

### 阶段 5：集成验证（任务 15）

Web 构建产物托管到服务端，桌面端打包 .exe，端到端联调。

---

## 逐步任务

### 任务 1: CREATE 项目根目录与 monorepo 配置

- **IMPLEMENT**：
  1. 创建根 `package.json`
  2. 创建 `pnpm-workspace.yaml`
  3. 创建 `.gitignore`
- **VALIDATE**：`pnpm install`（应成功但无依赖）

根 `package.json`：
```json
{
  "name": "smile-msg",
  "private": true,
  "scripts": {
    "dev:server": "pnpm --filter server dev",
    "dev:web": "pnpm --filter web dev",
    "dev:desktop": "pnpm --filter desktop dev",
    "build:web": "pnpm --filter web build",
    "build:desktop": "pnpm --filter desktop build"
  }
}
```

`pnpm-workspace.yaml`：
```yaml
packages:
  - 'server'
  - 'web'
  - 'desktop'
```

`.gitignore`：
```
node_modules/
dist/
out/
.env.local
*.exe
```

---

### 任务 2: CREATE `server/package.json` 与依赖安装

- **IMPLEMENT**：
  ```json
  {
    "name": "server",
    "private": true,
    "type": "module",
    "scripts": {
      "dev": "node --watch src/index.js",
      "start": "node src/index.js"
    },
    "dependencies": {
      "express": "^4.21.0",
      "socket.io": "^4.8.0"
    }
  }
  ```
- **GOTCHA**：不需要 `dotenv`，`PORT` 和 `NODE_ENV` 由 PaaS 平台或运行环境注入，本地默认 3000；`node --watch` 需要 Node.js ≥18.11
- **VALIDATE**：`pnpm --filter server install`

---

### 任务 3: CREATE `server/src/store.js` — 内存数据存储

- **IMPLEMENT**：

```javascript
// server/src/store.js
// 在线用户表: uuid → { socketId, nickname, conversationId }
export const users = new Map()

// 会话表: conversationId → { members: Set<uuid> }
export const conversations = new Map()

// Socket 映射: socketId → uuid
export const socketToUser = new Map()

// 昵称 → uuid 快速查找
export const nicknameToUuid = new Map()

/**
 * 注册用户
 * @returns {{ success: boolean, error?: string, oldSocketId?: string }}
 */
export function registerUser(uuid, nickname, socketId) {
  // 检查昵称是否被其他 UUID 占用
  const existingUuid = nicknameToUuid.get(nickname)
  if (existingUuid && existingUuid !== uuid) {
    return { success: false, error: '昵称已被使用' }
  }

  // 如果该 UUID 已在线（重连或多开），踢掉旧连接
  const existingUser = users.get(uuid)
  const oldSocketId = existingUser?.socketId

  users.set(uuid, { socketId, nickname, conversationId: existingUser?.conversationId || null })
  socketToUser.set(socketId, uuid)
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
```

- **VALIDATE**：`node -e "import('./server/src/store.js').then(m => console.log('store OK'))"`

---

### 任务 4: CREATE `server/src/handlers/chat.js` — Socket 事件处理器

- **IMPLEMENT**：

```javascript
// server/src/handlers/chat.js
import {
  registerUser, removeUser, createConversation,
  users, socketToUser, nicknameToUuid, conversations
} from '../store.js'

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

  // 断开连接
  socket.on('disconnect', () => {
    const removed = removeUser(socket.id)
    if (!removed) return

    // 通知聊天对方
    if (removed.conversationId) {
      const conv = conversations.get(removed.conversationId)
      if (conv) {
        const peerUuid = [...conv.members].find(id => id !== removed.uuid)
        if (peerUuid) {
          const peer = users.get(peerUuid)
          if (peer) {
            io.to(peer.socketId).emit('peer_offline', {
              conversationId: removed.conversationId
            })
            // 清理对方的会话引用
            peer.conversationId = null
          }
        }
        // 会话已无意义，删除
        conversations.delete(removed.conversationId)
      }
    }
  })
}
```

- **GOTCHA**：断线重连时 UUID 相同但 socketId 不同，`registerUser` 内部保留了 `oldSocketId` 用于踢旧连接；`removeUser` 检查 socketId 匹配避免误踢新连接
- **VALIDATE**：`node --check server/src/handlers/chat.js`

---

### 任务 5: CREATE `server/src/index.js` — 服务端入口

- **IMPLEMENT**：

```javascript
// server/src/index.js
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
  }
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
// 注意：Socket.io 在 HTTP Server 层拦截 /socket.io 请求，不经过 Express 路由
io.on('connection', (socket) => {
  setupChatHandlers(io, socket)
})

const PORT = process.env.PORT || 3000
httpServer.listen(PORT, () => {
  console.log(`SmileMsg server running on port ${PORT}`)
})
```

- **GOTCHA**：
  - `escapeHtml()` 防止用户昵称中的 HTML 标签被执行（XSS 防护）
  - `existsSync(webDistPath)` 检查：开发时 `web/dist` 不存在，静态托管和 SPA fallback 均跳过，避免错误
  - `/admin` 和 `/health` 路由在 SPA fallback 之前注册，不会被覆盖
  - Socket.io 在 HTTP Server 层拦截，不需要在 Express 层特殊处理
- **VALIDATE**：`pnpm --filter server dev`，然后 `curl http://localhost:3000/health` 和 `curl http://localhost:3000/admin`

---

### 任务 6: CREATE `web/` — Vue 3 Web 客户端项目

- **IMPLEMENT**：
  1. 创建 `web/package.json`
  2. 创建 `web/vite.config.js`
  3. 创建 `web/index.html`
  4. 创建 `web/src/main.js`
  5. 创建 `web/src/assets/main.css`
  6. 创建 `web/.env.development` 和 `web/.env.production`

`web/package.json`：
```json
{
  "name": "web",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "vue": "^3.5.0",
    "socket.io-client": "^4.8.0"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^5.2.0",
    "vite": "^6.1.0",
    "tailwindcss": "^4.0.0",
    "@tailwindcss/vite": "^4.0.0"
  }
}
```

`web/vite.config.js`：
```javascript
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  server: {
    port: 5173
  }
})
```

`web/index.html`：
```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SmileMsg</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/src/main.js"></script>
</body>
</html>
```

`web/src/main.js`：
```javascript
import { createApp } from 'vue'
import App from './App.vue'
import './assets/main.css'

createApp(App).mount('#app')
```

`web/src/assets/main.css`：
```css
@import "tailwindcss";
```

`web/.env.development`：
```
VITE_SERVER_URL=http://localhost:3000
```

`web/.env.production`：
```
VITE_SERVER_URL=
```

- **GOTCHA**：Web 生产环境 `VITE_SERVER_URL` 为空字符串，`io('')` 等同于 `io()`，Socket.io 会自动连接同源服务器
- **VALIDATE**：`pnpm --filter web install; pnpm --filter web dev`

---

### 任务 7: CREATE `web/src/composables/useSocket.js` — Socket 通信逻辑

- **IMPLEMENT**：

```javascript
// web/src/composables/useSocket.js
import { ref, readonly } from 'vue'
import { io } from 'socket.io-client'

const SERVER_URL = import.meta.env.VITE_SERVER_URL || ''

// 单例 socket 实例
let socket = null

// 全局响应式状态
const connected = ref(false)
const myUuid = ref('')
const myNickname = ref('')
const peerNickname = ref('')
const conversationId = ref('')
const messages = ref([])
const phase = ref('login') // 'login' | 'idle' | 'chat'
const peerIsOffline = ref(false)
const error = ref('')
const loading = ref(false)

const MAX_MESSAGES = 200

function generateUuid() {
  return crypto.randomUUID()
}

function getOrCreateUuid() {
  if (!myUuid.value) {
    myUuid.value = generateUuid()
  }
  return myUuid.value
}

function initSocket() {
  // 如果 socket 已存在（无论连接状态），直接复用
  if (socket) {
    if (!socket.connected) {
      socket.connect()
    }
    return
  }

  // 首次创建 socket
  socket = io(SERVER_URL, {
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000
  })

  socket.on('connect', () => {
    connected.value = true

    // 断线重连时自动重新登录
    if (myNickname.value) {
      socket.emit('login', {
        uuid: myUuid.value,
        nickname: myNickname.value
      }, (res) => {
        if (res.success && res.restored) {
          conversationId.value = res.conversationId
          peerNickname.value = res.target?.nickname || ''
          phase.value = res.target ? 'chat' : 'idle'
          peerIsOffline.value = false
        }
      })
    }
  })

  socket.on('disconnect', () => {
    connected.value = false
  })

  socket.on('new_message', ({ conversationId: convId, message }) => {
    if (convId === conversationId.value) {
      messages.value.push(message)
      if (messages.value.length > MAX_MESSAGES) {
        messages.value = messages.value.slice(-MAX_MESSAGES)
      }
    }
  })

  socket.on('conversation_created', ({ conversationId: convId, target }) => {
    conversationId.value = convId
    peerNickname.value = target.nickname
    phase.value = 'chat'
    peerIsOffline.value = false
    messages.value = []
  })

  socket.on('peer_offline', ({ conversationId: convId }) => {
    if (convId === conversationId.value) {
      peerIsOffline.value = true
      messages.value.push({
        id: `sys_${Date.now()}`,
        type: 'system',
        content: '对方已离线'
      })
    }
  })

  socket.on('force_disconnect', () => {
    destroyAndReset()
  })

  socket.connect()
}

function login(nickname) {
  return new Promise((resolve) => {
    error.value = ''
    loading.value = true
    const uuid = getOrCreateUuid()

    initSocket()

    const doLogin = () => {
      socket.emit('login', { uuid, nickname: nickname.trim() }, (res) => {
        loading.value = false
        if (res.success) {
          myNickname.value = nickname.trim()
          if (res.restored) {
            conversationId.value = res.conversationId
            peerNickname.value = res.target?.nickname || ''
            phase.value = res.target ? 'chat' : 'idle'
            peerIsOffline.value = false
          } else {
            phase.value = 'idle'
          }
          resolve({ success: true })
        } else {
          error.value = res.error
          resolve({ success: false, error: res.error })
        }
      })
    }

    if (socket.connected) {
      doLogin()
    } else {
      socket.once('connect', doLogin)
    }
  })
}

function createChat(targetNickname) {
  return new Promise((resolve) => {
    error.value = ''
    loading.value = true
    socket.emit('create_private_chat', { targetNickname: targetNickname.trim() }, (res) => {
      loading.value = false
      if (res.success) {
        conversationId.value = res.conversationId
        peerNickname.value = res.target.nickname
        phase.value = 'chat'
        peerIsOffline.value = false
        messages.value = []
        resolve({ success: true })
      } else {
        error.value = res.error
        resolve({ success: false, error: res.error })
      }
    })
  })
}

function sendMessage(content) {
  if (!content || !content.trim() || !conversationId.value) return
  socket.emit('send_message', {
    conversationId: conversationId.value,
    content
  })
}

function disconnect() {
  destroyAndReset()
}

/**
 * 彻底销毁 socket 并重置所有状态
 */
function destroyAndReset() {
  if (socket) {
    socket.removeAllListeners()
    socket.disconnect()
    socket = null
  }
  connected.value = false
  myUuid.value = ''
  myNickname.value = ''
  peerNickname.value = ''
  conversationId.value = ''
  messages.value = []
  phase.value = 'login'
  peerIsOffline.value = false
  error.value = ''
  loading.value = false
}

export function useSocket() {
  return {
    // 状态（只读）
    connected: readonly(connected),
    myUuid: readonly(myUuid),
    myNickname: readonly(myNickname),
    peerNickname: readonly(peerNickname),
    conversationId: readonly(conversationId),
    messages: readonly(messages),
    phase: readonly(phase),
    peerIsOffline: readonly(peerIsOffline),
    error: readonly(error),
    loading: readonly(loading),
    // 方法
    login,
    createChat,
    sendMessage,
    disconnect
  }
}
```

- **关键设计说明**：
  - `initSocket()`：如果 socket 已存在但断开，调用 `socket.connect()` 复用现有实例（保留事件监听），不重新创建。只有 socket 为 null 时才 new。
  - `destroyAndReset()`：调用 `socket.removeAllListeners()` 彻底清理，然后断开并置 null，确保下次 `initSocket()` 从零开始。用于主动断开和被踢场景。
  - `peerIsOffline`：独立 ref 状态，不依赖消息列表最后一条的 type 判断。
- **VALIDATE**：语法正确即可，运行时与任务 8-10 一起验证

---

### 任务 8: CREATE `web/src/components/LoginView.vue` — 登录界面

- **IMPLEMENT**：

```vue
<!-- web/src/components/LoginView.vue -->
<script setup>
import { ref } from 'vue'
import { useSocket } from '../composables/useSocket.js'

const { error, loading, login } = useSocket()
const nickname = ref('')

async function handleLogin() {
  if (!nickname.value.trim() || nickname.value.length > 20) return
  await login(nickname.value)
}
</script>

<template>
  <div class="flex flex-col items-center justify-center min-h-screen bg-white">
    <h1 class="text-3xl font-bold text-gray-800 mb-8">SmileMsg</h1>

    <div class="w-72">
      <input
        v-model="nickname"
        type="text"
        placeholder="输入你的昵称"
        maxlength="20"
        class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
        :disabled="loading"
        @keyup.enter="handleLogin"
      />
      <p v-if="error" class="mt-2 text-sm text-red-500">{{ error }}</p>

      <button
        class="w-full mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
        :disabled="loading || !nickname.trim()"
        @click="handleLogin"
      >
        {{ loading ? '登录中...' : '登录' }}
      </button>
    </div>
  </div>
</template>
```

---

### 任务 9: CREATE `web/src/components/ChatView.vue` — 聊天界面

- **IMPLEMENT**：

```vue
<!-- web/src/components/ChatView.vue -->
<script setup>
import { ref, watch, nextTick, computed } from 'vue'
import { useSocket } from '../composables/useSocket.js'

const {
  phase, myUuid, peerNickname, peerIsOffline, messages, error, loading,
  createChat, sendMessage, disconnect
} = useSocket()

const targetInput = ref('')
const messageInput = ref('')
const messagesContainer = ref(null)

const isIdle = computed(() => phase.value === 'idle')
const isChat = computed(() => phase.value === 'chat')
const canSend = computed(() => isChat.value && !peerIsOffline.value)

async function handleConnect() {
  if (!targetInput.value.trim() || targetInput.value.length > 20) return
  await createChat(targetInput.value)
}

function handleSend() {
  const content = messageInput.value
  if (!content.trim()) return
  sendMessage(content)
  messageInput.value = ''
}

function handleDisconnect() {
  disconnect()
}

function handleKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}

// 新消息自动滚动到底部
watch(messages, async () => {
  await nextTick()
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}, { deep: true })
</script>

<template>
  <div class="flex flex-col h-screen bg-white">
    <!-- 顶部栏 -->
    <div class="flex items-center gap-2 p-3 border-b border-gray-200">
      <template v-if="isIdle">
        <input
          v-model="targetInput"
          type="text"
          placeholder="输入对方昵称"
          maxlength="20"
          class="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
          :disabled="loading"
          @keyup.enter="handleConnect"
        />
        <button
          class="px-4 py-1.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
          :disabled="loading || !targetInput.trim()"
          @click="handleConnect"
        >
          {{ loading ? '连接中...' : '连接' }}
        </button>
      </template>
      <template v-else>
        <span class="flex-1 font-medium text-gray-800">{{ peerNickname }}</span>
        <button
          class="px-4 py-1.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
          @click="handleDisconnect"
        >
          断开
        </button>
      </template>
    </div>
    <p v-if="error && isIdle" class="px-3 pt-1 text-sm text-red-500">{{ error }}</p>

    <!-- 消息区域 -->
    <div ref="messagesContainer" class="flex-1 overflow-y-auto p-4 space-y-3">
      <template v-for="msg in messages" :key="msg.id">
        <!-- 系统消息 -->
        <div v-if="msg.type === 'system'" class="text-center text-sm text-gray-400">
          —— {{ msg.content }} ——
        </div>
        <!-- 对方消息 -->
        <div v-else-if="msg.senderUuid !== myUuid" class="flex justify-start">
          <div class="max-w-xs px-3 py-2 bg-gray-100 rounded-lg text-gray-800 whitespace-pre-wrap break-words">
            {{ msg.content }}
          </div>
        </div>
        <!-- 我的消息 -->
        <div v-else class="flex justify-end">
          <div class="max-w-xs px-3 py-2 bg-blue-500 text-white rounded-lg whitespace-pre-wrap break-words">
            {{ msg.content }}
          </div>
        </div>
      </template>
    </div>

    <!-- 输入区域 -->
    <div class="p-3 border-t border-gray-200">
      <textarea
        v-model="messageInput"
        rows="2"
        placeholder="输入消息... (Enter 发送, Shift+Enter 换行)"
        class="w-full px-3 py-2 border border-gray-300 rounded-lg resize-none focus:outline-none focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
        :disabled="!canSend"
        @keydown="handleKeydown"
      ></textarea>
    </div>
  </div>
</template>
```

---

### 任务 10: CREATE `web/src/App.vue` — 根组件

- **IMPLEMENT**：

```vue
<!-- web/src/App.vue -->
<script setup>
import { useSocket } from './composables/useSocket.js'
import LoginView from './components/LoginView.vue'
import ChatView from './components/ChatView.vue'

const { phase } = useSocket()
</script>

<template>
  <LoginView v-if="phase === 'login'" />
  <ChatView v-else />
</template>
```

- **VALIDATE**：`pnpm --filter web dev`，在浏览器中打开 `http://localhost:5173`，页面应显示登录界面

---

### 任务 11: 集成测试 — 服务端 + Web 客户端联调

- **IMPLEMENT**：
  1. 终端 1：`pnpm --filter server dev`
  2. 终端 2：`pnpm --filter web dev`
  3. 打开两个浏览器标签页访问 `http://localhost:5173`
  4. 标签页 A 登录昵称"小明"，标签页 B 登录昵称"小红"
  5. A 输入"小红"点连接 → 双方进入聊天
  6. 互发消息，验证气泡显示
  7. A 点断开 → 回到登录页
  8. B 看到"对方已离线"提示

- **验证项**：
  - [ ] 登录成功后进入空闲阶段
  - [ ] 昵称重名时显示错误提示"昵称已被使用"
  - [ ] 发起连接后双方进入聊天
  - [ ] 对方不在线时显示"该用户不在线"
  - [ ] 对方正忙时显示"对方正忙"
  - [ ] 消息正常发送和接收，左右气泡样式正确
  - [ ] Enter 发送、Shift+Enter 换行
  - [ ] 断开后回到登录页，输入框清空
  - [ ] 对方关闭标签页后显示"对方已离线"，输入框禁用
  - [ ] 管理页面 `http://localhost:3000/admin` 显示在线用户

---

### 任务 12: CREATE `desktop/` — Electron 桌面端项目

- **IMPLEMENT**：使用 `electron-vite` 脚手架创建项目，然后调整

  1. 在项目根目录执行：`pnpm create @quick-start/electron desktop -- --template vue`
  2. 进入 desktop 目录安装额外依赖：
     - `pnpm --filter desktop add socket.io-client`
     - `pnpm --filter desktop add -D tailwindcss @tailwindcss/vite`
  3. 修改 `electron.vite.config.js`：在 renderer 的 plugins 中添加 `tailwindcss()` 插件
  4. 将 Web 端的 Vue 组件和 composable 复制到 `desktop/src/renderer/src/`：
     - `components/LoginView.vue`
     - `components/ChatView.vue`
     - `composables/useSocket.js`
     - `App.vue`（替换脚手架生成的）
  5. 创建 `desktop/src/renderer/src/assets/main.css`，内容为 `@import "tailwindcss";`
  6. 确保 `desktop/src/renderer/src/main.js` 导入 `./assets/main.css`
  7. 创建环境变量文件

`desktop/.env.development`：
```
VITE_SERVER_URL=http://localhost:3000
```

`desktop/.env.production`：
```
VITE_SERVER_URL=https://smile-msg.zeabur.app
```

- **GOTCHA**：
  - electron-vite 生成的目录结构中，renderer 的源码在 `src/renderer/src/` 下，注意路径层级
  - electron-vite 的 renderer 使用独立的 Vite 配置（定义在 `electron.vite.config.js` 的 `renderer` 字段中）
  - `.env` 文件放在 `desktop/` 根目录，electron-vite 会自动加载
  - 脚手架自带默认图标（`resources/icon.png`），直接使用，无需额外处理
- **VALIDATE**：`pnpm --filter desktop dev`，Electron 窗口应显示登录界面

---

### 任务 13: UPDATE `desktop/src/main/index.js` — 托盘与窗口管理

- **IMPLEMENT**：修改 electron-vite 生成的主进程文件，添加系统托盘功能

```javascript
// desktop/src/main/index.js
import { app, shell, BrowserWindow, Tray, Menu, nativeImage } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

let mainWindow = null
let tray = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 480,
    height: 640,
    minWidth: 360,
    minHeight: 480,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // 关闭按钮 → 隐藏到托盘（不退出）
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault()
      mainWindow.hide()
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // 加载页面
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function createTray() {
  const trayIcon = nativeImage.createFromPath(icon).resize({ width: 16, height: 16 })
  tray = new Tray(trayIcon)

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示主界面',
      click: () => {
        if (mainWindow) {
          mainWindow.show()
          mainWindow.focus()
        }
      }
    },
    { type: 'separator' },
    {
      label: '彻底退出',
      click: () => {
        app.isQuitting = true
        app.quit()
      }
    }
  ])

  tray.setToolTip('SmileMsg')
  tray.setContextMenu(contextMenu)

  // 单击托盘图标恢复窗口
  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    }
  })
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.smilemsg')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()
  createTray()
})

app.on('window-all-closed', () => {
  // 不退出，由托盘管理生命周期
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
```

- **GOTCHA**：
  - `import icon from '../../resources/icon.png?asset'`：electron-vite 的 asset 导入方式，编译后返回绝对路径，开发和生产均可用
  - `app.isQuitting` 是自定义属性（非 Electron API），用于区分"用户点 X 隐藏"和"彻底退出"两种场景
  - `window-all-closed` 事件中不调用 `app.quit()`，让托盘持续管理应用生命周期
- **VALIDATE**：`pnpm --filter desktop dev`，验证：关闭窗口后托盘图标出现 → 点击托盘图标窗口恢复 → 右键"彻底退出"应用关闭

---

### 任务 14: UPDATE `desktop/electron-builder.yml` — Windows 打包配置

- **IMPLEMENT**：

```yaml
appId: com.smilemsg
productName: SmileMsg
directories:
  buildResources: build
files:
  - '!**/.vscode/*'
  - '!src/*'
  - '!electron.vite.config.*'
  - '!{.eslintignore,.eslintrc.cjs,.prettierignore,.prettierrc.yaml,dev-app-update.yml,CHANGELOG.md,README.md}'
  - '!{tsconfig.json,tsconfig.node.json,tsconfig.web.json}'
asarUnpack:
  - resources/**
win:
  executableName: SmileMsg
  target:
    - target: nsis
      arch:
        - x64
nsis:
  artifactName: ${name}-${version}-setup.${ext}
  shortcutName: SmileMsg
  uninstallDisplayName: SmileMsg
  oneClick: false
  allowToChangeInstallationDirectory: true
```

- **VALIDATE**：`pnpm --filter desktop build:win`（在 `desktop/dist/` 下生成 `.exe` 安装包）

---

### 任务 15: 端到端集成验证

- **IMPLEMENT**：
  1. 构建 Web 端：`pnpm --filter web build`
  2. 启动服务端：`pnpm --filter server start`
  3. 浏览器访问 `http://localhost:3000`，验证 Web 客户端正常加载
  4. 启动桌面端（dev 模式）：`pnpm --filter desktop dev`
  5. 桌面端用户 A 登录 → Web 端用户 B 登录（通过 localhost:3000）
  6. A 输入 B 昵称连接 → 双方聊天 → 验证消息互通
  7. 验证桌面端托盘功能
  8. 访问 `http://localhost:3000/admin` 验证管理页面

- **验证项**：
  - [ ] Web 端通过服务端托管正常工作（http://localhost:3000）
  - [ ] 跨端（桌面 ↔ 浏览器）消息正常互通
  - [ ] 桌面端托盘功能正常（隐藏、恢复、退出）
  - [ ] 断线重连后身份和会话自动恢复
  - [ ] `/admin` 管理页面正确显示所有在线用户
  - [ ] 服务端无任何持久化存储（重启后数据清零）

---

## 测试策略

### 手动测试（MVP 阶段）

MVP 阶段以快速交付为优先，不编写自动化测试，采用手动测试验证：

1. **登录测试**：正常登录、昵称重名、空昵称、超长昵称（>20字符）
2. **连接测试**：正常连接、对方不在线、对方正忙、连接自己
3. **聊天测试**：发送消息、接收消息、空消息禁止、Shift+Enter 换行
4. **断开测试**：主动断开回到登录页、对方下线后输入框禁用
5. **重连测试**：断网恢复后自动重连、身份恢复、会话恢复
6. **桌面端测试**：关闭到托盘、托盘恢复窗口、右键彻底退出
7. **管理页面**：显示在线用户列表、用户上下线后列表变化
8. **XSS 测试**：使用含 HTML 标签的昵称登录，验证管理页面不执行脚本

---

## 验证命令

### 级别 1：依赖安装

```bash
pnpm install
```

### 级别 2：服务端启动

```bash
pnpm --filter server dev
# 另一终端
curl http://localhost:3000/health
curl http://localhost:3000/admin
```

### 级别 3：Web 客户端开发模式

```bash
pnpm --filter web dev
# 浏览器打开 http://localhost:5173
```

### 级别 4：Web 构建 + 服务端托管

```bash
pnpm --filter web build
pnpm --filter server start
# 浏览器打开 http://localhost:3000
```

### 级别 5：桌面端开发模式

```bash
pnpm --filter desktop dev
```

### 级别 6：桌面端打包

```bash
pnpm --filter desktop build:win
# 检查 desktop/dist/ 目录下的 .exe 文件
```

---

## 验收标准

- [ ] 用户可通过昵称登录，无需注册
- [ ] 输入对方昵称发起私聊，正常收发纯文本消息
- [ ] Web 端浏览器访问服务器地址即可使用
- [ ] 桌面端和 Web 端用户可互相聊天
- [ ] 管理员可通过 `/admin` 查看在线用户列表（已防 XSS）
- [ ] 断线重连后身份自动恢复
- [ ] 桌面端关闭窗口最小化到托盘，可恢复和彻底退出
- [ ] 服务器重启后所有数据清零（零持久化）
- [ ] 桌面端可打包为 Windows .exe
- [ ] 昵称重名检测正常工作
- [ ] 对方不在线/正忙时正确提示错误

---

## 完成检查清单

- [ ] 所有任务按顺序完成
- [ ] 服务端启动正常，健康检查通过
- [ ] Web 客户端在浏览器中功能完整
- [ ] 桌面端 Electron 窗口、托盘、聊天功能正常
- [ ] Web 构建产物由服务端正确托管
- [ ] 桌面端打包 .exe 成功
- [ ] 跨端联调通过（桌面 ↔ Web）
- [ ] 管理页面正常显示在线用户
- [ ] 所有验收标准均满足

---

## 备注

### 已修复的审查问题

| # | 问题 | 严重度 | 修复方式 |
|---|---|---|---|
| 1 | `.env` 文件放在根目录，Vite 无法加载 | P1 | 移到各子项目目录，Web 生产环境为空（同源） |
| 2 | SPA fallback `return` 不调 `next()` 导致请求挂起 | P1 | 用 `existsSync` 判断，仅当 `web/dist` 存在时注册 fallback |
| 3 | 管理页面昵称未转义（XSS） | P1 | 添加 `escapeHtml()` 函数 |
| 4 | `connectSocket()` 重复创建 socket | P1 | 重命名为 `initSocket()`，复用已有 socket |
| 5 | `dotenv` 依赖未使用 | P1 | 从 server 依赖中移除 |
| 6 | `peerOffline` 判断依赖消息列表末尾 | P2 | 新增独立 `peerIsOffline` ref |
| 7 | `disconnect()` 未清理事件监听 | P2 | `destroyAndReset()` 调用 `removeAllListeners()` |

### 风险

1. **electron-vite 脚手架结构可能与计划不完全一致**：执行时需根据实际生成的模板调整路径和配置文件名。
2. **Tailwind CSS v4 配置方式变化**：v4 使用 `@import "tailwindcss"` 代替旧版 `@tailwind` 指令，不再需要 `tailwind.config.js`。
3. **Socket.io 跨域（仅开发环境）**：Web 客户端（5173）和服务端（3000）端口不同，服务端已配置 `cors: { origin: '*' }`（非生产环境）。

### 范围外（后续独立任务）

- Zeabur 部署配置
- 自定义应用图标替换
- 自动化测试

### 信心分数

**8.5/10** — 所有已知技术陷阱已在审查中识别并修复。主要剩余不确定性为 electron-vite 脚手架的实际生成结构，需在执行时适配。
