# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概览

SmileMsg 是一个"阅后即焚"即时通讯工具，采用 pnpm monorepo 架构，包含五个包：

- **server/** — Node.js + Express 服务端，支持 Socket.io 和原生 WebSocket 双协议，纯内存存储（无数据库），重启即清零
- **web/** — Vue 3 + Vite + Tailwind CSS 4 Web 客户端
- **desktop/** — Electron 桌面客户端，与 web 共享同一套 Vue 组件代码（复制而非引用）
- **android/** — Capacitor 7 + Vue 3 Android 混合客户端，使用 Socket.io 连接
- **harmony/** — HarmonyOS NEXT 原生客户端（ArkTS），使用原生 WebSocket 连接

## 常用命令

```bash
# 安装依赖
pnpm install

# 开发（需同时启动 server 和前端）
pnpm dev:server          # 服务端 (localhost:3000, node --watch)
pnpm dev:web             # Web 客户端 (localhost:5173)
pnpm dev:desktop         # Electron 桌面客户端
pnpm dev:android         # Android 客户端 (Vite 开发)

# 构建
pnpm build:web           # Web 生产构建 → web/dist/
pnpm build:desktop       # Desktop 构建 → desktop/dist/
pnpm build:android       # Android 构建

# Desktop 打包为 .exe
pnpm --filter desktop build:win

# Android Capacitor
pnpm --filter android cap:sync    # 同步 Web 资源到原生项目
pnpm --filter android cap:run     # 在设备/模拟器运行
pnpm --filter android build:apk   # 构建 APK

# 单包命令
pnpm --filter server start     # 生产模式启动服务端
pnpm --filter web preview      # 预览 Web 构建结果
```

无 lint 和测试配置。HarmonyOS 使用 DevEco Studio 独立构建，不在 pnpm workspace 内。

## 架构要点

### 双协议通信模型

服务端同时支持 Socket.io（Web/Desktop/Android）和原生 WebSocket（HarmonyOS），通过 `bridge.js` 统一路由：

- **bridge.js** — 维护 `wsConnections` Map，提供 `sendToUser()` 自动选择协议（优先 Socket.io，回退 WebSocket）
- **handlers/chat.js** — Socket.io 事件处理
- **handlers/ws.js** — WebSocket 事件处理，含心跳检活（10秒 ping，连续2次无 pong 断开）
- **handlers/chatLogic.js** — 共享业务逻辑层，供两个协议处理器复用

核心事件流：
- `login` → 用户以 UUID + 昵称登录（UUID 客户端生成，用于断线恢复，30分钟宽限期）
- `create_private_chat` → 发起一对一私聊（同一用户同时只能参与一个会话）
- `send_message` / `new_message` → 消息收发
- `peer_offline` / `force_disconnect` → 连接管理
- `register_push_token` → 推送 token 注册（区分平台）
- `app_state` → 前后台状态上报

### 多平台推送

- **push.js** — 统一推送入口，`sendPush(token, platform, payload)` 按平台路由
- **FCM** — 用于 Android（google-services），通过 firebase-admin SDK
- **华为 Push Kit** — 用于 HarmonyOS（`huaweiPush.js`），OAuth 2.0 鉴权，token 自动缓存刷新
- 推送 token 失效时自动清空（`token_invalid` 响应处理）

服务端推送相关环境变量：`HUAWEI_APP_ID`、`HUAWEI_APP_SECRET`、`GOOGLE_APPLICATION_CREDENTIALS`（FCM）

### 服务端数据结构（server/src/store.js）

四个 Map 维护全部状态：`users`（UUID→用户信息）、`conversations`（会话ID→成员）、`socketToUser`（socket→UUID 映射）、`nicknameToUuid`（昵称→UUID 映射）。

### 客户端核心逻辑

`composables/useSocket.js` 是前端核心，封装 Socket.io 连接管理、全局响应式状态和所有业务方法。Web、Desktop、Android 各有一份副本。

Android 额外有 `composables/useNativeFeatures.js`：GMS 检测、前台服务保活、FCM token 管理、振动反馈、本地通知。

HarmonyOS 使用 ArkTS 原生开发：`SocketService.ets`（WebSocket + ACK 回调 + 自动重连）、`AppState.ets`（AppStorage 全局状态）、`PushHelper.ets`（Push Kit token）。

### 前端状态机

App.vue 根据 `phase` 变量切换视图：`login` → LoginView，`idle`/`chatting` → ChatView。

### Electron 特性

主进程（desktop/src/main/index.js）实现了系统托盘常驻（关闭窗口=隐藏到托盘），右键菜单退出。

### Android 保活策略

根据 GMS 可用性自动选择：有 GMS → 前台服务保活（`STRATEGY_FOREGROUND_SERVICE`）；无 GMS → 被动推送模式（`STRATEGY_PASSIVE`）。GMS 检测有 5 秒超时。

## 环境配置

| 环境 | Server | Web VITE_SERVER_URL | Desktop VITE_SERVER_URL | Android VITE_SERVER_URL |
|------|--------|---------------------|------------------------|------------------------|
| 开发 | localhost:3000 | http://localhost:3000 | http://localhost:3000 | http://localhost:3000 |
| 生产 | Zeabur 部署 | （空，使用相对路径） | https://smile-msg.zeabur.app | https://smile-msg.zeabur.app |

## Desktop 打包注意事项

- **打包前必须杀旧进程**：SmileMsg 使用系统托盘常驻，关闭窗口不等于退出。旧进程锁定 exe 文件会导致打包卡住。`prebuild:win` 脚本会自动 `taskkill /F /IM SmileMsg.exe`。
- **打包后自动创建桌面快捷方式**：`postbuild:win` 脚本（`scripts/postbuild-win.ps1`）会刷新图标缓存、复制 `SmileMsg.ico` 到 `dist/`、并创建桌面快捷方式。快捷方式的 `IconLocation` 指向 `.ico` 文件而非 exe PE 资源，以避免高 DPI（200%）下透明图标出现白色方框背景。
- **禁止手动右键"发送到桌面快捷方式"**：Windows 右键创建的快捷方式从 exe PE 资源提取图标，在高 DPI 下会丢失透明度。始终使用构建流程自动生成的快捷方式。
- **禁止用 rcedit 修改 portable exe**：portable exe 是自解压包装器，修改 PE 资源会破坏其结构导致无法启动。
- 以上步骤已内置在 `pnpm --filter desktop build:win` 的 pre/post 钩子中，无需手动执行。

## 部署

服务端部署在 Zeabur PaaS，同时托管 web/dist/ 静态文件。Desktop 分发 portable .exe 文件。管理页面：`GET /admin`，健康检查：`GET /health`。
