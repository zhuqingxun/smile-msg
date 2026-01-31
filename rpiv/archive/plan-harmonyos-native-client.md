---
description: "功能实施计划: SmileMsg HarmonyOS NEXT 原生客户端"
status: archived
created_at: 2026-01-31T23:30:00
updated_at: 2026-01-31T23:55:00
archived_at: 2026-01-31T23:55:00
related_files:
  - rpiv/requirements/prd-harmonyos-native-client.md
---

# 功能：SmileMsg HarmonyOS NEXT 原生客户端

以下计划应该是完整的，但在开始实施之前，验证文档和代码库模式以及任务合理性非常重要。

特别注意现有工具、类型和模型的命名。从正确的文件导入等。

## 功能描述

为 SmileMsg 开发 HarmonyOS NEXT 原生客户端（ArkTS + ArkUI），功能与 Android 版 1:1 对齐。同时在服务端扩展原生 WebSocket 通信端点和华为 Push Kit 推送通道。

核心价值：
1. 利用鸿蒙系统级 Push Kit 推送，彻底解决 WebView 架构的后台保活问题
2. ArkUI 原生界面，符合 HarmonyOS Design 规范
3. 服务端新增原生 WebSocket 端点，鸿蒙客户端直连，无需依赖 Socket.io 三方库

## 用户故事

作为 HarmonyOS NEXT 设备用户
我想要使用原生体验的阅后即焚即时通讯服务
以便在任何应用状态下都能可靠地收发消息

## 问题陈述

当前 Android 版基于 Capacitor WebView 架构，在华为设备上系统频繁回收 WebView 进程，导致 Socket 连接断开、消息无法及时送达。HarmonyOS NEXT 不兼容 Android 应用，需要原生客户端。

## 解决方案陈述

1. **通信层**：服务端新增原生 WebSocket 端点（`/ws` 路径），定义 JSON 消息协议映射现有 Socket.io 事件，鸿蒙客户端使用 `@kit.NetworkKit` WebSocket API 直连
2. **推送层**：服务端集成华为 Push Kit REST API（OAuth 2.0 鉴权），按 platform 字段路由推送至 FCM 或 Push Kit
3. **客户端**：ArkTS + ArkUI 原生开发，状态机驱动视图，单例通信层

## 功能元数据

**功能类型**：新功能
**估计复杂度**：高
**主要受影响的系统**：
- `server/` — 新增 WebSocket 端点、Push Kit 通道、统一消息桥接
- `harmony/` — 全新 HarmonyOS NEXT 客户端

**依赖项**：
- `ws` npm 包（服务端原生 WebSocket 支持）
- `@kit.NetworkKit`（鸿蒙 WebSocket）
- `@kit.PushKit`（鸿蒙推送）
- `@ohos.data.preferences`（鸿蒙本地存储）
- `@kit.SensorServiceKit`（鸿蒙振动）

---

## 关键技术决策

### 决策 1：通信层方案 → 方案 A（服务端加原生 WS 端点）

**理由**：
- ohpm 上无成熟的 Socket.io 客户端库，社区生态不足
- 自实现 Socket.io 协议（握手、帧编码、心跳、ACK）工作量大且风险高
- 服务端加 WS 端点使用 `ws` 库，成熟稳定，鸿蒙客户端用系统原生 `@kit.NetworkKit` WebSocket，零三方依赖
- 代价是服务端需维护两套通信协议，但可通过统一消息桥接层抽象

### 决策 2：WebSocket 消息协议设计

JSON 信封格式，所有消息为单行 JSON 字符串：

```json
// 请求-响应模式（带 ackId）
{ "type": "event", "event": "login", "data": { "uuid": "...", "nickname": "..." }, "ackId": 1 }
→ { "type": "ack", "ackId": 1, "data": { "success": true } }

// 单向推送（无 ackId）
{ "type": "event", "event": "send_message", "data": { "conversationId": "...", "content": "..." } }

// 心跳
{ "type": "ping" } → { "type": "pong" }
```

完整事件映射：

| Socket.io 事件 | WS 消息 event 字段 | 方向 | 需要 ACK |
|---------------|-------------------|------|---------|
| `login` | `login` | C→S | ✅ |
| `create_private_chat` | `create_private_chat` | C→S | ✅ |
| `send_message` | `send_message` | C→S | ❌ |
| `leave_conversation` | `leave_conversation` | C→S | ✅ |
| `register_push_token` | `register_push_token` | C→S | ❌ |
| `app_state` | `app_state` | C→S | ❌ |
| `new_message` | `new_message` | S→C | ❌ |
| `conversation_created` | `conversation_created` | S→C | ❌ |
| `peer_offline` | `peer_offline` | S→C | ❌ |
| `force_disconnect` | `force_disconnect` | S→C | ❌ |

### 决策 3：服务端统一消息桥接

引入 `bridge.js` 模块，将 `io.to().emit()` 调用替换为统一的 `sendToUser(uuid, event, data)` 和 `broadcastToConversation(conversationId, event, data, excludeUuid?)` 函数。这些函数内部根据用户的 `connectionType`（`socketio` | `ws`）路由到对应的发送通道。

### 决策 4：HarmonyOS API 选型

| 能力 | API | 模块 |
|------|-----|------|
| WebSocket | `webSocket.createWebSocket()` | `@kit.NetworkKit` |
| 本地存储 | `preferences` | `@ohos.data.preferences` |
| 推送 Token | `pushService.getToken()` | `@kit.PushKit` |
| 振动 | `vibrator.startVibration()` | `@kit.SensorServiceKit` |
| UUID 生成 | `util.generateRandomUUID()` | `@ohos.util` |
| 通知权限 | `notificationManager` | `@kit.NotificationKit` |

---

## 上下文参考

### 相关代码库文件（实施前必须阅读）

**服务端核心文件**：
- `server/src/index.js`（第 1-195 行）— 主服务入口，Socket.io 初始化，需在此挂载 WS 端点
- `server/src/handlers/chat.js`（第 1-317 行）— Socket.io 事件处理器，所有业务逻辑在此，需重构为可被 WS handler 复用
- `server/src/store.js`（第 1-164 行）— 数据存储层，需新增 wsConnections Map 和 connectionType 字段
- `server/src/push.js`（第 1-103 行）— FCM 推送模块，需扩展支持 Push Kit

**Android 客户端（功能参考）**：
- `android/src/composables/useSocket.js`（第 1-440 行）— Android Socket 管理，鸿蒙版功能对标
- `android/src/composables/useNativeFeatures.js`（第 1-199 行）— Android 原生能力封装，鸿蒙版需对应实现
- `android/src/App.vue`（第 1-34 行）— Android 根组件，返回键处理和生命周期
- `android/src/main.js`（第 1-35 行）— Android 入口，初始化流程

**Web 客户端（UI 参考）**：
- `web/src/components/LoginView.vue`（第 1-40 行）— 登录界面布局
- `web/src/components/ChatView.vue`（第 1-119 行）— 聊天界面布局，消息列表+输入框
- `web/src/composables/useSocket.js`（第 1-232 行）— Web 核心逻辑（最简版本，便于理解）

### 要创建的新文件

**服务端**：
- `server/src/bridge.js` — 统一消息桥接层（sendToUser, broadcastToConversation, closeWsConnection）
- `server/src/handlers/chatLogic.js` — 共享业务逻辑（从 chat.js 提取，chat.js 和 ws.js 共用）
- `server/src/handlers/ws.js` — 原生 WebSocket 协议处理器
- `server/src/huaweiPush.js` — 华为 Push Kit REST API 封装（OAuth 2.0 + 推送发送）

**鸿蒙客户端**：
- `harmony/AppScope/app.json5` — 应用级配置
- `harmony/entry/src/main/module.json5` — 模块配置
- `harmony/entry/src/main/ets/entryability/EntryAbility.ets` — UIAbility 入口
- `harmony/entry/src/main/ets/pages/Index.ets` — 主页面（状态机路由）
- `harmony/entry/src/main/ets/common/SocketService.ets` — WebSocket 通信层（单例）
- `harmony/entry/src/main/ets/common/AppState.ets` — 全局响应式状态管理
- `harmony/entry/src/main/ets/common/StorageHelper.ets` — 本地持久化封装
- `harmony/entry/src/main/ets/common/PushHelper.ets` — Push Kit 封装
- `harmony/entry/src/main/ets/common/NativeHelper.ets` — 原生能力封装（振动、通知）
- `harmony/entry/src/main/ets/common/Constants.ets` — 常量定义
- `harmony/entry/src/main/ets/pages/LoginPage.ets` — 登录页面
- `harmony/entry/src/main/ets/pages/ChatPage.ets` — 聊天页面（idle + chat 两态）
- `harmony/oh-package.json5` — 依赖配置
- `harmony/build-profile.json5` — 构建配置
- `harmony/hvigorfile.ts` — 构建脚本

### 相关文档（实施前应阅读）

- [HarmonyOS WebSocket 开发指南](https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/websocket-connection-0000001477981069)
  - WebSocket 创建、连接、收发消息的完整 API
  - 原因：通信层实现的核心参考
