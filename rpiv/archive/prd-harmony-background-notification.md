---
description: "产品需求文档: HarmonyOS 后台消息通知"
status: archived
created_at: 2026-01-31T20:00:00
updated_at: 2026-02-01T12:45:00
archived_at: 2026-02-01T12:45:00
---

# HarmonyOS 后台消息通知

## 1. 执行摘要

SmileMsg 鸿蒙客户端当前已实现 Push Kit token 获取与服务端注册、前后台状态上报、以及服务端华为推送下发的完整链路。但客户端缺少通知权限申请和前台本地通知能力，导致用户在后台时无法收到系统通知栏提醒。

本需求的核心是：**补齐鸿蒙客户端的通知权限申请，并优化服务端推送参数，使 Push Kit 通知消息在后台时自动显示系统通知栏；同时在前台时通过 Notification Kit 展示本地通知（仅当用户不在当前聊天页面时）。**

根据调研，华为 Push Kit 的**通知消息（notification message）在应用后台时由系统自动展示通知栏**，无需客户端手动创建。客户端需要做的是：确保通知权限已授权、创建合适的通知通道（NotificationSlot）、以及在前台时处理通知展示逻辑。

MVP 目标：用户将应用切到后台后，收到新消息时能看到系统通知栏提示（标题 + 内容预览 + 横幅弹出提醒），点击通知可拉起应用。

> **重要前提**：要实现横幅弹出提醒（而非静默通知），需要在 AppGallery Connect 后台完成 Push Kit 开通和通知消息自分类权益申请。本 PRD 包含 AGC 配置操作指南和代码实现两部分。

## 2. 使命

让 SmileMsg 鸿蒙用户在不盯着屏幕的情况下也不会错过任何消息。

核心原则：

- **可靠送达** — 后台消息必须触达系统通知栏，这是即时通讯的基本保障
- **不打扰** — 前台且正在当前会话中时不弹通知，避免重复干扰
- **最小改动** — 复用已有的 Push Kit + 服务端推送链路，仅补齐客户端缺失环节
- **权限透明** — 首次启动时明确请求通知权限，用户可拒绝

## 3. 目标用户

- **主要用户**: SmileMsg HarmonyOS NEXT 用户（华为手机）
- **技术水平**: 普通用户，不了解推送机制细节
- **核心痛点**: 将应用切到后台后，完全不知道有人发消息过来，必须频繁切回应用查看
- **期望**: 像微信等 IM 应用一样，后台时能在通知栏看到新消息提醒

## 4. MVP 范围

### 范围内

**AGC 配置（人工操作）：**
- ✅ 在 AppGallery Connect 创建项目并关联应用（如尚未创建）
- ✅ 开通 Push Kit 推送服务
- ✅ 申请通知消息自分类权益（归为"即时通讯"类，获得横幅提醒）
- ✅ 获取 Client ID 并配置到项目 `module.json5`

**代码实现：**
- ✅ 客户端申请通知权限（`notificationManager.requestEnableNotification()`）
- ✅ 创建 IM 社交通信类通知通道（`SlotType.SOCIAL_COMMUNICATION`）
- ✅ 服务端推送参数优化：设置 `foregroundShow: false` + 添加 `category` 分类标识
- ✅ 前台本地通知：应用在前台但不在当前聊天会话时，通过 Notification Kit 发布本地通知
- ✅ 前台当前会话内：不弹通知（已有振动反馈）
- ✅ 通知点击行为：拉起应用到前台

### 范围外

- ❌ 通知点击后自动跳转到对应聊天会话（仅拉起应用）
- ❌ 自定义通知铃声（需华为审核"社交通讯"应用标签权益）
- ❌ 桌面角标（未读数）管理
- ❌ 通知分组/折叠
- ❌ 应用被杀死（进程不存在）时的通知（仅需后台支持，Push Kit 通知消息本身已覆盖此场景）

## 5. 用户故事

1. **作为用户，我想要在应用后台时收到系统通知栏提醒，以便知道有人给我发了消息**
   - 场景：用户正在刷微博，SmileMsg 在后台，对方发来消息"你好"，通知栏出现"张三 发来消息: 你好"

