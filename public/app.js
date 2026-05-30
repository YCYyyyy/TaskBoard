'use strict';

const AVATAR_ICONS = ['😀', '😎', '🚀', '🌟', '🔥', '🌈', '☕', '🎯', '💡', '🍀', '🧩', '🎨', '⚡', '🌙', '🍉', '🛠️'];
const DEFAULT_IDENTITY_NAME = '匿名用户';
const AVATAR_COLORS = [
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
  'linear-gradient(135deg, #fddb92 0%, #d1fdff 100%)'
];
const TASK_BACKGROUNDS = [
  { value: 'white', label: '白', color: '#ffffff' },
  { value: 'red', label: '红', color: '#fee2e2' },
  { value: 'orange', label: '橙', color: '#ffedd5' },
  { value: 'yellow', label: '黄', color: '#fef9c3' },
  { value: 'green', label: '绿', color: '#dcfce7' },
  { value: 'cyan', label: '青', color: '#cffafe' },
  { value: 'blue', label: '蓝', color: '#dbeafe' },
  { value: 'purple', label: '紫', color: '#ede9fe' }
];
const FILE_CHUNK_SIZE = 64 * 1024;
const DATA_CHANNEL_BUFFER_LIMIT = 1024 * 1024;
const TASK_NOTIFICATION_SUPPRESS_MS = 6000;
const TRANSFER_STATUSES = {
  'incoming-request': '等待确认',
  waiting: '等待接收',
  connecting: '连接中',
  transferring: '传输中',
  finishing: '确认中',
  complete: '已完成',
  rejected: '已拒绝',
  canceled: '已取消',
  failed: '失败'
};

const state = {
  projects: [],
  tasks: [],
  selectedProjectId: null,
  editingTaskId: null,
  taskBackgroundColor: 'white',
  identitySyncTimer: null,
  pendingIdentitySyncPrevious: null,
  socket: null,
  peerId: null,
  peers: [],
  transferTargetPeerId: null,
  pendingIncomingTransferId: null,
  transfers: new Map(),
  hasLoadedState: false,
  suppressedTaskNotifications: new Map(),
  identity: loadIdentity()
};

const els = {
  openProjectCreateButton: document.querySelector('#openProjectCreateButton'),
  addressButton: document.querySelector('#addressButton'),
  addressList: document.querySelector('#addressList'),
  onlinePeers: document.querySelector('#onlinePeers'),
  peerCount: document.querySelector('#peerCount'),
  fileInput: document.querySelector('#fileInput'),
  transferPanel: document.querySelector('#transferPanel'),
  transferList: document.querySelector('#transferList'),
  notificationStack: document.querySelector('#notificationStack'),
  incomingTransferModal: document.querySelector('#incomingTransferModal'),
  incomingTransferFrom: document.querySelector('#incomingTransferFrom'),
  incomingTransferFileName: document.querySelector('#incomingTransferFileName'),
  incomingTransferFileSize: document.querySelector('#incomingTransferFileSize'),
  acceptTransferButton: document.querySelector('#acceptTransferButton'),
  rejectTransferButton: document.querySelector('#rejectTransferButton'),
  projectForm: document.querySelector('#projectForm'),
  projectNameInput: document.querySelector('#projectNameInput'),
  activeProjects: document.querySelector('#activeProjects'),
  archivedProjects: document.querySelector('#archivedProjects'),
  archiveCount: document.querySelector('#archiveCount'),
  selectedProjectName: document.querySelector('#selectedProjectName'),
  openTaskCreateButton: document.querySelector('#openTaskCreateButton'),
  renameProjectForm: document.querySelector('#renameProjectForm'),
  renameProjectInput: document.querySelector('#renameProjectInput'),
  taskForm: document.querySelector('#taskForm'),
  taskDescriptionInput: document.querySelector('#taskDescriptionInput'),
  taskBackgroundColors: document.querySelector('#taskBackgroundColors'),
  taskModalTitle: document.querySelector('#taskModalTitle'),
  taskSubmitButton: document.querySelector('#taskSubmitButton'),
  boardView: document.querySelector('#boardView'),
  openTasks: document.querySelector('#openTasks'),
  claimedTasks: document.querySelector('#claimedTasks'),
  doneTasks: document.querySelector('#doneTasks'),
  openCount: document.querySelector('#openCount'),
  claimedCount: document.querySelector('#claimedCount'),
  doneCount: document.querySelector('#doneCount'),
  emptyState: document.querySelector('#emptyState'),
  identityButton: document.querySelector('#identityButton'),
  identityDisplayName: document.querySelector('#identityDisplayName'),
  identityName: document.querySelector('#identityName'),
  identityIcons: document.querySelector('#identityIcons'),
  identityColors: document.querySelector('#identityColors'),
  avatarPreview: document.querySelector('#avatarPreview'),
  avatarPreviewIcon: document.querySelector('#avatarPreviewIcon'),
  addressModal: document.querySelector('#addressModal'),
  identityModal: document.querySelector('#identityModal'),
  projectCreateModal: document.querySelector('#projectCreateModal'),
  projectRenameModal: document.querySelector('#projectRenameModal'),
  taskModal: document.querySelector('#taskModal'),
  toast: document.querySelector('#toast')
};

init();

function init() {
  state.identity = normalizeIdentity(state.identity);
  localStorage.setItem('taskboard.identity', JSON.stringify(state.identity));
  setupIdentity();
  setupEvents();
  renderPeers();
  renderTransfers();
  fetchAddresses();
  fetchClientInfo();
  fetchState();
  connectSocket();
}

