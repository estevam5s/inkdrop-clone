// ============================================================================
// Inkdrop Clone — Renderer Application (app.js)
// Complete Markdown note-taking app with 26 feature subsystems
// ============================================================================

'use strict';

// ============================================================================
// 1. EVENT EMITTER
// ============================================================================
class EventEmitter {
  constructor() { this._events = {}; }
  on(evt, fn) { (this._events[evt] ||= []).push(fn); return this; }
  off(evt, fn) { if (this._events[evt]) this._events[evt] = this._events[evt].filter(f => f !== fn); }
  emit(evt, ...args) { (this._events[evt] || []).forEach(fn => fn(...args)); }
  once(evt, fn) { const w = (...a) => { this.off(evt, w); fn(...a); }; this.on(evt, w); }
}

// ============================================================================
// 2. IPC BRIDGE
// ============================================================================
const ipc = window.inkdropPreload || {};
const ipcInvoke = (channel, ...args) => {
  if (ipc[channel]) return ipc[channel](...args);
  if (ipc.invoke) return ipc.invoke(channel, ...args);
  console.warn(`IPC channel not available: ${channel}`);
  return Promise.resolve(null);
};

// ============================================================================
// 3. UTILITY HELPERS
// ============================================================================
function uid(prefix = '') { return prefix + crypto.randomUUID(); }
function now() { return new Date().toISOString(); }
function stripMd(md) {
  return (md || '').replace(/[#*_`~\[\]()>!|-]/g, '').replace(/\n+/g, ' ').trim();
}
function excerpt(md, len = 80) {
  const s = stripMd(md);
  return s.length > len ? s.slice(0, len) + '…' : s;
}
function relativeTime(iso) {
  const d = new Date(iso), n = Date.now(), diff = n - d.getTime();
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
  if (diff < 604800000) return Math.floor(diff / 86400000) + 'd ago';
  return d.toLocaleDateString();
}
function debounce(fn, ms) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
function fuzzyMatch(query, text) {
  const q = query.toLowerCase(), t = text.toLowerCase();
  if (!q) return true;
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}
function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const TAG_COLORS = ['#3b82f6','#ef4444','#22c55e','#f59e0b','#8b5cf6','#ec4899','#14b8a6','#f97316','#6366f1','#06b6d4'];
const STATUS_COLORS = { none:'#888', active:'#22c55e', onHold:'#f59e0b', completed:'#3b82f6', dropped:'#ef4444' };
const STATUS_LABELS = { none:'None', active:'Active', onHold:'On Hold', completed:'Completed', dropped:'Dropped' };

// ============================================================================
// 4. DEFAULT DATA / TEMPLATES
// ============================================================================
const DEFAULT_CONFIG = {
  theme: 'dark', editorFont: 'monospace', editorFontSize: 15, previewFont: 'sans-serif',
  sidebarWidth: 240, noteListWidth: 280, sortBy: 'updatedAt', sortDir: 'desc',
  viewMode: 'edit', lastOpenedNote: null, lastOpenedNotebook: null,
  tabSize: 2, lineWrapping: true, lineNumbers: false, spellCheck: false,
  autoSaveInterval: 1000, autoBackup: false, language: 'en',
  accentColor: '#3b82f6', keymaps: {}, templates: [], recentCommands: []
};

const BUILT_IN_TEMPLATES = [
  { name: 'Meeting Notes', body: '# Meeting Notes\n\n**Date:** {{date}}\n**Attendees:**\n\n---\n\n## Agenda\n\n1. \n\n## Discussion\n\n\n\n## Action Items\n\n- [ ] \n' },
  { name: 'Daily Journal', body: '# {{date}} — Daily Journal\n\n## Today I\'m grateful for\n\n- \n\n## What I accomplished\n\n- \n\n## Tomorrow\'s priorities\n\n- \n' },
  { name: 'Bug Report', body: '# Bug Report\n\n**Severity:** High / Medium / Low\n**Component:**\n\n## Description\n\n\n\n## Steps to Reproduce\n\n1. \n2. \n3. \n\n## Expected Behavior\n\n\n\n## Actual Behavior\n\n\n\n## Screenshots\n\n\n' },
  { name: 'Feature Spec', body: '# Feature: \n\n## Overview\n\n\n\n## User Stories\n\n- As a user, I want to...\n\n## Requirements\n\n### Functional\n\n- \n\n### Non-Functional\n\n- \n\n## Design\n\n\n\n## Technical Notes\n\n\n' },
  { name: 'README', body: '# Project Name\n\n> Short description\n\n## Installation\n\n```bash\nnpm install\n```\n\n## Usage\n\n```bash\nnpm start\n```\n\n## Features\n\n- \n\n## License\n\nMIT\n' }
];

const WELCOME_NOTE_BODY = `# Welcome to Inkdrop Clone

Welcome to your new Markdown note-taking app! Here's a quick guide to get you started.

## Markdown Basics

**Bold text** with \`**bold**\`
*Italic text* with \`*italic*\`
~~Strikethrough~~ with \`~~strike~~\`

### Lists

- Bullet item one
- Bullet item two
  - Nested item

1. Numbered item
2. Another item

### Task Lists

- [x] Learn Markdown
- [ ] Write some notes
- [ ] Explore features

### Code

Inline \`code\` with backticks.

\`\`\`javascript
function hello() {
  console.log("Hello, Inkdrop Clone!");
}
\`\`\`

### Links & Images

[Visit GitHub](https://github.com)
![Placeholder](https://via.placeholder.com/150)

### Blockquotes

> "The best way to predict the future is to create it."

### Tables

| Feature | Status |
|---------|--------|
| Editor  | Done   |
| Preview | Done   |
| Sync    | Stub   |

---

## Keyboard Shortcuts

- **Cmd+N** — New note
- **Cmd+Shift+P** — Command palette
- **Cmd+B** — Bold
- **Cmd+I** — Italic
- **Cmd+E** — Toggle preview
- **Cmd+\\\\** — Toggle sidebar
- **Cmd+Shift+D** — Distraction-free mode

## Internal Links

Link to other notes with \`[[Note Title]]\` syntax. Try it!

---

Happy writing!
`;

const STUB_PLUGINS = [
  { name: 'vim-keybindings', description: 'Vim keybindings for the editor', version: '1.2.0', author: 'community', downloads: 12400, installed: false },
  { name: 'mermaid-diagrams', description: 'Render Mermaid diagrams in preview', version: '2.0.1', author: 'community', downloads: 8900, installed: false },
  { name: 'math-equations', description: 'LaTeX math equation support', version: '1.5.3', author: 'community', downloads: 7200, installed: false },
  { name: 'export-pdf', description: 'Export notes as PDF files', version: '0.9.0', author: 'community', downloads: 15600, installed: false },
  { name: 'spell-checker', description: 'Spell checking for multiple languages', version: '3.1.0', author: 'community', downloads: 11000, installed: false },
  { name: 'toc-generator', description: 'Auto-generate table of contents', version: '1.0.2', author: 'community', downloads: 6300, installed: false },
  { name: 'kanban-board', description: 'Kanban board view for notes', version: '0.7.0', author: 'community', downloads: 4100, installed: false },
  { name: 'git-integration', description: 'Version control with Git', version: '0.4.0', author: 'community', downloads: 3200, installed: false },
  { name: 'word-count-plus', description: 'Enhanced word/reading time stats', version: '1.1.0', author: 'community', downloads: 5400, installed: false },
  { name: 'focus-mode', description: 'Highlight current paragraph while writing', version: '0.8.1', author: 'community', downloads: 2800, installed: false }
];

// ============================================================================
// 5. APPLICATION STATE
// ============================================================================
const bus = new EventEmitter();

const state = {
  notes: [],
  notebooks: [],
  tags: [],
  config: { ...DEFAULT_CONFIG },
  currentNote: null,
  currentView: 'all-notes',
  currentFilter: { type: 'all' },
  selectedNotes: [],
  searchQuery: '',
  distractionFree: false,
  findBarOpen: false,
  findQuery: '',
  replaceQuery: '',
  findCaseSensitive: false,
  findRegex: false,
  findMatches: [],
  findMatchIndex: -1,
  syncState: 'synced',
  commandPaletteOpen: false,
  initialized: false
};

function saveState() {
  try {
    const payload = {
      notes: state.notes, notebooks: state.notebooks, tags: state.tags,
      config: state.config
    };
    ipcInvoke('data-store:save', payload);
    localStorage.setItem('inkdrop-state', JSON.stringify(payload));
  } catch (e) { console.error('Save state error:', e); }
}
const debouncedSave = debounce(saveState, 500);

async function loadState() {
  try {
    let data = null;
    try { data = await ipcInvoke('data-store:load'); } catch {}
    if (!data) {
      const raw = localStorage.getItem('inkdrop-state');
      if (raw) data = JSON.parse(raw);
    }
    if (data) {
      if (data.notes) state.notes = data.notes;
      if (data.notebooks) state.notebooks = data.notebooks;
      if (data.tags) state.tags = data.tags;
      if (data.config) state.config = { ...DEFAULT_CONFIG, ...data.config };
    }
  } catch (e) { console.error('Load state error:', e); }
}

// ============================================================================
// 6. NOTE CRUD OPERATIONS
// ============================================================================
function createNote(opts = {}) {
  const defaultBook = state.notebooks[0]?._id || '';
  const note = {
    _id: uid('note:'),
    title: opts.title || 'Untitled',
    body: opts.body || '',
    bookId: opts.bookId || state.currentFilter.bookId || defaultBook,
    tags: opts.tags || [],
    status: opts.status || 'none',
    pinned: false,
    starred: false,
    trash: false,
    createdAt: now(),
    updatedAt: now(),
    revisions: []
  };
  state.notes.unshift(note);
  updateTagCounts();
  debouncedSave();
  bus.emit('notes-changed');
  bus.emit('note-created', note);
  return note;
}

function updateNote(id, changes) {
  const note = state.notes.find(n => n._id === id);
  if (!note) return null;
  const oldTitle = note.title, oldBody = note.body;
  Object.assign(note, changes, { updatedAt: now() });
  if (changes.title !== undefined || changes.body !== undefined) {
    if (oldTitle !== note.title || oldBody !== note.body) {
      note.revisions.push({ timestamp: now(), title: oldTitle, body: oldBody });
      if (note.revisions.length > 50) note.revisions.shift();
    }
  }
  if (changes.tags) updateTagCounts();
  debouncedSave();
  bus.emit('notes-changed');
  bus.emit('note-updated', note);
  return note;
}

function deleteNote(id, permanent = false) {
  if (permanent) {
    state.notes = state.notes.filter(n => n._id !== id);
  } else {
    const note = state.notes.find(n => n._id === id);
    if (note) note.trash = true;
  }
  if (state.currentNote?._id === id) {
    state.currentNote = null;
    bus.emit('current-note-changed');
  }
  updateTagCounts();
  debouncedSave();
  bus.emit('notes-changed');
}

function restoreNote(id) {
  const note = state.notes.find(n => n._id === id);
  if (note) { note.trash = false; note.updatedAt = now(); }
  debouncedSave();
  bus.emit('notes-changed');
}

function duplicateNote(id) {
  const src = state.notes.find(n => n._id === id);
  if (!src) return;
  return createNote({ title: src.title + ' (copy)', body: src.body, bookId: src.bookId, tags: [...src.tags], status: src.status });
}

function emptyTrash() {
  state.notes = state.notes.filter(n => !n.trash);
  if (state.currentNote?.trash) { state.currentNote = null; bus.emit('current-note-changed'); }
  updateTagCounts();
  debouncedSave();
  bus.emit('notes-changed');
}

// ============================================================================
// 7. NOTEBOOK CRUD
// ============================================================================
function createNotebook(opts = {}) {
  const nb = {
    _id: uid('book:'),
    name: opts.name || 'New Notebook',
    icon: opts.icon || '📓',
    color: opts.color || TAG_COLORS[state.notebooks.length % TAG_COLORS.length],
    parentId: opts.parentId || null,
    createdAt: now(),
    updatedAt: now()
  };
  state.notebooks.push(nb);
  debouncedSave();
  bus.emit('notebooks-changed');
  return nb;
}

function updateNotebook(id, changes) {
  const nb = state.notebooks.find(b => b._id === id);
  if (!nb) return;
  Object.assign(nb, changes, { updatedAt: now() });
  debouncedSave();
  bus.emit('notebooks-changed');
}

function deleteNotebook(id, deleteNotes = false) {
  if (deleteNotes) {
    state.notes = state.notes.filter(n => n.bookId !== id);
  } else {
    const fallback = state.notebooks.find(b => b._id !== id)?._id || '';
    state.notes.forEach(n => { if (n.bookId === id) n.bookId = fallback; });
  }
  state.notebooks = state.notebooks.filter(b => b._id !== id);
  state.notebooks.forEach(b => { if (b.parentId === id) b.parentId = null; });
  debouncedSave();
  bus.emit('notebooks-changed');
  bus.emit('notes-changed');
}

// ============================================================================
// 8. TAG CRUD
// ============================================================================
function createTag(name, color) {
  const existing = state.tags.find(t => t.name.toLowerCase() === name.toLowerCase());
  if (existing) return existing;
  const tag = {
    _id: uid('tag:'),
    name,
    color: color || TAG_COLORS[state.tags.length % TAG_COLORS.length],
    count: 0,
    createdAt: now()
  };
  state.tags.push(tag);
  updateTagCounts();
  debouncedSave();
  bus.emit('tags-changed');
  return tag;
}

function renameTag(id, newName) {
  const tag = state.tags.find(t => t._id === id);
  if (!tag) return;
  const oldName = tag.name;
  tag.name = newName;
  state.notes.forEach(n => {
    const idx = n.tags.indexOf(oldName);
    if (idx >= 0) n.tags[idx] = newName;
  });
  debouncedSave();
  bus.emit('tags-changed');
  bus.emit('notes-changed');
}

function deleteTag(id) {
  const tag = state.tags.find(t => t._id === id);
  if (!tag) return;
  state.notes.forEach(n => { n.tags = n.tags.filter(t => t !== tag.name); });
  state.tags = state.tags.filter(t => t._id !== id);
  debouncedSave();
  bus.emit('tags-changed');
  bus.emit('notes-changed');
}

function updateTagCounts() {
  const counts = {};
  state.notes.filter(n => !n.trash).forEach(n => {
    n.tags.forEach(t => { counts[t] = (counts[t] || 0) + 1; });
  });
  state.tags.forEach(t => { t.count = counts[t.name] || 0; });
}

// ============================================================================
// 9. FILTERED NOTE LIST
// ============================================================================
function getFilteredNotes() {
  let notes = state.notes;
  const f = state.currentFilter;

  if (f.type === 'trash') {
    notes = notes.filter(n => n.trash);
  } else {
    notes = notes.filter(n => !n.trash);
    if (f.type === 'notebook') notes = notes.filter(n => n.bookId === f.bookId);
    else if (f.type === 'tag') notes = notes.filter(n => n.tags.includes(f.tagName));
    else if (f.type === 'status') notes = notes.filter(n => n.status === f.status);
    else if (f.type === 'favorites') notes = notes.filter(n => n.starred);
  }

  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    notes = notes.filter(n =>
      n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q)
    );
  }

  const dir = state.config.sortDir === 'asc' ? 1 : -1;
  const key = state.config.sortBy;
  notes.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (key === 'title') return dir * a.title.localeCompare(b.title);
    return dir * (new Date(b[key]) - new Date(a[key]));
  });

  return notes;
}

