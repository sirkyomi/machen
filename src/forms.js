function taskProjects(title) {
  return [...new Set((title.match(/(?:^|\s)\+([^\s]+)/g) || []).map(value => {
    const token = value.trim().slice(1);
    try {
      return decodeURIComponent(token);
    } catch {
      return token;
    }
  }))];
}
function displayTitle(title) {
  return title.replace(/(?:^|\s)[+@][^\s]+/g, '').trim();
}
function allProjects() {
  return [...new Set(allTasks().flatMap(t => taskProjects(t.title)))].sort((a, b) => a.localeCompare(b, locale()));
}
function openProjects() {
  return [...new Set(state.tasks.filter(t => !t.done).flatMap(t => taskProjects(t.title)))].sort((a, b) => a.localeCompare(b, locale()));
}
function allTasks() {
  return [...state.tasks, ...(state.archived || [])];
}
function taskContexts(title) {
  return [...new Set((title.match(/(?:^|\s)@([^\s]+)/g) || []).map(value => {
    const token = value.trim().slice(1);
    try {
      return decodeURIComponent(token);
    } catch {
      return token;
    }
  }))];
}
function allContexts() {
  return [...new Set(allTasks().flatMap(t => taskContexts(t.title)))].sort((a, b) => a.localeCompare(b, locale()));
}
function openContexts() {
  return [...new Set(state.tasks.filter(t => !t.done).flatMap(t => taskContexts(t.title)))].sort((a, b) => a.localeCompare(b, locale()));
}
function contextChip(name, removable = false) {
  return projectChip(name, removable, true);
}
function contextPicker(id, chosen = []) {
  return projectPicker(id, chosen, 'contexts');
}
function pickerChip(picker, name, removable = false) {
  return (picker.dataset.kind === 'contexts' ? contextChip : projectChip)(name, removable);
}
function projectChip(name, removable = false, context = false) {
  const tone = [...name].reduce((sum, c) => sum + c.charCodeAt(0), 0) % 4;
  return `<span class="project-chip${context ? ' context-chip' : ''}" data-tone="${tone}">${context ? '@' : ''}${escapeHtml(name)}${removable ? `<button type="button" data-remove-project="${escapeHtml(name)}" aria-label="${escapeHtml(tr(context ? tr("Kontext {name} entfernen") : tr("Projekt {name} entfernen"), {
    name
  }))}">${icon('close')}</button>` : ''}</span>`;
}
function projectPicker(id, chosen = [], kind = 'projects') {
  const context = kind === 'contexts';
  return `<div class="project-picker" data-kind="${kind}"><label for="${id}-entry">${context ? tr("Kontext") : tr("Projekt")}</label><input type="hidden" name="${kind}" value="${escapeHtml(JSON.stringify(chosen))}"><div class="chosen-projects">${chosen.map(p => (context ? contextChip : projectChip)(p, true)).join('')}</div><div class="project-entry"><input id="${id}-entry" name="${context ? 'contextEntry' : 'projectEntry'}" role="combobox" aria-expanded="false" aria-autocomplete="list" aria-controls="${id}-options" autocomplete="off" placeholder="${context ? tr("Auswählen oder neuer Kontext") : tr("Auswählen oder neues Projekt")}"><button type="button" data-project-dropdown aria-label="${context ? tr("Kontexte anzeigen") : tr("Projekte anzeigen")}">${icon('down')}</button></div><div class="project-options" id="${id}-options" role="listbox" hidden></div></div>`;
}
function updateProjectOptions(picker, open = true) {
  const entry = picker.querySelector('[role=combobox]'),
    list = picker.querySelector('[role=listbox]');
  const chosen = JSON.parse(picker.querySelector('input[type=hidden]').value),
    value = entry.value.trim();
  const options = picker.dataset.kind === 'contexts' ? allContexts() : allProjects();
  const matches = options.filter(p => !chosen.includes(p) && p.toLowerCase().includes(value.toLowerCase()));
  list.innerHTML = matches.map(p => `<button type="button" role="option" aria-selected="false" data-pick-project="${escapeHtml(p)}">${pickerChip(picker, p)}</button>`).join('') + (value && !options.includes(value) && !chosen.includes(value) ? `<button type="button" role="option" aria-selected="false" data-pick-project="${escapeHtml(value)}">${pickerChip(picker, value)}<small>${tr("Neu anlegen")}</small></button>` : '');
  if (!list.children.length) list.innerHTML = `<span class="project-help">${tr("Namen eingeben, um einen neuen Eintrag anzulegen.")}</span>`;
  list.hidden = !open;
  entry.setAttribute('aria-expanded', String(open));
}
function setPickedProjects(picker, chosen) {
  picker.querySelector('input[type=hidden]').value = JSON.stringify(chosen);
  picker.querySelector('.chosen-projects').innerHTML = chosen.map(p => pickerChip(picker, p, true)).join('');
  window.dispatchEvent(new Event('quick:content-size'));
}
function pickProject(picker, name) {
  name = name.trim().replace(/^[+@]/, '');
  if (!name) return;
  if (name.length > 80 || /[\r\n]/.test(name)) throw Error(tr("Projektname darf höchstens 80 Zeichen enthalten."));
  const chosen = JSON.parse(picker.querySelector('input[type=hidden]').value);
  setPickedProjects(picker, [...new Set([...chosen, name])]);
  picker.querySelector('[role=combobox]').value = '';
  updateProjectOptions(picker, false);
  if (picker.closest('#detail-form')) dirty = true;
}
function taskFormData(form) {
  const pickers = [...form.querySelectorAll('.project-picker')];
  for (const picker of pickers) pickProject(picker, picker.querySelector('[role=combobox]').value);
  const data = Object.fromEntries(new FormData(form));
  data.dueTime = data.due && data.dueHour ? `${data.dueHour}:${data.dueMinute || '00'}` : '';
  delete data.dueHour;
  delete data.dueMinute;
  if (form.id === 'detail-form') data.subtasks = [...form.querySelectorAll('[data-subtask-id]')].map(row => ({id: row.dataset.subtaskId, title: row.querySelector('input[type=text]').value.trim(), done: row.querySelector('input[type=checkbox]').checked})).filter(item => item.title);
  if (!displayTitle(data.title || '').trim()) throw Error(tr("Bitte einen Aufgabentitel eingeben."));
  const projects = [...new Set([...taskProjects(data.title), ...JSON.parse(data.projects || '[]')])];
  const contexts = [...new Set([...taskContexts(data.title), ...JSON.parse(data.contexts || '[]')])];
  data.title = [displayTitle(data.title), ...projects.map(p => '+' + encodeURIComponent(p)), ...contexts.map(p => '@' + encodeURIComponent(p))].filter(Boolean).join(' ');
  return data;
}
function createComposer(quickMode = false) {
  return `<form id="${quickMode?'quick-form':'composer'}" class="composer composer-expandable"><div class="composer-line"><button type="button" class="expand-composer" data-action="expandComposer" aria-label="${tr("Aufgabendetails ausklappen")}" aria-expanded="false" aria-controls="composer-details">${icon('down')}</button><input name="title" aria-label="${tr("Neue Aufgabe")}" placeholder="${tr("Was möchtest du erledigen?")}" required maxlength="2000" autocomplete="off"><button class="primary" type="submit">${tr(quickMode?"Erfassen":"Hinzufügen")}</button></div><div id="composer-details" hidden>${projectPicker('create', view === 'project' ? [project] : [])}${contextPicker('create-context', view === 'context' ? [context] : [])}<div class="fields task-due-fields"><div><label for="create-priority">${tr("Priorität")}</label><select id="create-priority" name="priority"><option value="">${tr("Keine")}</option>${Array.from({
    length: 26
  }, (_, i) => `<option>${String.fromCharCode(65 + i)}</option>`).join('')}</select></div><div><label for="create-due">${tr("Fällig am")}</label><input id="create-due" type="date" name="due"></div><div><label for="create-due-time">${tr("Uhrzeit")}</label>${taskDueTimePicker('', 'create-due-time')}</div></div><label for="create-notes">${tr("Notizen & E-Mail-Kontext")}</label><textarea id="create-notes" name="notes" placeholder="${tr("Optionaler Kontext zur Aufgabe")}"></textarea></div></form>`;
}
function captureComposer() {
  const form = document.querySelector('#composer,#quick-form');
  return form ? {
    values: Object.fromEntries(new FormData(form)),
    open: !form.querySelector('#composer-details').hidden
  } : null;
}
function restoreComposer(draft) {
  const form = document.querySelector('#composer,#quick-form');
  if (!form || !draft) return;
  for (const [name, value] of Object.entries(draft.values)) {
    const field = form.elements.namedItem(name);
    if (field) field.value = value;
  }
  for (const picker of form.querySelectorAll('.project-picker')) setPickedProjects(picker, JSON.parse(draft.values[picker.dataset.kind] || '[]'));
  form.querySelector('#composer-details').hidden = !draft.open;
  form.querySelector('.expand-composer').setAttribute('aria-expanded', String(draft.open));
}
function resetComposer(form = document.querySelector('#composer')) {
  if (!form) return;
  form.reset();
  setPickedProjects(form.querySelector('.project-picker'), view === 'project' ? [project] : []);
  for (const picker of form.querySelectorAll('.project-picker')) {
    if (picker.dataset.kind === 'contexts') setPickedProjects(picker, view === 'context' ? [context] : []);
    updateProjectOptions(picker, false);
  }
  enhanceControls();
  form.elements.title.focus();
}
let pendingDialog = null;
function askInApp(title, message, accept = tr("Verwerfen")) {
  if (pendingDialog) return Promise.resolve(false);
  const previous = document.activeElement;
  const dialog = document.createElement('dialog');
  dialog.className = 'app-dialog';
  dialog.setAttribute('aria-labelledby', 'dialog-title');
  dialog.setAttribute('aria-describedby', 'dialog-message');
  dialog.innerHTML = `<form method="dialog"><h2 id="dialog-title">${escapeHtml(title)}</h2><p id="dialog-message">${escapeHtml(message)}</p><div class="dialog-actions"><button value="cancel" autofocus>${tr("Abbrechen")}</button><button value="accept" class="primary">${escapeHtml(accept)}</button></div></form>`;
  document.body.append(dialog);
  pendingDialog = dialog;
  dialog.showModal();
  return new Promise(resolve => dialog.addEventListener('close', () => {
    const accepted = dialog.returnValue === 'accept';
    pendingDialog = null;
    dialog.remove();
    if (previous?.isConnected) previous.focus();
    resolve(accepted);
  }, {
    once: true
  }));
}
document.addEventListener('input', e => {
  const picker = e.target.closest('.project-picker');
  if (picker && e.target.matches('[role=combobox]')) updateProjectOptions(picker);
});
document.addEventListener('click', e => {
  try {
    const picker = e.target.closest('.project-picker');
    document.querySelectorAll('.project-picker').forEach(p => {
      if (p !== picker) updateProjectOptions(p, false);
    });
    if (!picker) return;
    const button = e.target.closest('button');
    if (button?.hasAttribute('data-project-dropdown')) {
      updateProjectOptions(picker, picker.querySelector('[role=listbox]').hidden);
      picker.querySelector('[role=combobox]').focus();
    }
    if (button?.hasAttribute('data-pick-project')) {
      pickProject(picker, button.dataset.pickProject);
      picker.querySelector('[role=combobox]').focus();
    }
    if (button?.hasAttribute('data-remove-project')) {
      setPickedProjects(picker, JSON.parse(picker.querySelector('input[type=hidden]').value).filter(p => p !== button.dataset.removeProject));
      if (picker.closest('#detail-form')) dirty = true;
    }
  } catch (err) {
    toast(err.message);
  }
});
document.addEventListener('keydown', e => {
  const picker = e.target.closest('.project-picker');
  if (!picker) return;
  const entry = picker.querySelector('[role=combobox]'),
    list = picker.querySelector('[role=listbox]');
  if (e.key === 'Escape' && !list.hidden) {
    e.preventDefault();
    e.stopImmediatePropagation();
    updateProjectOptions(picker, false);
    entry.focus();
  }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (list.hidden) updateProjectOptions(picker);
    const options = [...list.querySelectorAll('button')];
    const index = options.indexOf(document.activeElement);
    options[(index + (e.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length]?.focus();
  }
  if (e.key === 'Enter' && e.target === entry && entry.value.trim()) {
    e.preventDefault();
    try {
      pickProject(picker, entry.value);
    } catch (err) {
      toast(err.message);
    }
  }
});
