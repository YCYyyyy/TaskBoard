# TaskBoard

TaskBoard 是一个轻量级局域网任务看板。它使用 Express 提供页面和 API，原生前端负责交互，WebSocket 做实时同步，SQLite 保存任务数据。

适合在同一局域网内临时协作、分配任务、同步进度，也支持浏览器之间的点对点文件传输。

## 功能

- 项目管理：新建、重命名、置顶、归档、删除项目。
- 任务看板：待接取、已接取、已完成三列状态流转。
- 实时同步：多端打开同一服务地址后，通过 WebSocket 同步项目、任务和在线状态。
- 用户身份：本地保存姓名、头像图标和头像颜色，便于区分任务负责人。
- 局域网文件传输：在线用户之间通过 WebRTC DataChannel 尝试点对点传输文件。
- 本地数据：任务数据保存到 SQLite 数据库，不依赖外部服务。
- exe 打包：可打包为单个 Windows 可执行文件，方便分发到局域网环境。

## 技术栈

- Node.js 24+
- Express 5
- ws
- node:sqlite
- 原生 HTML / CSS / JavaScript
- esbuild + postject

## 环境要求

需要安装 Node.js 24 或更高版本。项目使用 `node:sqlite` 和 Node SEA 相关能力，低版本 Node 不能保证正常运行。

检查版本：

```powershell
node -v
npm -v
```

## 本地运行

安装依赖：

```powershell
npm install
```

运行语法检查：

```powershell
npm run check
```

启动服务：

```powershell
npm start
```

服务默认监听 `0.0.0.0:3000`。启动后，终端会输出本机访问地址和局域网 IPv4 访问地址。其他设备连接同一局域网后，访问终端输出的局域网地址即可使用。

如果端口被占用，服务会从当前端口开始自动尝试下一个端口，默认最多尝试 50 次。

## 配置

可通过环境变量调整服务行为：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `HOST` | `0.0.0.0` | 服务监听地址 |
| `PORT` | `3000` | 起始监听端口 |
| `PORT_RETRY_LIMIT` | `50` | 端口占用时的最大重试次数 |
| `DATA_DIR` | `data` | SQLite 数据目录 |

PowerShell 示例：

```powershell
$env:PORT=3001; $env:PORT_RETRY_LIMIT=100; npm start
```

指定数据目录：

```powershell
$env:DATA_DIR="D:\TaskBoardData"; npm start
```

## 数据存储

源码运行时，数据库默认位于：

```text
data/taskboard.db
```

SQLite 运行时还可能生成 `taskboard.db-shm` 和 `taskboard.db-wal` 文件。这些都是本地运行数据，已在 `.gitignore` 中忽略。

## 局域网文件传输

页面侧边栏会显示当前连接到同一服务的在线用户。点击用户旁边的发送按钮可以选择文件并发起传输；接收方确认后，浏览器会通过 WebRTC DataChannel 尝试局域网点对点直连。

文件内容不经过服务器，也不会写入 `data/taskboard.db`。服务器只转发在线状态和 WebRTC 信令。

当前版本不限制单个文件大小，但浏览器仍会受可用内存和磁盘空间影响。暂不支持断点续传、文件夹发送或离线发送。

该功能不使用 STUN/TURN 中继。如果浏览器、系统防火墙或局域网策略阻止点对点连接，传输会失败，不会退回到服务器中转。

## 打包 exe

执行：

```powershell
npm run build:exe
```

生成文件：

```text
dist/TaskBoard.exe
```

双击 exe 后会启动服务并输出本机地址、局域网地址。其他设备访问终端中显示的 `http://局域网IP:端口` 即可。

首次运行 exe 时，Windows 防火墙可能会提示授权，需要允许该程序访问专用网络。

exe 运行时的数据文件位于 exe 同目录下的 `data/taskboard.db`，便于拷贝和备份。

## 项目结构

```text
TaskBoard/
├── public/
│   ├── index.html
│   ├── app.js
│   └── styles.css
├── scripts/
│   └── build-exe.js
├── server.js
├── package.json
├── package-lock.json
└── README.md
```

## 常用命令

```powershell
npm install
npm run check
npm start
npm run build:exe
```
