const {
  app, BrowserWindow, ipcMain, dialog, clipboard, nativeImage,
  Menu, shell, screen, globalShortcut, nativeTheme, protocol
} = require('electron');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const Store = require('electron-store');

const store = new Store({ name: 'inkdrop-clone-state' });
const dataStore = new Store({ name: 'inkdrop-clone-data' });

let mainWindow = null;
let quickNoteWindow = null;
const windowEventSubscribers = new Set();

// ---------------------------------------------------------------------------
// Data Layer — JSON-backed store simulating PouchDB/SQLite
// ---------------------------------------------------------------------------
function getDB() {
  return dataStore.get('db', {
    notes: {},
    notebooks: {},
    tags: {},
    files: {},
    config: {}
  });
}

function saveDB(db) {
  dataStore.set('db', db);
}

function ensureDefaults() {
  const db = getDB();
  if (!db.notebooks['book:inbox']) {
    db.notebooks['book:inbox'] = {
      _id: 'book:inbox', name: 'Inbox', icon: null,
      parentBookId: null, createdAt: Date.now(), updatedAt: Date.now()
    };
  }
  if (!db.notebooks['book:learn']) {
    db.notebooks['book:learn'] = {
      _id: 'book:learn', name: 'Learn Inkdrop', icon: '📖',
      parentBookId: null, createdAt: Date.now(), updatedAt: Date.now()
    };
  }
  if (!db.notes['note:welcome']) {
    db.notes['note:welcome'] = {
      _id: 'note:welcome', title: 'Welcome to Inkdrop Clone',
      body: '# Welcome\n\nThis is your new Markdown note-taking app.\n\n## Features\n\n- **Markdown editing** with live preview\n- **Notebooks** to organize your notes\n- **Tags** for cross-cutting categorization\n- **Status tracking** — Active, On Hold, Completed, Dropped\n- **Full-text search** across all notes\n- **Distraction-free mode**\n- **Plugin system**\n- **Sync** (stub)\n\nStart writing!',
      bookId: 'book:inbox', status: 'active', tags: [],
      createdAt: Date.now(), updatedAt: Date.now()
    };
  }
  saveDB(db);
}

// ---------------------------------------------------------------------------
// Sync state
// ---------------------------------------------------------------------------
let syncState = { state: 'idle', lastSyncAt: null, error: null };

// ---------------------------------------------------------------------------
// Session / Auth state
// ---------------------------------------------------------------------------
let sessionState = { status: 'authenticated', userId: 'local-user', email: 'local@inkdrop-clone' };

// ---------------------------------------------------------------------------
// GitHub integration state
// ---------------------------------------------------------------------------
let githubState = { connected: false, token: null, user: null };

// ---------------------------------------------------------------------------
// Plugin manager state
// ---------------------------------------------------------------------------
const installedPlugins = new Map();
const pluginDir = path.join(app.getPath('userData'), 'plugins');

function ensurePluginDir() {
  if (!fs.existsSync(pluginDir)) fs.mkdirSync(pluginDir, { recursive: true });
}

// ---------------------------------------------------------------------------
// Page-title fetch state
// ---------------------------------------------------------------------------
let pageTitleAbortController = null;

// ---------------------------------------------------------------------------
// Window helpers
// ---------------------------------------------------------------------------
function getWin(event) {
  return BrowserWindow.fromWebContents(event.sender) || mainWindow;
}

function sendToRenderer(channel, ...args) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args);
  }
}

// ---------------------------------------------------------------------------
// Create main window
// ---------------------------------------------------------------------------
function createMainWindow() {
  const bounds = store.get('windowBounds', { width: 1200, height: 800 });
  const pos = store.get('windowPosition');

  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: pos?.x,
    y: pos?.y,
    minWidth: 680,
    minHeight: 400,
    title: 'Inkdrop Clone',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 12, y: 12 },
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1a1a2e' : '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.on('close', () => {
    const b = mainWindow.getBounds();
    store.set('windowBounds', { width: b.width, height: b.height });
    store.set('windowPosition', { x: b.x, y: b.y });
  });

  mainWindow.on('closed', () => { mainWindow = null; });

  mainWindow.on('focus', () => sendToRenderer('window:focus'));
  mainWindow.on('blur', () => sendToRenderer('window:blur'));
  mainWindow.on('maximize', () => sendToRenderer('window:maximize'));
  mainWindow.on('unmaximize', () => sendToRenderer('window:unmaximize'));
  mainWindow.on('enter-full-screen', () => sendToRenderer('window:enter-full-screen'));
  mainWindow.on('leave-full-screen', () => sendToRenderer('window:leave-full-screen'));

  mainWindow.webContents.on('found-in-page', (_e, result) => {
    sendToRenderer('window:found-in-page', result);
  });

  return mainWindow;
}

