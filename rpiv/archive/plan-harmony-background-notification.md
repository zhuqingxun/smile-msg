---
description: "功能实施计划: HarmonyOS 后台消息通知"
status: archived
created_at: 2026-02-01T10:00:00
updated_at: 2026-02-01T12:45:00
archived_at: 2026-02-01T12:45:00
related_files:
  - rpiv/requirements/prd-harmony-background-notification.md
---

# 功能：HarmonyOS 后台消息通知

以下计划应该是完整的，但在开始实施之前，验证文档和代码库模式以及任务合理性非常重要。

特别注意现有工具、类型和模型的命名。从正确的文件导入等。

## 功能描述

补齐 SmileMsg 鸿蒙客户端的通知能力：
1. 启动时申请通知权限并创建社交通信类通知通道
2. 服务端推送参数优化（添加 `foreground_show: false` + `category: 'IM'`），使后台推送由系统自动展示通知栏，前台时不展示
3. 前台非当前会话时通过 Notification Kit 发布本地通知（为多会话扩展预留）
4. 前台在当前会话时仅振动（保持现有行为）

## 用户故事

作为 SmileMsg HarmonyOS 用户
我想要在应用后台时收到系统通知栏提醒
以便知道有人给我发了消息，不错过任何聊天

## 问题陈述

当前鸿蒙客户端缺少通知权限申请和前台本地通知能力。用户将应用切到后台后完全不知道有新消息，必须频繁切回应用查看。虽然服务端已具备华为推送下发能力，但客户端未申请通知权限导致推送无法展示在系统通知栏。

## 解决方案陈述

1. 在 `EntryAbility.onWindowStageCreate()` 的 `loadContent` 回调中申请通知权限并创建 `SOCIAL_COMMUNICATION` 通知通道（确保 Window 就绪后弹窗）
2. 服务端 `huaweiPush.js` 添加 `foreground_show: false` 和 `category: 'IM'`，使应用前台时系统不自动弹通知（由客户端精细控制），后台时正常展示，自分类审核通过后自动获得横幅提醒
3. 在 `EntryAbility.ets` 的消息回调中增加前台通知判断逻辑，不在当前会话时通过 Notification Kit 发布本地通知
4. `NativeHelper.ets` 新增通知权限申请和本地通知发布方法

## 功能元数据

**功能类型**：新功能
**估计复杂度**：中
**主要受影响的系统**：HarmonyOS 客户端（NativeHelper、EntryAbility）、服务端（huaweiPush.js）
**依赖项**：`@kit.NotificationKit`（HarmonyOS 系统模块，无需额外安装）

---

## 上下文参考

### 相关代码库文件（实施前必须阅读）

- `harmony/entry/src/main/ets/common/NativeHelper.ets`（全文 20 行）— 当前仅有振动功能，需新增通知权限申请和本地通知发布
- `harmony/entry/src/main/ets/entryability/EntryAbility.ets`（全文 60 行）— 应用入口，`onWindowStageCreate` 中需新增权限申请和通道创建
- `harmony/entry/src/main/ets/common/SocketService.ets`（第 178-240 行）— `handleServerEvent` 中 `new_message` 事件处理和回调机制；第 222-236 行回调类型签名
- `harmony/entry/src/main/ets/common/AppState.ets`（全文 49 行）— AppStorage 全局状态，`phase` 用于判断当前视图；第 18-25 行 `ChatMessage` 接口定义
- `harmony/AppScope/app.json5`（全文 10 行）— bundleName: `com.smilemsg.harmony`
- `server/src/huaweiPush.js`（第 62-115 行）— `sendHuaweiPush` 函数，需添加 `foreground_show` 和 `category` 参数

### 要创建的新文件

无新文件。所有修改在现有文件上进行。

### 相关文档