// ============================================================================
// 10. NOTIFICATION SYSTEM
// ============================================================================
let notificationCount = 0;
function notify(message, type = 'info', duration = 4000) {
  const bar = document.getElementById('notification-bar');
  if (!bar) return;
  const id = ++notificationCount;
  const el = document.createElement('div');
  el.className = `notification notification-${type}`;
  el.dataset.id = id;
  el.innerHTML = `<span class="notification-text">${escapeHtml(message)}</span><button class="notification-close">&times;</button>`;
  el.querySelector('.notification-close').onclick = () => el.remove();
  bar.appendChild(el);
  if (duration > 0) setTimeout(() => el.remove(), duration);
}

// ============================================================================
// 11. MARKDOWN RENDERING
// ============================================================================
const markedApi = window.inkdropPreload?.marked;

function initMarked() {
  if (!markedApi) return;
  markedApi.setOptions({
    gfm: true,
    breaks: true
  });
}

function renderMarkdown(md) {
  if (!markedApi) return escapeHtml(md).replace(/\n/g, '<br>');
  let html = markedApi.parse(md || '');
  html = html.replace(
    /\[\[([^\]]+)\]\]/g,
    '<a class="note-link" data-note-title="$1">[[$1]]</a>'
  );
  html = html.replace(
    /<li>\s*<input type="checkbox" disabled(?: checked)?/g,
    (m) => m.replace(' disabled', '')
  );
  return html;
}

// ============================================================================
// 12. SIDEBAR RENDERING
// ============================================================================
function renderSidebar() {
  const activeNotes = state.notes.filter(n => !n.trash);
  const countEl = document.getElementById('all-notes-count');
  if (countEl) countEl.textContent = activeNotes.length;

  renderNotebookList();
  renderTagList();
  updateSidebarActive();
  renderSyncStatus();
}

function renderNotebookList() {
  const container = document.getElementById('notebook-list');
  if (!container) return;
  container.innerHTML = '';

  const roots = state.notebooks.filter(b => !b.parentId);
  const children = (pid) => state.notebooks.filter(b => b.parentId === pid);

  function renderBook(book, depth = 0) {
    const notesInBook = state.notes.filter(n => n.bookId === book._id && !n.trash).length;
    const kids = children(book._id);
    const el = document.createElement('div');
    el.className = 'sidebar-menu-book-list-item';
    el.dataset.bookId = book._id;
    el.style.paddingLeft = (12 + depth * 16) + 'px';
    el.draggable = true;

    let toggleHtml = '';
    if (kids.length) {
      toggleHtml = `<span class="sidebar-menu-book-list-item-toggle" data-book-id="${book._id}">&#9656;</span>`;
    }

    el.innerHTML = `${toggleHtml}<span class="notebook-icon" style="color:${book.color}">${book.icon}</span>
      <span class="notebook-name">${escapeHtml(book.name)}</span>
      <span class="accessory-count">${notesInBook}</span>`;

    el.addEventListener('click', (e) => {
      if (e.target.classList.contains('sidebar-menu-book-list-item-toggle')) {
        const sub = el.nextElementSibling;
        if (sub?.classList.contains('notebook-children')) {
          sub.classList.toggle('collapsed');
          e.target.classList.toggle('expanded');
        }
        return;
      }
      setFilter({ type: 'notebook', bookId: book._id });
      document.getElementById('note-list-title').textContent = book.name;
    });

    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showContextMenu(e, [
        { label: 'Rename', action: () => promptRenameNotebook(book._id) },
        { label: 'Change Icon', action: () => promptChangeNotebookIcon(book._id) },
        { label: 'Change Color', action: () => promptChangeNotebookColor(book._id) },
        { separator: true },
        { label: 'Delete', action: () => promptDeleteNotebook(book._id), danger: true }
      ]);
    });

    el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('drag-over'); });
    el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      el.classList.remove('drag-over');
      const noteId = e.dataTransfer.getData('text/note-id');
      if (noteId) { updateNote(noteId, { bookId: book._id }); renderNoteList(); }
    });

    container.appendChild(el);

    if (kids.length) {
      const childContainer = document.createElement('div');
      childContainer.className = 'notebook-children';
      kids.forEach(k => renderBook.call(null, k, depth + 1));
      container.appendChild(childContainer);
    }
  }

  roots.forEach(b => renderBook(b));
}

function renderTagList() {
  const container = document.getElementById('tag-list');
  if (!container) return;
  container.innerHTML = '';
  state.tags.forEach(tag => {
    const el = document.createElement('div');
    el.className = 'sidebar-menu-item';
    el.innerHTML = `<span class="tag-circular-icon" style="background:${tag.color}"></span>
      <span>${escapeHtml(tag.name)}</span>
      <span class="accessory-count">${tag.count}</span>`;
    el.addEventListener('click', () => {
      setFilter({ type: 'tag', tagName: tag.name });
      document.getElementById('note-list-title').textContent = '#' + tag.name;
    });
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showContextMenu(e, [
        { label: 'Rename', action: () => {
          const n = prompt('Rename tag:', tag.name);
          if (n && n !== tag.name) renameTag(tag._id, n);
        }},
        { label: 'Change Color', action: () => {
          const c = prompt('Color (hex):', tag.color);
          if (c) { tag.color = c; debouncedSave(); bus.emit('tags-changed'); }
        }},
        { separator: true },
        { label: 'Delete', action: () => { if (confirm(`Delete tag "${tag.name}"?`)) deleteTag(tag._id); }, danger: true }
      ]);
    });
    container.appendChild(el);
  });
}

function renderSyncStatus() {
  const icon = document.querySelector('#sync-status .sync-icon');
  const text = document.getElementById('sync-text');
  if (!icon || !text) return;
  const colors = { synced: '#22c55e', syncing: '#f59e0b', error: '#ef4444', offline: '#888' };
  icon.style.color = colors[state.syncState] || '#888';
  text.textContent = state.syncState === 'synced' ? 'Synced' : state.syncState === 'syncing' ? 'Syncing...' : state.syncState === 'error' ? 'Sync Error' : 'Offline';
  if (state.syncState === 'syncing') icon.classList.add('spinning');
  else icon.classList.remove('spinning');
}

function updateSidebarActive() {
  document.querySelectorAll('.sidebar-menu-item, .sidebar-menu-book-list-item').forEach(el => {
    el.classList.remove('active');
  });
  const f = state.currentFilter;
  if (f.type === 'all') {
    document.querySelector('[data-view="all-notes"]')?.classList.add('active');
  } else if (f.type === 'favorites') {
    document.querySelector('[data-view="favorites"]')?.classList.add('active');
  } else if (f.type === 'trash') {
    document.querySelector('[data-view="trash"]')?.classList.add('active');
  } else if (f.type === 'notebook') {
    document.querySelector(`[data-book-id="${f.bookId}"]`)?.classList.add('active');
  } else if (f.type === 'status') {
    document.querySelector(`[data-status="${f.status}"]`)?.classList.add('active');
  }
}

function setFilter(filter) {
  state.currentFilter = filter;
  state.currentView = filter.type;
  updateSidebarActive();
  renderNoteList();
}

