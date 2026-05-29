# TaskBoard

极轻量局域网任务板。Express 提供页面和 API，原生前端负责交互，WebSocket 实时同步，SQLite 保存数据。

## 使用

```powershell
npm install
npm start
```

服务默认监听 `0.0.0.0:3000`。启动后，终端会输出本机地址和局域网 IPv4 地址。

可选环境变量：

```powershell
$env:PORT=3001; npm start
```

数据文件位于 `data/taskboard.db`，首次启动自动创建。