function setupEvents() {
  els.openProjectCreateButton.addEventListener('click', () => {
    els.projectNameInput.value = '';
    openModal(els.projectCreateModal, els.projectNameInput);
  });

  els.fileInput.addEventListener('change', handleFileSelected);
  els.acceptTransferButton.addEventListener('click', acceptIncomingTransfer);
  els.rejectTransferButton.addEventListener('click', () => rejectIncomingTransfer('已拒绝'));

  els.addressButton.addEventListener('click', () => {
    openModal(els.addressModal);
  });

  els.projectForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = els.projectNameInput.value.trim();
    if (!name) {
      return showToast('项目名不能为空');
    }

    await request('/api/projects', { method: 'POST', body: { name } });
    closeModal(els.projectCreateModal);
  });

  els.renameProjectForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const project = selectedProject();
    const name = els.renameProjectInput.value.trim();
    if (!project || !name) {
      return showToast('项目名不能为空');
    }

    await request(`/api/projects/${project.id}`, { method: 'PATCH', body: { name } });
    closeModal(els.projectRenameModal);
  });

  els.openTaskCreateButton.addEventListener('click', () => {
    const project = selectedProject();
    if (!project || project.isArchived) {
      return showToast('请选择未归档项目');
    }
    state.editingTaskId = null;
    state.taskBackgroundColor = 'white';
    els.taskModalTitle.textContent = '新建任务';
    els.taskSubmitButton.textContent = '新建';
    els.taskDescriptionInput.value = '';
    renderTaskBackgroundOptions();
    openModal(els.taskModal, els.taskDescriptionInput);
  });

  els.taskForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const project = selectedProject();
    const description = els.taskDescriptionInput.value.trim();
    if (!project) {
      return showToast('请先选择项目');
    }
    if (!description) {
      return showToast('任务描述不能为空');
    }

    if (state.editingTaskId) {
      const editingTask = state.tasks.find((task) => task.id === state.editingTaskId);
      if (isOwnActiveTask(editingTask)) {
        suppressTaskNotification(state.editingTaskId);
      }
      await request(`/api/tasks/${state.editingTaskId}`, {
        method: 'PATCH',
        body: { description, backgroundColor: state.taskBackgroundColor }
      });
    } else {
      await request('/api/tasks', {
        method: 'POST',
        body: { projectId: project.id, description, backgroundColor: state.taskBackgroundColor }
      });
    }

    closeModal(els.taskModal);
  });

  els.identityButton.addEventListener('click', () => {
    els.identityName.value = state.identity.name;
    openModal(els.identityModal, els.identityName);
  });

  els.identityName.addEventListener('input', () => updateIdentity({ name: els.identityName.value }));
  document.querySelectorAll('[data-close-modal]').forEach((button) => {
    button.addEventListener('click', () => closeModal(button.closest('.modal')));
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.menu-wrap')) {
      closeMenus();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeMenus();
      if (!els.incomingTransferModal.classList.contains('hidden')) {
        rejectIncomingTransfer('已拒绝');
        return;
      }
      document.querySelectorAll('.modal:not(.hidden)').forEach(closeModal);
    }
  });

  document.addEventListener('click', requestBrowserNotificationPermission, { once: true });
}

function setupIdentity() {
  els.identityName.value = state.identity.name;

  for (const icon of AVATAR_ICONS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'emoji-option';
    button.textContent = icon;
    button.dataset.icon = icon;
    button.title = icon;
    button.addEventListener('click', () => updateIdentity({ icon }));
    els.identityIcons.append(button);
  }

  for (const color of AVATAR_COLORS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'color-swatch';
    button.style.background = color;
    button.title = color;
    button.dataset.color = color;
    button.addEventListener('click', () => updateIdentity({ color }));
    els.identityColors.append(button);
  }

  setupTaskBackgroundOptions();
  renderIdentity();
}

function setupTaskBackgroundOptions() {
  for (const background of TASK_BACKGROUNDS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'task-color-option';
    button.style.background = background.color;
    button.dataset.color = background.value;
    button.innerHTML = '<span></span>';
    button.querySelector('span').textContent = background.label;
    button.addEventListener('click', () => {
      state.taskBackgroundColor = background.value;
      renderTaskBackgroundOptions();
    });
    els.taskBackgroundColors.append(button);
  }
}

function renderTaskBackgroundOptions() {
  els.taskBackgroundColors.querySelectorAll('.task-color-option').forEach((button) => {
    button.classList.toggle('selected', button.dataset.color === state.taskBackgroundColor);
  });
}

function loadIdentity() {
  const fallback = {
    id: createIdentityId(),
    name: DEFAULT_IDENTITY_NAME,
    icon: AVATAR_ICONS[0],
    color: AVATAR_COLORS[0]
  };

  try {
    const saved = JSON.parse(localStorage.getItem('taskboard.identity') || '{}');
    return {
      id: typeof saved.id === 'string' && saved.id.trim() ? saved.id.trim() : fallback.id,
      name: typeof saved.name === 'string' && saved.name.trim() ? saved.name.trim() : fallback.name,
      icon: AVATAR_ICONS.includes(saved.icon) ? saved.icon : fallback.icon,
      color: AVATAR_COLORS.includes(saved.color) ? saved.color : fallback.color
    };
  } catch {
    return fallback;
  }
}

function updateIdentity(patch) {
  const previousIdentity = { ...state.identity };
  state.identity = {
    ...state.identity,
    ...patch,
    name: typeof patch.name === 'string' ? patch.name.trim() : state.identity.name
  };
  if (!state.identity.name) {
    state.identity.name = DEFAULT_IDENTITY_NAME;
  }
  localStorage.setItem('taskboard.identity', JSON.stringify(state.identity));
  renderIdentity();
  sendPresenceUpdate();
  scheduleIdentityTaskSync(previousIdentity);
}

function createIdentityId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `identity-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function scheduleIdentityTaskSync(previousIdentity) {
  if (!state.pendingIdentitySyncPrevious) {
    state.pendingIdentitySyncPrevious = previousIdentity;
  }
  window.clearTimeout(state.identitySyncTimer);
  state.identitySyncTimer = window.setTimeout(() => {
    const syncPrevious = state.pendingIdentitySyncPrevious;
    state.pendingIdentitySyncPrevious = null;
    syncIdentityTasks(syncPrevious);
  }, 250);
}

function renderIdentity() {
  els.identityDisplayName.textContent = state.identity.name;
  els.avatarPreview.style.background = state.identity.color;
  els.avatarPreviewIcon.textContent = state.identity.icon;

  els.identityIcons.querySelectorAll('.emoji-option').forEach((button) => {
    button.classList.toggle('selected', button.dataset.icon === state.identity.icon);
  });

  els.identityColors.querySelectorAll('.color-swatch').forEach((button) => {
    button.classList.toggle('selected', button.dataset.color === state.identity.color);
  });
}

async function fetchState() {
  try {
    const data = await request('/api/state');
    applyState(data);
  } catch (error) {
    showToast(error.message);
  }
}

async function fetchAddresses() {
  try {
    const data = await request('/api/addresses');
    renderAddresses(Array.isArray(data.addresses) ? data.addresses : []);
  } catch {
    renderAddresses([]);
  }
}

async function fetchClientInfo() {
  try {
    const data = await request('/api/client-info');
    const defaultName = typeof data.defaultName === 'string' ? data.defaultName.trim() : '';
    if (defaultName && shouldUseDefaultIdentityName(state.identity.name)) {
      updateIdentity({ name: defaultName });
    }
  } catch {}
}

function renderAddresses(addresses) {
  els.addressList.replaceChildren();

  if (!addresses.length) {
    const empty = document.createElement('span');
    empty.textContent = '暂无地址';
    els.addressList.append(empty);
    return;
  }

  for (const address of addresses) {
    const button = document.createElement('button');
    button.type = 'button';
    button.innerHTML = '<strong></strong>';
    button.querySelector('strong').textContent = address.url.replace(/^https?:\/\//, '');
    button.addEventListener('click', () => copyAddress(address.url));
    els.addressList.append(button);
  }
}

function shouldUseDefaultIdentityName(name) {
  const value = typeof name === 'string' ? name.trim() : '';
  return value === DEFAULT_IDENTITY_NAME || /^192\.168\.\d{1,3}\.\d{1,3}$/.test(value);
}

async function copyAddress(url) {
  try {
    await copyText(url);
    showToast('访问地址已复制');
  } catch {
    showToast('复制失败');
  }
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const input = document.createElement('textarea');
  input.value = text;
  input.setAttribute('readonly', '');
  input.style.position = 'fixed';
  input.style.left = '-9999px';
  document.body.append(input);
  input.select();
  const copied = document.execCommand('copy');
  input.remove();
  if (!copied) {
    throw new Error('copy failed');
  }
}

function connectSocket() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(`${protocol}//${location.host}`);
  state.socket = socket;

  socket.addEventListener('open', () => {
    sendSocket('presence:hello', { identity: normalizeIdentity(state.identity) });
  });

  socket.addEventListener('message', (event) => {
    try {
      const message = JSON.parse(event.data);
      handleSocketMessage(message);
    } catch {
      showToast('同步消息解析失败');
    }
  });

  socket.addEventListener('close', () => {
    if (state.socket === socket) {
      state.socket = null;
      state.peerId = null;
      applyPresenceList([]);
      failActiveTransfers('连接已断开');
    }
    setTimeout(connectSocket, 1500);
  });
}

