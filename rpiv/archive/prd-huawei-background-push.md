---
description: "产品需求文档: 华为设备后台消息推送"
status: archived
created_at: 2026-01-31T09:30:00
updated_at: 2026-01-31T16:00:00
archived_at: 2026-01-31T16:00:00
---

# 华为设备后台消息推送

## 1. 执行摘要

SmileMsg 当前依赖 Firebase Cloud Messaging (FCM) 为 Android 用户提供后台推送通知。但华为设备（自 2019 年起出厂不预装 Google Mobile Services）无法获取 FCM token，导致这些设备在 App 后台时完全收不到消息通知。

本方案通过 **GMS 可用性检测 + 前台服务保活 Socket.io 长连接** 的方式，让无 GMS 的华为设备也能在后台接收消息并弹出本地通知。同时引入**可配置的推送策略开关**，为未来将选择权交给用户做好架构准备。

**MVP 目标**：无 GMS 设备登录后自动启用前台服务方案，后台收消息体验与 FCM 设备一致（通知栏 + 振动/声音）；有 GMS 设备行为不变，且不再启动不必要的前台服务。

## 2. 使命

**使命声明**：确保所有 Android 用户（无论是否有 GMS）都能在 App 后台时可靠地收到消息通知。

**核心原则**：

1. **对用户透明** — GMS 检测和策略选择在后台自动完成，用户无感知
2. **保守降级** — 检测失败时宁可多一个常驻通知，也不丢消息
3. **最小侵入** — 有 GMS 的设备完全不受影响，不启动前台服务
4. **可配置性** — 代码层面预留策略开关，为未来用户自选做准备
5. **简洁实现** — 不引入 HMS SDK，复用现有 Capacitor 插件和 Socket.io 长连接

## 3. 目标用户

### 主要用户角色

| 属性 | 描述 |
|------|------|
| 设备 | 华为手机（无 GMS），Android 10-14 |
| 典型型号 | 华为 Nova/Mate/P 系列（2019 年后出厂） |
| 技术水平 | 普通用户，不了解 GMS/FCM 等技术概念 |
| 使用场景 | 与朋友通过 SmileMsg 私聊，App 经常在后台 |

### 关键痛点

- App 切到后台后收不到任何消息通知，必须手动打开 App 才能看到新消息
- 不理解为什么自己收不到通知而其他人可以
- 从日志看：`getFcmToken=null`、`token 为 null，推送不可用`

### 次要用户

- 使用有 GMS 设备的用户：本次改造后不再启动不必要的前台服务，体验更干净

## 4. MVP 范围

### 核心功能

- ✅ GMS 可用性检测（运行时判断设备是否有 Google Play Services）
- ✅ 推送策略分流（有 GMS → FCM only；无 GMS → 前台服务 + 本地通知）
- ✅ 前台服务保活 Socket.io 长连接（仅无 GMS 设备）
- ✅ 后台消息本地通知（通知栏弹出，含振动和声音）
- ✅ 前台服务生命周期管理（登录启动、退出停止）
- ✅ 推送策略开关（代码级 flag，MVP 硬编码为策略 A）

### 技术

- ✅ 有 GMS 设备不再启动前台服务（修复当前所有设备都启动的问题）
- ✅ GMS 检测失败时降级为启动前台服务（保守策略）
- ✅ 诊断日志增强（通过 client_log 上报 GMS 检测结果和策略选择）

### 范围外

- ❌ HMS Push Kit 集成
- ❌ App 被强杀后自动重启前台服务
- ❌ 用户可见的推送策略设置界面
- ❌ 华为省电白名单引导提示
- ❌ 服务端代码改动

## 5. 用户故事

### US-1: 华为用户后台收消息
> 作为一个使用华为手机的用户，我希望在 App 切到后台时仍能收到消息通知，以便我不会错过朋友发来的消息。

**示例**：小朱使用华为 ALN-AL00 登录 SmileMsg，与 sean1 聊天后切到微信。sean1 发了一条消息，小朱的手机通知栏弹出 "sean1 发来消息: 你好"，带振动提醒。

### US-2: GMS 设备体验不变
> 作为一个使用有 GMS 设备的用户，我希望 App 行为和之前一样，不会多出一个常驻通知。

**示例**：test 使用 Pixel 手机登录，FCM 正常工作，通知栏没有 "SmileMsg 运行中" 的常驻通知。

### US-3: 自动检测无感知
> 作为用户，我不想关心技术细节，希望 App 自动判断该用哪种方式推送。

**示例**：用户登录后，App 自动检测 GMS 可用性并选择策略，整个过程对用户完全透明。