- [HarmonyOS notificationManager API 文档](https://developer.huawei.com/consumer/en/doc/harmonyos-references/js-apis-notificationmanager)
  - `requestEnableNotification`、`addSlot`、`publish`、`cancelAll` API
  - 原因：本地通知发布的核心 API
- [PushKit 在 IM 消息通知场景最佳实践](https://segmentfault.com/a/1190000046804407)
  - `foreground_show` 参数行为、IM 场景 category 配置
  - 原因：理解 Push Kit 与 Notification Kit 的配合策略
- [HarmonyOS Next Notification Kit 介绍与实战](https://segmentfault.com/a/1190000046818755)
  - 完整的通知创建和发布示例
  - 原因：参考实战代码模式

### 要遵循的模式

**ArkTS 严格模式类定义：**
SocketService.ets 中所有数据对象都使用 class 定义并初始化默认值（如 `class LoginData`、`class PushTokenData`），不使用 interface 字面量。新增的类型也应遵循此模式。

**导入规范：**
使用 `@kit.xxx` 模块系统，如 `import { vibrator } from '@kit.SensorServiceKit'`、`import { pushService } from '@kit.PushKit'`。

**错误处理模式：**
```
try {
  // 操作
} catch (err) {
  const e = err as BusinessError
  console.error('[Tag] 描述:', e.code, e.message)
}
```

**日志标签：**
使用 `[Push]`、`[WS]`、`[vibrate]` 格式的方括号标签前缀。通知相关使用 `[Notification]`。

**AppStorage 状态访问：**
使用 `AppStorage.get<Type>('key')` 读取、`AppStorage.set('key', value)` 写入。

---

## 实施计划

### 阶段 1：服务端推送参数优化

修改 `huaweiPush.js`，在推送消息体的 `android.notification` 中添加 `foreground_show: false` 和 `category: 'IM'`。前者使应用前台时系统不自动弹通知（由客户端 Notification Kit 接管），后台时正常弹通知；后者配合 AGC 自分类权益，审核通过后自动获得横幅提醒。

### 阶段 2：客户端通知权限申请与通道创建

在 `NativeHelper.ets` 中新增通知权限申请、通道创建、本地通知发布、取消通知四个方法。在 `EntryAbility.ets` 的 `onWindowStageCreate` 的 `loadContent` 回调中调用权限申请和通道创建（确保 Window 就绪）。

### 阶段 3：前台本地通知

修改 `EntryAbility.ets` 的消息回调注册，根据应用状态（是否在当前会话）决定是否发布本地通知。

---

## 逐步任务

### 任务 1：UPDATE `server/src/huaweiPush.js` — 添加 `foreground_show` 和 `category`

- **IMPLEMENT**：在 `sendHuaweiPush` 函数的 `android.notification` 对象中添加 `foreground_show: false` 和 `category: 'IM'`
- **PATTERN**：`server/src/huaweiPush.js:88-92`，现有 `android.notification` 结构
- **具体修改位置**：第 89-91 行，在 `click_action: { type: 1 }` 后添加两个字段

变更前（第 88-92 行）：
```javascript
          android: {
            notification: {
              click_action: { type: 1 }
            }
          }
```

变更后：
```javascript
          android: {
            notification: {
              click_action: { type: 1 },
              foreground_show: false,
              category: 'IM'
            }
          }
```

- **GOTCHA**：
  - `foreground_show` 是华为 Push Kit REST API v2 的字段名，使用下划线命名（snake_case），不是驼峰
  - `category: 'IM'` 需配合 AGC 自分类权益审核。审核未通过时此字段被忽略，不影响推送本身；审核通过后自动生效横幅提醒
- **VALIDATE**：`cd server && node -c src/huaweiPush.js` 语法检查通过；`pnpm dev:server` 启动无异常

### 任务 2：UPDATE `harmony/entry/src/main/ets/common/NativeHelper.ets` — 新增通知能力

- **IMPLEMENT**：保留现有 `vibrateOnMessage()` 函数不动，新增四个导出函数：
  1. `requestNotificationPermission(context)` — 检查并申请通知权限
  2. `createNotificationSlot()` — 创建社交通信类通知通道
  3. `publishLocalNotification(senderNickname, content)` — 发布本地通知
  4. `cancelAllNotifications()` — 取消所有通知

- **IMPORTS**：在文件顶部添加（保留现有 `vibrator` 导入）：
  ```typescript
  import { notificationManager } from '@kit.NotificationKit'
  import { wantAgent, WantAgent, common } from '@kit.AbilityKit'
  import { BusinessError } from '@kit.BasicServicesKit'
  ```

- **PATTERN**：遵循 NativeHelper.ets 现有的错误处理模式（try/catch + console.error）

- **详细实现规范**：

在现有 `vibrateOnMessage()` 函数之后，追加以下代码：

**`requestNotificationPermission`：**
```typescript
/**
 * 检查并申请通知权限
 */
export async function requestNotificationPermission(context: common.UIAbilityContext): Promise<void> {
  try {
    const enabled = await notificationManager.isNotificationEnabled()
    if (!enabled) {
      await notificationManager.requestEnableNotification(context)
      console.info('[Notification] 通知权限已授权')
    } else {
      console.info('[Notification] 通知权限已开启')
    }
  } catch (err) {
    const e = err as BusinessError
    if (e.code === 1600004) {
      console.warn('[Notification] 用户拒绝通知权限')
    } else {
      console.error('[Notification] 请求通知权限失败:', e.code, e.message)
    }
  }
}
```

**`createNotificationSlot`：**
```typescript
/**
 * 创建社交通信类通知通道
 */
export async function createNotificationSlot(): Promise<void> {
  try {
    await notificationManager.addSlot(notificationManager.SlotType.SOCIAL_COMMUNICATION)
    console.info('[Notification] 社交通信通知通道创建成功')
  } catch (err) {
    const e = err as BusinessError
    console.error('[Notification] 通知通道创建失败:', e.code, e.message)
  }
}
```

**`publishLocalNotification`：**
```typescript
let notificationId: number = 0

/**
 * 发布本地通知（前台非当前会话时调用）
 */
export async function publishLocalNotification(senderNickname: string, content: string): Promise<void> {
  try {
    // 构造 WantAgent：点击通知拉起应用
    const wantAgentInfo: wantAgent.WantAgentInfo = {
      wants: [
        {
          bundleName: 'com.smilemsg.harmony',
          abilityName: 'EntryAbility'
        }
      ],
      actionType: wantAgent.OperationType.START_ABILITY,
      requestCode: 0,
      actionFlags: [wantAgent.WantAgentFlags.UPDATE_PRESENT_FLAG]
    }
    const wantAgentObj: WantAgent = await wantAgent.getWantAgent(wantAgentInfo)

    // 截断内容
    const truncatedContent = content.length > 100 ? content.substring(0, 100) + '...' : content

    // 发布通知
    const request: notificationManager.NotificationRequest = {
      id: notificationId++,
      slotType: notificationManager.SlotType.SOCIAL_COMMUNICATION,
      content: {
        notificationContentType: notificationManager.ContentType.NOTIFICATION_CONTENT_BASIC_TEXT,
        normal: {
          title: `${senderNickname} 发来消息`,
          text: truncatedContent
        }
      },
      wantAgent: wantAgentObj
    }

    await notificationManager.publish(request)
    console.info('[Notification] 本地通知已发布:', senderNickname)
  } catch (err) {
    const e = err as BusinessError
    console.error('[Notification] 发布通知失败:', e.code, e.message)
  }
}
```

**`cancelAllNotifications`：**
```typescript
/**
 * 取消所有通知（进入前台时调用）
 */
export function cancelAllNotifications(): void {
  notificationManager.cancelAll().catch((err: BusinessError) => {
    console.error('[Notification] 取消通知失败:', err.code, err.message)
  })
}
```

- **GOTCHA**：
  - `notificationId` 使用模块级 `let` 变量递增（与 SocketService.ets 中 `let ackCounter` 模式一致），不同消息独立展示在通知栏（单应用上限 24 条）
  - `wantAgent.WantAgentInfo` 的字段名在 HarmonyOS NEXT 中是 `actionType` 和 `actionFlags`（不是旧版的 `operationType` 和 `wantAgentFlags`）
  - `bundleName` 必须与 `app.json5` 中一致：`com.smilemsg.harmony`
  - NativeHelper.ets 当前没有 `BusinessError` 导入，需新增
  - `import { common } from '@kit.AbilityKit'` 用于 `UIAbilityContext` 类型参数
- **VALIDATE**：DevEco Studio 编译无报错

### 任务 3：UPDATE `harmony/entry/src/main/ets/entryability/EntryAbility.ets` — 启动时初始化通知 + 前台清除

- **IMPLEMENT**：
  1. 在 `onWindowStageCreate` 的 `loadContent` 回调中调用 `requestNotificationPermission(this.context)` 和 `createNotificationSlot()`（确保 Window 就绪后弹权限弹窗）
  2. 在 `onForeground` 中调用 `cancelAllNotifications()`（进入前台时清除通知栏）

- **IMPORTS**：修改现有 NativeHelper 导入行（第 10 行），从：
  ```typescript
  import { vibrateOnMessage } from '../common/NativeHelper'
  ```
  改为：
  ```typescript
  import { vibrateOnMessage, requestNotificationPermission, createNotificationSlot, cancelAllNotifications, publishLocalNotification } from '../common/NativeHelper'
  ```

  新增 AppState 的 ChatMessage 导入：
  ```typescript
  import { initAppState, ChatMessage } from '../common/AppState'
  ```
  （修改现有第 6 行的 AppState 导入）

- **PATTERN**：`harmony/entry/src/main/ets/entryability/EntryAbility.ets:36-44`，现有 `onWindowStageCreate` 结构

- **具体修改**：

**修改 1 — onWindowStageCreate 中增加通知初始化（第 36-44 行）**

变更前：
```typescript
  onWindowStageCreate(windowStage: window.WindowStage): void {
    hilog.info(0x0000, 'SmileMsg', 'onWindowStageCreate')

    windowStage.loadContent('pages/Index', () => {
      // 键盘弹出时缩小窗口而非整体上推，保持顶部栏可见
      const mainWindow = windowStage.getMainWindowSync()
      mainWindow.getUIContext().setKeyboardAvoidMode(KeyboardAvoidMode.RESIZE)
    })
  }
```

变更后：
```typescript
  onWindowStageCreate(windowStage: window.WindowStage): void {
    hilog.info(0x0000, 'SmileMsg', 'onWindowStageCreate')

    windowStage.loadContent('pages/Index', () => {
      // 键盘弹出时缩小窗口而非整体上推，保持顶部栏可见
      const mainWindow = windowStage.getMainWindowSync()
      mainWindow.getUIContext().setKeyboardAvoidMode(KeyboardAvoidMode.RESIZE)

      // 申请通知权限并创建通知通道（Window 就绪后执行，确保弹窗正常）
      requestNotificationPermission(this.context)
      createNotificationSlot()
    })
  }
```

**修改 2 — onForeground 中增加清除通知（第 46-50 行）**

变更前：
```typescript
  onForeground(): void {
    hilog.info(0x0000, 'SmileMsg', 'onForeground')
    notifyAppState(false)
    reconnectIfNeeded()
  }
```

变更后：
```typescript
  onForeground(): void {
    hilog.info(0x0000, 'SmileMsg', 'onForeground')
    cancelAllNotifications()
    notifyAppState(false)
    reconnectIfNeeded()
  }
```

- **GOTCHA**：
  - `requestNotificationPermission` 和 `createNotificationSlot` 都是 async 函数但无需 await，不阻塞后续逻辑。权限弹窗由系统管理，仅首次弹出
  - 在 `loadContent` 回调中使用 `this.context` 需要注意箭头函数的 `this` 绑定。当前代码 `loadContent('pages/Index', () => { ... })` 已使用箭头函数，`this` 正确指向 `EntryAbility` 实例
  - `cancelAllNotifications()` 放在 `notifyAppState(false)` 之前，确保进入前台后立即清除通知
- **VALIDATE**：DevEco Studio 编译无报错

### 任务 4：UPDATE `harmony/entry/src/main/ets/entryability/EntryAbility.ets` — 前台通知判断逻辑

- **IMPLEMENT**：修改 `onCreate` 中注册的 `onNewMessageCallback`，从简单的振动变为"振动 + 条件发布本地通知"。

**核心判断逻辑**：

```
新消息到达（onNewMessageReceived 回调）
  ├─ 振动（始终执行）
  ├─ 当前 phase === 'chat'
  │   └─ 不弹通知（用户正在聊天页面看消息）
  └─ 当前 phase !== 'chat'（'login' 或 'idle'）
      └─ 发布本地通知（为多会话扩展预留，当前单会话架构下此分支不会触发）
```

> **架构说明**：在当前单会话架构下，`onNewMessageReceived` 仅在 `convId === myConvId` 时触发（SocketService.ets:186），此时 `phase` 必定为 `'chat'`。因此 `phase !== 'chat'` 分支当前不会执行。此逻辑保留是为未来多会话扩展预留能力，代码量极小且不影响现有行为。

- **PATTERN**：`harmony/entry/src/main/ets/entryability/EntryAbility.ets:26-29`，现有回调注册

- **具体修改位置和内容**：

修改 `onCreate` 方法中第 27-29 行的回调注册，从：
```typescript
    setOnNewMessageCallback(() => {
      vibrateOnMessage()
    })
```
改为：
```typescript
    setOnNewMessageCallback((msg: ChatMessage) => {
      vibrateOnMessage()
      // 前台通知判断：不在当前聊天页面时发布本地通知
      const phase = AppStorage.get<string>('phase') || ''
      if (phase !== 'chat') {
        publishLocalNotification(msg.senderNickname || '新消息', msg.content)
      }
    })
```

- **IMPORTS**：已在任务 3 中完成全部导入（`ChatMessage` 从 AppState，`publishLocalNotification` 从 NativeHelper）。无需额外添加
- **GOTCHA**：
  - `onNewMessageCallback` 的类型签名是 `(msg: ChatMessage) => void`（SocketService.ets:223、226），`msg` 参数在 SocketService.ets:234-235 传递，无需修改 SocketService 中任何代码
  - `msg.senderNickname` 是可选字段（`senderNickname?: string`，AppState.ets:21），使用 `msg.senderNickname || '新消息'` 做兜底
  - `conversation_created` 的回调（第 31-33 行）保持仅振动不变，因为 `conversation_created` 事件会立即将 phase 设为 'chat'（SocketService.ets:200），此时用户已进入聊天页面
- **VALIDATE**：DevEco Studio 编译无报错

---

## 测试策略

### 手动测试（无自动化测试框架）

本项目无 lint 和测试配置。所有验证通过手动测试和 DevEco Studio 编译检查完成。

### 边缘情况

1. 用户拒绝通知权限 → 应用正常运行，不崩溃，后台无通知（但 WebSocket 实时消息不受影响）
2. 通知通道创建失败 → 捕获异常记录日志，不影响核心功能
3. WantAgent 创建失败 → 捕获异常记录日志，通知不发布但不崩溃
4. 连续快速收到多条消息 → notificationId 递增，每条消息独立展示（上限 24 条/应用）
5. 应用从后台切回前台 → `cancelAllNotifications()` 清除通知栏，避免残留
6. 应用冷启动（首次安装）→ 权限弹窗正常弹出，同时通道创建成功

---

## 验证命令

### 级别 1：语法和编译

服务端：
```bash
cd server && node -c src/huaweiPush.js
```

客户端：
在 DevEco Studio 中 Build → Build Hap(s)/APP(s) → Build Hap(s)，确认编译成功

### 级别 2：服务端运行验证

```bash
pnpm dev:server
```
观察启动日志无异常，`[PushKit]` 日志正常

### 级别 3：手动验证

**场景 1 — 通知权限申请：**
1. 卸载应用后重新安装运行
2. 首次启动应弹出系统通知权限弹窗
3. 点击"允许"后查看日志：`[Notification] 通知权限已授权`

**场景 2 — 后台通知：**
1. 设备 A 登录用户 Alice，设备 B 登录用户 Bob
2. Alice 和 Bob 建立聊天
3. Bob 将应用切到后台
4. Alice 发送消息"你好"
5. 预期：Bob 设备通知栏出现"Alice 发来消息: 你好"（横幅提醒需 AGC 自分类审核通过）

**场景 3 — 前台当前会话内不弹通知：**
1. Alice 和 Bob 正在聊天（Bob 的 phase='chat'）
2. Alice 发送消息
3. 预期：消息出现在聊天列表，Bob 手机振动，不弹通知

**场景 4 — 通知点击拉起应用：**
1. Bob 在后台收到通知
2. 点击通知
3. 预期：应用从后台拉起到前台

**场景 5 — 进入前台清除通知：**
1. Bob 收到多条通知
2. 手动切换到 SmileMsg 前台
3. 预期：通知栏中 SmileMsg 的通知全部清除

**场景 6 — 拒绝权限后的行为：**
1. 首次启动时拒绝通知权限
2. 正常使用聊天功能
3. 预期：应用功能正常，无崩溃，后台无通知

---

## 验收标准

- [ ] 首次启动弹出通知权限请求弹窗（Window 就绪后弹出）
- [ ] 应用在后台时，收到新消息后系统通知栏显示提醒（标题 + 正文）
- [ ] 应用在前台且在当前会话中时，不弹通知（仅振动）
- [ ] 点击通知可拉起应用到前台
- [ ] 进入前台时自动清除通知栏
- [ ] 用户拒绝通知权限时应用不崩溃
- [ ] 服务端推送参数包含 `foreground_show: false` 和 `category: 'IM'`
- [ ] 所有代码编译通过无错误

---

## 完成检查清单

- [ ] 所有 4 个任务按顺序完成
- [ ] 服务端 `huaweiPush.js` 语法检查通过（`node -c`）
- [ ] DevEco Studio 编译通过
- [ ] 手动测试确认所有场景正确
- [ ] 所有验收标准均满足

---

## 备注

### 设计决策

1. **不使用 `pushService.receiveMessage` 回调**：SmileMsg 已有 WebSocket 实时消息通道，前台时消息通过 WebSocket 实时送达。前台通知判断直接在 `onNewMessageCallback` 中实现更简单可靠，无需引入 Push Kit 前台回调的额外复杂度。因此也不需要在 module.json5 中添加 `action.ohos.push.listener` skill 声明。

2. **通知权限在 `onWindowStageCreate` 的 `loadContent` 回调中请求**：华为文档建议在 Window 创建后请求通知权限，避免弹窗无法正常显示。`loadContent` 回调在页面加载完成后执行，此时 Window 已就绪，是安全的请求时机。

3. **`foreground_show: false` 的安全性**：设置此参数后，前台时系统不展示推送通知。但前台时 WebSocket 连接正常，消息通过实时通道送达，由客户端决定是否弹本地通知。后台时推送通知正常展示。不存在消息丢失风险。

4. **`category: 'IM'` 先添加后审核**：即使 AGC 自分类权益尚未审核通过，添加 `category` 字段不影响推送本身（未知 category 被忽略）。审核通过后横幅提醒自动生效，无需再次代码修改。

5. **通知 ID 使用递增数字而非固定 ID**：每条消息使用不同 ID，确保多条消息独立展示在通知栏。如果使用固定 ID，新消息会覆盖旧通知，用户可能漏看。

6. **前台本地通知作为预留能力**：当前单会话架构下 `phase !== 'chat'` 分支不会触发（new_message 回调仅在 convId 匹配时执行，此时 phase 必为 'chat'）。保留此逻辑是为未来多会话扩展预留，代码量极小（3 行），不影响现有行为和性能。

### 风险

1. **AGC 自分类权益未通过审核**：审核期间推送为静默通知（无横幅），代码逻辑不受影响，审核通过后自动生效。
2. **`foreground_show` 字段名差异**：华为 Push Kit REST API v2 使用 snake_case（`foreground_show`）。如果实际 API 版本有差异，需在推送测试中确认。
3. **`wantAgent.WantAgentInfo` 字段名差异**：HarmonyOS NEXT 使用 `actionType`/`actionFlags`，旧版使用 `operationType`/`wantAgentFlags`。需确保 SDK 版本匹配（当前目标 API 6.0.2(22)，应为新版字段名）。

### 文件修改清单

| # | 文件 | 操作类型 | 修改内容 |
|---|------|---------|---------|
| 1 | `server/src/huaweiPush.js` | UPDATE | `android.notification` 添加 `foreground_show: false` 和 `category: 'IM'` |
| 2 | `harmony/.../NativeHelper.ets` | UPDATE | 新增 4 个导出函数 + 3 个新导入 |
| 3 | `harmony/.../EntryAbility.ets` | UPDATE | 修改 2 个导入行 + `onWindowStageCreate` 添加权限初始化 + `onForeground` 添加清除通知 + 修改消息回调 |

### 信心分数：8.5/10

扣分原因：
- Push Kit `foreground_show` 和 `category` 参数需实际推送验证（-1）
- `wantAgent.WantAgentInfo` 字段名需编译验证（-0.5）
