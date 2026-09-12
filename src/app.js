const root = document.querySelector('#app');
const quick = new URLSearchParams(location.search).has('quick');
const pinned = new URLSearchParams(location.search).has('pinned');
const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
})[c]);
const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dateLabel = day => new Date(day + 'T12:00:00').toLocaleDateString(locale(), {
  day: 'numeric',
  month: 'long',
  year: 'numeric'
});
const icon = name => window.taskIcons[name] || window.taskIcons.all;
let state,
  view = 'today',
  selected = null,
  day = localDay(),
  query = '',
  project = '',
  context = '',
  toastTimer,
  dirty = false,
  recordingShortcut = false,
  settingsTab = 'general',
  setupStep = 0,
  contextMenu = null,
  commandPalette = null;
const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
let quickSizeObserver;
function syncPinnedSize() {
  if (!pinned || state?.settings.pinAutoHeight === false || state?.settings.pinCollapsed) return;
  requestAnimationFrame(() => {
    const head = document.querySelector('.pinned-head'), list = document.querySelector('.pinned-list');
    if (!head || !list) return;
    const height = Math.min(640, Math.ceil(head.offsetHeight + Math.min(list.scrollHeight, 560) + 24));
    call('pinContentSize', {height}).catch(() => {});
  });
}
function syncQuickHeight() {
  const details = document.querySelector('#composer-details'), surface = document.querySelector('.quick');
  if (!quick || !details || details.hidden || !surface) return;
  call('quickExpanded', {expanded: true, height: Math.ceil(surface.scrollHeight)}).catch(() => {});
}
function applyTheme() {
  const preference = state?.settings.theme || 'system';
  document.documentElement.dataset.theme = preference === 'system' ? systemTheme.matches ? 'dark' : 'light' : preference;
  document.documentElement.dataset.palette = state?.settings.accent || 'graphite';
  document.documentElement.style.setProperty('--pin-opacity', `${Math.round((state?.settings.pinOpacity ?? 1) * 100)}%`);
  document.querySelectorAll('[data-theme]').forEach(b => {
    if (b.tagName === 'BUTTON') b.setAttribute('aria-pressed', String(b.dataset.theme === preference));
  });
  document.querySelectorAll('[data-palette]').forEach(b => {
    if (b.tagName === 'BUTTON') b.setAttribute('aria-pressed', String(b.dataset.palette === (state?.settings.accent || 'graphite')));
  });
}
function themePicker() {
  return `<div class="theme-picker" role="group" aria-label="${tr("Erscheinungsbild")}">${[['light', tr("Hell")], ['dark', tr("Dunkel")], ['system', tr("System")]].map(([value, label]) => `<button type="button" data-theme="${value}" aria-label="${label}" title="${label}" aria-pressed="${(state?.settings.theme || 'system') === value}">${icon(value)}<span>${label}</span></button>`).join('')}</div>`;
}
function palettePicker() {
  const palettes = [['graphite', tr('Graphit')], ['blue', tr('Blau')], ['violet', tr('Violett')], ['emerald', tr('Smaragd')], ['coral', tr('Koralle')]];
  const selected = state?.settings.accent || 'graphite';
  return `<div class="palette-picker" role="group" aria-label="${tr('Akzentfarbe')}">${palettes.map(([value, label]) => `<button type="button" class="palette-${value}" data-palette="${value}" aria-label="${label}" title="${label}" aria-pressed="${String(selected === value)}"><span aria-hidden="true"></span>${label}</button>`).join('')}</div>`;
}
function setupProgress() {
  const steps = [[1, tr('Erscheinungsbild')], [2, tr('Akzentfarbe')], [3, tr('Ablageort')]];
  return `<ol class="setup-progress" aria-label="${tr('Einrichtung')}" aria-live="polite">${steps.map(([number, label]) => `<li class="${number === setupStep ? 'current' : number < setupStep ? 'complete' : ''}"><span>${number}</span><small>${label}</small></li>`).join('')}</ol>`;
}
function setupContent() {
  const steps = {
    0: `<h1>${tr('Ein ruhiger Ort für deine Aufgaben.')}</h1><p>${tr('Machen hilft dir, den Tag zu planen und Aufgaben aus dem Kopf zu bekommen. Alles bleibt lokal in Dateien, die dir gehören.')}</p><ul class="setup-intro"><li>${tr('Heute im Blick behalten')}</li><li>${tr('Aufgaben in deinen eigenen Dateien speichern')}</li><li>${tr('Ohne Konto oder Cloud-Zwang arbeiten')}</li></ul><div class="setup-actions"><span></span><button type="button" class="primary" data-action="setupNext">${tr('Machen einrichten')}</button></div>`,
    1: `<h1>${tr('Wie soll Machen aussehen?')}</h1><p>${tr('Du kannst die Darstellung jederzeit in den Einstellungen ändern.')}</p><div class="setup-choice">${themePicker()}</div><div class="setup-actions"><span></span><button type="button" class="primary" data-action="setupNext">${tr('Weiter')}</button></div>`,
    2: `<h1>${tr('Wähle deinen Akzent.')}</h1><p>${tr('Er hebt Schaltflächen, Auswahl und wichtige Hinweise hervor.')}</p><div class="setup-choice">${palettePicker()}</div><div class="setup-actions"><button type="button" data-action="setupBack">${tr('Zurück')}</button><button type="button" class="primary" data-action="setupNext">${tr('Weiter')}</button></div>`,
    3: `<h1>${tr('Wo sollen deine Aufgaben liegen?')}</h1><p>${tr('Wähle einen lokalen oder synchronisierten Ordner. Eine vorhandene todo.txt wird direkt eingelesen.')}</p>${state.shortcutError ? `<p class="error-banner">${escapeHtml(tr(state.shortcutError))}</p>` : ''}<button class="primary setup-folder" data-action="chooseDirectory">${tr('Ablageort wählen')}</button><small>${tr('Ohne Konto. Deine Daten bleiben bei dir.')}</small><div class="setup-actions"><button type="button" data-action="setupBack">${tr('Zurück')}</button></div>`
  };
  return `<main class="welcome setup"><header class="setup-header">${brand()}${languagePicker()}</header>${setupStep ? setupProgress() : ''}<section class="setup-panel">${steps[setupStep]}</section></main>`;
}
systemTheme.addEventListener('change', applyTheme);
function toast(message) {
  const el = document.querySelector('#toast');
  el.textContent = tr(message.replace(/^Error invoking remote method .*?: Error: /,''));
  el.style.display = 'block';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.style.display = 'none', 5000);
}
async function call(action, data) {
  return window.api.call(action, data);
}
async function refresh() {
  const next = await call('state');
  const previous = state ? {
    ...state,
    settings: {
      ...state.settings,
      theme: next.settings.theme
    }
  } : undefined;
  const changed = JSON.stringify(next) !== JSON.stringify(previous);
  const languageChanged=!!state&&state.settings.language!==next.settings.language;
  state = next;
  document.documentElement.lang=state.settings.language||'de';
  applyTheme();
  if(languageChanged){renderPreservingInputs();return;}
  if (!dirty && changed && (!quick || !root.children.length)) render();
}
function brand() {
  return `<div class="brand" aria-label="Machen"><span class="mark" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none"><path d="M6 24V8l10 10L26 8v9"/><path d="m18 22 3.2 3L28 18"/></svg></span></div>`;
}
function nav(name, label) {
  const updateDot = name === 'settings' ? '<span class="notification-dot" data-settings-update-dot hidden aria-hidden="true"></span>' : '';
  return `<button class="nav ${view === name ? 'active' : ''}" data-view="${name}">${icon(name)}<span>${label}</span>${updateDot}${name === 'today' ? `<span class="count">${state.tasks.filter(t => !t.done && (t.scheduled || t.created || '') <= localDay()).length}</span>` : ''}</button>`;
}
function sidebarCollection(kind, label, items) {
  const selectedValue = kind === 'project' ? project : context;
  const active = kind === 'project' ? view === 'project' : view === 'context';
  const empty = kind === 'project' ? tr("Noch keine Projekte") : tr("Noch keine Kontexte");
  const chip = kind === 'project' ? projectChip : contextChip;
  const attr = kind === 'project' ? 'data-project' : 'data-context';
  return `<section class="sidebar-collection"><p class="collection-label">${label}</p><div class="sidebar-list-items">${items.length ? items.map(item => `<button class="project ${kind} ${active && selectedValue === item ? 'active' : ''}" ${attr}="${escapeHtml(item)}">${chip(item)}</button>`).join('') : `<small class="project muted">${empty}</small>`}</div></section>`;
}
function week() {
  const current = new Date(day + 'T12:00:00');
  const start = new Date(current);
  start.setDate(start.getDate() - (start.getDay() + 6) % 7);
  return '<div class="week">' + Array.from({
    length: 7
  }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const v = localDay(d);
    return `<button class="day ${v === day ? 'selected' : ''} ${v === localDay() ? 'today' : ''}" data-day="${v}" aria-label="${dateLabel(v)}" ${v === day ? 'aria-current="date"' : ''}>${d.toLocaleDateString(locale(), {
      weekday: 'short'
    })}<b>${d.getDate()}</b></button>`;
  }).join('') + '</div>';
}
function sortTasks(tasks) {
  const priorityRank = task => task.priority ? task.priority.charCodeAt(0) : 91;
  return [...tasks].sort((a, b) => priorityRank(a) - priorityRank(b) || (a.due || '9999-12-31').localeCompare(b.due || '9999-12-31') || (a.dueTime || '99:99').localeCompare(b.dueTime || '99:99') || b.created.localeCompare(a.created));
}
function priorityTone(priority) {
  if (/^[A-F]$/.test(priority)) return priority;
  return 'standard';
}
function reminderDateLabel(value) {
  return new Date(value).toLocaleString(locale(), {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'});
}
function row(t) {
  const projects = taskProjects(t.title), contexts = taskContexts(t.title), subtasks = Array.isArray(t.subtasks) ? t.subtasks : [];
  const meta = [
    t.due ? `${tr("Fällig ")}${dateLabel(t.due)}${t.dueTime ? `, ${escapeHtml(t.dueTime)}` : ''}` : '',
    t.snoozedUntil ? `${tr("Erinnerung ")}${reminderDateLabel(t.snoozedUntil)}` : '',
    subtasks.length ? tr("{done}/{count} Unteraufgaben", {done: subtasks.filter(item => item.done).length, count: subtasks.length}) : '',
    t.notes ? tr("Notiz") : '',
    t.files?.length ? tr(t.files.length === 1 ? "Ein Anhang" : "{count} Anhänge", {count: t.files.length}) : ''
  ].filter(Boolean);
  return `<div class="task ${t.done ? 'done' : ''}" data-task-id="${escapeHtml(t.id)}"><button class="check ${t.done ? 'done' : ''}" data-toggle="${escapeHtml(t.id)}" aria-label="${t.done ? tr("Wieder öffnen") : tr("Abschließen")}: ${escapeHtml(displayTitle(t.title))}">${t.done ? icon('check') : ''}</button><button class="task-body" data-select="${escapeHtml(t.id)}"><span class="task-title">${escapeHtml(displayTitle(t.title))}</span>${projects.length || contexts.length ? `<span class="task-projects">${projects.map(p => projectChip(p)).join('')}${contexts.map(p => contextChip(p)).join('')}</span>` : ''}${meta.length ? `<span class="task-meta">${meta.map(item => `<span>${item}</span>`).join('')}</span>` : ''}</button></div>`;
}
function group(title, tasks, empty = '') {
  if (!tasks.length && !empty) return '';
  return `<section class="group"><div class="group-header"><h2>${title}</h2><span>${tasks.length}</span></div>${tasks.length ? tasks.map(row).join('') : empty ? `<p class="empty">${empty}</p>` : ''}</section>`;
}
function priorityGroups(title, tasks, empty = '') {
  if (!tasks.some(task => task.priority)) return group(title, tasks, empty);
  const priorities = [...new Set(tasks.filter(task => task.priority).map(task => task.priority))].sort();
  const buckets = [...priorities, ''].map(priority => [priority, tasks.filter(task => (task.priority || '') === priority)]).filter(([, items]) => items.length);
  return `<section class="task-groups"><div class="group-header"><h2>${title}</h2><span>${tasks.length}</span></div><div class="priority-groups">${buckets.map(([priority, items]) => `<section class="group priority-group"><div class="group-header"><h2>${priority ? `${tr("Priorität")} <span class="priority" data-priority="${priorityTone(priority)}">${priority}</span>` : tr("Ohne Priorität")}</h2><span>${items.length}</span></div>${items.map(row).join('')}</section>`).join('')}</div></section>`;
}
function settingsContent() {
  const tab = (name, label) => `<button type="button" role="tab" data-settings-tab="${name}" aria-selected="${settingsTab === name}" tabindex="${settingsTab === name ? 0 : -1}">${label}${name === 'app' ? '<span class="notification-dot" data-updates-tab-dot hidden aria-hidden="true"></span>' : ''}</button>`;
  const pane = (name, content) => `<section class="settings-pane" role="tabpanel" ${settingsTab === name ? '' : 'hidden'}>${content}</section>`;
  const general = `<h2>${tr("Deine Ablage")}</h2><p>${tr("Aufgaben, Notizen und Anhänge bleiben in deinem Ordner.")}</p><span class="path">${escapeHtml(state.settings.directory)}</span><button type="button" class="primary" data-action="chooseDirectory">${tr("Ordner wechseln")}</button><button type="button" data-action="folder">${tr("Ordner öffnen")}</button><p class="hint">${tr("Ein Wechsel öffnet die Aufgaben des neuen Ordners. Deine bisherigen Daten bleiben am bisherigen Ort. Zum Umziehen den gesamten Ordner inklusive Begleitdateien kopieren.")}</p>${languagePicker()}<h2>${tr("Erscheinungsbild")}</h2><p>${tr("Wähle Hell, Dunkel oder die Einstellung deines Systems.")}</p>${themePicker()}<h2>${tr("Akzentfarbe")}</h2><p>${tr("Gilt für Schaltflächen, Auswahl und Hervorhebungen.")}</p>${palettePicker()}`;
  const sidebar = `<h2>${tr("Seitenleiste")}</h2><p>${tr("Wähle, welche Sammlungen links sichtbar sind.")}</p>${settingsSwitch('showProjects', state.settings.showProjects, tr("Projekte in der Seitenleiste anzeigen"))}${settingsSwitch('showContexts', state.settings.showContexts, tr("Kontexte in der Seitenleiste anzeigen"))}`;
  const reminderLead = state.settings.reminderLeadMinutes ?? 60;
  const reminders = `<h2>${tr("Fälligkeitserinnerungen")}</h2><p>${tr("Erhalte eine dezente Benachrichtigung für überfällige und heute fällige Aufgaben.")}</p>${settingsSwitch('remindersEnabled', state.settings.remindersEnabled, tr("Fälligkeitserinnerungen aktivieren"))}<div class="reminder-options" ${state.settings.remindersEnabled ? '' : 'hidden'}><label for="reminder-time">${tr("Aufgaben ohne Uhrzeit")}</label>${reminderTimePicker(state.settings.reminderTime || '09:00')}<p class="hint">${tr("Tägliche Erinnerung für fällige Aufgaben ohne konkrete Uhrzeit.")}</p><label for="reminder-lead">${tr("Aufgaben mit Uhrzeit")}</label><select id="reminder-lead" name="reminderLeadMinutes" aria-label="${tr("Erinnerung vor Termin")}">${[[0, "Zur Fälligkeit"], [15, "15 Minuten vorher"], [30, "30 Minuten vorher"], [60, "1 Stunde vorher"], [1440, "1 Tag vorher"]].map(([value, label]) => `<option value="${value}" ${reminderLead === value ? 'selected' : ''}>${tr(label)}</option>`).join('')}</select><p class="hint">${tr("Benachrichtigt relativ zur Uhrzeit der Aufgabe.")}</p></div>`;
  const capture = `<h2>${tr("Schnellerfassung")}</h2><p>${tr("Funktioniert auch, wenn Machen im Hintergrund läuft.")}</p><label for="shortcut">${tr("Globaler Shortcut")}</label><div class="shortcut-recorder"><input id="shortcut" name="shortcut" type="text" value="${escapeHtml(state.settings.shortcut)}" readonly required><button type="button" data-action="recordShortcut" aria-pressed="false">${tr("Shortcut ändern")}</button></div><p class="hint">${tr("Zum Beispiel CommandOrControl+Shift+Space oder Alt+Shift+T.")} <span id="shortcut-capture-status" aria-live="polite"></span></p>${settingsSwitch('autoStart', state.settings.autoStart, tr("Bei der Anmeldung starten (Windows / macOS)"))}`;
  const organization = `${sidebar}${pinSettings()}`;
  const app = `${capture}<section data-update-settings></section><section class="reset-app"><h2>${tr('Machen zurücksetzen')}</h2><p>${tr('Setzt alle App-Einstellungen zurück und startet die Einrichtung erneut. Deine Aufgabenordner bleiben unverändert.')}</p><button type="button" class="danger-button" data-action="resetApp">${tr('Machen zurücksetzen')}</button></section>`;
  return `<div class="settings"><div class="settings-heading"><h1>${tr("Einstellungen")}</h1></div><div class="settings-tabs" role="tablist" aria-label="${tr("Einstellungen")}">${tab('general', tr("Allgemein"))}${tab('organization', tr("Organisation"))}${tab('reminders', tr("Erinnerungen"))}${tab('app', tr("App"))}</div><form id="settings-form">${pane('general', general)}${pane('organization', organization)}${pane('reminders', reminders)}${pane('app', app)}</form></div>`;
}
function settingsSwitch(name, checked, label) {
  return `<label class="settings-switch"><input type="checkbox" name="${name}" ${checked ? 'checked' : ''}><span class="switch-track" aria-hidden="true"></span><span>${label}</span></label>`;
}
function reminderTimePicker(value) {
  return timePickerFields('reminder', value, false, 'reminder-time');
}
function taskDueTimePicker(value = '', id = 'due-time') {
  return timePickerFields('due', value, true, id);
}
function timePickerFields(prefix, value, optional, id) {
  const valid = /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  const [hour, minute] = valid ? value.split(':') : ['', '00'];
  const options = (count, selected, includeEmpty = false) => `${includeEmpty ? '<option value="">—</option>' : ''}${Array.from({length: count}, (_, number) => String(number).padStart(2, '0')).map(option => `<option value="${option}" ${option === selected ? 'selected' : ''}>${option}</option>`).join('')}`;
  return `<div class="reminder-time-fields task-time-fields" role="group" aria-label="${tr('Uhrzeit')}"><select id="${id}" name="${prefix}Hour" aria-label="${tr('Stunden')}">${options(24, hour, optional)}</select><span aria-hidden="true">:</span><select name="${prefix}Minute" aria-label="${tr('Minuten')}">${options(60, minute)}</select></div>`;
}
function rangeProgress(value, min, max) {
  return Math.round((Number(value) - Number(min)) / (Number(max) - Number(min)) * 100);
}
function paintRanges(scope = document) {
  scope.querySelectorAll('.range-control input[type=range]').forEach(input => {
    input.closest('.range-control')?.style.setProperty('--range-progress', `${rangeProgress(input.value, input.min, input.max)}%`);
  });
}
function pinSettings() {
  const s = state.settings;
  const slider = (id, name, min, max, step, value) => `<span class="range-control"><input id="${id}" name="${name}" type="range" min="${min}" max="${max}" step="${step}" value="${value}"></span>`;
  return `<h2>${tr("Angeheftete Aufgaben")}</h2><p>${tr("Eine kompakte Liste bleibt vor allen Fenstern sichtbar.")}</p>${settingsSwitch('pinEnabled', s.pinEnabled, tr("Angeheftete Aufgaben anzeigen"))}<div class="pin-options" ${s.pinEnabled ? '' : 'hidden'}><p class="hint">${tr("Ziehe die angeheftete Liste an die gewünschte Stelle. Ihre Position wird gespeichert.")}</p><label for="pin-opacity">${tr("Deckkraft")}: <output data-pin-opacity>${Math.round(s.pinOpacity * 100)}%</output></label>${slider('pin-opacity', 'pinOpacity', .35, 1, .05, s.pinOpacity)}<label for="pin-scale">${tr("Größe")}: <output data-pin-scale>${Math.round(s.pinScale * 100)}%</output></label>${slider('pin-scale', 'pinScale', .75, 1.5, .05, s.pinScale)}<button type="button" data-action="resetPinSettings">${tr("Zurücksetzen")}</button></div>`;
}
function pinnedContent() {
  const tasks = sortTasks(state.tasks.filter(t => !t.done && (t.scheduled || t.created || '') <= localDay()));
  const collapsed = state.settings.pinCollapsed;
  return `<main class="pinned ${collapsed ? 'collapsed' : ''}"><header class="pinned-head"><span>${tr("Heute")}</span><span class="pinned-actions"><button class="icon" data-action="togglePinCollapsed" aria-label="${tr(collapsed ? "Angeheftete Aufgaben ausklappen" : "Angeheftete Aufgaben einklappen")}" title="${tr(collapsed ? "Angeheftete Aufgaben ausklappen" : "Angeheftete Aufgaben einklappen")}">${icon(collapsed ? 'plus' : 'minimize')}</button><button class="icon" data-action="hidePin" aria-label="${tr("Angeheftete Aufgaben ausblenden")}">${icon('close')}</button></span></header>${collapsed ? '' : `<div class="pinned-list">${tasks.length ? tasks.map(t => row(t).replace('data-select=', 'data-pinned-select=')).join('') : `<p class="empty">${tr("Keine offenen Aufgaben für heute.")}</p>`}</div>`}</main>`;
}
function tomorrow() {
  const value = new Date();
  value.setDate(value.getDate() + 1);
  return localDay(value);
}
function contextMenuMarkup() {
  if (!contextMenu) return '';
  const {type, value} = contextMenu;
  if (type === 'task') {
    const task = allTasks().find(item => item.id === value);
    if (!task) return '';
    return `<div class="context-menu" role="menu" aria-label="${tr("Aufgabenaktionen")}"><button type="button" role="menuitem" data-context-action="open">${tr("Öffnen")}</button><button type="button" role="menuitem" data-context-action="toggle">${task.done ? tr("Wieder öffnen") : tr("Als erledigt markieren")}</button><div class="context-menu-divider"></div><button type="button" role="menuitem" data-context-action="plan-today">${tr("Für heute einplanen")}</button><button type="button" role="menuitem" data-context-action="plan-tomorrow">${tr("Für morgen einplanen")}</button><div class="context-menu-divider"></div><button type="button" role="menuitem" class="danger" data-context-action="delete">${tr("Löschen")}</button></div>`;
  }
  const label = type === 'project' ? `+${value}` : `@${value}`;
  return `<div class="context-menu" role="menu" aria-label="${tr("Aktionen für {name}", {name: label})}"><button type="button" role="menuitem" data-context-action="open">${tr("Öffnen")}</button><button type="button" role="menuitem" data-context-action="new">${tr("Neue Aufgabe in {name}", {name: label})}</button></div>`;
}
function showContextMenu(x, y) {
  document.querySelector('.context-menu')?.remove();
  root.insertAdjacentHTML('beforeend', contextMenuMarkup());
  const menu = document.querySelector('.context-menu');
  if (!menu) return;
  menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - menu.offsetWidth - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - menu.offsetHeight - 8))}px`;
}
function content() {
  if (view === 'settings') return settingsContent();
  const title = view === 'archive' ? tr("Archiv") : view === 'history' ? tr("Verlauf") : view === 'all' ? tr("Alle Aufgaben") : view === 'project' ? project : view === 'context' ? '@' + context : day === localDay() ? tr("Heute") : dateLabel(day);
  let html = `<div class="topline"><h1>${escapeHtml(title)}</h1><button class="icon" data-action="search" aria-label="${tr("Aufgaben durchsuchen")}">${icon('search')}</button></div><p class="date-caption">${view === 'today' ? new Date(day + 'T12:00:00').toLocaleDateString(locale(), {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  }) : view === 'history' ? tr("Was hinzugekommen ist. Was geschafft ist.") : ''}</p>`;
  if (view === 'today' || view === 'history') html += `<div class="date-navigation"><div class="history-picker"><button class="icon" data-step="-7" aria-label="${tr("Vorherige Woche")}">${icon('left')}</button><input type="date" id="jump-date" aria-label="${tr("Tag auswählen")}" value="${day}"><button class="icon" data-step="7" aria-label="${tr("Nächste Woche")}">${icon('right')}</button><button data-action="today">${tr("Heute")}</button></div>${week()}</div>`;
  if (query !== null && query !== '') html += `<input class="search" id="search" placeholder="${tr("Aufgaben durchsuchen …")}" value="${escapeHtml(query === ' ' ? '' : query)}" aria-label="${tr("Aufgaben durchsuchen")}">`;
  if (view === 'history') {
    let events = state.events.filter(e => e.day === day);
    for (const t of allTasks()) {
      if (t.created === day && !state.events.some(e => e.taskId === t.id && e.type === 'create')) events.push({
        taskId: t.id,
        title: t.title,
        day,
        type: 'create',
        at: ''
      });
      if (t.completed === day && !state.events.some(e => e.taskId === t.id && e.type === 'completed')) events.push({
        taskId: t.id,
        title: t.title,
        day,
        type: 'completed',
        at: ''
      });
    }
    const labels = {
      create: tr("Hinzugefügt"),
      completed: tr("Abgeschlossen"),
      reopened: tr("Wieder geöffnet"),
      edit: tr("Bearbeitet"),
      delete: tr("Gelöscht"),
      archive: tr("Archiviert"),
      restore: tr("Zurückgeholt")
    };
    events = events.filter(searchMatches).sort((a, b) => b.at.localeCompare(a.at));
    html += events.length ? events.map(e => `<div class="event"><time>${e.at ? new Date(e.at).toLocaleTimeString(locale(), {
      hour: '2-digit',
      minute: '2-digit'
    }) : '—'}</time><div>${escapeHtml(displayTitle(e.title))}${taskProjects(e.title).map(p => projectChip(p)).join('')}${taskContexts(e.title).map(p => contextChip(p)).join('')}<small>${labels[e.type] || e.type}</small></div></div>`).join('') : `<p class="empty"><strong>${tr("Ein Tag ohne Einträge.")}</strong>${tr("Hier erscheinen neu erfasste und abgeschlossene Aufgaben dieses Tages.")}</p>`;
    return html;
  }
  html += filterBar();
  if (view !== 'archive') html += createComposer();
  if (view !== 'archive' && state.tasks.some(t => t.done)) html += '<div class="archive-actions"><button data-action="archiveCompleted">' + icon('archive') + ` ${tr("Alle erledigten archivieren")}</button></div>`;
  let tasks = sortTasks((view === 'archive' ? state.archived || [] : state.tasks).filter(t => searchMatches(t) && matchesFilters(t) && (!project || view !== 'project' || taskProjects(t.title).includes(project)) && (!context || view !== 'context' || taskContexts(t.title).includes(context))));
  if (view === 'archive') return html + group(tr("Archivierte Aufgaben"), tasks, hasFilters() ? tr("Keine archivierten Aufgaben passen zu den Filtern.") : tr("Noch keine archivierten Aufgaben."));
  if (!tasks.length && hasFilters()) return html + `<p class="empty">${tr("Keine Aufgaben passen zu diesen Filtern.")}</p>`;
  if (view === 'today') {
    html += priorityGroups(tr("Offen von vorher"), tasks.filter(t => !t.done && (!(t.scheduled || t.created) || (t.scheduled || t.created) < day)));
    html += priorityGroups(day === localDay() ? tr("Für heute") : tr("Für diesen Tag"), tasks.filter(t => !t.done && (t.scheduled || t.created) === day), tr("Noch nichts auf dem Zettel. Erfasse deine erste Aufgabe oben."));
    html += group(tr("Erledigt"), tasks.filter(t => t.done && t.completed === day));
  } else {
    html += priorityGroups(tr("Offen"), tasks.filter(t => !t.done), tr("Keine offenen Aufgaben.")) + group(tr("Erledigt"), tasks.filter(t => t.done));
  }
  return html;
}
function subtaskRow(item) {
  return `<div class="subtask-row" data-subtask-id="${escapeHtml(item.id)}"><label class="subtask-check"><input type="checkbox" aria-label="${tr("Unteraufgabe erledigt")}" ${item.done ? 'checked' : ''}><span aria-hidden="true">${icon('check')}</span></label><input type="text" value="${escapeHtml(item.title)}" maxlength="500" aria-label="${tr("Unteraufgabe")}"><button type="button" class="icon" data-action="removeSubtask" aria-label="${tr("Unteraufgabe entfernen")}">${icon('close')}</button></div>`;
}
function subtaskEditor(task) {
  const subtasks = Array.isArray(task.subtasks) ? task.subtasks : [];
  return `<section class="subtask-editor"><div class="panel-section-heading"><span>${tr("Unteraufgaben")}</span>${subtasks.length ? `<small>${subtasks.filter(item => item.done).length}/${subtasks.length}</small>` : ''}</div><div class="subtask-list">${subtasks.map(subtaskRow).join('')}</div><div class="subtask-add"><input id="new-subtask" type="text" maxlength="500" placeholder="${tr("Unteraufgabe hinzufügen …")}" aria-label="${tr("Neue Unteraufgabe")}"><button type="button" data-action="addSubtask">${tr("Hinzufügen")}</button></div></section>`;
}
function updateSubtaskCount() {
  const editor = document.querySelector('.subtask-editor');
  if (!editor) return;
  const rows = [...editor.querySelectorAll('[data-subtask-id]')], done = rows.filter(row => row.querySelector('input[type=checkbox]').checked).length;
  let count = editor.querySelector('.panel-section-heading small');
  if (!count && rows.length) { count = document.createElement('small'); editor.querySelector('.panel-section-heading').append(count); }
  if (count) count.textContent = rows.length ? `${done}/${rows.length}` : '';
}
function addSubtaskFromInput() {
  const input = document.querySelector('#new-subtask'), title = input?.value.trim();
  if (!input || !title) return;
  document.querySelector('.subtask-list')?.insertAdjacentHTML('beforeend', subtaskRow({id: crypto.randomUUID(), title, done: false}));
  input.value = ''; dirty = true; updateSubtaskCount(); input.focus();
}
function panel() {
  const t = allTasks().find(t => t.id === selected);
  if (!t) return '';
  return `<dialog class="task-dialog" aria-labelledby="task-dialog-title"><div class="task-dialog-head"><h2 id="task-dialog-title">${tr("Aufgabendetails")}</h2><button class="icon" data-action="closePanel" aria-label="${tr("Details schließen")}">${icon('close')}</button></div><form id="detail-form"><div class="task-dialog-body"><div class="task-dialog-column"><label for="detail-title">${tr("Aufgabe")}</label><textarea class="title-edit" id="detail-title" name="title" required maxlength="2000">${escapeHtml(displayTitle(t.title))}</textarea>${projectPicker('edit', taskProjects(t.title))}${contextPicker('edit-context', taskContexts(t.title))}${subtaskEditor(t)}</div><div class="task-dialog-column"><div class="fields task-due-fields"><div><label for="due">${tr("Fällig am")}</label><input id="due" type="date" name="due" value="${t.due}"></div><div><label for="due-time">${tr("Uhrzeit")}</label>${taskDueTimePicker(t.dueTime || '')}</div></div><label for="priority">${tr("Priorität")}</label><select id="priority" name="priority"><option value="">${tr("Keine")}</option>${Array.from({
    length: 26
  }, (_, i) => String.fromCharCode(65 + i)).map(p => `<option ${t.priority === p ? 'selected' : ''}>${p}</option>`).join('')}</select><label for="notes">${tr("Notizen & E-Mail-Kontext")}</label><textarea name="notes" id="notes" placeholder="${tr("Weitere Infos, E-Mail-Text oder einen Link hier ablegen …")}">${escapeHtml(t.notes || '')}</textarea><label>${tr("Anhänge")}</label>${(t.files || []).map(f => `<button type="button" class="file" data-file="${escapeHtml(f.id)}">${icon('file')} ${escapeHtml(f.name)}</button>`).join('')}<button type="button" data-action="attach">${icon('file')} ${tr("Datei oder E-Mail")}</button><div class="archive-actions">${t.archived ? `<button type="button" data-action="restore">${tr("In Aufgaben zurückholen")}</button>` : t.done ? `<button type="button" data-action="archive">${tr("Archivieren")}</button>` : ''}</div></div></div><div class="task-dialog-footer"><button type="button" class="danger" data-action="delete">${tr("Löschen")}</button><div class="panel-actions"><button type="button" data-action="closePanel">${tr("Abbrechen")}</button><button type="submit" class="primary">${tr("Speichern")}</button></div></div></form></dialog>`;
}
async function closeTaskDialog() {
  if (!(await discard())) return;
  selected = null;
  render();
}
function activateTaskDialog() {
  const dialog = document.querySelector('.task-dialog');
  if (!dialog || dialog.open) return;
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    if (pendingDialog) return;
    void closeTaskDialog();
  });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog || pendingDialog) return;
    void closeTaskDialog();
  });
  dialog.showModal();
}
function render() {
  closeControl();
  contextMenu = null;
  document.querySelector('.context-menu')?.remove();
  const draft = captureComposer();
  if (pinned) {
    document.body.classList.add('pinned-window');
    root.innerHTML = pinnedContent();
    syncPinnedSize();
    return;
  }
  if (quick) {
    document.body.classList.add('quick-window');
    root.innerHTML = `<main class="quick">${createComposer(true)}</main>`;
    restoreComposer(draft);
    enhanceControls();
    quickSizeObserver?.disconnect();
    quickSizeObserver = new ResizeObserver(syncQuickHeight);
    quickSizeObserver.observe(document.querySelector('#composer-details'));
    paintUpdates();
    return;
  }
  if (!state.configured) {
    root.innerHTML = setupContent();
    enhanceControls();
    paintUpdates();
    return;
  }
  const projects = openProjects(), contexts = openContexts();
  const collections = `${state.settings.showProjects ? sidebarCollection('project', tr("Projekte"), projects) : ''}${state.settings.showContexts ? sidebarCollection('context', tr("Kontexte"), contexts) : ''}`;
  root.innerHTML = `<div class="shell"><nav class="sidebar" aria-label="${tr("Hauptnavigation")}"><div class="sidebar-navigation"><section class="sidebar-section">${nav('today', tr("Heute"))}${nav('all', tr("Alle Aufgaben"))}</section><section class="sidebar-section sidebar-secondary">${nav('history', tr("Verlauf"))}${nav('archive', tr("Archiv"))}</section></div><div class="sidebar-lists">${collections ? `<section class="sidebar-collections"><p class="projects">${tr("Sammlungen")}</p>${collections}</section>` : ''}</div><div class="bottom">${nav('settings', tr("Einstellungen"))}</div></nav><main class="workspace">${state.shortcutError ? `<p class="error-banner">${escapeHtml(tr(state.shortcutError))}</p>` : ''}<div class="workspace-content">${content()}</div></main>${panel()}</div>`;
  paintRanges(root);
  restoreComposer(draft);
  enhanceControls();
  paintUpdates();
  activateTaskDialog();
}
async function discard() {
  if (!dirty) return true;
  if (await askInApp(tr("Änderungen verwerfen?"), tr("Deine ungespeicherten Änderungen werden verworfen."))) {
    dirty = false;
    return true;
  }
  return false;
}
function commandPaletteOptions(value = '') {
  const needle = value.trim().toLocaleLowerCase(locale());
  const commands = [
    {label: tr('Neue Aufgabe'), detail: tr('Aufgabe erfassen'), run: async () => {
      if (!(await discard())) return false;
      view = 'today'; selected = null; project = ''; context = ''; query = ''; render();
      requestAnimationFrame(() => document.querySelector('#composer input[name=title]')?.focus());
    }},
    {label: tr('Heute'), detail: tr('Heute anzeigen'), run: async () => {
      if (!(await discard())) return false;
      view = 'today'; selected = null; project = ''; context = ''; query = ''; day = localDay(); render();
    }},
    {label: tr('Alle Aufgaben'), detail: tr('Alle Aufgaben anzeigen'), run: async () => {
      if (!(await discard())) return false;
      view = 'all'; selected = null; project = ''; context = ''; query = ''; render();
    }},
    {label: tr('Einstellungen'), detail: tr('Einstellungen öffnen'), run: async () => {
      if (!(await discard())) return false;
      view = 'settings'; selected = null; project = ''; context = ''; query = ''; render();
    }}
  ];
  const matches = text => !needle || text.toLocaleLowerCase(locale()).includes(needle);
  const taskOptions = allTasks().filter(task => matches(`${displayTitle(task.title)} ${task.notes || ''} ${taskProjects(task.title).join(' ')} ${taskContexts(task.title).join(' ')}`)).slice(0, 7).map(task => ({
    label: displayTitle(task.title), detail: task.archived ? tr('Archiv') : tr('Aufgabe'), run: async () => {
      if (!(await discard())) return false;
      view = task.archived ? 'archive' : 'all'; selected = task.id; project = ''; context = ''; query = ''; render();
    }
  }));
  return [...commands.filter(command => matches(`${command.label} ${command.detail}`)), ...taskOptions];
}
function openCommandPalette() {
  if (quick || pinned || commandPalette || !state?.configured) return;
  const dialog = document.createElement('dialog');
  dialog.className = 'command-palette';
  dialog.innerHTML = `<div class="command-palette-head"><span>${tr('Befehlspalette')}</span><kbd>Esc</kbd></div><input class="command-palette-input" type="search" autocomplete="off" placeholder="${tr('Aufgaben und Aktionen durchsuchen …')}" aria-label="${tr('Befehlspalette')}"><div class="command-palette-results" role="listbox" aria-label="${tr('Befehlspalette')}"></div>`;
  document.body.append(dialog);
  commandPalette = dialog;
  const input = dialog.querySelector('input');
  const list = dialog.querySelector('.command-palette-results');
  let options = [], index = 0;
  const paint = () => {
    options = commandPaletteOptions(input.value);
    index = Math.max(0, Math.min(index, options.length - 1));
    list.innerHTML = options.length ? options.map((option, optionIndex) => `<button type="button" role="option" aria-selected="${optionIndex === index}" data-command-option="${optionIndex}"><span>${escapeHtml(option.label)}</span><small>${escapeHtml(option.detail)}</small></button>`).join('') : `<p class="command-palette-empty">${tr('Keine Ergebnisse.')}</p>`;
  };
  const execute = async selectedIndex => {
    const option = options[selectedIndex];
    if (!option) return;
    const result = await option.run();
    if (result !== false) dialog.close();
  };
  input.addEventListener('input', () => { index = 0; paint(); });
  list.addEventListener('click', event => {
    const option = event.target.closest('[data-command-option]');
    if (option) execute(Number(option.dataset.commandOption));
  });
  dialog.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); event.stopPropagation();
      if (options.length) { index = (index + (event.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length; paint(); }
    } else if (event.key === 'Enter') {
      event.preventDefault(); event.stopPropagation(); execute(index);
    } else if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation(); dialog.close();
    }
  });
  dialog.addEventListener('close', () => { dialog.remove(); commandPalette = null; });
  paint();
  dialog.showModal();
  input.focus();
}
root.addEventListener('input', e => {
  if (e.target.matches('.settings input[type=range]')) {
    e.target.closest('.range-control')?.style.setProperty('--range-progress', `${rangeProgress(e.target.value, e.target.min, e.target.max)}%`);
    const output = document.querySelector(`[data-pin-${e.target.name === 'pinOpacity' ? 'opacity' : 'scale'}]`);
    if (output) output.textContent = `${Math.round(Number(e.target.value) * 100)}%`;
  }
  if (e.target.closest('#detail-form')) dirty = true;
  if (e.target.id === 'search') {
    query = e.target.value;
    const pos = e.target.selectionStart;
    render();
    const input = document.querySelector('#search');
    if (input) {
      input.focus();
      input.setSelectionRange(pos, pos);
    }
  }
});
root.addEventListener('change', async e => {
  if (e.target.closest('.subtask-editor')) updateSubtaskCount();
  if (e.target.name === 'pinEnabled') {
    try { await call('pinEnabled', {enabled: e.target.checked}); } catch (err) { toast(err.message); }
    return;
  }
  if (['pinOpacity', 'pinScale'].includes(e.target.name)) {
    try {
      const data = Object.fromEntries(new FormData(document.querySelector('#settings-form')));
      await call('pinSettings', {opacity: data.pinOpacity, scale: data.pinScale});
    } catch (err) { toast(err.message); }
    return;
  }
  if (['remindersEnabled', 'reminderHour', 'reminderMinute', 'reminderLeadMinutes'].includes(e.target.name)) {
    try {
      const hour = document.querySelector('select[name=reminderHour]')?.value || '09';
      const minute = document.querySelector('select[name=reminderMinute]')?.value || '00';
      const time = `${hour}:${minute}`;
      const leadMinutes = Number(document.querySelector('select[name=reminderLeadMinutes]')?.value ?? 60);
      await call('reminderSettings', {enabled: document.querySelector('input[name=remindersEnabled]')?.checked || false, time, leadMinutes});
    } catch (err) {
      toast(err.message);
    }
    return;
  }
  if (e.target.closest('#settings-form') && ['showProjects', 'showContexts', 'autoStart'].includes(e.target.name)) {
    try {
      await saveSettingsForm();
    } catch (err) {
      toast(err.message);
    }
    return;
  }
  if (e.target.id === 'jump-date' && e.target.value) {
    day = e.target.value;
    render();
  }
});
root.addEventListener('contextmenu', e => {
  const task = e.target.closest('.task');
  const projectButton = e.target.closest('[data-project]');
  const contextButton = e.target.closest('[data-context]');
  if (!task && !projectButton && !contextButton) return;
  e.preventDefault();
  contextMenu = task ? {type: 'task', value: task.querySelector('[data-select]')?.dataset.select, x: e.clientX, y: e.clientY} : projectButton ? {type: 'project', value: projectButton.dataset.project, x: e.clientX, y: e.clientY} : {type: 'context', value: contextButton.dataset.context, x: e.clientX, y: e.clientY};
  showContextMenu(e.clientX, e.clientY);
});
async function runContextAction(action) {
  const menu = contextMenu;
  contextMenu = null;
  if (!menu) return;
  if (menu.type !== 'task') {
    project = menu.type === 'project' ? menu.value : '';
    context = menu.type === 'context' ? menu.value : '';
    view = menu.type;
    selected = null;
    render();
    if (action === 'new') requestAnimationFrame(() => document.querySelector('#composer input[name=title]')?.focus());
    return;
  }
  const task = allTasks().find(item => item.id === menu.value);
  if (!task) return;
  if (action === 'open') {
    selected = task.id;
    render();
  } else if (action === 'toggle') {
    await call('toggle', {id: task.id});
    await refresh();
  } else if (action === 'plan-today' || action === 'plan-tomorrow') {
    await call('edit', {id: task.id, title: task.title, priority: task.priority, due: task.due, dueTime: task.dueTime, scheduled: action === 'plan-today' ? localDay() : tomorrow()});
    await refresh();
  } else if (action === 'delete' && await askInApp(tr("Aufgabe löschen?"), displayTitle(task.title) + tr(" wird gelöscht. Der Verlauf bleibt erhalten."), tr("Löschen"))) {
    await call('delete', {id: task.id});
    await refresh();
  }
}
root.addEventListener('click', async e => {
  if (e.button !== 0) return;
  const b = e.target.closest('button');
  if (!b) return;
  try {
    if (b.dataset.contextAction) {
      await runContextAction(b.dataset.contextAction);
      return;
    }
    if (b.dataset.pinnedSelect) {
      await call('openPinnedTask', {id: b.dataset.pinnedSelect});
      return;
    }
    if (b.dataset.settingsTab) {
      settingsTab = b.dataset.settingsTab;
      render();
      return;
    }
    if (b.dataset.view) {
      if (!(await discard())) return;
      view = b.dataset.view;
      selected = null;
      query = '';
      project = '';
      context = '';
      day = localDay();
      render();
    }
    if (b.dataset.project) {
      if (!(await discard())) return;
      project = b.dataset.project;
      context = '';
      view = 'project';
      selected = null;
      render();
    }
    if (b.dataset.context) {
      if (!(await discard())) return;
      context = b.dataset.context;
      project = '';
      view = 'context';
      selected = null;
      render();
    }
    if (b.dataset.day) {
      day = b.dataset.day;
      render();
    }
    if (b.dataset.step) {
      const d = new Date(day + 'T12:00:00');
      d.setDate(d.getDate() + Number(b.dataset.step));
      day = localDay(d);
      render();
    }
    if (b.dataset.select) {
      if (!(await discard())) return;
      selected = b.dataset.select;
      render();
    }
    if (b.dataset.toggle) {
      await call('toggle', {
        id: b.dataset.toggle
      });
      await refresh();
    }
    if (b.dataset.file) await call('openAttachment', {
      id: selected,
      fileId: b.dataset.file
    });
    if (b.dataset.theme) {
      await call('theme', {
        theme: b.dataset.theme
      });
      state.settings.theme = b.dataset.theme;
      applyTheme();
    }
    if (b.dataset.palette) {
      await call('accent', {accent: b.dataset.palette});
      state.settings.accent = b.dataset.palette;
      applyTheme();
    }
    const a = b.dataset.action;
    if (a === 'setupNext') { setupStep = Math.min(3, setupStep + 1); render(); }
    else if (a === 'setupBack') { setupStep = Math.max(0, setupStep - 1); render(); }
    else if (a === 'resetApp') {
      if (!await askInApp(tr('Machen zurücksetzen?'), tr('Alle App-Einstellungen werden zurückgesetzt und die Einrichtung beginnt erneut. Deine Aufgabenordner werden nicht gelöscht.'), tr('Jetzt zurücksetzen'))) return;
      await call('resetApp');
      state = await call('state');
      selected = null;
      view = 'today';
      setupStep = 0;
      render();
    }
    else if(a==='updates'){if(!(await discard()))return;view='settings';settingsTab='app';selected=null;project='';context='';render();}
    else if (a === 'addSubtask') {
      addSubtaskFromInput();
    } else if (a === 'removeSubtask') {
      b.closest('[data-subtask-id]')?.remove(); dirty = true; updateSubtaskCount();
    } else if (a === 'recordShortcut') {
      recordingShortcut = true;
      b.setAttribute('aria-pressed', 'true');
      b.textContent = tr("Tastenkombination drücken");
      document.querySelector('#shortcut-capture-status').textContent = tr("Drücke die gewünschte Tastenkombination.");
      document.querySelector('#shortcut')?.focus();
    }
    else if (a === 'expandComposer') {
      const details = document.querySelector('#composer-details');
      details.hidden = !details.hidden;
      b.setAttribute('aria-expanded', String(!details.hidden));
      if (quick) {
        await new Promise(resolve => requestAnimationFrame(resolve));
        await call('quickExpanded', {expanded: !details.hidden, height: Math.ceil(document.querySelector('.quick').scrollHeight)});
      }
    } else if (a === 'closePanel') {
      await closeTaskDialog();
    } else if (a === 'search') {
      query = query ? '' : ' ';
      render();
      document.querySelector('#search')?.focus();
    } else if (a === 'today') {
      day = localDay();
      render();
    } else if (a === 'delete') {
      const id = selected;
      const task = allTasks().find(t => t.id === id);
      if (await askInApp(tr("Aufgabe löschen?"), displayTitle(task?.title || '') + tr(" wird gelöscht. Der Verlauf bleibt erhalten."), tr("Löschen"))) {
        await call('delete', {
          id
        });
        dirty = false;
        selected = null;
        state = await call('state');
        render();
        document.querySelector('#composer input[name=title]')?.focus();
      }
    } else if (a === 'resetFilters') {
      taskFilters = {
        project: '',
        context: '',
        priority: '',
        due: ''
      };
      render();
    } else if (a === 'archive' || a === 'restore') {
      if (!(await discard())) return;
      await call(a, {
        id: selected
      });
      selected = null;
      state = await call('state');
      render();
    } else if (a === 'archiveCompleted') {
      const count = state.tasks.filter(t => t.done).length;
      if (await askInApp(tr("Erledigte Aufgaben archivieren?"), count + tr(" erledigte Aufgaben werden nach done.txt verschoben. Notizen und Verlauf bleiben erhalten."), tr("Archivieren"))) {
        if (!(await discard())) return;
        await call('archiveCompleted');
        selected = null;
        state = await call('state');
        render();
      }
    } else if (a === 'attach') {
      if (dirty) {
        await saveDetail();
      }
      await call('attach', {
        id: selected
      });
      await refresh();
    } else if (['chooseDirectory', 'folder', 'quit', 'quick', 'hideQuick', 'pin', 'hidePin', 'togglePinCollapsed', 'resetPinSettings'].includes(a)) {
      if (a === 'chooseDirectory' && !(await discard())) return;
      await call(a);
      await refresh();
    }
  } catch (err) {
    toast(err.message);
  }
});
document.addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  if (contextMenu && !e.target.closest('.context-menu')) {
    contextMenu = null;
    document.querySelector('.context-menu')?.remove();
  }
});
async function saveDetail() {
  const data = taskFormData(document.querySelector('#detail-form'));
  await call('edit', {
    id: selected,
    ...data
  });
  dirty = false;
}
async function saveSettingsForm() {
  const form = document.querySelector('#settings-form');
  if (!form) return;
  const data = Object.fromEntries(new FormData(form));
  await call('settings', {
    ...data,
    autoStart: data.autoStart === 'on',
    showProjects: data.showProjects === 'on',
    showContexts: data.showContexts === 'on'
  });
  await refresh();
}
root.addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.target;
  const button = form.querySelector('[type=submit]');
  if (button) button.disabled = true;
  try {
    const data = ['composer', 'quick-form', 'detail-form'].includes(form.id) ? taskFormData(form) : Object.fromEntries(new FormData(form));
    if (form.id === 'composer' || form.id === 'quick-form') {
      if (!quick && view === 'project' && project && !taskProjects(data.title).includes(project)) data.title += ` +${encodeURIComponent(project)}`;
      if (!quick && view === 'context' && context && !taskContexts(data.title).includes(context)) data.title += ` @${encodeURIComponent(context)}`;
      if (!quick && view === 'today') data.scheduled = day;
      await call('create', data);
      if (quick) {
        resetComposer(form);
        form.querySelector('#composer-details').hidden=true;
        form.querySelector('.expand-composer').setAttribute('aria-expanded','false');
        await call('quickExpanded',{expanded:false});
        await call('hideQuick');
      } else {
        await refresh();
        resetComposer();
      }
    }
    if (form.id === 'detail-form') {
      await saveDetail();
      selected = null;
      await refresh();
      render();
      toast(tr("Änderungen gespeichert."));
    }
    if (form.id === 'settings-form') {
      await saveSettingsForm();
    }
  } catch (err) {
    toast(err.message);
  } finally {
    if (button) button.disabled = false;
  }
});
function capturedShortcut(e) {
  const key = e.code === 'Space' ? 'Space' : /^Key[A-Z]$/.test(e.code) ? e.code.slice(3) : /^Digit\d$/.test(e.code) ? e.code.slice(5) : /^F\d{1,2}$/.test(e.code) ? e.code : ({ArrowUp:'Up',ArrowDown:'Down',ArrowLeft:'Left',ArrowRight:'Right',Enter:'Enter',Tab:'Tab'}[e.key] || '');
  if (!key || (!e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey)) return '';
  return [...(e.ctrlKey || e.metaKey ? ['CommandOrControl'] : []), ...(e.altKey ? ['Alt'] : []), ...(e.shiftKey ? ['Shift'] : []), key].join('+');
}
document.addEventListener('keydown', async e => {
  if (e.target.id === 'new-subtask' && e.key === 'Enter') {
    e.preventDefault(); addSubtaskFromInput(); return;
  }
  if (recordingShortcut) {
    if (e.key === 'Escape') {
      recordingShortcut = false;
      const button = document.querySelector('[data-action=recordShortcut]');
      button?.setAttribute('aria-pressed', 'false');
      if (button) button.textContent = tr("Shortcut ändern");
      document.querySelector('#shortcut-capture-status').textContent = '';
      return;
    }
    const shortcut = capturedShortcut(e);
    if (!shortcut) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    recordingShortcut = false;
    document.querySelector('#shortcut').value = shortcut;
    const button = document.querySelector('[data-action=recordShortcut]');
    button?.setAttribute('aria-pressed', 'false');
    if (button) button.textContent = tr("Shortcut ändern");
    document.querySelector('#shortcut-capture-status').textContent = shortcut;
    try {
      await saveSettingsForm();
    } catch (err) {
      toast(err.message);
    }
    return;
  }
  if (pendingDialog || e.defaultPrevented) return;
  if (!quick && !pinned && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    openCommandPalette();
    return;
  }
  if (e.key === 'Escape') {
    if (contextMenu) {
      contextMenu = null;
      document.querySelector('.context-menu')?.remove();
    } else if (quick) call('hideQuick');else if (selected) {
      e.preventDefault();
      await closeTaskDialog();
    }
  }
});
window.api.onChange(() => {
  refresh().catch(e => toast(e.message));
});
window.api.onFocus(() => {
  if (quick) document.querySelector('input[name=title]')?.focus();else refresh().catch(e => toast(e.message));
});
window.api.onOpenTask(id => {
  if (pinned || quick) return;
  selected = id;
  view = 'today';
  render();
});
window.addEventListener('quick:content-size', syncQuickHeight);
let lastToday = localDay();
setInterval(() => {
  const now = localDay();
  if (now !== lastToday) {
    if (day === lastToday) day = now;
    lastToday = now;
    if (!dirty && !quick) render();
  }
  if (!quick && !dirty) refresh().catch(e => toast(e.message));
}, 30000);
refresh().catch(e => toast(e.message));
