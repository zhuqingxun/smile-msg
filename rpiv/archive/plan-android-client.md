---
description: "功能实施计划: android-client"
status: archived
created_at: 2026-01-30T16:00:00
updated_at: 2026-01-30T17:30:00
archived_at: 2026-01-30T17:30:00
related_files:
  - rpiv/archive/prd-android-client.md
---

# 功能：SmileMsg Android 客户端

以下计划应该是完整的，但在开始实施之前，验证文档和代码库模式以及任务合理性非常重要。

特别注意现有工具、类型和模型的命名。从正确的文件导入等。

## 功能描述

使用 Capacitor 将 SmileMsg 的 Vue 3 Web 客户端打包为 Android 原生 App（APK），实现与 Web 端功能完全对等的阅后即焚即时通讯能力。在 Web 端代码基础上进行移动端适配，并添加振动反馈、状态栏通知、本地持久化恢复等移动端特性。

**技术方案**：Capacitor + Vue 3 + Tailwind CSS 4 + socket.io-client（JS 版）
**代码策略**：与 desktop 端相同，复制 web 端代码到 android 包，再做差异化修改

## 用户故事

作为 SmileMsg 的 Android 手机用户
我想要在手机上使用阅后即焚通讯
以便在移动场景下也能与其他用户安全地即时通讯

## 问题陈述

SmileMsg 目前仅覆盖 Web 和 Windows Desktop 平台，移动端用户无法使用。需要将核心通讯能力扩展到 Android 平台。

## 解决方案陈述

使用 Capacitor 将现有 Vue 3 Web 应用封装为 Android App，复用核心业务逻辑（useSocket.js）和 UI 组件（LoginView、ChatView），在此基础上添加移动端适配和原生能力（通知、振动、本地持久化）。服务端无需任何改动。

## 功能元数据

**功能类型**：新功能
**估计复杂度**：中
**主要受影响的系统**：新增 android 包，修改 monorepo 配置
**依赖项**：@capacitor/core、@capacitor/cli、@capacitor/local-notifications、@capacitor/haptics、@capacitor/preferences、@capacitor/app

---

## 上下文参考

### 相关代码库文件（重要：在实施之前必须阅读这些文件！）

- `web/src/composables/useSocket.js`（全文 221 行）- 原因：核心业务逻辑，将被复制到 android 包并做差异化修改
- `web/src/App.vue`（第 1-13 行）- 原因：phase 状态机模式，Android 端需完全对齐
- `web/src/components/LoginView.vue`（全文 40 行）- 原因：登录界面，需做移动端适配
- `web/src/components/ChatView.vue`（全文 119 行）- 原因：聊天界面，需做移动端适配
- `web/src/main.js` - 原因：Vue 应用入口，Android 端需镜像
- `web/src/assets/main.css` - 原因：Tailwind CSS 导入方式
- `web/vite.config.js` - 原因：Vite 配置模式，Android 端需镜像
- `web/.env.development` / `web/.env.production` - 原因：环境变量配置模式
- `desktop/src/renderer/src/composables/useSocket.js`（第 75-105 行）- 原因：Desktop 端对 useSocket 的差异化改造（托盘闪烁），Android 端需参考类似的差异化模式（振动+通知）
- `desktop/src/main/index.js`（第 1-175 行）- 原因：Desktop 平台特性实现参考
- `server/src/handlers/chat.js` - 原因：服务端 Socket.io 事件处理，确保 Android 端事件对齐
- `server/src/store.js`（全文 93 行）- 原因：服务端数据结构和业务规则
- `pnpm-workspace.yaml` - 原因：需要添加 android 到 workspace
- `package.json`（根）- 原因：需要添加 android 相关的快捷脚本

### 要创建的新文件

```
android/                              # 新的 monorepo 包
├── package.json                      # 包配置（依赖、脚本）
├── capacitor.config.ts               # Capacitor 配置
├── vite.config.js                    # Vite 构建配置
├── index.html                        # HTML 入口
├── .env.development                  # 开发环境变量
├── .env.production                   # 生产环境变量
├── src/
│   ├── main.js                       # Vue 应用入口
│   ├── App.vue                       # 根组件（phase 状态机）
│   ├── assets/
│   │   └── main.css                  # Tailwind CSS
│   ├── components/
│   │   ├── LoginView.vue             # 登录界面（移动端适配）
│   │   └── ChatView.vue              # 聊天界面（移动端适配）
│   └── composables/
│       ├── useSocket.js              # Socket.io 核心逻辑（含移动端差异）
│       └── useNativeFeatures.js      # 原生能力封装（通知、振动、持久化）
└── android/                          # Capacitor 生成的原生项目
    └── app/
        └── src/main/
            ├── AndroidManifest.xml   # 权限和配置
            └── res/                  # 图标资源等
```

