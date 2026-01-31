---
description: "功能实施计划: 华为设备后台消息推送"
status: archived
created_at: 2026-01-31T10:00:00
updated_at: 2026-01-31T16:00:00
archived_at: 2026-01-31T16:00:00
related_files:
  - rpiv/requirements/prd-huawei-background-push.md
---

# 功能：华为设备后台消息推送

以下计划应该是完整的，但在开始实施之前，验证文档和代码库模式以及任务合理性非常重要。

特别注意现有工具、类型和模型的命名。从正确的文件导入等。

## 功能描述

华为设备（2019 年后出厂）不预装 Google Mobile Services (GMS)，无法获取 FCM token，导致 App 后台时完全收不到推送通知。本功能通过 **GMS 可用性检测 + 条件启动前台服务保活 Socket.io 长连接** 的方式，让无 GMS 设备也能在后台接收消息并弹出本地通知。同时修复当前所有设备无差别启动前台服务的问题——有 GMS 设备不再启动不必要的前台服务。

## 用户故事

作为一个使用华为手机（无 GMS）的用户
我想要在 App 切到后台时仍能收到消息通知
以便我不会错过朋友发来的消息

## 问题陈述

当前 SmileMsg 的后台推送依赖 FCM。华为设备因无 GMS 无法获取 FCM token（日志显示 `getFcmToken=null`），App 切后台后 Socket.io 连接虽被前台服务保活，但所有设备无差别启动前台服务这一行为并不合理。需要建立一套 GMS 检测 + 策略分流机制。

## 解决方案陈述

利用 `FirebaseMessaging.getToken()` 的成功/失败结果作为 GMS 可用性的判据。检测后分流：有 GMS → 仅走 FCM（不启动前台服务）；无 GMS → 启动前台服务保活 Socket.io + 后台走本地通知。通过 `@capacitor/preferences` 预留 `push_strategy` 配置开关，为未来用户自选做准备。

## 功能元数据

**功能类型**：增强
**估计复杂度**：中
**主要受影响的系统**：Android 客户端（useNativeFeatures.js、useSocket.js、main.js）
**依赖项**：无新依赖，复用现有 Capacitor 插件

---

## 上下文参考

### 相关代码库文件 重要：在实施之前必须阅读这些文件！

- `android/src/composables/useNativeFeatures.js` (全文，137 行) - 原因：需要新增 `checkGmsAvailability()` 和 `getPushStrategy()`/`setPushStrategy()` 函数，需理解现有模块级变量和导出模式
- `android/src/composables/useSocket.js` (全文，354 行) - 原因：需要修改 `login()` 中前台服务启动逻辑（行 ~195-196）和 `registerPushToken()` 函数（行 57-86），以及断线重连时的 `registerPushToken()` 调用（行 ~127）
- `android/src/main.js` (全文，23 行) - 原因：需理解初始化顺序，不需要修改此文件

### 要创建的新文件

无新文件。所有改动在现有文件中完成。

### 相关文档 在实施之前应该阅读这些！