function handleSocketMessage(message) {
  if (!message || typeof message.type !== 'string') {
    return;
  }

  const payload = message.payload || {};

  if (message.type === 'state:update') {
    applyState(payload);
    return;
  }

  if (message.type === 'presence:welcome') {
    state.peerId = typeof payload.peerId === 'string' ? payload.peerId : null;
    renderPeers();
    return;
  }

  if (message.type === 'presence:list') {
    applyPresenceList(Array.isArray(payload.peers) ? payload.peers : []);
    return;
  }

  if (message.type === 'transfer:incoming') {
    handleIncomingTransfer(payload);
    return;
  }

  if (message.type === 'transfer:response') {
    handleTransferResponse(payload);
    return;
  }

  if (message.type === 'rtc:offer') {
    handleRtcOffer(payload);
    return;
  }

  if (message.type === 'rtc:answer') {
    handleRtcAnswer(payload);
    return;
  }

  if (message.type === 'rtc:ice') {
    handleRtcIce(payload);
    return;
  }

  if (message.type === 'transfer:cancel') {
    handleRemoteCancel(payload);
    return;
  }

  if (message.type === 'transfer:dismiss') {
    removeTransfer(payload.transferId);
    return;
  }

  if (message.type === 'transfer:error') {
    handleTransferError(payload);
  }
}

function sendSocket(type, payload = {}) {
  if (!state.socket || state.socket.readyState !== WebSocket.OPEN) {
    showToast('连接未就绪');
    return false;
  }

  state.socket.send(JSON.stringify({ type, payload }));
  return true;
}

function sendPresenceUpdate() {
  if (!state.socket || state.socket.readyState !== WebSocket.OPEN) {
    return;
  }

  sendSocket('presence:update', { identity: normalizeIdentity(state.identity) });
}

function applyState(nextState) {
  const projects = Array.isArray(nextState.projects) ? nextState.projects : [];
  const tasks = Array.isArray(nextState.tasks) ? nextState.tasks : [];

  if (state.hasLoadedState) {
    notifyTaskChanges(state.tasks, tasks);
  }

  state.projects = projects;
  state.tasks = tasks;
  state.hasLoadedState = true;

  if (!state.selectedProjectId || !state.projects.some((project) => project.id === state.selectedProjectId)) {
    const firstActive = state.projects.find((project) => !project.isArchived);
    const firstProject = firstActive || state.projects[0];
    state.selectedProjectId = firstProject ? firstProject.id : null;
  }

  render();
}

function notifyTaskChanges(previousTasks, nextTasks) {
  const previousById = new Map(previousTasks.map((task) => [task.id, task]));

  for (const nextTask of nextTasks) {
    const previousTask = previousById.get(nextTask.id);
    if (!isOwnActiveTask(previousTask)) {
      continue;
    }

    if (isTaskNotificationSuppressed(nextTask.id)) {
      continue;
    }

    if (nextTask.status === 'open' && previousTask.status !== 'open') {
      notifyUser('任务被回退', `任务“${shortTaskText(previousTask.description)}”已回到待接取`);
      continue;
    }

    if (isOwnActiveTask(nextTask) && hasTaskContentChanged(previousTask, nextTask)) {
      notifyUser('任务被修改', `任务“${shortTaskText(nextTask.description)}”已被修改`);
    }
  }
}

function hasTaskContentChanged(previousTask, nextTask) {
  return previousTask.description !== nextTask.description || previousTask.backgroundColor !== nextTask.backgroundColor;
}

function isOwnActiveTask(task) {
  return Boolean(
    task
      && task.assigneeId === state.identity.id
      && (task.status === 'claimed' || task.status === 'done')
  );
}

function suppressTaskNotification(taskId) {
  state.suppressedTaskNotifications.set(taskId, Date.now() + TASK_NOTIFICATION_SUPPRESS_MS);
}

function isTaskNotificationSuppressed(taskId) {
  const expiresAt = state.suppressedTaskNotifications.get(taskId);
  if (!expiresAt) {
    return false;
  }

  state.suppressedTaskNotifications.delete(taskId);
  return expiresAt >= Date.now();
}

function shortTaskText(text) {
  const value = typeof text === 'string' && text.trim() ? text.trim() : '未命名任务';
  return value.length > 36 ? `${value.slice(0, 36)}...` : value;
}

function applyPresenceList(peers) {
  state.peers = peers
    .filter((peer) => peer && peer.peerId && peer.peerId !== state.peerId)
    .map((peer) => ({
      peerId: String(peer.peerId),
      identityId: String(peer.identityId || ''),
      name: typeof peer.name === 'string' && peer.name.trim() ? peer.name.trim() : DEFAULT_IDENTITY_NAME,
      icon: typeof peer.icon === 'string' && peer.icon.trim() ? peer.icon.trim() : '◆',
      color: typeof peer.color === 'string' && peer.color.trim() ? peer.color.trim() : 'linear-gradient(135deg, #94a3b8, #475569)',
      connectedAt: peer.connectedAt
    }));
  renderPeers();
}

function renderPeers() {
  els.peerCount.textContent = String(state.peers.length);
  els.onlinePeers.replaceChildren();

  if (!state.peers.length) {
    const empty = document.createElement('div');
    empty.className = 'peer-empty';
    empty.textContent = state.socket ? '暂无其他在线用户' : '正在连接';
    els.onlinePeers.append(empty);
    return;
  }

  for (const peer of state.peers) {
    const item = document.createElement('div');
    item.className = 'peer-item';
    item.innerHTML = `
      <span class="peer-avatar"></span>
      <span class="peer-name"></span>
      <button class="peer-send-button" type="button" title="发送文件" aria-label="发送文件">↗</button>
    `;
    item.querySelector('.peer-avatar').style.background = peer.color;
    item.querySelector('.peer-avatar').textContent = peer.icon;
    item.querySelector('.peer-name').textContent = peer.name;

    const sendButton = item.querySelector('.peer-send-button');
    sendButton.disabled = !canTransferFiles();
    sendButton.addEventListener('click', () => chooseFileForPeer(peer.peerId));
    els.onlinePeers.append(item);
  }
}

