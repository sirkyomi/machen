const root = document.querySelector('#app');
const quick = new URLSearchParams(location.search).has('quick');
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
  toastTimer,
  dirty = false;
const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
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
  return `<div class="brand"><span class="mark">${icon('check')}</span><span class="brand-name">Machen</span></div>`;
}
function nav(name, label) {
  return `<button class="nav ${view === name ? 'active' : ''}" data-view="${name}">${icon(name)}<span>${label}</span>${name === 'today' ? `<span class="count">${state.tasks.filter(t => !t.done).length}</span>` : ''}</button>`;
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
function content() {
  if (view === 'settings') return `<div class="settings"><h1>${tr("Einstellungen")}</h1>${languagePicker()}<section data-update-settings>${updateControls()}</section><h2>${tr("Erscheinungsbild")}</h2><p>${tr("Wähle Hell, Dunkel oder die Einstellung deines Systems.")}</p>${themePicker()}<h2>${tr("Deine Ablage")}</h2><p>${tr("Aufgaben, Notizen und Anhänge bleiben in deinem Ordner.")}</p><span class="path">${escapeHtml(state.settings.directory)}</span><button class="primary" data-action="chooseDirectory">${tr("Ordner wechseln")}</button><button data-action="folder">${tr("Ordner öffnen")}</button><p class="hint">${tr("Ein Wechsel öffnet die Aufgaben des neuen Ordners. Deine bisherigen Daten bleiben am bisherigen Ort. Zum Umziehen den gesamten Ordner inklusive Begleitdateien kopieren.")}</p><form id="settings-form"><h2>${tr("Schnellerfassung")}</h2><p>${tr("Funktioniert auch, wenn Machen im Hintergrund läuft.")}</p><label for="shortcut">${tr("Globaler Shortcut")}</label><input id="shortcut" name="shortcut" type="text" value="${escapeHtml(state.settings.shortcut)}" required><p class="hint">${tr("Zum Beispiel CommandOrControl+Shift+Space oder Alt+Shift+T.")}</p><label class="checklabel"><input type="checkbox" name="autoStart" ${state.settings.autoStart ? 'checked' : ''}>${tr("Bei der Anmeldung starten (Windows / macOS)")}</label><button class="primary" type="submit">${tr("Einstellungen speichern")}</button></form><h2>${tr("Im Hintergrund bereit")}</h2><p>${tr("Das Schließen des Fensters lässt Machen im Tray weiterlaufen. Vollständig beenden geht hier oder über das Tray-Menü.")}</p><button data-action="quit">${tr("Machen beenden")}</button></div>`;
  const title = view === 'archive' ? tr("Archiv") : view === 'history' ? tr("Verlauf") : view === 'all' ? tr("Alle Aufgaben") : view === 'project' ? project : day === localDay() ? tr("Heute") : dateLabel(day);
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
  let tasks = (view === 'archive' ? state.archived || [] : state.tasks).filter(t => searchMatches(t) && matchesFilters(t) && (!project || view !== 'project' || taskProjects(t.title).includes(project))).sort((a, b) => (a.priority || 'Z').localeCompare(b.priority || 'Z') || b.created.localeCompare(a.created));
  if (view === 'archive') return html + group(tr("Archivierte Aufgaben"), tasks, hasFilters() ? tr("Keine archivierten Aufgaben passen zu den Filtern.") : tr("Noch keine archivierten Aufgaben."));
  if (!tasks.length && hasFilters()) return html + `<p class="empty">${tr("Keine Aufgaben passen zu diesen Filtern.")}</p>`;
  if (view === 'today') {
    html += group(tr("Offen von vorher"), tasks.filter(t => !t.done && (!t.created || t.created < day)));
    html += group(day === localDay() ? tr("Für heute") : tr("An diesem Tag hinzugefügt"), tasks.filter(t => !t.done && t.created === day), tr("Noch nichts auf dem Zettel. Erfasse deine erste Aufgabe oben."));
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
  const draft = captureComposer();
  if (quick) {
    document.body.classList.add('quick-window');
    root.innerHTML = `<main class="quick">${createComposer(true)}<footer><span>${tr("Enter zum Erfassen")}</span></footer></main>`;
    restoreComposer(draft);
    enhanceControls();
    paintUpdates();
    return;
  }
  if (!state.configured) {
    root.innerHTML = `<main class="welcome">${brand()}${languagePicker()}<h1>${tr("Dein Tag.")}<br>${tr("Deine Aufgaben.")}<br>${tr("Dein Ordner.")}</h1><p>${tr("Wähle einen Ort für deine Aufgaben. Ein lokaler Ordner oder dein synchronisierter Cloud-Ordner – du entscheidest. Eine vorhandene todo.txt wird direkt eingelesen.")}</p>${state.shortcutError ? `<p>${escapeHtml(tr(state.shortcutError))}</p>` : ''}<button class="primary" data-action="chooseDirectory">${tr("Ablageort wählen")}</button><small>${tr("Ohne Konto. Deine Daten bleiben bei dir.")}</small></main>`;
    enhanceControls();
    paintUpdates();
    return;
  }
  const projects = allProjects();
  root.innerHTML = `<div class="shell"><nav class="sidebar" aria-label="${tr("Hauptnavigation")}">${brand()}${nav('today', tr("Heute"))}${nav('history', tr("Verlauf"))}${nav('all', tr("Alle Aufgaben"))}${nav('archive', tr("Archiv"))}<p class="projects">${tr("Projekte")}</p>${projects.length ? projects.map(p => `<button class="project ${project === p && view === 'project' ? 'active' : ''}" data-project="${escapeHtml(p)}">${projectChip(p)}</button>`).join('') : `<small class="project muted">${tr("Noch keine Projekte")}</small>`}<div class="bottom">${languagePicker()}${themePicker()}${nav('settings', tr("Einstellungen"))}<button class="update-notice" data-action="updates" data-update-notice hidden></button></div></nav><main class="workspace">${state.shortcutError ? `<p class="error-banner">${escapeHtml(tr(state.shortcutError))}</p>` : ''}<div class="workspace-content">${content()}</div></main>${panel()}</div>`;
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
root.addEventListener('change', e => {
  if (e.target.id === 'jump-date' && e.target.value) {
    day = e.target.value;
    render();
  }
});
root.addEventListener('click', async e => {
  const b = e.target.closest('button');
  if (!b) return;
  try {
    if (b.dataset.view) {
      if (!(await discard())) return;
      view = b.dataset.view;
      selected = null;
      query = '';
      project = '';
      day = localDay();
      render();
    }
    if (b.dataset.project) {
      if (!(await discard())) return;
      project = b.dataset.project;
      view = 'project';
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
    if(a==='updates'){if(!(await discard()))return;view='settings';selected=null;render();}
    else if (a === 'expandComposer') {
      const details = document.querySelector('#composer-details');
      details.hidden = !details.hidden;
      b.setAttribute('aria-expanded', String(!details.hidden));
      if(quick)await call('quickExpanded',{expanded:!details.hidden});
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
    } else if (['chooseDirectory', 'folder', 'quit', 'quick', 'hideQuick'].includes(a)) {
      if (a === 'chooseDirectory' && !(await discard())) return;
      await call(a);
      await refresh();
    }
  } catch (err) {
    toast(err.message);
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
root.addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.target;
  const button = form.querySelector('[type=submit]');
  if (button) button.disabled = true;
  try {
    const data = ['composer', 'quick-form', 'detail-form'].includes(form.id) ? taskFormData(form) : Object.fromEntries(new FormData(form));
    if (form.id === 'composer' || form.id === 'quick-form') {
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
      await call('settings', {
        ...data,
        autoStart: data.autoStart === 'on'
      });
      await refresh();
      toast(tr("Einstellungen gespeichert."));
    }
  } catch (err) {
    toast(err.message);
  } finally {
    if (button) button.disabled = false;
  }
});
document.addEventListener('keydown', async e => {
  if (pendingDialog || e.defaultPrevented) return;
  if (e.key === 'Escape') {
    if (quick) call('hideQuick');else if (selected && (await discard())) {
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
