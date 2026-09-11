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
  contextMenu = null;
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
  document.querySelectorAll('[data-theme]').forEach(b => {
    if (b.tagName === 'BUTTON') b.setAttribute('aria-pressed', String(b.dataset.theme === preference));
  });
}
function themePicker() {
  return `<div class="theme-picker" role="group" aria-label="${tr("Erscheinungsbild")}">${[['light', tr("Hell")], ['dark', tr("Dunkel")], ['system', tr("System")]].map(([value, label]) => `<button type="button" data-theme="${value}" aria-label="${label}" title="${label}" aria-pressed="${(state?.settings.theme || 'system') === value}">${icon(value)}<span>${label}</span></button>`).join('')}</div>`;
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
  return `<div class="brand" aria-label="Machen"><span class="mark" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none"><path d="M6 24V8l10 10L26 8v9"/><path d="m18 22 3.2 3L28 18"/></svg></span><span class="brand-name">Machen</span></div>`;
}
function nav(name, label) {
  const updateDot = name === 'settings' ? '<span class="notification-dot" data-settings-update-dot hidden aria-hidden="true"></span>' : '';
  return `<button class="nav ${view === name ? 'active' : ''}" data-view="${name}">${icon(name)}<span>${label}</span>${updateDot}${name === 'today' ? `<span class="count">${state.tasks.filter(t => !t.done && (t.scheduled || t.created || '') <= localDay()).length}</span>` : ''}</button>`;
}
function sidebarList(kind, label, items) {
  const selectedValue = kind === 'project' ? project : context;
  const active = kind === 'project' ? view === 'project' : view === 'context';
  const empty = kind === 'project' ? tr("Noch keine Projekte") : tr("Noch keine Kontexte");
  const chip = kind === 'project' ? projectChip : contextChip;
  const attr = kind === 'project' ? 'data-project' : 'data-context';
  return `<section class="sidebar-list"><p class="projects">${label}</p><div class="sidebar-list-items">${items.length ? items.map(item => `<button class="project ${kind} ${active && selectedValue === item ? 'active' : ''}" ${attr}="${escapeHtml(item)}">${chip(item)}</button>`).join('') : `<small class="project muted">${empty}</small>`}</div></section>`;
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
function row(t) {
  return `<div class="task ${t.done ? 'done' : ''}"><button class="check ${t.done ? 'done' : ''}" data-toggle="${escapeHtml(t.id)}" aria-label="${t.done ? tr("Wieder öffnen") : tr("Abschließen")}: ${escapeHtml(displayTitle(t.title))}">${t.done ? icon('check') : ''}</button><button class="task-body" data-select="${escapeHtml(t.id)}"><span class="task-title">${escapeHtml(displayTitle(t.title))}</span>${taskProjects(t.title).length || taskContexts(t.title).length ? `<span class="task-projects">${taskProjects(t.title).map(p => projectChip(p)).join('')}${taskContexts(t.title).map(p => contextChip(p)).join('')}</span>` : ''}${t.due || t.notes || t.files?.length ? `<span class="task-meta">${t.due ? `<span>${tr("Fällig ")}${dateLabel(t.due)}</span>` : ''}${t.notes ? `<span>${tr("Notiz")}</span>` : ''}${t.files?.length ? `<span>${tr(t.files.length === 1 ? tr("Ein Anhang") : tr("{count} Anhänge"), {
    count: t.files.length
  })}</span>` : ''}</span>` : ''}</button>${t.priority ? `<span class="priority">${t.priority}</span>` : ''}</div>`;
}
function group(title, tasks, empty = '') {
  if (!tasks.length && !empty) return '';
  return `<section class="group"><div class="group-header"><h2>${title}</h2><span>${tasks.length}</span></div>${tasks.length ? tasks.map(row).join('') : empty ? `<p class="empty">${empty}</p>` : ''}</section>`;
}
function settingsContent() {
  const tab = (name, label) => `<button type="button" role="tab" data-settings-tab="${name}" aria-selected="${settingsTab === name}" tabindex="${settingsTab === name ? 0 : -1}">${label}${name === 'updates' ? '<span class="notification-dot" data-updates-tab-dot hidden aria-hidden="true"></span>' : ''}</button>`;
  const pane = (name, content) => `<section class="settings-pane" role="tabpanel" ${settingsTab === name ? '' : 'hidden'}>${content}</section>`;
  const general = `<h2>${tr("Deine Ablage")}</h2><p>${tr("Aufgaben, Notizen und Anhänge bleiben in deinem Ordner.")}</p><span class="path">${escapeHtml(state.settings.directory)}</span><button type="button" class="primary" data-action="chooseDirectory">${tr("Ordner wechseln")}</button><button type="button" data-action="folder">${tr("Ordner öffnen")}</button><p class="hint">${tr("Ein Wechsel öffnet die Aufgaben des neuen Ordners. Deine bisherigen Daten bleiben am bisherigen Ort. Zum Umziehen den gesamten Ordner inklusive Begleitdateien kopieren.")}</p>${languagePicker()}<h2>${tr("Erscheinungsbild")}</h2><p>${tr("Wähle Hell, Dunkel oder die Einstellung deines Systems.")}</p>${themePicker()}`;
  const sidebar = `<h2>${tr("Seitenleiste")}</h2><p>${tr("Wähle, welche Sammlungen links sichtbar sind.")}</p>${settingsSwitch('showProjects', state.settings.showProjects, tr("Projekte in der Seitenleiste anzeigen"))}${settingsSwitch('showContexts', state.settings.showContexts, tr("Kontexte in der Seitenleiste anzeigen"))}`;
  const capture = `<h2>${tr("Schnellerfassung")}</h2><p>${tr("Funktioniert auch, wenn Machen im Hintergrund läuft.")}</p><label for="shortcut">${tr("Globaler Shortcut")}</label><div class="shortcut-recorder"><input id="shortcut" name="shortcut" type="text" value="${escapeHtml(state.settings.shortcut)}" readonly required><button type="button" data-action="recordShortcut" aria-pressed="false">${tr("Shortcut ändern")}</button></div><p class="hint">${tr("Zum Beispiel CommandOrControl+Shift+Space oder Alt+Shift+T.")} <span id="shortcut-capture-status" aria-live="polite"></span></p>${settingsSwitch('autoStart', state.settings.autoStart, tr("Bei der Anmeldung starten (Windows / macOS)"))}`;
  return `<div class="settings"><div class="settings-heading"><h1>${tr("Einstellungen")}</h1></div><div class="settings-tabs" role="tablist" aria-label="${tr("Einstellungen")}">${tab('general', tr("Allgemein"))}${tab('sidebar', tr("Seitenleiste"))}${tab('pinned', tr("Angeheftete Aufgaben"))}${tab('capture', tr("Schnellerfassung"))}${tab('updates', tr("Updates"))}</div><form id="settings-form">${pane('general', general)}${pane('sidebar', sidebar)}${pane('pinned', pinSettings())}${pane('capture', capture)}${pane('updates', '<section data-update-settings></section>')}</form></div>`;
}
function settingsSwitch(name, checked, label) {
  return `<label class="settings-switch"><input type="checkbox" name="${name}" ${checked ? 'checked' : ''}><span class="switch-track" aria-hidden="true"></span><span>${label}</span></label>`;
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
  const tasks = state.tasks.filter(t => !t.done && (t.scheduled || t.created || '') <= localDay()).sort((a, b) => (a.priority || 'Z').localeCompare(b.priority || 'Z') || b.created.localeCompare(a.created));
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
  let tasks = (view === 'archive' ? state.archived || [] : state.tasks).filter(t => searchMatches(t) && matchesFilters(t) && (!project || view !== 'project' || taskProjects(t.title).includes(project)) && (!context || view !== 'context' || taskContexts(t.title).includes(context))).sort((a, b) => (a.priority || 'Z').localeCompare(b.priority || 'Z') || b.created.localeCompare(a.created));
  if (view === 'archive') return html + group(tr("Archivierte Aufgaben"), tasks, hasFilters() ? tr("Keine archivierten Aufgaben passen zu den Filtern.") : tr("Noch keine archivierten Aufgaben."));
  if (!tasks.length && hasFilters()) return html + `<p class="empty">${tr("Keine Aufgaben passen zu diesen Filtern.")}</p>`;
  if (view === 'today') {
    html += group(tr("Offen von vorher"), tasks.filter(t => !t.done && (!(t.scheduled || t.created) || (t.scheduled || t.created) < day)));
    html += group(day === localDay() ? tr("Für heute") : tr("Für diesen Tag"), tasks.filter(t => !t.done && (t.scheduled || t.created) === day), tr("Noch nichts auf dem Zettel. Erfasse deine erste Aufgabe oben."));
    html += group(tr("Erledigt"), tasks.filter(t => t.done && t.completed === day));
  } else {
    html += group(tr("Offen"), tasks.filter(t => !t.done), tr("Keine offenen Aufgaben.")) + group(tr("Erledigt"), tasks.filter(t => t.done));
  }
  return html;
}
function panel() {
  const t = allTasks().find(t => t.id === selected);
  if (!t) return '';
  return `<aside class="panel"><div class="panel-head"><h2>${tr("Aufgabendetails")}</h2><button class="icon" data-action="closePanel" aria-label="${tr("Details schließen")}">${icon('close')}</button></div><form id="detail-form"><label for="detail-title">${tr("Aufgabe")}</label><textarea class="title-edit" id="detail-title" name="title" required maxlength="2000">${escapeHtml(displayTitle(t.title))}</textarea>${projectPicker('edit', taskProjects(t.title))}${contextPicker('edit-context', taskContexts(t.title))}<div class="fields"><div><label for="due">${tr("Fällig am")}</label><input id="due" type="date" name="due" value="${t.due}"></div><div><label for="priority">${tr("Priorität")}</label><select id="priority" name="priority"><option value="">${tr("Keine")}</option>${Array.from({
    length: 26
  }, (_, i) => String.fromCharCode(65 + i)).map(p => `<option ${t.priority === p ? 'selected' : ''}>${p}</option>`).join('')}</select></div></div><label for="notes">${tr("Notizen & E-Mail-Kontext")}</label><textarea name="notes" id="notes" placeholder="${tr("Weitere Infos, E-Mail-Text oder einen Link hier ablegen …")}">${escapeHtml(t.notes || '')}</textarea><label>${tr("Anhänge")}</label>${(t.files || []).map(f => `<button type="button" class="file" data-file="${escapeHtml(f.id)}">${icon('file')} ${escapeHtml(f.name)}</button>`).join('')}<button type="button" data-action="attach">${icon('file')} ${tr("Datei oder E-Mail")}</button><div class="archive-actions">${t.archived ? `<button type="button" data-action="restore">${tr("In Aufgaben zurückholen")}</button>` : t.done ? `<button type="button" data-action="archive">${tr("Archivieren")}</button>` : ''}</div><div class="panel-actions"><button type="submit" class="primary">${tr("Speichern")}</button><button type="button" class="danger" data-action="delete">${tr("Löschen")}</button></div><p class="hint">${tr("Erfasst ")}${t.created ? dateLabel(t.created) : tr("ohne Datum")}${t.completed ? `<br>${tr("Erledigt ")}` + dateLabel(t.completed) : ''}</p></form></aside>`;
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
    root.innerHTML = `<main class="welcome">${brand()}${languagePicker()}<h1>${tr("Dein Tag.")}<br>${tr("Deine Aufgaben.")}<br>${tr("Dein Ordner.")}</h1><p>${tr("Wähle einen Ort für deine Aufgaben. Ein lokaler Ordner oder dein synchronisierter Cloud-Ordner – du entscheidest. Eine vorhandene todo.txt wird direkt eingelesen.")}</p>${state.shortcutError ? `<p>${escapeHtml(tr(state.shortcutError))}</p>` : ''}<button class="primary" data-action="chooseDirectory">${tr("Ablageort wählen")}</button><small>${tr("Ohne Konto. Deine Daten bleiben bei dir.")}</small></main>`;
    enhanceControls();
    paintUpdates();
    return;
  }
  const projects = openProjects(), contexts = openContexts();
  root.innerHTML = `<div class="shell"><nav class="sidebar" aria-label="${tr("Hauptnavigation")}">${brand()}${nav('today', tr("Heute"))}${nav('history', tr("Verlauf"))}${nav('all', tr("Alle Aufgaben"))}${nav('archive', tr("Archiv"))}<div class="sidebar-lists">${state.settings.showProjects ? sidebarList('project', tr("Projekte"), projects) : ''}${state.settings.showContexts ? sidebarList('context', tr("Kontexte"), contexts) : ''}</div><div class="bottom">${languagePicker()}${themePicker()}${nav('settings', tr("Einstellungen"))}</div></nav><main class="workspace">${state.shortcutError ? `<p class="error-banner">${escapeHtml(tr(state.shortcutError))}</p>` : ''}<div class="workspace-content">${content()}</div></main>${panel()}</div>`;
  paintRanges(root);
  restoreComposer(draft);
  enhanceControls();
  paintUpdates();
}
async function discard() {
  if (!dirty) return true;
  if (await askInApp(tr("Änderungen verwerfen?"), tr("Deine ungespeicherten Änderungen werden verworfen."))) {
    dirty = false;
    return true;
  }
  return false;
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
    await call('edit', {id: task.id, title: task.title, priority: task.priority, due: task.due, scheduled: action === 'plan-today' ? localDay() : tomorrow()});
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
    const a = b.dataset.action;
    if(a==='updates'){if(!(await discard()))return;view='settings';settingsTab='updates';selected=null;project='';context='';render();}
    else if (a === 'recordShortcut') {
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
      if (!(await discard())) return;
      selected = null;
      render();
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
  if (e.key === 'Escape') {
    if (contextMenu) {
      contextMenu = null;
      document.querySelector('.context-menu')?.remove();
    } else if (quick) call('hideQuick');else if (selected && (await discard())) {
      selected = null;
      render();
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
