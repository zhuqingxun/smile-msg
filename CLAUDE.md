# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概览

SmileMsg 是一个"阅后即焚"即时通讯工具，采用 pnpm monorepo 架构，包含三个包：

- **server/** — Node.js + Express + Socket.io 服务端，纯内存存储（无数据库），重启即清零
- **web/** — Vue 3 + Vite + Tailwind CSS 4 Web 客户端
- **desktop/** — Electron 桌面客户端，与 web 共享同一套 Vue 组件代码（复制而非引用）

## 常用命令

```bash
# 安装依赖
pnpm install

# 开发（需同时启动 server 和前端）
pnpm dev:server          # 服务端 (localhost:3000, node --watch)
pnpm dev:web             # Web 客户端 (localhost:5173)
pnpm dev:desktop         # Electron 桌面客户端

# 构建
pnpm build:web           # Web 生产构建 → web/dist/
pnpm build:desktop       # Desktop 构建 → desktop/dist/

# Desktop 打包为 .exe
pnpm --filter desktop build:win

# 单包命令
pnpm --filter server start     # 生产模式启动服务端
pnpm --filter web preview      # 预览 Web 构建结果
```

无 lint 和测试配置。

## 架构要点

### 通信模型

客户端通过 Socket.io 与服务端通信，核心事件流：
- `login` → 用户以 UUID + 昵称登录（UUID 客户端生成，用于断线恢复）
- `create_private_chat` → 发起一对一私聊（同一用户同时只能参与一个会话）
- `send_message` / `new_message` → 消息收发
- `peer_offline` / `force_disconnect` → 连接管理

### 服务端数据结构（server/src/store.js）

四个 Map 维护全部状态：`users`（UUID→用户信息）、`conversations`（会话ID→成员）、`socketToUser`（socket→UUID 映射）、`nicknameToUuid`（昵称→UUID 映射）。

### 客户端核心逻辑

`composables/useSocket.js` 是前端核心（~305行），封装了 Socket.io 连接管理、全局响应式状态和所有业务方法。Web 和 Desktop 各有一份相同的副本。

### 前端状态机

App.vue 根据 `phase` 变量切换视图：`login` → LoginView，`idle`/`chatting` → ChatView。

### Electron 特性

主进程（desktop/src/main/index.js）实现了系统托盘常驻（关闭窗口=隐藏到托盘），右键菜单退出。

## 环境配置

| 环境 | Server | Web VITE_SERVER_URL | Desktop VITE_SERVER_URL |
|------|--------|---------------------|------------------------|
| 开发 | localhost:3000 | http://localhost:3000 | http://localhost:3000 |
| 生产 | Zeabur 部署 | （空，使用相对路径） | https://smile-msg.zeabur.app |

## 部署

服务端部署在 Zeabur PaaS，同时托管 web/dist/ 静态文件。Desktop 分发 portable .exe 文件。管理页面：`GET /admin`，健康检查：`GET /health`。
