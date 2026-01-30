---
description: "功能实施计划: 系统托盘图标闪烁提醒"
status: archived
created_at: 2026-01-30T12:45:00
updated_at: 2026-01-30T14:30:00
archived_at: 2026-01-30T14:30:00
related_files:
  - rpiv/requirements/prd-tray-flash-notification.md
---

# 功能：系统托盘图标闪烁提醒

以下计划应该是完整的，但在开始实施之前，验证文档和代码库模式以及任务合理性非常重要。

特别注意现有工具、类型和模型的命名。从正确的文件导入等。

## 功能描述

为 SmileMsg Electron 桌面客户端增加系统托盘图标闪烁提醒功能。当窗口隐藏到系统托盘后，收到新会话连接（`conversation_created`）或新消息（`new_message`）时，托盘图标在原图标与透明空白图标之间以 500ms 间隔交替闪烁。用户通过点击托盘或回到窗口（获得焦点）后闪烁自动停止。

## 用户故事

```
作为 SmileMsg 桌面用户
我想要 在窗口最小化到托盘后，通过托盘图标闪烁感知新会话或新消息
以便 不错过重要通信，及时回到应用
```

## 问题陈述

当前桌面客户端窗口隐藏到系统托盘后，用户无法感知新消息或新会话连接，可能长时间未回复。

## 解决方案陈述

在渲染进程的 Socket.io 事件回调中检测窗口可见性，当窗口不可见时通过已有的 IPC 通道通知主进程启动托盘图标闪烁。主进程使用 `setInterval` 在原图标与空白图标之间交替切换，用户回到应用后自动停止。

## 功能元数据

**功能类型**：新功能
**估计复杂度**：低
**主要受影响的系统**：Electron 主进程（托盘管理）、渲染进程（Socket.io 事件处理）
**依赖项**：无新增依赖，全部使用 Electron 内置 API

---

## 上下文参考

### 相关代码库文件（实施前必读）

- `desktop/src/main/index.js`（全文 113 行）— 主进程入口，包含 `createWindow()`（第 9-55 行）和 `createTray()`（第 57-93 行）。闪烁逻辑将添加在此文件中。
- `desktop/src/preload/index.js`（全文 12 行）— preload 脚本，已通过 `@electron-toolkit/preload` 暴露 `window.electron.ipcRenderer`。**无需修改此文件**。
- `desktop/src/renderer/src/composables/useSocket.js`（全文 221 行）— Socket.io 核心逻辑。`new_message` 事件在第 75-82 行，`conversation_created` 事件在第 84-90 行。这两个回调中需要添加闪烁触发。
- `desktop/node_modules/@electron-toolkit/preload/dist/index.mjs` — 已验证 `electronAPI.ipcRenderer.send(channel, ...args)` 方法可用（第 5-7 行），直接代理到 Electron 原生 `ipcRenderer.send()`。

### 要创建的新文件

无。所有改动在现有的 2 个文件中完成。

### 相关文档

