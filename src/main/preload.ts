import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // ── Dialog ──────────────────────────────────────────────────────────────
  selectDirectory: () => ipcRenderer.invoke('dialog:selectDirectory'),
  selectFile: (options: any) => ipcRenderer.invoke('dialog:selectFile', options),

  // ── File System ─────────────────────────────────────────────────────────
  readDir: (dirPath: string) => ipcRenderer.invoke('fs:readDir', dirPath),
  readFile: (filePath: string) => ipcRenderer.invoke('fs:readFile', filePath),
  writeFile: (filePath: string, content: string) => ipcRenderer.invoke('fs:writeFile', filePath, content),
  copyFile: (src: string, dest: string) => ipcRenderer.invoke('fs:copyFile', src, dest),
  ensureDir: (dirPath: string) => ipcRenderer.invoke('fs:ensureDir', dirPath),
  remove: (targetPath: string) => ipcRenderer.invoke('fs:remove', targetPath),
  exists: (targetPath: string) => ipcRenderer.invoke('fs:exists', targetPath),
  stat: (targetPath: string) => ipcRenderer.invoke('fs:stat', targetPath),

  // ── Config ───────────────────────────────────────────────────────────────
  getConfig: (key: string) => ipcRenderer.invoke('config:get', key),
  setConfig: (key: string, value: any) => ipcRenderer.invoke('config:set', key, value),
  getAllConfig: () => ipcRenderer.invoke('config:getAll'),

  // ── Wiki ────────────────────────────────────────────────────────────────
  wikiInitialize: () => ipcRenderer.invoke('wiki:initialize'),
  wikiListDocuments: () => ipcRenderer.invoke('wiki:listDocuments'),
  wikiGetDocument: (title: string) => ipcRenderer.invoke('wiki:getDocument', title),
  wikiSearchDocuments: (query: string) => ipcRenderer.invoke('wiki:searchDocuments', query),
  wikiGetStats: () => ipcRenderer.invoke('wiki:getStats'),

  // ── Ingest ──────────────────────────────────────────────────────────────
  ingestProcessFile: (filePath: string) => ipcRenderer.invoke('ingest:processFile', filePath),
  ingestProcessBatch: (filePaths: string[]) => ipcRenderer.invoke('ingest:processBatch', filePaths),
  ingestProcessUrl: (url: string) => ipcRenderer.invoke('ingest:processUrl', url),
  onIngestProgress: (callback: (data: any) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('ingest:progress', handler);
    return () => ipcRenderer.removeListener('ingest:progress', handler);
  },

  // ── Query ───────────────────────────────────────────────────────────────
  queryAsk: (question: string) => ipcRenderer.invoke('query:ask', question),
  querySaveToWiki: (question: string, answerData: any) => ipcRenderer.invoke('query:saveToWiki', question, answerData),
  queryGetTopicRecommendations: (question: string, answer: string) => ipcRenderer.invoke('query:getTopicRecommendations', question, answer),
  queryGetKnowledgeGaps: () => ipcRenderer.invoke('query:getKnowledgeGaps'),

  // ── Lint ────────────────────────────────────────────────────────────────
  lintRunLint: () => ipcRenderer.invoke('lint:runLint'),
  lintGetWikiStatistics: () => ipcRenderer.invoke('lint:getWikiStatistics'),

  // ── LLM ─────────────────────────────────────────────────────────────────
  llmChat: (messages: any[], options: any) => ipcRenderer.invoke('llm:chat', messages, options),
  llmPing: () => ipcRenderer.invoke('llm:ping'),
  llmListModels: () => ipcRenderer.invoke('llm:listModels'),

  // ── Debug ───────────────────────────────────────────────────────────────
  debugGetLogs: () => ipcRenderer.invoke('debug:getLogs'),
  debugClearLogs: () => ipcRenderer.invoke('debug:clearLogs'),

  // ── Shell ───────────────────────────────────────────────────────────────
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  openPath: (filePath: string) => ipcRenderer.invoke('shell:openPath', filePath),

  // ── Platform ─────────────────────────────────────────────────────────────
  platform: process.platform,
});

console.log('[Preload] electronAPI exposed to renderer (with core IPC)');