### US-4: 常驻通知可理解
> 作为华为用户，我看到通知栏有 "SmileMsg 运行中" 时，能理解这是为了保持消息接收。

**示例**：常驻通知文案为 "SmileMsg · 聊天连接保持中"，小图标低调不突兀。

### US-5: 退出登录清理干净
> 作为用户，我退出登录后，前台服务和常驻通知应立即消失。

**示例**：小朱点击退出登录，通知栏的 "SmileMsg 运行中" 立即消失，前台服务停止。

### 技术用户故事

### US-T1: 策略开关预留
> 作为开发者，我希望推送策略通过一个配置 flag 控制，以便未来轻松暴露为用户设置项。

**示例**：`pushStrategy` 变量控制行为，值为 `'foreground_service'`（策略 A）或 `'passive'`（策略 B），当前硬编码为 `'foreground_service'`。

### US-T2: 诊断日志
> 作为开发者，我希望在服务端日志中看到每个用户的 GMS 检测结果和推送策略选择，以便排查问题。

**示例**：服务端日志输出 `[FCM-client] (小朱): GMS=false, strategy=foreground_service`。

## 6. 核心架构与模式

### 高级架构

```
┌─────────────────────────────────────────────┐
│                  App 启动                     │
│                     │                         │
│              检测 GMS 可用性                   │
│              ┌──────┴──────┐                  │
│           有 GMS        无 GMS                │
│              │              │                  │
│         FCM 方案      前台服务方案              │
│      (现有逻辑不变)   (新增逻辑)               │
│              │              │                  │
│       getFcmToken()   startForeground()       │
│       注册到服务端     Socket.io 保活           │
│              │              │                  │
│         FCM 推送      本地通知弹出              │
│              │              │                  │
│       ┌──────┴──────────────┴──────┐          │
│       │     后台消息通知（统一体验）  │          │
│       └────────────────────────────┘          │
└─────────────────────────────────────────────┘
```

### 关键设计模式

**策略模式（Strategy Pattern）**：

推送行为抽象为两种策略，运行时根据 GMS 检测结果 + 用户配置选择：

| 策略 | 前台服务 | 常驻通知 | 后台收消息 | 触发条件 |
|------|---------|---------|-----------|---------|
| A: `foreground_service` | 启动 | 有 | 能 | 无 GMS 且开关开启（默认） |
| B: `passive` | 不启动 | 无 | 不能 | 无 GMS 且开关关闭（未来） |
| FCM | 不启动 | 无 | 能（FCM） | 有 GMS |

**决策流程**：

```
hasGMS?
  ├─ true  → 策略: FCM（不启动前台服务，走现有 FCM 逻辑）
  └─ false → 读取 pushStrategy 配置
               ├─ 'foreground_service' → 策略 A（启动前台服务）
               └─ 'passive'           → 策略 B（不启动前台服务）
```

### 涉及文件

| 文件 | 改动 |
|------|------|
| `android/src/composables/useNativeFeatures.js` | 新增 `checkGmsAvailability()` 函数 |
| `android/src/composables/useSocket.js` | 登录/断连逻辑中根据策略决定是否启动前台服务 |
| `android/src/main.js` | 启动时执行 GMS 检测，存储检测结果 |

## 7. 功能规范

### 7.1 GMS 可用性检测

**目的**：运行时判断设备是否安装并启用了 Google Play Services。

**实现方式**：尝试调用 `FirebaseMessaging.getToken()`，如果成功获取到 token 则判定有 GMS；如果抛出异常或返回 null 则判定无 GMS。这比引入额外的 GMS 检测库更简单，且直接验证了 FCM 的可用性。

**关键行为**：
- 检测在登录成功后执行（与现有 `registerPushToken()` 时机一致）
- 检测结果缓存，同一会话内不重复检测
- 检测结果通过 `client_log` 上报服务端
- 检测失败（异常）视为无 GMS（保守降级）

### 7.2 推送策略开关

**目的**：控制无 GMS 设备的推送行为，为未来用户自选做准备。

**实现方式**：
- 使用 `@capacitor/preferences` 持久化存储策略配置
- key: `push_strategy`，值: `'foreground_service'` | `'passive'`
- MVP 阶段不提供 UI，硬编码默认值为 `'foreground_service'`
- 未来只需在设置页读写这个 key 即可

### 7.3 前台服务条件启动

**目的**：仅在需要时启动前台服务，避免有 GMS 设备出现不必要的常驻通知。

**当前行为**（需修改）：
```javascript
// useSocket.js login() 中，所有设备都会启动
startForegroundService()
```

