'use strict';

const express = require('express');
const http = require('http');
const os = require('os');
const path = require('path');
const { mkdirSync } = require('fs');
const { DatabaseSync } = require('node:sqlite');
const { WebSocket, WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'taskboard.db');
const TASK_STATUSES = new Set(['open', 'claimed', 'done']);
const TASK_BACKGROUNDS = new Set(['white', 'red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple']);
const AVATAR_COLORS = new Set([
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

app.use(express.json({ limit: '32kb' }));
app.use(express.static(path.join(__dirname, 'public')));

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

function normalizeTaskBackground(value) {
  const color = trimText(value) || 'white';
  return TASK_BACKGROUNDS.has(color) ? color : null;
}

function normalizeAssignee(body, options = {}) {
  const id = trimText(body.assigneeId);
  const name = trimText(body.assigneeName);
  const icon = trimText(body.assigneeIcon);
  const color = trimText(body.assigneeColor);

  if ((options.requireId && !id) || id.length > 120 || !name || !icon || !AVATAR_COLORS.has(color)) {
    return null;
  }

  return { id, name, icon, color };
}

app.get('/api/state', (req, res) => {
  res.json(readState());
});

app.get('/api/addresses', (req, res) => {
  const port = server.address()?.port || PORT;
  const addresses = [
    { label: '本机', url: `http://localhost:${port}` },
    ...getLanAddresses().map((address) => ({
      label: '局域网',
      url: `http://${address}:${port}`
    }))
  ];
  res.json({ addresses });
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
  socket.send(JSON.stringify({ type: 'state:update', payload: readState() }));
});

server.listen(PORT, HOST, () => {
  const addresses = getLanAddresses();
  console.log(`TaskBoard running at http://localhost:${PORT}`);
  for (const address of addresses) {
    console.log(`LAN: http://${address}:${PORT}`);
  }
});

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
