const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const Store = require('electron-store');

// ============================================================================
// Main Process - Electron Entry
// ============================================================================

const store = new Store({
  name: 'karpathy-llm-wiki-config',
  defaults: {
    projectRoot: '',
    obsidianVault: '',
    llmBackend: 'ollama',
    ollamaUrl: 'http://localhost:11434',
    lmStudioUrl: 'http://localhost:1234',
    defaultModel: 'qwen3.5:latest',
    rawSourcesDir: 'raw_sources',
    wikiDir: 'wiki',
  }
});

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: 'Karpathy LLM Wiki',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Load app
  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/dist/index.html'));
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ============================================================================
// IPC Handlers - File System Operations
// ============================================================================

ipcMain.handle('dialog:selectDirectory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  return result.filePaths[0] || null;
});

ipcMain.handle('dialog:selectFile', async (event, options) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: options?.filters || [{ name: 'All Files', extensions: ['*'] }]
  });
  return result.filePaths;
});

ipcMain.handle('fs:readDir', async (event, dirPath) => {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries.map(e => ({
      name: e.name,
      isDirectory: e.isDirectory(),
      isFile: e.isFile(),
      path: path.join(dirPath, e.name)
    }));
  } catch (err) {
    throw new Error(`读取目录失败: ${err.message}`);
  }
});

ipcMain.handle('fs:readFile', async (event, filePath) => {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (err) {
    throw new Error(`读取文件失败: ${err.message}`);
  }
});

ipcMain.handle('fs:writeFile', async (event, filePath, content) => {
  try {
    await fs.ensureFile(filePath);
    await fs.writeFile(filePath, content, 'utf-8');
    return true;
  } catch (err) {
    throw new Error(`写入文件失败: ${err.message}`);
  }
});

ipcMain.handle('fs:copyFile', async (event, src, dest) => {
  await fs.copy(src, dest);
  return true;
});

ipcMain.handle('fs:ensureDir', async (event, dirPath) => {
  await fs.ensureDir(dirPath);
  return true;
});

ipcMain.handle('fs:remove', async (event, targetPath) => {
  await fs.remove(targetPath);
  return true;
});

ipcMain.handle('fs:exists', async (event, targetPath) => {
  return await fs.pathExists(targetPath);
});

ipcMain.handle('fs:stat', async (event, targetPath) => {
  const stat = await fs.stat(targetPath);
  return {
    isFile: stat.isFile(),
    isDirectory: stat.isDirectory(),
    size: stat.size,
    mtime: stat.mtime,
    ctime: stat.ctime
  };
});

// ============================================================================
// IPC Handlers - Config
// ============================================================================

ipcMain.handle('config:get', (event, key) => {
  return store.get(key);
});

ipcMain.handle('config:set', (event, key, value) => {
  store.set(key, value);
  return true;
});

ipcMain.handle('config:getAll', () => {
  return store.store;
});

// ============================================================================
// IPC Handlers - Shell / External
// ============================================================================

ipcMain.handle('shell:openExternal', (event, url) => {
  shell.openExternal(url);
});

ipcMain.handle('shell:openPath', (event, filePath) => {
  shell.openPath(filePath);
});

// ============================================================================
// App Lifecycle
// ============================================================================

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

console.log('[Karpathy LLM Wiki] Main process started');