// ============================================================================
// 13. NOTE LIST RENDERING
// ============================================================================
function renderNoteList() {
  const holder = document.getElementById('note-list-holder');
  const empty = document.getElementById('note-list-empty');
  if (!holder) return;
  holder.innerHTML = '';

  const notes = getFilteredNotes();
  if (notes.length === 0) {
    holder.style.display = 'none';
    if (empty) empty.classList.remove('hidden');
    return;
  }
  holder.style.display = '';
  if (empty) empty.classList.add('hidden');

  notes.forEach(note => {
    const el = document.createElement('div');
    el.className = 'note-list-item-view' + (state.currentNote?._id === note._id ? ' active' : '');
    el.dataset.noteId = note._id;
    el.draggable = true;

    const tagDots = note.tags.map(tName => {
      const tag = state.tags.find(t => t.name === tName);
      return `<span class="tag-dot" style="background:${tag?.color || '#888'}" title="${escapeHtml(tName)}"></span>`;
    }).join('');

    const statusBadge = note.status !== 'none'
      ? `<span class="note-status-badge" style="color:${STATUS_COLORS[note.status]}">${STATUS_LABELS[note.status]}</span>`
      : '';
    const pinIcon = note.pinned ? '<span class="note-pin-icon" title="Pinned">&#128204;</span>' : '';
    const starIcon = note.starred ? '<span class="note-star-icon" title="Starred">&#9733;</span>' : '';

    el.innerHTML = `
      <div class="note-item-header">
        ${pinIcon}${starIcon}
        <span class="note-item-title">${escapeHtml(note.title || 'Untitled')}</span>
      </div>
      <div class="note-item-excerpt">${escapeHtml(excerpt(note.body))}</div>
      <div class="note-item-footer">
        <span class="note-item-date">${relativeTime(note.updatedAt)}</span>
        <span class="note-item-tags">${tagDots}</span>
        ${statusBadge}
      </div>`;

    el.addEventListener('click', (e) => {
      if (e.metaKey || e.ctrlKey) {
        toggleNoteSelection(note._id);
      } else if (e.shiftKey && state.currentNote) {
        rangeSelectNotes(state.currentNote._id, note._id);
      } else {
        selectNote(note._id);
      }
    });

    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const isTrash = note.trash;
      const items = isTrash ? [
        { label: 'Restore', action: () => { restoreNote(note._id); renderNoteList(); renderSidebar(); } },
        { separator: true },
        { label: 'Delete Permanently', action: () => { if (confirm('Permanently delete?')) { deleteNote(note._id, true); renderNoteList(); } }, danger: true }
      ] : [
        { label: note.pinned ? 'Unpin' : 'Pin', action: () => { updateNote(note._id, { pinned: !note.pinned }); renderNoteList(); } },
        { label: note.starred ? 'Unstar' : 'Star', action: () => { updateNote(note._id, { starred: !note.starred }); renderNoteList(); } },
        { label: 'Move to Notebook', action: () => showMoveNoteModal(note._id) },
        { label: 'Duplicate', action: () => { const dup = duplicateNote(note._id); if (dup) { selectNote(dup._id); renderNoteList(); } } },
        { label: 'Copy Link', action: () => { navigator.clipboard.writeText(`inkdrop-clone://note/${note._id}`); notify('Link copied'); } },
        { separator: true },
        { label: 'Move to Trash', action: () => { deleteNote(note._id); renderNoteList(); renderSidebar(); }, danger: true }
      ];
      showContextMenu(e, items);
    });

    el.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/note-id', note._id);
      e.dataTransfer.effectAllowed = 'move';
    });

    holder.appendChild(el);
  });
}

function selectNote(id) {
  state.selectedNotes = [id];
  const note = state.notes.find(n => n._id === id);
  if (!note) return;
  state.currentNote = note;
  state.config.lastOpenedNote = id;
  bus.emit('current-note-changed');
  renderNoteList();
  renderEditor();
}

function toggleNoteSelection(id) {
  const idx = state.selectedNotes.indexOf(id);
  if (idx >= 0) state.selectedNotes.splice(idx, 1);
  else state.selectedNotes.push(id);
  renderNoteList();
}

function rangeSelectNotes(fromId, toId) {
  const notes = getFilteredNotes();
  const fromIdx = notes.findIndex(n => n._id === fromId);
  const toIdx = notes.findIndex(n => n._id === toId);
  if (fromIdx < 0 || toIdx < 0) return;
  const [start, end] = fromIdx < toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
  state.selectedNotes = notes.slice(start, end + 1).map(n => n._id);
  renderNoteList();
}

// ============================================================================
// 14. EDITOR RENDERING
// ============================================================================
function renderEditor() {
  const blank = document.getElementById('editor-blank');
  const container = document.getElementById('editor-container');
  if (!blank || !container) return;

  if (!state.currentNote) {
    blank.style.display = '';
    container.style.display = 'none';
    return;
  }
  blank.style.display = 'none';
  container.style.display = '';

  const note = state.currentNote;
  const titleEl = document.getElementById('note-title');
  const editor = document.getElementById('markdown-editor');
  const notebookSelect = document.getElementById('note-notebook');
  const statusSelect = document.getElementById('note-status');
  const tagsContainer = document.getElementById('note-tags-list');

  if (titleEl) titleEl.value = note.title;
  if (editor) {
    editor.value = note.body;
    editor.style.fontFamily = state.config.editorFont;
    editor.style.fontSize = state.config.editorFontSize + 'px';
  }

  if (notebookSelect) {
    notebookSelect.innerHTML = state.notebooks.map(b =>
      `<option value="${b._id}" ${b._id === note.bookId ? 'selected' : ''}>${b.icon} ${escapeHtml(b.name)}</option>`
    ).join('');
  }

  if (statusSelect) statusSelect.value = note.status;

  renderNoteTags();
  updateEditorStatus();
  updateViewModeButtons();

  if (state.config.viewMode === 'preview' || state.config.viewMode === 'split') {
    renderPreview();
  }
}

function renderNoteTags() {
  const container = document.getElementById('note-tags-list');
  if (!container || !state.currentNote) return;
  container.innerHTML = '';
  state.currentNote.tags.forEach(tagName => {
    const tag = state.tags.find(t => t.name === tagName);
    const pill = document.createElement('span');
    pill.className = 'note-tags-bar-item';
    pill.style.borderColor = tag?.color || '#888';
    pill.style.color = tag?.color || '#888';
    pill.innerHTML = `${escapeHtml(tagName)}<button class="tag-remove" data-tag="${escapeHtml(tagName)}">&times;</button>`;
    pill.querySelector('.tag-remove').addEventListener('click', () => {
      const tags = state.currentNote.tags.filter(t => t !== tagName);
      updateNote(state.currentNote._id, { tags });
      renderNoteTags();
      renderSidebar();
    });
    container.appendChild(pill);
  });
}

function updateEditorStatus() {
  if (!state.currentNote) return;
  const body = state.currentNote.body || '';
  const words = body.trim() ? body.trim().split(/\s+/).length : 0;
  const chars = body.length;
  const lines = body.split('\n').length;
  const wc = document.getElementById('word-count');
  const cc = document.getElementById('char-count');
  const lc = document.getElementById('line-count');
  const ls = document.getElementById('last-saved');
  if (wc) wc.textContent = words + ' word' + (words !== 1 ? 's' : '');
  if (cc) cc.textContent = chars + ' char' + (chars !== 1 ? 's' : '');
  if (lc) lc.textContent = 'Ln ' + lines;
  if (ls) ls.textContent = 'Saved ' + relativeTime(state.currentNote.updatedAt);
}

function updateViewModeButtons() {
  document.querySelectorAll('.editor-header-view-mode button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === state.config.viewMode);
  });
  const editorWrapper = document.getElementById('cm-editor-wrapper');
  const preview = document.getElementById('preview-pane');
  const body = document.getElementById('editor-body');
  if (!editorWrapper || !preview) return;

  if (state.config.viewMode === 'edit') {
    editorWrapper.style.display = '';
    preview.classList.add('hidden');
    body?.classList.remove('split-mode');
  } else if (state.config.viewMode === 'preview') {
    editorWrapper.style.display = 'none';
    preview.classList.remove('hidden');
    body?.classList.remove('split-mode');
    renderPreview();
  } else {
    editorWrapper.style.display = '';
    preview.classList.remove('hidden');
    body?.classList.add('split-mode');
    renderPreview();
  }
}

// ============================================================================
// 15. MARKDOWN PREVIEW
// ============================================================================
function renderPreview() {
  const pane = document.getElementById('preview-pane');
  if (!pane || !state.currentNote) return;
  pane.innerHTML = `<div class="markdown-preview">${renderMarkdown(state.currentNote.body)}</div>`;

  pane.querySelectorAll('.note-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const title = link.dataset.noteTitle;
      const target = state.notes.find(n => n.title.toLowerCase() === title.toLowerCase() && !n.trash);
      if (target) selectNote(target._id);
      else notify(`Note "${title}" not found`, 'warning');
    });
  });

  pane.querySelectorAll('input[type="checkbox"]').forEach((cb, idx) => {
    cb.addEventListener('change', () => {
      const lines = state.currentNote.body.split('\n');
      let cbIdx = 0;
      for (let i = 0; i < lines.length; i++) {
        if (/^\s*-\s*\[[ x]\]/.test(lines[i])) {
          if (cbIdx === idx) {
            lines[i] = cb.checked
              ? lines[i].replace('[ ]', '[x]')
              : lines[i].replace('[x]', '[ ]');
            break;
          }
          cbIdx++;
        }
      }
      updateNote(state.currentNote._id, { body: lines.join('\n') });
      const editor = document.getElementById('markdown-editor');
      if (editor) editor.value = state.currentNote.body;
    });
  });
}

// ============================================================================
// 16. EDITOR EVENT HANDLERS
// ============================================================================
function setupEditorEvents() {
  const titleEl = document.getElementById('note-title');
  const editor = document.getElementById('markdown-editor');
  const notebookSelect = document.getElementById('note-notebook');
  const statusSelect = document.getElementById('note-status');
  const tagInput = document.getElementById('note-tag-input');

  const autoSave = debounce(() => {
    if (!state.currentNote) return;
    const title = titleEl?.value || '';
    const body = editor?.value || '';
    updateNote(state.currentNote._id, { title, body });
    updateEditorStatus();
    if (state.config.viewMode !== 'edit') renderPreview();
    renderNoteList();
  }, state.config.autoSaveInterval || 1000);

  titleEl?.addEventListener('input', autoSave);
  editor?.addEventListener('input', autoSave);

  notebookSelect?.addEventListener('change', () => {
    if (state.currentNote) {
      updateNote(state.currentNote._id, { bookId: notebookSelect.value });
      renderSidebar();
    }
  });

  statusSelect?.addEventListener('change', () => {
    if (state.currentNote) {
      updateNote(state.currentNote._id, { status: statusSelect.value });
      renderNoteList();
    }
  });

  tagInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && tagInput.value.trim()) {
      e.preventDefault();
      const name = tagInput.value.trim();
      if (!state.currentNote.tags.includes(name)) {
        createTag(name);
        const tags = [...state.currentNote.tags, name];
        updateNote(state.currentNote._id, { tags });
        renderNoteTags();
        renderSidebar();
      }
      tagInput.value = '';
      hideTagAutocomplete();
    } else if (e.key === 'Backspace' && !tagInput.value && state.currentNote?.tags.length) {
      const tags = state.currentNote.tags.slice(0, -1);
      updateNote(state.currentNote._id, { tags });
      renderNoteTags();
      renderSidebar();
    } else if (e.key === 'Escape') {
      hideTagAutocomplete();
    }
  });

  tagInput?.addEventListener('input', () => {
    const q = tagInput.value.trim().toLowerCase();
    if (!q) { hideTagAutocomplete(); return; }
    const matches = state.tags.filter(t => t.name.toLowerCase().includes(q) && !state.currentNote?.tags.includes(t.name));
    if (matches.length) showTagAutocomplete(matches, tagInput);
    else hideTagAutocomplete();
  });

  editor?.addEventListener('keydown', (e) => {
    handleEditorKeydown(e);
  });

  editor?.addEventListener('mouseup', () => {
    const sel = editor.selectionStart !== editor.selectionEnd;
    const toolbar = document.getElementById('cm-toolbar');
    if (toolbar) {
      if (sel) {
        toolbar.classList.remove('hidden');
        const rect = editor.getBoundingClientRect();
        toolbar.style.top = (rect.top - 44) + 'px';
        toolbar.style.left = (rect.left + 10) + 'px';
      } else {
        toolbar.classList.add('hidden');
      }
    }
  });

  editor?.addEventListener('paste', async (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result;
          insertTextAtCursor(editor, `![pasted image](${dataUrl})`);
          autoSave();
        };
        reader.readAsDataURL(file);
        break;
      }
    }
  });

  document.querySelectorAll('.editor-header-view-mode button').forEach(btn => {
    btn.addEventListener('click', () => {
      state.config.viewMode = btn.dataset.mode;
      updateViewModeButtons();
      debouncedSave();
    });
  });

  document.getElementById('note-pin')?.addEventListener('click', () => {
    if (!state.currentNote) return;
    updateNote(state.currentNote._id, { pinned: !state.currentNote.pinned });
    renderNoteList();
  });

  document.getElementById('note-share')?.addEventListener('click', () => {
    if (state.currentNote) showShareModal(state.currentNote._id);
  });

  document.getElementById('note-revisions')?.addEventListener('click', () => {
    if (state.currentNote) showRevisionsModal(state.currentNote._id);
  });

  document.getElementById('note-more')?.addEventListener('click', (e) => {
    if (!state.currentNote) return;
    showContextMenu(e, [
      { label: 'Save as Template', action: () => saveAsTemplate(state.currentNote) },
      { label: 'Export as Markdown', action: () => exportNoteAsMarkdown(state.currentNote) },
      { label: 'Export as HTML', action: () => exportNoteAsHtml(state.currentNote) },
      { separator: true },
      { label: 'Move to Trash', action: () => { deleteNote(state.currentNote._id); renderNoteList(); renderEditor(); renderSidebar(); }, danger: true }
    ]);
  });
}

