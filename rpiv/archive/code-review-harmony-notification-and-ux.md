---
description: "代码审查报告: harmony-notification-and-ux"
status: archived
created_at: 2026-02-01T12:00:00
updated_at: 2026-02-01T12:50:00
archived_at: 2026-02-01T12:50:00
---

# 代码审查报告

本次变更为 HarmonyOS 客户端添加本地通知功能、键盘适配优化、调试日志，以及服务端华为推送参数调整。

**统计：**

- 修改的文件：7
- 添加的文件：0
- 删除的文件：0
- 新增行：183
- 删除行：26

---

## 问题列表

### 问题 1：签名密钥泄露到版本控制

```
severity: critical
status: fixed
file: harmony/build-profile.json5
line: 9-11
issue: storePassword 和 keyPassword 以加密哈希形式提交到代码仓库
detail: build-profile.json5 中包含 storePassword、keyPassword 以及本地文件路径（p12、p7b、cer）。虽然密码是 DevEco Studio 的混淆格式而非明文，但该混淆是可逆的，且文件路径暴露了开发者本地目录结构。签名配置不应提交到版本控制。
suggestion: 将 build-profile.json5 加入 .gitignore，或将 signingConfigs 部分移到本地不提交的配置文件中。当前已提交的内容需要 git rm --cached 处理，并考虑轮换签名证书。
```

### 问题 2：bundleName 不一致导致通知点击无法拉起应用

```
severity: critical
status: fixed
file: harmony/entry/src/main/ets/common/NativeHelper.ets
line: 71
issue: publishLocalNotification 中 WantAgent 的 bundleName 为 'com.smilemsg.harmony'，但 app.json5 已改为 'smilemsg.zqx.huawei'
detail: app.json5 中 bundleName 已从 'com.smilemsg.harmony' 改为 'smilemsg.zqx.huawei'，但 NativeHelper.ets 第 71 行的 WantAgent 仍硬编码旧的 bundleName。这会导致用户点击本地通知时无法正确拉起应用。
suggestion: 将 bundleName 统一为 'smilemsg.zqx.huawei'，或更好的做法是从 bundleManager 动态获取 bundleName 避免硬编码。
```

### 问题 3：notificationId 溢出风险

```
severity: low
status: skipped
skip_reason: 阅后即焚 IM 应用消息量有限，应用重启即归零，number 安全整数范围 2^53 不可能溢出。每条消息独立通知是合理的设计意图。
file: harmony/entry/src/main/ets/common/NativeHelper.ets
line: 60
issue: notificationId 全局自增无上限
detail: notificationId 是模块级变量，每次发布通知递增。虽然在实际使用中应用重启会归零，且 number 类型在 JS/ArkTS 中的安全整数范围极大（2^53），但作为通知 ID，系统可能对 ID 范围有限制。更重要的是，如果意图是每条消息一个独立通知，ID 无限增长是合理的；但如果意图是合并通知（同一发送者只显示最新），则需要按发送者固定 ID。
suggestion: 如需合并通知，可用 senderNickname 的哈希作为 ID。当前实现如果是设计意图（每条消息独立通知），则无需修改。
```

### 问题 4：大量调试日志未标记为开发环境专用

```
severity: medium
status: fixed
file: harmony/entry/src/main/ets/common/SocketService.ets
line: 153, 179, 185, 188, 197, 425, 430, 460, 462, 469
issue: 17+ 处 [WS-DEBUG] 和 [UI-DEBUG] 日志将进入生产构建
detail: SocketService.ets 和 ChatPage.ets 中大量 console.info/warn 调用带有 [WS-DEBUG] 和 [UI-DEBUG] 前缀，明显是调试用途。这些日志会在生产环境中持续输出，包括敏感信息如消息内容（content）、会话 ID 等。其中 sendMessage 日志（第 460 行）直接打印用户发送的消息明文。
suggestion: 提交前清理调试日志，或引入环境变量/编译宏控制日志级别。至少移除打印消息内容的日志行以保护用户隐私。
```

### 问题 5：SocketService.ets 第 153-154 行多余空行

```
severity: low
status: fixed
file: harmony/entry/src/main/ets/common/SocketService.ets
line: 154
issue: 连续两个空行，格式不一致
detail: 第 153 行 console.info 之后有两个连续空行，与文件其余部分的风格不一致。
suggestion: 删除多余空行。
```

### 问题 6：requestNotificationPermission 和 createNotificationSlot 的 await 被忽略

```
severity: medium
status: fixed
file: harmony/entry/src/main/ets/entryability/EntryAbility.ets
line: 50-51
issue: async 函数在同步回调中调用但未 await，错误可能被静默吞掉
detail: onWindowStageCreate 中 loadContent 的回调不是 async 函数，但调用了 requestNotificationPermission（async）和 createNotificationSlot（async）。虽然这两个函数内部有 try-catch，不会抛出未捕获异常，但如果需要确保通知通道在权限获取后创建，当前并行执行可能导致时序问题。
suggestion: 如果 createNotificationSlot 依赖权限获取结果，应将回调改为 async 并 await 两个调用。如果两者独立，当前实现可接受，但建议添加注释说明设计意图。
```

### 问题 7：huaweiPush.js 中 foreground_show: false 的隐含行为

```
severity: medium
status: skipped
skip_reason: 服务端仅在用户 inBackground=true 时才触发推送，"前台 + WS 断开"场景下不会发送推送，不存在漏消息风险。当前设计场景覆盖完备。
file: server/src/huaweiPush.js
line: 91
issue: foreground_show: false 会导致应用在前台时不显示推送通知
detail: 新增的 foreground_show: false 意味着当应用在前台时，华为推送通知不会被系统通知栏展示，而是由应用自行处理（通过 data 消息）。这与客户端新增的 publishLocalNotification 逻辑配合——前台非聊天状态时手动发布本地通知。但如果 WebSocket 断开而推送仍到达，前台用户可能既看不到系统通知也看不到本地通知（因为本地通知依赖 WebSocket 消息回调）。
suggestion: 确认 foreground_show: false 的场景覆盖完整：当 WebSocket 连接正常时，前台由本地通知处理；当 WebSocket 断开时，推送消息可能无法触发本地通知。考虑是否需要 fallback 机制。
```

---

## 总结

本次变更有 2 个 critical 级别问题需要立即修复：

1. **签名配置泄露**：build-profile.json5 中的签名密钥不应提交到版本控制
2. **bundleName 不一致**：NativeHelper.ets 中硬编码的 bundleName 与 app.json5 不匹配，通知点击会失效

3 个 medium 级别问题建议在提交前处理：调试日志清理、async 调用时序、推送前台显示逻辑。

### 修复结果

| 问题 | 严重性 | 状态 |
|------|--------|------|
| 1. 签名密钥泄露 | critical | fixed |
| 2. bundleName 不一致 | critical | fixed |
| 3. notificationId 溢出 | low | skipped |
| 4. 调试日志 | medium | fixed |
| 5. 多余空行 | low | fixed |
| 6. async 时序 | medium | fixed |
| 7. foreground_show | medium | skipped |