function canTransferFiles() {
  return Boolean(window.RTCPeerConnection);
}

function chooseFileForPeer(peerId) {
  if (!canTransferFiles()) {
    showToast('当前浏览器不支持点对点文件传输');
    return;
  }

  if (!state.socket || state.socket.readyState !== WebSocket.OPEN) {
    showToast('连接未就绪');
    return;
  }

  const peer = getPeer(peerId);
  if (!peer) {
    showToast('用户已离线');
    return;
  }

  state.transferTargetPeerId = peerId;
  els.fileInput.value = '';
  els.fileInput.click();
}

function handleFileSelected() {
  const peerId = state.transferTargetPeerId;
  state.transferTargetPeerId = null;

  const file = els.fileInput.files?.[0];
  els.fileInput.value = '';

  if (!file || !peerId) {
    return;
  }

  const peer = getPeer(peerId);
  if (!peer) {
    showToast('用户已离线');
    return;
  }

  startOutgoingTransfer(peer, file);
}

function startOutgoingTransfer(peer, file) {
  const transferId = createTransferId();
  const transfer = {
    id: transferId,
    direction: 'outgoing',
    peerId: peer.peerId,
    peerName: peer.name,
    peerIcon: peer.icon,
    peerColor: peer.color,
    file,
    fileName: file.name || '未命名文件',
    fileSize: file.size,
    fileType: file.type || '',
    lastModified: file.lastModified || null,
    status: 'waiting',
    progress: 0,
    transferredBytes: 0,
    pendingCandidates: [],
    createdAt: Date.now()
  };

  state.transfers.set(transferId, transfer);
  renderTransfers();

  const sent = sendSocket('transfer:request', {
    transferId,
    toPeerId: peer.peerId,
    file: fileToMetadata(file)
  });

  if (!sent) {
    markTransferFailed(transfer, '发送请求失败');
  }
}

function handleIncomingTransfer(payload) {
  const transferId = typeof payload.transferId === 'string' ? payload.transferId : '';
  const fromPeerId = typeof payload.fromPeerId === 'string' ? payload.fromPeerId : '';
  const file = normalizeFileMetadata(payload.file);
  if (!transferId || !fromPeerId || !file) {
    return;
  }

  if (state.pendingIncomingTransferId) {
    sendSocket('transfer:response', { transferId, toPeerId: fromPeerId, accepted: false });
    return;
  }

  const identity = normalizePeerIdentity(payload.fromIdentity);
  const transfer = {
    id: transferId,
    direction: 'incoming',
    peerId: fromPeerId,
    peerName: identity.name,
    peerIcon: identity.icon,
    peerColor: identity.color,
    fileName: file.name,
    fileSize: file.size,
    fileType: file.type,
    lastModified: file.lastModified,
    status: 'incoming-request',
    progress: 0,
    transferredBytes: 0,
    chunks: [],
    pendingCandidates: [],
    createdAt: Date.now()
  };

  state.transfers.set(transferId, transfer);
  state.pendingIncomingTransferId = transferId;
  renderIncomingTransferModal(transfer);
  renderTransfers();
  openModal(els.incomingTransferModal, els.acceptTransferButton);
  notifyUser('收到文件请求', `${transfer.peerName} 想发送 ${transfer.fileName}`);
}

function renderIncomingTransferModal(transfer) {
  els.incomingTransferFrom.textContent = transfer.peerName;
  els.incomingTransferFileName.textContent = transfer.fileName;
  els.incomingTransferFileSize.textContent = formatBytes(transfer.fileSize);
}

function acceptIncomingTransfer() {
  const transfer = state.transfers.get(state.pendingIncomingTransferId);
  if (!transfer || transfer.status !== 'incoming-request') {
    closeIncomingTransferModal();
    return;
  }

  transfer.status = 'connecting';
  sendSocket('transfer:response', {
    transferId: transfer.id,
    toPeerId: transfer.peerId,
    accepted: true
  });
  closeIncomingTransferModal();
  renderTransfers();
}

function rejectIncomingTransfer(reason) {
  const transfer = state.transfers.get(state.pendingIncomingTransferId);
  if (!transfer) {
    closeIncomingTransferModal();
    return;
  }

  sendSocket('transfer:response', {
    transferId: transfer.id,
    toPeerId: transfer.peerId,
    accepted: false
  });
  transfer.status = 'rejected';
  transfer.error = reason || '已拒绝';
  closeIncomingTransferModal();
  renderTransfers();
}

function closeIncomingTransferModal() {
  state.pendingIncomingTransferId = null;
  closeModal(els.incomingTransferModal);
}

function handleTransferResponse(payload) {
  const transfer = getTransfer(payload.transferId);
  if (!transfer || transfer.direction !== 'outgoing') {
    return;
  }

  if (!payload.accepted) {
    transfer.status = 'rejected';
    transfer.error = '对方已拒绝';
    closeTransferConnection(transfer);
    renderTransfers();
    return;
  }

  transfer.status = 'connecting';
  renderTransfers();
  createSenderConnection(transfer).catch((error) => {
    markTransferFailed(transfer, error.message || '连接失败');
  });
}

async function createSenderConnection(transfer) {
  const pc = createPeerConnection(transfer);
  const channel = pc.createDataChannel('file', { ordered: true });
  transfer.channel = channel;
  setupSenderChannel(transfer, channel);

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  sendSocket('rtc:offer', {
    transferId: transfer.id,
    toPeerId: transfer.peerId,
    description: pc.localDescription
  });
}

async function handleRtcOffer(payload) {
  const transfer = getTransfer(payload.transferId);
  if (!transfer || transfer.direction !== 'incoming') {
    return;
  }

  try {
    transfer.status = 'connecting';
    const pc = createPeerConnection(transfer);
    pc.ondatachannel = (event) => setupReceiverChannel(transfer, event.channel);
    await pc.setRemoteDescription(payload.description);
    await flushPendingIceCandidates(transfer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    sendSocket('rtc:answer', {
      transferId: transfer.id,
      toPeerId: transfer.peerId,
      description: pc.localDescription
    });
    renderTransfers();
  } catch (error) {
    markTransferFailed(transfer, error.message || '连接失败');
  }
}

async function handleRtcAnswer(payload) {
  const transfer = getTransfer(payload.transferId);
  if (!transfer || !transfer.pc) {
    return;
  }

  try {
    await transfer.pc.setRemoteDescription(payload.description);
    await flushPendingIceCandidates(transfer);
  } catch (error) {
    markTransferFailed(transfer, error.message || '连接失败');
  }
}

async function handleRtcIce(payload) {
  const transfer = getTransfer(payload.transferId);
  if (!transfer || !payload.candidate) {
    return;
  }

  if (!transfer.pc || !transfer.pc.remoteDescription) {
    transfer.pendingCandidates.push(payload.candidate);
    return;
  }

  try {
    await transfer.pc.addIceCandidate(payload.candidate);
  } catch (error) {
    markTransferFailed(transfer, error.message || '连接失败');
  }
}

function createPeerConnection(transfer) {
  const pc = new RTCPeerConnection({ iceServers: [] });
  transfer.pc = pc;

  pc.onicecandidate = (event) => {
    sendSocket('rtc:ice', {
      transferId: transfer.id,
      toPeerId: transfer.peerId,
      candidate: event.candidate
    });
  };

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
      markTransferFailed(transfer, '点对点连接已断开');
    }
  };

  return pc;
}