- [Electron Tray API](https://www.electronjs.org/docs/latest/api/tray#traysetimagenativeimage)
  - `tray.setImage(image)` — 设置托盘图标
  - 原因：闪烁的核心机制，交替调用设置不同图标
- [Electron nativeImage API](https://www.electronjs.org/docs/latest/api/native-image#nativeimagecreateempty)
  - `nativeImage.createEmpty()` — 创建空的 NativeImage
  - 原因：用于生成空白图标参与闪烁交替
- [Electron ipcMain API](https://www.electronjs.org/docs/latest/api/ipc-main#ipcmainonchannel-listener)
  - `ipcMain.on(channel, listener)` — 监听渲染进程消息
  - 原因：接收渲染进程的闪烁请求
- [Page Visibility API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Document/hidden)
  - `document.hidden` — 页面是否隐藏
  - 原因：渲染进程判断窗口可见性

### 要遵循的模式

**导入风格**：ES Module，具名导入
```javascript
// main/index.js 现有风格
import { app, shell, BrowserWindow, Tray, Menu, nativeImage } from 'electron'
// 需要新增 ipcMain 到此导入
```

**模块级变量**：在文件顶部声明
```javascript
// 现有模式
let mainWindow = null
let tray = null
// 新增闪烁相关变量也应遵循此模式
```

**托盘事件处理**：回调中先检查 `mainWindow` 存在性
```javascript
// 现有模式 (main/index.js 第 86-91 行)
tray.on('click', () => {
  if (mainWindow) {
    mainWindow.setSkipTaskbar(false)
    mainWindow.show()
    mainWindow.focus()
  }
})
```

**useSocket.js 事件回调**：在回调体顶部或底部添加副作用逻辑
```javascript
// 现有模式 (useSocket.js 第 75-82 行)
socket.on('new_message', ({ conversationId: convId, message }) => {
  if (convId === conversationId.value) {
    messages.value.push(message)
    // ... 业务逻辑后可追加闪烁触发
  }
})
```

---

## 实施计划

### 阶段 1：主进程闪烁基础设施

在 `desktop/src/main/index.js` 中添加闪烁能力：新增 `ipcMain` 导入、闪烁相关变量、`startFlashing()` / `stopFlashing()` 函数、IPC 监听、以及窗口/托盘事件中绑定停止逻辑。

### 阶段 2：渲染进程事件集成

在 `desktop/src/renderer/src/composables/useSocket.js` 的 `conversation_created` 和 `new_message` 回调中添加可见性检测和 IPC 触发。

---

## 逐步任务

### 任务 1：UPDATE `desktop/src/main/index.js` — 添加 `ipcMain` 导入

- **IMPLEMENT**：在第 1 行的 `electron` 导入中追加 `ipcMain`
- **PATTERN**：镜像现有具名导入风格（main/index.js:1）
- **具体变更**：
  ```javascript
  // 变更前
  import { app, shell, BrowserWindow, Tray, Menu, nativeImage } from 'electron'
  // 变更后
  import { app, shell, BrowserWindow, Tray, Menu, nativeImage, ipcMain } from 'electron'
  ```
- **VALIDATE**：文件无语法错误，`pnpm --filter desktop build` 不报错

### 任务 2：UPDATE `desktop/src/main/index.js` — 添加闪烁状态变量

- **IMPLEMENT**：在 `let tray = null`（第 7 行）之后添加闪烁相关变量
- **PATTERN**：镜像现有模块级 `let` 声明风格（main/index.js:6-7）
- **具体变更**：
  ```javascript
  let flashTimer = null
  let isFlashing = false
  ```
- **VALIDATE**：无语法错误

### 任务 3：UPDATE `desktop/src/main/index.js` — 实现 `startFlashing()` 和 `stopFlashing()`

- **IMPLEMENT**：在 `createTray()` 函数之后添加两个函数
- **具体变更**：
  ```javascript
  function startFlashing() {
    if (isFlashing || !tray) return
    isFlashing = true
    const originalIcon = nativeImage.createFromPath(icon).resize({ width: 16, height: 16 })
    const emptyIcon = nativeImage.createEmpty()
    let showOriginal = false
    flashTimer = setInterval(() => {
      showOriginal = !showOriginal
      tray.setImage(showOriginal ? originalIcon : emptyIcon)
    }, 500)
  }

  function stopFlashing() {
    if (!isFlashing) return
    isFlashing = false
    if (flashTimer) {
      clearInterval(flashTimer)
      flashTimer = null
    }
    if (tray) {
      const originalIcon = nativeImage.createFromPath(icon).resize({ width: 16, height: 16 })
      tray.setImage(originalIcon)
    }
  }
  ```
- **GOTCHA**：`nativeImage.createEmpty()` 在 Windows 上返回一个 size 为 0x0 的 NativeImage，`Tray.setImage()` 接受它后托盘图标显示为空白区域（视觉上消失）。如果在某些系统上显示异常（如小黑点），备选方案是创建一个 1x1 透明 PNG 用 `nativeImage.createFromBuffer()` 加载。但 Electron 33+ 版本上 `createEmpty()` 应可正常工作。
- **GOTCHA**：`startFlashing()` 首入检查 `isFlashing` 防止多个定时器叠加。`stopFlashing()` 首入检查 `!isFlashing` 避免重复清除。
- **GOTCHA**：`originalIcon` 在每次调用时重新创建（从 path），确保图标引用始终有效，不会因 GC 被回收。
- **VALIDATE**：无语法错误

### 任务 4：UPDATE `desktop/src/main/index.js` — 注册 IPC 监听

- **IMPLEMENT**：在 `app.whenReady().then(...)` 回调内、`createWindow()` 和 `createTray()` 调用之后添加 IPC 监听
- **PATTERN**：在 `app.whenReady()` 回调内初始化（main/index.js:95-104）
- **具体变更**：在 `createTray()` 调用之后添加：
  ```javascript
  ipcMain.on('tray:flash-start', () => {
    startFlashing()
  })
  ```
- **VALIDATE**：无语法错误

### 任务 5：UPDATE `desktop/src/main/index.js` — 在托盘 click 和右键菜单中调用 `stopFlashing()`

- **IMPLEMENT**：在现有的 `tray.on('click', ...)` 回调和右键菜单"显示主界面"的 click 回调中，在显示窗口之前调用 `stopFlashing()`
- **PATTERN**：镜像现有 click 事件处理（main/index.js:64-70, 86-92）
- **具体变更**：

  托盘 click 事件（第 86-92 行）：
  ```javascript
  tray.on('click', () => {
    stopFlashing()
    if (mainWindow) {
      mainWindow.setSkipTaskbar(false)
      mainWindow.show()
      mainWindow.focus()
    }
  })
  ```

  右键菜单"显示主界面"（第 64-70 行）：
  ```javascript
  {
    label: '显示主界面',
    click: () => {
      stopFlashing()
      if (mainWindow) {
        mainWindow.setSkipTaskbar(false)
        mainWindow.show()
        mainWindow.focus()
      }
    }
  }
  ```
- **VALIDATE**：无语法错误

### 任务 6：UPDATE `desktop/src/main/index.js` — 窗口 focus/show 事件绑定 `stopFlashing()`

- **IMPLEMENT**：在 `createWindow()` 函数内，`mainWindow.on('ready-to-show', ...)` 之后添加 focus 和 show 事件监听
- **PATTERN**：镜像现有 `mainWindow.on(...)` 事件绑定风格（main/index.js:24-42）
- **具体变更**：在 `mainWindow.on('ready-to-show', ...)` 之后添加：
  ```javascript
  mainWindow.on('focus', () => {
    stopFlashing()
  })

  mainWindow.on('show', () => {
    stopFlashing()
  })
  ```
- **GOTCHA**：`show` 事件是为了覆盖通过右键菜单"显示主界面"恢复窗口但未获得焦点的情况（虽然代码中 `show()` 后紧跟 `focus()`，但多一层保险）
- **VALIDATE**：`pnpm --filter desktop build` 成功

### 任务 7：UPDATE `desktop/src/renderer/src/composables/useSocket.js` — `new_message` 回调中触发闪烁

- **IMPLEMENT**：在 `new_message` 事件回调的 `if` 块末尾添加可见性检测和 IPC 触发
- **PATTERN**：在现有业务逻辑之后追加（useSocket.js:75-82）
- **具体变更**：
  ```javascript
  socket.on('new_message', ({ conversationId: convId, message }) => {
    if (convId === conversationId.value) {
      messages.value.push(message)
      if (messages.value.length > MAX_MESSAGES) {
        messages.value = messages.value.slice(-MAX_MESSAGES)
      }
      if (document.hidden) {
        window.electron?.ipcRenderer?.send('tray:flash-start')
      }
    }
  })
  ```
- **GOTCHA**：使用可选链 `window.electron?.ipcRenderer?.send()` 做环境保护，虽然此文件是 Desktop 独立副本不会在 Web 端运行，但可选链是防御性编程好习惯，零成本。
- **GOTCHA**：`document.hidden` 在 Electron 中，当窗口被 `hide()` 或 `minimize()` 后返回 `true`，完全覆盖我们的"窗口不可见"场景。
- **VALIDATE**：`pnpm --filter desktop build` 成功

### 任务 8：UPDATE `desktop/src/renderer/src/composables/useSocket.js` — `conversation_created` 回调中触发闪烁

- **IMPLEMENT**：在 `conversation_created` 事件回调末尾添加可见性检测和 IPC 触发
- **PATTERN**：与任务 7 相同的模式
- **具体变更**：
  ```javascript
  socket.on('conversation_created', ({ conversationId: convId, target }) => {
    conversationId.value = convId
    peerNickname.value = target.nickname
    phase.value = 'chat'
    peerIsOffline.value = false
    messages.value = []
    if (document.hidden) {
      window.electron?.ipcRenderer?.send('tray:flash-start')
    }
  })
  ```
- **VALIDATE**：`pnpm --filter desktop build` 成功

---

## 测试策略

本项目无自动化测试框架配置（CLAUDE.md 明确说明"无 lint 和测试配置"），因此验证完全依赖构建检查和手动测试。

### 手动测试用例

| # | 场景 | 前置条件 | 操作 | 预期结果 |
|---|------|---------|------|---------|
| T1 | 新消息触发闪烁 | 窗口最小化到托盘，已进入聊天状态 | 对方发送消息 | 托盘图标开始闪烁（500ms 交替） |
| T2 | 新会话触发闪烁 | 窗口最小化到托盘，空闲状态 | 对方发起私聊 | 托盘图标开始闪烁 |
| T3 | 点击托盘停止闪烁 | 托盘正在闪烁 | 单击托盘图标 | 闪烁停止，恢复原图标，窗口显示并聚焦 |
| T4 | 窗口焦点停止闪烁 | 托盘正在闪烁，窗口未隐藏（如仅被遮挡） | Alt+Tab 切换到应用 | 闪烁停止，恢复原图标 |
| T5 | 右键菜单停止闪烁 | 托盘正在闪烁 | 右键托盘 → "显示主界面" | 闪烁停止，恢复原图标，窗口显示 |
| T6 | 窗口可见时不闪烁 | 窗口在前台，已进入聊天状态 | 对方发送消息 | 托盘不闪烁 |
| T7 | 连续消息不叠加 | 托盘正在闪烁 | 对方连续发送多条消息 | 闪烁节奏不变，无异常 |
| T8 | 正常退出 | 托盘正在闪烁 | 右键托盘 → "彻底退出" | 应用正常退出，无报错 |

### 边缘情况

- 应用启动后直接最小化、还未登录时收到事件 → 不会触发（因为 socket 未初始化，不会有事件）
- 闪烁中对方离线 → `peer_offline` 事件不触发闪烁（PRD 范围外），已有闪烁继续直到用户回到窗口
- 快速连续最小化/恢复 → `stopFlashing()` 的 `!isFlashing` 检查确保幂等

---

## 验证命令

### 级别 1：构建检查

```bash
pnpm --filter desktop build
```

确保主进程和渲染进程代码均无语法/导入错误。

### 级别 2：开发模式运行

```bash
pnpm dev:server
pnpm dev:desktop
```

启动后检查应用正常运行、托盘图标正常显示、现有功能无回归。

### 级别 3：手动验证

执行上述测试策略中的 T1-T8 全部手动测试用例。

### 级别 4：生产构建

```bash
pnpm --filter desktop build:win
```

验证打包后的 exe 中闪烁功能正常工作。

---

## 验收标准

- [ ] 窗口不可见 + 收到 `conversation_created` → 托盘图标闪烁
- [ ] 窗口不可见 + 收到 `new_message` → 托盘图标闪烁
- [ ] 窗口可见时收到事件 → 不闪烁
- [ ] 点击托盘图标 → 停止闪烁 + 恢复图标 + 显示窗口
- [ ] 窗口获得焦点 → 停止闪烁 + 恢复图标
- [ ] 已在闪烁时再次触发 → 不产生多个定时器
- [ ] 闪烁间隔约 500ms
- [ ] 现有功能无回归（托盘右键菜单、点击恢复、关闭隐藏、最小化隐藏）
- [ ] `pnpm --filter desktop build` 成功
- [ ] `pnpm --filter desktop build:win` 成功

---

## 完成检查清单

- [ ] 所有 8 个任务按顺序完成
- [ ] 每个任务验证立即通过
- [ ] 构建命令成功（build + build:win）
- [ ] 手动测试 T1-T8 全部通过
- [ ] 所有验收标准均满足
- [ ] 仅修改了 2 个文件（main/index.js + useSocket.js）

---

## 备注

- **无需修改 preload**：`@electron-toolkit/preload` v3.0.1 已经通过 `contextBridge.exposeInMainWorld('electron', electronAPI)` 暴露了完整的 `ipcRenderer.send()` 方法，渲染进程可直接调用 `window.electron.ipcRenderer.send()`。
- **`nativeImage.createEmpty()` 备选方案**：如果在某些 Windows 版本上空白图标显示为小黑点而非透明，可改为加载一个 1x1 透明 PNG 文件。但 Electron 33+（项目使用 `^33.0.0`）上此 API 行为稳定。
- **Web 版 useSocket.js 不受影响**：Desktop 和 Web 的 `useSocket.js` 是独立副本。本次仅修改 Desktop 版。可选链 `window.electron?.ipcRenderer?.send()` 作为额外防御。
- **信心分数：9/10** — 实现简单明确，仅涉及 2 个文件、8 个原子任务，全部使用 Electron 内置 API，无外部依赖。唯一不确定点是 `nativeImage.createEmpty()` 在极端 Windows 环境下的视觉表现。