function handleEditorKeydown(e) {
  const editor = document.getElementById('markdown-editor');
  if (!editor) return;

  if (e.key === 'Tab') {
    e.preventDefault();
    const start = editor.selectionStart, end = editor.selectionEnd;
    if (e.shiftKey) {
      const before = editor.value.substring(0, start);
      const lastLine = before.lastIndexOf('\n');
      const lineStart = lastLine + 1;
      const line = editor.value.substring(lineStart, end);
      if (line.startsWith('  ')) {
        editor.value = editor.value.substring(0, lineStart) + line.substring(2) + editor.value.substring(end);
        editor.selectionStart = editor.selectionEnd = start - 2;
      }
    } else {
      editor.value = editor.value.substring(0, start) + '  ' + editor.value.substring(end);
      editor.selectionStart = editor.selectionEnd = start + 2;
    }
    editor.dispatchEvent(new Event('input'));
  }
}

function insertTextAtCursor(editor, text) {
  const start = editor.selectionStart, end = editor.selectionEnd;
  editor.value = editor.value.substring(0, start) + text + editor.value.substring(end);
  editor.selectionStart = editor.selectionEnd = start + text.length;
  editor.dispatchEvent(new Event('input'));
}

function wrapSelection(editor, before, after) {
  const start = editor.selectionStart, end = editor.selectionEnd;
  const selected = editor.value.substring(start, end);
  const wrapped = before + selected + (after || before);
  editor.value = editor.value.substring(0, start) + wrapped + editor.value.substring(end);
  editor.selectionStart = start + before.length;
  editor.selectionEnd = start + before.length + selected.length;
  editor.focus();
  editor.dispatchEvent(new Event('input'));
}

function prependLine(editor, prefix) {
  const start = editor.selectionStart;
  const before = editor.value.substring(0, start);
  const lineStart = before.lastIndexOf('\n') + 1;
  editor.value = editor.value.substring(0, lineStart) + prefix + editor.value.substring(lineStart);
  editor.selectionStart = editor.selectionEnd = start + prefix.length;
  editor.focus();
  editor.dispatchEvent(new Event('input'));
}

// ============================================================================
// 17. FLOATING TOOLBAR
// ============================================================================
function setupFloatingToolbar() {
  document.querySelectorAll('#cm-toolbar button').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const cmd = btn.dataset.cmd;
      const editor = document.getElementById('markdown-editor');
      if (!editor) return;
      switch (cmd) {
        case 'bold': wrapSelection(editor, '**'); break;
        case 'italic': wrapSelection(editor, '*'); break;
        case 'strike': wrapSelection(editor, '~~'); break;
        case 'heading': prependLine(editor, '## '); break;
        case 'quote': prependLine(editor, '> '); break;
        case 'code': wrapSelection(editor, '`'); break;
        case 'ul': prependLine(editor, '- '); break;
        case 'ol': prependLine(editor, '1. '); break;
        case 'task': prependLine(editor, '- [ ] '); break;
        case 'link': wrapSelection(editor, '[', '](url)'); break;
        case 'image': wrapSelection(editor, '![alt](', ')'); break;
        case 'table': insertTextAtCursor(editor, '\n| Column 1 | Column 2 | Column 3 |\n|----------|----------|----------|\n| Cell 1   | Cell 2   | Cell 3   |\n'); break;
        case 'hr': insertTextAtCursor(editor, '\n---\n'); break;
      }
      document.getElementById('cm-toolbar')?.classList.add('hidden');
    });
  });
}

// ============================================================================
// 18. TAG AUTOCOMPLETE
// ============================================================================
let tagAutocompleteEl = null;
function showTagAutocomplete(matches, input) {
  hideTagAutocomplete();
  tagAutocompleteEl = document.createElement('div');
  tagAutocompleteEl.className = 'note-tags-bar-dropdown-menu';
  const rect = input.getBoundingClientRect();
  tagAutocompleteEl.style.top = (rect.bottom + 2) + 'px';
  tagAutocompleteEl.style.left = rect.left + 'px';
  tagAutocompleteEl.style.minWidth = '160px';
  matches.slice(0, 8).forEach(tag => {
    const item = document.createElement('div');
    item.className = 'dropdown-item';
    item.innerHTML = `<span class="tag-circular-icon" style="background:${tag.color}"></span>${escapeHtml(tag.name)}`;
    item.addEventListener('mousedown', (e) => {
      e.preventDefault();
      if (state.currentNote && !state.currentNote.tags.includes(tag.name)) {
        updateNote(state.currentNote._id, { tags: [...state.currentNote.tags, tag.name] });
        renderNoteTags();
        renderSidebar();
      }
      input.value = '';
      hideTagAutocomplete();
    });
    tagAutocompleteEl.appendChild(item);
  });
  document.body.appendChild(tagAutocompleteEl);
}
function hideTagAutocomplete() {
  if (tagAutocompleteEl) { tagAutocompleteEl.remove(); tagAutocompleteEl = null; }
}

// ============================================================================
// 19. CONTEXT MENU
// ============================================================================
let activeContextMenu = null;
function showContextMenu(e, items) {
  hideContextMenu();
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.style.left = e.clientX + 'px';
  menu.style.top = e.clientY + 'px';
  items.forEach(item => {
    if (item.separator) {
      const sep = document.createElement('div');
      sep.className = 'context-menu-separator';
      menu.appendChild(sep);
      return;
    }
    const el = document.createElement('div');
    el.className = 'context-menu-item' + (item.danger ? ' danger' : '');
    el.textContent = item.label;
    el.addEventListener('click', () => { hideContextMenu(); item.action(); });
    menu.appendChild(el);
  });
  document.body.appendChild(menu);
  activeContextMenu = menu;

  const r = menu.getBoundingClientRect();
  if (r.right > window.innerWidth) menu.style.left = (window.innerWidth - r.width - 8) + 'px';
  if (r.bottom > window.innerHeight) menu.style.top = (window.innerHeight - r.height - 8) + 'px';

  setTimeout(() => document.addEventListener('click', hideContextMenu, { once: true }), 10);
}
function hideContextMenu() {
  if (activeContextMenu) { activeContextMenu.remove(); activeContextMenu = null; }
}

// ============================================================================
// 20. MODALS SYSTEM
// ============================================================================
function showModal(id) {
  document.getElementById(id)?.classList.remove('hidden');
  document.getElementById(id)?.querySelector('input,textarea')?.focus();
}
function hideModal(id) {
  document.getElementById(id)?.classList.add('hidden');
}
function hideAllModals() {
  document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
  state.commandPaletteOpen = false;
}

// ============================================================================
// 21. NOTEBOOK MODALS
// ============================================================================
function showCreateNotebookModal() {
  const modal = document.getElementById('notebook-modal');
  if (!modal) return;
  modal.querySelector('.modal-title').textContent = 'New Notebook';
  modal.querySelector('#notebook-modal-name').value = '';
  modal.querySelector('#notebook-modal-icon').value = '📓';
  modal.querySelector('#notebook-modal-color').value = TAG_COLORS[state.notebooks.length % TAG_COLORS.length];
  modal.dataset.mode = 'create';
  modal.dataset.editId = '';
  showModal('notebook-modal');
}

function promptRenameNotebook(id) {
  const nb = state.notebooks.find(b => b._id === id);
  if (!nb) return;
  const modal = document.getElementById('notebook-modal');
  if (!modal) return;
  modal.querySelector('.modal-title').textContent = 'Edit Notebook';
  modal.querySelector('#notebook-modal-name').value = nb.name;
  modal.querySelector('#notebook-modal-icon').value = nb.icon;
  modal.querySelector('#notebook-modal-color').value = nb.color;
  modal.dataset.mode = 'edit';
  modal.dataset.editId = id;
  showModal('notebook-modal');
}

function promptChangeNotebookIcon(id) {
  const nb = state.notebooks.find(b => b._id === id);
  if (!nb) return;
  const icon = prompt('Emoji icon:', nb.icon);
  if (icon) { updateNotebook(id, { icon }); renderSidebar(); }
}

function promptChangeNotebookColor(id) {
  const nb = state.notebooks.find(b => b._id === id);
  if (!nb) return;
  const color = prompt('Color (hex):', nb.color);
  if (color) { updateNotebook(id, { color }); renderSidebar(); }
}

function promptDeleteNotebook(id) {
  const nb = state.notebooks.find(b => b._id === id);
  if (!nb) return;
  const notesInBook = state.notes.filter(n => n.bookId === id).length;
  if (notesInBook > 0) {
    const choice = confirm(`Notebook "${nb.name}" has ${notesInBook} notes. Delete the notes too?\n\nOK = delete notes\nCancel = move notes to first notebook`);
    deleteNotebook(id, choice);
  } else {
    deleteNotebook(id);
  }
  renderSidebar();
  renderNoteList();
}

function setupNotebookModal() {
  const modal = document.getElementById('notebook-modal');
  if (!modal) return;
  modal.querySelector('.modal-save')?.addEventListener('click', () => {
    const name = modal.querySelector('#notebook-modal-name').value.trim();
    const icon = modal.querySelector('#notebook-modal-icon').value.trim() || '📓';
    const color = modal.querySelector('#notebook-modal-color').value;
    if (!name) return;
    if (modal.dataset.mode === 'create') {
      createNotebook({ name, icon, color });
    } else {
      updateNotebook(modal.dataset.editId, { name, icon, color });
    }
    hideModal('notebook-modal');
    renderSidebar();
  });
  modal.querySelector('.modal-cancel')?.addEventListener('click', () => hideModal('notebook-modal'));
}

// ============================================================================
// 22. MOVE NOTE MODAL
// ============================================================================
function showMoveNoteModal(noteId) {
  const modal = document.getElementById('move-note-modal');
  if (!modal) return;
  const list = modal.querySelector('#move-note-book-list');
  list.innerHTML = '';
  state.notebooks.forEach(nb => {
    const item = document.createElement('div');
    item.className = 'move-note-item';
    item.innerHTML = `<span class="notebook-icon" style="color:${nb.color}">${nb.icon}</span> ${escapeHtml(nb.name)}`;
    item.addEventListener('click', () => {
      updateNote(noteId, { bookId: nb._id });
      hideModal('move-note-modal');
      renderNoteList();
      renderSidebar();
      renderEditor();
      notify(`Moved to ${nb.name}`);
    });
    list.appendChild(item);
  });
  showModal('move-note-modal');
  modal.querySelector('.modal-cancel')?.addEventListener('click', () => hideModal('move-note-modal'), { once: true });
}