### 相关文档（在实施之前应该阅读这些！）

- [Capacitor 官方文档 - 安装](https://capacitorjs.com/docs/getting-started)
  - 原因：Capacitor 项目初始化流程
- [Capacitor 官方文档 - Android 配置](https://capacitorjs.com/docs/android/configuration)
  - 原因：AndroidManifest.xml、权限、构建配置
- [Capacitor 官方文档 - capacitor.config.ts](https://capacitorjs.com/docs/config)
  - 原因：Capacitor 配置项，特别是 CapacitorHttp 禁用
- [@capacitor/local-notifications](https://capacitorjs.com/docs/apis/local-notifications)
  - 原因：状态栏通知 API
- [@capacitor/haptics](https://capacitorjs.com/docs/apis/haptics)
  - 原因：振动反馈 API
- [@capacitor/preferences](https://capacitorjs.com/docs/apis/preferences)
  - 原因：本地持久化（SharedPreferences）API
- [@capacitor/app](https://capacitorjs.com/docs/apis/app)
  - 原因：App 生命周期事件（pause/resume/backButton）
- [socket.io-client 与 Capacitor 兼容性](https://github.com/nicknisi/socket.io-client/issues)
  - 原因：CapacitorHttp 冲突问题的解决方案

### 要遵循的模式

**代码复制模式（MIRROR desktop 的做法）：**
Desktop 端通过复制 web/src 代码到 desktop/src/renderer/src 实现代码共享，再做平台特有的差异化修改。Android 端采用同样的策略：复制 web/src 到 android/src，再修改。

**useSocket.js 差异化模式：**
```javascript
// Web 端（原始）
socket.on('new_message', ({ conversationId: convId, message }) => {
  if (convId === conversationId.value) {
    messages.value.push(message)
    // ...
  }
})

// Desktop 端（增加托盘闪烁）
socket.on('new_message', ({ conversationId: convId, message }) => {
  if (convId === conversationId.value) {
    messages.value.push(message)
    // ...
    if (document.hidden) {
      window.electron?.ipcRenderer?.send('tray:flash-start')  // 平台特有
    }
  }
})

// Android 端（增加振动 + 通知）
socket.on('new_message', ({ conversationId: convId, message }) => {
  if (convId === conversationId.value) {
    messages.value.push(message)
    // ...
    onNewMessage(message)  // 调用 useNativeFeatures 的方法
  }
})
```

**环境变量模式：**
```
# .env.development
VITE_SERVER_URL=http://localhost:3000

# .env.production
VITE_SERVER_URL=https://smile-msg.zeabur.app
```
注意：与 Web 端不同，Android 生产环境必须写完整 URL（不能用相对路径）。

**Socket.io 配置模式（useSocket.js 第 44-49 行）：**
```javascript
socket = io(SERVER_URL, {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  transports: ['websocket']  // Android 端新增：避免 CapacitorHttp 冲突
})
```

**命名约定：**
- 文件名：kebab-case（`use-socket.js`→实际项目中是 `useSocket.js` camelCase）
- Vue 组件：PascalCase（`LoginView.vue`、`ChatView.vue`）
- composables：`use` 前缀 camelCase（`useSocket`、`useNativeFeatures`）
- CSS：Tailwind utility classes

---

## 实施计划

### 阶段 1：基础框架搭建

在 monorepo 中创建 android 包，初始化 Capacitor 项目，跑通基础的 Socket.io 连接。

**任务：**

- 创建 android 包目录结构和 package.json
- 复制 web 端 Vue 组件和逻辑代码
- 初始化 Capacitor 项目，配置 Android 平台
- 配置 Vite 构建，解决 CapacitorHttp 冲突
- 更新 monorepo 配置（pnpm-workspace.yaml、根 package.json）
- 首次 build + sync + 在模拟器/真机上运行

### 阶段 2：移动端适配

调整 UI 组件适配移动端操作习惯，处理 App 生命周期事件。

**任务：**

- LoginView.vue 移动端适配（全屏布局、触控优化）
- ChatView.vue 移动端适配（消息区域、输入区域、软键盘处理）
- App.vue 增加 Android 返回键处理
- 处理 App pause/resume 生命周期事件（连接管理）
- 横竖屏适配

### 阶段 3：原生能力集成

添加通知、振动、本地持久化等移动端特性。

**任务：**

- 创建 useNativeFeatures.js composable（统一封装原生能力）
- 集成振动反馈（前台收消息）
- 集成状态栏通知（后台收消息）
- 集成本地持久化（UUID + 昵称，进程恢复）
- 修改 useSocket.js，接入原生能力钩子
- 实现主动退出清理逻辑

### 阶段 4：打包与分发

构建 Debug APK，集成到 monorepo 构建流程。

**任务：**

- 配置 App 图标和启动画面
- 配置 APK 签名
- 构建 Debug APK
- 添加 monorepo 快捷脚本

---

## 逐步任务

重要：按顺序从上到下执行每个任务。每个任务都是原子的且可独立测试。

---

### 任务 1：CREATE `android/package.json`

- **IMPLEMENT**：创建 android 包的 package.json，定义依赖和脚本
- **PATTERN**：参考 `web/package.json` 的结构
- **依赖项**：
  ```json
  {
    "dependencies": {
      "vue": "^3.5.0",
      "socket.io-client": "^4.8.0",
      "@capacitor/core": "^7.0.0",
      "@capacitor/app": "^7.0.0",
      "@capacitor/haptics": "^7.0.0",
      "@capacitor/local-notifications": "^7.0.0",
      "@capacitor/preferences": "^7.0.0",
      "@capacitor/android": "^7.0.0"
    },
    "devDependencies": {
      "@capacitor/cli": "^7.0.0",
      "@vitejs/plugin-vue": "^5.2.0",
      "vite": "^6.1.0",
      "tailwindcss": "^4.0.0",
      "@tailwindcss/vite": "^4.0.0"
    }
  }
  ```
- **GOTCHA**：所有 @capacitor/* 插件版本必须对齐。实施前需验证 Capacitor 最新稳定版本号（可能是 6.x 或 7.x），统一使用同一大版本
- **VALIDATE**：文件存在且 JSON 格式正确

### 任务 2：UPDATE `pnpm-workspace.yaml`

- **IMPLEMENT**：在 packages 列表中添加 `android`
- **PATTERN**：`pnpm-workspace.yaml`（现有三个包 server/web/desktop）
- **VALIDATE**：`pnpm install` 能识别 android 包

### 任务 3：UPDATE 根 `package.json`

- **IMPLEMENT**：添加 android 相关的快捷脚本
  ```json
  "dev:android": "pnpm --filter android dev",
  "build:android": "pnpm --filter android build"
  ```
- **PATTERN**：`package.json`（已有 dev:server、dev:web、dev:desktop、build:web、build:desktop）
- **VALIDATE**：`pnpm dev:android` 命令可被识别（虽然此时还不能运行）

### 任务 4：MIRROR Web 源码到 android/src

- **IMPLEMENT**：从 web/src/ 复制以下文件到 android/src/：
  - `main.js`
  - `App.vue`
  - `assets/main.css`
  - `components/LoginView.vue`
  - `components/ChatView.vue`
  - `composables/useSocket.js`
- **PATTERN**：desktop/src/renderer/src/ 与 web/src/ 的复制关系
- **GOTCHA**：这是有意的代码复制，不是引用。后续会对复制后的文件做移动端差异化修改
- **VALIDATE**：文件结构与 web/src/ 一致

### 任务 5：CREATE `android/index.html`

- **IMPLEMENT**：创建 HTML 入口文件
- **PATTERN**：参考 `web/index.html`
- **关键内容**：
  ```html
  <!DOCTYPE html>
  <html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
    <title>SmileMsg</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.js"></script>
  </body>
  </html>
  ```
- **GOTCHA**：viewport meta 必须包含 `user-scalable=no` 和 `viewport-fit=cover`，适配移动端和刘海屏
- **VALIDATE**：文件存在

### 任务 6：CREATE `android/vite.config.js`

- **IMPLEMENT**：创建 Vite 构建配置
- **PATTERN**：参考 `web/vite.config.js`
- **VALIDATE**：`pnpm --filter android dev` 能启动 Vite dev server

### 任务 7：CREATE `android/.env.development` 和 `android/.env.production`

- **IMPLEMENT**：
  ```
  # .env.development
  VITE_SERVER_URL=http://localhost:3000

  # .env.production
  VITE_SERVER_URL=https://smile-msg.zeabur.app
  ```
- **PATTERN**：`web/.env.development` / `web/.env.production`
- **GOTCHA**：Android 生产环境**必须**写完整 URL，不能像 Web 端那样留空使用相对路径（WebView 的 origin 不是服务器地址）
- **VALIDATE**：文件存在

### 任务 8：CREATE `android/capacitor.config.ts`

- **IMPLEMENT**：创建 Capacitor 配置文件
  ```typescript
  import type { CapacitorConfig } from '@capacitor/cli'

  const config: CapacitorConfig = {
    appId: 'com.smilemsg.app',
    appName: 'SmileMsg',
    webDir: 'dist',
    plugins: {
      CapacitorHttp: {
        enabled: false  // 关键：禁用 CapacitorHttp 避免与 socket.io 冲突
      }
    }
  }

  export default config
  ```
- **GOTCHA**：Capacitor 7 中 CapacitorHttp 默认已禁用（`enabled: false` 是默认值），但显式配置更安全，避免未来版本默认值变化。禁用后 socket.io 走浏览器原生 XMLHttpRequest/WebSocket，完全正常
- **VALIDATE**：TypeScript 类型检查通过

### 任务 9：初始化 Capacitor Android 平台

- **IMPLEMENT**：在 android/ 目录下执行：
  1. `pnpm install`
  2. `npx cap init SmileMsg com.smilemsg.app --web-dir=dist`（初始化 Capacitor 项目，生成 capacitor.config.ts）
  3. 用任务 8 的内容覆盖自动生成的 capacitor.config.ts（添加 CapacitorHttp 禁用配置）
  4. `pnpm build`（先执行 Vite 构建生成 dist/，`cap add` 需要 webDir 存在）
  5. `npx cap add android`（生成 android/android/ 原生项目）
- **GOTCHA**：
  - 需要本地已安装 Android Studio 和 Android SDK（API 29+）
  - `cap init` 必须在 `cap add android` 之前执行
  - `cap add android` 需要 dist/ 目录存在，否则报错，所以必须先 build
  - `cap add android` 会在 android/android/ 下生成完整的 Gradle 项目
- **VALIDATE**：`android/android/` 目录存在，包含 `app/build.gradle`

### 任务 10：UPDATE Android 原生配置

- **IMPLEMENT**：
  1. 编辑 `android/android/app/src/main/AndroidManifest.xml`，添加权限：
     ```xml
     <uses-permission android:name="android.permission.INTERNET" />
     <uses-permission android:name="android.permission.VIBRATE" />
     <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
     ```
     在 `<application>` 标签内添加：`android:usesCleartextTraffic="true"`
  2. 编辑 `android/android/variables.gradle`，将 `minSdkVersion` 从 23（Capacitor 7 默认）改为 29（PRD 要求 Android 10+）
- **GOTCHA**：
  - `usesCleartextTraffic` 仅在开发时需要（连接 localhost:3000），生产环境走 HTTPS 不受影响。但 APK 打包时建议保留以兼容各种网络环境
  - Capacitor 7 默认 minSdkVersion=23，但 PRD 要求最低 Android 10（API 29），需手动修改
- **VALIDATE**：Android Studio 能正确解析 Manifest，`variables.gradle` 中 `minSdkVersion = 29`

### 任务 11：首次构建和运行验证

- **IMPLEMENT**：
  1. `pnpm --filter android build`（Vite 构建）
  2. `npx cap sync android`（同步到原生项目）
  3. `npx cap open android`（用 Android Studio 打开）或直接命令行构建
- **VALIDATE**：App 在 Android 模拟器（API 29+）或真机上能启动，显示登录页面，输入昵称能成功登录

---

### 任务 12：UPDATE `android/src/components/LoginView.vue` 移动端适配

- **IMPLEMENT**：
  - 全屏居中布局，适配不同屏幕尺寸
  - 输入框和按钮尺寸适配触控（最小 48dp 触控区域）
  - 软键盘弹起时布局不被遮挡
  - 添加 App 名称/Logo 展示
- **PATTERN**：`web/src/components/LoginView.vue`（第 1-40 行）
- **VALIDATE**：在不同尺寸模拟器上登录页布局正常

### 任务 13：UPDATE `android/src/components/ChatView.vue` 移动端适配

- **IMPLEMENT**：
  - 消息区域：充满可用空间，触控滚动流畅
  - 输入区域：固定在底部，软键盘弹起时自动上推
  - 发送按钮：足够大的触控区域
  - 回车键发送：保持与 Web 端一致（Enter 发送，无 Shift+Enter 换行需求因移动端软键盘没有 Shift）
  - 消息气泡：适配移动端宽度
  - idle 状态：输入对方昵称发起聊天的输入框和按钮，适配移动端布局
  - 对方离线提示明显
- **PATTERN**：`web/src/components/ChatView.vue`（第 1-119 行）
- **GOTCHA**：移动端软键盘弹起会改变 viewport 高度，需要使用 `dvh`（dynamic viewport height）或 JS 监听 resize 事件
- **VALIDATE**：聊天界面在竖屏和横屏下都能正常使用，软键盘不遮挡输入区域

### 任务 14：UPDATE `android/src/App.vue` 添加返回键和生命周期处理

- **IMPLEMENT**：
  - 导入 `@capacitor/app` 的 `App` 插件
  - 监听 `backButton` 事件：
    - chat 状态 → 与"断开"按钮一致，调用 `disconnect()` 回到 login 页面
    - idle 状态 → 调用 `disconnect()` 回到 login 页面
    - login 状态 → 退出 App（`App.exitApp()`）
  - 监听 `pause` 事件（App 切后台）：记录状态
  - 监听 `resume` 事件（App 回前台）：检查连接状态，必要时重连
- **PATTERN**：`web/src/App.vue`（第 1-13 行）+ desktop 的 `close` 事件处理模式
- **GOTCHA**：与 Web 端"断开"按钮行为完全一致，都是调用 `destroyAndReset()` 回到 login。不存在"仅退出会话保持在线"的功能（服务端无 `leave_conversation` 事件）
- **VALIDATE**：Android 返回键在不同 phase 下行为正确

### 任务 15：处理横竖屏适配

- **IMPLEMENT**：
  - 确保所有组件的 CSS 布局使用相对单位和 flexbox，在不同方向下自动适配
  - 不锁定屏幕方向（允许自由旋转）
  - 横屏时聊天界面的消息区域高度调整
- **GOTCHA**：屏幕旋转可能导致 Capacitor WebView 重新加载，需测试验证。如果有问题，可在 AndroidManifest.xml 中配置 `android:configChanges="orientation|screenSize"` 防止 Activity 重建
- **VALIDATE**：旋转屏幕后 App 状态不丢失，布局正常

---

### 任务 16：CREATE `android/src/composables/useNativeFeatures.js`

- **IMPLEMENT**：创建统一的原生能力封装 composable
  ```javascript
  import { Haptics, ImpactStyle } from '@capacitor/haptics'
  import { LocalNotifications } from '@capacitor/local-notifications'
  import { Preferences } from '@capacitor/preferences'
  import { App } from '@capacitor/app'

  // 振动反馈
  export async function vibrateOnMessage() {
    await Haptics.impact({ style: ImpactStyle.Medium })
  }

  // 状态栏通知
  export async function notifyNewMessage(senderNickname, content) {
    await LocalNotifications.schedule({
      notifications: [{
        title: `${senderNickname} 发来消息`,
        body: content,
        id: Date.now() % 2147483647,  // Android 通知 ID 必须是 32 位整数
        channelId: 'messages'
      }]
    })
  }

  // 初始化通知渠道（Android 8+ 必需）
  export async function initNotificationChannel() {
    await LocalNotifications.createChannel({
      id: 'messages',
      name: '新消息',
      description: 'SmileMsg 新消息通知',
      importance: 4,  // HIGH
      vibration: true
    })
  }

  // 请求通知权限（Android 13+ 必需）
  export async function requestNotificationPermission() {
    const result = await LocalNotifications.requestPermissions()
    return result.display === 'granted'
  }

  // 本地持久化：保存会话状态
  export async function saveSession(uuid, nickname) {
    await Preferences.set({ key: 'session_uuid', value: uuid })
    await Preferences.set({ key: 'session_nickname', value: nickname })
  }

  // 本地持久化：读取会话状态
  export async function loadSession() {
    const uuid = await Preferences.get({ key: 'session_uuid' })
    const nickname = await Preferences.get({ key: 'session_nickname' })
    if (uuid.value && nickname.value) {
      return { uuid: uuid.value, nickname: nickname.value }
    }
    return null
  }

  // 本地持久化：清除会话状态（主动退出时调用）
  export async function clearSession() {
    await Preferences.remove({ key: 'session_uuid' })
    await Preferences.remove({ key: 'session_nickname' })
  }

  // 检查 App 是否在前台
  let isAppInForeground = true
  export function setupAppLifecycle() {
    App.addListener('pause', () => { isAppInForeground = false })
    App.addListener('resume', () => { isAppInForeground = true })
  }
  export function isInForeground() { return isAppInForeground }
  ```
- **VALIDATE**：文件语法正确，所有 import 路径正确

### 任务 17：UPDATE `android/src/composables/useSocket.js` 集成原生能力

- **IMPLEMENT**：修改从 web 复制来的 useSocket.js，添加以下差异化逻辑：

  **1. Socket.io 连接配置**（第 44 行附近）：
  - 添加 `transports: ['websocket']` 作为额外保障（配合 capacitor.config.ts 中已禁用 CapacitorHttp）

  **2. new_message 事件处理**（第 75 行附近）：
  - 收到消息时调用 `onNewMessage(message)` 函数
  - `onNewMessage`：判断 App 是否在前台，前台→振动，后台→状态栏通知

  **3. conversation_created 事件处理**（第 84 行附近）：
  - 收到会话创建通知时也触发振动/通知

  **4. login 函数**（第 110 行附近）：
  - 登录成功后调用 `saveSession(uuid, nickname)` 持久化

  **5. destroyAndReset 函数**（第 183 行附近）：
  - 添加 `clearSession()` 调用（主动退出时清除持久化数据）

  **6. 新增 tryRestoreSession 函数**：
  - 读取本地持久化的 UUID 和昵称
  - 如果存在，自动发起 login 尝试恢复会话
  - 恢复失败（昵称被占用等）→ 清除持久化数据，停留在登录页

- **PATTERN**：`desktop/src/renderer/src/composables/useSocket.js`（第 81-95 行，document.hidden 检查 + IPC 通知的模式）
- **GOTCHA**：
  - `vibrateOnMessage()` 和 `notifyNewMessage()` 是异步函数，但 socket 事件处理器中不需要 await（fire-and-forget）
  - `isInForeground()` 状态需要在 App.vue 初始化时调用 `setupAppLifecycle()`
- **VALIDATE**：代码修改后，登录→发消息→收消息→振动反馈的全流程正常

### 任务 18：UPDATE `android/src/main.js` 初始化原生能力

- **IMPLEMENT**：在 Vue 应用挂载前初始化通知渠道和 App 生命周期监听
  ```javascript
  import { createApp } from 'vue'
  import App from './App.vue'
  import { initNotificationChannel, requestNotificationPermission, setupAppLifecycle } from './composables/useNativeFeatures'

  // 初始化原生能力
  async function initNative() {
    setupAppLifecycle()
    await initNotificationChannel()
    await requestNotificationPermission()
  }

  initNative().then(() => {
    createApp(App).mount('#app')
  })
  ```
- **PATTERN**：`web/src/main.js`（简单的 createApp + mount）
- **VALIDATE**：App 启动时不报权限错误

### 任务 19：UPDATE `android/src/App.vue` 添加自动恢复逻辑

- **IMPLEMENT**：在 App.vue 的 setup 或 onMounted 中：
  1. 调用 `tryRestoreSession()`（useSocket 中新增的函数）
  2. 如果恢复成功，直接进入 idle 或 chat 状态
  3. 如果无持久化数据或恢复失败，停留在 login 页面
- **VALIDATE**：杀进程后重新打开 App，能自动恢复（前提是对方仍在线）

---

### 任务 20：配置 App 图标

- **IMPLEMENT**：
  - 从 `desktop/resources/icon.ico` 转换生成 Android 所需的各尺寸图标
  - 使用 ImageMagick 或 Android Studio 的 Image Asset Studio 从 ico 文件生成 mipmap 资源
  - 放置到 `android/android/app/src/main/res/` 的各 mipmap 目录下（mdpi/hdpi/xhdpi/xxhdpi/xxxhdpi）
- **GOTCHA**：ico 文件通常包含多种尺寸，提取最大尺寸（256x256）作为源图进行转换
- **VALIDATE**：App 在设备上显示正确的图标

### 任务 21：APK 签名（使用 debug 签名）

- **IMPLEMENT**：
  - 使用 Android SDK 默认的 debug keystore 签名即可，无需生成 release keystore
  - debug keystore 位于 `~/.android/debug.keystore`（Android SDK 自动生成）
- **GOTCHA**：debug 签名的 APK 可正常安装和使用，仅不适合上架应用市场（本项目不上架）
- **VALIDATE**：`gradlew assembleDebug` 能产出签名的 APK

### 任务 22：UPDATE `android/package.json` 添加构建脚本

- **IMPLEMENT**：
  ```json
  {
    "scripts": {
      "dev": "vite",
      "build": "vite build && npx cap sync android",
      "build:apk": "vite build && npx cap sync android && cd android && ./gradlew assembleDebug"
    }
  }
  ```
- **GOTCHA**：
  - `./gradlew` 在 Git Bash 下可用。如果 pnpm 使用 CMD/PowerShell 执行脚本，需要改为 `gradlew.bat`。实施时根据实际 shell 环境调整
  - 使用 `assembleDebug` 而非 `assembleRelease`，因为本项目使用 debug 签名
  - APK 产出路径：`android/android/app/build/outputs/apk/debug/app-debug.apk`
- **VALIDATE**：`pnpm --filter android build:apk` 产出 debug APK 文件

### 任务 23：UPDATE `.gitignore` 添加 Android 构建产物排除

- **IMPLEMENT**：在根目录 `.gitignore` 中添加 Android 相关的排除规则：
  ```
  # Android (Capacitor)
  android/android/.gradle/
  android/android/app/build/
  android/android/local.properties
  android/android/.idea/
  android/android/capacitor-cordova-android-plugins/
  ```
- **GOTCHA**：`android/android/` 是 Capacitor 生成的原生 Android 项目，其中 `.gradle/`、`app/build/`、`local.properties` 等都不应提交到 Git
- **VALIDATE**：`git status` 不会显示 Android 构建产物

### 任务 24：最终验证

- **IMPLEMENT**：在 Android 10+ 真机上安装 Debug APK，完整测试：
  1. 安装 APK → 打开 App → 登录页正常
  2. 输入昵称 → 登录成功 → idle 页面（显示昵称输入框）
  3. 输入对方昵称 → 发起聊天 → 消息往返
  4. 前台收消息 → 振动反馈
  5. 切后台 → 收消息 → 状态栏通知
  6. 点击通知 → 回到 App
  7. 网络切换（WiFi ↔ 移动数据）→ 自动重连
  8. 杀进程 → 重新打开 → 自动恢复会话
  9. 主动退出 → 下次打开回到登录页
  10. 横竖屏旋转 → 布局正常，状态不丢失
  11. 返回键 → chat 回 login → idle 回 login → login 退出 App

---

## 测试策略

本项目无 lint 和测试配置（CLAUDE.md 已明确说明）。测试策略以手动验证为主。

### 手动测试清单

#### 基础功能
- [ ] 登录：输入昵称成功登录
- [ ] 登录：昵称已被占用时显示错误
- [ ] idle 页面：显示输入对方昵称的输入框和发起聊天按钮
- [ ] 发起聊天：输入对方昵称成功发起私聊
- [ ] 发起聊天：对方不存在/不在线时显示错误
- [ ] 发起聊天：对方已在聊天中时显示错误
- [ ] 消息收发：发送文本消息对方能收到
- [ ] 消息收发：接收对方消息实时显示
- [ ] 消息收发：回车键发送消息
- [ ] 对方离线：显示系统提示，输入区域禁用

#### 移动端特性
- [ ] 振动：前台收消息时手机振动
- [ ] 通知：后台收消息时状态栏弹通知
- [ ] 通知：点击通知回到 App
- [ ] 持久化恢复：杀进程后重新打开自动恢复
- [ ] 持久化恢复：恢复失败（对方已离开）回到 idle 页面
- [ ] 主动退出：退出后清除数据，回到登录页
- [ ] 返回键：chat → login（与"断开"按钮一致）
- [ ] 返回键：idle → login
- [ ] 返回键：login → 退出 App
- [ ] 横竖屏：旋转后布局正常，状态不丢失

#### 连接管理
- [ ] 断线重连：关闭 WiFi 再打开，自动重连
- [ ] 网络切换：WiFi ↔ 移动数据切换，自动重连
- [ ] 连接状态：断线时 UI 显示状态指示

### 边缘情况

- [ ] 空昵称提交
- [ ] 超长昵称（>20 字符）
- [ ] 快速连续点击发送按钮
- [ ] 消息列表超过 200 条时自动裁剪
- [ ] 在登录过程中切后台再回来
- [ ] 两台设备用同一昵称登录（应踢掉旧连接）

---

## 验证命令

### 级别 1：构建验证

```bash
# Web 构建（确保 Vite 能成功编译 Vue + Tailwind）
pnpm --filter android build

# Capacitor 同步
cd android && npx cap sync android
```

### 级别 2：APK 构建

```bash
# Debug APK（无需签名）
cd android/android && ./gradlew assembleDebug

# Debug APK 即为最终分发版本（本项目使用 debug 签名）
```

### 级别 3：运行验证

```bash
# 在已连接的设备或模拟器上安装并运行
cd android && npx cap run android
```

### 级别 4：手动验证

按照上述手动测试清单逐项验证。

---

## 验收标准

- [ ] App 在 Android 10+ 设备上能正常安装和启动
- [ ] 登录、聊天、消息收发与 Web 端功能完全对等
- [ ] 前台收消息有振动反馈
- [ ] 后台收消息有状态栏通知
- [ ] 杀进程后能自动恢复会话
- [ ] 主动退出清除所有本地数据
- [ ] 网络切换自动重连
- [ ] Android 返回键行为正确（chat/idle → login，login → 退出）
- [ ] 横竖屏布局正常
- [ ] Debug APK 能成功构建
- [ ] 服务端零改动

---

## 完成检查清单

- [ ] 所有任务按顺序完成
- [ ] `pnpm --filter android build` 成功
- [ ] `npx cap sync android` 成功
- [ ] Debug APK 在模拟器上运行正常
- [ ] Debug APK 在真机上安装运行正常
- [ ] 手动测试清单全部通过
- [ ] 所有验收标准均满足
- [ ] monorepo 配置更新完成（workspace + 根 package.json）
- [ ] .gitignore 更新（排除 android/android 构建产物等）

---

## 备注

### 设计决策

1. **Capacitor 而非原生 Kotlin**：SmileMsg 是文本聊天应用，UI 复杂度低，Capacitor 能最大化复用现有 Vue 3 代码，开发成本最低。所有所需的原生能力（通知、振动、持久化）都有成熟的 Capacitor 插件。

2. **代码复制而非共享**：与 desktop 端一致，采用复制 web/src 代码再做差异化修改的策略。虽然不够 DRY，但避免了跨包引用的构建复杂度，且各平台的差异化修改互不影响。

3. **MVP 不做前台服务保活**：前台服务保活的 Capacitor 插件是 Sponsorware（需赞助），且 SmileMsg 的使用场景是主动聊天而非被动接收，Socket.io 的自动重连 + 本地持久化恢复机制已足够保证用户体验。后续可根据实际需求评估是否引入前台服务。

4. **禁用 CapacitorHttp 而非强制 WebSocket**：两种方案都能解决 socket.io 兼容性问题，选择禁用 CapacitorHttp 是因为它更全面（不仅解决 socket.io 问题，也避免其他 HTTP 请求被拦截）。同时在 socket.io 连接配置中也添加 `transports: ['websocket']` 作为额外保障。

5. **环境变量必须写完整 URL**：与 Web 端不同，Capacitor App 的 WebView origin 是 `capacitor://localhost`，不能用相对路径连接服务器。生产环境必须硬编码 `https://smile-msg.zeabur.app`。

### 关键风险

1. **pnpm + Capacitor 兼容性**：pnpm 的符号链接 node_modules 结构可能导致 Capacitor 找不到 `@capacitor/core/native-bridge.js`。如果遇到此问题，在项目根目录 `.npmrc` 中添加 `shamefully-hoist=true` 或改用 `public-hoist-pattern` 配置。

2. **Android 厂商电池优化**：部分厂商（小米、华为等）会积极杀后台 App。目前 MVP 不做前台服务保活，依赖 Socket.io 自动重连和本地持久化恢复。如果用户反馈后台频繁断线，后续可引入前台服务方案。

3. **软键盘布局适配**：Android WebView 中软键盘弹起的行为可能因设备而异。需要在 ChatView 中测试验证输入区域不被遮挡。Capacitor 提供了 `Keyboard` 插件可以辅助处理。

---

## 外部研究验证结果（2026-01-30）

### 技术版本确认

| 包名 | 计划版本 | 验证结果 |
|------|----------|----------|
| @capacitor/core | ^7.0.0 | ✅ 最新 7.0.1（Cap 8 已发布，但按决策使用 Cap 7） |
| @capacitor/cli | ^7.0.0 | ✅ 与 core 对齐 |
| @capacitor/android | ^7.0.0 | ✅ |
| @capacitor/local-notifications | ^7.0.0 | ✅ createChannel/requestPermissions API 确认存在 |
| @capacitor/haptics | ^7.0.0 | ✅ ImpactStyle 枚举确认存在（Light/Medium/Heavy） |
| @capacitor/preferences | ^7.0.0 | ✅ set/get/remove API 签名无变化，仅支持 string 值 |
| @capacitor/app | ^7.0.0 | ✅ backButton/pause/resume 事件监听确认存在 |

### 关键发现

1. **CapacitorHttp 默认已禁用**：Capacitor 7 中 `CapacitorHttp.enabled` 默认值为 `false`，无需额外配置即可正常使用 socket.io。但显式配置 `enabled: false` 更安全，已保留在计划中。

2. **Capacitor 7 minSdkVersion = 23**（Android 6.0），PRD 要求 API 29（Android 10）。需在 `variables.gradle` 中手动设置 `minSdkVersion = 29`。已更新任务 10。

3. **初始化流程**：需先 `npx cap init` 再 `npx cap add android`，且 `cap add` 要求 `webDir`（dist/）已存在。已更新任务 9 的步骤顺序。

4. **pnpm 兼容性**：无官方强制要求 `shamefully-hoist`。如遇插件解析问题，可在 `.npmrc` 添加 `public-hoist-pattern[]=*@capacitor*`。已记录在风险项中。

5. **backButton 事件注意**：监听 `backButton` 会禁用 Android 默认返回行为，需手动处理所有返回逻辑。可用 `App.toggleBackButtonHandler()` 动态控制。

6. **Capacitor 8 已发布**（8.0.2），但按用户决策使用 Capacitor 7，理由是所有官方插件版本完整对齐（7.x）、更稳定。
