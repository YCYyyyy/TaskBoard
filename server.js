'use strict';

const express = require('express');
const crypto = require('crypto');
const http = require('http');
const os = require('os');
const path = require('path');
const { mkdirSync, statSync } = require('fs');
const sea = require('node:sea');
const { DatabaseSync } = require('node:sqlite');
const { WebSocket, WebSocketServer } = require('ws');

const DEFAULT_PORT = 3000;
const PORT = normalizePort(process.env.PORT, DEFAULT_PORT);
const MAX_PORT_ATTEMPTS = normalizeRetryLimit(process.env.PORT_RETRY_LIMIT, 50);
const HOST = process.env.HOST || '0.0.0.0';
const MAX_SIGNAL_BYTES = 64 * 1024;
const TRANSFER_TTL_MS = 6 * 60 * 60 * 1000;
const EXE_FILE_NAME = 'TaskBoard.exe';
const EXE_DOWNLOAD_URL = '/api/download/taskboard.exe';
const IS_SEA = sea.isSea();
const APP_ROOT = IS_SEA ? path.dirname(process.execPath) : __dirname;
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(APP_ROOT, 'data');
const DB_PATH = path.join(DATA_DIR, 'taskboard.db');
const TASK_STATUSES = new Set(['open', 'claimed', 'done']);
const TASK_BACKGROUNDS = new Set(['white', 'red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple']);
const MIME_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.webp', 'image/webp']
]);
const AVATAR_COLORS = new Set([
  'linear-gradient(135deg, #ff9a9e 0%, #fad0c4 100%)',
  'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
  'linear-gradient(135deg, #ff8177 0%, #b12a5b 100%)',
  'linear-gradient(135deg, #f6d365 0%, #fda085 100%)',
  'linear-gradient(135deg, #a1c4fd 0%, #c2e9fb 100%)',
  'linear-gradient(135deg, #d4fc79 0%, #96e6a1 100%)',
  'linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%)',
  'linear-gradient(135deg, #a6c0fe 0%, #f68084 100%)',
  'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
  'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
  'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
  'linear-gradient(135deg, #30cfd0 0%, #330867 100%)',
  'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  'linear-gradient(135deg, #6a11cb 0%, #2575fc 100%)',
  'linear-gradient(135deg, #00c6fb 0%, #005bea 100%)',
  'linear-gradient(135deg, #f83600 0%, #f9d423 100%)',
  'linear-gradient(135deg, #89f7fe 0%, #66a6ff 100%)',
  'linear-gradient(135deg, #fddb92 0%, #d1fdff 100%)',
  'linear-gradient(135deg, #00c6ff, #0072ff)',
  'linear-gradient(135deg, #00f5a0, #00d9f5)',
  'linear-gradient(135deg, #ff4ecd, #7c3aed)',
  'linear-gradient(135deg, #ff7a18, #ff2d55)',
  'linear-gradient(135deg, #facc15, #fb923c)',
  'linear-gradient(135deg, #22c55e, #16a34a)',
  'linear-gradient(135deg, #38bdf8, #a78bfa)',
  'linear-gradient(135deg, #fb7185, #f43f5e)',
  'linear-gradient(135deg, #818cf8, #2563eb)',
  'linear-gradient(135deg, #2dd4bf, #0f766e)',
  'linear-gradient(135deg, #f472b6, #ec4899)',
  'linear-gradient(135deg, #a3e635, #14b8a6)',
  'linear-gradient(135deg, #9cafaa, #6f8f8a)',
  'linear-gradient(135deg, #d8a7a7, #b77d7d)',
  'linear-gradient(135deg, #aab4c8, #7d8ca7)',
  'linear-gradient(135deg, #c7b7a3, #9b8a76)',
  'linear-gradient(135deg, #c99b83, #a8735e)',
  'linear-gradient(135deg, #a8c0bd, #6f9994)',
  'linear-gradient(135deg, #c4b7d2, #9684aa)',
  'linear-gradient(135deg, #b4b893, #858b62)',
  'linear-gradient(135deg, #c7a1b2, #9b7188)',
  'linear-gradient(135deg, #8fa1b3, #60758a)',
  'linear-gradient(135deg, #c5a08a, #92705f)',
  'linear-gradient(135deg, #d4c49a, #a99866)',
  'linear-gradient(135deg, #38bdf8, #2563eb)',
  'linear-gradient(135deg, #34d399, #059669)',
  'linear-gradient(135deg, #fb7185, #e11d48)',
  'linear-gradient(135deg, #a78bfa, #7c3aed)',
  'linear-gradient(135deg, #fbbf24, #f97316)',
  'linear-gradient(135deg, #22d3ee, #0891b2)',
  'linear-gradient(135deg, #f472b6, #db2777)',
  'linear-gradient(135deg, #a3e635, #22c55e)',
  'linear-gradient(135deg, #818cf8, #4f46e5)',
  'linear-gradient(135deg, #f87171, #dc2626)',
  'linear-gradient(135deg, #2dd4bf, #0f766e)',
  'linear-gradient(135deg, #c084fc, #9333ea)',
  '#0ea5e9',
  '#10b981',
  '#f43f5e',
  '#8b5cf6',
  '#f59e0b',
  '#06b6d4',
  '#ec4899',
  '#22c55e',
  '#6366f1',
  '#ef4444',
  '#84cc16',
  '#14b8a6',
  '#2563eb',
  '#059669',
  '#dc2626',
  '#7c3aed',
  '#d97706',
  '#0891b2',
  '#be185d',
  '#4b5563'
]);

mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    is_archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    description TEXT NOT NULL,
    background_color TEXT NOT NULL DEFAULT 'white',
    status TEXT NOT NULL DEFAULT 'open',
    assignee_id TEXT,
    assignee_name TEXT,
    assignee_icon TEXT,
    assignee_color TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
`);

ensureTaskColumn('assignee_id', 'TEXT');
ensureTaskColumn('background_color', "TEXT NOT NULL DEFAULT 'white'");
db.prepare(`
  UPDATE tasks
  SET
    status = 'open',
    assignee_id = NULL,
    assignee_name = NULL,
    assignee_icon = NULL,
    assignee_color = NULL,
    updated_at = datetime('now')
  WHERE status = 'canceled'
`).run();

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const peers = new Map();
const transfers = new Map();
const SEA_ASSET_KEYS = IS_SEA ? new Set(sea.getAssetKeys()) : new Set();

app.use(express.json({ limit: '32kb' }));
app.use(IS_SEA ? serveSeaStatic : express.static(path.join(__dirname, 'public')));

app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return badRequest(res, '请求 JSON 无效');
  }
  return next(err);
});

function now() {
  return new Date().toISOString();
}

function trimText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function toBooleanInt(value) {
  return value ? 1 : 0;
}

function badRequest(res, message) {
  return res.status(400).json({ error: message });
}

function notFound(res, message) {
  return res.status(404).json({ error: message });
}

function serveSeaStatic(req, res, next) {
  const assetKey = getSeaAssetKey(req.path);
  if (!assetKey) {
    return next();
  }

  try {
    res.setHeader('Content-Type', getContentType(assetKey));
    return res.send(Buffer.from(sea.getRawAsset(assetKey)));
  } catch (error) {
    return next(error);
  }
}

function getSeaAssetKey(requestPath) {
  const assetPath = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '');
  if (!assetPath || assetPath.includes('..') || assetPath.includes('\\') || path.isAbsolute(assetPath)) {
    return null;
  }

  const assetKey = `public/${assetPath}`;
  return SEA_ASSET_KEYS.has(assetKey) ? assetKey : null;
}

function getContentType(assetKey) {
  return MIME_TYPES.get(path.extname(assetKey).toLowerCase()) || 'application/octet-stream';
}

function getDownloadExePath() {
  const candidates = IS_SEA ? [process.execPath] : [path.join(__dirname, 'dist', EXE_FILE_NAME)];

  for (const filePath of candidates) {
    try {
      if (statSync(filePath).isFile()) {
        return filePath;
      }
    } catch {}
  }

  return null;
}

function ensureTaskColumn(column, definition) {
  const exists = db.prepare('PRAGMA table_info(tasks)').all().some((field) => field.name === column);
  if (!exists) {
    db.exec(`ALTER TABLE tasks ADD COLUMN ${column} ${definition}`);
  }
}

function readState() {
  const projects = db
    .prepare(`
      SELECT id, name, is_archived AS isArchived, created_at AS createdAt, updated_at AS updatedAt
      FROM projects
      ORDER BY is_archived ASC, updated_at DESC, id DESC
    `)
    .all()
    .map((project) => ({
      ...project,
      isArchived: Boolean(project.isArchived)
    }));

  const tasks = db
    .prepare(`
      SELECT
        id,
        project_id AS projectId,
        description,
        background_color AS backgroundColor,
        status,
        assignee_id AS assigneeId,
        assignee_name AS assigneeName,
        assignee_icon AS assigneeIcon,
        assignee_color AS assigneeColor,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM tasks
      ORDER BY updated_at DESC, id DESC
    `)
    .all();

  return { projects, tasks };
}

function broadcastState() {
  const message = JSON.stringify({ type: 'state:update', payload: readState() });
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

function getProject(id) {
  return db
    .prepare('SELECT id, name, is_archived AS isArchived FROM projects WHERE id = ?')
    .get(id);
}

function getTask(id) {
  return db
    .prepare('SELECT id, project_id AS projectId, status FROM tasks WHERE id = ?')
    .get(id);
}

function normalizeId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function normalizePort(value, fallback) {
  const port = Number(value || fallback);
  return Number.isInteger(port) && port >= 0 && port <= 65535 ? port : fallback;
}

function normalizeRetryLimit(value, fallback) {
  const retryLimit = Number(value || fallback);
  return Number.isInteger(retryLimit) && retryLimit >= 0 ? retryLimit : fallback;
}

function normalizeTaskBackground(value) {
  const color = trimText(value) || 'white';
  return TASK_BACKGROUNDS.has(color) ? color : null;
}

function normalizeAssignee(body, options = {}) {
  const id = trimText(body.assigneeId);
  const name = trimText(body.assigneeName);
  const icon = trimText(body.assigneeIcon);
  const color = trimText(body.assigneeColor);

  if ((options.requireId && !id) || id.length > 120 || !name || name.length > 120 || !icon || !AVATAR_COLORS.has(color)) {
    return null;
  }

  return { id, name, icon, color };
}

function createPeerId() {
  return crypto.randomUUID();
}

function createTransferId(value) {
  const id = trimText(value);
  return /^[a-zA-Z0-9._-]{8,120}$/.test(id) ? id : null;
}

function normalizePresenceIdentity(value) {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const id = trimText(value.id);
  const name = trimText(value.name);
  const icon = trimText(value.icon);
  const color = trimText(value.color);

  if (!id || id.length > 120 || !name || name.length > 120 || !icon || icon.length > 16 || !AVATAR_COLORS.has(color)) {
    return null;
  }

  return { id, name, icon, color };
}

function normalizeFileMetadata(value) {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const name = trimText(value.name).replace(/[\\/]/g, '_');
  const type = trimText(value.type);
  const size = Number(value.size);
  const lastModified = Number(value.lastModified);

  if (!name || name.length > 240 || !Number.isInteger(size) || size < 0) {
    return null;
  }

  return {
    name,
    size,
    type: type.slice(0, 120),
    lastModified: Number.isFinite(lastModified) && lastModified > 0 ? lastModified : null
  };
}

function peerPublicView(peer) {
  return {
    peerId: peer.peerId,
    identityId: peer.identity.id,
    name: peer.identity.name,
    icon: peer.identity.icon,
    color: peer.identity.color,
    connectedAt: peer.connectedAt
  };
}

function sendWs(socket, type, payload = {}) {
  if (socket.readyState !== WebSocket.OPEN) {
    return false;
  }

  socket.send(JSON.stringify({ type, payload }));
  return true;
}

function sendPeer(peer, type, payload = {}) {
  return sendWs(peer.socket, type, payload);
}

function sendTransferError(peer, transferId, message) {
  sendPeer(peer, 'transfer:error', { transferId, message });
}

function broadcastPresence() {
  const peerList = Array.from(peers.values()).map(peerPublicView);
  for (const peer of peers.values()) {
    sendPeer(peer, 'presence:list', { peers: peerList });
  }
}

function parseSocketMessage(peer, data) {
  const text = Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
  if (Buffer.byteLength(text, 'utf8') > MAX_SIGNAL_BYTES) {
    sendTransferError(peer, null, '信令消息过大');
    return null;
  }

  try {
    const message = JSON.parse(text);
    if (!message || typeof message !== 'object' || typeof message.type !== 'string') {
      return null;
    }
    return message;
  } catch {
    sendTransferError(peer, null, '信令消息解析失败');
    return null;
  }
}

function handleSocketMessage(peer, data) {
  const message = parseSocketMessage(peer, data);
  if (!message) {
    return;
  }

  const payload = message.payload && typeof message.payload === 'object' ? message.payload : {};

  if (message.type === 'presence:hello' || message.type === 'presence:update') {
    handlePresenceMessage(peer, payload);
    return;
  }

  if (message.type === 'transfer:request') {
    handleTransferRequest(peer, payload);
    return;
  }

  if (message.type === 'transfer:response') {
    handleTransferResponse(peer, payload);
    return;
  }

  if (message.type === 'transfer:cancel') {
    handleTransferCancel(peer, payload);
    return;
  }

  if (message.type === 'transfer:dismiss') {
    handleTransferDismiss(peer, payload);
    return;
  }

  if (message.type === 'rtc:offer' || message.type === 'rtc:answer' || message.type === 'rtc:ice') {
    handleRtcSignal(peer, message.type, payload);
  }
}

function handlePresenceMessage(peer, payload) {
  const identity = normalizePresenceIdentity(payload.identity);
  if (!identity) {
    sendTransferError(peer, null, '身份信息无效');
    return;
  }

  peer.identity = identity;
  peer.lastSeen = now();
  broadcastPresence();
}

function getTargetPeer(peer, payload) {
  const toPeerId = trimText(payload.toPeerId);
  if (!toPeerId) {
    sendTransferError(peer, payload.transferId || null, '目标用户无效');
    return null;
  }

  if (toPeerId === peer.peerId) {
    sendTransferError(peer, payload.transferId || null, '不能发送给自己');
    return null;
  }

  const targetPeer = peers.get(toPeerId);
  if (!targetPeer) {
    sendTransferError(peer, payload.transferId || null, '目标用户已离线');
    return null;
  }

  return targetPeer;
}

function handleTransferRequest(peer, payload) {
  const transferId = createTransferId(payload.transferId);
  if (!transferId) {
    sendTransferError(peer, null, '传输 ID 无效');
    return;
  }

  if (transfers.has(transferId)) {
    sendTransferError(peer, transferId, '传输 ID 已存在');
    return;
  }

  const targetPeer = getTargetPeer(peer, payload);
  const file = normalizeFileMetadata(payload.file);
  if (!targetPeer) {
    return;
  }
  if (!file) {
    sendTransferError(peer, transferId, '文件信息无效');
    return;
  }

  transfers.set(transferId, {
    transferId,
    fromPeerId: peer.peerId,
    toPeerId: targetPeer.peerId,
    file,
    createdAt: Date.now()
  });

  sendPeer(targetPeer, 'transfer:incoming', {
    transferId,
    fromPeerId: peer.peerId,
    fromIdentity: peer.identity,
    file
  });
}

function handleTransferResponse(peer, payload) {
  const transferId = createTransferId(payload.transferId);
  const transfer = transferId ? transfers.get(transferId) : null;
  if (!transfer || transfer.toPeerId !== peer.peerId) {
    sendTransferError(peer, transferId, '传输请求不存在');
    return;
  }

  const sender = peers.get(transfer.fromPeerId);
  if (!sender) {
    transfers.delete(transferId);
    sendTransferError(peer, transferId, '发送方已离线');
    return;
  }

  const accepted = Boolean(payload.accepted);
  sendPeer(sender, 'transfer:response', {
    transferId,
    fromPeerId: peer.peerId,
    accepted
  });

  if (!accepted) {
    transfers.delete(transferId);
  }
}

function handleRtcSignal(peer, type, payload) {
  const transferId = createTransferId(payload.transferId);
  const transfer = transferId ? transfers.get(transferId) : null;
  if (!transfer || (transfer.fromPeerId !== peer.peerId && transfer.toPeerId !== peer.peerId)) {
    sendTransferError(peer, transferId, '传输会话不存在');
    return;
  }

  const expectedTargetId = transfer.fromPeerId === peer.peerId ? transfer.toPeerId : transfer.fromPeerId;
  if (trimText(payload.toPeerId) !== expectedTargetId) {
    sendTransferError(peer, transferId, '信令目标无效');
    return;
  }

  const targetPeer = peers.get(expectedTargetId);
  if (!targetPeer) {
    transfers.delete(transferId);
    sendTransferError(peer, transferId, '目标用户已离线');
    return;
  }

  const forwarded = { transferId, fromPeerId: peer.peerId };
  if (Object.prototype.hasOwnProperty.call(payload, 'description')) {
    forwarded.description = payload.description;
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'candidate')) {
    forwarded.candidate = payload.candidate;
  }
  sendPeer(targetPeer, type, forwarded);
}

function handleTransferCancel(peer, payload) {
  const transferId = createTransferId(payload.transferId);
  const transfer = transferId ? transfers.get(transferId) : null;
  if (!transfer || (transfer.fromPeerId !== peer.peerId && transfer.toPeerId !== peer.peerId)) {
    return;
  }

  const targetPeerId = transfer.fromPeerId === peer.peerId ? transfer.toPeerId : transfer.fromPeerId;
  const targetPeer = peers.get(targetPeerId);
  if (targetPeer) {
    sendPeer(targetPeer, 'transfer:cancel', {
      transferId,
      fromPeerId: peer.peerId,
      reason: trimText(payload.reason) || '对方已取消'
    });
  }
  transfers.delete(transferId);
}

function handleTransferDismiss(peer, payload) {
  const transferId = createTransferId(payload.transferId);
  const transfer = transferId ? transfers.get(transferId) : null;
  if (!transfer || (transfer.fromPeerId !== peer.peerId && transfer.toPeerId !== peer.peerId)) {
    return;
  }

  const targetPeerId = transfer.fromPeerId === peer.peerId ? transfer.toPeerId : transfer.fromPeerId;
  const targetPeer = peers.get(targetPeerId);
  if (targetPeer) {
    sendPeer(targetPeer, 'transfer:dismiss', {
      transferId,
      fromPeerId: peer.peerId
    });
  }
  transfers.delete(transferId);
}

function cleanupPeer(peer) {
  if (!peers.delete(peer.peerId)) {
    return;
  }

  for (const [transferId, transfer] of transfers.entries()) {
    if (transfer.fromPeerId !== peer.peerId && transfer.toPeerId !== peer.peerId) {
      continue;
    }

    const targetPeerId = transfer.fromPeerId === peer.peerId ? transfer.toPeerId : transfer.fromPeerId;
    const targetPeer = peers.get(targetPeerId);
    if (targetPeer) {
      sendPeer(targetPeer, 'transfer:cancel', {
        transferId,
        fromPeerId: peer.peerId,
        reason: '用户已离线'
      });
    }
    transfers.delete(transferId);
  }

  broadcastPresence();
}

function cleanupExpiredTransfers() {
  const cutoff = Date.now() - TRANSFER_TTL_MS;
  for (const [transferId, transfer] of transfers.entries()) {
    if (transfer.createdAt >= cutoff) {
      continue;
    }

    const sender = peers.get(transfer.fromPeerId);
    const receiver = peers.get(transfer.toPeerId);
    if (sender) {
      sendTransferError(sender, transferId, '传输请求已超时');
    }
    if (receiver) {
      sendTransferError(receiver, transferId, '传输请求已超时');
    }
    transfers.delete(transferId);
  }
}

app.get('/api/state', (req, res) => {
  res.json(readState());
});

app.get('/api/addresses', (req, res) => {
  const port = server.address()?.port || PORT;
  const exePath = getDownloadExePath();
  const addresses = [
    { label: '本机', url: `http://localhost:${port}` },
    ...getLanAddresses().map((address) => ({
      label: '局域网',
      url: `http://${address}:${port}`
    }))
  ];
  res.json({
    addresses,
    download: {
      available: Boolean(exePath),
      fileName: EXE_FILE_NAME,
      label: `下载 ${EXE_FILE_NAME}`,
      url: EXE_DOWNLOAD_URL
    }
  });
});

