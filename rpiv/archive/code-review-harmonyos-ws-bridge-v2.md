---
description: "代码审查报告: HarmonyOS WebSocket 桥接层 + 服务端重构"
status: archived
created_at: 2026-01-31T20:00:00
updated_at: 2026-01-31T23:59:00
archived_at: 2026-01-31T23:55:00
---

# 代码审查报告

**统计：**

- 修改的文件：9
- 添加的文件：4（bridge.js, chatLogic.js, ws.js, huaweiPush.js）
- 删除的文件：0
- 新增行：238
- 删除行：258

---

## 发现的问题

### 问题 1

```
severity: high
status: fixed
file: server/src/index.js
line: 137-139
issue: 管理员踢出 WS 用户时 removeWsConnection 在 closeWsConnection 之前执行，导致 closeWsConnection 无法发送断开通知
detail: 第 138 行先执行 removeWsConnection(uuid) 从 wsConnections 中删除了 WS 实例，第 139 行 closeWsConnection(uuid) 再通过 wsConnections.get(uuid) 获取 WS 实例时已经拿不到了。closeWsConnection 内部虽然也执行了 wsConnections.delete(uuid)，但真正的问题是发送 force_disconnect 事件和调用 ws.close() 的代码永远不会被执行到。注释说"先移除桥接层映射防止 close 事件触发 disconnectLogic"的意图是对的，但实现顺序有误。
suggestion: 应先保存 WS 实例引用，再从映射中移除，最后手动发送断开通知和关闭连接。或者重构 closeWsConnection 使其接受 WS 实例参数而非从 Map 中查找。示例：
  const ws = wsConnections.get(uuid)
  removeWsConnection(uuid)  // 先移除，防止 close 回调触发 disconnectLogic
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify({ type: 'event', event: 'force_disconnect', data: { reason: '被管理员踢出' } }))
    ws.close()
  }
```

### 问题 2

```
severity: medium
status: fixed
file: server/src/handlers/ws.js
line: 180-182
issue: ws 的 error 事件处理器只清除了心跳定时器，未执行用户清理逻辑
detail: 当 WS 连接发生错误时，只清除了 heartbeatInterval，但没有从 wsConnections 中移除连接，也没有触发 disconnectLogic。虽然 error 事件后通常会紧跟 close 事件（由 close handler 处理清理），但如果 close 事件因某种原因未触发，wsConnections 中会残留已死连接，hasActiveConnection 会误判用户在线。
suggestion: 这在实践中通常不是问题（ws error 后几乎总会触发 close），但可以在 error handler 中添加一个保险清理，或者在注释中明确说明依赖 close 事件完成清理。当前实现可接受，仅作提醒。
```

### 问题 3

```
severity: medium
status: skipped
skip_reason: 逻辑正确，仅可读性改进建议，优先级过低
file: server/src/store.js
line: 131
issue: getOnlineUsers 中 WS 用户的 disconnected 状态判断不完整
detail: 第 131 行判断断连状态的条件是 `!u.socketId || !socketToUser.has(u.socketId)`。WS 用户的 socketId 始终为 null（设计如此），这意味着即使 WS 用户在线且连接正常，只要他们进入了宽限期（disconnectTimers.has(uuid)），就会被标记为 disconnected。但反过来说，一个活跃的 WS 用户不会有 disconnectTimers 条目，所以实际运行中这个条件的前半部分 `disconnectTimers.has(uuid)` 已经保证了该用户确实断开了。逻辑上是正确的，但 `!u.socketId` 这个子条件对 WS 用户来说永远为 true，依赖 disconnectTimers 作为唯一判断依据。
suggestion: 可以在注释中说明 WS 用户的 socketId 为 null 是设计行为，getOnlineUsers 的断连判断依赖 disconnectTimers 而非 socketId。当前逻辑正确，仅可读性改进。
```

### 问题 4