**目标行为**：
```
登录成功后:
  if (hasGMS) → registerPushToken()（FCM 注册，不启动前台服务）
  if (!hasGMS && strategy === 'foreground_service') → startForegroundService()
  if (!hasGMS && strategy === 'passive') → 不启动前台服务
```

### 7.4 后台消息本地通知

**目的**：无 GMS 设备在 App 后台时，通过本地通知提醒用户。

**关键行为**：
- 复用现有的 `notifyNewMessage()` 和 `onNewMessage()` 逻辑
- 无 GMS 设备因为前台服务保活了 Socket.io 连接，`new_message` 事件在后台仍能收到
- 现有的 `isInForeground()` 判断已正确处理前台/后台的通知逻辑
- 无需新增代码，只需确保前台服务存活期间 Socket.io 连接不断

### 7.5 退出时清理

**当前行为**（已正确）：
```javascript
function disconnect() {
  clearSession()
  stopForegroundService()  // 已有
  destroyAndReset()
}
```

此行为无需修改，退出时无论哪种策略都会停止前台服务。

## 8. 技术栈

### 现有依赖（无需新增）

| 依赖 | 版本 | 用途 |
|------|------|------|
| `@capacitor-firebase/messaging` | ^7.5.0 | FCM token 获取（兼作 GMS 检测） |
| `@capawesome-team/capacitor-android-foreground-service` | ^7.0.0 | 前台服务 |
| `@capacitor/local-notifications` | （已安装） | 本地通知弹出 |
| `@capacitor/preferences` | （已安装） | 策略配置持久化 |
| `@capacitor/app` | （已安装） | 前后台状态监听 |

### 不需要新增的依赖

- ❌ Google Play Services 检测库（通过 FCM token 获取结果间接判断）
- ❌ HMS Push SDK
- ❌ 任何服务端依赖

## 9. 安全与配置

### 配置管理

| 配置项 | 存储位置 | 默认值 | 说明 |
|--------|---------|--------|------|
| `push_strategy` | Capacitor Preferences | `'foreground_service'` | 无 GMS 设备的推送策略 |
| GMS 检测结果 | 内存变量 | — | 同一会话内缓存，不持久化 |

### 权限要求（已有）

- `POST_NOTIFICATIONS` — 通知弹出
- `FOREGROUND_SERVICE` — 前台服务
- `FOREGROUND_SERVICE_SPECIAL_USE` — 前台服务特殊用途
- `WAKE_LOCK` — 保持唤醒
- `INTERNET` — 网络连接

无需新增权限。

### 安全范围

- **范围内**：确保前台服务不泄露用户消息内容到常驻通知
- **范围外**：消息加密（不在本次范围）

## 10. API 规范

本次改造**不涉及服务端 API 变更**。

客户端新增的 `client_log` 上报内容：

```javascript
// GMS 检测结果上报
socket.emit('client_log', {
  tag: 'push-strategy',
  message: `GMS=${hasGMS}, strategy=${strategy}`
})
```

服务端已有 `client_log` 事件的处理逻辑，无需修改。

## 11. 成功标准

### MVP 成功定义

无 GMS 的华为设备用户登录后，App 切到后台能收到消息通知，体验与 FCM 设备一致。

### 功能要求

- ✅ 华为设备（无 GMS）登录后自动启动前台服务
- ✅ App 在后台时收到消息弹出本地通知（通知栏 + 振动）
- ✅ 有 GMS 设备不启动前台服务，无常驻通知
- ✅ 退出登录后前台服务和常驻通知立即消失
- ✅ GMS 检测结果和策略选择在服务端日志可查
- ✅ 代码中存在 `push_strategy` 配置开关

### 质量指标

- 前台服务启动后 Socket.io 连接在后台持续存活（至少 30 分钟不断连）
- 后台消息通知从发送到弹出延迟 < 3 秒
- GMS 检测不增加启动时间（< 100ms 额外延迟）

### 用户体验目标

- 华为用户无需任何额外操作即可后台收到通知
- 有 GMS 用户完全无感知此次改动

## 12. 实施阶段

### 阶段 1: GMS 检测与策略框架

**目标**：建立 GMS 检测机制和策略开关框架

**交付物**：
- ✅ `checkGmsAvailability()` 函数实现
- ✅ `push_strategy` 配置读写逻辑
- ✅ 策略决策函数（输入 GMS 检测结果 + 配置，输出策略）
- ✅ client_log 上报 GMS 检测结果

**验证标准**：在华为设备上检测返回 false，在有 GMS 设备上返回 true，服务端日志可查

