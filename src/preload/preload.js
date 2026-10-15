const { contextBridge, ipcRenderer } = require('electron');
const { marked } = require('marked');

// ---------------------------------------------------------------------------
// Command registry (renderer-side)
// ---------------------------------------------------------------------------
const commandHandlers = new Map();
const commandDisposables = [];

// ---------------------------------------------------------------------------
// Notification system
// ---------------------------------------------------------------------------
const notificationListeners = new Set();

// ---------------------------------------------------------------------------
// Keymap system
// ---------------------------------------------------------------------------
const keymapBindings = new Map();

// ---------------------------------------------------------------------------
// Layout state
// ---------------------------------------------------------------------------
const layoutState = {
  sidebarWidth: 220,
  noteListWidth: 280,
  sidebarVisible: true,
  noteListVisible: true
};

// ---------------------------------------------------------------------------
// Editor lifecycle
// ---------------------------------------------------------------------------
const editorCallbacks = { onLoad: [], onUnload: [] };

// ---------------------------------------------------------------------------
// Style management
// ---------------------------------------------------------------------------
const styleSheets = new Map();

// ---------------------------------------------------------------------------
// Theme management
// ---------------------------------------------------------------------------
let currentTheme = { ui: 'default-dark', syntax: 'default-dark' };

// ---------------------------------------------------------------------------
// Context Bridge — window.inkdropPreload
// ---------------------------------------------------------------------------
contextBridge.exposeInMainWorld('inkdropPreload', {

  // --- Platform info ---
  platform: process.platform,
  arch: process.arch,
  electronVersion: process.versions.electron,
  chromeVersion: process.versions.chrome,

  // --- Window management ---
  window: {
    center: () => ipcRenderer.invoke('window:center'),
    close: () => ipcRenderer.invoke('window:close'),
    closeDevTools: () => ipcRenderer.invoke('window:close-dev-tools'),
    findInPage: (text, opts) => ipcRenderer.invoke('window:find-in-page', text, opts),
    focus: () => ipcRenderer.invoke('window:focus'),
    getDisplayScaleFactor: () => ipcRenderer.invoke('window:get-display-scale-factor'),
    getOpacity: () => ipcRenderer.invoke('window:get-opacity'),
    getPosition: () => ipcRenderer.invoke('window:get-position'),
    getSize: () => ipcRenderer.invoke('window:get-size'),
    getZoomFactor: () => ipcRenderer.invoke('window:get-zoom-factor'),
    getZoomLevel: () => ipcRenderer.invoke('window:get-zoom-level'),
    hide: () => ipcRenderer.invoke('window:hide'),
    isAlwaysOnTop: () => ipcRenderer.invoke('window:is-always-on-top'),
    isFullScreen: () => ipcRenderer.invoke('window:is-full-screen'),
    isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
    isVisibleOnAllWorkspaces: () => ipcRenderer.invoke('window:is-visible-on-all-workspaces'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    minimize: () => ipcRenderer.invoke('window:minimize'),
    openDevTools: () => ipcRenderer.invoke('window:open-dev-tools'),
    reload: () => ipcRenderer.invoke('window:reload'),
    setAlwaysOnTop: (flag) => ipcRenderer.invoke('window:set-always-on-top', flag),
    setFullScreen: (flag) => ipcRenderer.invoke('window:set-full-screen', flag),
    setMenuBarVisibility: (visible) => ipcRenderer.invoke('window:set-menu-bar-visibility', visible),
    setMinimumSize: (w, h) => ipcRenderer.invoke('window:set-minimum-size', w, h),
    setOpacity: (opacity) => ipcRenderer.invoke('window:set-opacity', opacity),
    setPosition: (x, y) => ipcRenderer.invoke('window:set-position', x, y),
    setSize: (w, h) => ipcRenderer.invoke('window:set-size', w, h),
    setVisibleOnAllWorkspaces: (flag) => ipcRenderer.invoke('window:set-visible-on-all-workspaces', flag),
    setZoomFactor: (factor) => ipcRenderer.invoke('window:set-zoom-factor', factor),
    setZoomLevel: (level) => ipcRenderer.invoke('window:set-zoom-level', level),
    show: () => ipcRenderer.invoke('window:show'),
    showContextMenu: (template) => ipcRenderer.invoke('window:show-context-menu', template),
    stopFindInPage: (action) => ipcRenderer.invoke('window:stop-find-in-page', action),
    subscribeEvents: () => ipcRenderer.invoke('window:subscribe-events'),
    toggleDevTools: () => ipcRenderer.invoke('window:toggle-dev-tools'),
    unmaximize: () => ipcRenderer.invoke('window:unmaximize'),
    webContentsAction: (action, ...args) => ipcRenderer.invoke('window:web-contents-action', action, ...args)
  },

  // --- Clipboard ---
  clipboard: {
    readImageAsDataUrl: () => ipcRenderer.invoke('clipboard:read-image-as-data-url'),
    saveAsImageAttachment: (noteId, dataUrl) => ipcRenderer.invoke('clipboard:save-as-image-attachment', { noteId, dataUrl }),
    writeImage: (dataUrl) => ipcRenderer.invoke('clipboard:write-image', dataUrl)
  },

  // --- Dialogs ---
  dialog: {
    showMessageBox: (options) => ipcRenderer.invoke('dialog:show-message-box', options),
    showOpenDialog: (options) => ipcRenderer.invoke('dialog:show-open-dialog', options),
    showSaveDialog: (options) => ipcRenderer.invoke('dialog:show-save-dialog', options)
  },

  // --- GitHub integration ---
  github: {
    getCodeBlock: (url) => ipcRenderer.invoke('github:get-code-block', { url }),
    getPageTitle: (url) => ipcRenderer.invoke('github:get-page-title', { url }),
    isConnected: () => ipcRenderer.invoke('github:is-connected'),
    oauthCheck: () => ipcRenderer.invoke('github:oauth-check'),
    oauthDisconnect: () => ipcRenderer.invoke('github:oauth-disconnect'),
    oauthStart: () => ipcRenderer.invoke('github:oauth-start'),
    openConfigure: () => ipcRenderer.invoke('github:open-configure')
  },

  // --- Plugin manager (ipm) ---
  ipm: {
    getInstalled: () => ipcRenderer.invoke('ipm:get-installed'),
    getNewPackages: () => ipcRenderer.invoke('ipm:get-new-packages'),
    getOutdated: () => ipcRenderer.invoke('ipm:get-outdated'),
    getPackageInfo: (name) => ipcRenderer.invoke('ipm:get-package-info', { name }),
    getPackageVersionInfo: (name, version) => ipcRenderer.invoke('ipm:get-package-version-info', { name, version }),
    getPackages: () => ipcRenderer.invoke('ipm:get-packages'),
    getPopularPackages: () => ipcRenderer.invoke('ipm:get-popular-packages'),
    install: (name) => ipcRenderer.invoke('ipm:install', { name }),
    searchPackages: (query) => ipcRenderer.invoke('ipm:search-packages', { query }),
    uninstall: (name) => ipcRenderer.invoke('ipm:uninstall', { name }),
    update: (name) => ipcRenderer.invoke('ipm:update', { name })
  },

  // --- Sync ---
  sync: {
    getState: () => ipcRenderer.invoke('sync:get-state'),
    start: () => ipcRenderer.send('application:sync-db'),
    startFull: () => ipcRenderer.send('application:sync-db-full')
  },

  // --- Session ---
  session: {
    getState: () => ipcRenderer.invoke('session:get-state'),
    alertIfInvalid: () => ipcRenderer.invoke('session:alert-if-invalid-status')
  },

  // --- Data store ---
  dataStore: {
    getIndexUpdating: () => ipcRenderer.invoke('data-store:get-index-updating'),
    getLastErrors: () => ipcRenderer.invoke('data-store:get-last-errors'),
    getSyncInfo: () => ipcRenderer.invoke('data-store:get-sync-info'),
    restoreBackupFromFiles: (files) => ipcRenderer.invoke('data-store:restore-backup-from-files', files)
  },

  // --- Network ---
  network: {
    runDiagnosis: () => ipcRenderer.invoke('network-diagnosis:run')
  },

  // --- Page title ---
  pageTitle: {
    get: (url) => ipcRenderer.invoke('page-title:get', { url }),
    abort: () => ipcRenderer.invoke('page-title:abort')
  },

  // --- Database CRUD ---
  db: {
    notes: {
      list: (opts) => ipcRenderer.invoke('db:notes:list', opts),
      get: (id) => ipcRenderer.invoke('db:notes:get', id),
      put: (note) => ipcRenderer.invoke('db:notes:put', note),
      remove: (id) => ipcRenderer.invoke('db:notes:remove', id)
    },
    notebooks: {
      list: () => ipcRenderer.invoke('db:notebooks:list'),
      get: (id) => ipcRenderer.invoke('db:notebooks:get', id),
      put: (book) => ipcRenderer.invoke('db:notebooks:put', book),
      remove: (id) => ipcRenderer.invoke('db:notebooks:remove', id)
    },
    tags: {
      list: () => ipcRenderer.invoke('db:tags:list'),
      get: (id) => ipcRenderer.invoke('db:tags:get', id),
      put: (tag) => ipcRenderer.invoke('db:tags:put', tag),
      remove: (id) => ipcRenderer.invoke('db:tags:remove', id)
    },
    files: {
      list: (opts) => ipcRenderer.invoke('db:files:list', opts),
      put: (file) => ipcRenderer.invoke('db:files:put', file),
      remove: (id) => ipcRenderer.invoke('db:files:remove', id)
    },
    config: {
      get: (key) => ipcRenderer.invoke('db:config:get', key),
      set: (key, value) => ipcRenderer.invoke('db:config:set', key, value)
    }
  },

  // --- Config (app preferences, renderer-cached) ---
  config: {
    get: (key) => ipcRenderer.invoke('db:config:get', key),
    set: (key, value) => ipcRenderer.invoke('db:config:set', key, value),
    observe: (key, callback) => {
      const handler = (_e, k, v) => { if (k === key) callback(v); };
      ipcRenderer.on('config:changed', handler);
      return { dispose: () => ipcRenderer.removeListener('config:changed', handler) };
    }
  },

  // --- Commands ---
  commands: {
    dispatch: (command, args) => {
      const handler = commandHandlers.get(command);
      if (handler) handler(args);
      else ipcRenderer.send('run-command', command, args);
    },
    add: (command, handler) => {
      commandHandlers.set(command, handler);
      const disposable = {
        dispose: () => commandHandlers.delete(command)
      };
      commandDisposables.push(disposable);
      return disposable;
    },
    remove: (command) => commandHandlers.delete(command),
    getAll: () => Array.from(commandHandlers.keys())
  },

  // --- Keymaps ---
  keymaps: {
    add: (selector, bindings) => {
      for (const [keys, command] of Object.entries(bindings)) {
        keymapBindings.set(keys, { selector, command });
      }
    },
    remove: (keys) => keymapBindings.delete(keys),
    getAll: () => Object.fromEntries(keymapBindings),
    findKeyBindings: (params) => {
      const results = [];
      for (const [keys, binding] of keymapBindings) {
        if (params.command && binding.command === params.command) {
          results.push({ keystrokes: keys, ...binding });
        }
      }
      return results;
    }
  },

  // --- Notifications ---
  notifications: {
    addInfo: (message, opts) => notifyRenderer('info', message, opts),
    addWarning: (message, opts) => notifyRenderer('warning', message, opts),
    addError: (message, opts) => notifyRenderer('error', message, opts),
    addSuccess: (message, opts) => notifyRenderer('success', message, opts),
    onDidNotify: (callback) => {
      notificationListeners.add(callback);
      return { dispose: () => notificationListeners.delete(callback) };
    }
  },

  // --- Menu ---
  menu: {
    add: (items) => {
      // Renderer will handle insertion into menu model
      return { dispose: () => {} };
    },
    update: () => {}
  },

  // --- Context menu ---
  contextMenu: {
    show: (template) => ipcRenderer.invoke('window:show-context-menu', template),
    add: (selector, items) => {
      return { dispose: () => {} };
    }
  },

  // --- Store (Redux-like) ---
  store: {
    getState: () => null,
    dispatch: (action) => {},
    subscribe: (listener) => {
      return () => {};
    }
  },

  // --- Packages (plugin lifecycle) ---
  packages: {
    getLoadedPackages: () => [],
    getActivePackages: () => [],
    isPackageLoaded: (name) => false,
    isPackageActive: (name) => false,
    enablePackage: (name) => ipcRenderer.invoke('ipm:install', { name }),
    disablePackage: (name) => ipcRenderer.invoke('ipm:uninstall', { name }),
    onDidLoadPackage: (callback) => ({ dispose: () => {} }),
    onDidActivatePackage: (callback) => ({ dispose: () => {} })
  },

  // --- Themes ---
  themes: {
    getActiveThemes: () => [currentTheme.ui, currentTheme.syntax],
    getLoadedThemes: () => ['default-dark', 'default-light'],
    setActiveThemes: (ui, syntax) => { currentTheme = { ui, syntax }; },
    onDidChangeActiveThemes: (callback) => ({ dispose: () => {} })
  },

  // --- Styles ---
  styles: {
    addStyleSheet: (source, params) => {
      const id = `style-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      styleSheets.set(id, { source, ...params });
      return { dispose: () => styleSheets.delete(id) };
    },
    removeStyleSheet: (id) => styleSheets.delete(id),
    getStyleSheets: () => Array.from(styleSheets.entries())
  },

  // --- Layouts ---
  layouts: {
    getSidebarWidth: () => layoutState.sidebarWidth,
    setSidebarWidth: (w) => { layoutState.sidebarWidth = w; },
    getNoteListWidth: () => layoutState.noteListWidth,
    setNoteListWidth: (w) => { layoutState.noteListWidth = w; },
    isSidebarVisible: () => layoutState.sidebarVisible,
    setSidebarVisible: (v) => { layoutState.sidebarVisible = v; },
    isNoteListVisible: () => layoutState.noteListVisible,
    setNoteListVisible: (v) => { layoutState.noteListVisible = v; },
    onDidChange: (callback) => ({ dispose: () => {} })
  },

  // --- Editor lifecycle ---
  onEditorLoad: (callback) => {
    editorCallbacks.onLoad.push(callback);
    return { dispose: () => { const i = editorCallbacks.onLoad.indexOf(callback); if (i >= 0) editorCallbacks.onLoad.splice(i, 1); } };
  },
  onEditorUnload: (callback) => {
    editorCallbacks.onUnload.push(callback);
    return { dispose: () => { const i = editorCallbacks.onUnload.indexOf(callback); if (i >= 0) editorCallbacks.onUnload.splice(i, 1); } };
  },

  // --- IPC event listeners for renderer ---
  onRunCommand: (callback) => {
    ipcRenderer.on('run-command', (_e, command, args) => callback(command, args));
    return { dispose: () => ipcRenderer.removeAllListeners('run-command') };
  },

  onWindowFocus: (callback) => {
    ipcRenderer.on('window:focus', () => callback());
    return { dispose: () => ipcRenderer.removeAllListeners('window:focus') };
  },

  onWindowBlur: (callback) => {
    ipcRenderer.on('window:blur', () => callback());
    return { dispose: () => ipcRenderer.removeAllListeners('window:blur') };
  },

  onFoundInPage: (callback) => {
    ipcRenderer.on('window:found-in-page', (_e, result) => callback(result));
    return { dispose: () => ipcRenderer.removeAllListeners('window:found-in-page') };
  },

  // --- Application event senders ---
  app: {
    about: () => ipcRenderer.send('application:about'),
    checkForUpdate: () => ipcRenderer.send('application:check-for-update'),
    hide: () => ipcRenderer.send('application:hide'),
    minimize: () => ipcRenderer.send('application:minimize'),
    openPreferences: () => ipcRenderer.send('application:open-preferences'),
    quickNote: () => ipcRenderer.send('application:quick-note'),
    quit: () => ipcRenderer.send('application:quit'),
    rebuildFtsIndex: () => ipcRenderer.send('application:rebuild-fts-index'),
    showAndFocus: () => ipcRenderer.send('application:show-and-focus-main-window'),
    syncDb: () => ipcRenderer.send('application:sync-db'),
    syncDbFull: () => ipcRenderer.send('application:sync-db-full'),
    toggleMainWindow: () => ipcRenderer.send('application:toggle-main-window'),
    bringAllToFront: () => ipcRenderer.send('application:bring-all-windows-to-front'),
    openWebsite: (url) => ipcRenderer.send('application:open-website', url),
    reportIssue: () => ipcRenderer.send('application:report-issue'),
    viewApiDoc: () => ipcRenderer.send('application:view-api-doc'),
    viewHelp: () => ipcRenderer.send('application:view-help'),
    zoom: (direction) => ipcRenderer.send('application:zoom', direction),
    logout: () => ipcRenderer.send('application:logout')
  },

  // --- Markdown parser ---
  marked: { parse: (md, opts) => marked.parse(md, opts), setOptions: (opts) => marked.setOptions(opts) },

  // --- Module system (getExports) ---
  getExports: () => ({
    models: {
      Note: { schema: { title: 'string', body: 'string', bookId: 'string', status: 'string', tags: 'array' } },
      Book: { schema: { name: 'string', icon: 'string', parentBookId: 'string' } },
      Tag: { schema: { name: 'string', color: 'string', count: 'number' } },
      File: { schema: { name: 'string', contentType: 'string', contentLength: 'number', noteId: 'string' } }
    },
    NOTE_STATUS: { ACTIVE: 'active', ON_HOLD: 'onHold', COMPLETED: 'completed', DROPPED: 'dropped', NONE: 'none' },
    NOTE_VISIBILITY: { PUBLIC: 'public', PRIVATE: 'private' }
  })
});

// ---------------------------------------------------------------------------
// Helper: send notification to renderer listeners
// ---------------------------------------------------------------------------
function notifyRenderer(type, message, opts) {
  for (const listener of notificationListeners) {
    try { listener({ type, message, ...opts }); } catch {}
  }
}
