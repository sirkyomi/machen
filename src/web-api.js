/* Browser/PWA storage adapter. Electron continues to supply window.api itself. */
(() => {
  if (window.api) return;
  document.documentElement.classList.add('pwa');
  const key = 'machen.web.v1';
  const defaults = {directory: 'Lokaler App-Speicher', showProjects: true, showContexts: true, accent: 'graphite', theme: 'system', language: 'de', remindersEnabled: false, reminderTime: '09:00', reminderLeadMinutes: 60};
  let state; const listeners = new Set();
  const today = () => new Date().toLocaleDateString('en-CA');
  const id = () => crypto.randomUUID();
  const fail = text => { throw Error(window.MachenI18n?.translate(state.settings.language, text) || text); };
  function load() { try { return JSON.parse(localStorage.getItem(key)) || {}; } catch { return {}; } }
  function save() { localStorage.setItem(key, JSON.stringify(state)); listeners.forEach(listener => listener()); }
  function taskFor(taskId) { const task = [...state.tasks, ...state.archived].find(item => item.id === taskId); return task || fail('Aufgabe nicht mehr vorhanden.'); }
  function record(task, type) { state.events.push({id: id(), taskId: task.id, title: task.title, day: today(), at: new Date().toISOString(), type}); }
  function snapshot() { const enrich = task => ({...task, ...(state.context[task.id] || {})}); return {settings: state.settings, shortcutError: '', configured: true, tasks: state.tasks.map(enrich), archived: state.archived.map(task => ({...enrich(task), archived: true})), events: state.events}; }
  function validTitle(value) { return typeof value === 'string' && value.trim() && value.length <= 2000 && !/[\r\n]/.test(value) && !/(?:^|\s)(?:id|due|pri|t):/.test(value); }
  state = {...load(), settings: {...defaults, ...(load().settings || {})}, tasks: load().tasks || [], archived: load().archived || [], context: load().context || {}, events: load().events || []};
  window.api = {
    async call(action, data = {}) {
      if (action === 'state') return snapshot();
      if (action === 'update:state') return {status: 'unavailable'};
      if (action.startsWith('update:')) fail('Updates sind in diesem Build nicht verfügbar. Bitte den Installer verwenden.');
      if (action === 'create') { if (!validTitle(data.title)) fail('Bitte einen Titel ohne reservierte id:, due: oder pri:-Felder eingeben.'); const task = {id: id(), title: data.title.trim(), created: today(), completed: '', done: false, priority: data.priority || '', due: data.due || '', scheduled: data.scheduled || ''}; state.tasks.push(task); state.context[task.id] = {notes: String(data.notes || ''), dueTime: data.dueTime || '', subtasks: data.subtasks || []}; record(task, 'create'); }
      else if (action === 'edit') { const task = taskFor(data.id); if (!validTitle(data.title)) fail('Bitte einen Titel ohne reservierte id:, due: oder pri:-Felder eingeben.'); Object.assign(task, {title: data.title.trim(), priority: data.priority || '', due: data.due || '', scheduled: data.scheduled ?? task.scheduled}); state.context[task.id] = {...(state.context[task.id] || {}), notes: String(data.notes ?? state.context[task.id]?.notes ?? ''), dueTime: data.due ? (data.dueTime ?? '') : '', subtasks: data.subtasks ?? state.context[task.id]?.subtasks ?? []}; record(task, 'edit'); }
      else if (action === 'toggle') { const task = taskFor(data.id); task.done = !task.done; task.completed = task.done ? today() : ''; if (!task.done && state.archived.includes(task)) { state.archived = state.archived.filter(item => item !== task); state.tasks.push(task); } record(task, task.done ? 'completed' : 'reopened'); }
      else if (action === 'delete') { const task = taskFor(data.id); state.tasks = state.tasks.filter(item => item !== task); state.archived = state.archived.filter(item => item !== task); delete state.context[task.id]; record(task, 'delete'); }
      else if (action === 'archive') { const task = taskFor(data.id); if (!task.done || !state.tasks.includes(task)) fail('Nur erledigte Aufgaben lassen sich archivieren.'); state.tasks = state.tasks.filter(item => item !== task); state.archived.push(task); record(task, 'archive'); }
      else if (action === 'archiveCompleted') { const done = state.tasks.filter(task => task.done); state.tasks = state.tasks.filter(task => !task.done); state.archived.push(...done); done.forEach(task => record(task, 'archive')); }
      else if (action === 'restore') { const task = taskFor(data.id); if (!state.archived.includes(task)) fail('Aufgabe ist nicht im Archiv.'); state.archived = state.archived.filter(item => item !== task); state.tasks.push(task); record(task, 'restore'); }
      else if (action === 'reorder') { if (!Array.isArray(data.ids) || new Set(data.ids).size !== data.ids.length) fail('Ungültige Reihenfolge.'); const positions = state.tasks.map((task, index) => data.ids.includes(task.id) ? index : -1).filter(index => index >= 0); const selected = new Map(state.tasks.map(task => [task.id, task])); if (positions.length !== data.ids.length || data.ids.some(taskId => !selected.has(taskId))) fail('Ungültige Reihenfolge.'); positions.forEach((position, index) => { state.tasks[position] = selected.get(data.ids[index]); }); }
      else if (action === 'language') state.settings.language = data.language;
      else if (action === 'theme') state.settings.theme = data.theme;
      else if (action === 'accent') state.settings.accent = data.accent;
      else if (action === 'settings') Object.assign(state.settings, {showProjects: !!data.showProjects, showContexts: !!data.showContexts});
      else if (action === 'reminderSettings') Object.assign(state.settings, {remindersEnabled: !!data.enabled, reminderTime: data.time, reminderLeadMinutes: Number(data.leadMinutes)});
      else if (action === 'snooze') { const task = taskFor(data.id); state.context[task.id] = {...(state.context[task.id] || {}), snoozedUntil: data.preset === 'clear' ? '' : new Date(Date.now() + (data.preset === '10m' ? 600000 : data.preset === '1h' ? 3600000 : 86400000)).toISOString()}; }
      else if (action === 'openExternalLink') { if (!/^(https?:|mailto:)/i.test(String(data.url || ''))) fail('Ungültiger Link.'); window.open(data.url, '_blank', 'noopener'); return; }
      else if (action === 'attach' || action === 'openAttachment') fail('Datei nicht gefunden.');
      else if (action === 'resetApp') { state = {settings: {...defaults}, tasks: [], archived: [], context: {}, events: []}; }
      else if (['chooseDirectory', 'folder', 'quick', 'hideQuick', 'pin', 'hidePin', 'pinEnabled', 'pinSettings', 'resetPinSettings', 'pinContentSize', 'togglePinCollapsed', 'quickExpanded', 'openPinnedTask', 'quit'].includes(action)) return true;
      else fail('Unbekannte Aktion.');
      save(); return snapshot();
    },
    onChange(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    onUpdate() { return () => {}; }, onFocus() { return () => {}; }, onOpenTask() { return () => {}; }
  };
  if ('serviceWorker' in navigator && location.protocol !== 'file:') window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js'));
})();
