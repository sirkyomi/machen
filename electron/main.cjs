require('velopack').VelopackApp.build().setAutoApplyOnStartup(false).run();
const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  globalShortcut,
  Tray,
  Menu,
  nativeImage,
  Notification,
  shell,
  screen,
  nativeTheme
} = require('electron');
const {Updates, REPOSITORY} = require('./updates.cjs');
const {UpdateManager, GithubSource} = require('velopack');
let updates;
const {translate}=require('../src/i18n.js');
const tr=(key,values)=>translate(settings?.language||'de',key,values);
const fs = require('node:fs');
const path = require('node:path');
const {
  Store
} = require('./store.cjs');
const {dailyDueTasks, isValidReminderTime, localDay, shouldSendReminder, snoozedReminderTasks, taskReminderKey, timedReminderTasks} = require('./reminders.cjs');

const dataHome = process.env.MACHEN_TEST_HOME || path.join(app.getPath('appData'), 'Machen');
app.setPath('userData', dataHome);
app.setName('Machen');
if (process.platform === 'win32') app.setAppUserModelId('machen');
app.commandLine.appendSwitch('enable-features', 'GlobalShortcutsPortal');
let main,
  quick,
  pinned,
  pinMoveTimer,
  pinIgnoreResizeUntil = 0,
  pinUpdating = false,
  tray,
  store,
  settings,
  configFile,
  quitting = false,
  shortcutError = '';
