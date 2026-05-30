# TaskBoard

极轻量局域网任务板。Express 提供页面和 API，原生前端负责交互，WebSocket 实时同步，SQLite 保存数据。

## 使用

```powershell
npm install
npm start
```

服务默认监听 `0.0.0.0:3000`。启动后，终端会输出本机地址和局域网 IPv4 地址。
如果端口被占用，会从当前端口开始自动尝试下一个端口，默认最多尝试 50 次。

可选环境变量：

```powershell
$env:PORT=3001; $env:PORT_RETRY_LIMIT=100; npm start
```

数据文件位于 `data/taskboard.db`，首次启动自动创建。

## 局域网文件传输

页面侧边栏会显示当前连接到同一服务的在线用户。点击用户旁边的发送按钮可以选择文件并发起传输；接收方确认后，浏览器会通过 WebRTC DataChannel 尝试局域网点对点直连。

文件内容不经过服务器，不写入 `data/taskboard.db`，服务器只转发在线状态和 WebRTC 信令。当前版本不限制单个文件大小，但浏览器仍会受可用内存和磁盘空间影响；暂不支持断点续传、文件夹发送或离线发送。

该功能不使用 STUN/TURN 中继；如果浏览器、系统防火墙或局域网策略阻止点对点连接，传输会失败，不会退回到服务器中转。首次运行 exe 时，Windows 防火墙需要允许该程序访问专用网络。

## 打包 exe

```powershell
npm run build:exe
```

生成文件：`dist/TaskBoard.exe`。

双击 exe 后会启动服务并输出本机地址、局域网地址。其他设备访问终端里显示的 `http://局域网IP:3000` 即可。首次运行时，Windows 防火墙需要允许该程序访问专用网络。

exe 运行时的数据文件位于 exe 同目录的 `data/taskboard.db`，便于拷贝和备份。