- [@capawesome-team/capacitor-android-foreground-service API](https://github.com/capawesome-team/capacitor-plugins/tree/main/packages/android-foreground-service)
  - 特定部分：startForegroundService / stopForegroundService API
  - 原因：确认前台服务 API 无变化
- [@capacitor-firebase/messaging API](https://github.com/niceplugin/capacitor-firebase/tree/main/packages/messaging)
  - 特定部分：getToken() 方法签名和错误行为
  - 原因：确认 getToken() 在无 GMS 设备上的行为（抛异常 vs 返回 null）
- [@capacitor/preferences API](https://capacitorjs.com/docs/apis/preferences)
  - 特定部分：get/set API
  - 原因：实现 push_strategy 持久化存储

### 要遵循的模式

**模块级状态变量模式**（来自 useNativeFeatures.js 行 64-65）：
```javascript
let isAppInForeground = true  // 模块级变量，非 ref
```
GMS 检测结果也应使用模块级变量缓存，同一会话不重复检测。

**异步函数 try-catch 模式**（来自 useNativeFeatures.js 行 82-93）：
```javascript
export async function startForegroundService() {
  try {
    await ForegroundService.startForegroundService({ ... })
  } catch (e) {
    console.warn('前台服务启动失败:', e)
  }
}
```
新增的 GMS 检测函数应遵循同样的 try-catch + console.warn 模式。

**client_log 上报模式**（来自 useSocket.js 行 62-71）：
```javascript
socket.emit('client_log', {
  tag: 'fcm',
  message: `getFcmToken=${token ? '(got)' : 'null'}`
})
```
GMS 检测结果上报应使用 tag: `'push-strategy'`。

**Preferences 读写模式**（来自 useNativeFeatures.js 行 42-62）：
```javascript
export async function saveSession(uuid, nickname) {
  await Preferences.set({ key: 'session_uuid', value: uuid })
  await Preferences.set({ key: 'session_nickname', value: nickname })
}
export async function loadSession() {
  const { value: uuid } = await Preferences.get({ key: 'session_uuid' })
  const { value: nickname } = await Preferences.get({ key: 'session_nickname' })
  if (!uuid || !nickname) return null
  return { uuid, nickname }
}
```

---

## 实施计划

### 阶段 1：GMS 检测与策略框架（useNativeFeatures.js）

在 `useNativeFeatures.js` 中新增三个功能：GMS 可用性检测、推送策略读写、策略决策函数。

**任务：**
- 新增模块级缓存变量 `gmsCheckResult`
- 新增 `checkGmsAvailability()` 函数（基于 getToken 结果判断）
- 新增 `getPushStrategy()` / `setPushStrategy()` 函数（Preferences 读写）
- 新增 `decidePushBehavior()` 综合决策函数

### 阶段 2：条件启动前台服务（useSocket.js）

修改 `login()` 和 `registerPushToken()` 逻辑，根据 GMS 检测结果条件分流。

**任务：**
- 修改 `registerPushToken()` 函数，融合 GMS 检测逻辑
- 修改 `login()` 中的前台服务启动为条件启动
- 修改断线重连中的 `registerPushToken()` 调用
- 新增 `client_log` 上报推送策略选择

### 阶段 3：验证

手动验证两种设备的行为差异。

---

## 逐步任务

重要：按顺序从上到下执行每个任务。每个任务都是原子的且可独立测试。

### 任务 1: UPDATE `android/src/composables/useNativeFeatures.js` — 新增 GMS 检测缓存变量和检测函数

- **IMPLEMENT**：在前台服务代码块之后（约行 102 后），新增模块级变量和 GMS 检测函数：

```javascript
// --- GMS 可用性检测 ---
let gmsAvailable = null  // null=未检测, true=有GMS, false=无GMS

/**
 * 检测 GMS 可用性。通过尝试获取 FCM token 判断：
 * - 成功获取 token → 有 GMS
 * - 返回 null 或抛异常 → 无 GMS（保守降级）
 * 结果缓存，同一会话内不重复检测。
 * 返回 { hasGms: boolean, token: string|null }
 */
export async function checkGmsAvailability() {
  if (gmsAvailable !== null) {
    return { hasGms: gmsAvailable, token: gmsAvailable ? await getFcmToken() : null }
  }
  try {
    const token = await getFcmToken()
    gmsAvailable = !!token
    return { hasGms: gmsAvailable, token }
  } catch (e) {
    console.warn('GMS 检测失败，降级为无 GMS:', e)
    gmsAvailable = false
    return { hasGms: false, token: null }
  }
}

export function getGmsStatus() {
  return gmsAvailable
}
```

- **PATTERN**：遵循 `let isAppInForeground = true` 的模块级缓存模式（行 64）
- **PATTERN**：遵循 `startForegroundService()` 的 try-catch + console.warn 模式（行 82-93）
- **GOTCHA**：`getFcmToken()` 内部已有 `FirebaseMessaging.getToken()`，直接复用。但 `checkGmsAvailability()` 需要额外的 try-catch 包裹，因为在无 GMS 设备上 `getToken()` 可能抛出原生层异常而非简单返回 null
- **GOTCHA**：检测结果返回 `token`，让调用者可以直接使用而不需要再次调用 `getFcmToken()`
- **VALIDATE**：检查文件语法正确，无重复导出名

### 任务 2: UPDATE `android/src/composables/useNativeFeatures.js` — 新增推送策略配置读写

- **IMPLEMENT**：在 GMS 检测代码之后，新增推送策略相关函数：

```javascript
// --- 推送策略配置 ---
const PUSH_STRATEGY_KEY = 'push_strategy'
const STRATEGY_FOREGROUND_SERVICE = 'foreground_service'
const STRATEGY_PASSIVE = 'passive'

export { STRATEGY_FOREGROUND_SERVICE, STRATEGY_PASSIVE }

export async function getPushStrategy() {
  const { value } = await Preferences.get({ key: PUSH_STRATEGY_KEY })
  return value || STRATEGY_FOREGROUND_SERVICE  // 默认策略 A
}

export async function setPushStrategy(strategy) {
  await Preferences.set({ key: PUSH_STRATEGY_KEY, value: strategy })
}
```

- **PATTERN**：遵循 `saveSession`/`loadSession` 的 Preferences 读写模式（行 42-62）
- **IMPORTS**：`Preferences` 已在行 3 导入，无需新增
- **GOTCHA**：默认值硬编码为 `'foreground_service'`（MVP 阶段策略 A），未来暴露设置 UI 时只需读写 `PUSH_STRATEGY_KEY`
- **VALIDATE**：检查 `getPushStrategy()` 返回默认值逻辑正确

### 任务 3: UPDATE `android/src/composables/useSocket.js` — 重构 registerPushToken 融合 GMS 检测和策略分流

- **IMPLEMENT**：修改 `registerPushToken()` 函数（约行 57-86），将其重构为同时处理 GMS 检测和策略决策：

**修改前**（当前代码概要）：
```javascript
async function registerPushToken() {
  if (!socket || !socket.connected) return
  const token = await getFcmToken()
  // ... client_log ...
  if (token) socket.emit('register_push_token', { token })
  // ... onFcmTokenRefresh ...
}
```

**修改后**：
```javascript
async function registerPushAndDecideStrategy() {
  if (!socket || !socket.connected) return

  // 1. GMS 检测（含 FCM token 获取）
  const { hasGms, token } = await checkGmsAvailability()

  // 2. 上报 FCM token（如果有）
  if (token) {
    socket.emit('register_push_token', { token })
    socket.emit('client_log', {
      tag: 'fcm',
      message: `getFcmToken=(got)`
    })
  } else {
    socket.emit('client_log', {
      tag: 'fcm',
      message: `getFcmToken=null`
    })
  }

  // 3. 决定推送策略
  const strategy = hasGms ? 'fcm' : await getPushStrategy()

  // 4. 上报策略选择
  socket.emit('client_log', {
    tag: 'push-strategy',
    message: `GMS=${hasGms}, strategy=${strategy}`
  })

  // 5. 根据策略启动/不启动前台服务
  if (!hasGms && strategy === STRATEGY_FOREGROUND_SERVICE) {
    startForegroundService()
  }

  // 6. Token 刷新监听（仅有 GMS 时有意义）
  if (hasGms) {
    onFcmTokenRefresh((newToken) => {
      if (socket && socket.connected) {
        socket.emit('register_push_token', { token: newToken })
      }
    })
  }
}
```

- **IMPORTS**：需要从 useNativeFeatures.js 新增导入 `checkGmsAvailability`、`getPushStrategy`、`STRATEGY_FOREGROUND_SERVICE`。更新行 3-15 的导入区域
- **PATTERN**：保留现有的 `client_log` 上报模式（tag + message）
- **GOTCHA**：函数名从 `registerPushToken` 改为 `registerPushAndDecideStrategy`，需要同步更新所有调用处（login 和断线重连中各一处）
- **GOTCHA**：前台服务的启动从 `login()` 中移到此函数内部，因为策略决策依赖 GMS 检测结果
- **GOTCHA**：`onFcmTokenRefresh` 只在有 GMS 时注册，无 GMS 设备不会有 token 刷新事件
- **VALIDATE**：确认函数签名无误，所有导入路径正确

### 任务 4: UPDATE `android/src/composables/useSocket.js` — 修改 login() 移除无条件前台服务启动

- **IMPLEMENT**：修改 `login()` 函数（约行 176-215），将 `startForegroundService()` 和 `registerPushToken()` 替换为单一的 `registerPushAndDecideStrategy()` 调用：

**修改前**（login 成功回调中）：
```javascript
saveSession(myUuid.value, myNickname.value)
startForegroundService()   // ← 移除：不再无条件启动
registerPushToken()        // ← 替换为 registerPushAndDecideStrategy()
```

**修改后**：
```javascript
saveSession(myUuid.value, myNickname.value)
registerPushAndDecideStrategy()  // GMS 检测 + 策略决策 + 条件启动前台服务 + FCM 注册
```

- **GOTCHA**：`registerPushAndDecideStrategy()` 是 async 的但不需要 await，与现有 `registerPushToken()` 的调用方式一致（fire-and-forget）
- **VALIDATE**：检查 `login()` 函数中不再有独立的 `startForegroundService()` 调用

### 任务 5: UPDATE `android/src/composables/useSocket.js` — 修改断线重连中的调用

- **IMPLEMENT**：修改断线重连的 `connect` 事件处理中的 `registerPushToken()` 调用（约行 ~127），替换为 `registerPushAndDecideStrategy()`：

**修改前**：
```javascript
registerPushToken()  // 重连后重新上报
```

**修改后**：
```javascript
registerPushAndDecideStrategy()  // 重连后重新检测+分流
```

- **GOTCHA**：断线重连时 `gmsAvailable` 缓存仍有效（模块级变量），不会重复检测 GMS
- **GOTCHA**：但如果缓存表示有 GMS，会重新调用 `getFcmToken()` 获取最新 token，这是正确行为
- **VALIDATE**：全文搜索确认不再有 `registerPushToken` 的调用

### 任务 6: UPDATE `android/src/composables/useSocket.js` — 更新导入语句

- **IMPLEMENT**：更新文件顶部的 `useNativeFeatures` 导入（约行 3-15），新增：
  - `checkGmsAvailability`
  - `getPushStrategy`
  - `STRATEGY_FOREGROUND_SERVICE`

  同时确认 `startForegroundService` 仍需要导入（`disconnect()` → `stopForegroundService()` 仍需要，但 `startForegroundService` 现在只在 `registerPushAndDecideStrategy` 中调用，该函数在 useSocket.js 内部定义，所以仍需要导入）。

- **VALIDATE**：检查导入列表完整，无未使用的导入

### 任务 7: 全局检查与一致性验证

- **IMPLEMENT**：
  1. 全文搜索 `useSocket.js` 确认没有遗漏的 `registerPushToken` 调用
  2. 全文搜索 `useSocket.js` 确认没有遗漏的独立 `startForegroundService()` 调用（`stopForegroundService` 在 `disconnect()` 中保留不变）
  3. 确认 `disconnect()` 中的 `stopForegroundService()` 不受影响（退出时无论什么策略都停止，这是正确的）
  4. 确认 `destroyAndReset()` 中的 `removeFcmTokenRefreshListener()` 不受影响
  5. 确认 `main.js` 无需修改

- **VALIDATE**：
  - `useNativeFeatures.js` 新增导出：`checkGmsAvailability`, `getGmsStatus`, `getPushStrategy`, `setPushStrategy`, `STRATEGY_FOREGROUND_SERVICE`, `STRATEGY_PASSIVE`
  - `useSocket.js` 新函数：`registerPushAndDecideStrategy`（替代 `registerPushToken`）
  - `useSocket.js` 删除函数：`registerPushToken`（或重命名）

---

## 测试策略

本项目无自动化测试配置。验证完全依赖手动测试。

### 手动测试矩阵

| 场景 | 设备 | 预期行为 |
|------|------|---------|
| 登录 | 有 GMS（如 Pixel） | 无常驻通知，FCM token 上报成功 |
| 登录 | 无 GMS（如华为） | 出现"SmileMsg · 聊天连接保持中"常驻通知 |
| 后台收消息 | 有 GMS | FCM 推送通知弹出 |
| 后台收消息 | 无 GMS | 本地通知弹出（通过前台服务保活的 Socket.io） |
| 退出登录 | 无 GMS | 常驻通知消失 |
| 断线重连 | 无 GMS | 重连后前台服务仍在运行 |
| 断线重连 | 有 GMS | 重连后无前台服务，FCM token 重新上报 |

### 服务端日志验证

| 日志 tag | 预期内容 |
|---------|---------|
| `fcm` | 有 GMS: `getFcmToken=(got)`; 无 GMS: `getFcmToken=null` |
| `push-strategy` | 有 GMS: `GMS=true, strategy=fcm`; 无 GMS: `GMS=false, strategy=foreground_service` |

---

## 验证命令

### 级别 1：语法检查

无 lint 配置。通过 Vite 构建检查语法：

```bash
pnpm --filter android build 2>&1 | head -20
```

如果无 build script，直接检查文件导入可解析性。

### 级别 2：构建验证

```bash
cd android && npx cap sync android
```

确认 Capacitor 同步无错误。

### 级别 3：手动验证

1. 启动 server: `pnpm dev:server`
2. 连接 Android 设备，运行: `cd android && npx cap run android`
3. 华为设备：登录 → 检查通知栏有常驻通知 → 切后台 → 对方发消息 → 检查本地通知弹出
4. 有 GMS 设备：登录 → 检查通知栏无常驻通知 → 切后台 → 对方发消息 → 检查 FCM 推送
5. 检查服务端控制台的 `[FCM-client]` 日志输出

### 级别 4：服务端日志

在 Zeabur 或本地 server 控制台查看：
- `[FCM-client] (昵称): GMS=false, strategy=foreground_service`
- `[FCM-client] (昵称): GMS=true, strategy=fcm`

---

## 验收标准

- [ ] 华为设备（无 GMS）登录后自动启动前台服务，通知栏出现"SmileMsg · 聊天连接保持中"
- [ ] 华为设备 App 在后台时收到消息弹出本地通知（通知栏 + 振动）
- [ ] 有 GMS 设备登录后不启动前台服务，无常驻通知
- [ ] 有 GMS 设备后台收消息通过 FCM 推送，行为与改动前一致
- [ ] 退出登录后前台服务和常驻通知立即消失
- [ ] 服务端日志能看到每个用户的 GMS 检测结果和策略选择
- [ ] 代码中存在 `push_strategy` 配置开关（Preferences key），默认值为 `foreground_service`
- [ ] GMS 检测结果在同一会话内缓存，不重复检测
- [ ] 断线重连后策略行为一致（有 GMS 重新注册 token，无 GMS 前台服务仍运行）
- [ ] 无新依赖引入

---

## 完成检查清单

- [ ] 所有任务按顺序完成
- [ ] 每个任务验证立即通过
- [ ] Capacitor sync 无错误
- [ ] 华为设备手动测试通过
- [ ] 有 GMS 设备手动测试通过
- [ ] 服务端日志验证完整
- [ ] 所有验收标准均满足
- [ ] 代码遵循 useNativeFeatures.js 的现有模式（try-catch、模块级变量、Preferences 读写）

---

## 备注

### 设计决策

1. **GMS 检测方式**：选择复用 `getFcmToken()` 而非引入 GMS 检测库，因为我们真正关心的是"FCM 能不能用"而非"GMS 装没装"。这种方式更简单，且直接验证了推送能力。

2. **函数合并**：将 `registerPushToken()` 重构为 `registerPushAndDecideStrategy()`，将 GMS 检测、策略决策、前台服务启动合并到一个函数中。原因是这三者有严格的依赖关系（检测 → 决策 → 执行），分散会增加状态管理复杂度。

3. **前台服务启动位置**：从 `login()` 移到 `registerPushAndDecideStrategy()` 内部。原因是前台服务是否启动依赖 GMS 检测结果，而检测是异步的，放在同一个 async 函数中逻辑更清晰。

4. **不修改 `disconnect()`**：退出时 `stopForegroundService()` 无条件调用是正确的——无论什么策略，退出都应该尝试停止（如果没启动，stop 会被 catch 忽略）。

5. **不修改 `main.js`**：初始化流程不需要改动。GMS 检测在登录时执行（非 App 启动时），因为 `tryRestoreSession()` 会调用 `login()`，而 `login()` 会触发 `registerPushAndDecideStrategy()`。

### 信心分数：9/10

高信心的原因：
- 改动范围小（仅 2 个文件），逻辑清晰
- 不引入新依赖，完全复用现有插件
- 不涉及服务端改动
- 现有架构（前台服务、本地通知、Socket.io 保活）已经工作，只需条件化启动

扣分原因：
- 无法确认 `FirebaseMessaging.getToken()` 在无 GMS 设备上的精确行为（抛异常 vs 返回 null），已通过 try-catch + 保守降级覆盖两种情况