function setupSenderChannel(transfer, channel) {
  channel.binaryType = 'arraybuffer';
  channel.bufferedAmountLowThreshold = DATA_CHANNEL_BUFFER_LIMIT / 2;
  channel.onopen = () => sendFileChunks(transfer).catch((error) => {
    markTransferFailed(transfer, error.message || '发送失败');
  });
  channel.onmessage = (event) => handleSenderChannelMessage(transfer, event.data);
  channel.onerror = () => markTransferFailed(transfer, '发送通道异常');
  channel.onclose = () => {
    if (!isFinishedTransfer(transfer)) {
      markTransferFailed(transfer, '发送通道已关闭');
    }
  };
}

function setupReceiverChannel(transfer, channel) {
  transfer.channel = channel;
  channel.binaryType = 'arraybuffer';
  channel.onmessage = (event) => handleReceiverChannelMessage(transfer, event.data);
  channel.onerror = () => markTransferFailed(transfer, '接收通道异常');
  channel.onclose = () => {
    if (!isFinishedTransfer(transfer)) {
      markTransferFailed(transfer, '接收通道已关闭');
    }
  };
}

async function sendFileChunks(transfer) {
  if (!transfer.file || !transfer.channel) {
    throw new Error('文件不可用');
  }

  transfer.status = 'transferring';
  renderTransfers();

  let offset = 0;
  while (offset < transfer.file.size) {
    if (transfer.status === 'canceled' || transfer.status === 'failed') {
      return;
    }

    await waitForChannelBuffer(transfer.channel);
    const chunk = await transfer.file.slice(offset, offset + FILE_CHUNK_SIZE).arrayBuffer();
    transfer.channel.send(chunk);
    offset += chunk.byteLength;
    transfer.transferredBytes = offset;
    transfer.progress = getProgress(offset, transfer.file.size);
    renderTransfers();
  }

  await waitForChannelBuffer(transfer.channel);
  transfer.channel.send(JSON.stringify({ type: 'file:complete' }));
  transfer.transferredBytes = transfer.file.size;
  transfer.progress = 100;
  transfer.status = 'finishing';
  renderTransfers();
}

function handleSenderChannelMessage(transfer, data) {
  if (typeof data !== 'string') {
    return;
  }

  try {
    const message = JSON.parse(data);
    if (message.type === 'file:received') {
      transfer.status = 'complete';
      transfer.progress = 100;
      renderTransfers();
      window.setTimeout(() => closeTransferConnection(transfer), 500);
    } else if (message.type === 'file:error') {
      markTransferFailed(transfer, message.message || '接收方校验失败');
    }
  } catch {
    markTransferFailed(transfer, '接收确认消息无效');
  }
}

function waitForChannelBuffer(channel) {
  if (channel.readyState !== 'open') {
    return Promise.reject(new Error('传输通道未打开'));
  }

  if (channel.bufferedAmount <= DATA_CHANNEL_BUFFER_LIMIT) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      channel.removeEventListener('bufferedamountlow', handleLow);
      channel.removeEventListener('close', handleClose);
      channel.removeEventListener('error', handleClose);
    };
    const handleLow = () => {
      cleanup();
      resolve();
    };
    const handleClose = () => {
      cleanup();
      reject(new Error('传输通道已关闭'));
    };
    channel.addEventListener('bufferedamountlow', handleLow);
    channel.addEventListener('close', handleClose);
    channel.addEventListener('error', handleClose);
  });
}

function handleReceiverChannelMessage(transfer, data) {
  if (typeof data === 'string') {
    try {
      const message = JSON.parse(data);
      if (message.type === 'file:complete') {
        finishIncomingTransfer(transfer);
      }
    } catch {
      markTransferFailed(transfer, '文件传输消息无效');
    }
    return;
  }

  const chunk = data instanceof ArrayBuffer ? data : data.arrayBuffer?.();
  if (chunk instanceof Promise) {
    chunk.then((buffer) => appendIncomingChunk(transfer, buffer)).catch(() => {
      markTransferFailed(transfer, '读取文件分片失败');
    });
    return;
  }

  appendIncomingChunk(transfer, chunk);
}

function appendIncomingChunk(transfer, chunk) {
  if (!(chunk instanceof ArrayBuffer)) {
    markTransferFailed(transfer, '文件分片无效');
    return;
  }

  transfer.status = 'transferring';
  transfer.chunks.push(chunk);
  transfer.transferredBytes += chunk.byteLength;
  transfer.progress = getProgress(transfer.transferredBytes, transfer.fileSize);
  renderTransfers();
}

function finishIncomingTransfer(transfer) {
  if (transfer.transferredBytes !== transfer.fileSize) {
    sendChannelMessage(transfer.channel, { type: 'file:error', message: '文件大小校验失败' });
    markTransferFailed(transfer, '文件大小校验失败');
    return;
  }

  const blob = new Blob(transfer.chunks, { type: transfer.fileType || 'application/octet-stream' });
  transfer.chunks = [];
  transfer.blob = blob;
  transfer.objectUrl = URL.createObjectURL(blob);
  transfer.status = 'complete';
  transfer.progress = 100;
  sendChannelMessage(transfer.channel, { type: 'file:received' });
  renderTransfers();
  showToast('文件接收完成');
  window.setTimeout(() => closeTransferConnection(transfer), 500);
}

function sendChannelMessage(channel, message) {
  try {
    if (channel?.readyState === 'open') {
      channel.send(JSON.stringify(message));
    }
  } catch {}
}

async function flushPendingIceCandidates(transfer) {
  if (!transfer.pc || !transfer.pc.remoteDescription) {
    return;
  }

  const candidates = transfer.pendingCandidates.splice(0);
  for (const candidate of candidates) {
    await transfer.pc.addIceCandidate(candidate);
  }
}

function renderTransfers() {
  const transfers = Array.from(state.transfers.values()).sort((a, b) => b.createdAt - a.createdAt);
  els.transferPanel.classList.toggle('hidden', !transfers.length);
  els.transferList.replaceChildren();

  for (const transfer of transfers) {
    els.transferList.append(createTransferItem(transfer));
  }
}

