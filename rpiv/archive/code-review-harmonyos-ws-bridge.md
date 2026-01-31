---
description: "代码审查报告: HarmonyOS WebSocket 桥接层与服务端重构"
status: archived
created_at: 2026-01-31T16:00:00
updated_at: 2026-01-31T23:55:00
archived_at: 2026-01-31T23:55:00
---

# 代码审查报告

**统计：**

- 修改的文件：9
- 添加的文件：4 (bridge.js, chatLogic.js, ws.js, huaweiPush.js)
- 删除的文件：0
- 新增行：239
- 删除行：257

---

## 发现的问题

### 问题 1

```
severity: high
file: server/src/handlers/ws.js
line: 152-158
issue: WS 连接 error 事件后未清理用户状态
detail: ws.on('error') 只清理了 heartbeat 定时器，但没有调用 removeWsConnection(uuid) 和 disconnectLogic(uuid, io)。如果 WebSocket 因网络错误关闭，且 error 先于 close 触发，用户状态不受影响（因为 close 通常会跟随 error 触发）。但如果只触发 error 不触发 close（罕见但可能），用户会成为"幽灵连接"——ws 对象已销毁但 wsConnections Map 中仍保留引用，heartbeat 持续发送到已关闭的 ws。
suggestion: 在 error 处理中也执行清理逻辑，或确认 Node.js ws 库的行为保证 error 后必定触发 close。实际上 ws 库文档明确 error 事件后总会跟随 close 事件，所以当前代码是安全的，但建议添加注释说明这一依赖。
```

### 问题 2

```
severity: high
file: server/src/handlers/ws.js
line: 69-76
issue: WS login 未处理"旧连接是 WS"的踢出场景
detail: 当新 WS 连接登录时，代码只处理了 oldSocketId 存在（即旧连接是 Socket.io）的踢出逻辑。如果旧连接也是 WS（oldSocketId 为 null），则不会被踢掉。此时新旧两个 WS 连接都认为自己是该用户的连接，但 wsConnections Map 只保留最新的一个。旧 WS 连接的 close 事件仍会触发 disconnectLogic，可能在宽限期到期后清理新连接的用户数据。
suggestion: 在 registerWsConnection 之前，检查 wsConnections 中是否已有该 uuid 的旧 WS 连接，若有则向其发送 force_disconnect 并 close()。
```

### 问题 3

```
severity: high
file: server/src/handlers/chatLogic.js
line: 213-252
issue: handleDisconnect 对 WS 用户的重连检查存在竞争条件
detail: handleDisconnect 在宽限期到期后调用 hasActiveConnection(uuid) 检查用户是否已重连。但对于 WS 用户，ws.js 的 close 事件先调用 removeWsConnection(uuid) 再调用 disconnectLogic(uuid, io)。如果用户在宽限期内重连（新 WS 连接），但后来再次断开，第二次断开的 removeWsConnection 会移除桥接层的引用，而第一次断开的宽限期定时器仍在运行。当第一个定时器到期时，hasActiveConnection 返回 false（因为第二次断开已移除引用），导致用户被提前清理，即使第二次断开自己的宽限期还没到期。这个时序问题在 Socket.io 版本中不存在，因为 socketId 会被新连接替换。
suggestion: 在 handleDisconnect 中记录断连时的连接标识（如 WS 实例或时间戳），宽限期到期时对比当前连接是否为同一个，而不仅仅检查"是否有活跃连接"。
```

### 问题 4

```
severity: medium
file: server/src/handlers/ws.js
line: 26-29
issue: WS 心跳 ping 无超时检测（pong 未被验证）
detail: 服务端每 10 秒发送 JSON ping，客户端预期回复 JSON pong，但服务端没有检测 pong 是否返回。如果客户端假死（进程存在但不响应），连接不会被检测为断开，heartbeat 会无限发送。Socket.io 有内置的 pingTimeout 机制（配置为 15 秒），而 WS 通道缺少等效机制。
suggestion: 使用 ws 库原生的 ping/pong 机制（ws.ping()），或添加 pong 超时检测：如果连续 N 次 ping 未收到 pong，则主动关闭连接。
```

### 问题 5

```
severity: medium
file: android/src/composables/useSocket.js
line: 202-208
issue: disconnect 事件中向已断开的 socket 发送 emit 必定失败
detail: 在 socket.on('disconnect') 回调中，socket.connected 已经为 false，此时执行 socket.emit('client_log', ...) 不会发送成功（Socket.io 在断开状态下会缓冲消息但不保证送达）。这段代码的 if 条件 (socket.connected === false) 本身就验证了 socket 已断开，emit 调用是无效操作。
suggestion: 删除 disconnect 事件中的 emit 调用，它不会产生任何效果。仅保留 console.log 即可。
```

### 问题 6

```
severity: medium
file: server/src/index.js
line: 130-138
issue: 踢出 WS 用户后未调用 store.removeUser 清理完整用户数据
detail: 管理员踢出用户时，对 Socket.io 用户调用了 removeUser(target.socketId) 清理 store 数据，但对 WS 用户只调用了 closeWsConnection(uuid, reason)，未做等效的 store 清理。虽然后续代码（142-171行）有 users.get(uuid) 的兜底清理，但 closeWsConnection 会触发 ws.on('close')，进而调用 disconnectLogic 启动 30 分钟宽限期定时器。紧接着下方的兜底代码又会清理用户数据并删除定时器——这导致了不必要的创建-立即删除定时器的操作，虽然功能正确但逻辑混乱。
suggestion: 对 WS 用户，在 closeWsConnection 之前先调用 removeWsConnection(uuid) 防止 close 事件触发 disconnectLogic，让后续兜底代码统一处理清理。或者在兜底代码之前先关闭 WS 连接。
```

### 问题 7

```
severity: medium
file: server/src/store.js
line: 50
issue: registerUser 对 WS 用户设置 platform 使用首次登录的值，重连不更新
detail: platform 字段使用 existingUser?.platform || platform，即首次登录后不会被更新。如果用户先从 Android 登录再从 HarmonyOS 登录（相同 UUID），platform 仍为 'android'，导致推送路由到 FCM 而非 Push Kit。虽然 UUID 跨平台共用的场景不常见，但这是一个隐含假设，应该用最新的 platform 覆盖。
suggestion: 将 platform 改为直接使用参数值 platform 而非 existingUser?.platform || platform，确保每次登录都使用最新平台信息。
```

### 问题 8

```
severity: low
file: server/src/handlers/chatLogic.js
line: 20
issue: nickname 长度校验在 trim 之前执行
detail: nickname.length > 20 的检查在 nickname.trim() 之前，如果用户传入 "   abc   "（长度 9），trim 后为 "abc"（长度 3），实际是合法的。但如果传入 21 个空格 + "a"（长度 22），先被 length > 20 拒绝，trim 后其实是 "a"（合法）。这是一个边缘情况，影响不大。
suggestion: 先 trim 再检查长度：const trimmed = nickname?.trim(); if (!uuid || !trimmed || trimmed.length === 0 || trimmed.length > 20)。
```

---

## 总评

这次变更是一次结构良好的重构，将 Socket.io 特有逻辑与通用业务逻辑分离，为 HarmonyOS 原生 WebSocket 客户端提供了并行通道。桥接层设计合理，bridge.js 的路由逻辑清晰。

主要风险集中在 **WS 连接的生命周期管理**（问题 2、3、4），特别是多连接踢出和宽限期定时器的竞争条件，建议优先修复。