- [HarmonyOS Push Kit 客户端开发](https://blog.csdn.net/pisceshsu/article/details/142434193)
  - pushService.getToken() 获取和上报 Push Token
  - 原因：推送功能的客户端实现
- [Push Kit 服务端 Node.js 示例](https://github.com/HMS-Core/hms-push-serverdemo-nodejs)
  - OAuth 2.0 鉴权 + REST API 推送示例代码
  - 原因：服务端 Push Kit 集成参考
- [Push Kit Node.js 教程](https://bensonthew.medium.com/sending-push-notifications-with-huawei-push-kit-v2-api-using-node-js-a-comprehensive-guide-1a5aa74e281a)
  - 详细的 Node.js + Push Kit 集成步骤
  - 原因：服务端实现的补充参考
- [ws 库文档](https://github.com/websockets/ws)
  - Node.js WebSocket 库的 API
  - 原因：服务端 WS 端点实现

### 要遵循的模式

**服务端命名约定**：
- 文件名：小写 camelCase（`chat.js`、`store.js`）
- 函数名：camelCase（`registerUser`、`sendPushNotification`）
- 常量：UPPER_SNAKE_CASE（`GRACE_PERIOD_MS`）
- 导出：命名导出（`export function ...`），非默认导出

**服务端错误处理**：
```javascript
// 模式：回调式错误返回（chat.js:20-21）
if (!uuid || !nickname) {
  return callback({ success: false, error: '昵称无效' })
}
```

**服务端日志模式**：
```javascript
// 模式：[模块] 描述性文本（chat.js:26）
console.log(`[FCM] 用户登录: nickname=${nickname.trim()}, platform=${platform}`)
```

**Android 客户端状态管理模式**：
```javascript
// 模式：Vue ref 全局单例 + 函数式暴露（useSocket.js:25-34）
const connected = ref(false)
const phase = ref('login') // 'login' | 'idle' | 'chat'
// ...
export function useSocket() {
  return { connected: readonly(connected), /* ... */ }
}
```

**鸿蒙 ArkTS 对应模式**：
```typescript
// 使用 @Observed + @ObjectLink 或 AppStorage 实现响应式状态
// 使用 @State 装饰器驱动 UI 更新
// 使用 @StorageLink / @StorageProp 跨页面共享状态
```

---

## 实施计划

### 阶段 1：服务端基础设施（WebSocket 端点 + 统一桥接 + 逻辑复用）

**目标**：服务端支持原生 WebSocket 客户端连接，现有 Socket.io 客户端不受影响。

**任务**：
1. 安装 `ws` 依赖
2. 创建统一消息桥接层 `bridge.js`
3. 修改 `store.js` 支持 WS 连接（null socketId）
4. 提取共享业务逻辑 `handlers/chatLogic.js`
5. 重构 `handlers/chat.js` 使用桥接层 + chatLogic
6. 创建 WebSocket 协议处理器 `handlers/ws.js`（调用 chatLogic）
7. 修改 `index.js` 挂载 WS 端点 + 管理页面支持 WS 用户
8. `parsePlatform()` 新增 `harmony` 识别

### 阶段 2：服务端 Push Kit 集成

**目标**：服务端支持向鸿蒙设备发送 Push Kit 推送通知。

**任务**：
1. 创建 `huaweiPush.js` 模块
2. 修改 `push.js` 为统一推送路由
3. 确认 `chatLogic.js` 中已使用统一推送（任务 10 已合并）
4. 修改 `index.js` 初始化 Push Kit

### 阶段 3：鸿蒙客户端项目骨架

**目标**：搭建 DevEco Studio 工程，基础配置就位。

**任务**：
1. 创建 `harmony/` 项目结构（任务 12）
2. 配置 `module.json5` 权限声明
3. 创建常量定义文件（任务 13）
4. 创建本地持久化封装（任务 14）

### 阶段 4：鸿蒙通信层

**目标**：实现 WebSocket 通信层，支持连接管理、消息收发、自动重连。

**任务**：
1. 创建 `AppState.ets` 全局状态管理（任务 15）
2. 创建 `SocketService.ets` 通信核心（任务 16）

### 阶段 5：鸿蒙 UI 页面

**目标**：实现登录和聊天界面。

**任务**：
1. 创建 `LoginPage.ets`（任务 19）
2. 创建 `ChatPage.ets`（任务 20，含 ForEach key + 自动滚动）
3. 创建 `Index.ets` 主页面路由（任务 21）
4. 创建 `EntryAbility.ets` 入口（任务 22）

### 阶段 6：鸿蒙原生能力

**目标**：集成推送、振动、通知、生命周期管理。

**任务**：
1. 创建 `NativeHelper.ets`（任务 17）
2. 创建 `PushHelper.ets`（任务 18）
3. 补充 `tryRestoreSession`（任务 23）
4. 集成 Native 回调（任务 24）

---

## 逐步任务

### 任务 1：UPDATE `server/package.json` — 添加 ws 依赖

- **IMPLEMENT**：在 `server/` 目录下执行 `pnpm add ws`
- **VALIDATE**：`cd server && pnpm ls ws`

### 任务 2：CREATE `server/src/bridge.js` — 统一消息桥接层

- **IMPLEMENT**：创建桥接模块，提供统一的跨协议消息发送能力

```javascript
// bridge.js 核心接口设计

import { users, conversations, socketToUser } from './store.js'

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
 */
export function closeWsConnection(uuid, reason) {
  const ws = wsConnections.get(uuid)
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify({ type: 'event', event: 'force_disconnect', data: { reason } }))
    ws.close()
  }
  wsConnections.delete(uuid)
}
```

- **PATTERN**：参照 `store.js` 的 Map 数据结构风格
- **GOTCHA**：
  - WebSocket.OPEN 常量值为 1，ws 库中需用数字比较
  - WS 用户在 `users` Map 中 `socketId` 为 `null`，`sendToUser` 的 Socket.io 分支通过 `user.socketId &&` 短路跳过
  - 新增 `closeWsConnection` 供管理页面踢出 WS 用户使用
- **VALIDATE**：`node -e "import('./server/src/bridge.js')"`

### 任务 3：UPDATE `server/src/store.js` — 支持 WS 连接（null socketId）

- **IMPLEMENT**：修改 `registerUser` 函数，当 `socketId` 为 `null` 时不写入 `socketToUser` 映射

```javascript
// store.js registerUser 修改（第 45-52 行）
export function registerUser(uuid, nickname, socketId, platform) {
  // ... 前面的检查逻辑不变 ...

  users.set(uuid, {
    socketId, nickname,   // WS 用户的 socketId 为 null
    conversationId: existingUser?.conversationId || null,
    pushToken: existingUser?.pushToken || null,
    loginTime: existingUser?.loginTime || Date.now(),
    platform: existingUser?.platform || platform,
  })

  // 仅当 socketId 非空时写入映射（WS 连接不需要此映射）
  if (socketId) {
    socketToUser.set(socketId, uuid)
  }
  nicknameToUuid.set(nickname, uuid)

  return { success: true, oldSocketId }
}
```

- **具体修改**：第 52 行 `socketToUser.set(socketId, uuid)` → 包裹在 `if (socketId)` 中
- **GOTCHA**：这是最小改动，仅新增一个条件判断。WS 用户通过 `bridge.js` 的 `wsConnections` Map 管理连接，不走 `socketToUser` 映射
- **VALIDATE**：`pnpm dev:server` 启动正常，Web 客户端登录不受影响

### 任务 4：CREATE `server/src/handlers/chatLogic.js` — 提取共享业务逻辑

- **IMPLEMENT**：从 `chat.js` 中提取核心业务逻辑为纯函数，供 Socket.io handler 和 WS handler 共同调用

```javascript
// chatLogic.js — 纯业务逻辑，不依赖具体传输层

import {
  registerUser, createConversation,
  users, socketToUser, nicknameToUuid, conversations,
  disconnectTimers, disconnectTimes, offlineMessages
} from '../store.js'
import { sendToUser, broadcastToConversation, hasActiveConnection, removeWsConnection } from '../bridge.js'
import { sendPush, isPushEnabled } from '../push.js'

export const GRACE_PERIOD_MS = 30 * 60 * 1000

/**
 * 处理登录
 * @param {string} uuid
 * @param {string} nickname
 * @param {string|null} connectionId - Socket.io 的 socket.id 或 WS 的 null
 * @param {string} platform
 * @returns {{ success, error?, oldSocketId?, restored?, conversationId?, target?, offlineMessages? }}
 */
export function handleLogin(uuid, nickname, connectionId, platform) {
  if (!uuid || !nickname || nickname.trim().length === 0 || nickname.length > 20) {
    return { success: false, error: '昵称无效' }
  }

  const trimmedNickname = nickname.trim()
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
 * @returns {{ success, error?, conversationId?, target?, initiatorNickname? }}
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
 * @returns {{ ok: boolean, message?, broadcastDone? }}
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

  // 推送决策
  const conv = conversations.get(convId)
  if (conv) {
    const peerUuid = [...conv.members].find(id => id !== uuid)
    if (peerUuid) {
      const peer = users.get(peerUuid)
      if (peer) {
        const peerOnline = hasActiveConnection(peerUuid)
        console.log(`[push] 推送决策: sender=${user.nickname} → peer=${peer.nickname}, online=${peerOnline}, inBg=${peer.inBackground}, hasToken=${!!peer.pushToken}, pushEnabled=${isPushEnabled(peer.platform)}`)

        if (!peerOnline) {
          // 对端离线 → 缓存离线消息 + 推送
          if (!offlineMessages.has(peerUuid)) offlineMessages.set(peerUuid, [])
          const queue = offlineMessages.get(peerUuid)
          if (queue.length < 100) queue.push({ conversationId: convId, message })

          if (isPushEnabled(peer.platform) && peer.pushToken) {
            sendPush(peer.pushToken, peer.platform, {
              senderNickname: user.nickname, content, conversationId: convId
            }).then(result => {
              if (result === 'token_invalid') peer.pushToken = null
            }).catch(e => console.warn('[push] 推送异常:', e.message))
          }
        } else if (peer.inBackground) {
          // 对端在线但后台 → 补发推送（不缓存离线消息）
          if (isPushEnabled(peer.platform) && peer.pushToken) {
            sendPush(peer.pushToken, peer.platform, {
              senderNickname: user.nickname, content, conversationId: convId
            }).then(result => {
              if (result === 'token_invalid') peer.pushToken = null
            }).catch(e => console.warn('[push] 推送异常:', e.message))
          }
        }
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
 * @returns {{ success: boolean, peerUuid? }}
 */
export function handleLeaveConversation(uuid, convId, io) {
  if (!uuid) return { success: false }
  const user = users.get(uuid)
  if (!user || user.conversationId !== convId) return { success: false }

  const conv = conversations.get(convId)
  if (conv) {
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

  console.log(`[disconnect] 用户断开: user=${user.nickname}, hasToken=${!!user.pushToken}, hasConv=${!!user.conversationId}`)

  disconnectTimes.set(uuid, Date.now())
  const timerId = setTimeout(() => {
    disconnectTimers.delete(uuid)
    disconnectTimes.delete(uuid)

    // 如果用户已重连，不清理
    const currentUser = users.get(uuid)
    if (currentUser && hasActiveConnection(uuid)) return

    const deadUser = users.get(uuid)
    if (!deadUser) return

    const { nickname, conversationId: convId } = deadUser
    users.delete(uuid)
    nicknameToUuid.delete(nickname)
    offlineMessages.delete(uuid)

    if (convId) {
      const conv = conversations.get(convId)
      if (conv) {
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
    }
  }, GRACE_PERIOD_MS)

  disconnectTimers.set(uuid, timerId)
}
```

- **PATTERN**：每个函数都是纯业务逻辑 + 桥接层调用，不依赖 `socket` 或 `ws` 对象
- **GOTCHA**：
  - `handleLogin` 返回 `offlineMessages` 数组但不负责发送，由调用方（chat.js/ws.js）决定发送方式
  - `handleSendMessage` 内部直接调用 `broadcastToConversation`（因为广播逻辑对两种 handler 完全一致）
  - `handleDisconnect` 的宽限期回调中使用 `hasActiveConnection` 而非 `socketToUser.has`，确保 WS 重连也被正确检测
- **VALIDATE**：`node -e "import('./server/src/handlers/chatLogic.js')"`

### 任务 5：UPDATE `server/src/handlers/chat.js` — 重构为使用桥接层 + chatLogic

- **IMPLEMENT**：完全重写 `chat.js`，改为调用 `chatLogic.js` 中的共享函数，只保留 Socket.io 传输层相关的代码

```javascript
// chat.js — Socket.io 传输层处理器（业务逻辑委托给 chatLogic.js）

import { socketToUser } from '../store.js'
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

    // 延迟检查 pushToken 注册
    if (platform === 'android') {
      setTimeout(() => {
        const { users } = require('../store.js')
        const u = users.get(uuid)
        console.log(`[FCM] token 注册检查 (登录后5s): user=${nickname.trim()}, hasToken=${!!u?.pushToken}`)
      }, 5000)
    }
  })

  socket.on('create_private_chat', ({ targetNickname }, callback) => {
    const uuid = socketToUser.get(socket.id)
    const result = handleCreatePrivateChat(uuid, targetNickname)

    if (!result.success) return callback({ success: false, error: result.error })

    // Socket.io 特有：双方加入房间
    socket.join(result.conversationId)
    const targetSocket = io.sockets.sockets.get(
      require('../store.js').users.get(result.targetUuid)?.socketId
    )
    if (targetSocket) targetSocket.join(result.conversationId)

    // 通知被连接方
    const { sendToUser } = require('../bridge.js')
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
    const { users } = require('../store.js')
    const user = uuid ? users.get(uuid) : null
    console.log(`[${tag || 'CLIENT'}] (${user?.nickname || 'unknown'}): ${message}`)
  })

  socket.on('disconnect', () => {
    const uuid = socketToUser.get(socket.id)
    if (!uuid) return

    const { users } = require('../store.js')
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
```

- **PATTERN**：`chat.js` 只负责 Socket.io 传输层（room join/leave、socket.emit、旧连接踢出），业务逻辑全部委托 `chatLogic.js`
- **GOTCHA**：
  - `parsePlatform()` 新增 `HarmonyOS` 识别，放在 `Android` 之前（因为鸿蒙 UA 可能同时包含 Android 字样）
  - `socket.join()` / `socket.leave()` 保留，作为 Socket.io 客户端的冗余路径
  - `create_private_chat` 中 `sendToUser` 用于通知被连接方，确保 WS 被连接方也能收到通知
  - `disconnect` 事件中先清理 `socketToUser` 映射，再调用 `handleDisconnect` 启动宽限期
- **VALIDATE**：`pnpm dev:server` 启动正常，Web 客户端完整测试登录→发起聊天→收发消息→离开会话→断线重连

### 任务 6：CREATE `server/src/handlers/ws.js` — WebSocket 协议处理器

- **IMPLEMENT**：完整的 WS 处理器，调用 `chatLogic.js` 共享业务逻辑

```javascript
// ws.js — 原生 WebSocket 传输层处理器

import { users, socketToUser } from '../store.js'
import { registerWsConnection, removeWsConnection, closeWsConnection, sendToUser } from '../bridge.js'
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

  // 心跳：服务端定期 ping，客户端回 pong
  const heartbeatInterval = setInterval(() => {
    if (ws.readyState === 1) {
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

    if (msg.type === 'pong') return

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

        // 注册 WS 连接到桥接层
        registerWsConnection(userUuid, ws)

        // 踢掉旧连接
        if (result.oldSocketId) {
          // 旧连接是 Socket.io
          if (socketToUser.has(result.oldSocketId)) {
            io.to(result.oldSocketId).emit('force_disconnect', { reason: '账号在其他地方登录' })
            const oldSocket = io.sockets.sockets.get(result.oldSocketId)
            if (oldSocket) oldSocket.disconnect(true)
          }
        }
        // 旧连接可能是 WS（同一 uuid 第二次 WS 连接）
        // registerWsConnection 已覆盖旧的 ws 引用，旧 WS 会因 close 事件自行清理

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
      removeWsConnection(userUuid)
      disconnectLogic(userUuid, io)
    }
  })

  ws.on('error', () => {
    clearInterval(heartbeatInterval)
  })
}
```

- **PATTERN**：与 `chat.js` 对称的薄传输层，所有业务逻辑调用 `chatLogic.js`
- **GOTCHA**：
  - WS 连接用 `null` 作为 `connectionId` 传给 `loginLogic`（`registerUser` 不会将 null 写入 `socketToUser`）
  - `login` 之前的其他事件通过 `if (!userUuid && event !== 'login') return` 忽略
  - 踢旧连接：如果旧连接是 Socket.io（`socketToUser.has(oldSocketId)`），通过 `io` 踢；如果是 WS，`registerWsConnection` 覆盖旧引用
  - 离线消息补发通过 `ws.send` 以 WS 协议格式发送
- **VALIDATE**：
  ```bash
  wscat -c ws://localhost:3000/ws?platform=harmony
  # 发送: {"type":"event","event":"login","data":{"uuid":"test-uuid-001","nickname":"鸿蒙测试"},"ackId":1}
  # 期望: {"type":"ack","ackId":1,"data":{"success":true}}
  ```

### 任务 7：UPDATE `server/src/index.js` — 挂载 WS 端点 + 管理页面支持 WS 用户

- **IMPLEMENT**：

  1. 导入 `ws`、WS 处理器和桥接层：
     ```javascript
     import { WebSocketServer } from 'ws'
     import { handleWsConnection } from './handlers/ws.js'
     import { closeWsConnection, wsConnections, sendToUser } from './bridge.js'
     ```

  2. 在 `httpServer.listen` 之前创建 WS 服务器（第 191 行前）：
     ```javascript
     const wss = new WebSocketServer({ server: httpServer, path: '/ws' })
     wss.on('connection', (ws, req) => {
       handleWsConnection(ws, req, io)
     })
     ```

  3. `platformLabel()` 函数新增 `harmony`（第 49 行）：
     ```javascript
     const map = { desktop: 'Desktop', android: 'Android', web: 'Web', harmony: 'HarmonyOS' }
     ```

  4. **修正管理页面踢出端点**（第 121-168 行），增加 WS 用户踢出逻辑：
     ```javascript
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
           // WS 用户：通过桥接层踢出
           closeWsConnection(uuid, '被管理员踢出')
         }
       }

       // 后续清理逻辑不变...
       // 但第 154 行的 peer 通知也需改用桥接层：
       // io.to(peer.socketId).emit('peer_offline', ...) → sendToUser(peerUuid, 'peer_offline', ..., io)
     ```

- **PATTERN**：参照 `server/src/index.js` 第 15-22 行 Socket.io 初始化风格
- **GOTCHA**：
  - `WebSocketServer` 的 `path: '/ws'` 确保不与 Socket.io 的 `/socket.io/` 路径冲突
  - 管理页面踢出逻辑需要同时处理 Socket.io 和 WS 两种连接
  - 第 154 行 `io.to(peer.socketId).emit('peer_offline')` 需改为 `sendToUser(peerUuid, 'peer_offline', { conversationId: user.conversationId }, io)` 以支持 WS 对端
- **VALIDATE**：
  1. `pnpm dev:server` 启动正常
  2. `wscat -c ws://localhost:3000/ws` 连接成功
  3. Web 客户端照常工作
  4. 管理页面显示 HarmonyOS 平台用户
  5. 管理页面能踢出 WS 连接的用户

### 任务 8：CREATE `server/src/huaweiPush.js` — 华为 Push Kit 封装

- **IMPLEMENT**：

```javascript
// huaweiPush.js

let accessToken = null
let tokenExpiry = 0

const HUAWEI_APP_ID = process.env.HUAWEI_APP_ID
const HUAWEI_APP_SECRET = process.env.HUAWEI_APP_SECRET
const HUAWEI_AUTH_URL = process.env.HUAWEI_AUTH_URL || 'https://oauth-login.cloud.huawei.com/oauth2/v3/token'
const HUAWEI_PUSH_URL = process.env.HUAWEI_PUSH_URL || `https://push-api.cloud.huawei.com/v2/${HUAWEI_APP_ID}/messages:send`

/**
 * 初始化 Push Kit（检查环境变量）
 */
export function initHuaweiPush() {
  if (!HUAWEI_APP_ID || !HUAWEI_APP_SECRET) {
    console.warn('[PushKit] HUAWEI_APP_ID 或 HUAWEI_APP_SECRET 未配置，Push Kit 推送禁用')
    return false
  }
  console.log('[PushKit] 华为 Push Kit 配置就绪')
  return true
}

export function isHuaweiPushEnabled() {
  return !!HUAWEI_APP_ID && !!HUAWEI_APP_SECRET
}

/**
 * 获取 OAuth 2.0 Access Token（自动缓存，过期前 5 分钟刷新）
 */
async function getAccessToken() {
  if (accessToken && Date.now() < tokenExpiry - 300000) {
    return accessToken
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: HUAWEI_APP_ID,
    client_secret: HUAWEI_APP_SECRET
  })

  const res = await fetch(HUAWEI_AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  })

  if (!res.ok) {
    throw new Error(`OAuth token 获取失败: ${res.status} ${await res.text()}`)
  }

  const json = await res.json()
  accessToken = json.access_token
  tokenExpiry = Date.now() + json.expires_in * 1000
  console.log(`[PushKit] Access Token 获取成功，有效期 ${json.expires_in}s`)
  return accessToken
}

/**
 * 发送 Push Kit 推送通知
 * @param {string} token - 目标设备的 Push Token
 * @param {object} payload - { senderNickname, content, conversationId }
 * @returns {Promise<boolean|'token_invalid'>}
 */
export async function sendHuaweiPush(token, { senderNickname, content, conversationId }) {
  if (!isHuaweiPushEnabled() || !token) return false

  try {
    const at = await getAccessToken()
    const truncatedContent = content.length > 100 ? content.slice(0, 100) + '...' : content

    const res = await fetch(HUAWEI_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${at}`
      },
      body: JSON.stringify({
        message: {
          token: [token],
          notification: {
            title: `${senderNickname} 发来消息`,
            body: truncatedContent
          },
          data: JSON.stringify({
            type: 'new_message',
            senderNickname,
            content: truncatedContent,
            conversationId
          }),
          android: {
            notification: {
              click_action: { type: 1 }
            }
          }
        }
      })
    })

    const result = await res.json()
    if (result.code === '80000000') {
      console.log(`[PushKit] 推送成功 → token=${token.slice(0, 20)}...`)
      return true
    }

    // Token 失效处理
    if (result.code === '80100003' || result.code === '80300007') {
      console.log(`[PushKit] token 已失效: ${token.slice(0, 20)}...`)
      return 'token_invalid'
    }

    console.warn(`[PushKit] 推送失败: code=${result.code}, msg=${result.msg}`)
    return false
  } catch (e) {
    console.warn('[PushKit] 推送异常:', e.message)
    return false
  }
}
```

- **PATTERN**：参照 `push.js` 的接口风格（`sendPushNotification` 返回 `true | false | 'token_invalid'`）
- **GOTCHA**：
  - OAuth token 需缓存并在过期前刷新，避免每次推送都请求新 token
  - Push Kit REST API 的成功码是 `'80000000'`（字符串），不是 HTTP 状态码
  - `message.token` 是数组，每次最多 1000 个，但我们只推送给单个设备
- **VALIDATE**：单元级 — `node -e "import('./server/src/huaweiPush.js').then(m => console.log(m.isHuaweiPushEnabled()))"`

### 任务 9：UPDATE `server/src/push.js` — 改造为统一推送路由

- **IMPLEMENT**：
  1. 保持现有 FCM 函数不变
  2. 导入 `huaweiPush.js`：`import { sendHuaweiPush, isHuaweiPushEnabled, initHuaweiPush } from './huaweiPush.js'`
  3. 新增统一推送函数：
     ```javascript
     /**
      * 统一推送入口：根据平台路由到 FCM 或 Push Kit
      * @param {string} token - 推送 token
      * @param {string} platform - 'android' | 'harmony' | 其他
      * @param {object} payload - { senderNickname, content, conversationId }
      */
     export async function sendPush(token, platform, payload) {
       if (platform === 'harmony') {
         return sendHuaweiPush(token, payload)
       }
       return sendPushNotification(token, payload) // 现有 FCM
     }
     ```
  4. 新增统一初始化函数：
     ```javascript
     export function initPush() {
       const fcm = initFirebase()
       const pushkit = initHuaweiPush()
       return { fcm, pushkit }
     }
     ```
  5. 新增统一检查函数：
     ```javascript
     export function isPushEnabled(platform) {
       if (platform === 'harmony') return isHuaweiPushEnabled()
       return isFcmEnabled()
     }
     ```

- **PATTERN**：保持现有导出不变（向后兼容），新增统一函数
- **VALIDATE**：`pnpm dev:server` 启动时日志显示 FCM 和 PushKit 初始化状态

### 任务 10：确认 — 统一推送已在 chatLogic.js 中实现

**此任务已合并到任务 4（chatLogic.js）**。`handleSendMessage` 中已直接使用 `sendPush` 和 `isPushEnabled` 进行统一推送路由，无需单独修改 `chat.js` 的推送调用。

- **确认点**：
  - chatLogic.js 导入了 `import { sendPush, isPushEnabled } from '../push.js'`
  - `handleSendMessage` 中使用 `isPushEnabled(peer.platform)` 而非 `isFcmEnabled()`
  - `handleSendMessage` 中使用 `sendPush(token, peer.platform, payload)` 而非 `sendPushNotification(token, payload)`
- **VALIDATE**：Web 客户端 + Android 客户端跨端聊天仍正常，推送日志显示正确的通道路由

### 任务 11：UPDATE `server/src/index.js` — 初始化统一推送

- **IMPLEMENT**：
  1. 将 `import { initFirebase } from './push.js'` 改为 `import { initPush } from './push.js'`
  2. 将 `initFirebase()` 改为 `initPush()`

- **VALIDATE**：服务端启动日志同时显示 FCM 和 PushKit 初始化状态

### 任务 12：CREATE `harmony/` 项目骨架

- **IMPLEMENT**：创建 HarmonyOS NEXT 项目的完整目录结构和配置文件

**说明**：鸿蒙项目通常通过 DevEco Studio 创建，但核心文件可以手动编写。实际开发时建议用 DevEco Studio 新建项目后，将以下逻辑代码替换进去。以下给出所有需要创建的文件。

**`harmony/oh-package.json5`**：
```json5
{
  "name": "smilemsg",
  "version": "1.0.0",
  "description": "SmileMsg HarmonyOS NEXT 客户端",
  "main": "",
  "author": "",
  "license": "Apache-2.0",
  "dependencies": {},
  "devDependencies": {
    "@ohos/hypium": "1.0.6"
  }
}
```

**`harmony/build-profile.json5`**：
```json5
{
  "app": {
    "signingConfigs": [],
    "products": [
      {
        "name": "default",
        "signingConfig": "default",
        "compatibleSdkVersion": "5.0.0(12)",
        "runtimeOS": "HarmonyOS"
      }
    ]
  },
  "modules": [
    {
      "name": "entry",
      "srcPath": "./entry",
      "targets": [
        {
          "name": "default",
          "applyToProducts": ["default"]
        }
      ]
    }
  ]
}
```

**`harmony/AppScope/app.json5`**：
```json5
{
  "app": {
    "bundleName": "com.smilemsg.harmony",
    "vendor": "SmileMsg",
    "versionCode": 1000000,
    "versionName": "1.0.0",
    "icon": "$media:app_icon",
    "label": "$string:app_name"
  }
}
```

**`harmony/entry/src/main/module.json5`**（关键权限配置）：
```json5
{
  "module": {
    "name": "entry",
    "type": "entry",
    "description": "$string:module_desc",
    "mainElement": "EntryAbility",
    "deviceTypes": ["phone", "tablet"],
    "deliveryWithInstall": true,
    "installationFree": false,
    "pages": "$profile:main_pages",
    "abilities": [
      {
        "name": "EntryAbility",
        "srcEntry": "./ets/entryability/EntryAbility.ets",
        "description": "$string:EntryAbility_desc",
        "icon": "$media:app_icon",
        "label": "$string:EntryAbility_label",
        "startWindowIcon": "$media:app_icon",
        "startWindowBackground": "$color:start_window_background",
        "exported": true,
        "skills": [
          {
            "entities": ["entity.system.home"],
            "actions": ["action.system.home"]
          }
        ]
      }
    ],
    "requestPermissions": [
      {
        "name": "ohos.permission.INTERNET"
      },
      {
        "name": "ohos.permission.KEEP_BACKGROUND_RUNNING",
        "reason": "$string:permission_background_reason"
      },
      {
        "name": "ohos.permission.VIBRATE"
      }
    ]
  }
}
```

**`harmony/entry/src/main/resources/base/profile/main_pages.json`**：
```json
{
  "src": [
    "pages/Index"
  ]
}
```

- **GOTCHA**：
  - `harmony/` 不纳入 `pnpm-workspace.yaml`，使用 ohpm 独立管理
  - `compatibleSdkVersion` 设为 API 12（HarmonyOS NEXT 5.0），确保兼容性
  - 权限声明中 `INTERNET` 是网络访问必需，`VIBRATE` 是振动必需
- **VALIDATE**：目录结构完整，JSON5 文件语法正确

### 任务 13：CREATE `harmony/entry/src/main/ets/common/Constants.ets` — 常量定义

- **IMPLEMENT**：

```typescript
// Constants.ets

export class Constants {
  // 服务器地址
  static readonly SERVER_URL_DEV: string = 'ws://localhost:3000/ws?platform=harmony'
  static readonly SERVER_URL_PROD: string = 'wss://smile-msg.zeabur.app/ws?platform=harmony'

  // 根据构建类型选择（开发时可切换）
  static readonly SERVER_URL: string = Constants.SERVER_URL_PROD

  // 消息上限
  static readonly MAX_MESSAGES: number = 200

  // 重连配置
  static readonly RECONNECT_DELAY_INITIAL: number = 1000
  static readonly RECONNECT_DELAY_MAX: number = 5000

  // 心跳间隔
  static readonly HEARTBEAT_INTERVAL: number = 25000

  // 本地存储 key
  static readonly STORE_UUID: string = 'session_uuid'
  static readonly STORE_NICKNAME: string = 'session_nickname'
}
```

- **VALIDATE**：文件语法正确

### 任务 14：CREATE `harmony/entry/src/main/ets/common/StorageHelper.ets` — 本地持久化

- **IMPLEMENT**：

```typescript
// StorageHelper.ets
import preferences from '@ohos.data.preferences'
import { Constants } from './Constants'
import { common } from '@kit.AbilityKit'

const PREFERENCES_NAME = 'smilemsg_prefs'

let prefs: preferences.Preferences | null = null

export async function initPreferences(context: common.UIAbilityContext): Promise<void> {
  prefs = await preferences.getPreferences(context, PREFERENCES_NAME)
}

export async function saveSession(uuid: string, nickname: string): Promise<void> {
  if (!prefs) return
  await prefs.put(Constants.STORE_UUID, uuid)
  await prefs.put(Constants.STORE_NICKNAME, nickname)
  await prefs.flush()
}

export async function loadSession(): Promise<{ uuid: string, nickname: string } | null> {
  if (!prefs) return null
  const uuid = await prefs.get(Constants.STORE_UUID, '') as string
  const nickname = await prefs.get(Constants.STORE_NICKNAME, '') as string
  if (uuid && nickname) {
    return { uuid, nickname }
  }
  return null
}

export async function clearSession(): Promise<void> {
  if (!prefs) return
  await prefs.delete(Constants.STORE_UUID)
  await prefs.delete(Constants.STORE_NICKNAME)
  await prefs.flush()
}
```

- **PATTERN**：对标 Android 版 `useNativeFeatures.js` 第 43-62 行的 `saveSession/loadSession/clearSession`
- **VALIDATE**：文件语法正确

### 任务 15：CREATE `harmony/entry/src/main/ets/common/AppState.ets` — 全局状态管理

- **IMPLEMENT**：

```typescript
// AppState.ets — 使用 AppStorage 实现跨页面共享的全局响应式状态

// 初始化 AppStorage 默认值（在 EntryAbility.onCreate 中调用）
export function initAppState(): void {
  AppStorage.setOrCreate('connected', false)
  AppStorage.setOrCreate('myUuid', '')
  AppStorage.setOrCreate('myNickname', '')
  AppStorage.setOrCreate('peerNickname', '')
  AppStorage.setOrCreate('conversationId', '')
  AppStorage.setOrCreate('phase', 'login')         // 'login' | 'idle' | 'chat'
  AppStorage.setOrCreate('peerIsOffline', false)
  AppStorage.setOrCreate('errorMsg', '')
  AppStorage.setOrCreate('loading', false)
  AppStorage.setOrCreate('messages', '[]')          // JSON 字符串存储消息数组
}

// 消息对象接口
export interface ChatMessage {
  id: string
  senderUuid?: string
  senderNickname?: string
  content: string
  timestamp?: number
  type: string                                      // 'text' | 'system'
}

// 消息列表操作辅助函数
export function getMessages(): ChatMessage[] {
  const raw = AppStorage.get<string>('messages') || '[]'
  return JSON.parse(raw) as ChatMessage[]
}

export function setMessages(msgs: ChatMessage[]): void {
  AppStorage.set('messages', JSON.stringify(msgs))
}

export function addMessage(msg: ChatMessage, maxMessages: number = 200): void {
  const msgs = getMessages()
  msgs.push(msg)
  if (msgs.length > maxMessages) {
    setMessages(msgs.slice(-maxMessages))
  } else {
    setMessages(msgs)
  }
}

export function clearMessages(): void {
  setMessages([])
}
```

- **PATTERN**：对标 Android 版 `useSocket.js` 第 25-34 行的 Vue ref 状态
- **GOTCHA**：
  - ArkUI 的 `AppStorage` 支持 `@StorageLink` 装饰器实现双向绑定
  - 消息数组需序列化为 JSON 字符串存入 AppStorage（不支持复杂对象数组直接存储）
  - 页面中使用 `@StorageLink('phase') phase: string = 'login'` 实现自动响应
- **VALIDATE**：文件语法正确

### 任务 16：CREATE `harmony/entry/src/main/ets/common/SocketService.ets` — WebSocket 通信核心

- **IMPLEMENT**：

```typescript
// SocketService.ets — 单例 WebSocket 通信层

import { webSocket } from '@kit.NetworkKit'
import { BusinessError } from '@kit.BasicServicesKit'
import { util } from '@kit.ArkTS'
import { Constants } from './Constants'
import {
  initAppState, addMessage, clearMessages, setMessages, getMessages,
  ChatMessage
} from './AppState'

let ws: webSocket.WebSocket | null = null
let ackCounter: number = 0
let ackCallbacks: Map<number, (data: object) => void> = new Map()
let reconnectTimer: number = -1
let reconnectDelay: number = Constants.RECONNECT_DELAY_INITIAL
let isDestroyed: boolean = false

/**
 * 生成 UUID v4
 */
function generateUuid(): string {
  return util.generateRandomUUID(true)
}

/**
 * 获取或创建 UUID
 */
export function getOrCreateUuid(): string {
  let uuid = AppStorage.get<string>('myUuid') || ''
  if (!uuid) {
    uuid = generateUuid()
    AppStorage.set('myUuid', uuid)
  }
  return uuid
}

/**
 * 发送 JSON 消息到 WebSocket
 */
function wsSend(msg: object): void {
  if (ws) {
    ws.send(JSON.stringify(msg))
  }
}

/**
 * 发送带 ACK 的事件，返回 Promise
 */
function emitWithAck(event: string, data: object): Promise<object> {
  return new Promise((resolve, reject) => {
    const ackId = ++ackCounter
    ackCallbacks.set(ackId, resolve)
    wsSend({ type: 'event', event, data, ackId })

    // 10 秒超时
    setTimeout(() => {
      if (ackCallbacks.has(ackId)) {
        ackCallbacks.delete(ackId)
        reject(new Error('ACK timeout'))
      }
    }, 10000)
  })
}

/**
 * 发送无需 ACK 的事件
 */
function emit(event: string, data: object): void {
  wsSend({ type: 'event', event, data })
}

// 注意：不需要客户端主动心跳定时器
// 服务端每 10 秒发 { type: 'ping' }，客户端在 handleMessage 中被动回复 { type: 'pong' }

/**
 * 处理服务端消息
 */
function handleMessage(raw: string | ArrayBuffer): void {
  let msg: Record<string, Object>
  try {
    const text = typeof raw === 'string' ? raw : new util.TextDecoder().decodeWithStream(new Uint8Array(raw as ArrayBuffer))
    msg = JSON.parse(text) as Record<string, Object>
  } catch {
    return
  }

  const type = msg['type'] as string

  // 心跳
  if (type === 'ping') {
    wsSend({ type: 'pong' })
    return
  }

  // ACK 响应
  if (type === 'ack') {
    const ackId = msg['ackId'] as number
    const callback = ackCallbacks.get(ackId)
    if (callback) {
      ackCallbacks.delete(ackId)
      callback(msg['data'] as object)
    }
    return
  }

  // 事件
  if (type === 'event') {
    const event = msg['event'] as string
    const data = msg['data'] as Record<string, Object>
    handleServerEvent(event, data)
  }
}

/**
 * 处理服务端推送事件
 */
function handleServerEvent(event: string, data: Record<string, Object>): void {
  switch (event) {
    case 'new_message': {
      const convId = data['conversationId'] as string
      const message = data['message'] as ChatMessage
      if (convId === AppStorage.get<string>('conversationId')) {
        addMessage(message)
        // 触发原生反馈（振动/通知）
        onNewMessageReceived(message)
      }
      break
    }
    case 'conversation_created': {
      const convId = data['conversationId'] as string
      const target = data['target'] as Record<string, string>
      AppStorage.set('conversationId', convId)
      AppStorage.set('peerNickname', target['nickname'] || '')
      AppStorage.set('phase', 'chat')
      AppStorage.set('peerIsOffline', false)
      clearMessages()
      // 被动接收邀请时振动
      onConversationCreated()
      break
    }
    case 'peer_offline': {
      const convId = data['conversationId'] as string
      if (convId === AppStorage.get<string>('conversationId')) {
        AppStorage.set('peerIsOffline', true)
        addMessage({
          id: `sys_${Date.now()}`,
          type: 'system',
          content: '对方已离线'
        })
      }
      break
    }
    case 'force_disconnect': {
      destroyAndReset()
      break
    }
  }
}

// 原生反馈回调（由 NativeHelper 注册）
let onNewMessageCallback: ((msg: ChatMessage) => void) | null = null
let onConversationCreatedCallback: (() => void) | null = null

export function setOnNewMessageCallback(cb: (msg: ChatMessage) => void): void {
  onNewMessageCallback = cb
}

export function setOnConversationCreatedCallback(cb: () => void): void {
  onConversationCreatedCallback = cb
}

function onNewMessageReceived(msg: ChatMessage): void {
  if (onNewMessageCallback) onNewMessageCallback(msg)
}

function onConversationCreated(): void {
  if (onConversationCreatedCallback) onConversationCreatedCallback()
}

/**
 * 初始化 WebSocket 连接
 */
export function initSocket(): void {
  if (isDestroyed) return
  if (ws) return

  ws = webSocket.createWebSocket()

  ws.on('open', () => {
    console.info('[WS] 连接已建立')
    AppStorage.set('connected', true)
    reconnectDelay = Constants.RECONNECT_DELAY_INITIAL

    // 断线重连时自动重新登录
    const nickname = AppStorage.get<string>('myNickname') || ''
    if (nickname) {
      autoReLogin()
    }
  })

  ws.on('message', (err: BusinessError, data: string | ArrayBuffer) => {
    if (!err) {
      handleMessage(data)
    }
  })

  ws.on('close', () => {
    console.info('[WS] 连接关闭')
    AppStorage.set('connected', false)
    ws = null
    scheduleReconnect()
  })

  ws.on('error', (err: BusinessError) => {
    console.error('[WS] 连接错误:', err.message)
  })

  ws.connect(Constants.SERVER_URL)
}

/**
 * 指数退避重连
 */
function scheduleReconnect(): void {
  if (isDestroyed) return
  if (reconnectTimer !== -1) return

  console.info(`[WS] ${reconnectDelay}ms 后重连...`)
  reconnectTimer = setTimeout(() => {
    reconnectTimer = -1
    if (!isDestroyed && !ws) {
      initSocket()
    }
  }, reconnectDelay)

  reconnectDelay = Math.min(reconnectDelay * 1.5, Constants.RECONNECT_DELAY_MAX)
}

/**
 * 自动重新登录（重连后）
 */
async function autoReLogin(): Promise<void> {
  const uuid = AppStorage.get<string>('myUuid') || ''
  const nickname = AppStorage.get<string>('myNickname') || ''
  if (!uuid || !nickname) return

  try {
    const res = await emitWithAck('login', { uuid, nickname }) as Record<string, Object>
    if (res['success']) {
      if (res['restored']) {
        AppStorage.set('conversationId', (res['conversationId'] as string) || '')
        const target = res['target'] as Record<string, string> | null
        AppStorage.set('peerNickname', target?.['nickname'] || '')
        AppStorage.set('phase', target ? 'chat' : 'idle')
        AppStorage.set('peerIsOffline', false)
      }
      // 重连成功后重新注册 Push Token
      registerPushTokenIfAvailable()
    }
  } catch (e) {
    console.error('[WS] 自动登录失败:', (e as Error).message)
  }
}

/**
 * 注册 Push Token（由 PushHelper 调用）
 */
let cachedPushToken: string = ''

export function setCachedPushToken(token: string): void {
  cachedPushToken = token
}

function registerPushTokenIfAvailable(): void {
  if (cachedPushToken) {
    emit('register_push_token', { token: cachedPushToken })
  }
}

// ========== 业务方法（供 UI 调用）==========

/**
 * 登录
 */
export async function login(nickname: string): Promise<{ success: boolean, error?: string }> {
  AppStorage.set('errorMsg', '')
  AppStorage.set('loading', true)
  const uuid = getOrCreateUuid()

  initSocket()

  // 等待连接建立
  if (!AppStorage.get<boolean>('connected')) {
    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (AppStorage.get<boolean>('connected')) {
          clearInterval(check)
          resolve()
        }
      }, 100)
      // 10 秒超时
      setTimeout(() => { clearInterval(check); resolve() }, 10000)
    })
  }

  try {
    const res = await emitWithAck('login', { uuid, nickname: nickname.trim() }) as Record<string, Object>
    AppStorage.set('loading', false)

    if (res['success']) {
      AppStorage.set('myNickname', nickname.trim())
      if (res['restored']) {
        AppStorage.set('conversationId', (res['conversationId'] as string) || '')
        const target = res['target'] as Record<string, string> | null
        AppStorage.set('peerNickname', target?.['nickname'] || '')
        AppStorage.set('phase', target ? 'chat' : 'idle')
        AppStorage.set('peerIsOffline', false)
      } else {
        AppStorage.set('phase', 'idle')
      }
      return { success: true }
    } else {
      AppStorage.set('errorMsg', (res['error'] as string) || '登录失败')
      return { success: false, error: res['error'] as string }
    }
  } catch (e) {
    AppStorage.set('loading', false)
    AppStorage.set('errorMsg', '连接超时')
    return { success: false, error: '连接超时' }
  }
}

/**
 * 发起私聊
 */
export async function createChat(targetNickname: string): Promise<{ success: boolean, error?: string }> {
  AppStorage.set('errorMsg', '')
  AppStorage.set('loading', true)

  try {
    const res = await emitWithAck('create_private_chat', {
      targetNickname: targetNickname.trim()
    }) as Record<string, Object>
    AppStorage.set('loading', false)

    if (res['success']) {
      AppStorage.set('conversationId', (res['conversationId'] as string) || '')
      const target = res['target'] as Record<string, string>
      AppStorage.set('peerNickname', target['nickname'] || '')
      AppStorage.set('phase', 'chat')
      AppStorage.set('peerIsOffline', false)
      clearMessages()
      return { success: true }
    } else {
      AppStorage.set('errorMsg', (res['error'] as string) || '连接失败')
      return { success: false, error: res['error'] as string }
    }
  } catch (e) {
    AppStorage.set('loading', false)
    return { success: false, error: '操作超时' }
  }
}

/**
 * 发送消息
 */
export function sendMessage(content: string): void {
  const convId = AppStorage.get<string>('conversationId') || ''
  if (!content || !content.trim() || !convId) return
  emit('send_message', { conversationId: convId, content })
}

/**
 * 离开会话
 */
export function leaveConversation(): void {
  const convId = AppStorage.get<string>('conversationId') || ''
  if (!convId) return
  emit('leave_conversation', { conversationId: convId })
  AppStorage.set('conversationId', '')
  AppStorage.set('peerNickname', '')
  AppStorage.set('phase', 'idle')
  AppStorage.set('peerIsOffline', false)
  clearMessages()
}

/**
 * 主动退出（断开连接 + 清理状态）
 */
export function disconnect(): void {
  destroyAndReset()
}

/**
 * 通知服务端前后台状态
 */
export function notifyAppState(inBackground: boolean): void {
  emit('app_state', { inBackground })
}

/**
 * 彻底销毁连接并重置状态
 */
export function destroyAndReset(): void {
  isDestroyed = true
  if (reconnectTimer !== -1) {
    clearTimeout(reconnectTimer)
    reconnectTimer = -1
  }
  ackCallbacks.clear()
  if (ws) {
    ws.close()
    ws = null
  }
  AppStorage.set('connected', false)
  AppStorage.set('myUuid', '')
  AppStorage.set('myNickname', '')
  AppStorage.set('peerNickname', '')
  AppStorage.set('conversationId', '')
  AppStorage.set('phase', 'login')
  AppStorage.set('peerIsOffline', false)
  AppStorage.set('errorMsg', '')
  AppStorage.set('loading', false)
  clearMessages()
  // 允许后续重新初始化
  isDestroyed = false
}

/**
 * App 回到前台时检查连接
 */
export function reconnectIfNeeded(): void {
  if (!ws && AppStorage.get<string>('myNickname')) {
    isDestroyed = false
    initSocket()
  }
}
```

- **PATTERN**：对标 Android `useSocket.js` 的完整功能集
- **IMPORTS**：`@kit.NetworkKit`（webSocket）、`@kit.ArkTS`（util）、`@kit.BasicServicesKit`（BusinessError）
- **GOTCHA**：
  - HarmonyOS WebSocket `on('message')` 回调签名为 `(err: BusinessError, data: string | ArrayBuffer)`
  - `webSocket.createWebSocket()` 创建实例后需调用 `.connect(url)` 连接
  - `AppStorage` 的值变更会自动通知使用 `@StorageLink` 的 UI 组件
  - WebSocket 关闭后不可复用，需重新 `createWebSocket()`
- **VALIDATE**：编译检查，连接 `ws://localhost:3000/ws` 测试

### 任务 17：CREATE `harmony/entry/src/main/ets/common/NativeHelper.ets` — 原生能力封装

- **IMPLEMENT**：

```typescript
// NativeHelper.ets — 振动和通知

import { vibrator } from '@kit.SensorServiceKit'

/**
 * 消息振动反馈
 */
export function vibrateOnMessage(): void {
  try {
    vibrator.startVibration({
      type: 'time',
      duration: 100
    }, {
      id: 0,
      usage: 'notification'
    })
  } catch (e) {
    console.error('[vibrate] 振动失败:', (e as Error).message)
  }
}
```

- **PATTERN**：对标 Android `useNativeFeatures.js` 第 9-11 行的 `vibrateOnMessage`
- **VALIDATE**：文件语法正确

### 任务 18：CREATE `harmony/entry/src/main/ets/common/PushHelper.ets` — Push Kit 封装

- **IMPLEMENT**：

```typescript
// PushHelper.ets — 华为 Push Kit Token 获取

import { pushService } from '@kit.PushKit'
import { BusinessError } from '@kit.BasicServicesKit'
import { setCachedPushToken } from './SocketService'

/**
 * 获取 Push Token 并缓存
 */
export async function initPushToken(): Promise<string | null> {
  try {
    const token: string = await pushService.getToken()
    console.info('[Push] Token 获取成功:', token.substring(0, 20) + '...')
    setCachedPushToken(token)
    return token
  } catch (err) {
    const e = err as BusinessError
    console.error('[Push] Token 获取失败:', e.code, e.message)
    return null
  }
}

/**
 * 注册 Push Token 到服务端（登录成功后调用）
 */
export function registerPushToken(): void {
  initPushToken().catch((e: Error) => {
    console.error('[Push] registerPushToken 异常:', e.message)
  })
}
```

- **PATTERN**：对标 Android `useNativeFeatures.js` 第 167-175 行的 `getFcmToken`
- **GOTCHA**：
  - `pushService.getToken()` 需要在 AGC（AppGallery Connect）中正确配置应用，否则会报错
  - Token 可能在设备重置或应用重装后变化，需要在每次启动时重新获取
- **VALIDATE**：文件语法正确

### 任务 19：CREATE `harmony/entry/src/main/ets/pages/LoginPage.ets` — 登录页面

- **IMPLEMENT**：

```typescript
// LoginPage.ets

import { login } from '../common/SocketService'

@Component
export struct LoginPage {
  @StorageLink('errorMsg') errorMsg: string = ''
  @StorageLink('loading') loading: boolean = false
  @State nickname: string = ''

  build() {
    Column() {
      Text('SmileMsg')
        .fontSize(28)
        .fontWeight(FontWeight.Bold)
        .fontColor('#1f2937')
        .margin({ bottom: 40 })

      TextInput({ placeholder: '输入你的昵称', text: this.nickname })
        .width('80%')
        .height(44)
        .maxLength(20)
        .enabled(!this.loading)
        .onChange((value: string) => {
          this.nickname = value
        })
        .onSubmit(() => {
          this.handleLogin()
        })

      if (this.errorMsg) {
        Text(this.errorMsg)
          .fontSize(14)
          .fontColor('#ef4444')
          .margin({ top: 8 })
      }

      Button(this.loading ? '登录中...' : '登录')
        .width('80%')
        .height(44)
        .margin({ top: 16 })
        .backgroundColor('#3b82f6')
        .enabled(!this.loading && this.nickname.trim().length > 0)
        .onClick(() => {
          this.handleLogin()
        })
    }
    .width('100%')
    .height('100%')
    .justifyContent(FlexAlign.Center)
    .alignItems(HorizontalAlign.Center)
    .backgroundColor('#ffffff')
  }

  async handleLogin(): Promise<void> {
    if (!this.nickname.trim() || this.nickname.length > 20) return
    await login(this.nickname)
  }
}
```

- **PATTERN**：对标 Web `LoginView.vue` 的布局和交互逻辑
- **VALIDATE**：编译检查

### 任务 20：CREATE `harmony/entry/src/main/ets/pages/ChatPage.ets` — 聊天页面

- **IMPLEMENT**：

```typescript
// ChatPage.ets — idle 态（输入对方昵称）+ chat 态（消息列表+输入框）

import { createChat, sendMessage, leaveConversation } from '../common/SocketService'
import { getMessages, ChatMessage } from '../common/AppState'

@Component
export struct ChatPage {
  @StorageLink('phase') phase: string = 'idle'
  @StorageLink('peerNickname') peerNickname: string = ''
  @StorageLink('peerIsOffline') peerIsOffline: boolean = false
  @StorageLink('errorMsg') errorMsg: string = ''
  @StorageLink('loading') loading: boolean = false
  @StorageLink('messages') messagesJson: string = '[]'
  @StorageLink('myUuid') myUuid: string = ''

  @State targetInput: string = ''
  @State messageInput: string = ''

  private scroller: Scroller = new Scroller()

  build() {
    Column() {
      // 顶部栏
      Row() {
        if (this.phase === 'idle') {
          TextInput({ placeholder: '输入对方昵称', text: this.targetInput })
            .layoutWeight(1)
            .height(36)
            .maxLength(20)
            .enabled(!this.loading)
            .onChange((value: string) => { this.targetInput = value })
            .onSubmit(() => { this.handleConnect() })

          Button(this.loading ? '连接中...' : '连接')
            .height(36)
            .margin({ left: 8 })
            .backgroundColor('#3b82f6')
            .enabled(!this.loading && this.targetInput.trim().length > 0)
            .onClick(() => { this.handleConnect() })
        } else {
          Text(this.peerNickname)
            .layoutWeight(1)
            .fontSize(16)
            .fontWeight(FontWeight.Medium)
            .fontColor('#1f2937')

          Button('断开')
            .height(36)
            .backgroundColor('#e5e7eb')
            .fontColor('#374151')
            .onClick(() => { leaveConversation() })
        }
      }
      .width('100%')
      .padding(12)
      .borderWidth({ bottom: 1 })
      .borderColor('#e5e7eb')

      // 错误提示
      if (this.errorMsg && this.phase === 'idle') {
        Text(this.errorMsg)
          .fontSize(13)
          .fontColor('#ef4444')
          .padding({ left: 12, top: 4 })
      }

      // 消息列表
      List({ scroller: this.scroller }) {
        ForEach(this.parsedMessages, (msg: ChatMessage) => {
          ListItem() {
            if (msg.type === 'system') {
              // 系统消息
              Row() {
                Text(`—— ${msg.content} ——`)
                  .fontSize(13)
                  .fontColor('#9ca3af')
              }.width('100%').justifyContent(FlexAlign.Center)
            } else if (msg.senderUuid !== this.myUuid) {
              // 对方消息
              Row() {
                Text(msg.content)
                  .fontSize(15)
                  .fontColor('#1f2937')
                  .padding(10)
                  .backgroundColor('#f3f4f6')
                  .borderRadius(12)
                  .constraintSize({ maxWidth: '70%' })
              }.width('100%').justifyContent(FlexAlign.Start)
            } else {
              // 我的消息
              Row() {
                Text(msg.content)
                  .fontSize(15)
                  .fontColor('#ffffff')
                  .padding(10)
                  .backgroundColor('#3b82f6')
                  .borderRadius(12)
                  .constraintSize({ maxWidth: '70%' })
              }.width('100%').justifyContent(FlexAlign.End)
            }
          }.padding({ left: 16, right: 16, top: 4, bottom: 4 })
        }, (msg: ChatMessage): string => msg.id)  // keyGenerator 确保列表性能
      }
      .layoutWeight(1)
      .onReachEnd(() => {})  // 占位，防止编译器警告

      // 输入区域
      Row() {
        TextInput({ placeholder: '输入消息...', text: this.messageInput })
          .layoutWeight(1)
          .height(40)
          .enabled(this.phase === 'chat' && !this.peerIsOffline)
          .onChange((value: string) => { this.messageInput = value })
          .onSubmit(() => { this.handleSend() })

        Button('发送')
          .height(40)
          .margin({ left: 8 })
          .backgroundColor('#3b82f6')
          .enabled(this.phase === 'chat' && !this.peerIsOffline && this.messageInput.trim().length > 0)
          .onClick(() => { this.handleSend() })
      }
      .width('100%')
      .padding(12)
      .borderWidth({ top: 1 })
      .borderColor('#e5e7eb')
    }
    .width('100%')
    .height('100%')
    .backgroundColor('#ffffff')
  }

  get parsedMessages(): ChatMessage[] {
    try {
      return JSON.parse(this.messagesJson) as ChatMessage[]
    } catch {
      return []
    }
  }

  // 消息列表变化时自动滚动到底部
  onMessagesChange(): void {
    const msgs = this.parsedMessages
    if (msgs.length > 0) {
      setTimeout(() => {
        this.scroller.scrollToIndex(msgs.length - 1)
      }, 50)
    }
  }

  aboutToAppear(): void {
    // 初始化时也滚动到底部
    this.onMessagesChange()
  }

  async handleConnect(): Promise<void> {
    if (!this.targetInput.trim() || this.targetInput.length > 20) return
    await createChat(this.targetInput)
  }

  handleSend(): void {
    const content = this.messageInput
    if (!content.trim()) return
    sendMessage(content)
    this.messageInput = ''
  }
}
```

- **PATTERN**：对标 Web `ChatView.vue` 的布局结构（顶部栏+消息列表+输入框）
- **GOTCHA**：
  - `@StorageLink('messages')` 绑定 JSON 字符串，通过 getter `parsedMessages` 解析
  - `ForEach` 第三参数 `keyGenerator` 使用 `msg.id`，确保列表增量更新而非全量重渲染
  - `onMessagesChange()` 通过 `Scroller.scrollToIndex()` 在新消息到达时自动滚动到底部
  - ArkUI 的 `@StorageLink` 会在值变化时触发组件重绘，`messagesJson` 变化会自动触发 `parsedMessages` getter 重新计算
  - 实际开发中需验证 `@StorageLink` 变化是否能触发 `onMessagesChange` 的调用时机，可能需要用 `@Watch` 装饰器监听 `messagesJson` 变化
- **VALIDATE**：编译检查，发送多条消息后消息列表自动滚动到底部

### 任务 21：CREATE `harmony/entry/src/main/ets/pages/Index.ets` — 主页面路由

- **IMPLEMENT**：

```typescript
// Index.ets — 根据 phase 状态切换 LoginPage 和 ChatPage

import { LoginPage } from './LoginPage'
import { ChatPage } from './ChatPage'
import { disconnect, leaveConversation, tryRestoreSession } from '../common/SocketService'

// tryRestoreSession 在 SocketService 中定义
// 需要在 SocketService 中新增此函数

@Entry
@Component
struct Index {
  @StorageLink('phase') phase: string = 'login'

  aboutToAppear(): void {
    // 尝试恢复会话
    tryRestoreSession()
  }

  // 返回手势/返回键处理
  onBackPress(): boolean {
    if (this.phase === 'chat') {
      leaveConversation()
      return true  // 拦截返回
    } else if (this.phase === 'idle') {
      disconnect()
      return true
    }
    return false   // 默认行为（退出应用）
  }

  build() {
    Stack() {
      if (this.phase === 'login') {
        LoginPage()
      } else {
        ChatPage()
      }
    }
    .width('100%')
    .height('100%')
  }
}
```

- **PATTERN**：对标 Android `App.vue` 的 phase 状态机路由和返回键处理
- **VALIDATE**：编译检查

### 任务 22：CREATE `harmony/entry/src/main/ets/entryability/EntryAbility.ets` — UIAbility 入口

- **IMPLEMENT**：

```typescript
// EntryAbility.ets

import { AbilityConstant, UIAbility, Want } from '@kit.AbilityKit'
import { hilog } from '@kit.PerformanceAnalysisKit'
import { window } from '@kit.ArkUI'
import { initAppState } from '../common/AppState'
import { initPreferences } from '../common/StorageHelper'
import { registerPushToken } from '../common/PushHelper'
import { notifyAppState, reconnectIfNeeded } from '../common/SocketService'

export default class EntryAbility extends UIAbility {

  async onCreate(want: Want, launchParam: AbilityConstant.LaunchParam): Promise<void> {
    hilog.info(0x0000, 'SmileMsg', 'onCreate')

    // 初始化全局状态
    initAppState()

    // 初始化本地存储
    await initPreferences(this.context)

    // 初始化 Push Kit（获取 Token）
    registerPushToken()
  }

  onWindowStageCreate(windowStage: window.WindowStage): void {
    hilog.info(0x0000, 'SmileMsg', 'onWindowStageCreate')
    windowStage.loadContent('pages/Index')
  }

  onForeground(): void {
    hilog.info(0x0000, 'SmileMsg', 'onForeground')
    notifyAppState(false)
    reconnectIfNeeded()
  }

  onBackground(): void {
    hilog.info(0x0000, 'SmileMsg', 'onBackground')
    notifyAppState(true)
  }

  onDestroy(): void {
    hilog.info(0x0000, 'SmileMsg', 'onDestroy')
  }
}
```

- **PATTERN**：对标 Android `main.js` 的初始化流程（通知渠道→权限→生命周期→挂载）
- **GOTCHA**：
  - `onCreate` 中初始化全局状态和存储必须在 `loadContent` 之前
  - `onForeground` / `onBackground` 对应 Android 的 `resume` / `pause` 生命周期
  - Push Token 获取是异步的，不阻塞 UI 加载
- **VALIDATE**：编译检查

### 任务 23：UPDATE `harmony/entry/src/main/ets/common/SocketService.ets` — 补充 tryRestoreSession

- **IMPLEMENT**：在 `SocketService.ets` 中新增：

```typescript
import { loadSession, saveSession, clearSession } from './StorageHelper'
import { registerPushToken } from './PushHelper'

/**
 * 尝试从本地持久化恢复会话
 */
export async function tryRestoreSession(): Promise<void> {
  const session = await loadSession()
  if (!session) return

  // 恢复 UUID 和昵称
  AppStorage.set('myUuid', session.uuid)
  const result = await login(session.nickname)
  if (result.success) {
    // 登录成功后持久化并注册推送
    await saveSession(session.uuid, session.nickname)
    registerPushToken()
  } else {
    // 恢复失败，清除持久化数据
    await clearSession()
    AppStorage.set('myUuid', '')
  }
}
```

同时在 `login` 函数成功分支中添加：
```typescript
// 登录成功后持久化
saveSession(uuid, nickname.trim())
registerPushToken()
```

在 `disconnect` 函数中添加：
```typescript
clearSession()
```

- **PATTERN**：对标 Android `useSocket.js` 第 370-382 行的 `tryRestoreSession`
- **VALIDATE**：编译检查

### 任务 24：集成 NativeHelper 回调到 SocketService

- **IMPLEMENT**：在 `EntryAbility.ets` 的 `onCreate` 中添加：

```typescript
import { vibrateOnMessage } from '../common/NativeHelper'
import { setOnNewMessageCallback, setOnConversationCreatedCallback } from '../common/SocketService'

// 注册原生反馈回调
setOnNewMessageCallback((msg) => {
  // TODO: 判断前后台，前台振动，后台由 Push Kit 处理通知
  vibrateOnMessage()
})

setOnConversationCreatedCallback(() => {
  vibrateOnMessage()
})
```

- **PATTERN**：对标 Android `useSocket.js` 第 51-71 行的 `onNewMessage`
- **VALIDATE**：编译检查

---

## 测试策略

### 单元测试

本项目无测试框架配置，以手动验证为主。

### 集成测试

**服务端双通道验证**：
1. Web 客户端（Socket.io）+ 鸿蒙模拟器（WebSocket）跨端聊天
2. 两个 Web 客户端验证 Socket.io 功能不受影响
3. WebSocket 客户端断线重连 + 会话恢复

**推送验证**：
1. 鸿蒙客户端后台时收到 Push Kit 推送
2. Android 客户端后台时收到 FCM 推送（不受影响）

### 边缘情况

- WebSocket 连接中途断开（拔网线/切换网络）→ 指数退避重连
- 两个用户一个在 Socket.io 一个在 WebSocket → 互发消息正常
- Push Kit token 失效 → 服务端清理无效 token
- 登录后立即断网 → 重连后自动恢复
- 两台设备用同一 UUID 登录 → 踢掉旧连接

---

## 验证命令

### 级别 1：服务端语法检查

```bash
node -e "import('./server/src/index.js')" 2>&1 | head -5
```

### 级别 2：服务端功能验证

```bash
# 启动服务端
pnpm dev:server

# 终端 1：WebSocket 连接测试
# 安装 wscat: npm install -g wscat
wscat -c ws://localhost:3000/ws?platform=harmony

# 发送登录消息：
# {"type":"event","event":"login","data":{"uuid":"test-uuid-001","nickname":"鸿蒙测试"},"ackId":1}
# 期望收到 ACK：{"type":"ack","ackId":1,"data":{"success":true}}
```

### 级别 3：跨端集成验证

```bash
# 终端 1：启动服务端
pnpm dev:server

# 终端 2：Web 客户端
pnpm dev:web
# 用浏览器打开 http://localhost:5173，以"小明"登录

# 终端 3：WebSocket 模拟鸿蒙客户端
wscat -c ws://localhost:3000/ws?platform=harmony
# 登录为"小红"
# {"type":"event","event":"login","data":{"uuid":"harmony-uuid-001","nickname":"小红"},"ackId":1}
# 发起聊天
# {"type":"event","event":"create_private_chat","data":{"targetNickname":"小明"},"ackId":2}
# 发送消息
# {"type":"event","event":"send_message","data":{"conversationId":"<从ack获取>","content":"你好"}}
```

### 级别 3.5：管理页面 + WS 用户验证

```bash
# 在级别 3 的基础上，验证管理页面：
# 1. 访问 http://localhost:3000/admin
# 2. 确认"小红"显示为 HarmonyOS 平台
# 3. 点击"小红"的踢出按钮
# 4. wscat 终端应收到 force_disconnect 事件并断开
# 5. 刷新管理页面，确认"小红"已被移除
```

### 级别 4：手动验证

1. 鸿蒙模拟器/真机安装 App
2. 输入昵称登录，验证进入 idle 界面
3. 用另一端（Web/Android）向其发起聊天
4. 双向收发消息，验证消息列表正确显示
5. App 切后台 → 另一端发消息 → 验证收到推送通知
6. 杀掉 App → 重新打开 → 验证自动恢复登录
7. 返回手势测试：chat→idle→login

---

## 验收标准

- [ ] 服务端新增 `/ws` WebSocket 端点，支持 JSON 消息协议
- [ ] 现有 Socket.io 客户端（Web/Desktop/Android）功能不受影响
- [ ] Socket.io 客户端与 WebSocket 客户端可互相聊天
- [ ] 服务端支持 Push Kit 推送（`platform === 'harmony'` 走 Push Kit）
- [ ] 服务端支持 FCM 推送不受影响（`platform === 'android'` 走 FCM）
- [ ] 鸿蒙客户端能完成登录→空闲→聊天→退出完整流程
- [ ] 鸿蒙客户端断线自动重连，重连后自动恢复会话
- [ ] 鸿蒙客户端本地持久化 UUID + 昵称，重启自动恢复
- [ ] 鸿蒙客户端后台时能通过 Push Kit 收到推送通知
- [ ] 鸿蒙客户端前台收消息时振动反馈
- [ ] 返回手势行为：chat→离开会话，idle→断开，login→退出
- [ ] 管理页面（`/admin`）正确显示 HarmonyOS 平台用户

---

## 完成检查清单

- [ ] 所有任务按顺序完成（共 24 个任务）
- [ ] chatLogic.js 提取完成，chat.js 和 ws.js 共用业务逻辑
- [ ] store.js 支持 null socketId（WS 用户不污染 socketToUser）
- [ ] 服务端 WebSocket 端点通过 wscat 验证（登录、聊天、断线重连）
- [ ] 跨端（Socket.io ↔ WebSocket）聊天验证
- [ ] 管理页面正确显示 HarmonyOS 平台用户
- [ ] 管理页面能踢出 WS 连接的用户
- [ ] 管理页面踢出后 peer 通知正确（支持 WS 对端）
- [ ] Push Kit 推送在鸿蒙设备上验证
- [ ] FCM 推送在 Android 设备上回归验证
- [ ] 手动测试确认所有用户故事（US-1 到 US-7）通过
- [ ] Web/Desktop/Android 客户端回归测试通过（功能不受影响）

---

## 实施顺序与依赖关系

```
任务 1 (ws 依赖)
  ↓
任务 2 (bridge.js) → 任务 3 (store.js 支持 null socketId)
  ↓
任务 4 (chatLogic.js 提取共享逻辑)
  ↓
任务 5 (重构 chat.js 使用 chatLogic) → 任务 6 (ws.js handler 使用 chatLogic)
  ↓
任务 7 (index.js 挂载 WS + 管理页面修正)
  ↓
[服务端 WebSocket 端点可测试 — wscat 验证]
  ↓
任务 8 (huaweiPush.js) → 任务 9 (统一推送路由)
  ↓
任务 10 (推送已在 chatLogic 中集成，确认即可)
  ↓
任务 11 (index.js 统一推送初始化)
  ↓
[服务端全部完成，可用 wscat + Web 完整测试]
  ↓
任务 12 (harmony 项目骨架) → 任务 13 (常量) → 任务 14 (存储)
  ↓
任务 15 (AppState) → 任务 16 (SocketService) → 任务 17 (NativeHelper) → 任务 18 (PushHelper)
  ↓
任务 19 (LoginPage) → 任务 20 (ChatPage) → 任务 21 (Index) → 任务 22 (EntryAbility)
  ↓
任务 23 (tryRestoreSession) → 任务 24 (Native 回调集成)
  ↓
[鸿蒙客户端全部完成]
```

## 备注

### 风险与缓解

1. **ArkTS 类型系统严格**：ArkTS 比 TypeScript 更严格（不允许 `any`、动态属性访问等），实际编码时可能需要调整类型定义。计划中使用了 `Record<string, Object>` 等通用类型，实际应根据编译器反馈优化。

2. **WebSocket 协议对齐**：已通过 `chatLogic.js` 解决。两个 handler 共享同一套业务逻辑，只需维护一份代码。

3. **DevEco Studio 项目配置**：`harmony/` 目录的配置文件在 DevEco Studio 中可能需要微调（签名、SDK 版本等）。建议先用 DevEco Studio 创建空项目，再将源码文件复制进去。

4. **Push Kit 测试**：Push Kit 需要在 AGC 中注册应用，开发阶段可先跳过推送功能，优先验证通信和 UI。

5. **消息列表序列化**：AppStorage 不直接支持复杂对象数组，当前方案使用 JSON 字符串序列化。如果消息量大时可能有性能问题，后续可改用 `@Observed` 类 + `@ObjectLink` 优化。

### 服务端改动原则

服务端改动分为新增和重构两类：

**新增文件**（零影响）：
- `bridge.js` — 统一消息桥接层
- `huaweiPush.js` — Push Kit 封装
- `handlers/chatLogic.js` — 共享业务逻辑（从 chat.js 提取）
- `handlers/ws.js` — WebSocket 协议处理器

**重构文件**（需回归测试）：
- `chat.js` — 重写为调用 chatLogic.js 的薄传输层（行为不变，结构变化大）
- `store.js` — `registerUser` 新增 null socketId 保护（1 行改动）
- `push.js` — 保持现有函数不变，新增统一路由函数
- `index.js` — 新增 WS 挂载 + 管理页面 WS 踢出逻辑 + 统一推送初始化

### 信心分数

**8/10** — 服务端改动（任务 1-11）信心较高（9/10），chatLogic.js 提取消除了代码重复风险，WS 协议设计清晰。鸿蒙客户端（任务 12-24）信心中等（6/10），主要不确定因素在 ArkTS 编译兼容性、DevEco Studio 项目配置、以及 Push Kit 真机调试。相比修正前的计划，提取 chatLogic.js 和修复 WS 用户管理显著降低了服务端风险。
