'use strict';

const AVATAR_ICONS = ['😀', '😎', '🚀', '🌟', '🔥', '🌈', '☕', '🎯', '💡', '🍀', '🧩', '🎨', '⚡', '🌙', '🍉', '🛠️'];
const AVATAR_COLORS = [
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
  'linear-gradient(135deg, #a3e635, #14b8a6)'
];
const TASK_BACKGROUNDS = [
  { value: 'white', label: '白', color: '#ffffff' },
  { value: 'red', label: '赤', color: '#fee2e2' },
  { value: 'orange', label: '橙', color: '#ffedd5' },
  { value: 'yellow', label: '黄', color: '#fef9c3' },
  { value: 'green', label: '绿', color: '#dcfce7' },
  { value: 'cyan', label: '青', color: '#cffafe' },
  { value: 'blue', label: '蓝', color: '#dbeafe' },
  { value: 'purple', label: '紫', color: '#ede9fe' }
];

const state = {
  projects: [],
  tasks: [],
  selectedProjectId: null,
  editingTaskId: null,
  taskBackgroundColor: 'white',
  identitySyncTimer: null,
  pendingIdentitySyncPrevious: null,
  identity: loadIdentity()
};

const els = {
  openProjectCreateButton: document.querySelector('#openProjectCreateButton'),
  addressButton: document.querySelector('#addressButton'),
  addressList: document.querySelector('#addressList'),
  projectForm: document.querySelector('#projectForm'),
  projectNameInput: document.querySelector('#projectNameInput'),
  activeProjects: document.querySelector('#activeProjects'),
  archivedProjects: document.querySelector('#archivedProjects'),
  archiveCount: document.querySelector('#archiveCount'),
  selectedProjectName: document.querySelector('#selectedProjectName'),
  projectStateLabel: document.querySelector('#projectStateLabel'),
  openTaskCreateButton: document.querySelector('#openTaskCreateButton'),
  projectMenuButton: document.querySelector('#projectMenuButton'),
  projectMenu: document.querySelector('#projectMenu'),
  openProjectRenameButton: document.querySelector('#openProjectRenameButton'),
  renameProjectForm: document.querySelector('#renameProjectForm'),
  renameProjectInput: document.querySelector('#renameProjectInput'),
  archiveProjectButton: document.querySelector('#archiveProjectButton'),
  restoreProjectButton: document.querySelector('#restoreProjectButton'),
  deleteProjectButton: document.querySelector('#deleteProjectButton'),
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
  fetchAddresses();
  fetchState();
  connectSocket();
}