### 阶段 2: 条件启动前台服务

**目标**：根据策略决策结果条件性启动/不启动前台服务

**交付物**：
- ✅ 修改 `login()` 中的前台服务启动逻辑（仅无 GMS + 策略 A 时启动）
- ✅ 修改 `disconnect()` 确保清理逻辑兼容
- ✅ 断线重连时的前台服务状态保持

**验证标准**：华为设备登录后有常驻通知；Pixel 设备登录后无常驻通知

### 阶段 3: 端到端验证与日志增强

**目标**：验证完整推送链路，增强诊断能力

**交付物**：
- ✅ 华为设备后台收消息 → 本地通知弹出（振动+声音）验证
- ✅ 有 GMS 设备 FCM 推送不受影响验证
- ✅ 策略选择日志完善

**验证标准**：两种设备各自按预期策略工作，服务端日志完整记录策略链路

## 13. 未来考虑

### MVP 后增强

1. **用户设置页暴露策略开关** — 在 App 设置中添加"后台消息推送"开关，让用户自选策略 A（常驻通知+后台收消息）或策略 B（无常驻通知+后台不收消息）
2. **华为省电白名单引导** — 检测到华为设备时，引导用户将 SmileMsg 加入电池优化白名单，提高前台服务存活率
3. **智能策略切换** — 当用户有活跃会话时自动切换到策略 A，空闲时切换到策略 B

### 后期高级功能

4. **HMS Push Kit 集成** — 如果华为用户量显著增长，可考虑接入 HMS 推送实现真正的离线推送（App 被强杀后仍可收到）
5. **推送策略遥测** — 统计各策略的使用比例和消息送达率

## 14. 风险与缓解措施

### 风险 1: 华为系统杀前台服务

**风险**：华为 EMUI/HarmonyOS 的电池管理可能在一段时间后杀死前台服务。

**缓解**：
- 前台服务使用 `FOREGROUND_SERVICE_SPECIAL_USE` 类型，优先级较高
- 未来可添加省电白名单引导（阶段外）
- 当前接受 App 被强杀后消息丢失

### 风险 2: GMS 检测误判

**风险**：某些设备有 GMS 但 FCM token 获取超时/失败，被误判为无 GMS。

**缓解**：
- 降级策略为启动前台服务（保守策略），最坏情况是多一个常驻通知
- 通过 client_log 上报检测结果，可在服务端监控误判率
- 检测结果缓存，避免重复检测

### 风险 3: Socket.io 长连接后台断开

**风险**：Android 系统在后台限制网络活动，Socket.io 连接可能被断开。

**缓解**：
- 前台服务提升进程优先级，系统对前台服务的网络限制更宽松
- Socket.io 已配置 `reconnection: true` 和 `reconnectionAttempts: Infinity`
- 断线重连时自动重新登录（现有逻辑）

### 风险 4: 用户对常驻通知不满

**风险**：部分用户可能不喜欢通知栏始终有一个常驻通知。

**缓解**：
- 常驻通知文案清晰说明用途（"聊天连接保持中"）
- 架构预留策略 B 开关，未来可让用户自行关闭
- 常驻通知优先级设为最低（PRIORITY_LOW），视觉上不突兀

## 15. 附录

### 相关文件

| 文件路径 | 说明 |
|---------|------|
| `android/src/composables/useNativeFeatures.js` | 原生能力封装（前台服务、FCM、通知等） |
| `android/src/composables/useSocket.js` | Socket.io 连接管理和业务逻辑 |
| `android/src/main.js` | App 初始化入口 |
| `android/android/app/src/main/java/com/smilemsg/app/SmileMsgFirebaseService.java` | FCM 消息接收服务 |
| `android/android/app/src/main/AndroidManifest.xml` | 权限和服务声明 |

### 关键依赖

- [@capawesome-team/capacitor-android-foreground-service](https://github.com/capawesome-team/capacitor-plugins) — Capacitor 前台服务插件
- [@capacitor-firebase/messaging](https://github.com/niceplugin/capacitor-firebase) — Capacitor Firebase Messaging 插件
- [@capacitor/local-notifications](https://capacitorjs.com/docs/apis/local-notifications) — Capacitor 本地通知插件

### 问题背景日志

```
[FCM] 用户登录: nickname=小朱, platform=android, ua=...ALN-AL00 Build/HUAWEIALN-AL00...
[FCM] token 注册检查 (登录后5s): user=小朱, hasToken=false
[FCM-client] (小朱): getFcmToken=null
[FCM-client] (小朱): token 为 null，推送不可用
```