function createTransferItem(transfer) {
  const item = document.createElement('article');
  item.className = 'transfer-item';

  const head = document.createElement('div');
  head.className = 'transfer-item-head';

  const title = document.createElement('div');
  title.className = 'transfer-title';
  title.innerHTML = '<span class="transfer-peer"></span><strong></strong>';
  title.querySelector('.transfer-peer').textContent = transfer.direction === 'outgoing' ? `发送给 ${transfer.peerName}` : `来自 ${transfer.peerName}`;
  title.querySelector('strong').textContent = transfer.fileName;
  head.append(title);

  if (canDismissTransfer(transfer)) {
    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'transfer-close-button';
    closeButton.title = '关闭';
    closeButton.setAttribute('aria-label', '关闭');
    closeButton.textContent = '×';
    closeButton.addEventListener('click', () => dismissSavedTransfer(transfer));
    head.append(closeButton);
  }

  const meta = document.createElement('div');
  meta.className = 'transfer-meta';
  meta.textContent = `${TRANSFER_STATUSES[transfer.status] || transfer.status} · ${formatBytes(transfer.transferredBytes || 0)} / ${formatBytes(transfer.fileSize || 0)}`;

  const progress = document.createElement('div');
  progress.className = 'transfer-progress';
  progress.innerHTML = '<span></span>';
  progress.querySelector('span').style.width = `${Math.min(100, Math.max(0, transfer.progress || 0))}%`;

  const actions = document.createElement('div');
  actions.className = 'transfer-actions';
  appendTransferActions(actions, transfer);

  item.append(head, meta, progress);
  if (transfer.error) {
    const error = document.createElement('div');
    error.className = 'transfer-error';
    error.textContent = transfer.error;
    item.append(error);
  }
  if (actions.childElementCount) {
    item.append(actions);
  }

  return item;
}

function appendTransferActions(actions, transfer) {
  if (transfer.status === 'complete' && transfer.direction === 'incoming' && transfer.objectUrl) {
    actions.append(createSmallButton(transfer.isSaving ? '保存中' : '保存', () => saveReceivedFile(transfer), transfer.isSaving));
  }

  if (['incoming-request', 'waiting', 'connecting', 'transferring', 'finishing'].includes(transfer.status)) {
    actions.append(createSmallButton(transfer.direction === 'incoming' && transfer.status === 'incoming-request' ? '拒绝' : '取消', () => {
      if (transfer.direction === 'incoming' && transfer.status === 'incoming-request') {
        state.pendingIncomingTransferId = transfer.id;
        rejectIncomingTransfer('已拒绝');
      } else {
        cancelTransfer(transfer, '已取消');
      }
    }));
  }
}

function canDismissTransfer(transfer) {
  return transfer.status === 'complete' && transfer.direction === 'incoming';
}

function createSmallButton(label, onClick, disabled = false) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.disabled = disabled;
  button.addEventListener('click', async () => {
    try {
      await onClick();
    } catch (error) {
      showToast(error.message || '操作失败');
    }
  });
  return button;
}

async function saveReceivedFile(transfer) {
  if (transfer.isSaving) {
    return;
  }

  transfer.isSaving = true;
  renderTransfers();

  try {
    const confirmed = await saveTransferFile(transfer);
    if (!confirmed) {
      showToast('下载已触发，请确认浏览器保存结果');
      return;
    }

    dismissSavedTransfer(transfer);
  } catch (error) {
    if (error?.name === 'AbortError') {
      showToast('已取消保存');
    } else {
      showToast(error.message || '保存失败');
    }
  } finally {
    transfer.isSaving = false;
    if (state.transfers.has(transfer.id)) {
      renderTransfers();
    }
  }
}

async function saveTransferFile(transfer) {
  if (window.showSaveFilePicker && transfer.blob) {
    const handle = await window.showSaveFilePicker({
      suggestedName: transfer.fileName || 'download'
    });
    const writable = await handle.createWritable();
    await writable.write(transfer.blob);
    await writable.close();
    return true;
  }

  const link = document.createElement('a');
  link.href = transfer.objectUrl;
  link.download = transfer.fileName || 'download';
  document.body.append(link);
  link.click();
  link.remove();
  return false;
}

function dismissSavedTransfer(transfer) {
  sendSocket('transfer:dismiss', {
    transferId: transfer.id,
    toPeerId: transfer.peerId
  });
  removeTransfer(transfer.id);
}

function cancelTransfer(transfer, reason) {
  sendSocket('transfer:cancel', {
    transferId: transfer.id,
    toPeerId: transfer.peerId,
    reason
  });
  transfer.status = 'canceled';
  transfer.error = reason;
  closeTransferConnection(transfer);
  renderTransfers();
}

function handleRemoteCancel(payload) {
  const transfer = getTransfer(payload.transferId);
  if (!transfer) {
    return;
  }

  transfer.status = 'canceled';
  transfer.error = typeof payload.reason === 'string' && payload.reason.trim() ? payload.reason.trim() : '对方已取消';
  closeTransferConnection(transfer);
  if (state.pendingIncomingTransferId === transfer.id) {
    closeIncomingTransferModal();
  }
  renderTransfers();
}

function handleTransferError(payload) {
  const transfer = getTransfer(payload.transferId);
  const message = typeof payload.message === 'string' && payload.message.trim() ? payload.message.trim() : '传输失败';
  if (!transfer) {
    showToast(message);
    return;
  }

  markTransferFailed(transfer, message);
}

function failActiveTransfers(message) {
  for (const transfer of state.transfers.values()) {
    if (!isFinishedTransfer(transfer)) {
      markTransferFailed(transfer, message);
    }
  }
}

function markTransferFailed(transfer, message) {
  if (isFinishedTransfer(transfer)) {
    return;
  }

  transfer.status = 'failed';
  transfer.error = message || '传输失败';
  closeTransferConnection(transfer);
  if (state.pendingIncomingTransferId === transfer.id) {
    closeIncomingTransferModal();
  }
  renderTransfers();
}

function closeTransferConnection(transfer) {
  try {
    transfer.channel?.close();
  } catch {}

  try {
    transfer.pc?.close();
  } catch {}
}

function isFinishedTransfer(transfer) {
  return ['complete', 'rejected', 'canceled', 'failed'].includes(transfer.status);
}

function getTransfer(transferId) {
  return typeof transferId === 'string' ? state.transfers.get(transferId) : null;
}

function removeTransfer(transferId) {
  const transfer = getTransfer(transferId);
  if (!transfer) {
    return;
  }

  closeTransferConnection(transfer);
  if (transfer.objectUrl) {
    URL.revokeObjectURL(transfer.objectUrl);
  }
  if (state.pendingIncomingTransferId === transfer.id) {
    closeIncomingTransferModal();
  }
  state.transfers.delete(transfer.id);
  renderTransfers();
}

function getPeer(peerId) {
  return state.peers.find((peer) => peer.peerId === peerId) || null;
}