2. **作为用户，我想要首次打开应用时被询问是否允许通知，以便我能控制通知行为**
   - 场景：首次安装后打开应用，弹出系统通知权限弹窗，用户选择"允许"

3. **作为用户，我想要在聊天页面内收到消息时不弹通知，以便不被重复打扰**
   - 场景：用户正在和张三聊天，张三发来新消息，消息直接出现在聊天界面，不弹系统通知

4. **作为用户，我想要在应用前台但未在聊天页面时收到本地通知，以便知道有新消息**
   - 场景：用户在登录页或空闲状态页，对方发来消息，应用通过 Notification Kit 在通知栏展示提醒

5. **作为用户，我想要点击通知后打开应用，以便查看消息**
   - 场景：用户看到通知栏的消息提醒，点击后应用从后台拉起到前台

## 6. 核心架构与模式

### 现有推送链路（无需修改核心逻辑）

```
消息发送 → chatLogic.js 检测对端状态 → push.js 路由 → huaweiPush.js → Push Kit REST API → 华为推送服务器 → 设备系统通知栏（后台自动展示）
```

### 需要修改的部分

**服务端**（`huaweiPush.js`）：
- 在推送消息体中添加 `foregroundShow: false`，使应用前台时系统不自动弹通知
- 前台通知由客户端 Notification Kit 接管，实现精细化控制

**客户端**（新增/修改）：
- `NativeHelper.ets` — 新增通知权限申请 + 本地通知发布能力
- `EntryAbility.ets` — 启动时申请通知权限 + 创建通知通道
- `SocketService.ets` — `onNewMessageReceived` 回调中增加前台通知判断逻辑

### 通知展示决策矩阵

| 应用状态 | 在当前会话 | 通知方式 | 负责方 |
|---------|-----------|---------|-------|
| 后台 | — | 系统通知栏（Push Kit 自动） | 华为推送服务器 |
| 前台 | 是 | 仅振动，不弹通知 | 客户端 NativeHelper |
| 前台 | 否 | 本地通知（Notification Kit） | 客户端 NativeHelper |

## 7. 工具/功能

### 7.1 通知权限申请

- 使用 `notificationManager.isNotificationEnabled()` 检查当前授权状态
- 未授权时调用 `notificationManager.requestEnableNotification(context)` 弹窗请求
- 时机：`EntryAbility.onCreate()` 中，在 `initAppState()` 之后执行

### 7.2 通知通道创建

- 创建 `SlotType.SOCIAL_COMMUNICATION` 类型通道，支持横幅、锁屏、铃声、振动全通道提醒
- 时机：与通知权限申请同步，在 `EntryAbility.onCreate()` 中执行一次

### 7.3 前台本地通知

- 当 `onNewMessageReceived` 触发时，检查当前是否在该会话的聊天页面
- 不在当前会话 → 通过 `notificationManager.publish()` 发布本地通知
- 在当前会话 → 仅振动（保持现有行为）
- 通知内容：标题 = `"{发送者昵称} 发来消息"`，正文 = 消息内容（截断100字）

### 7.4 服务端推送参数优化

- `huaweiPush.js` 中的 `android.notification` 增加 `foreground_show: false`
- 效果：应用前台时系统不弹通知，后台时正常弹通知

## 8. 技术栈

### 客户端新增依赖

| 模块 | 用途 |
|------|------|
| `@kit.NotificationKit` | 通知权限申请 + 本地通知发布 |

### 服务端

无新增依赖，仅修改 `huaweiPush.js` 推送消息体参数。

## 9. 安全与配置

### 9.1 AppGallery Connect 配置操作指南（人工操作）

以下步骤需要你在华为开发者后台手动完成，不涉及代码：

**步骤 1：创建项目和应用（如尚未创建）**

