---
description: "产品需求文档: 系统托盘图标闪烁提醒"
status: archived
created_at: 2026-01-30T12:00:00
updated_at: 2026-01-30T14:30:00
archived_at: 2026-01-30T14:30:00
---

# 系统托盘图标闪烁提醒 — 产品需求文档

## 1. 执行摘要

SmileMsg 桌面客户端（Electron）当前在窗口最小化/隐藏到系统托盘后，用户无法感知新消息或新会话连接。本需求为桌面客户端增加**系统托盘图标闪烁提醒**功能，在窗口不可见时通过图标交替闪烁的方式提醒用户。

核心场景为两个：空闲状态下收到他人的握手连接成功（进入聊天），以及聊天状态下收到新消息。功能实现涉及主进程托盘闪烁定时器管理、IPC 监听、以及渲染进程窗口可见性检测。由于现有 preload 已通过 `@electron-toolkit/preload` 暴露了 `ipcRenderer`，无需修改 preload 脚本。

MVP 目标：用户在窗口隐藏到托盘后，能通过托盘图标闪烁及时感知新事件，点击托盘或回到窗口后闪烁自动停止。

## 2. 使命

为 SmileMsg 桌面用户提供轻量、不打扰的消息提醒机制，确保即使窗口最小化也不会错过重要通信。

### 核心原则

1. **轻量无侵入** — 仅使用托盘图标闪烁，不弹窗、不发声、不干扰用户当前工作
2. **即时响应** — 事件触发后立即开始闪烁，无延迟
3. **自然停止** — 用户回到应用（任何方式）后自动停止闪烁，无需额外操作
4. **最小改动** — 复用现有托盘基础设施，仅添加闪烁逻辑和 IPC 通道

## 3. 目标用户

### 主要用户角色

- SmileMsg 桌面客户端用户（Windows 平台）

### 技术舒适度

- 普通用户，熟悉 Windows 系统托盘交互习惯

### 关键用户需求和痛点

- **痛点**：窗口隐藏到托盘后，完全无法知道是否有人发起聊天或发来消息，可能导致长时间未回复
- **需求**：在不打开窗口的情况下，能通过托盘图标视觉变化感知新事件

## 4. MVP 范围

### 范围内

- ✅ 托盘图标闪烁（原图标与透明空白图标交替，500ms 间隔）
- ✅ 触发场景 1：空闲状态下收到 `conversation_created` 事件（握手连接成功）
- ✅ 触发场景 2：聊天状态下收到 `new_message` 事件（新消息）
- ✅ 仅在窗口不可见时触发闪烁
- ✅ 点击托盘图标：停止闪烁 + 恢复原图标 + 显示并聚焦窗口
- ✅ 窗口获得焦点时自动停止闪烁
- ✅ 渲染进程 → 主进程 IPC 通道（`tray:flash-start`），复用现有 `window.electron.ipcRenderer`

### 范围外

- ❌ 声音/提示音提醒
- ❌ Windows 原生通知（Toast Notification）
- ❌ 托盘 tooltip 文字变更
- ❌ 任务栏按钮闪烁（`flashFrame`）
- ❌ 未读消息计数角标
- ❌ macOS / Linux 平台适配
- ❌ 用户自定义闪烁频率/开关设置

## 5. 用户故事

### US-1：窗口隐藏时收到握手通知

> 作为 SmileMsg 桌面用户，我在窗口最小化到托盘后，当有人向我发起聊天连接成功时，我希望托盘图标闪烁提醒我，以便我及时回到应用开始对话。

**示例**：用户 A 将窗口最小化到托盘后继续工作。用户 B 向 A 发起私聊，服务端广播 `conversation_created`，A 的托盘图标开始闪烁。A 注意到闪烁后点击托盘图标，窗口恢复并直接进入聊天界面。

### US-2：窗口隐藏时收到新消息

> 作为 SmileMsg 桌面用户，我在聊天过程中将窗口最小化后，当对方发来新消息时，我希望托盘图标闪烁，以便我知道有新消息需要查看。

**示例**：用户 A 正在与 B 聊天，A 最小化窗口去处理其他事务。B 发送一条消息，A 的托盘图标开始闪烁。A 看到闪烁后点击托盘恢复窗口，看到 B 的新消息。

### US-3：回到应用后闪烁自动停止

> 作为 SmileMsg 桌面用户，我通过任何方式回到应用窗口后（点击托盘、Alt+Tab、任务栏），我希望闪烁自动停止，以便我不需要做额外操作。

### US-4：窗口可见时不闪烁

> 作为 SmileMsg 桌面用户，当我的应用窗口正在前台显示时，即使收到新消息，托盘图标也不应闪烁，以免造成不必要的干扰。

### US-5：连续消息不重复触发

> 作为 SmileMsg 桌面用户，当托盘已经在闪烁时，收到更多新消息不应导致异常行为（如闪烁加速或多个定时器叠加），闪烁应保持稳定节奏。

## 6. 核心架构与模式

