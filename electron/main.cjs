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

const dataHome = process.env.MACHEN_TEST_HOME || path.join(app.getPath('appData'), 'Machen');
app.setPath('userData', dataHome);
app.setName('Machen');
app.commandLine.appendSwitch('enable-features', 'GlobalShortcutsPortal');
let main,
  quick,
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
  theme: 'system',
  language: 'de'
};
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
function windowFor(isQuick = false) {
  const w = new BrowserWindow({
    width: isQuick ? 600 : 1180,
    height: isQuick ? 92 : 820,
    minWidth: isQuick ? 500 : 700,
    minHeight: isQuick ? 92 : 540,
    show: false,
    title: isQuick ? tr("Aufgabe erfassen") : 'Machen',
    roundedCorners: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#171c25' : '#FAFBFD',
    autoHideMenuBar: true,
    resizable: !isQuick,
    minimizable: !isQuick,
    maximizable: !isQuick,
    titleBarStyle: 'default',
    frame: !isQuick,
    hasShadow: true,
    alwaysOnTop: isQuick,
    skipTaskbar: isQuick,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  w.loadFile(path.join(__dirname, '../src/index.html'), {
    query: isQuick ? {
      quick: '1'
    } : {}
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
 {label:'Machen',submenu:[{label:tr('Neue Aufgabe'),accelerator:'CmdOrCtrl+N',click:showQuick},item('quit','Beenden')]},
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
    quick = windowFor(true);
    main.once('ready-to-show', showMain);
    if (!registerShortcut(settings.shortcut)) shortcutError = 'Der globale Shortcut ist belegt. Bitte in den Einstellungen \u00e4ndern.';
    const icon = nativeImage.createFromPath(path.join(__dirname, '../assets/tray.png'));
    tray = new Tray(icon);
    tray.setToolTip('Machen');
    tray.on('click',showMain);
    updateMenus();
    updates = new Updates({version:app.getVersion(), createManager:()=>{
      if(!app.isPackaged || process.env.MACHEN_TEST_HOME)throw Error('Development build');
      return new UpdateManager(new GithubSource(REPOSITORY, undefined, false), {AllowVersionDowngrade:false, ExplicitChannel: `${process.platform==='win32'?'win':process.platform==='darwin'?'osx':'linux'}-${process.arch}`});
    }, notify:next=>main.webContents.send('app:update',next), quit:()=>app.quit()});
    ipcMain.handle('app:call', async (event, action, data = {}) => {
      if (![main.webContents, quick.webContents].includes(event.sender)) throw Error(tr("Unzulässiger Zugriff."));
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
        if (process.platform !== 'linux') app.setLoginItemSettings({
          openAtLogin: settings.autoStart
        });
        saveSettings();
        broadcast();
        return true;
      }
      if (action === 'quick') {
        showQuick();
        return;
      }
      if(action==='quickExpanded'){
        if(event.sender!==quick.webContents||typeof data.expanded!=='boolean')throw Error(tr('Unzulässiger Zugriff.'));
        const area=screen.getDisplayMatching(quick.getBounds()).workArea;
        const compactHeight=92;
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
      if (['create', 'edit', 'toggle', 'delete', 'archive', 'archiveCompleted', 'restore'].includes(action)) {
        const result = store.mutate(action, data);
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