```
severity: medium
status: fixed
file: server/src/handlers/chatLogic.js
line: 113-148
issue: 推送逻辑中 handleSendMessage 的在线/后台/离线推送代码存在重复
detail: 第 123-135 行（离线推送）和第 136-144 行（后台推送）的推送调用代码几乎完全相同，唯一区别是离线时额外缓存离线消息。这是从旧代码继承的 DRY 违反。
suggestion: 可以提取一个 trySendPush(peer, payload) 辅助函数减少重复。不过考虑到代码量不大且两处逻辑有细微差异（离线多了消息缓存），当前实现可接受。
```

### 问题 5

```
severity: low
status: skipped
skip_reason: 有意为之的双保险设计，Socket.io 内建重连在 Android WebView 后台场景中不可靠
file: android/src/composables/useSocket.js
line: 73-88
issue: keepalive 心跳在断连后继续运行并尝试重连，可能与 Socket.io 内建重连机制冲突
detail: Socket.io 配置了 reconnection: true, reconnectionAttempts: Infinity。keepalive 定时器在 socket 断开后也尝试调用 socket.connect()，与 Socket.io 自身的重连逻辑可能产生竞争。虽然 Socket.io 对重复 connect() 调用有幂等保护，但这增加了不必要的复杂性。
suggestion: 考虑在心跳中去掉手动重连逻辑，仅依赖 Socket.io 内建重连。或者在 disconnect 时停止心跳，connect 时重启心跳（当前已部分实现：connect 时 startKeepalive，但 disconnect 时故意不停——注释说明是为了让心跳触发重连）。当前设计是有意为之的"双保险"策略，如果实测有效可保留。
```

### 问题 6

```
severity: low
status: fixed
file: server/src/huaweiPush.js
line: 7
issue: HUAWEI_PUSH_URL 在模块顶层使用 HUAWEI_APP_ID 构建，如果 APP_ID 未配置则 URL 包含 undefined
detail: 第 7 行 `const HUAWEI_PUSH_URL = process.env.HUAWEI_PUSH_URL || \`https://push-api.cloud.huawei.com/v2/${HUAWEI_APP_ID}/messages:send\`` 在 HUAWEI_APP_ID 为 undefined 时会生成 `.../v2/undefined/messages:send`。虽然 sendHuaweiPush 第一行检查了 isHuaweiPushEnabled()，在 APP_ID 缺失时会提前返回，所以这个 URL 不会被实际使用。
suggestion: 不影响运行时行为，但可以改为在 sendHuaweiPush 中动态构建 URL，或在 initHuaweiPush 中构建并缓存。低优先级。
```

### 问题 7

```
severity: low
status: fixed
file: android/src/composables/useSocket.js
line: 53
issue: onNewMessage 中的日志使用 message.sender 但消息对象字段名是 senderNickname
detail: 第 53 行 `sender=${message.sender || '?'}` 读取 message.sender，但根据服务端 chatLogic.js 第 104 行，消息对象的字段是 senderNickname 和 senderUuid，不存在 sender 字段。因此日志中 sender 永远显示 '?'。
suggestion: 改为 `sender=${message.senderNickname || '?'}`。
```

---

## 架构评价

本次重构的核心改动——将 chat.js 中的业务逻辑提取到 chatLogic.js、通过 bridge.js 统一双通道消息路由——是合理的架构决策。具体优点：

1. **关注点分离清晰**：transport 层（chat.js 处理 Socket.io、ws.js 处理 WebSocket）与业务逻辑层（chatLogic.js）分离
2. **桥接层设计简洁**：bridge.js 的 sendToUser/broadcastToConversation 抽象层足够薄，不引入额外复杂度
3. **WS 心跳机制完备**：服务端 ws.js 的 ping/pong + missedPongs 机制可靠检测假死连接
4. **身份守卫正确**：ws.js 第 173 行的 `wsConnections.get(userUuid) === ws` 检查防止了旧连接的 close 事件触发错误清理

**问题 1（管理员踢出 WS 用户）是唯一需要修复的真实 bug**，其余问题为改进建议。
