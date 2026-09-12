let taskFilters = {
  project: '',
  context: '',
  priority: '',
  due: ''
};
function hasFilters() {
  return Object.values(taskFilters).some(Boolean);
}
function filterBar() {
  const options = (values, current) => values.map(([value, label]) => `<option value="${escapeHtml(value)}" ${value === current ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('');
  return `<section class="filter-area"><button type="button" class="filter-toggle" data-action="toggleFilters" aria-expanded="${filtersOpen}" aria-controls="filter-options">${tr('Filter')}${hasFilters() ? ` <span>${Object.values(taskFilters).filter(Boolean).length}</span>` : ''}${icon('down')}</button><div class="filter-bar" id="filter-options" aria-label="${tr("Aufgaben filtern")}" ${filtersOpen ? '' : 'hidden'}>
 <label>${tr("Projekt")}<select data-filter="project" aria-label="${tr("Nach Projekt filtern")}">${options([['', tr("Alle Projekte")], ...allProjects().map(p => [p, p])], taskFilters.project)}</select></label>
 <label>${tr("Kontext")}<select data-filter="context" aria-label="${tr("Nach Kontext filtern")}">${options([['', tr("Alle Kontexte")], ...allContexts().map(p => [p, '@' + p])], taskFilters.context)}</select></label>
 <label>${tr("Priorität")}<select data-filter="priority" aria-label="${tr("Nach Priorität filtern")}">${options([['', tr("Alle Prioritäten")], ['none', tr("Ohne Priorität")], ...Array.from({
    length: 26
  }, (_, i) => {
    const p = String.fromCharCode(65 + i);
    return [p, p];
  })], taskFilters.priority)}</select></label>
 <label>${tr("Fälligkeit")}<select data-filter="due" aria-label="${tr("Nach Fälligkeit filtern")}">${options([['', tr("Jeder Termin")], ['overdue', tr("Überfällig")], ['today', tr("Heute fällig")], ['week', tr("Nächste 7 Tage")], ['none', tr("Ohne Termin")]], taskFilters.due)}</select></label>
 ${hasFilters() ? `<button data-action="resetFilters">${tr("Zurücksetzen")}</button>` : ''}</div></section>`;
}
function matchesFilters(t) {
  if (taskFilters.project && !taskProjects(t.title).includes(taskFilters.project)) return false;
  if (taskFilters.context && !taskContexts(t.title).includes(taskFilters.context)) return false;
  if (taskFilters.priority && (taskFilters.priority === 'none' ? !!t.priority : t.priority !== taskFilters.priority)) return false;
  const today = localDay(),
    end = new Date();
  end.setDate(end.getDate() + 6);
  if (taskFilters.due === 'overdue' && (!t.due || t.due >= today || t.done)) return false;
  if (taskFilters.due === 'today' && t.due !== today) return false;
  if (taskFilters.due === 'week' && (!t.due || t.due < today || t.due > localDay(end))) return false;
  if (taskFilters.due === 'none' && t.due) return false;
  return true;
}
function searchMatches(t) {
  return [displayTitle(t.title), ...taskProjects(t.title), ...taskContexts(t.title), ...(t.subtasks || []).map(item => item.title)].join(' ').toLowerCase().includes(query.trim().toLowerCase());
}
document.addEventListener('change', async e => {
  if (e.target.dataset.filter) {
    taskFilters[e.target.dataset.filter] = e.target.value;
    render();
  }
});