function createTransferId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `transfer-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function fileToMetadata(file) {
  return {
    name: file.name || '未命名文件',
    size: file.size,
    type: file.type || '',
    lastModified: file.lastModified || null
  };
}

function normalizeFileMetadata(file) {
  if (!file || typeof file !== 'object') {
    return null;
  }

  const name = typeof file.name === 'string' && file.name.trim() ? file.name.trim() : '未命名文件';
  const size = Number(file.size);
  if (!Number.isInteger(size) || size < 0) {
    return null;
  }

  return {
    name,
    size,
    type: typeof file.type === 'string' ? file.type : '',
    lastModified: Number.isFinite(Number(file.lastModified)) ? Number(file.lastModified) : null
  };
}

function normalizePeerIdentity(identity) {
  return {
    id: typeof identity?.id === 'string' ? identity.id : '',
    name: typeof identity?.name === 'string' && identity.name.trim() ? identity.name.trim() : DEFAULT_IDENTITY_NAME,
    icon: typeof identity?.icon === 'string' && identity.icon.trim() ? identity.icon.trim() : '◆',
    color: typeof identity?.color === 'string' && identity.color.trim() ? identity.color.trim() : 'linear-gradient(135deg, #94a3b8, #475569)'
  };
}

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) {
    return `${value} B`;
  }

  const units = ['KB', 'MB', 'GB'];
  let size = value / 1024;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

function getProgress(done, total) {
  if (!total) {
    return 100;
  }
  return Math.min(100, Math.round((done / total) * 100));
}

function selectedProject() {
  return state.projects.find((project) => project.id === state.selectedProjectId) || null;
}

function render() {
  renderProjects();
  renderBoard();
  renderPeers();
  renderTransfers();
}

function renderProjects() {
  const activeProjects = state.projects.filter((project) => !project.isArchived);
  const archivedProjects = state.projects.filter((project) => project.isArchived);

  renderProjectList(els.activeProjects, activeProjects);
  renderProjectList(els.archivedProjects, archivedProjects);
  els.archiveCount.textContent = String(archivedProjects.length);
}

function renderProjectList(container, projects) {
  container.replaceChildren();

  if (!projects.length) {
    const empty = document.createElement('div');
    empty.className = 'project-empty';
    empty.textContent = '暂无项目';
    container.append(empty);
    return;
  }

  for (const project of projects) {
    const item = document.createElement('div');
    item.className = 'project-item';
    item.classList.toggle('active', project.id === state.selectedProjectId);
    item.tabIndex = 0;
    item.setAttribute('role', 'button');
    item.innerHTML = '<span></span>';
    item.querySelector('span').textContent = project.name;
    item.addEventListener('click', () => selectProject(project.id));
    item.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selectProject(project.id);
      }
    });
    item.append(createProjectActions(project));
    container.append(item);
  }
}

function selectProject(projectId) {
  state.selectedProjectId = projectId;
  closeMenus();
  render();
}

function createProjectActions(project) {
  const wrap = document.createElement('div');
  const trigger = document.createElement('button');
  const menu = document.createElement('div');

  wrap.className = 'menu-wrap project-actions-wrap';
  trigger.type = 'button';
  trigger.className = 'project-action-button';
  trigger.title = '项目操作';
  trigger.setAttribute('aria-label', '项目操作');
  trigger.textContent = '⋯';
  menu.className = 'menu project-item-menu hidden';

  trigger.addEventListener('click', (event) => {
    event.stopPropagation();
    const shouldOpen = menu.classList.contains('hidden');
    closeMenus();
    menu.classList.toggle('hidden', !shouldOpen);
  });

  menu.append(
    projectMenuButton('修改项目名', () => openProjectRename(project)),
    project.isArchived
      ? projectMenuButton('恢复项目', () => patchProjectArchive(project, false))
      : projectMenuButton('归档项目', () => patchProjectArchive(project, true))
  );

  if (project.isArchived) {
    const deleteButton = projectMenuButton('永久删除', () => deleteProject(project));
    deleteButton.classList.add('danger');
    menu.append(deleteButton);
  }

  wrap.append(trigger, menu);
  return wrap;
}

function projectMenuButton(label, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', async (event) => {
    event.stopPropagation();
    try {
      closeMenus();
      await onClick();
    } catch (error) {
      showToast(error.message);
    }
  });
  return button;
}

function openProjectRename(project) {
  state.selectedProjectId = project.id;
  render();
  els.renameProjectInput.value = project.name;
  openModal(els.projectRenameModal, els.renameProjectInput);
}

async function patchProjectArchive(project, isArchived) {
  state.selectedProjectId = project.id;
  await request(`/api/projects/${project.id}`, { method: 'PATCH', body: { isArchived } });
}

async function deleteProject(project) {
  state.selectedProjectId = project.id;
  const ok = window.confirm(`永久删除项目“${project.name}”及全部任务？`);
  if (ok) {
    await request(`/api/projects/${project.id}`, { method: 'DELETE' });
  }
}

function renderBoard() {
  const project = selectedProject();
  const hasProject = Boolean(project);

  els.emptyState.classList.toggle('hidden', hasProject);
  els.boardView.classList.toggle('hidden', !hasProject);
  els.openTaskCreateButton.disabled = !hasProject || project.isArchived;

  if (!project) {
    els.selectedProjectName.textContent = '未选择项目';
    clearTaskColumns();
    return;
  }

  els.selectedProjectName.textContent = project.name;

  const tasks = state.tasks.filter((task) => task.projectId === project.id);
  const groups = {
    open: tasks.filter((task) => task.status === 'open'),
    claimed: tasks.filter((task) => task.status === 'claimed'),
    done: tasks.filter((task) => task.status === 'done')
  };

  renderTaskList(els.openTasks, groups.open, project);
  renderTaskList(els.claimedTasks, groups.claimed, project);
  renderTaskList(els.doneTasks, groups.done, project);

  els.openCount.textContent = String(groups.open.length);
  els.claimedCount.textContent = String(groups.claimed.length);
  els.doneCount.textContent = String(groups.done.length);
}

function clearTaskColumns() {
  for (const element of [els.openTasks, els.claimedTasks, els.doneTasks]) {
    element.replaceChildren();
  }
  for (const counter of [els.openCount, els.claimedCount, els.doneCount]) {
    counter.textContent = '0';
  }
}

function renderTaskList(container, tasks, project) {
  container.replaceChildren();

  if (!tasks.length) {
    const empty = document.createElement('div');
    empty.className = 'task-empty';
    empty.textContent = '暂无任务';
    container.append(empty);
    return;
  }

  for (const task of tasks) {
    container.append(createTaskCard(task, project));
  }
}

function createTaskCard(task, project) {
  const card = document.createElement('article');
  card.className = 'task-card';
  card.dataset.background = isTaskBackground(task.backgroundColor) ? task.backgroundColor : 'white';

  const description = document.createElement('p');
  description.className = 'task-description-text';
  description.textContent = task.description;
  if (!project.isArchived) {
    description.tabIndex = 0;
    description.title = '点击编辑';
    description.addEventListener('click', () => openTaskEdit(task));
    description.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openTaskEdit(task);
      }
    });
  }

  card.append(description);

  const assignee = createTaskAssignee(task);
  const actions = project.isArchived ? null : createTaskActions(task);
  if (assignee || actions) {
    const meta = document.createElement('div');
    meta.className = 'task-meta-row';
    if (assignee) {
      meta.append(assignee);
    } else {
      const spacer = document.createElement('span');
      spacer.className = 'task-meta-spacer';
      meta.append(spacer);
    }
    if (actions) {
      meta.append(actions);
    }
    card.append(meta);
  }

  return card;
}

function createTaskAssignee(task) {
  if (!task.assigneeName) {
    return null;
  }

  const assignee = document.createElement('div');
  assignee.className = 'assignee';

  const avatar = document.createElement('span');
  avatar.className = 'assignee-avatar';
  avatar.style.background = task.assigneeColor || 'linear-gradient(135deg, #94a3b8, #475569)';
  avatar.textContent = task.assigneeIcon || '◆';

  const name = document.createElement('span');
  name.textContent = task.assigneeName;

  assignee.append(avatar, name);
  return assignee;
}

function createTaskActions(task) {
  const actions = document.createElement('div');
  actions.className = 'task-actions';

  if (task.status === 'open') {
    actions.append(
      actionButton('↗', '接取', () => patchTaskStatus(task.id, 'claimed', state.identity))
    );
  } else if (task.status === 'claimed') {
    actions.append(
      actionButton('↙', '退回', () => patchTaskStatus(task.id, 'open')),
      actionButton('✓', '完成', () => patchTaskStatus(task.id, 'done'))
    );
  } else {
    actions.append(
      actionButton('↺', '待接', () => patchTaskStatus(task.id, 'open')),
      actionButton('⌫', '删除', () => deleteTask(task.id))
    );
  }

  return actions;
}

function deleteTask(taskId) {
  const ok = window.confirm('删除这个已完成任务？');
  if (!ok) {
    return Promise.resolve();
  }
  return request(`/api/tasks/${taskId}`, { method: 'DELETE' });
}

function actionButton(icon, label, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.innerHTML = '<span class="button-icon"></span><span></span>';
  button.querySelector('.button-icon').textContent = icon;
  button.querySelector('span:last-child').textContent = label;
  button.addEventListener('click', async () => {
    try {
      closeMenus();
      await onClick();
    } catch (error) {
      showToast(error.message);
    }
  });
  return button;
}

function openTaskEdit(task) {
  state.editingTaskId = task.id;
  state.taskBackgroundColor = isTaskBackground(task.backgroundColor) ? task.backgroundColor : 'white';
  els.taskModalTitle.textContent = '编辑任务';
  els.taskSubmitButton.textContent = '保存';
  els.taskDescriptionInput.value = task.description;
  renderTaskBackgroundOptions();
  openModal(els.taskModal, els.taskDescriptionInput);
}

function isTaskBackground(value) {
  return TASK_BACKGROUNDS.some((background) => background.value === value);
}

function patchTaskStatus(taskId, status, assignee) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (status === 'open' && isOwnActiveTask(task)) {
    suppressTaskNotification(taskId);
  }

  const body = { status };
  if (assignee) {
    const normalized = normalizeIdentity(assignee);
    body.assigneeId = normalized.id;
    body.assigneeName = normalized.name;
    body.assigneeIcon = normalized.icon;
    body.assigneeColor = normalized.color;
  }
  return request(`/api/tasks/${taskId}`, { method: 'PATCH', body });
}

function normalizeIdentity(identity) {
  return {
    id: typeof identity.id === 'string' && identity.id.trim() ? identity.id.trim() : createIdentityId(),
    name: typeof identity.name === 'string' && identity.name.trim() ? identity.name.trim() : DEFAULT_IDENTITY_NAME,
    icon: AVATAR_ICONS.includes(identity.icon) ? identity.icon : AVATAR_ICONS[0],
    color: AVATAR_COLORS.includes(identity.color) ? identity.color : AVATAR_COLORS[0]
  };
}

async function syncIdentityTasks(previousIdentity) {
  const current = normalizeIdentity(state.identity);
  const previous = normalizeIdentity(previousIdentity);

  try {
    await request('/api/identity-tasks', {
      method: 'PATCH',
      body: {
        assigneeId: current.id,
        assigneeName: current.name,
        assigneeIcon: current.icon,
        assigneeColor: current.color,
        previousAssigneeName: previous.name,
        previousAssigneeIcon: previous.icon,
        previousAssigneeColor: previous.color
      }
    });
  } catch (error) {
    showToast(error.message);
  }
}

function openModal(modal, focusTarget) {
  modal.classList.remove('hidden');
  closeMenus();
  window.setTimeout(() => focusTarget?.focus(), 0);
}

function closeModal(modal) {
  if (!modal) {
    return;
  }
  modal.classList.add('hidden');
  if (modal === els.taskModal) {
    state.editingTaskId = null;
    state.taskBackgroundColor = 'white';
  }
}

function closeMenus(except) {
  document.querySelectorAll('.menu:not(.hidden)').forEach((menu) => {
    if (menu !== except) {
      menu.classList.add('hidden');
    }
  });
}

async function request(url, options = {}) {
  const fetchOptions = {
    method: options.method || 'GET',
    headers: {
      Accept: 'application/json'
    }
  };

  if (options.body) {
    fetchOptions.headers['Content-Type'] = 'application/json';
    fetchOptions.body = JSON.stringify(options.body);
  }

  const response = await fetch(url, fetchOptions);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || '请求失败');
  }

  return data;
}

function notifyUser(title, body) {
  const notificationId = createNotificationId();
  addPersistentNotification(title, body);
  showBrowserNotification(title, body, notificationId);
}

function addPersistentNotification(title, body) {
  const item = document.createElement('article');
  item.className = 'persistent-notification';
  item.innerHTML = `
    <div>
      <strong></strong>
      <p></p>
    </div>
    <button type="button" title="关闭" aria-label="关闭">×</button>
  `;
  item.querySelector('strong').textContent = title;
  item.querySelector('p').textContent = body;
  item.querySelector('button').addEventListener('click', () => item.remove());
  els.notificationStack.prepend(item);
}

function requestBrowserNotificationPermission() {
  if (!('Notification' in window)) {
    return Promise.resolve('denied');
  }

  if (Notification.permission !== 'default') {
    return Promise.resolve(Notification.permission);
  }

  return Notification.requestPermission().catch(() => Notification.permission);
}

function createNotificationId() {
  return `taskboard-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function showBrowserNotification(title, body, tag) {
  if (!('Notification' in window)) {
    return;
  }

  const permission = Notification.permission === 'default'
    ? await requestBrowserNotificationPermission()
    : Notification.permission;

  if (permission !== 'granted') {
    return;
  }

  try {
    new Notification(title, {
      body,
      tag
    });
  } catch {}
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add('show');
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    els.toast.classList.remove('show');
  }, 2200);
}
