const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Dialog
  selectDirectory: () => ipcRenderer.invoke('dialog:selectDirectory'),
  selectFile: (options) => ipcRenderer.invoke('dialog:selectFile', options),

  // File System
  readDir: (dirPath) => ipcRenderer.invoke('fs:readDir', dirPath),
  readFile: (filePath) => ipcRenderer.invoke('fs:readFile', filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke('fs:writeFile', filePath, content),
  copyFile: (src, dest) => ipcRenderer.invoke('fs:copyFile', src, dest),
  ensureDir: (dirPath) => ipcRenderer.invoke('fs:ensureDir', dirPath),
  remove: (targetPath) => ipcRenderer.invoke('fs:remove', targetPath),
  exists: (targetPath) => ipcRenderer.invoke('fs:exists', targetPath),
  stat: (targetPath) => ipcRenderer.invoke('fs:stat', targetPath),

  // Config
  getConfig: (key) => ipcRenderer.invoke('config:get', key),
  setConfig: (key, value) => ipcRenderer.invoke('config:set', key, value),
  getAllConfig: () => ipcRenderer.invoke('config:getAll'),

  // Shell
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  openPath: (filePath) => ipcRenderer.invoke('shell:openPath', filePath),

  // Platform
  platform: process.platform,
});

console.log('[Preload] electronAPI exposed to renderer');