### 通信链路

```
Socket.io 事件（渲染进程）
    → useSocket.js 判断 document.hidden
    → window.electron.ipcRenderer.send('tray:flash-start')  // 复用现有 electronAPI
    → 主进程 ipcMain.on('tray:flash-start') 接收
    → 启动托盘图标闪烁定时器（500ms 交替）
    → 窗口 focus 事件 / 托盘点击 → 停止闪烁、恢复原图标
```

### 关键设计决策

1. **复用现有 IPC 基础设施**：`@electron-toolkit/preload` 已通过 `window.electron.ipcRenderer` 暴露了 `send/on/invoke` 方法，无需修改 preload 脚本，渲染进程直接调用 `window.electron.ipcRenderer.send('tray:flash-start')`
2. **窗口可见性检测位置**：在渲染进程中通过 `document.hidden` 判断，仅在窗口不可见时发送 IPC
3. **闪烁状态管理**：主进程维护一个 `setInterval` 定时器引用，防止重复启动
4. **空白图标**：使用 `nativeImage.createEmpty()` 创建 1x1 透明图标，与原图标交替显示
5. **IPC 方向**：单向通信（渲染 → 主），主进程不需要向渲染进程反馈闪烁状态
6. **Electron 环境保护**：useSocket.js 在 Web 和 Desktop 各有一份副本，Desktop 版本添加的 IPC 调用需通过 `window.electron?.ipcRenderer?.send?.()` 可选链保护，避免非 Electron 环境报错

### 涉及文件

| 文件 | 修改内容 |
|------|---------|
| `desktop/src/main/index.js` | 添加 `ipcMain` 导入、闪烁定时器逻辑、IPC 监听、窗口 focus/show 事件绑定停止闪烁 |
| `desktop/src/renderer/src/composables/useSocket.js` | 在 `conversation_created` 和 `new_message` 回调中添加可见性检测和 IPC 触发 |

> **注意**：`desktop/src/preload/index.js` 无需修改，现有 `electronAPI` 已提供完整的 `ipcRenderer` 能力。

## 7. 功能规范

### 7.1 托盘闪烁机制（主进程）

**IPC 通道**：
- `tray:flash-start` — 渲染进程通知主进程开始闪烁

**闪烁逻辑**：
- 使用 `setInterval` 每 500ms 交替设置托盘图标（原图标 ↔ 空白图标）
- 维护一个闪烁状态标志，避免重复启动定时器
- 提供 `stopFlashing()` 函数：清除定时器、恢复原图标、重置状态

**停止触发点**：
- 托盘图标 `click` 事件
- 托盘右键菜单"显示主界面"点击
- 主窗口 `focus` 事件
- 主窗口 `show` 事件

### 7.2 IPC 桥接（preload）

**无需修改**。现有 `@electron-toolkit/preload` 已通过 `contextBridge.exposeInMainWorld('electron', electronAPI)` 暴露了 `ipcRenderer`，渲染进程可直接调用：

```javascript
window.electron.ipcRenderer.send('tray:flash-start')
```

### 7.3 事件触发（渲染进程 useSocket.js）

在以下两个 Socket.io 事件回调中添加闪烁触发：

1. **`conversation_created`**（握手成功）：
   - 判断 `document.hidden === true`
   - 若窗口不可见，调用 `window.electron?.ipcRenderer?.send('tray:flash-start')`

2. **`new_message`**（新消息）：
   - 判断 `document.hidden === true`
   - 若窗口不可见，调用 `window.electron?.ipcRenderer?.send('tray:flash-start')`

> **环境保护**：使用可选链 `?.` 调用，确保在非 Electron 环境下（如 Web 版）不会报错。

### 7.4 窗口可见性判断

使用 `document.hidden` API（Web 标准，Electron 完整支持）：
- `document.hidden === true` → 窗口最小化或隐藏到托盘
- `document.hidden === false` → 窗口可见

## 8. 技术栈

### 现有技术（无新增依赖）

| 技术 | 版本 | 用途 |
|------|------|------|
| Electron | 项目现有版本 | 主进程托盘管理、IPC |
| @electron-toolkit/utils | 项目现有版本 | preload 工具 |
| Vue 3 | 项目现有版本 | 渲染进程 |
| Socket.io-client | 项目现有版本 | 实时通信 |

### 新增依赖

无。所有功能使用 Electron 内置 API 实现。

### 关键 Electron API

- `Tray.setImage()` — 切换托盘图标
- `nativeImage.createEmpty()` — 创建空白图标
- `ipcMain.on()` / `ipcRenderer.send()` — 进程间通信（已有基础设施）
- `BrowserWindow.on('focus')` / `BrowserWindow.on('show')` — 窗口焦点/显示检测

## 9. 安全与配置

### 安全

- IPC 通道通过 `@electron-toolkit/preload` 的 `contextBridge` 安全暴露（已有机制）
- 渲染进程仅使用 `send`（单向火即忘），无法控制闪烁细节
- 新增 IPC 通道 `tray:flash-start` 不携带任何用户数据