// ============================================================================
// 23. SHARE NOTE MODAL (STUB)
// ============================================================================
function showShareModal(noteId) {
  const modal = document.getElementById('share-note-modal');
  if (!modal) return;
  const link = `inkdrop-clone://note/${noteId}`;
  modal.querySelector('#share-link-input').value = link;
  showModal('share-note-modal');
  modal.querySelector('#share-copy-btn')?.addEventListener('click', () => {
    navigator.clipboard.writeText(link);
    notify('Link copied to clipboard');
  }, { once: true });
  modal.querySelector('.modal-cancel')?.addEventListener('click', () => hideModal('share-note-modal'), { once: true });
}

// ============================================================================
// 24. REVISIONS MODAL
// ============================================================================
function showRevisionsModal(noteId) {
  const note = state.notes.find(n => n._id === noteId);
  if (!note) return;
  const modal = document.getElementById('revision-modal');
  if (!modal) return;
  const list = modal.querySelector('#revision-list');
  const preview = modal.querySelector('#revision-preview');
  list.innerHTML = '';
  preview.innerHTML = '<p class="revision-empty">Select a revision to preview</p>';

  if (!note.revisions.length) {
    list.innerHTML = '<p class="revision-empty">No revisions yet</p>';
    showModal('revision-modal');
    modal.querySelector('.modal-cancel')?.addEventListener('click', () => hideModal('revision-modal'), { once: true });
    return;
  }

  [...note.revisions].reverse().forEach((rev, idx) => {
    const item = document.createElement('div');
    item.className = 'revision-item';
    item.innerHTML = `<span class="revision-date">${new Date(rev.timestamp).toLocaleString()}</span><span class="revision-title">${escapeHtml(rev.title)}</span>`;
    item.addEventListener('click', () => {
      list.querySelectorAll('.revision-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      preview.innerHTML = `<h3>${escapeHtml(rev.title)}</h3><div class="markdown-preview">${renderMarkdown(rev.body)}</div>
        <button class="btn btn-primary restore-revision-btn">Restore this revision</button>`;
      preview.querySelector('.restore-revision-btn')?.addEventListener('click', () => {
        updateNote(noteId, { title: rev.title, body: rev.body });
        hideModal('revision-modal');
        renderEditor();
        renderNoteList();
        notify('Revision restored');
      });
    });
    list.appendChild(item);
  });

  showModal('revision-modal');
  modal.querySelector('.modal-cancel')?.addEventListener('click', () => hideModal('revision-modal'), { once: true });
}

// ============================================================================
// 25. TEMPLATE PICKER MODAL
// ============================================================================
function showTemplatePicker() {
  const modal = document.getElementById('template-picker-modal');
  if (!modal) return;
  const list = modal.querySelector('#template-list');
  list.innerHTML = '';
  const allTemplates = [...BUILT_IN_TEMPLATES, ...(state.config.templates || [])];
  allTemplates.forEach(tmpl => {
    const item = document.createElement('div');
    item.className = 'template-item';
    item.innerHTML = `<strong>${escapeHtml(tmpl.name)}</strong><p>${escapeHtml(excerpt(tmpl.body, 60))}</p>`;
    item.addEventListener('click', () => {
      const body = tmpl.body.replace(/\{\{date\}\}/g, new Date().toLocaleDateString());
      const note = createNote({ title: tmpl.name, body });
      selectNote(note._id);
      hideModal('template-picker-modal');
      renderNoteList();
    });
    list.appendChild(item);
  });
  showModal('template-picker-modal');
  modal.querySelector('.modal-cancel')?.addEventListener('click', () => hideModal('template-picker-modal'), { once: true });
}

function saveAsTemplate(note) {
  if (!note) return;
  const templates = state.config.templates || [];
  templates.push({ name: note.title, body: note.body });
  state.config.templates = templates;
  debouncedSave();
  notify('Saved as template');
}

// ============================================================================
// 26. FIND AND REPLACE
// ============================================================================
function toggleFindBar(showReplace = false) {
  const bar = document.getElementById('search-replace-bar');
  if (!bar) return;
  state.findBarOpen = !state.findBarOpen;
  bar.classList.toggle('hidden', !state.findBarOpen);
  if (state.findBarOpen) {
    bar.querySelector('#find-input')?.focus();
    const replaceRow = bar.querySelector('.replace-row');
    if (replaceRow) replaceRow.style.display = showReplace ? '' : 'none';
  } else {
    clearFindHighlights();
  }
}

function setupFindReplace() {
  const bar = document.getElementById('search-replace-bar');
  if (!bar) return;

  const findInput = bar.querySelector('#find-input');
  const replaceInput = bar.querySelector('#replace-input');
  const countEl = bar.querySelector('#find-count');
  const caseSensBtn = bar.querySelector('#find-case');
  const regexBtn = bar.querySelector('#find-regex');

  findInput?.addEventListener('input', () => {
    state.findQuery = findInput.value;
    performFind();
  });

  caseSensBtn?.addEventListener('click', () => {
    state.findCaseSensitive = !state.findCaseSensitive;
    caseSensBtn.classList.toggle('active', state.findCaseSensitive);
    performFind();
  });

  regexBtn?.addEventListener('click', () => {
    state.findRegex = !state.findRegex;
    regexBtn.classList.toggle('active', state.findRegex);
    performFind();
  });

  bar.querySelector('#find-next')?.addEventListener('click', () => findNext());
  bar.querySelector('#find-prev')?.addEventListener('click', () => findPrev());
  bar.querySelector('#replace-btn')?.addEventListener('click', () => replaceOne());
  bar.querySelector('#replace-all-btn')?.addEventListener('click', () => replaceAll());
  bar.querySelector('#find-close')?.addEventListener('click', () => toggleFindBar());

  function performFind() {
    const editor = document.getElementById('markdown-editor');
    if (!editor || !state.findQuery) { state.findMatches = []; state.findMatchIndex = -1; updateFindCount(); return; }
    const text = editor.value;
    const query = state.findQuery;
    state.findMatches = [];
    try {
      let re;
      if (state.findRegex) {
        re = new RegExp(query, state.findCaseSensitive ? 'g' : 'gi');
      } else {
        const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        re = new RegExp(escaped, state.findCaseSensitive ? 'g' : 'gi');
      }
      let m;
      while ((m = re.exec(text)) !== null) {
        state.findMatches.push({ start: m.index, end: m.index + m[0].length });
      }
    } catch {}
    state.findMatchIndex = state.findMatches.length > 0 ? 0 : -1;
    if (state.findMatchIndex >= 0) highlightMatch();
    updateFindCount();
  }

  function updateFindCount() {
    if (countEl) {
      if (state.findMatches.length === 0) countEl.textContent = state.findQuery ? 'No results' : '';
      else countEl.textContent = `${state.findMatchIndex + 1} of ${state.findMatches.length}`;
    }
  }

  function highlightMatch() {
    const editor = document.getElementById('markdown-editor');
    if (!editor || state.findMatchIndex < 0) return;
    const match = state.findMatches[state.findMatchIndex];
    editor.setSelectionRange(match.start, match.end);
    editor.focus();
  }

  function findNext() {
    if (state.findMatches.length === 0) return;
    state.findMatchIndex = (state.findMatchIndex + 1) % state.findMatches.length;
    highlightMatch();
    updateFindCount();
  }

  function findPrev() {
    if (state.findMatches.length === 0) return;
    state.findMatchIndex = (state.findMatchIndex - 1 + state.findMatches.length) % state.findMatches.length;
    highlightMatch();
    updateFindCount();
  }

  function replaceOne() {
    const editor = document.getElementById('markdown-editor');
    if (!editor || state.findMatchIndex < 0) return;
    const match = state.findMatches[state.findMatchIndex];
    const replaceWith = replaceInput?.value || '';
    editor.value = editor.value.substring(0, match.start) + replaceWith + editor.value.substring(match.end);
    editor.dispatchEvent(new Event('input'));
    performFind();
  }

  function replaceAll() {
    const editor = document.getElementById('markdown-editor');
    if (!editor || !state.findQuery) return;
    const replaceWith = replaceInput?.value || '';
    try {
      let re;
      if (state.findRegex) {
        re = new RegExp(state.findQuery, state.findCaseSensitive ? 'g' : 'gi');
      } else {
        const escaped = state.findQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        re = new RegExp(escaped, state.findCaseSensitive ? 'g' : 'gi');
      }
      editor.value = editor.value.replace(re, replaceWith);
      editor.dispatchEvent(new Event('input'));
      performFind();
      notify(`Replaced all occurrences`);
    } catch {}
  }
}

function clearFindHighlights() {
  state.findMatches = [];
  state.findMatchIndex = -1;
  state.findQuery = '';
}

// ============================================================================
// 27. PREFERENCES MODAL
// ============================================================================
function showPreferencesModal() {
  const modal = document.getElementById('preferences-modal');
  if (!modal) return;

  const tabsContainer = modal.querySelector('.prefs-tabs');
  const contentContainer = modal.querySelector('.prefs-content');
  if (!tabsContainer || !contentContainer) return;

  const tabs = [
    { id: 'general', label: 'General' },
    { id: 'editor', label: 'Editor' },
    { id: 'plugins', label: 'Plugins' },
    { id: 'themes', label: 'Themes' },
    { id: 'keymaps', label: 'Keymaps' },
    { id: 'account', label: 'Account' },
    { id: 'sync', label: 'Sync' },
    { id: 'backup', label: 'Backup' }
  ];

  tabsContainer.innerHTML = tabs.map(t =>
    `<button class="prefs-tab ${t.id === 'general' ? 'active' : ''}" data-tab="${t.id}">${t.label}</button>`
  ).join('');

  function showTab(tabId) {
    tabsContainer.querySelectorAll('.prefs-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
    contentContainer.innerHTML = renderPrefTab(tabId);
    setupPrefTabEvents(tabId);
  }

  tabsContainer.addEventListener('click', (e) => {
    const tab = e.target.closest('.prefs-tab');
    if (tab) showTab(tab.dataset.tab);
  });

  showTab('general');
  showModal('preferences-modal');
  modal.querySelector('.modal-cancel')?.addEventListener('click', () => hideModal('preferences-modal'), { once: true });
}

function renderPrefTab(tabId) {
  const c = state.config;
  switch (tabId) {
    case 'general': return `
      <div class="pref-section">
        <h3>General Settings</h3>
        <div class="pref-row"><label>Default Notebook</label>
          <select id="pref-default-notebook">${state.notebooks.map(b => `<option value="${b._id}">${b.icon} ${escapeHtml(b.name)}</option>`).join('')}</select></div>
        <div class="pref-row"><label>Language</label><select id="pref-language"><option value="en">English</option><option value="pt-BR">Português</option></select></div>
      </div>`;
    case 'editor': return `
      <div class="pref-section">
        <h3>Editor Settings</h3>
        <div class="pref-row"><label>Font Family</label><input id="pref-editor-font" type="text" value="${c.editorFont}"></div>
        <div class="pref-row"><label>Font Size</label><input id="pref-editor-font-size" type="number" min="10" max="32" value="${c.editorFontSize}"></div>
        <div class="pref-row"><label>Tab Size</label><input id="pref-tab-size" type="number" min="1" max="8" value="${c.tabSize}"></div>
        <div class="pref-row"><label>Line Wrapping</label><input id="pref-line-wrap" type="checkbox" ${c.lineWrapping ? 'checked' : ''}></div>
        <div class="pref-row"><label>Line Numbers</label><input id="pref-line-nums" type="checkbox" ${c.lineNumbers ? 'checked' : ''}></div>
        <div class="pref-row"><label>Spell Check</label><input id="pref-spell" type="checkbox" ${c.spellCheck ? 'checked' : ''}></div>
        <div class="pref-row"><label>Auto-save Interval (ms)</label><input id="pref-autosave" type="number" min="500" max="10000" step="500" value="${c.autoSaveInterval}"></div>
      </div>`;
    case 'themes': return `
      <div class="pref-section">
        <h3>Theme</h3>
        <div class="pref-row"><label>Theme</label>
          <select id="pref-theme"><option value="dark" ${c.theme === 'dark' ? 'selected' : ''}>Dark</option><option value="light" ${c.theme === 'light' ? 'selected' : ''}>Light</option></select></div>
        <div class="pref-row"><label>Accent Color</label><input id="pref-accent" type="color" value="${c.accentColor}"></div>
        <div class="theme-preview" style="margin-top:16px">
          <div class="theme-preview-box" style="background:${c.theme === 'dark' ? '#1a1b1e' : '#fff'}; color:${c.theme === 'dark' ? '#e0e0e0' : '#1a1b1e'}; padding:16px; border-radius:8px">
            <h4 style="color:${c.accentColor}">Preview Text</h4>
            <p>This is how your notes will look.</p>
          </div>
        </div>
      </div>`;
    case 'plugins': return renderPluginsTab();
    case 'keymaps': return `
      <div class="pref-section">
        <h3>Keyboard Shortcuts</h3>
        <div class="keymaps-list">
          ${Object.entries(KEYMAP_DEFAULTS).map(([action, shortcut]) =>
            `<div class="pref-row"><label>${action}</label><kbd>${shortcut}</kbd></div>`
          ).join('')}
        </div>
      </div>`;
    case 'account': return `
      <div class="pref-section">
        <h3>Account</h3>
        <div class="account-info">
          <div class="avatar" style="width:64px;height:64px;border-radius:50%;background:var(--primary-color);display:flex;align-items:center;justify-content:center;font-size:24px;color:#fff;margin-bottom:16px">U</div>
          <p><strong>Local User</strong></p>
          <p class="dim">All data stored locally</p>
        </div>
      </div>`;
    case 'sync': return `
      <div class="pref-section">
        <h3>Sync Settings</h3>
        <p class="dim">Sync is a stub — all data is stored locally.</p>
        <div class="pref-row"><label>Status</label><span>${state.syncState}</span></div>
        <button class="btn btn-secondary" id="pref-force-sync">Force Sync</button>
      </div>`;
    case 'backup': return `
      <div class="pref-section">
        <h3>Backup</h3>
        <div class="pref-row"><label>Auto Backup</label><input id="pref-auto-backup" type="checkbox" ${c.autoBackup ? 'checked' : ''}></div>
        <div style="display:flex;gap:8px;margin-top:16px">
          <button class="btn btn-primary" id="pref-export-all">Export All Data</button>
          <button class="btn btn-secondary" id="pref-import-backup">Import Backup</button>
        </div>
      </div>`;
    default: return '';
  }
}

function renderPluginsTab() {
  const pluginTabs = ['Popular', 'New', 'Installed'];
  return `
    <div class="pref-section">
      <h3>Plugins</h3>
      <div class="plugin-tabs" style="display:flex;gap:8px;margin-bottom:16px">
        ${pluginTabs.map((t, i) => `<button class="btn ${i === 0 ? 'btn-primary' : 'btn-secondary'} plugin-tab" data-ptab="${t.toLowerCase()}">${t}</button>`).join('')}
      </div>
      <div class="plugin-search" style="margin-bottom:16px">
        <input id="plugin-search-input" type="text" placeholder="Search plugins..." style="width:100%">
      </div>
      <div id="plugin-list">
        ${STUB_PLUGINS.map(p => `
          <div class="plugin-item">
            <div class="plugin-info">
              <strong>${escapeHtml(p.name)}</strong>
              <p class="dim">${escapeHtml(p.description)}</p>
              <span class="dim">v${p.version} by ${p.author} · ${p.downloads.toLocaleString()} downloads</span>
            </div>
            <button class="btn ${p.installed ? 'btn-danger' : 'btn-primary'} plugin-install-btn" data-plugin="${p.name}">
              ${p.installed ? 'Uninstall' : 'Install'}
            </button>
          </div>
        `).join('')}
      </div>
    </div>`;
}

function setupPrefTabEvents(tabId) {
  if (tabId === 'editor') {
    document.getElementById('pref-editor-font')?.addEventListener('change', (e) => { state.config.editorFont = e.target.value; debouncedSave(); renderEditor(); });
    document.getElementById('pref-editor-font-size')?.addEventListener('change', (e) => { state.config.editorFontSize = parseInt(e.target.value); debouncedSave(); renderEditor(); });
    document.getElementById('pref-tab-size')?.addEventListener('change', (e) => { state.config.tabSize = parseInt(e.target.value); debouncedSave(); });
    document.getElementById('pref-line-wrap')?.addEventListener('change', (e) => { state.config.lineWrapping = e.target.checked; debouncedSave(); });
    document.getElementById('pref-line-nums')?.addEventListener('change', (e) => { state.config.lineNumbers = e.target.checked; debouncedSave(); });
    document.getElementById('pref-spell')?.addEventListener('change', (e) => { state.config.spellCheck = e.target.checked; debouncedSave(); });
    document.getElementById('pref-autosave')?.addEventListener('change', (e) => { state.config.autoSaveInterval = parseInt(e.target.value); debouncedSave(); });
  } else if (tabId === 'themes') {
    document.getElementById('pref-theme')?.addEventListener('change', (e) => { setTheme(e.target.value); });
    document.getElementById('pref-accent')?.addEventListener('input', (e) => { state.config.accentColor = e.target.value; document.documentElement.style.setProperty('--primary-color', e.target.value); debouncedSave(); });
  } else if (tabId === 'sync') {
    document.getElementById('pref-force-sync')?.addEventListener('click', () => { simulateSync(); });
  } else if (tabId === 'backup') {
    document.getElementById('pref-auto-backup')?.addEventListener('change', (e) => { state.config.autoBackup = e.target.checked; debouncedSave(); });
    document.getElementById('pref-export-all')?.addEventListener('click', () => exportAllData());
    document.getElementById('pref-import-backup')?.addEventListener('click', () => importBackup());
  } else if (tabId === 'plugins') {
    document.querySelectorAll('.plugin-install-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const name = btn.dataset.plugin;
        const plugin = STUB_PLUGINS.find(p => p.name === name);
        if (plugin) {
          plugin.installed = !plugin.installed;
          btn.textContent = plugin.installed ? 'Uninstall' : 'Install';
          btn.className = `btn ${plugin.installed ? 'btn-danger' : 'btn-primary'} plugin-install-btn`;
          notify(plugin.installed ? `Installed ${name}` : `Uninstalled ${name}`);
        }
      });
    });
  }
}

// ============================================================================
// 28. IMPORT / EXPORT
// ============================================================================
function exportNoteAsMarkdown(note) {
  if (!note) return;
  const content = `# ${note.title}\n\n${note.body}`;
  downloadFile(`${note.title}.md`, content, 'text/markdown');
  notify('Exported as Markdown');
}

function exportNoteAsHtml(note) {
  if (!note) return;
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(note.title)}</title>
<style>body{font-family:sans-serif;max-width:800px;margin:40px auto;padding:0 20px;line-height:1.6}pre{background:#f5f5f5;padding:16px;border-radius:4px;overflow-x:auto}code{font-size:14px}blockquote{border-left:4px solid #ddd;margin:0;padding-left:16px;color:#666}img{max-width:100%}table{border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px 12px}</style>
</head><body>${renderMarkdown(note.body)}</body></html>`;
  downloadFile(`${note.title}.html`, html, 'text/html');
  notify('Exported as HTML');
}

function exportAllData() {
  const data = { notes: state.notes, notebooks: state.notebooks, tags: state.tags, config: state.config, exportedAt: now() };
  downloadFile('inkdrop-backup.json', JSON.stringify(data, null, 2), 'application/json');
  notify('All data exported');
}

async function importBackup() {
  try {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.md';
    input.multiple = true;
    input.addEventListener('change', async () => {
      for (const file of input.files) {
        const text = await file.text();
        if (file.name.endsWith('.json')) {
          try {
            const data = JSON.parse(text);
            if (data.notes) {
              let imported = 0;
              data.notes.forEach(n => {
                if (!state.notes.find(e => e._id === n._id)) {
                  state.notes.push(n);
                  imported++;
                }
              });
              if (data.notebooks) data.notebooks.forEach(b => {
                if (!state.notebooks.find(e => e._id === b._id)) state.notebooks.push(b);
              });
              if (data.tags) data.tags.forEach(t => {
                if (!state.tags.find(e => e._id === t._id)) state.tags.push(t);
              });
              updateTagCounts();
              debouncedSave();
              renderSidebar();
              renderNoteList();
              notify(`Imported ${imported} notes from JSON`);
            }
          } catch { notify('Invalid JSON file', 'error'); }
        } else if (file.name.endsWith('.md')) {
          const title = file.name.replace(/\.md$/, '');
          createNote({ title, body: text });
          renderNoteList();
          renderSidebar();
          notify(`Imported "${title}"`);
        }
      }
    });
    input.click();
  } catch (e) { notify('Import failed: ' + e.message, 'error'); }
}

function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ============================================================================
// 29. COMMAND PALETTE
// ============================================================================
const COMMANDS = [
  { name: 'New Note', shortcut: 'Cmd+N', action: () => { const n = createNote(); selectNote(n._id); renderNoteList(); } },
  { name: 'New Notebook', shortcut: 'Cmd+Shift+N', action: () => showCreateNotebookModal() },
  { name: 'Toggle Theme', shortcut: 'Cmd+Shift+T', action: () => toggleTheme() },
  { name: 'Open Preferences', shortcut: 'Cmd+,', action: () => showPreferencesModal() },
  { name: 'Find in Note', shortcut: 'Cmd+F', action: () => toggleFindBar() },
  { name: 'Find and Replace', shortcut: 'Cmd+H', action: () => toggleFindBar(true) },
  { name: 'Search All Notes', shortcut: 'Cmd+Shift+F', action: () => document.getElementById('note-search')?.focus() },
  { name: 'Export Current Note', shortcut: '', action: () => { if (state.currentNote) exportNoteAsMarkdown(state.currentNote); } },
  { name: 'Export All Data', shortcut: '', action: () => exportAllData() },
  { name: 'Import Notes', shortcut: '', action: () => importBackup() },
  { name: 'Toggle Sidebar', shortcut: 'Cmd+\\', action: () => toggleSidebar() },
  { name: 'Toggle Note List', shortcut: 'Cmd+Shift+\\', action: () => toggleNoteList() },
  { name: 'Distraction Free Mode', shortcut: 'Cmd+Shift+D', action: () => toggleDistractionFree() },
  { name: 'Toggle Edit/Preview', shortcut: 'Cmd+E', action: () => cycleViewMode() },
  { name: 'Split View', shortcut: 'Cmd+Shift+E', action: () => { state.config.viewMode = 'split'; updateViewModeButtons(); debouncedSave(); } },
  { name: 'Force Save', shortcut: 'Cmd+S', action: () => { saveState(); notify('Saved'); } },
  { name: 'Empty Trash', shortcut: '', action: () => { if (confirm('Permanently delete all trashed notes?')) { emptyTrash(); renderNoteList(); renderSidebar(); } } },
  { name: 'Choose Template', shortcut: '', action: () => showTemplatePicker() },
  { name: 'Show Revisions', shortcut: '', action: () => { if (state.currentNote) showRevisionsModal(state.currentNote._id); } },
  { name: 'Bold', shortcut: 'Cmd+B', action: () => { const e = document.getElementById('markdown-editor'); if (e) wrapSelection(e, '**'); } },
  { name: 'Italic', shortcut: 'Cmd+I', action: () => { const e = document.getElementById('markdown-editor'); if (e) wrapSelection(e, '*'); } },
  { name: 'Insert Link', shortcut: 'Cmd+K', action: () => { const e = document.getElementById('markdown-editor'); if (e) wrapSelection(e, '[', '](url)'); } },
  { name: 'Insert Code Block', shortcut: 'Cmd+Shift+K', action: () => { const e = document.getElementById('markdown-editor'); if (e) insertTextAtCursor(e, '\n```\n\n```\n'); } },
  { name: 'Pin/Unpin Note', shortcut: '', action: () => { if (state.currentNote) { updateNote(state.currentNote._id, { pinned: !state.currentNote.pinned }); renderNoteList(); } } },
  { name: 'Star/Unstar Note', shortcut: '', action: () => { if (state.currentNote) { updateNote(state.currentNote._id, { starred: !state.currentNote.starred }); renderNoteList(); } } },
  { name: 'Move to Trash', shortcut: 'Cmd+Del', action: () => { if (state.currentNote) { deleteNote(state.currentNote._id); renderNoteList(); renderEditor(); renderSidebar(); } } },
  { name: 'All Notes', shortcut: '', action: () => { setFilter({ type: 'all' }); document.getElementById('note-list-title').textContent = 'All Notes'; } },
  { name: 'Favorites', shortcut: '', action: () => { setFilter({ type: 'favorites' }); document.getElementById('note-list-title').textContent = 'Favorites'; } },
  { name: 'Trash', shortcut: '', action: () => { setFilter({ type: 'trash' }); document.getElementById('note-list-title').textContent = 'Trash'; } }
];

function showCommandPalette() {
  state.commandPaletteOpen = true;
  const modal = document.getElementById('command-palette');
  if (!modal) return;
  modal.classList.remove('hidden');
  const input = modal.querySelector('#command-search');
  const list = modal.querySelector('#command-list');
  if (input) { input.value = ''; input.focus(); }
  renderCommandList('');

  input?.addEventListener('input', () => renderCommandList(input.value));

  function renderCommandList(query) {
    const filtered = query ? COMMANDS.filter(c => fuzzyMatch(query, c.name)) : COMMANDS;
    list.innerHTML = filtered.map((cmd, i) =>
      `<div class="command-item ${i === 0 ? 'active' : ''}" data-idx="${i}">
        <span class="command-name">${escapeHtml(cmd.name)}</span>
        ${cmd.shortcut ? `<kbd class="command-shortcut">${cmd.shortcut}</kbd>` : ''}
      </div>`
    ).join('');

    list.querySelectorAll('.command-item').forEach(item => {
      item.addEventListener('click', () => {
        const idx = parseInt(item.dataset.idx);
        const cmd = filtered[idx];
        if (cmd) { hideAllModals(); cmd.action(); }
      });
    });
  }

  input?.addEventListener('keydown', (e) => {
    const items = list.querySelectorAll('.command-item');
    const activeIdx = [...items].findIndex(i => i.classList.contains('active'));
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      items[activeIdx]?.classList.remove('active');
      items[(activeIdx + 1) % items.length]?.classList.add('active');
      items[(activeIdx + 1) % items.length]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      items[activeIdx]?.classList.remove('active');
      const prev = (activeIdx - 1 + items.length) % items.length;
      items[prev]?.classList.add('active');
      items[prev]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      items[activeIdx]?.click();
    } else if (e.key === 'Escape') {
      hideAllModals();
    }
  });
}

// ============================================================================
// 30. KEYBOARD SHORTCUTS
// ============================================================================
const KEYMAP_DEFAULTS = {
  'New Note': 'Cmd+N',
  'New Notebook': 'Cmd+Shift+N',
  'Find': 'Cmd+F',
  'Find & Replace': 'Cmd+H',
  'Search All': 'Cmd+Shift+F',
  'Command Palette': 'Cmd+Shift+P',
  'Preferences': 'Cmd+,',
  'Bold': 'Cmd+B',
  'Italic': 'Cmd+I',
  'Link': 'Cmd+K',
  'Code Block': 'Cmd+Shift+K',
  'Indent': 'Cmd+]',
  'Outdent': 'Cmd+[',
  'Undo': 'Cmd+Z',
  'Redo': 'Cmd+Shift+Z',
  'Save': 'Cmd+S',
  'Toggle Preview': 'Cmd+E',
  'Split View': 'Cmd+Shift+E',
  'Toggle Sidebar': 'Cmd+\\',
  'Toggle Note List': 'Cmd+Shift+\\',
  'Distraction Free': 'Cmd+Shift+D',
  'Toggle Theme': 'Cmd+Shift+T',
  'Move to Trash': 'Cmd+Backspace',
  'Next Note': 'Ctrl+Tab',
  'Previous Note': 'Ctrl+Shift+Tab'
};

function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey;

    if (e.key === 'Escape') {
      if (state.commandPaletteOpen) { hideAllModals(); return; }
      if (state.findBarOpen) { toggleFindBar(); return; }
      if (state.distractionFree) { toggleDistractionFree(); return; }
      hideAllModals();
      hideContextMenu();
      return;
    }

    if (mod && e.shiftKey) {
      switch (e.key) {
        case 'P': case 'p': e.preventDefault(); showCommandPalette(); return;
        case 'N': case 'n': e.preventDefault(); showCreateNotebookModal(); return;
        case 'F': case 'f': e.preventDefault(); document.getElementById('note-search')?.focus(); return;
        case 'K': case 'k': e.preventDefault(); { const ed = document.getElementById('markdown-editor'); if (ed) insertTextAtCursor(ed, '\n```\n\n```\n'); } return;
        case 'E': case 'e': e.preventDefault(); state.config.viewMode = 'split'; updateViewModeButtons(); debouncedSave(); return;
        case 'D': case 'd': e.preventDefault(); toggleDistractionFree(); return;
        case 'T': case 't': e.preventDefault(); toggleTheme(); return;
        case 'Z': case 'z': return; // allow native redo
        case '\\': case '|': e.preventDefault(); toggleNoteList(); return;
      }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        if (state.currentNote) { deleteNote(state.currentNote._id, true); renderNoteList(); renderEditor(); renderSidebar(); }
        return;
      }
    }

    if (mod && !e.shiftKey) {
      switch (e.key) {
        case 'n': e.preventDefault(); { const n = createNote(); selectNote(n._id); renderNoteList(); } return;
        case 'f': e.preventDefault(); toggleFindBar(); return;
        case 'h': e.preventDefault(); toggleFindBar(true); return;
        case 'p': e.preventDefault(); showCommandPalette(); return;
        case ',': e.preventDefault(); showPreferencesModal(); return;
        case 'b': e.preventDefault(); { const ed = document.getElementById('markdown-editor'); if (ed) wrapSelection(ed, '**'); } return;
        case 'i': e.preventDefault(); { const ed = document.getElementById('markdown-editor'); if (ed) wrapSelection(ed, '*'); } return;
        case 'k': e.preventDefault(); { const ed = document.getElementById('markdown-editor'); if (ed) wrapSelection(ed, '[', '](url)'); } return;
        case 'e': e.preventDefault(); cycleViewMode(); return;
        case 's': e.preventDefault(); saveState(); notify('Saved'); return;
        case '\\': e.preventDefault(); toggleSidebar(); return;
        case ']': e.preventDefault(); { const ed = document.getElementById('markdown-editor'); if (ed) prependLine(ed, '  '); } return;
        case '[': e.preventDefault(); { const ed = document.getElementById('markdown-editor'); if (ed) { /* outdent handled by handleEditorKeydown */ } } return;
      }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        if (state.currentNote) { deleteNote(state.currentNote._id); renderNoteList(); renderEditor(); renderSidebar(); }
        return;
      }
    }

    if (e.ctrlKey && e.key === 'Tab') {
      e.preventDefault();
      navigateNotes(e.shiftKey ? -1 : 1);
    }
  });
}

function navigateNotes(dir) {
  const notes = getFilteredNotes();
  if (notes.length === 0) return;
  const currentIdx = state.currentNote ? notes.findIndex(n => n._id === state.currentNote._id) : -1;
  let nextIdx = currentIdx + dir;
  if (nextIdx < 0) nextIdx = notes.length - 1;
  if (nextIdx >= notes.length) nextIdx = 0;
  selectNote(notes[nextIdx]._id);
}

// ============================================================================
// 31. LAYOUT / RESIZE / DISTRACTION FREE
// ============================================================================
function setupResizeHandles() {
  setupResize('sidebar-resize', 'sidebar', '--sidebar-width', 'noteListWidth', 140, 400);
  setupResize('notelist-resize', 'note-list-bar', '--note-list-width', 'noteListWidth', 180, 500);
}

function setupResize(handleId, panelId, cssVar, configKey, min, max) {
  const handle = document.getElementById(handleId);
  const panel = document.getElementById(panelId);
  if (!handle || !panel) return;

  let startX, startW;
  handle.addEventListener('mousedown', (e) => {
    startX = e.clientX;
    startW = panel.offsetWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (e2) => {
      const w = Math.max(min, Math.min(max, startW + (e2.clientX - startX)));
      panel.style.width = w + 'px';
      document.documentElement.style.setProperty(cssVar, w + 'px');
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      state.config[configKey] = panel.offsetWidth;
      debouncedSave();
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const sidebarResize = document.getElementById('sidebar-resize');
  if (!sidebar) return;
  sidebar.classList.toggle('hidden');
  sidebarResize?.classList.toggle('hidden');
}

function toggleNoteList() {
  const noteList = document.getElementById('note-list-bar');
  const noteResize = document.getElementById('notelist-resize');
  if (!noteList) return;
  noteList.classList.toggle('hidden');
  noteResize?.classList.toggle('hidden');
}

function toggleDistractionFree() {
  state.distractionFree = !state.distractionFree;
  const mainLayout = document.querySelector('.main-layout');
  if (!mainLayout) return;
  mainLayout.classList.toggle('main-layout-distraction-free', state.distractionFree);
  if (state.distractionFree) {
    document.getElementById('sidebar')?.classList.add('hidden');
    document.getElementById('sidebar-resize')?.classList.add('hidden');
    document.getElementById('note-list-bar')?.classList.add('hidden');
    document.getElementById('notelist-resize')?.classList.add('hidden');
    document.querySelector('.header-bar')?.classList.add('hidden');
  } else {
    document.getElementById('sidebar')?.classList.remove('hidden');
    document.getElementById('sidebar-resize')?.classList.remove('hidden');
    document.getElementById('note-list-bar')?.classList.remove('hidden');
    document.getElementById('notelist-resize')?.classList.remove('hidden');
    document.querySelector('.header-bar')?.classList.remove('hidden');
  }
}

function cycleViewMode() {
  const modes = ['edit', 'preview', 'split'];
  const idx = modes.indexOf(state.config.viewMode);
  state.config.viewMode = modes[(idx + 1) % modes.length];
  updateViewModeButtons();
  debouncedSave();
}

// ============================================================================
// 32. THEME SYSTEM
// ============================================================================
function setTheme(theme) {
  state.config.theme = theme;
  document.body.dataset.theme = theme;
  document.documentElement.dataset.theme = theme;
  debouncedSave();
}

function toggleTheme() {
  setTheme(state.config.theme === 'dark' ? 'light' : 'dark');
}

function applyTheme() {
  document.body.dataset.theme = state.config.theme;
  document.documentElement.dataset.theme = state.config.theme;
  if (state.config.accentColor) {
    document.documentElement.style.setProperty('--primary-color', state.config.accentColor);
  }
}

// ============================================================================
// 33. SYNC SIMULATION
// ============================================================================
function simulateSync() {
  state.syncState = 'syncing';
  renderSyncStatus();
  setTimeout(() => {
    state.syncState = 'synced';
    renderSyncStatus();
    notify('Sync complete');
  }, 2000);
}

// ============================================================================
// 34. IMAGE VIEWER
// ============================================================================
function setupImageViewer() {
  document.addEventListener('click', (e) => {
    if (e.target.tagName === 'IMG' && e.target.closest('.markdown-preview')) {
      showImageViewer(e.target.src);
    }
  });
}

function showImageViewer(src) {
  const modal = document.getElementById('image-viewer-modal');
  if (!modal) return;
  const img = modal.querySelector('.image-viewer-img');
  if (img) img.src = src;
  let zoom = 1;
  modal.querySelector('#img-zoom-in')?.addEventListener('click', () => { zoom = Math.min(3, zoom + 0.25); img.style.transform = `scale(${zoom})`; });
  modal.querySelector('#img-zoom-out')?.addEventListener('click', () => { zoom = Math.max(0.25, zoom - 0.25); img.style.transform = `scale(${zoom})`; });
  modal.querySelector('#img-zoom-reset')?.addEventListener('click', () => { zoom = 1; img.style.transform = ''; });
  showModal('image-viewer-modal');
  modal.querySelector('.modal-cancel')?.addEventListener('click', () => { hideModal('image-viewer-modal'); img.style.transform = ''; }, { once: true });
}

// ============================================================================
// 35. EXPORT MODAL
// ============================================================================
function setupExportImportModals() {
  const exportModal = document.getElementById('export-modal');
  const importModal = document.getElementById('import-modal');

  exportModal?.querySelector('#export-md-btn')?.addEventListener('click', () => { if (state.currentNote) exportNoteAsMarkdown(state.currentNote); hideModal('export-modal'); });
  exportModal?.querySelector('#export-html-btn')?.addEventListener('click', () => { if (state.currentNote) exportNoteAsHtml(state.currentNote); hideModal('export-modal'); });
  exportModal?.querySelector('#export-all-btn')?.addEventListener('click', () => { exportAllData(); hideModal('export-modal'); });
  exportModal?.querySelector('.modal-cancel')?.addEventListener('click', () => hideModal('export-modal'));

  importModal?.querySelector('#import-md-btn')?.addEventListener('click', () => { importBackup(); hideModal('import-modal'); });
  importModal?.querySelector('.modal-cancel')?.addEventListener('click', () => hideModal('import-modal'));
}

// ============================================================================
// 36. NOTE SEARCH
// ============================================================================
function setupNoteSearch() {
  const input = document.getElementById('note-search');
  if (!input) return;
  input.addEventListener('input', debounce(() => {
    state.searchQuery = input.value.trim();
    renderNoteList();
  }, 200));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { input.value = ''; state.searchQuery = ''; renderNoteList(); input.blur(); }
  });
}

// ============================================================================
// 37. SORT CONTROLS
// ============================================================================
function setupSortControls() {
  const sortSelect = document.getElementById('note-sort');
  const sortDir = document.getElementById('note-sort-dir');

  sortSelect?.addEventListener('change', () => {
    state.config.sortBy = sortSelect.value;
    debouncedSave();
    renderNoteList();
  });

  sortDir?.addEventListener('click', () => {
    state.config.sortDir = state.config.sortDir === 'desc' ? 'asc' : 'desc';
    sortDir.textContent = state.config.sortDir === 'desc' ? '↓' : '↑';
    debouncedSave();
    renderNoteList();
  });
}

// ============================================================================
// 38. SIDEBAR NAV EVENTS
// ============================================================================
function setupSidebarNav() {
  document.querySelector('[data-view="all-notes"]')?.addEventListener('click', () => {
    setFilter({ type: 'all' });
    document.getElementById('note-list-title').textContent = 'All Notes';
  });

  document.querySelector('[data-view="favorites"]')?.addEventListener('click', () => {
    setFilter({ type: 'favorites' });
    document.getElementById('note-list-title').textContent = 'Favorites';
  });

  document.querySelector('[data-view="trash"]')?.addEventListener('click', () => {
    setFilter({ type: 'trash' });
    document.getElementById('note-list-title').textContent = 'Trash';
  });

  document.querySelectorAll('[data-status]').forEach(el => {
    el.addEventListener('click', () => {
      setFilter({ type: 'status', status: el.dataset.status });
      document.getElementById('note-list-title').textContent = STATUS_LABELS[el.dataset.status];
    });
  });

  document.getElementById('create-notebook-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    showCreateNotebookModal();
  });

  document.getElementById('sync-status')?.addEventListener('click', () => {
    simulateSync();
  });
}

// ============================================================================
// 39. HEADER BAR
// ============================================================================
function setupHeaderBar() {
  document.getElementById('btn-minimize')?.addEventListener('click', () => ipcInvoke('window:minimize'));
  document.getElementById('btn-maximize')?.addEventListener('click', () => ipcInvoke('window:maximize'));
  document.getElementById('btn-close')?.addEventListener('click', () => ipcInvoke('window:close'));

  document.getElementById('app-menu-btn')?.addEventListener('click', (e) => {
    showContextMenu(e, [
      { label: 'New Note', action: () => { const n = createNote(); selectNote(n._id); renderNoteList(); } },
      { label: 'New Notebook', action: () => showCreateNotebookModal() },
      { separator: true },
      { label: 'Preferences', action: () => showPreferencesModal() },
      { label: 'Import Notes', action: () => importBackup() },
      { label: 'Export', action: () => showModal('export-modal') },
      { separator: true },
      { label: 'Toggle Theme', action: () => toggleTheme() },
      { label: 'Command Palette', action: () => showCommandPalette() }
    ]);
  });
}

// ============================================================================
// 40. TEMPLATE/BLANK STATE
// ============================================================================
function setupBlankState() {
  document.getElementById('choose-template-btn')?.addEventListener('click', () => showTemplatePicker());
}

// ============================================================================
// 41. NOTE LINK AUTOCOMPLETE ([[...)
// ============================================================================
let noteLinkAutocompleteEl = null;
function setupNoteLinkAutocomplete() {
  const editor = document.getElementById('markdown-editor');
  if (!editor) return;

  editor.addEventListener('input', () => {
    const pos = editor.selectionStart;
    const before = editor.value.substring(0, pos);
    const match = before.match(/\[\[([^\]]*)$/);
    if (match) {
      const query = match[1].toLowerCase();
      const candidates = state.notes.filter(n => !n.trash && n.title.toLowerCase().includes(query)).slice(0, 8);
      if (candidates.length) showNoteLinkAutocomplete(candidates, editor, pos - match[0].length);
      else hideNoteLinkAutocomplete();
    } else {
      hideNoteLinkAutocomplete();
    }
  });
}

function showNoteLinkAutocomplete(notes, editor, insertStart) {
  hideNoteLinkAutocomplete();
  noteLinkAutocompleteEl = document.createElement('div');
  noteLinkAutocompleteEl.className = 'note-link-autocomplete';
  const rect = editor.getBoundingClientRect();
  noteLinkAutocompleteEl.style.top = (rect.top + 30) + 'px';
  noteLinkAutocompleteEl.style.left = (rect.left + 20) + 'px';

  notes.forEach(note => {
    const item = document.createElement('div');
    item.className = 'dropdown-item';
    item.textContent = note.title;
    item.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const pos = editor.selectionStart;
      const before = editor.value.substring(0, insertStart);
      const after = editor.value.substring(pos);
      editor.value = before + '[[' + note.title + ']]' + after;
      editor.selectionStart = editor.selectionEnd = insertStart + note.title.length + 4;
      editor.focus();
      editor.dispatchEvent(new Event('input'));
      hideNoteLinkAutocomplete();
    });
    noteLinkAutocompleteEl.appendChild(item);
  });
  document.body.appendChild(noteLinkAutocompleteEl);
}

function hideNoteLinkAutocomplete() {
  if (noteLinkAutocompleteEl) { noteLinkAutocompleteEl.remove(); noteLinkAutocompleteEl = null; }
}

// ============================================================================
// 42. TRASH CLEANUP
// ============================================================================
function cleanupOldTrash() {
  const thirtyDaysAgo = Date.now() - 30 * 86400000;
  const before = state.notes.length;
  state.notes = state.notes.filter(n => {
    if (n.trash && new Date(n.updatedAt).getTime() < thirtyDaysAgo) return false;
    return true;
  });
  if (state.notes.length < before) debouncedSave();
}

// ============================================================================
// 43. WELCOME / ONBOARDING
// ============================================================================
function initializeWelcomeData() {
  if (state.notes.length > 0 || state.notebooks.length > 0) return;

  const inbox = createNotebook({ name: 'Inbox', icon: '📥', color: '#3b82f6' });
  createNotebook({ name: 'Personal', icon: '📔', color: '#22c55e' });
  createNotebook({ name: 'Work', icon: '💼', color: '#f59e0b' });

  createTag('tutorial', '#8b5cf6');
  createTag('important', '#ef4444');
  createTag('idea', '#22c55e');

  const welcomeNote = createNote({
    title: 'Welcome to Inkdrop Clone',
    body: WELCOME_NOTE_BODY,
    bookId: inbox._id,
    tags: ['tutorial']
  });

  createNote({
    title: 'Quick Ideas',
    body: '# Quick Ideas\n\nJot down your ideas here.\n\n- [ ] First idea\n- [ ] Second idea\n',
    bookId: inbox._id,
    tags: ['idea']
  });

  selectNote(welcomeNote._id);
}

// ============================================================================
// 44. DRAG AND DROP NOTES
// ============================================================================
function setupDragDrop() {
  document.addEventListener('dragover', (e) => e.preventDefault());
}

// ============================================================================
// 45. GLOBAL CLICK HANDLERS
// ============================================================================
function setupGlobalHandlers() {
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.note-tags-bar') && !e.target.closest('.note-tags-bar-dropdown-menu')) {
      hideTagAutocomplete();
    }
    if (!e.target.closest('.note-link-autocomplete') && !e.target.closest('#markdown-editor')) {
      hideNoteLinkAutocomplete();
    }
    if (!e.target.closest('.cm-floating-toolbar') && !e.target.closest('#markdown-editor')) {
      document.getElementById('cm-toolbar')?.classList.add('hidden');
    }
  });

  document.querySelectorAll('.modal .modal-backdrop, .modal .modal-close').forEach(el => {
    el.addEventListener('click', () => {
      el.closest('.modal')?.classList.add('hidden');
    });
  });
}

// ============================================================================
// 46. INITIALIZATION
// ============================================================================
async function init() {
  initMarked();
  await loadState();
  applyTheme();

  if (state.config.sidebarWidth) {
    document.getElementById('sidebar')?.style.setProperty('width', state.config.sidebarWidth + 'px');
    document.documentElement.style.setProperty('--sidebar-width', state.config.sidebarWidth + 'px');
  }
  if (state.config.noteListWidth) {
    document.getElementById('note-list-bar')?.style.setProperty('width', state.config.noteListWidth + 'px');
    document.documentElement.style.setProperty('--note-list-width', state.config.noteListWidth + 'px');
  }

  initializeWelcomeData();
  cleanupOldTrash();

  renderSidebar();
  renderNoteList();

  if (state.config.lastOpenedNote) {
    const note = state.notes.find(n => n._id === state.config.lastOpenedNote);
    if (note) selectNote(note._id);
  }
  if (!state.currentNote && state.notes.length) {
    selectNote(state.notes[0]._id);
  }
  renderEditor();

  setupSidebarNav();
  setupHeaderBar();
  setupEditorEvents();
  setupFloatingToolbar();
  setupFindReplace();
  setupNoteSearch();
  setupSortControls();
  setupNotebookModal();
  setupResizeHandles();
  setupKeyboardShortcuts();
  setupBlankState();
  setupNoteLinkAutocomplete();
  setupExportImportModals();
  setupImageViewer();
  setupDragDrop();
  setupGlobalHandlers();

  bus.on('notes-changed', () => { renderNoteList(); renderSidebar(); });
  bus.on('notebooks-changed', () => { renderSidebar(); });
  bus.on('tags-changed', () => { renderSidebar(); renderNoteTags(); });
  bus.on('current-note-changed', () => { renderEditor(); });

  state.initialized = true;
  console.log('Inkdrop Clone initialized — %d notes, %d notebooks, %d tags', state.notes.length, state.notebooks.length, state.tags.length);
}

document.addEventListener('DOMContentLoaded', init);
