const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // ── Dialog ──────────────────────────────────────────────────────────────
  selectDirectory: () => ipcRenderer.invoke('dialog:selectDirectory'),
  selectFile: (options) => ipcRenderer.invoke('dialog:selectFile', options),

  // ── File System ─────────────────────────────────────────────────────────
  readDir: (dirPath) => ipcRenderer.invoke('fs:readDir', dirPath),
  readFile: (filePath) => ipcRenderer.invoke('fs:readFile', filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke('fs:writeFile', filePath, content),
  copyFile: (src, dest) => ipcRenderer.invoke('fs:copyFile', src, dest),
  ensureDir: (dirPath) => ipcRenderer.invoke('fs:ensureDir', dirPath),
  remove: (targetPath) => ipcRenderer.invoke('fs:remove', targetPath),
  exists: (targetPath) => ipcRenderer.invoke('fs:exists', targetPath),
  stat: (targetPath) => ipcRenderer.invoke('fs:stat', targetPath),

  // ── Config ───────────────────────────────────────────────────────────────
  getConfig: (key) => ipcRenderer.invoke('config:get', key),
  setConfig: (key, value) => ipcRenderer.invoke('config:set', key, value),
  getAllConfig: () => ipcRenderer.invoke('config:getAll'),

  // ── Wiki ────────────────────────────────────────────────────────────────
  wikiInitialize: () => ipcRenderer.invoke('wiki:initialize'),
  wikiListDocuments: () => ipcRenderer.invoke('wiki:listDocuments'),
  wikiGetDocument: (title) => ipcRenderer.invoke('wiki:getDocument', title),
  wikiSearchDocuments: (query) => ipcRenderer.invoke('wiki:searchDocuments', query),
  wikiBuildLinkGraph: () => ipcRenderer.invoke('wiki:buildLinkGraph'),
  wikiGetStats: () => ipcRenderer.invoke('wiki:getStats'),

  // ── Ingest ──────────────────────────────────────────────────────────────
  ingestProcessFile: (filePath) => ipcRenderer.invoke('ingest:processFile', filePath),
  ingestProcessBatch: (filePaths) => ipcRenderer.invoke('ingest:processBatch', filePaths),
  onIngestProgress: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('ingest:progress', handler);
    return () => ipcRenderer.removeListener('ingest:progress', handler);
  },

  // ── Query ───────────────────────────────────────────────────────────────
  queryAsk: (question) => ipcRenderer.invoke('query:ask', question),
  querySearch: (query, limit) => ipcRenderer.invoke('query:search', query, limit),
  queryGetBacklinks: (title) => ipcRenderer.invoke('query:getBacklinks', title),

  // ── Lint ────────────────────────────────────────────────────────────────
  lintLintDocument: (filePath) => ipcRenderer.invoke('lint:lintDocument', filePath),
  lintLintAll: () => ipcRenderer.invoke('lint:lintAll'),
  lintQuickCheck: (filePath) => ipcRenderer.invoke('lint:quickCheck', filePath),
  onLintProgress: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('lint:progress', handler);
    return () => ipcRenderer.removeListener('lint:progress', handler);
  },

  // ── LLM ─────────────────────────────────────────────────────────────────
  llmChat: (messages, options) => ipcRenderer.invoke('llm:chat', messages, options),
  llmTest: () => ipcRenderer.invoke('llm:test'),

  // ── Shell ───────────────────────────────────────────────────────────────
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  openPath: (filePath) => ipcRenderer.invoke('shell:openPath', filePath),

  // ── Platform ─────────────────────────────────────────────────────────────
  platform: process.platform,
});

console.log('[Preload] electronAPI exposed to renderer (with core IPC)');