### 配置

- 闪烁间隔硬编码为 500ms（MVP 不提供用户配置）
- 无环境变量或外部配置变更

## 10. API 规范

本需求不涉及 HTTP API 变更。仅涉及 Electron IPC 通道：

| 通道名 | 方向 | 参数 | 说明 |
|--------|------|------|------|
| `tray:flash-start` | 渲染 → 主 | 无 | 请求开始托盘图标闪烁 |

## 11. 成功标准

### MVP 成功定义

用户在窗口隐藏到托盘后，能通过托盘图标闪烁感知新事件并及时回到应用。

### 功能要求

- ✅ 窗口隐藏 + 收到 `conversation_created` → 托盘图标闪烁
- ✅ 窗口隐藏 + 收到 `new_message` → 托盘图标闪烁
- ✅ 窗口可见时收到事件 → 不闪烁
- ✅ 点击托盘图标 → 停止闪烁 + 恢复图标 + 显示窗口
- ✅ 窗口获得焦点 → 停止闪烁 + 恢复图标
- ✅ 已在闪烁时再次触发 → 不产生多个定时器，保持稳定节奏
- ✅ 闪烁间隔约 500ms

### 质量指标

- 闪烁启停无延迟感（< 100ms 响应）
- 不产生内存泄漏（定时器正确清除）
- 不影响现有托盘功能（右键菜单、单击恢复、tooltip）

### 用户体验目标

- 闪烁效果直观醒目，符合 Windows 用户对 IM 软件托盘提醒的认知习惯
- 回到应用后无需任何额外操作即可停止闪烁

## 12. 实施阶段

### 阶段 1：主进程闪烁基础设施

**目标**：在主进程中实现托盘图标闪烁和停止机制

**交付物**：
- ✅ 创建空白图标（`nativeImage.createEmpty()`）
- ✅ 实现 `startFlashing()` 函数（500ms 定时器交替图标）
- ✅ 实现 `stopFlashing()` 函数（清除定时器、恢复原图标）
- ✅ 防重入保护（已在闪烁时不重复启动）
- ✅ 绑定停止触发点（托盘 click、窗口 focus/show）

**验证标准**：在主进程中手动调用 `startFlashing()` 后托盘图标正确闪烁，调用 `stopFlashing()` 后恢复。

### 阶段 2：IPC 通道与渲染进程集成

**目标**：主进程注册 IPC 监听，渲染进程在关键事件回调中触发闪烁

**交付物**：
- ✅ 主进程注册 `ipcMain.on('tray:flash-start')` 监听，调用 `startFlashing()`
- ✅ `conversation_created` 回调中添加可见性检测和 IPC 触发
- ✅ `new_message` 回调中添加可见性检测和 IPC 触发
- ✅ 使用 `document.hidden` 判断窗口可见性
- ✅ 使用可选链 `window.electron?.ipcRenderer?.send()` 做环境保护

**验证标准**：窗口最小化到托盘后，对方发起聊天或发送消息，托盘图标闪烁；回到窗口后停止。

## 13. 未来考虑

- **声音提醒**：可选的提示音播放
- **Windows 原生通知**：Toast Notification 显示消息预览
- **任务栏闪烁**：配合 `BrowserWindow.flashFrame()` 增强提醒
- **未读角标**：托盘图标叠加未读数字
- **用户设置**：允许用户开关闪烁、调整频率、选择提醒方式
- **macOS 适配**：Dock 弹跳提醒

## 14. 风险与缓解措施

| 风险 | 影响 | 缓解策略 |
|------|------|---------|
| `nativeImage.createEmpty()` 在某些 Windows 版本显示异常 | 闪烁效果不佳 | 备选方案：创建 1x1 透明 PNG 文件作为空白图标 |
| `document.hidden` 在 Electron 中行为不一致 | 误触发或漏触发 | 可改用主进程 `BrowserWindow.isVisible()` + `isFocused()` 判断 |
| 定时器未正确清除导致内存泄漏 | 长时间运行后性能下降 | `stopFlashing()` 中严格清除 interval 引用并置空 |
| 闪烁期间用户右键退出应用 | 定时器未清除 | `app.quit()` 前调用 `stopFlashing()`，或依赖进程销毁自动回收 |

## 15. 附录

### 相关文件

- `desktop/src/main/index.js` — Electron 主进程，托盘创建和窗口管理
- `desktop/src/preload/index.js` — preload 脚本，IPC 桥接
- `desktop/src/renderer/src/composables/useSocket.js` — Socket.io 核心逻辑
- `desktop/resources/icon.ico` — 应用图标（托盘原图标来源，代码中通过 `?asset` 导入）

### 现有托盘代码参考

托盘创建位于 `desktop/src/main/index.js` 第 57-93 行，已实现：
- 托盘图标创建（16x16 resize）
- 右键菜单（显示主界面 / 彻底退出）
- 单击恢复窗口
- tooltip 设置
