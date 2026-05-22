(function () {
  const STORAGE_KEYS = {
    tasks: 'dailyPlanner.tasks',
    reviews: 'dailyPlanner.reviews',
    settings: 'dailyPlanner.settings'
  };

  const dayNames = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

  const state = {
    tasks: [],
    reviews: {},
    settings: {
      autoRollEnabled: true,
      lastRecurringDate: null,
      lastRolloverDate: null,
      manualOrderDates: {}
    },
    currentDate: null,
    today: null,
    editingTaskId: null,
    rolloverResolver: null,
    conflictResolver: null
  };

  const dom = {
    currentDateText: document.getElementById('currentDateText'),
    rangeInfo: document.getElementById('rangeInfo'),
    prevBtn: document.getElementById('prevDayBtn'),
    futureSelect: document.getElementById('futureDaySelect'),
    listTitle: document.getElementById('listTitle'),
    taskList: document.getElementById('taskList'),
    taskEmpty: document.getElementById('taskEmpty'),
    form: document.getElementById('taskForm'),
    descInput: document.getElementById('taskDescription'),
    timeInput: document.getElementById('taskTime'),
    timeStart: document.getElementById('taskTimeStart'),
    timeEnd: document.getElementById('taskTimeEnd'),
    dateInput: document.getElementById('taskDate'),
    priorityInput: document.getElementById('taskPriority'),
    recurringInput: document.getElementById('taskRecurring'),
    autoRollToggle: document.getElementById('autoRollToggle'),
    reviewDateLabel: document.getElementById('reviewDateLabel'),
    reviewGood: document.getElementById('reviewGood'),
    reviewBad: document.getElementById('reviewBad'),
    reviewImprove: document.getElementById('reviewImprove'),
    saveReviewBtn: document.getElementById('saveReviewBtn'),
    exportBtn: document.getElementById('exportBtn'),
    editDialog: document.getElementById('editDialog'),
    editForm: document.getElementById('editForm'),
    editDesc: document.getElementById('editDescription'),
    editTime: document.getElementById('editTime'),
    editTimeStart: document.getElementById('editTimeStart'),
    editTimeEnd: document.getElementById('editTimeEnd'),
    editDate: document.getElementById('editDate'),
    editPriority: document.getElementById('editPriority'),
    rolloverDialog: document.getElementById('rolloverDialog'),
    rolloverList: document.getElementById('rolloverList'),
    conflictDialog: document.getElementById('conflictDialog'),
    conflictText: document.getElementById('conflictText'),
    conflictTime: document.getElementById('conflictTimeInput'),
    exportDialog: document.getElementById('exportDialog')
  };

  function init() {
    loadData();
    state.today = getTodayString();
    state.currentDate = state.today;
    configureDateInputs();
    syncPickersFromText(dom.timeInput, dom.timeStart, dom.timeEnd);
    attachEvents();
    runDailyRoutines();
    renderAll();

    new Sortable(dom.taskList, {
      animation: 150,
      handle: '.drag-handle',
      onEnd: handleManualOrder
    });
  }

  function loadData() {
    state.tasks = safeParse(localStorage.getItem(STORAGE_KEYS.tasks), []);
    state.reviews = safeParse(localStorage.getItem(STORAGE_KEYS.reviews), {});
    state.settings = Object.assign(state.settings, safeParse(localStorage.getItem(STORAGE_KEYS.settings), {}));
    state.settings.manualOrderDates = state.settings.manualOrderDates || {};
    migrateTaskModel(state.tasks);
  }

  function safeParse(raw, fallback) {
    try {
      return raw ? JSON.parse(raw) : fallback;
    } catch (err) {
      console.warn('parse error', err);
      return fallback;
    }
  }

  function persistTasks() {
    localStorage.setItem(STORAGE_KEYS.tasks, JSON.stringify(state.tasks));
  }

  function persistReviews() {
    localStorage.setItem(STORAGE_KEYS.reviews, JSON.stringify(state.reviews));
  }

  function persistSettings() {
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(state.settings));
  }

  function migrateTaskModel(tasks) {
    let updated = false;

    tasks.forEach(task => {
      if (!task.timeStart) {
        const parsed = extractTimesFromText(task.time || '');
        task.timeStart = parsed.start;
        task.timeEnd = parsed.end;
        updated = true;
      }

      if (task.timeStart && !task.time) {
        task.time = formatTaskTime(task);
        updated = true;
      }

      if (!('isRecurring' in task)) {
        task.isRecurring = false;
        updated = true;
      }

      if (!('order' in task)) {
        task.order = null;
      }
    });

    if (updated) {
      persistTasks();
    }
  }

  function configureDateInputs() {
    const min = state.today;
    const max = addDays(state.today, 6);
    dom.dateInput.min = dom.editDate.min = min;
    dom.dateInput.max = dom.editDate.max = max;
    dom.dateInput.value = state.currentDate;
    dom.rangeInfo.textContent = `可选范围：${min} ~ ${max}`;
    populateFutureOptions();
  }

  function populateFutureOptions() {
    if (!dom.futureSelect) return;
    let options = '<option value="">选择日期</option>';
    for (let i = 1; i <= 6; i++) {
      const date = addDays(state.today, i);
      options += `<option value="${date}">${formatFutureLabel(date)}</option>`;
    }
    dom.futureSelect.innerHTML = options;
  }

  function attachEvents() {
    dom.prevBtn.addEventListener('click', () => changeDate(-1));
    dom.futureSelect.addEventListener('change', handleFutureSelect);
    dom.form.addEventListener('submit', handleAddTask);
    dom.taskList.addEventListener('click', handleListClick);
    dom.taskList.addEventListener('change', handleStatusToggle);
    dom.timeStart.addEventListener('change', () => updateTimeTextFromPickers(dom.timeStart, dom.timeEnd, dom.timeInput));
    dom.timeEnd.addEventListener('change', () => updateTimeTextFromPickers(dom.timeStart, dom.timeEnd, dom.timeInput));
    dom.editTimeStart.addEventListener('change', () => updateTimeTextFromPickers(dom.editTimeStart, dom.editTimeEnd, dom.editTime));
    dom.editTimeEnd.addEventListener('change', () => updateTimeTextFromPickers(dom.editTimeStart, dom.editTimeEnd, dom.editTime));
    dom.timeInput.addEventListener('blur', () => syncPickersFromText(dom.timeInput, dom.timeStart, dom.timeEnd));
    dom.editTime.addEventListener('blur', () => syncPickersFromText(dom.editTime, dom.editTimeStart, dom.editTimeEnd));
    dom.autoRollToggle.addEventListener('change', handleAutoRollToggle);
    dom.saveReviewBtn.addEventListener('click', saveReview);
    dom.exportBtn.addEventListener('click', openExportDialog);
    dom.editForm.addEventListener('submit', handleEditSubmit);
    dom.editForm.querySelector('[data-close]').addEventListener('click', () => dom.editDialog.close());
    dom.rolloverDialog.addEventListener('click', handleRolloverChoice);
    dom.rolloverDialog.addEventListener('cancel', event => {
      event.preventDefault();
      finalizeRollover(false);
    });
    dom.conflictDialog.addEventListener('click', handleConflictChoice);
    dom.conflictDialog.addEventListener('cancel', event => {
      event.preventDefault();
      finalizeConflict('skip');
    });
    dom.exportDialog.addEventListener('click', handleExportChoice);
    dom.exportDialog.addEventListener('cancel', event => {
      event.preventDefault();
      dom.exportDialog.close();
    });
  }

  function changeDate(delta) {
    const newDate = addDays(state.currentDate, delta);
    if (!isWithinWindow(newDate)) return;
    state.currentDate = newDate;
    dom.dateInput.value = newDate;
    renderAll();
  }

  function handleFutureSelect(event) {
    const value = event.target.value;
    if (!value || value === state.currentDate) return;
    state.currentDate = value;
    dom.dateInput.value = value;
    renderAll();
  }

  function handleAutoRollToggle(event) {
    state.settings.autoRollEnabled = event.target.checked;
    persistSettings();
  }

  function handleAddTask(event) {
    event.preventDefault();
    const description = dom.descInput.value.trim();
    const timeText = dom.timeInput.value.trim();
    const date = dom.dateInput.value || state.currentDate;
    const priority = dom.priorityInput.value;
    const isRecurring = dom.recurringInput.checked;

    if (!description) {
      alert('请填写任务描述');
      return;
    }

    const validation = validateTimeInput(timeText);
    if (!validation.valid) {
      alert(validation.message);
      return;
    }

    if (!isWithinWindow(date)) {
      alert('日期超出允许范围（今天起 7 天内）');
      return;
    }

    const newTask = {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      description,
      date,
      priority,
      status: 'pending',
      completedAt: null,
      createdAt: new Date().toISOString(),
      isRecurring,
      recurringParentId: null,
      order: null,
      timeStart: validation.start,
      timeEnd: validation.end,
      time: formatTaskTime({ timeStart: validation.start, timeEnd: validation.end })
    };

    if (state.settings.manualOrderDates[date]) {
      const max = getMaxOrder(date);
      newTask.order = max + 1;
    }

    state.tasks.push(newTask);
    dom.form.reset();
    dom.dateInput.value = state.currentDate;
    dom.timeStart.value = '';
    dom.timeEnd.value = '';
    persistTasks();
    renderTasks();
  }

  function getMaxOrder(date) {
    return state.tasks.filter(t => t.date === date && typeof t.order === 'number')
      .reduce((max, task) => Math.max(max, task.order), -1);
  }

  function handleListClick(event) {
    const actionBtn = event.target.closest('[data-action]');
    if (!actionBtn) return;
    const li = actionBtn.closest('.task');
    if (!li) return;
    const id = li.dataset.id;
    if (actionBtn.dataset.action === 'edit') {
      openEditDialog(id);
    } else if (actionBtn.dataset.action === 'delete') {
      deleteTask(id);
    }
  }

  function handleStatusToggle(event) {
    if (!event.target.matches('[data-role="toggle-status"]')) return;
    const li = event.target.closest('.task');
    const task = state.tasks.find(t => t.id === li.dataset.id);
    if (!task) return;
    if (event.target.checked) {
      task.status = 'done';
      task.completedAt = new Date().toISOString();
    } else {
      task.status = 'pending';
      task.completedAt = null;
    }
    persistTasks();
    renderTasks();
  }

  function openEditDialog(taskId) {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;
    state.editingTaskId = taskId;
    dom.editDesc.value = task.description;
    dom.editTime.value = formatTaskTime(task);
    syncPickersFromText(dom.editTime, dom.editTimeStart, dom.editTimeEnd);
    dom.editDate.value = task.date;
    dom.editPriority.value = task.priority || '';
    dom.editDialog.showModal();
  }

  function handleEditSubmit(event) {
    event.preventDefault();
    const task = state.tasks.find(t => t.id === state.editingTaskId);
    if (!task) return;

    const nextDate = dom.editDate.value;
    if (!isWithinWindow(nextDate)) {
      alert('日期超出允许范围');
      return;
    }

    const validation = validateTimeInput(dom.editTime.value.trim());
    if (!validation.valid) {
      alert(validation.message);
      return;
    }

    const prevDate = task.date;
    task.description = dom.editDesc.value.trim();
    task.timeStart = validation.start;
    task.timeEnd = validation.end;
    task.time = formatTaskTime(task);
    task.date = nextDate;
    task.priority = dom.editPriority.value;

    if (!state.settings.manualOrderDates[nextDate]) {
      task.order = null;
    }

    if (prevDate !== nextDate && state.settings.manualOrderDates[prevDate]) {
      resequenceOrders(prevDate);
    }

    persistTasks();
    dom.editDialog.close();
    renderTasks();
  }

  function validateTimeInput(timeText) {
    const parsed = extractTimesFromText(timeText);
    if (!parsed.start) {
      return {
        valid: false,
        message: '请填写合法时间，例如 09:00 或 09:00-10:00'
      };
    }

    if (parsed.end && parseTimeValue(parsed.end) < parseTimeValue(parsed.start)) {
      return {
        valid: false,
        message: '结束时间不能早于开始时间'
      };
    }

    return {
      valid: true,
      start: parsed.start,
      end: parsed.end
    };
  }

  function resequenceOrders(date) {
    const items = state.tasks.filter(t => t.date === date && typeof t.order === 'number')
      .sort((a, b) => a.order - b.order);
    items.forEach((task, index) => { task.order = index; });
    persistTasks();
  }

  function deleteTask(id) {
    const task = state.tasks.find(t => t.id === id);
    if (!task) return;
    if (!confirm('确定删除该任务吗？')) return;
    state.tasks = state.tasks.filter(t => t.id !== id);
    if (state.settings.manualOrderDates[task.date]) {
      resequenceOrders(task.date);
    } else {
      persistTasks();
    }
    renderTasks();
  }

  function runDailyRoutines() {
    handleRecurringTemplates();
    handlePendingRollover();
  }

  function handleRecurringTemplates() {
    if (state.settings.lastRecurringDate === state.today) return;
    let created = 0;

    state.tasks.filter(t => t.isRecurring).forEach(template => {
      if (template.date === state.today) return;
      const exists = state.tasks.some(task => task.date === state.today && task.recurringParentId === template.id);
      if (!exists && isWithinWindow(state.today)) {
        const newTask = {
          ...template,
          id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
          date: state.today,
          status: 'pending',
          completedAt: null,
          isRecurring: false,
          recurringParentId: template.id,
          createdAt: new Date().toISOString(),
          order: state.settings.manualOrderDates[state.today] ? getMaxOrder(state.today) + 1 : null
        };
        newTask.time = formatTaskTime(newTask);
        state.tasks.push(newTask);
        created++;
      }
    });

    if (created > 0) {
      persistTasks();
    }

    state.settings.lastRecurringDate = state.today;
    persistSettings();
  }

  function handlePendingRollover() {
    if (!state.settings.autoRollEnabled) return;
    if (state.settings.lastRolloverDate === state.today) return;
    const yesterday = addDays(state.today, -1);
    const pending = state.tasks.filter(t => t.date === yesterday && t.status === 'pending');
    if (!pending.length) {
      state.settings.lastRolloverDate = state.today;
      persistSettings();
      return;
    }
    showRolloverDialog(pending);
  }

  function showRolloverDialog(tasks) {
    dom.rolloverList.innerHTML = tasks.map(t => `<li>${formatTaskTime(t) || '未设时间'} · ${t.description}</li>`).join('');
    dom.rolloverDialog.showModal();
    return new Promise(resolve => {
      state.rolloverResolver = resolve;
    }).then(async confirmed => {
      if (confirmed) {
        await movePendingTasksToToday(tasks);
      }
      state.settings.lastRolloverDate = state.today;
      persistSettings();
    });
  }

  function handleRolloverChoice(event) {
    if (!event.target.dataset.rollover) return;
    const value = event.target.dataset.rollover === 'confirm';
    finalizeRollover(value);
  }

  function finalizeRollover(value) {
    dom.rolloverDialog.close();
    if (state.rolloverResolver) {
      const resolver = state.rolloverResolver;
      state.rolloverResolver = null;
      resolver(value);
    }
  }

  async function movePendingTasksToToday(tasks) {
    for (const task of tasks) {
      const conflict = state.tasks.find(candidate =>
        candidate.date === state.today &&
        candidate.id !== task.id &&
        haveTimeConflict(task, candidate)
      );

      if (conflict) {
        const decision = await requestConflictResolution(task, conflict);
        if (decision === 'skip') {
          continue;
        }
        if (decision === 'override') {
          state.tasks = state.tasks.filter(t => t.id !== conflict.id);
        }
        if (decision === 'edit') {
          const validation = validateTimeInput(dom.conflictTime.value.trim());
          if (!validation.valid) {
            alert(validation.message);
            continue;
          }
          task.timeStart = validation.start;
          task.timeEnd = validation.end;
          task.time = formatTaskTime(task);
        }
      }

      task.date = state.today;
      task.time = formatTaskTime(task);
      if (state.settings.manualOrderDates[state.today]) {
        task.order = getMaxOrder(state.today) + 1;
      } else {
        task.order = null;
      }
    }

    persistTasks();
    renderTasks();
  }

  function requestConflictResolution(task, conflict) {
    dom.conflictText.textContent = `${formatTaskTime(task)} 与 “${conflict.description}” 冲突。`;
    dom.conflictTime.value = formatTaskTime(task);
    dom.conflictDialog.showModal();
    return new Promise(resolve => {
      state.conflictResolver = resolve;
    });
  }

  function handleConflictChoice(event) {
    const action = event.target.dataset.conflict;
    if (!action) return;
    if (action === 'edit' && !dom.conflictTime.value.trim()) {
      alert('请输入新的时间');
      return;
    }
    finalizeConflict(action);
  }

  function finalizeConflict(action) {
    dom.conflictDialog.close();
    if (state.conflictResolver) {
      state.conflictResolver(action);
      state.conflictResolver = null;
    }
  }

  function haveTimeConflict(taskA, taskB) {
    if (!taskA.timeStart || !taskB.timeStart) {
      return false;
    }
    const startA = parseTimeValue(taskA.timeStart);
    const endA = taskA.timeEnd ? parseTimeValue(taskA.timeEnd) : startA;
    const startB = parseTimeValue(taskB.timeStart);
    const endB = taskB.timeEnd ? parseTimeValue(taskB.timeEnd) : startB;
    return startA < endB && startB < endA;
  }

  function handleManualOrder(event) {
    if (event.oldIndex === event.newIndex) return;
    const items = [...dom.taskList.children].map((li, index) => ({ id: li.dataset.id, order: index }));
    items.forEach(({ id, order }) => {
      const task = state.tasks.find(t => t.id === id);
      if (task) task.order = order;
    });
    state.settings.manualOrderDates[state.currentDate] = true;
    persistSettings();
    persistTasks();
  }

  function renderAll() {
    renderHeader();
    renderTasks();
    renderReview();
    dom.autoRollToggle.checked = !!state.settings.autoRollEnabled;
  }

  function renderHeader() {
    const current = new Date(state.currentDate);
    dom.currentDateText.textContent = `${current.getFullYear()}年${pad(current.getMonth() + 1)}月${pad(current.getDate())}日 ${dayNames[current.getDay()]}`;
    dom.listTitle.textContent = `${state.currentDate === state.today ? '今天' : state.currentDate} 的任务`;
    dom.prevBtn.disabled = state.currentDate <= state.today;
    if (dom.futureSelect) {
      dom.futureSelect.value = state.currentDate > state.today ? state.currentDate : '';
    }
  }

  function renderTasks() {
    const tasks = getTasksForCurrentDate();
    if (!tasks.length) {
      dom.taskList.innerHTML = '';
      dom.taskEmpty.hidden = false;
      return;
    }
    dom.taskEmpty.hidden = true;
    dom.taskList.innerHTML = tasks.map(task => renderTaskItem(task)).join('');
  }

  function getTasksForCurrentDate() {
    const tasks = state.tasks.filter(t => t.date === state.currentDate);
    const manual = state.settings.manualOrderDates[state.currentDate];
    if (manual) {
      const needsOrder = tasks.some(t => typeof t.order !== 'number');
      if (needsOrder) {
        const seeded = [...tasks].sort((a, b) => parseTimeValue(a.timeStart || a.time) - parseTimeValue(b.timeStart || b.time));
        seeded.forEach((task, index) => { task.order = index; });
        persistTasks();
        return seeded;
      }
      return [...tasks].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    }
    return tasks.sort((a, b) => {
      const timeDiff = parseTimeValue(a.timeStart || a.time) - parseTimeValue(b.timeStart || b.time);
      if (timeDiff !== 0) return timeDiff;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  }

  function renderTaskItem(task) {
    const priorityClass = task.priority === '高'
      ? 'priority-high'
      : task.priority === '中'
        ? 'priority-medium'
        : task.priority === '低'
          ? 'priority-low'
          : '';

    const badges = [];
    if (task.priority) badges.push(`<span class="priority-pill ${priorityClass}">${task.priority}</span>`);
    if (task.isRecurring) badges.push('<span class="badge">每天重复</span>');
    if (task.recurringParentId) badges.push('<span class="badge">来自模板</span>');

    const statusInfo = task.status === 'done' && task.completedAt
      ? `<span class="muted">完成于 ${formatTime(task.completedAt)}</span>`
      : '';
    const checked = task.status === 'done' ? 'checked' : '';
    const taskClass = task.status === 'done' ? 'task completed' : 'task';

    return `
      <li class="${taskClass}" data-id="${task.id}">
        <span class="drag-handle" title="拖拽排序">&#9776;</span>
        <label class="task-check">
          <input type="checkbox" data-role="toggle-status" ${checked} />
        </label>
        <div class="task-body">
          <div class="task-top">
            <span class="task-time">${formatTaskTime(task) || '未设时间'}</span>
            <span>${task.description}</span>
            ${badges.join('')}
          </div>
          ${statusInfo}
        </div>
        <div class="task-actions">
          <button class="icon-btn" data-action="edit">编辑</button>
          <button class="icon-btn delete" data-action="delete">删除</button>
        </div>
      </li>
    `;
  }

  function updateTimeTextFromPickers(startPicker, endPicker, targetInput) {
    const start = startPicker.value;
    const end = endPicker.value;
    if (start && end) {
      targetInput.value = `${start}-${end}`;
    } else if (start) {
      targetInput.value = start;
    } else if (end) {
      targetInput.value = end;
    } else {
      targetInput.value = '';
    }
  }

  function syncPickersFromText(input, startPicker, endPicker) {
    const { start, end } = extractTimesFromText(input.value);
    startPicker.value = start;
    endPicker.value = end;
  }

  function extractTimesFromText(text) {
    const result = { start: '', end: '' };
    if (!text) return result;
    const trimmed = text.trim();
    const rangeMatch = trimmed.match(/(\d{1,2}:\d{1,2})\s*-\s*(\d{1,2}:\d{1,2})/);
    if (rangeMatch) {
      result.start = normalizeTimeToken(rangeMatch[1]);
      result.end = normalizeTimeToken(rangeMatch[2]);
      return result;
    }
    const singleMatch = trimmed.match(/(\d{1,2}):(\d{1,2})/);
    if (singleMatch) {
      result.start = normalizeTimeToken(`${singleMatch[1]}:${singleMatch[2]}`);
    }
    return result;
  }

  function normalizeTimeToken(value) {
    if (!value) return '';
    const [hourRaw, minuteRaw] = value.split(':');
    if (minuteRaw === undefined) return '';
    const hour = Number(hourRaw);
    const minute = Number(minuteRaw.slice(0, 2));
    if (Number.isNaN(hour) || Number.isNaN(minute)) return '';
    return `${pad(hour)}:${pad(minute)}`;
  }

  function parseTimeValue(timeStr) {
    if (!timeStr) return Number.POSITIVE_INFINITY;
    const match = timeStr.match(/(\d{1,2})(?::(\d{2}))?/);
    if (!match) return Number.POSITIVE_INFINITY;
    const hour = Number(match[1]);
    const minute = match[2] ? Number(match[2]) : 0;
    return hour * 60 + minute;
  }

  function formatTaskTime(task) {
    if (!task) return '';
    if (task.timeStart && task.timeEnd) {
      return `${task.timeStart}-${task.timeEnd}`;
    }
    if (task.timeStart) {
      return task.timeStart;
    }
    return task.time || '';
  }

  function formatTime(iso) {
    return new Date(iso).toLocaleString();
  }

  function renderReview() {
    const yesterday = addDays(state.today, -1);
    dom.reviewDateLabel.textContent = yesterday;
    const review = state.reviews[yesterday] || { good: '', bad: '', improve: '' };
    dom.reviewGood.value = review.good || '';
    dom.reviewBad.value = review.bad || '';
    dom.reviewImprove.value = review.improve || '';
  }

  function saveReview() {
    const yesterday = addDays(state.today, -1);
    state.reviews[yesterday] = {
      date: yesterday,
      good: dom.reviewGood.value.trim(),
      bad: dom.reviewBad.value.trim(),
      improve: dom.reviewImprove.value.trim()
    };
    persistReviews();
    alert('已保存昨日回顾');
  }

  function openExportDialog() {
    dom.exportDialog.querySelector('input[value="json"]').checked = true;
    dom.exportDialog.showModal();
  }

  function handleExportChoice(event) {
    const action = event.target.dataset.export;
    if (!action) return;
    if (action === 'confirm') {
      const format = dom.exportDialog.querySelector('input[name="exportFormat"]:checked').value;
      exportSummary(format);
    }
    dom.exportDialog.close();
  }

  function exportSummary(format) {
    const days = [];
    for (let i = 1; i <= 7; i++) {
      days.push(addDays(state.today, -i));
    }
    const summary = days.map(date => buildDaySummary(date));
    if (format === 'json') {
      const payload = {
        generatedAt: new Date().toISOString(),
        days: summary
      };
      downloadFile('weekly-summary.json', JSON.stringify(payload, null, 2), 'application/json');
    } else {
      const text = summary.map(day => formatDayText(day)).join('\n');
      downloadFile('weekly-summary.txt', text, 'text/plain');
    }
  }

  function buildDaySummary(date) {
    const tasks = state.tasks.filter(t => t.date === date);
    const completed = tasks.filter(t => t.status === 'done').length;
    const rate = tasks.length ? Math.round((completed / tasks.length) * 100) : 0;
    return {
      date,
      total: tasks.length,
      completed,
      rate,
      tasks,
      review: state.reviews[date] || null
    };
  }

  function formatDayText(day) {
    const reviewLines = day.review ? `\n  做得好的地方：${day.review.good || '（无）'}\n  遇到的问题：${day.review.bad || '（无）'}\n  改进方法：${day.review.improve || '（无）'}` : '';
    return `${day.date}: 完成 ${day.completed}/${day.total} (${day.rate}%)${reviewLines}`;
  }

  function downloadFile(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function isWithinWindow(dateStr) {
    return dateStr >= state.today && dateStr <= addDays(state.today, 6);
  }

  function getTodayString() {
    return formatDate(new Date());
  }

  function addDays(dateStr, delta) {
    const date = new Date(dateStr);
    date.setDate(date.getDate() + delta);
    return formatDate(date);
  }

  function formatDate(date) {
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    return `${year}-${month}-${day}`;
  }

  function formatFutureLabel(dateStr) {
    const date = new Date(dateStr);
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const weekday = dayNames[date.getDay()];
    return `${month}月${day}日 ${weekday}`;
  }

  function pad(value) {
    return String(value).padStart(2, '0');
  }

  document.addEventListener('DOMContentLoaded', init);
})();