app.get(EXE_DOWNLOAD_URL, (req, res, next) => {
  const exePath = getDownloadExePath();

  if (!exePath) {
    return notFound(res, `当前没有可下载的 ${EXE_FILE_NAME}，请先重新打包`);
  }

  return res.download(exePath, EXE_FILE_NAME, (error) => {
    if (error && !res.headersSent) {
      return next(error);
    }
    return undefined;
  });
});

app.get('/api/client-info', (req, res) => {
  const remoteAddress = normalizeRemoteAddress(req.socket.remoteAddress);
  const preferredAddress = remoteAddress?.startsWith('192.168.')
    ? remoteAddress
    : getLanAddresses().find((address) => address.startsWith('192.168.'));

  res.json({
    ip: preferredAddress || '',
    defaultName: preferredAddress || '匿名用户'
  });
});

app.post('/api/projects', (req, res) => {
  const name = trimText(req.body.name);
  if (!name) {
    return badRequest(res, '项目名不能为空');
  }

  const createdAt = now();
  const result = db
    .prepare('INSERT INTO projects (name, created_at, updated_at) VALUES (?, ?, ?)')
    .run(name, createdAt, createdAt);

  broadcastState();
  return res.status(201).json({ id: result.lastInsertRowid });
});

app.patch('/api/projects/:id', (req, res) => {
  const id = normalizeId(req.params.id);
  if (!id) {
    return badRequest(res, '项目 ID 无效');
  }

  const project = getProject(id);
  if (!project) {
    return notFound(res, '项目不存在');
  }

  const updates = [];
  const params = [];

  if (Object.prototype.hasOwnProperty.call(req.body, 'name')) {
    const name = trimText(req.body.name);
    if (!name) {
      return badRequest(res, '项目名不能为空');
    }
    updates.push('name = ?');
    params.push(name);
  }

  if (Object.prototype.hasOwnProperty.call(req.body, 'isArchived')) {
    updates.push('is_archived = ?');
    params.push(toBooleanInt(req.body.isArchived));
  }

  if (!updates.length) {
    return badRequest(res, '没有可更新的项目字段');
  }

  updates.push('updated_at = ?');
  params.push(now(), id);
  db.prepare(`UPDATE projects SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  broadcastState();
  return res.json({ ok: true });
});

app.delete('/api/projects/:id', (req, res) => {
  const id = normalizeId(req.params.id);
  if (!id) {
    return badRequest(res, '项目 ID 无效');
  }

  const project = getProject(id);
  if (!project) {
    return notFound(res, '项目不存在');
  }

  if (!project.isArchived) {
    return badRequest(res, '项目必须先归档才能永久删除');
  }

  db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  broadcastState();
  return res.json({ ok: true });
});

app.post('/api/tasks', (req, res) => {
  const projectId = normalizeId(req.body.projectId);
  const description = trimText(req.body.description);
  const backgroundColor = normalizeTaskBackground(req.body.backgroundColor);

  if (!projectId) {
    return badRequest(res, '项目 ID 无效');
  }
  if (!description) {
    return badRequest(res, '任务描述不能为空');
  }
  if (description.length > 2000) {
    return badRequest(res, '任务描述不能超过 2000 个字符');
  }
  if (!backgroundColor) {
    return badRequest(res, '任务底色无效');
  }
  if (!getProject(projectId)) {
    return notFound(res, '项目不存在');
  }

  const project = getProject(projectId);
  if (project.isArchived) {
    return badRequest(res, '归档项目不能新建任务');
  }

  const createdAt = now();
  const result = db
    .prepare(`
      INSERT INTO tasks (project_id, description, background_color, status, created_at, updated_at)
      VALUES (?, ?, ?, 'open', ?, ?)
    `)
    .run(projectId, description, backgroundColor, createdAt, createdAt);

  broadcastState();
  return res.status(201).json({ id: result.lastInsertRowid });
});

app.patch('/api/identity-tasks', (req, res) => {
  const assignee = normalizeAssignee(req.body, { requireId: true });
  if (!assignee) {
    return badRequest(res, '身份信息无效');
  }

  const previousName = trimText(req.body.previousAssigneeName);
  const previousIcon = trimText(req.body.previousAssigneeIcon);
  const previousColor = trimText(req.body.previousAssigneeColor);

  db.prepare(`
    UPDATE tasks
    SET
      assignee_name = ?,
      assignee_icon = ?,
      assignee_color = ?
    WHERE status IN ('claimed', 'done') AND assignee_id = ?
  `).run(assignee.name, assignee.icon, assignee.color, assignee.id);

  if (previousName && previousIcon && previousColor) {
    db.prepare(`
      UPDATE tasks
      SET
        assignee_id = ?,
        assignee_name = ?,
        assignee_icon = ?,
        assignee_color = ?
      WHERE
        status IN ('claimed', 'done')
        AND assignee_id IS NULL
        AND assignee_name = ?
        AND assignee_icon = ?
        AND assignee_color = ?
    `).run(
      assignee.id,
      assignee.name,
      assignee.icon,
      assignee.color,
      previousName,
      previousIcon,
      previousColor
    );
  }

  broadcastState();
  return res.json({ ok: true });
});

app.patch('/api/tasks/:id', (req, res) => {
  const id = normalizeId(req.params.id);
  if (!id) {
    return badRequest(res, '任务 ID 无效');
  }

  const task = getTask(id);
  if (!task) {
    return notFound(res, '任务不存在');
  }

  const project = getProject(task.projectId);
  if (project && project.isArchived) {
    return badRequest(res, '归档项目中的任务不能修改');
  }

  const updates = [];
  const params = [];

  if (Object.prototype.hasOwnProperty.call(req.body, 'description')) {
    const description = trimText(req.body.description);
    if (!description) {
      return badRequest(res, '任务描述不能为空');
    }
    if (description.length > 2000) {
      return badRequest(res, '任务描述不能超过 2000 个字符');
    }
    updates.push('description = ?');
    params.push(description);
  }

  if (Object.prototype.hasOwnProperty.call(req.body, 'backgroundColor')) {
    const backgroundColor = normalizeTaskBackground(req.body.backgroundColor);
    if (!backgroundColor) {
      return badRequest(res, '任务底色无效');
    }
    updates.push('background_color = ?');
    params.push(backgroundColor);
  }

  if (Object.prototype.hasOwnProperty.call(req.body, 'status')) {
    const status = trimText(req.body.status);
    if (!TASK_STATUSES.has(status)) {
      return badRequest(res, '任务状态无效');
    }

    if (status === 'done' && task.status !== 'claimed') {
      return badRequest(res, '任务必须先接取再完成');
    }

    updates.push('status = ?');
    params.push(status);

    if (status === 'open') {
      updates.push('assignee_id = NULL', 'assignee_name = NULL', 'assignee_icon = NULL', 'assignee_color = NULL');
    } else if (status === 'claimed') {
      const assignee = normalizeAssignee(req.body, { requireId: true });
      if (!assignee) {
        return badRequest(res, '接取人信息无效');
      }
      updates.push('assignee_id = ?', 'assignee_name = ?', 'assignee_icon = ?', 'assignee_color = ?');
      params.push(assignee.id, assignee.name, assignee.icon, assignee.color);
    }
  }

  if (!updates.length) {
    return badRequest(res, '没有可更新的任务字段');
  }

  updates.push('updated_at = ?');
  params.push(now(), id);
  db.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  broadcastState();
  return res.json({ ok: true });
});

app.delete('/api/tasks/:id', (req, res) => {
  const id = normalizeId(req.params.id);
  if (!id) {
    return badRequest(res, '任务 ID 无效');
  }

  const task = getTask(id);
  if (!task) {
    return notFound(res, '任务不存在');
  }

  const project = getProject(task.projectId);
  if (project && project.isArchived) {
    return badRequest(res, '归档项目中的任务不能删除');
  }

  if (task.status !== 'done') {
    return badRequest(res, '只有已完成任务才能删除');
  }

  db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
  broadcastState();
  return res.json({ ok: true });
});

wss.on('connection', (socket) => {
  const peer = {
    peerId: createPeerId(),
    socket,
    identity: {
      id: createPeerId(),
      name: '匿名用户',
      icon: '◆',
      color: '#4b5563'
    },
    connectedAt: now(),
    lastSeen: now()
  };

  peers.set(peer.peerId, peer);
  sendPeer(peer, 'presence:welcome', { peerId: peer.peerId });
  sendPeer(peer, 'state:update', readState());
  broadcastPresence();

  socket.on('message', (data) => handleSocketMessage(peer, data));
  socket.on('error', () => cleanupPeer(peer));
  socket.on('close', () => cleanupPeer(peer));
});

setInterval(cleanupExpiredTransfers, 60 * 1000).unref();

listenWithPortFallback(PORT);

function listenWithPortFallback(port, attempt = 0) {
  const onError = (error) => {
    if (error.code === 'EADDRINUSE' && attempt < MAX_PORT_ATTEMPTS) {
      const nextPort = getNextPort(port);
      console.warn(`Port ${port} is in use, trying ${nextPort}...`);
      listenWithPortFallback(nextPort, attempt + 1);
      return;
    }

    console.error(error);
    process.exit(1);
  };

  server.once('error', onError);
  server.listen(port, HOST, () => {
    server.off('error', onError);
    printAddresses();
  });
}

function printAddresses() {
  const port = server.address()?.port || PORT;
  const addresses = getLanAddresses();
  console.log(`TaskBoard running at http://localhost:${port}`);
  for (const address of addresses) {
    console.log(`LAN: http://${address}:${port}`);
  }
}

function getNextPort(port) {
  return port >= 65535 ? 0 : port + 1;
}

function normalizeRemoteAddress(value) {
  const address = trimText(value).replace(/^::ffff:/, '');
  if (!address || address === '::1' || address === '127.0.0.1') {
    return null;
  }
  return address;
}

function getLanAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];

  for (const entries of Object.values(interfaces)) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal) {
        addresses.push(entry.address);
      }
    }
  }

  return addresses;
}