1. 登录 [AppGallery Connect](https://developer.huawei.com/consumer/cn/service/josp/agc/index.html)
2. 点击"我的项目" → "添加项目"，输入项目名（如 SmileMsg）
3. 在项目中点击"添加应用"，填写：
   - 包名：`com.smilemsg.harmony`（与 `app.json5` 中 `bundleName` 一致）
   - 应用类别选择"应用"
4. 完成创建后，在"项目设置"页面获取 **Client ID** 和 **Client Secret**（即现有的 `HUAWEI_APP_ID` 和 `HUAWEI_APP_SECRET`）

**步骤 2：开通 Push Kit**

1. 在项目左侧导航栏选择"增长" → "推送服务"
2. 点击"立即开通"
3. 如果弹出数据处理位置设置，选择"中国"（需与服务器和用户位置一致）
4. 在"项目设置" → "API 管理"中确认"推送服务"已开启

**步骤 3：申请通知消息自分类权益**

> 这是获得横幅弹出提醒的关键步骤。未申请时通知默认为"资讯营销类"静默通知。

1. 在"增长" → "推送服务" → "配置"页签
2. 找到"自分类权益"，点击"申请"
3. 选择标准场景 → "即时通讯"类
4. 填写场景描述：
   - 应用分类：社交通讯
   - 应用主要业务：一对一即时聊天
   - 推送对象：消费者（聊天对方）
   - 推送时机：用户收到新消息时
   - 推送触发条件：对方发送聊天消息，接收方应用在后台
5. 提供消息模板示例：标题="{昵称} 发来消息"，正文="{消息内容预览}"
6. 提交等待审核（通常数个工作日）

**步骤 4：配置签名证书指纹**

1. 在"项目设置" → "常规"中找到"SHA256 证书指纹"
2. 将 DevEco Studio 调试证书的 SHA256 指纹填入
3. 确保指纹与实际签名一致，否则 Push Token 获取会报错 `1000900010`

**步骤 5：获取 Client ID 配置到代码**

1. 在"项目设置"页面复制 Client ID
2. 配置到 `module.json5` 的 `metadata` 中（代码部分会处理）

### 9.2 应用安全

- 通知权限由系统弹窗管理，用户可随时在系统设置中关闭
- 通知内容仅包含发送者昵称和消息预览，不包含 UUID、token 等敏感信息
- 服务端 `HUAWEI_APP_ID` 和 `HUAWEI_APP_SECRET` 配置不变

## 10. API 规范

### 服务端推送消息体变更

**变更前**（`huaweiPush.js`）：
```json
{
  "message": {
    "token": ["..."],
    "notification": { "title": "...", "body": "..." },
    "android": {
      "notification": {
        "click_action": { "type": 1 }
      }
    }
  }
}
```

**变更后**：
```json
{
  "message": {
    "token": ["..."],
    "notification": { "title": "...", "body": "..." },
    "android": {
      "notification": {
        "click_action": { "type": 1 },
        "foreground_show": false
      }
    }
  }
}
```

## 11. 成功标准

### 功能要求

- ✅ 首次启动弹出通知权限请求弹窗
- ✅ 应用在后台时，收到新消息后系统通知栏显示提醒（标题 + 正文）
- ✅ 应用在前台且在当前会话中时，不弹通知（仅振动）
- ✅ 应用在前台但不在当前会话时，发布本地通知
- ✅ 点击通知可拉起应用到前台

### 质量指标

- 后台推送到达后，通知栏展示延迟 < 3 秒（取决于华为推送服务器）
- 通知权限申请流程无崩溃
- 前台通知判断逻辑准确，不出现"在聊天中仍弹通知"的情况

### 用户体验目标

- 用户无需任何额外操作即可享受后台通知（仅需首次授权）
- 通知内容清晰，一眼看出谁发的、说了什么

## 12. 实施阶段

### 阶段零：AppGallery Connect 配置（人工操作，前置条件）

- **目标**: 完成 Push Kit 开通和自分类权益申请，获取 Client ID
- **交付物**:
  - ✅ AGC 项目创建，Push Kit 开通
  - ✅ 通知消息自分类权益申请提交（"即时通讯"类）
  - ✅ 签名证书指纹配置
  - ✅ 获取 Client ID
- **验证**: AGC 后台显示 Push Kit 已开通；自分类权益审核通过后通知类别为"即时通讯"
- **注意**: 自分类权益审核需数个工作日。审核期间可先进行后续阶段的代码开发，但后台推送的通知提醒方式为静默通知。审核通过后自动升级为横幅提醒。

### 阶段一：服务端推送参数优化 + 客户端 Client ID 配置

- **目标**: 服务端推送参数添加自分类标识和前台展示控制；客户端配置 Client ID
- **交付物**:
  - ✅ `huaweiPush.js` 添加 `foreground_show: false` 和 `category`（自分类权益通过后生效）
  - ✅ `module.json5` 添加 `metadata` 配置 Client ID
- **验证**: 服务端日志确认推送成功，后台设备收到系统通知

### 阶段二：客户端通知权限与通道

- **目标**: 申请通知权限，创建社交通信类通知通道
- **交付物**:
  - ✅ `NativeHelper.ets` 新增 `requestNotificationPermission()` 和通道创建
  - ✅ `EntryAbility.ets` 启动时调用权限申请
- **验证**: 首次启动弹出系统权限弹窗，授权后 Push Kit 通知可正常展示在通知栏

### 阶段三：前台本地通知

- **目标**: 前台非当前会话时通过 Notification Kit 展示本地通知
- **交付物**:
  - ✅ `NativeHelper.ets` 新增 `publishLocalNotification()` 方法
  - ✅ `SocketService.ets` 的 `onNewMessageReceived` 回调增加前台通知判断
  - ✅ `EntryAbility.ets` 调整回调注册，传入必要上下文
- **验证**: 前台空闲状态收到消息时通知栏弹出提醒，聊天中不弹

## 13. 未来考虑

- **通知点击跳转到对应会话** — 通过 WantAgent 携带 conversationId 参数，点击通知后直接进入聊天页面
- **桌面角标** — 未读消息数显示在应用图标右上角
- **通知分组** — 同一用户的多条消息折叠为一组
- **自定义铃声** — 需申请华为"社交通讯"应用标签权益后才能生效
- **应用被杀死后的推送** — Push Kit 通知消息本身支持进程不存在时展示，如有需要可进一步验证

## 14. 风险与缓解措施

| 风险 | 影响 | 缓解 |
|------|------|------|
| 通知消息自分类权益审核周期不确定 | 审核期间推送为静默通知，无横幅提醒 | 代码开发不依赖审核结果，可并行进行；审核通过后自动生效 |
| 用户拒绝通知权限 | 无法展示任何通知 | 权限被拒后不反复弹窗，但在适当时机（如设置页）引导用户开启 |
| Push Kit token 获取失败 | 后台推送完全不可用 | 已有容错：`PushHelper.ets` catch 了异常并打印日志，不影响其他功能 |
| `foreground_show: false` 导致前台时系统不展示通知，但客户端本地通知逻辑有 bug | 前台时消息"丢失"感 | 分阶段实施，阶段一先只改服务端，在阶段三完成前保持 `foreground_show: true` |

## 15. 附录

### 调研参考

- [HarmonyOS Next PushKit 在 IM 消息通知场景最佳实践](https://segmentfault.com/a/1190000046804407)
- [HarmonyOS Next Notification Kit 介绍与实战](https://segmentfault.com/a/1190000046818755)
- [HarmonyOS Next: Notifications and reminders](https://www.harmony-developers.com/p/harmonyos-next-notifications-and)

### 相关文件

| 文件 | 说明 |
|------|------|
| `server/src/huaweiPush.js` | 服务端华为推送实现 |
| `server/src/handlers/chatLogic.js` | 推送决策逻辑（`trySendPush`） |
| `harmony/entry/src/main/ets/common/NativeHelper.ets` | 原生功能（振动，待新增通知） |
| `harmony/entry/src/main/ets/common/PushHelper.ets` | Push Kit token 获取 |
| `harmony/entry/src/main/ets/common/SocketService.ets` | WebSocket 通信 + 消息回调 |
| `harmony/entry/src/main/ets/entryability/EntryAbility.ets` | 应用入口能力 |
| `harmony/entry/src/main/module.json5` | 权限声明 |
