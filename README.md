# SmileMsg

阅后即焚的轻量级即时通讯工具。所有消息仅存于服务器内存，重启即清零，不连接任何数据库。

## 特性

- **零持久化** — 纯内存存储，进程结束数据彻底消失
- **免注册** — 输入昵称即可登录，无需密码
- **一对一私聊** — 输入对方昵称直接发起聊天
- **多端互通** — Web 端（浏览器）与 Windows 桌面端实时通信
- **断线恢复** — 网络恢复后自动重连并恢复身份与会话
- **托盘常驻** — 桌面端关闭窗口最小化到系统托盘

## 项目结构

```
smile-msg/
├── server/     Node.js + Express + Socket.io 服务端
├── web/        Vue 3 + Vite + Tailwind CSS Web 客户端
└── desktop/    Electron 桌面客户端
```

## 快速开始

### 环境要求

- Node.js ≥ 18
- pnpm ≥ 8

### 安装依赖

```bash
pnpm install
```

### 开发模式

启动服务端和 Web 客户端（需要两个终端）：

```bash
pnpm dev:server    # 服务端 → http://localhost:3000
pnpm dev:web       # Web 客户端 → http://localhost:5173
```

启动桌面端开发（需要服务端同时运行）：

```bash
pnpm dev:desktop
```

### 构建

```bash
pnpm build:web       # Web 生产构建 → web/dist/
pnpm build:desktop   # Desktop 构建 → desktop/out/
```

### 桌面端打包

```bash
pnpm --filter desktop build:win   # 生成 Windows portable .exe
```

产物位于 `desktop/dist/`。

## 使用方式

### Web 端

浏览器访问部署地址（或本地 `http://localhost:5173`），输入昵称登录，输入对方昵称发起聊天。

### 桌面端

运行 `SmileMsg.exe`，使用方式与 Web 端一致。关闭窗口会最小化到系统托盘，右键托盘图标可彻底退出。

### 管理页面

访问 `/admin` 查看当前在线用户列表。

## 技术栈

| 模块 | 技术 |
|------|------|
| 服务端 | Node.js, Express, Socket.io |
| Web 客户端 | Vue 3, Vite, Tailwind CSS 4 |
| 桌面客户端 | Electron, electron-vite |
| 打包 | electron-builder |
| 包管理 | pnpm workspaces |

## 部署

服务端部署在 Zeabur PaaS，同时托管 Web 客户端的构建产物。生产环境下浏览器访问服务器根路径即可使用 Web 端。

环境变量：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PORT` | 服务端端口 | 3000 |
| `NODE_ENV` | 运行环境 | — |

## 协议

私有项目。