const defaults = {
  directory: '',
  shortcut: 'CommandOrControl+Shift+Space',
  autoStart: false,
  showProjects: true,
  showContexts: true,
  accent: 'graphite',
  pinOpacity: 0.92,
  pinScale: 1,
  pinBounds: null,
  pinAutoHeight: true,
  pinCollapsed: false,
  pinEnabled: false,
  remindersEnabled: false,
  reminderTime: '09:00',
  reminderLastDay: '',
  reminderLeadMinutes: 60,
  reminderTaskKeys: [],
  theme: 'system',
  language: 'de'
};
function iconPath(kind, extension) {
  const variant = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
  return path.join(__dirname, `../assets/${kind}-${variant}.${extension}`);
}
function updateIcons() {
  const trayIcon = nativeImage.createFromPath(iconPath('tray', 'png'));
  if (!trayIcon.isEmpty()) tray?.setImage(trayIcon);
  for (const w of [main, quick, pinned]) w?.setIcon(iconPath('app', 'ico'));
}
function saveSettings() {
  fs.mkdirSync(path.dirname(configFile), {
    recursive: true
  });
  const tmp = configFile + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(settings, null, 2));
  fs.renameSync(tmp, configFile);
}
function broadcast() {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send('app:changed');
}
function reminderTaskTitle(title) {
  return String(title || '').replace(/\s(?:\+|@)[^\s]+/g, '').replace(/\s(?:due|pri|id):[^\s]+/g, '').trim();
}
function snoozeUntil(preset, now = new Date()) {
  const result = new Date(now);
  if (preset === '10m') result.setMinutes(result.getMinutes() + 10);
  else if (preset === '1h') result.setHours(result.getHours() + 1);
  else if (preset === 'tomorrow') {
    const [hour, minute] = settings.reminderTime.split(':').map(Number);
    result.setDate(result.getDate() + 1); result.setHours(hour, minute, 0, 0);
  } else return '';
  return result.toISOString();
}
function checkDueReminders() {
  if (!store || !settings.remindersEnabled || !Notification.isSupported()) return;
  const allTasks = store.snapshot().tasks;
  let changed = false;
  const notify = (tasks, title, body) => {
    if (!tasks.length) return;
    const presets = ['10m', '1h', 'tomorrow'];
    const actions = [[presets[0], tr('10 Minuten')], [presets[1], tr('1 Stunde')], [presets[2], tr('Morgen')]].map(([, text]) => ({type: 'button', text}));
    const notification = new Notification({title, body, silent: true, ...(process.platform === 'win32' || process.platform === 'darwin' ? {actions} : {})});
    notification.on('click', () => { showMain(); main.webContents.send('app:openTask', tasks[0].id); });
    notification.on('action', (details, legacyActionIndex) => {
      const actionIndex = Number.isInteger(details?.actionIndex) ? details.actionIndex : legacyActionIndex;
      const until = snoozeUntil(presets[actionIndex]);
      if (!until) return;
      try {
        const currentIds = new Set(store.snapshot().tasks.filter(task => !task.done).map(task => task.id));
        for (const task of tasks) if (currentIds.has(task.id)) store.setSnooze(task.id, until);
        broadcast();
      } catch (error) { console.error('Notification action failed:', error); }
    });
    notification.show();
  };
  const snoozedTasks = snoozedReminderTasks(allTasks);
  if (snoozedTasks.length) {
    notify(snoozedTasks, tr('Erinnerung'), snoozedTasks.length === 1 ? reminderTaskTitle(snoozedTasks[0].title) : tr('{count} Aufgaben warten auf dich.', {count: snoozedTasks.length}));
    store.clearSnoozes(snoozedTasks.map(task => task.id));
    broadcast();
  }
  if (shouldSendReminder(settings)) {
    const tasks = dailyDueTasks(allTasks);
    settings.reminderLastDay = localDay();
    changed = true;
    notify(tasks, tr('Fällige Aufgaben'), tasks.length === 1 ? reminderTaskTitle(tasks[0].title) : tr('{count} Aufgaben sind fällig.', {count: tasks.length}));
  }
  const sentKeys = Array.isArray(settings.reminderTaskKeys) ? settings.reminderTaskKeys : [];
  const timedTasks = timedReminderTasks(allTasks, settings.reminderLeadMinutes, sentKeys);
  if (timedTasks.length) {
    settings.reminderTaskKeys = [...sentKeys, ...timedTasks.map(task => taskReminderKey(task, settings.reminderLeadMinutes))].slice(-200);
    changed = true;
    const body = timedTasks.length === 1 ? `${reminderTaskTitle(timedTasks[0].title)} · ${tr('Fällig um {time}', {time: timedTasks[0].dueTime})}` : tr('{count} Aufgaben werden bald fällig.', {count: timedTasks.length});
    notify(timedTasks, tr('Fälligkeitserinnerung'), body);
  }
  if (changed) saveSettings();
}
function windowFor(kind = 'main') {
  const isQuick = kind === 'quick';
  const isPinned = kind === 'pinned';
  const w = new BrowserWindow({
    width: isQuick ? 600 : isPinned ? 360 : 1180,
    height: isQuick ? 56 : isPinned ? 520 : 820,
    minWidth: isQuick ? 500 : isPinned ? 240 : 700,
    minHeight: isQuick ? 56 : isPinned ? 48 : 540,
    show: false,
    title: isQuick ? tr("Aufgabe erfassen") : 'Machen',
    roundedCorners: true,
    backgroundColor: isPinned ? '#00000000' : nativeTheme.shouldUseDarkColors ? '#171c25' : '#FAFBFD',
    transparent: isPinned,
    autoHideMenuBar: true,
    resizable: !isQuick,
    minimizable: !isQuick && !isPinned,
    maximizable: !isQuick && !isPinned,
    titleBarStyle: 'default',
    frame: !isQuick && !isPinned,
    hasShadow: true,
    alwaysOnTop: isQuick || isPinned,
    skipTaskbar: isQuick || isPinned,
    icon: iconPath('app', 'ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  w.loadFile(path.join(__dirname, '../src/index.html'), {
    query: isQuick ? {quick: '1'} : isPinned ? {pinned: '1'} : {}
  });
  w.webContents.setWindowOpenHandler(() => ({
    action: 'deny'
  }));
  w.webContents.on('will-navigate', e => e.preventDefault());
  w.on('close', e => {
    if (!quitting) {
      e.preventDefault();
      w.hide();
    }
  });
  w.on('focus', () => w.webContents.send('app:focus'));
  if (isQuick) w.on('blur', () => w.hide());
  return w;
}
function constrainedPinBounds(bounds = null) {
  const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  const scale = settings.pinScale;
  const gap = 16, minWidth = Math.round(240 * scale), minHeight = Math.round(48 * scale);
  const stored = bounds || settings.pinBounds || {};
  const maxWidth = Math.max(minWidth, area.width - gap * 2), maxHeight = Math.max(minHeight, area.height - gap * 2);
  const width = Math.max(minWidth, Math.min(Number.isFinite(stored.width) ? stored.width : Math.round(360 * scale), maxWidth));
  const height = settings.pinCollapsed ? minHeight : Math.max(minHeight, Math.min(Number.isFinite(stored.height) ? stored.height : Math.round(220 * scale), maxHeight));
  const maxX = Math.max(area.x + gap, area.x + area.width - width - gap);
  const maxY = Math.max(area.y + gap, area.y + area.height - height - gap);
  return {width, height, x: Math.max(area.x + gap, Math.min(Number.isFinite(stored.x) ? stored.x : maxX, maxX)), y: Math.max(area.y + gap, Math.min(Number.isFinite(stored.y) ? stored.y : area.y + gap, maxY))};
}
function applyPinSettings() {
  if (!pinned) return;
  const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  pinUpdating = true;
  pinIgnoreResizeUntil = Date.now() + 200;
  pinned.setMinimumSize(Math.round(240 * settings.pinScale), Math.round(48 * settings.pinScale));
  pinned.setMaximumSize(Math.max(240, area.width - 32), Math.max(48, area.height - 32));
  pinned.setBounds(constrainedPinBounds(settings.pinBounds || undefined));
  pinned.webContents.setZoomFactor(settings.pinScale);
  pinned.setOpacity(1);
  pinUpdating = false;
}
function showPinned() {
  if (!store) return showMain();
  applyPinSettings();
  pinned.showInactive();
}
function showMain() {
  main.show();
  if (main.isMinimized()) main.restore();
  main.focus();
}
function showQuick() {
  if (!store) {
    showMain();
    return;
  }
  const {
    workArea
  } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const [width,height]=quick.getSize();
  quick.setPosition(Math.round(workArea.x+(workArea.width-width)/2),Math.round(Math.max(workArea.y+12,Math.min(workArea.y+workArea.height*.2,workArea.y+workArea.height-height-12))));
  quick.show();
  quick.focus();
  quick.webContents.send('app:focus');
}
function updateMenus(){
 const item=(role,label)=>({role,label:tr(label)});
 tray?.setContextMenu(Menu.buildFromTemplate([{label:tr('Machen öffnen'),click:showMain},{label:tr('Aufgabe erfassen'),click:showQuick},{type:'separator'},{label:tr('Beenden'),click:()=>app.quit()}]));
 Menu.setApplicationMenu(Menu.buildFromTemplate([
 {label:'Machen',submenu:[{label:tr('Neue Aufgabe'),accelerator:'CmdOrCtrl+N',click:showQuick},{label:tr('Aufgaben anheften'),click:showPinned},item('quit','Beenden')]},
 {label:tr('Bearbeiten'),submenu:[item('undo','Rückgängig'),item('redo','Wiederholen'),{type:'separator'},item('cut','Ausschneiden'),item('copy','Kopieren'),item('paste','Einfügen'),item('selectAll','Alles auswählen')]},
 {label:tr('Ansicht'),submenu:[item('reload','Neu laden'),item('resetZoom','Originalgröße'),item('zoomIn','Vergrößern'),item('zoomOut','Verkleinern'),item('togglefullscreen','Vollbild')]}
 ]));quick?.setTitle(tr('Aufgabe erfassen'));
}
function registerShortcut(value) {
  try {
    return globalShortcut.register(value, showQuick);
  } catch {
    return false;
  }
}
if (!app.requestSingleInstanceLock()) app.quit();else {
  app.on('second-instance', () => main && showMain());
  app.whenReady().then(() => {
    configFile = path.join(app.getPath('userData'), 'settings.json');
    settings = fs.existsSync(configFile) ? {
      ...defaults,
      ...JSON.parse(fs.readFileSync(configFile, 'utf8'))
    } : {
      ...defaults
    };
    nativeTheme.themeSource = ['light', 'dark', 'system'].includes(settings.theme) ? settings.theme : 'system';
    if (settings.directory) {
      try {
        store = new Store(settings.directory);
      } catch (e) {
        shortcutError = `${tr("Ablageort konnte nicht geöffnet werden: ")}${tr(e.message)}`;
      }
    }
    main = windowFor();
    quick = windowFor('quick');
    pinned = windowFor('pinned');
    pinned.on('moved', () => {
      if (pinUpdating) return;
      const next = constrainedPinBounds(pinned.getBounds());
      const current = pinned.getBounds();
      pinUpdating = true;
      if (next.x !== current.x || next.y !== current.y) pinned.setPosition(next.x, next.y);
      pinUpdating = false;
      clearTimeout(pinMoveTimer);
      pinMoveTimer = setTimeout(() => { settings.pinBounds = {...(settings.pinBounds || {}), ...next}; saveSettings(); }, 250);
    });
    pinned.on('resize', () => {
      if (pinUpdating || Date.now() < pinIgnoreResizeUntil || settings.pinCollapsed) return;
      const next = constrainedPinBounds(pinned.getBounds());
      pinUpdating = true;
      pinned.setBounds(next);
      pinUpdating = false;
      settings.pinAutoHeight = false;
      settings.pinBounds = next;
      clearTimeout(pinMoveTimer);
      pinMoveTimer = setTimeout(saveSettings, 250);
    });
    main.once('ready-to-show', showMain);
    if (settings.pinEnabled && store) pinned.once('ready-to-show', showPinned);
    if (!registerShortcut(settings.shortcut)) shortcutError = 'Der globale Shortcut ist belegt. Bitte in den Einstellungen \u00e4ndern.';
    const icon = nativeImage.createFromPath(iconPath('tray', 'png'));
    tray = new Tray(icon);
    tray.setToolTip('Machen');
    tray.on('click',showMain);
    nativeTheme.on('updated', updateIcons);
    updateMenus();
    updates = new Updates({version:app.getVersion(), createManager:()=>{
      if(!app.isPackaged || process.env.MACHEN_TEST_HOME)throw Error('Development build');
      return new UpdateManager(new GithubSource(REPOSITORY, undefined, false), {AllowVersionDowngrade:false, ExplicitChannel: `${process.platform==='win32'?'win':process.platform==='darwin'?'osx':'linux'}-${process.arch}`});
    }, notify:next=>main.webContents.send('app:update',next), quit:()=>app.quit()});
    // Check asynchronously after startup, then periodically; downloading stays manual.
    const initialUpdateCheck=setTimeout(()=>updates.check(),0);initialUpdateCheck.unref();
    const periodicUpdateCheck=setInterval(()=>updates.check(),4*60*60*1000);periodicUpdateCheck.unref();
    const initialReminderCheck = setTimeout(checkDueReminders, 0); initialReminderCheck.unref();
    const reminderCheck = setInterval(checkDueReminders, 60 * 1000); reminderCheck.unref();
    ipcMain.handle('app:call', async (event, action, data = {}) => {
      if (![main.webContents, quick.webContents, pinned.webContents].includes(event.sender)) throw Error(tr("Unzulässiger Zugriff."));
      if(action.startsWith('update:')){
        if(event.sender!==main.webContents)throw Error(tr('Unzulässiger Zugriff.'));
        if(action==='update:state')return updates.snapshot();
        if(action==='update:check')return updates.check();
        if(action==='update:download')return updates.download();
        if(action==='update:install')return updates.install();
        throw Error(tr('Unbekannte Aktion.'));
      }
      if (action === 'state') return {
        settings,
        shortcutError,
        ...(store ? store.snapshot() : {
          tasks: [],
          archived: [],
          events: []
        }),
        configured: !!store
      };
      if(action==='language'){if(!['de','en'].includes(data.language))throw Error(tr('Ungültige Sprache.'));settings.language=data.language;saveSettings();updateMenus();broadcast();return true;}
      if (action === 'theme') {
        if (!['light', 'dark', 'system'].includes(data.theme)) throw Error(tr("Unbekanntes Erscheinungsbild."));
        settings.theme = data.theme;
        saveSettings();
        nativeTheme.themeSource = data.theme;
        updateIcons();
        broadcast();
        return true;
      }
      if (action === 'chooseDirectory') {
        const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
          title: tr("Ablageort für deine Aufgaben"),
          properties: ['openDirectory', 'createDirectory']
        });
        if (result.canceled) return false;
        const next = new Store(result.filePaths[0]);
        store = next;
        settings.directory = next.dir;
        saveSettings();
        checkDueReminders();
        broadcast();
        return true;
      }
      if (action === 'settings') {
        if (typeof data.shortcut !== 'string' || data.shortcut.length > 100) throw Error(tr("Ungültiger Shortcut."));
        if (data.shortcut !== settings.shortcut || shortcutError) {
          if (!registerShortcut(data.shortcut)) throw Error(tr("Shortcut ist belegt oder ungültig."));
          if (data.shortcut !== settings.shortcut) globalShortcut.unregister(settings.shortcut);
        }
        settings.shortcut = data.shortcut;
        shortcutError = '';
        settings.autoStart = !!data.autoStart;
        settings.showProjects = !!data.showProjects;
        settings.showContexts = !!data.showContexts;
        if (process.platform !== 'linux') app.setLoginItemSettings({
          openAtLogin: settings.autoStart
        });
        saveSettings();
        broadcast();
        return true;
      }
      if (action === 'resetApp') {
        globalShortcut.unregister(settings.shortcut);
        settings = {...defaults};
        shortcutError = '';
        store = undefined;
        nativeTheme.themeSource = settings.theme;
        if (process.platform !== 'linux') app.setLoginItemSettings({openAtLogin: false});
        if (!registerShortcut(settings.shortcut)) shortcutError = 'Der globale Shortcut ist belegt. Bitte in den Einstellungen ändern.';
        pinned.hide();
        quick.hide();
        saveSettings();
        updateIcons();
        updateMenus();
        broadcast();
        return true;
      }
      if (action === 'accent') {
        if (!['graphite', 'blue', 'violet', 'emerald', 'coral'].includes(data.accent)) throw Error(tr('Unbekannte Akzentfarbe.'));
        settings.accent = data.accent;
        saveSettings();
        broadcast();
        return true;
      }
      if (action === 'reminderSettings') {
        const leadMinutes = Number(data.leadMinutes);
        if (typeof data.enabled !== 'boolean' || !isValidReminderTime(data.time) || ![0, 15, 30, 60, 1440].includes(leadMinutes)) throw Error(tr('Ungültige Erinnerungszeit.'));
        const changed = settings.remindersEnabled !== data.enabled || settings.reminderTime !== data.time || settings.reminderLeadMinutes !== leadMinutes;
        settings.remindersEnabled = data.enabled;
        settings.reminderTime = data.time;
        settings.reminderLeadMinutes = leadMinutes;
        if (changed) { settings.reminderLastDay = ''; settings.reminderTaskKeys = []; }
        saveSettings();
        checkDueReminders();
        broadcast();
        return true;
      }
      if (action === 'pinSettings') {
        const opacity = Number(data.opacity), scale = Number(data.scale);
        if (!Number.isFinite(opacity) || opacity < 0.35 || opacity > 1 || !Number.isFinite(scale) || scale < 0.75 || scale > 1.5) throw Error(tr('Ungültige Anheft-Einstellung.'));
        settings.pinOpacity = opacity; settings.pinScale = scale;
        saveSettings(); applyPinSettings(); broadcast(); return true;
      }
      if (action === 'quick') {
        showQuick();
        return;
      }
      if (action === 'pinEnabled') {
        settings.pinEnabled = !!data.enabled;
        saveSettings();
        if (settings.pinEnabled) showPinned(); else pinned.hide();
        broadcast(); return;
      }
      if (action === 'resetPinSettings') {
        settings.pinOpacity = defaults.pinOpacity;
        settings.pinScale = defaults.pinScale;
        settings.pinBounds = null;
        settings.pinAutoHeight = true;
        settings.pinCollapsed = false;
        saveSettings(); applyPinSettings(); broadcast(); return;
      }
      if (action === 'pin') { settings.pinEnabled = true; saveSettings(); showPinned(); broadcast(); return; }
      if (action === 'hidePin') { settings.pinEnabled = false; saveSettings(); pinned.hide(); broadcast(); return; }
      if (action === 'pinContentSize') {
        if (event.sender !== pinned.webContents || !settings.pinAutoHeight || settings.pinCollapsed || !Number.isInteger(data.height)) throw Error(tr('Unzulässiger Zugriff.'));
        const current = pinned.getBounds(), next = constrainedPinBounds({...current, height: data.height * settings.pinScale});
        pinUpdating = true;
        pinIgnoreResizeUntil = Date.now() + 200;
        pinned.setBounds(next);
        pinUpdating = false;
        return;
      }
      if (action === 'togglePinCollapsed') {
        settings.pinCollapsed = !settings.pinCollapsed;
        saveSettings(); applyPinSettings(); broadcast(); return;
      }
      if (action === 'openPinnedTask') {
        if (!store.snapshot().tasks.some(task => task.id === data.id)) throw Error(tr('Aufgabe nicht mehr vorhanden.'));
        showMain(); main.webContents.send('app:openTask', data.id); return;
      }
      if(action==='quickExpanded'){
        if(event.sender!==quick.webContents||typeof data.expanded!=='boolean')throw Error(tr('Unzulässiger Zugriff.'));
        const area=screen.getDisplayMatching(quick.getBounds()).workArea;
        const compactHeight=56;
        const requested=Number.isInteger(data.height)?data.height:510;
        const height=data.expanded?Math.min(Math.max(requested,compactHeight),Math.max(compactHeight,area.height-24)):compactHeight;
        const [x,y]=quick.getPosition();
        // Windows pins a non-resizable window's sizing constraints after growth.
        quick.setResizable(true);
        quick.setMinimumSize(500,compactHeight);
        quick.setSize(600,height);
        quick.setResizable(false);
        quick.setPosition(Math.max(area.x,Math.min(x,area.x+area.width-600)),Math.max(area.y+12,Math.min(y,area.y+area.height-height-12)));return;
      }
      if (action === 'hideQuick') {
        quick.hide();
        return;
      }
      if (action === 'quit') {
        app.quit();
        return;
      }
      if (!store) throw Error(tr("Bitte zuerst einen Ablageort wählen."));
      if (action === 'snooze') {
        if (!settings.remindersEnabled) throw Error(tr('Fälligkeitserinnerungen sind ausgeschaltet.'));
        const until = data.preset === 'clear' ? '' : snoozeUntil(data.preset);
        if (data.preset !== 'clear' && !until) throw Error(tr('Ungültige Erinnerungszeit.'));
        const result = store.setSnooze(data.id, until);
        broadcast(); return result;
      }
      if (['create', 'edit', 'toggle', 'delete', 'archive', 'archiveCompleted', 'restore', 'reorder'].includes(action)) {
        const result = store.mutate(action, data);
        checkDueReminders();
        broadcast();
        return result;
      }
      if (action === 'attach') {
        const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
          title: tr("Dateien oder E-Mail (.eml / .msg) hinzufügen"),
          properties: ['openFile', 'multiSelections']
        });
        if (!r.canceled) {
          store.attach(data.id, r.filePaths);
          broadcast();
        }
        return;
      }
      if (action === 'openAttachment') {
        const file = store.attachment(data.id, data.fileId);
        const r = await dialog.showMessageBox(BrowserWindow.fromWebContents(event.sender), {
          type: 'question',
          message: tr("Datei mit der Standardanwendung öffnen?"),
          detail: path.basename(file) + '\nÖffne nur Dateien aus vertrauenswürdigen Quellen.',
          buttons: [tr("Abbrechen"), tr("Öffnen")],
          defaultId: 0,
          cancelId: 0
        });
        if (r.response === 1) {
          const error = await shell.openPath(file);
          if (error) throw Error(error);
        }
        return;
      }
      if (action === 'folder') return shell.openPath(store.dir);
      throw Error(tr("Unbekannte Aktion."));
    });
  }).catch(e => {
    dialog.showErrorBox(tr("Machen konnte nicht starten"), tr(e.message));
    app.quit();
  });
  app.on('activate', () => main && showMain());
  app.on('before-quit', () => {
    quitting = true;
  });
  app.on('will-quit', () => globalShortcut.unregisterAll());
}
