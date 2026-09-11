function localDay(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function localTime(date = new Date()) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function isValidReminderTime(value) {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function dueTasks(tasks, day = localDay()) {
  return tasks.filter(task => !task.done && typeof task.due === 'string' && task.due <= day);
}

function dailyDueTasks(tasks, day = localDay()) {
  return dueTasks(tasks, day).filter(task => !task.snoozedUntil && (task.due < day || !isValidReminderTime(task.dueTime)));
}

function taskReminderKey(task, leadMinutes) {
  return `${task.id}:${task.due}:${task.dueTime}:${leadMinutes}`;
}

function taskDueDate(task) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(task?.due || '') || !isValidReminderTime(task?.dueTime)) return null;
  const [year, month, day] = task.due.split('-').map(Number);
  const [hour, minute] = task.dueTime.split(':').map(Number);
  const date = new Date(year, month - 1, day, hour, minute);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

function timedReminderTasks(tasks, leadMinutes, sentKeys = [], now = new Date()) {
  if (!Number.isInteger(leadMinutes) || leadMinutes < 0) return [];
  const sent = new Set(sentKeys);
  return tasks.filter(task => {
    if (task.done || task.snoozedUntil) return false;
    const dueAt = taskDueDate(task);
    if (!dueAt || sent.has(taskReminderKey(task, leadMinutes))) return false;
    const remindAt = dueAt.getTime() - leadMinutes * 60 * 1000;
    return now.getTime() >= remindAt && now.getTime() <= dueAt.getTime() + 60 * 60 * 1000;
  });
}

function snoozedReminderTasks(tasks, now = new Date()) {
  return tasks.filter(task => !task.done && typeof task.snoozedUntil === 'string' && task.snoozedUntil && !Number.isNaN(Date.parse(task.snoozedUntil)) && Date.parse(task.snoozedUntil) <= now.getTime());
}

function shouldSendReminder(settings, now = new Date()) {
  return settings?.remindersEnabled === true && isValidReminderTime(settings.reminderTime) && localTime(now) >= settings.reminderTime && settings.reminderLastDay !== localDay(now);
}

module.exports = {localDay, localTime, isValidReminderTime, dueTasks, dailyDueTasks, taskReminderKey, taskDueDate, timedReminderTasks, snoozedReminderTasks, shouldSendReminder};