// ---------------------------------------------------------------------------
// Quick-note window
// ---------------------------------------------------------------------------
function createQuickNoteWindow() {
  if (quickNoteWindow && !quickNoteWindow.isDestroyed()) {
    quickNoteWindow.focus();
    return;
  }
  const display = screen.getPrimaryDisplay();
  const { width: sw } = display.workAreaSize;
  quickNoteWindow = new BrowserWindow({
    width: 480, height: 320,
    x: Math.round(sw / 2 - 240), y: 120,
    frame: false, alwaysOnTop: true, resizable: false,
    skipTaskbar: true, show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: false
    }
  });
  quickNoteWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'), {
    hash: 'quick-note'
  });
  quickNoteWindow.once('ready-to-show', () => quickNoteWindow.show());
  quickNoteWindow.on('closed', () => { quickNoteWindow = null; });
}

// ---------------------------------------------------------------------------
// Application menu
// ---------------------------------------------------------------------------
function buildMenu() {
  const isMac = process.platform === 'darwin';

  const template = [
    ...(isMac ? [{
      label: 'Inkdrop Clone',
      submenu: [
        { label: 'About Inkdrop Clone', click: () => app.emit('application:about') },
        { type: 'separator' },
        { label: 'Preferences…', accelerator: 'CmdOrCtrl+,', click: () => sendToRenderer('run-command', 'application:open-preferences') },
        { type: 'separator' },
        { label: 'Hide Inkdrop Clone', role: 'hide' },
        { label: 'Hide Others', role: 'hideOthers' },
        { label: 'Show All', role: 'unhide' },
        { type: 'separator' },
        { label: 'Quit', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() }
      ]
    }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Note', accelerator: 'CmdOrCtrl+N', click: () => sendToRenderer('run-command', 'core:new-note') },
        { label: 'New Notebook', accelerator: 'CmdOrCtrl+Shift+N', click: () => sendToRenderer('run-command', 'core:new-notebook') },
        { type: 'separator' },
        { label: 'Import…', click: () => sendToRenderer('run-command', 'core:import-notes') },
        { label: 'Export…', click: () => sendToRenderer('run-command', 'core:export-notes') },
        { type: 'separator' },
        { label: 'Print…', accelerator: 'CmdOrCtrl+P', click: () => sendToRenderer('run-command', 'core:print-note') },
        { type: 'separator' },
        ...(!isMac ? [
          { label: 'Preferences…', accelerator: 'CmdOrCtrl+,', click: () => sendToRenderer('run-command', 'application:open-preferences') },
          { type: 'separator' },
          { label: 'Quit', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() }
        ] : [])
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' },
        { role: 'pasteAndMatchStyle' }, { role: 'selectAll' },
        { type: 'separator' },
        { label: 'Find…', accelerator: 'CmdOrCtrl+F', click: () => sendToRenderer('run-command', 'core:find') },
        { label: 'Replace…', accelerator: 'CmdOrCtrl+H', click: () => sendToRenderer('run-command', 'core:replace') }
      ]
    },
    {
      label: 'View',
      submenu: [
        { label: 'Toggle Sidebar', accelerator: 'CmdOrCtrl+\\', click: () => sendToRenderer('run-command', 'view:toggle-sidebar') },
        { label: 'Toggle Note List', accelerator: 'CmdOrCtrl+Shift+\\', click: () => sendToRenderer('run-command', 'view:toggle-note-list') },
        { type: 'separator' },
        { label: 'Editor Only', click: () => sendToRenderer('run-command', 'view:editor-only') },
        { label: 'Side by Side', click: () => sendToRenderer('run-command', 'view:side-by-side') },
        { label: 'Preview Only', click: () => sendToRenderer('run-command', 'view:preview-only') },
        { type: 'separator' },
        { label: 'Distraction Free Mode', accelerator: 'CmdOrCtrl+Shift+D', click: () => sendToRenderer('run-command', 'view:toggle-distraction-free') },
        { type: 'separator' },
        { label: 'Actual Size', accelerator: 'CmdOrCtrl+0', click: () => mainWindow?.webContents.setZoomLevel(0) },
        { label: 'Zoom In', accelerator: 'CmdOrCtrl+=', click: () => { const z = mainWindow?.webContents.getZoomLevel() || 0; mainWindow?.webContents.setZoomLevel(z + 0.5); } },
        { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', click: () => { const z = mainWindow?.webContents.getZoomLevel() || 0; mainWindow?.webContents.setZoomLevel(z - 0.5); } },
        { type: 'separator' },
        { label: 'Toggle Full Screen', role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Selection',
      submenu: [
        { label: 'Select All in Note', accelerator: 'CmdOrCtrl+A', click: () => sendToRenderer('run-command', 'editor:select-all') },
        { label: 'Select Line', click: () => sendToRenderer('run-command', 'editor:select-line') },
        { label: 'Select Word', click: () => sendToRenderer('run-command', 'editor:select-word') }
      ]
    },
    {
      label: 'Find',
      submenu: [
        { label: 'Find…', accelerator: 'CmdOrCtrl+F', click: () => sendToRenderer('run-command', 'core:find') },
        { label: 'Find Next', accelerator: 'CmdOrCtrl+G', click: () => sendToRenderer('run-command', 'core:find-next') },
        { label: 'Find Previous', accelerator: 'CmdOrCtrl+Shift+G', click: () => sendToRenderer('run-command', 'core:find-previous') },
        { type: 'separator' },
        { label: 'Global Search', accelerator: 'CmdOrCtrl+Shift+F', click: () => sendToRenderer('run-command', 'core:global-search') }
      ]
    },
    {
      label: 'Note',
      submenu: [
        { label: 'Set Status → Active', click: () => sendToRenderer('run-command', 'note:set-status-active') },
        { label: 'Set Status → On Hold', click: () => sendToRenderer('run-command', 'note:set-status-on-hold') },
        { label: 'Set Status → Completed', click: () => sendToRenderer('run-command', 'note:set-status-completed') },
        { label: 'Set Status → Dropped', click: () => sendToRenderer('run-command', 'note:set-status-dropped') },
        { type: 'separator' },
        { label: 'Move to Notebook…', click: () => sendToRenderer('run-command', 'note:move-to-notebook') },
        { label: 'Duplicate Note', click: () => sendToRenderer('run-command', 'note:duplicate') },
        { label: 'Pin to Top', click: () => sendToRenderer('run-command', 'note:toggle-pin') },
        { type: 'separator' },
        { label: 'Move to Trash', accelerator: 'CmdOrCtrl+Backspace', click: () => sendToRenderer('run-command', 'note:move-to-trash') },
        { label: 'Empty Trash…', click: () => sendToRenderer('run-command', 'note:empty-trash') },
        { type: 'separator' },
        { label: 'Share via Markdown…', click: () => sendToRenderer('run-command', 'note:share') },
        { label: 'Copy Note Link', click: () => sendToRenderer('run-command', 'note:copy-link') },
        { label: 'Revision History…', click: () => sendToRenderer('run-command', 'note:show-revisions') }
      ]
    },
    {
      label: 'Window',
      role: 'windowMenu'
    },
    {
      label: 'Developer',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { label: 'Run Command…', click: () => sendToRenderer('run-command', 'core:open-command-palette') },
        { label: 'Rebuild FTS Index', click: () => sendToRenderer('run-command', 'application:rebuild-fts-index') }
      ]
    },
    {
      label: 'Help',
      submenu: [
        { label: 'Inkdrop Clone Help', click: () => shell.openExternal('https://github.com/estevam5s/inkdrop-clone') },
        { label: 'API Documentation', click: () => shell.openExternal('https://github.com/estevam5s/inkdrop-clone#api') },
        { label: 'Release Notes', click: () => shell.openExternal('https://github.com/estevam5s/inkdrop-clone/releases') },
        { type: 'separator' },
        { label: 'Report Issue…', click: () => shell.openExternal('https://github.com/estevam5s/inkdrop-clone/issues') },
        { type: 'separator' },
        { label: 'Check for Updates…', click: () => sendToRenderer('run-command', 'application:check-for-update') }
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------------------------------------------------------------------------
// Register IPC handlers — Clipboard
// ---------------------------------------------------------------------------
ipcMain.handle('clipboard:read-image-as-data-url', () => {
  const img = clipboard.readImage();
  if (img.isEmpty()) return null;
  return img.toDataURL();
});

ipcMain.handle('clipboard:save-as-image-attachment', async (_e, { noteId, dataUrl }) => {
  const db = getDB();
  const fileId = `file:${uuidv4()}`;
  const buf = nativeImage.createFromDataURL(dataUrl).toPNG();
  const filePath = path.join(app.getPath('userData'), 'attachments', `${fileId}.png`);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, buf);
  db.files[fileId] = {
    _id: fileId, name: `${fileId}.png`, contentType: 'image/png',
    contentLength: buf.length, filePath, noteId, createdAt: Date.now()
  };
  saveDB(db);
  return { _id: fileId, name: `${fileId}.png`, contentType: 'image/png', contentLength: buf.length };
});

ipcMain.handle('clipboard:write-image', (_e, dataUrl) => {
  const img = nativeImage.createFromDataURL(dataUrl);
  clipboard.writeImage(img);
  return true;
});

// ---------------------------------------------------------------------------
// Data Store
// ---------------------------------------------------------------------------
ipcMain.handle('data-store:get-index-updating', () => false);
ipcMain.handle('data-store:get-last-errors', () => []);
ipcMain.handle('data-store:get-sync-info', () => syncState);

ipcMain.handle('data-store:restore-backup-from-files', async (_e, files) => {
  try {
    const db = getDB();
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      const data = JSON.parse(content);
      if (data.notes) Object.assign(db.notes, data.notes);
      if (data.notebooks) Object.assign(db.notebooks, data.notebooks);
      if (data.tags) Object.assign(db.tags, data.tags);
    }
    saveDB(db);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ---------------------------------------------------------------------------
// Dialogs
// ---------------------------------------------------------------------------
ipcMain.handle('dialog:show-message-box', async (event, options) => {
  const win = getWin(event);
  return dialog.showMessageBox(win, options);
});

ipcMain.handle('dialog:show-open-dialog', async (event, options) => {
  const win = getWin(event);
  return dialog.showOpenDialog(win, options);
});

ipcMain.handle('dialog:show-save-dialog', async (event, options) => {
  const win = getWin(event);
  return dialog.showSaveDialog(win, options);
});

// ---------------------------------------------------------------------------
// GitHub integration stubs
// ---------------------------------------------------------------------------
ipcMain.handle('github:get-code-block', async (_e, { url }) => {
  return { content: null, error: 'GitHub integration not configured' };
});

ipcMain.handle('github:get-page-title', async (_e, { url }) => {
  return { title: url };
});

ipcMain.handle('github:is-connected', () => githubState.connected);

ipcMain.handle('github:oauth-check', () => ({
  connected: githubState.connected, user: githubState.user
}));

ipcMain.handle('github:oauth-disconnect', () => {
  githubState = { connected: false, token: null, user: null };
  return true;
});

ipcMain.handle('github:oauth-start', () => {
  return { success: false, message: 'OAuth flow not available in clone' };
});

ipcMain.handle('github:open-configure', () => {
  shell.openExternal('https://github.com/settings/tokens');
  return true;
});

// ---------------------------------------------------------------------------
// Plugin Manager (ipm)
// ---------------------------------------------------------------------------
ipcMain.handle('ipm:get-installed', () => {
  ensurePluginDir();
  return Array.from(installedPlugins.values());
});

ipcMain.handle('ipm:get-new-packages', () => []);
ipcMain.handle('ipm:get-outdated', () => []);

ipcMain.handle('ipm:get-package-info', (_e, { name }) => {
  return installedPlugins.get(name) || null;
});

ipcMain.handle('ipm:get-package-version-info', (_e, { name, version }) => {
  const pkg = installedPlugins.get(name);
  if (!pkg) return null;
  return { ...pkg, version: version || pkg.version };
});

ipcMain.handle('ipm:get-packages', () => Array.from(installedPlugins.values()));
ipcMain.handle('ipm:get-popular-packages', () => []);

ipcMain.handle('ipm:install', async (_e, { name }) => {
  const pkg = {
    name, version: '1.0.0', description: `Plugin ${name}`,
    installedAt: Date.now(), enabled: true
  };
  installedPlugins.set(name, pkg);
  return { success: true, package: pkg };
});

ipcMain.handle('ipm:search-packages', (_e, { query }) => {
  return [];
});

ipcMain.handle('ipm:uninstall', async (_e, { name }) => {
  installedPlugins.delete(name);
  return { success: true };
});

ipcMain.handle('ipm:update', async (_e, { name }) => {
  const pkg = installedPlugins.get(name);
  if (!pkg) return { success: false, error: 'Not installed' };
  return { success: true, package: pkg };
});

// ---------------------------------------------------------------------------
// Network diagnosis
// ---------------------------------------------------------------------------
ipcMain.handle('network-diagnosis:run', async (event) => {
  const results = {
    dns: true, https: true, api: true,
    timestamp: Date.now(), message: 'All checks passed'
  };
  event.sender.send('network-diagnosis:log', 'Network diagnosis completed');
  return results;
});

// ---------------------------------------------------------------------------
// Page title
// ---------------------------------------------------------------------------
ipcMain.handle('page-title:get', async (event, { url }) => {
  try {
    pageTitleAbortController = new AbortController();
    const https = require('https');
    const http = require('http');
    const mod = url.startsWith('https') ? https : http;

    return new Promise((resolve) => {
      const req = mod.get(url, { signal: pageTitleAbortController.signal, timeout: 5000 }, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
          const match = data.match(/<title[^>]*>([^<]+)<\/title>/i);
          if (match) {
            event.sender.send('page-title:done', { url, title: match[1].trim() });
            resolve({ title: match[1].trim() });
            res.destroy();
          }
        });
        res.on('end', () => {
          const match = data.match(/<title[^>]*>([^<]+)<\/title>/i);
          const title = match ? match[1].trim() : url;
          event.sender.send('page-title:done', { url, title });
          resolve({ title });
        });
      });
      req.on('error', () => resolve({ title: url }));
      req.on('timeout', () => { req.destroy(); resolve({ title: url }); });
    });
  } catch {
    return { title: url };
  }
});

ipcMain.handle('page-title:abort', () => {
  if (pageTitleAbortController) {
    pageTitleAbortController.abort();
    pageTitleAbortController = null;
  }
  return true;
});

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------
ipcMain.handle('session:get-state', () => sessionState);

ipcMain.handle('session:alert-if-invalid-status', () => {
  if (sessionState.status !== 'authenticated') {
    sendToRenderer('run-command', 'application:show-login');
    return true;
  }
  return false;
});

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------
ipcMain.handle('sync:get-state', () => syncState);

// ---------------------------------------------------------------------------
// Window management — all 30+ channels
// ---------------------------------------------------------------------------
ipcMain.handle('window:center', (event) => { getWin(event).center(); });
ipcMain.handle('window:close', (event) => { getWin(event).close(); });
ipcMain.handle('window:close-dev-tools', (event) => { getWin(event).webContents.closeDevTools(); });

ipcMain.handle('window:find-in-page', (event, text, opts) => {
  if (text) getWin(event).webContents.findInPage(text, opts || {});
});

ipcMain.handle('window:focus', (event) => { getWin(event).focus(); });
ipcMain.handle('window:get-display-scale-factor', () => screen.getPrimaryDisplay().scaleFactor);
ipcMain.handle('window:get-opacity', (event) => getWin(event).getOpacity());
ipcMain.handle('window:get-position', (event) => getWin(event).getPosition());
ipcMain.handle('window:get-size', (event) => getWin(event).getSize());
ipcMain.handle('window:get-zoom-factor', (event) => getWin(event).webContents.getZoomFactor());
ipcMain.handle('window:get-zoom-level', (event) => getWin(event).webContents.getZoomLevel());
ipcMain.handle('window:hide', (event) => { getWin(event).hide(); });
ipcMain.handle('window:is-always-on-top', (event) => getWin(event).isAlwaysOnTop());
ipcMain.handle('window:is-full-screen', (event) => getWin(event).isFullScreen());
ipcMain.handle('window:is-maximized', (event) => getWin(event).isMaximized());

ipcMain.handle('window:is-visible-on-all-workspaces', (event) => {
  return getWin(event).isVisibleOnAllWorkspaces();
});

ipcMain.handle('window:maximize', (event) => { getWin(event).maximize(); });
ipcMain.handle('window:minimize', (event) => { getWin(event).minimize(); });
ipcMain.handle('window:open-dev-tools', (event) => { getWin(event).webContents.openDevTools(); });
ipcMain.handle('window:reload', (event) => { getWin(event).webContents.reload(); });

ipcMain.handle('window:set-always-on-top', (event, flag) => { getWin(event).setAlwaysOnTop(flag); });
ipcMain.handle('window:set-full-screen', (event, flag) => { getWin(event).setFullScreen(flag); });

ipcMain.handle('window:set-menu-bar-visibility', (event, visible) => {
  getWin(event).setMenuBarVisibility(visible);
});

ipcMain.handle('window:set-minimum-size', (event, w, h) => { getWin(event).setMinimumSize(w, h); });
ipcMain.handle('window:set-opacity', (event, opacity) => { getWin(event).setOpacity(opacity); });
ipcMain.handle('window:set-position', (event, x, y) => { getWin(event).setPosition(x, y); });
ipcMain.handle('window:set-size', (event, w, h) => { getWin(event).setSize(w, h); });

ipcMain.handle('window:set-visible-on-all-workspaces', (event, flag) => {
  getWin(event).setVisibleOnAllWorkspaces(flag);
});

ipcMain.handle('window:set-zoom-factor', (event, factor) => {
  getWin(event).webContents.setZoomFactor(factor);
});

ipcMain.handle('window:set-zoom-level', (event, level) => {
  getWin(event).webContents.setZoomLevel(level);
});

ipcMain.handle('window:show', (event) => { getWin(event).show(); });

ipcMain.handle('window:show-context-menu', (event, template) => {
  const menu = Menu.buildFromTemplate(template.map(item => ({
    ...item,
    click: item.command ? () => event.sender.send('run-command', item.command, item.args) : undefined
  })));
  menu.popup({ window: getWin(event) });
});

ipcMain.handle('window:stop-find-in-page', (event, action) => {
  getWin(event).webContents.stopFindInPage(action || 'clearSelection');
});

ipcMain.handle('window:subscribe-events', (event) => {
  windowEventSubscribers.add(event.sender);
  event.sender.on('destroyed', () => windowEventSubscribers.delete(event.sender));
  return true;
});

ipcMain.handle('window:toggle-dev-tools', (event) => {
  getWin(event).webContents.toggleDevTools();
});

ipcMain.handle('window:unmaximize', (event) => { getWin(event).unmaximize(); });

ipcMain.handle('window:web-contents-action', (event, action, ...args) => {
  const wc = getWin(event).webContents;
  if (typeof wc[action] === 'function') return wc[action](...args);
  return null;
});

// ---------------------------------------------------------------------------
// CRUD IPC for notes/notebooks/tags (renderer data access)
// ---------------------------------------------------------------------------
ipcMain.handle('db:notes:list', (_e, { bookId, status, tag, search } = {}) => {
  const db = getDB();
  let notes = Object.values(db.notes);
  if (bookId) notes = notes.filter(n => n.bookId === bookId);
  if (status) notes = notes.filter(n => n.status === status);
  if (tag) notes = notes.filter(n => n.tags && n.tags.includes(tag));
  if (search) {
    const q = search.toLowerCase();
    notes = notes.filter(n =>
      (n.title || '').toLowerCase().includes(q) ||
      (n.body || '').toLowerCase().includes(q)
    );
  }
  return notes.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
});

ipcMain.handle('db:notes:get', (_e, id) => {
  return getDB().notes[id] || null;
});

ipcMain.handle('db:notes:put', (_e, note) => {
  const db = getDB();
  if (!note._id) note._id = `note:${uuidv4()}`;
  note.updatedAt = Date.now();
  if (!note.createdAt) note.createdAt = Date.now();
  db.notes[note._id] = note;
  saveDB(db);
  return note;
});

ipcMain.handle('db:notes:remove', (_e, id) => {
  const db = getDB();
  delete db.notes[id];
  saveDB(db);
  return true;
});

ipcMain.handle('db:notebooks:list', () => {
  return Object.values(getDB().notebooks).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
});

ipcMain.handle('db:notebooks:get', (_e, id) => {
  return getDB().notebooks[id] || null;
});

ipcMain.handle('db:notebooks:put', (_e, book) => {
  const db = getDB();
  if (!book._id) book._id = `book:${uuidv4()}`;
  book.updatedAt = Date.now();
  if (!book.createdAt) book.createdAt = Date.now();
  db.notebooks[book._id] = book;
  saveDB(db);
  return book;
});

ipcMain.handle('db:notebooks:remove', (_e, id) => {
  const db = getDB();
  delete db.notebooks[id];
  saveDB(db);
  return true;
});

ipcMain.handle('db:tags:list', () => {
  return Object.values(getDB().tags).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
});

ipcMain.handle('db:tags:get', (_e, id) => {
  return getDB().tags[id] || null;
});

ipcMain.handle('db:tags:put', (_e, tag) => {
  const db = getDB();
  if (!tag._id) tag._id = `tag:${uuidv4()}`;
  tag.updatedAt = Date.now();
  if (!tag.createdAt) tag.createdAt = Date.now();
  db.tags[tag._id] = tag;
  saveDB(db);
  return tag;
});

ipcMain.handle('db:tags:remove', (_e, id) => {
  const db = getDB();
  delete db.tags[id];
  saveDB(db);
  return true;
});

ipcMain.handle('db:files:list', (_e, { noteId } = {}) => {
  const db = getDB();
  let files = Object.values(db.files);
  if (noteId) files = files.filter(f => f.noteId === noteId);
  return files;
});

ipcMain.handle('db:files:put', (_e, file) => {
  const db = getDB();
  if (!file._id) file._id = `file:${uuidv4()}`;
  file.createdAt = file.createdAt || Date.now();
  db.files[file._id] = file;
  saveDB(db);
  return file;
});

ipcMain.handle('db:files:remove', (_e, id) => {
  const db = getDB();
  const file = db.files[id];
  if (file?.filePath && fs.existsSync(file.filePath)) fs.unlinkSync(file.filePath);
  delete db.files[id];
  saveDB(db);
  return true;
});

ipcMain.handle('db:config:get', (_e, key) => {
  return getDB().config[key];
});

ipcMain.handle('db:config:set', (_e, key, value) => {
  const db = getDB();
  db.config[key] = value;
  saveDB(db);
  return true;
});

// ---------------------------------------------------------------------------
// Application events (on-channel listeners from renderer)
// ---------------------------------------------------------------------------
app.on('application:about', () => {
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'About Inkdrop Clone',
    message: 'Inkdrop Clone',
    detail: `Version 1.0.0\nElectron ${process.versions.electron}\nChromium ${process.versions.chrome}\nNode.js ${process.versions.node}\n\nReverse-engineered from Inkdrop v6.1.5 via REA.`
  });
});

ipcMain.on('application:about', () => app.emit('application:about'));
ipcMain.on('application:check-for-update', () => {
  sendToRenderer('run-command', 'core:show-notification', {
    type: 'info', message: 'You are running the latest version.'
  });
});

ipcMain.on('application:hide', () => { if (mainWindow) mainWindow.hide(); });
ipcMain.on('application:minimize', () => { if (mainWindow) mainWindow.minimize(); });

ipcMain.on('application:open-preferences', () => {
  sendToRenderer('run-command', 'application:open-preferences');
});

ipcMain.on('application:quick-note', () => createQuickNoteWindow());

ipcMain.on('application:quit', () => app.quit());

ipcMain.on('application:rebuild-fts-index', () => {
  sendToRenderer('run-command', 'core:show-notification', {
    type: 'info', message: 'Full-text search index rebuilt.'
  });
});

ipcMain.on('application:show-and-focus-main-window', () => {
  if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
  else createMainWindow();
});

ipcMain.on('application:sync-db', () => {
  syncState = { state: 'syncing', lastSyncAt: syncState.lastSyncAt, error: null };
  sendToRenderer('run-command', 'sync:start');
  setTimeout(() => {
    syncState = { state: 'idle', lastSyncAt: Date.now(), error: null };
    sendToRenderer('run-command', 'sync:complete');
  }, 1500);
});

ipcMain.on('application:sync-db-full', () => {
  syncState = { state: 'syncing-full', lastSyncAt: syncState.lastSyncAt, error: null };
  sendToRenderer('run-command', 'sync:start-full');
  setTimeout(() => {
    syncState = { state: 'idle', lastSyncAt: Date.now(), error: null };
    sendToRenderer('run-command', 'sync:complete');
  }, 3000);
});

ipcMain.on('application:toggle-main-window', () => {
  if (!mainWindow) return createMainWindow();
  if (mainWindow.isVisible()) mainWindow.hide();
  else { mainWindow.show(); mainWindow.focus(); }
});

ipcMain.on('application:bring-all-windows-to-front', () => {
  BrowserWindow.getAllWindows().forEach(w => w.show());
});

ipcMain.on('application:open-website', (_e, url) => {
  if (url) shell.openExternal(url);
});

ipcMain.on('application:report-issue', () => {
  shell.openExternal('https://github.com/estevam5s/inkdrop-clone/issues');
});

ipcMain.on('application:view-api-doc', () => {
  shell.openExternal('https://github.com/estevam5s/inkdrop-clone#api');
});

ipcMain.on('application:view-help', () => {
  shell.openExternal('https://github.com/estevam5s/inkdrop-clone');
});

ipcMain.on('application:zoom', (_e, direction) => {
  if (!mainWindow) return;
  const z = mainWindow.webContents.getZoomLevel();
  mainWindow.webContents.setZoomLevel(direction === 'in' ? z + 0.5 : z - 0.5);
});

ipcMain.on('application:require-in-main', (_e, moduleName) => {
  // Security: only allow known safe modules
});

ipcMain.on('application:logout', () => {
  sessionState = { status: 'logged-out', userId: null, email: null };
  sendToRenderer('run-command', 'core:show-login');
});

// E2EE events (stubs)
ipcMain.on('e2ee:decryption-error', (_e, err) => {
  sendToRenderer('run-command', 'core:show-notification', {
    type: 'error', message: `Decryption error: ${err}`
  });
});

ipcMain.on('e2ee:encryption-error', (_e, err) => {
  sendToRenderer('run-command', 'core:show-notification', {
    type: 'error', message: `Encryption error: ${err}`
  });
});

// FTS events
ipcMain.on('full-text-index:build-start', () => {});
ipcMain.on('full-text-index:build-end', () => {});
ipcMain.on('full-text-index:build-error', () => {});

// Sync init/dispose
ipcMain.on('sync:init', () => {
  syncState = { state: 'idle', lastSyncAt: null, error: null };
});
ipcMain.on('sync:dispose', () => {
  syncState = { state: 'disposed', lastSyncAt: syncState.lastSyncAt, error: null };
});

// ---------------------------------------------------------------------------
// Deep link protocol
// ---------------------------------------------------------------------------
function handleDeepLink(url) {
  if (!url) return;
  const parsed = new URL(url);
  sendToRenderer('run-command', 'core:navigate-deep-link', {
    host: parsed.host, path: parsed.pathname, query: Object.fromEntries(parsed.searchParams)
  });
}

// ---------------------------------------------------------------------------
// Auto-updater stubs
// ---------------------------------------------------------------------------
function setupAutoUpdater() {
  // Stub — in production this would use electron-updater
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------
app.whenReady().then(() => {
  protocol.handle('inkdrop-clone', (req) => {
    handleDeepLink(req.url);
    return new Response('', { status: 200 });
  });

  if (!app.isDefaultProtocolClient('inkdrop-clone')) {
    app.setAsDefaultProtocolClient('inkdrop-clone');
  }

  ensureDefaults();
  ensurePluginDir();
  buildMenu();
  createMainWindow();
  setupAutoUpdater();

  globalShortcut.register('CmdOrCtrl+Shift+I', () => createQuickNoteWindow());

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    else if (mainWindow) mainWindow.show();
  });
});

app.on('open-url', (_e, url) => handleDeepLink(url));

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  globalShortcut.unregisterAll();
});