function setupEvents() {
  els.openProjectCreateButton.addEventListener('click', () => {
    els.projectNameInput.value = '';
    openModal(els.projectCreateModal, els.projectNameInput);
  });

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

  els.projectMenuButton.addEventListener('click', (event) => {
    event.stopPropagation();
    if (!selectedProject()) {
      return;
    }
    els.projectMenu.classList.toggle('hidden');
  });

  els.openProjectRenameButton.addEventListener('click', () => {
    const project = selectedProject();
    if (!project) {
      return;
    }
    closeMenus();
    els.renameProjectInput.value = project.name;
    openModal(els.projectRenameModal, els.renameProjectInput);
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

  els.archiveProjectButton.addEventListener('click', async () => {
    const project = selectedProject();
    closeMenus();
    if (project) {
      await request(`/api/projects/${project.id}`, { method: 'PATCH', body: { isArchived: true } });
    }
  });

  els.restoreProjectButton.addEventListener('click', async () => {
    const project = selectedProject();
    closeMenus();
    if (project) {
      await request(`/api/projects/${project.id}`, { method: 'PATCH', body: { isArchived: false } });
    }
  });

  els.deleteProjectButton.addEventListener('click', async () => {
    const project = selectedProject();
    closeMenus();
    if (!project) {
      return;
    }
    const ok = window.confirm(`永久删除项目“${project.name}”及全部任务？`);
    if (ok) {
      await request(`/api/projects/${project.id}`, { method: 'DELETE' });
    }
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

  document.querySelectorAll('.modal').forEach((modal) => {
    modal.addEventListener('click', (event) => {
      if (event.target === modal) {
        closeModal(modal);
      }
    });
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.menu-wrap')) {
      closeMenus();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeMenus();
      document.querySelectorAll('.modal:not(.hidden)').forEach(closeModal);
    }
  });
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
    name: '匿名用户',
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
    state.identity.name = '匿名用户';
  }
  localStorage.setItem('taskboard.identity', JSON.stringify(state.identity));
  renderIdentity();
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

function renderAddresses(addresses) {
  els.addressList.replaceChildren();

  if (!addresses.length) {
    const empty = document.createElement('span');
    empty.textContent = '暂无地址';
    els.addressList.append(empty);
    return;
  }

  for (const address of addresses) {
    const link = document.createElement('a');
    link.href = address.url;
    link.target = '_blank';
    link.rel = 'noreferrer';
    link.innerHTML = '<span></span><strong></strong>';
    link.querySelector('span').textContent = address.label;
    link.querySelector('strong').textContent = address.url.replace(/^https?:\/\//, '');
    els.addressList.append(link);
  }
}

function connectSocket() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(`${protocol}//${location.host}`);

  socket.addEventListener('message', (event) => {
    try {
      const message = JSON.parse(event.data);
      if (message.type === 'state:update') {
        applyState(message.payload);
      }
    } catch {
      showToast('同步消息解析失败');
    }
  });

  socket.addEventListener('close', () => {
    setTimeout(connectSocket, 1500);
  });
}

function applyState(nextState) {
  state.projects = Array.isArray(nextState.projects) ? nextState.projects : [];
  state.tasks = Array.isArray(nextState.tasks) ? nextState.tasks : [];

  if (!state.selectedProjectId || !state.projects.some((project) => project.id === state.selectedProjectId)) {
    const firstActive = state.projects.find((project) => !project.isArchived);
    const firstProject = firstActive || state.projects[0];
    state.selectedProjectId = firstProject ? firstProject.id : null;
  }

  render();
}

function selectedProject() {
  return state.projects.find((project) => project.id === state.selectedProjectId) || null;
}

function render() {
  renderProjects();
  renderBoard();
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
    const button = document.createElement('button');
    const taskCount = state.tasks.filter((task) => task.projectId === project.id).length;
    button.type = 'button';
    button.className = 'project-item';
    button.classList.toggle('active', project.id === state.selectedProjectId);
    button.innerHTML = `<span></span><strong>${taskCount}</strong>`;
    button.querySelector('span').textContent = project.name;
    button.addEventListener('click', () => {
      state.selectedProjectId = project.id;
      closeMenus();
      render();
    });
    container.append(button);
  }
}

function renderBoard() {
  const project = selectedProject();
  const hasProject = Boolean(project);

  els.emptyState.classList.toggle('hidden', hasProject);
  els.boardView.classList.toggle('hidden', !hasProject);
  els.openTaskCreateButton.disabled = !hasProject || project.isArchived;
  els.projectMenuButton.disabled = !hasProject;

  if (!project) {
    els.selectedProjectName.textContent = '未选择项目';
    els.projectStateLabel.textContent = '当前项目';
    clearTaskColumns();
    return;
  }

  els.selectedProjectName.textContent = project.name;
  els.projectStateLabel.textContent = project.isArchived ? '归档项目' : '当前项目';
  els.archiveProjectButton.classList.toggle('hidden', project.isArchived);
  els.restoreProjectButton.classList.toggle('hidden', !project.isArchived);
  els.deleteProjectButton.classList.toggle('hidden', !project.isArchived);

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

  if (task.assigneeName) {
    const assignee = document.createElement('div');
    assignee.className = 'assignee';

    const avatar = document.createElement('span');
    avatar.className = 'assignee-avatar';
    avatar.style.background = task.assigneeColor || 'linear-gradient(135deg, #94a3b8, #475569)';
    avatar.textContent = task.assigneeIcon || '◆';

    const name = document.createElement('span');
    name.textContent = task.assigneeName;

    assignee.append(avatar, name);
    card.append(assignee);
  }

  if (!project.isArchived) {
    card.append(createTaskActions(task));
  }

  return card;
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
    name: typeof identity.name === 'string' && identity.name.trim() ? identity.name.trim() : '匿名用户',
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

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add('show');
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    els.toast.classList.remove('show');
  }, 2200);
}
