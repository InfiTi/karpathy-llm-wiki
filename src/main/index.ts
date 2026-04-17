import { app, BrowserWindow, ipcMain, dialog, shell, IpcMainInvokeEvent } from 'electron';
import path from 'path';
import fs from 'fs-extra';
import { ProjectConfig } from '@/types';

// Set userData to project directory to avoid AppData access
app.setPath('userData', path.join(__dirname, '..', '..', '.electron-data'));

// ============================================================================
// Core Modules (loaded after app ready)
// ============================================================================
// Core modules - loaded dynamically
let coreModules: any = {
  LLMClient: null,
  WikiManager: null,
  IngestPipeline: null,
  QueryEngine: null,
  LintChecker: null
};

// Logs collection
const logs: { level: string; message: string; timestamp: string }[] = [];

async function loadCoreModules() {
  const distCore = path.join(__dirname, '..', '..', 'core');
  const { LLMClient } = require(path.join(distCore, 'llm', 'client.cjs'));
  const { WikiManager } = require(path.join(distCore, 'wiki', 'index.cjs'));
  const { IngestPipeline } = require(path.join(distCore, 'ingest', 'index.cjs'));
  const { QueryEngine } = require(path.join(distCore, 'query', 'index.cjs'));
  const { LintChecker } = require(path.join(distCore, 'lint', 'index.cjs'));
  coreModules = { LLMClient, WikiManager, IngestPipeline, QueryEngine, LintChecker };
  console.log('[Core] All modules loaded');
}

function getConfig(): ProjectConfig {
  return configData as ProjectConfig;
}

// ============================================================================
// Configuration
// ============================================================================
interface ConfigData {
  projectRoot: string;
  obsidianVault: string;
  llm: {
    backend: 'ollama' | 'lmstudio' | 'openai';
    url: string;
    model: string;
    apiKey: string;
    timeout: number;
  };
  wiki: {
    directory: string;
    rawDirectory: string;
  };
  ingest: {
    defaultPageType: string;
  };
  query: {
    maxContextTokens: number;
  };
  lint: {
    autoCheck: boolean;
  };
  [key: string]: any;
}

let configData: ConfigData = {
  projectRoot: '',
  obsidianVault: '',
  llm: {
    backend: 'ollama',
    url: 'http://localhost:11434',
    model: 'qwen3.5:latest',
    apiKey: '',
    timeout: 120000
  },
  wiki: {
    directory: 'wiki',
    rawDirectory: 'raw_sources'
  },
  ingest: {
    defaultPageType: 'note'
  },
  query: {
    maxContextTokens: 4096
  },
  lint: {
    autoCheck: true
  }
};

const configPath = path.join(__dirname, '..', '..', 'config.json');

// Load config from file
function loadConfig() {
  try {
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf8');
      configData = { ...configData, ...JSON.parse(data) };
    }
  } catch (err: any) {
    console.error('Error loading config:', err.message);
  }
}

// Save config to file
function saveConfig() {
  try {
    fs.writeFileSync(configPath, JSON.stringify(configData, null, 2));
  } catch (err: any) {
    console.error('Error saving config:', err.message);
  }
}

let mainWindow: BrowserWindow | null = null;

// ============================================================================
// Window
// ============================================================================
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
      disableBlinkFeatures: 'Autofill'
    },
  });

  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    mainWindow.loadURL('http://localhost:3001');
    // 暂时禁用自动打开 DevTools 以避免 Autofill 错误
    // mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/dist/index.html'));
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ============================================================================
// IPC Handlers - File System
// ============================================================================
ipcMain.handle('dialog:selectDirectory', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, { properties: ['openDirectory'] });
  return result.filePaths[0] || null;
});

ipcMain.handle('dialog:selectFile', async (_event: IpcMainInvokeEvent, options: any) => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile', 'multiSelections'],
    filters: options?.filters || [{ name: 'All Files', extensions: ['*'] }]
  });
  return result.filePaths;
});

ipcMain.handle('fs:readDir', async (_event: IpcMainInvokeEvent, dirPath: string) => {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries.map(e => ({
      name: e.name, isDirectory: e.isDirectory(),
      isFile: e.isFile(), path: path.join(dirPath, e.name)
    }));
  } catch (err: any) { throw new Error(`读取目录失败: ${err.message}`); }
});

ipcMain.handle('fs:readFile', async (_event: IpcMainInvokeEvent, filePath: string) => {
  try { return await fs.readFile(filePath, 'utf-8'); }
  catch (err: any) { throw new Error(`读取文件失败: ${err.message}`); }
});

ipcMain.handle('fs:writeFile', async (_event: IpcMainInvokeEvent, filePath: string, content: string) => {
  try {
    await fs.ensureFile(filePath);
    await fs.writeFile(filePath, content, 'utf-8');
    return true;
  } catch (err: any) { throw new Error(`写入文件失败: ${err.message}`); }
});

ipcMain.handle('fs:copyFile', async (_event: IpcMainInvokeEvent, src: string, dest: string) => {
  await fs.copy(src, dest);
  return true;
});

ipcMain.handle('fs:ensureDir', async (_event: IpcMainInvokeEvent, dirPath: string) => {
  await fs.ensureDir(dirPath);
  return true;
});

ipcMain.handle('fs:remove', async (_event: IpcMainInvokeEvent, targetPath: string) => {
  await fs.remove(targetPath);
  return true;
});

ipcMain.handle('fs:exists', async (_event: IpcMainInvokeEvent, targetPath: string) => {
  return await fs.pathExists(targetPath);
});

ipcMain.handle('fs:stat', async (_event: IpcMainInvokeEvent, targetPath: string) => {
  const stat = await fs.stat(targetPath);
  return { isFile: stat.isFile(), isDirectory: stat.isDirectory(), size: stat.size, mtime: stat.mtime };
});

ipcMain.handle('debug:getLogs', () => {
  return logs;
});

ipcMain.handle('debug:clearLogs', () => {
  logs.length = 0;
  return true;
});

// ============================================================================
// IPC Handlers - Platform
// ============================================================================
ipcMain.handle('config:get', (_event: IpcMainInvokeEvent, key: string) => {
  // 使用类型安全的方式访问配置数据
  if (key === 'projectRoot') return configData.projectRoot;
  if (key === 'obsidianVault') return configData.obsidianVault;
  if (key === 'llm') return configData.llm;
  if (key === 'wiki') return configData.wiki;
  if (key === 'ingest') return configData.ingest;
  if (key === 'query') return configData.query;
  if (key === 'lint') return configData.lint;
  return undefined;
});
ipcMain.handle('config:set', (_event: IpcMainInvokeEvent, key: string, value: any) => {
  // 使用类型安全的方式设置配置数据
  if (key === 'projectRoot') configData.projectRoot = value;
  else if (key === 'obsidianVault') configData.obsidianVault = value;
  else if (key === 'llm') configData.llm = value;
  else if (key === 'wiki') configData.wiki = value;
  else if (key === 'ingest') configData.ingest = value;
  else if (key === 'query') configData.query = value;
  else if (key === 'lint') configData.lint = value;
  saveConfig();
  return true;
});
ipcMain.handle('config:getAll', () => configData);

ipcMain.handle('getLastModified', () => {
  return new Date().toLocaleString();
});

// ============================================================================
// IPC Handlers - Wiki Manager
// ============================================================================
ipcMain.handle('wiki:initialize', async () => {
  try {
    const config = getConfig();
    if (!coreModules.WikiManager) throw new Error('WikiManager 模块未加载');
    const wiki = new coreModules.WikiManager(config.projectRoot || '');
    await wiki.initialize();
    // 确保 raw 目录也存在
    const rawDir = path.join(config.projectRoot || '', 'raw');
    await fs.ensureDir(rawDir);
    return { success: true };
  } catch (err: any) { return { success: false, error: err.message }; }
});

ipcMain.handle('wiki:listDocuments', async () => {
  try {
    const config = getConfig();
    if (!coreModules.WikiManager) throw new Error('WikiManager 模块未加载');
    const wiki = new coreModules.WikiManager(config.projectRoot || '');
    return await wiki.listDocuments();
  } catch (err: any) { throw new Error(err.message); }
});

ipcMain.handle('wiki:getDocument', async (_event: IpcMainInvokeEvent, title: string) => {
  try {
    const config = getConfig();
    if (!coreModules.WikiManager) throw new Error('WikiManager 模块未加载');
    const wiki = new coreModules.WikiManager(config.projectRoot || '');
    return await wiki.getDocument(title);
  } catch (err: any) { throw new Error(err.message); }
});

ipcMain.handle('wiki:searchDocuments', async (_event: IpcMainInvokeEvent, query: string) => {
  try {
    const config = getConfig();
    if (!coreModules.WikiManager) throw new Error('WikiManager 模块未加载');
    const wiki = new coreModules.WikiManager(config.projectRoot || '');
    return await wiki.searchDocuments(query);
  } catch (err: any) { throw new Error(err.message); }
});

ipcMain.handle('wiki:getStats', async () => {
  try {
    const config = getConfig();
    if (!coreModules.WikiManager) throw new Error('WikiManager 模块未加载');
    const wiki = new coreModules.WikiManager(config.projectRoot || '');
    const docs = await wiki.listDocuments();
    return { docCount: docs.length };
  } catch (err: any) { return { docCount: 0 }; }
});

// ============================================================================
// IPC Handlers - Ingest Pipeline
// ============================================================================
ipcMain.handle('ingest:processFile', async (_event: IpcMainInvokeEvent, filePath: string) => {
  try {
    const config = getConfig();
    if (!coreModules.IngestPipeline) throw new Error('IngestPipeline 模块未加载');
    const pipeline = new coreModules.IngestPipeline(config);

    pipeline.on('progress', (progress: { stage: string; progress: number; message: string; thinkingChars?: number; outputChars?: number }) => {
      mainWindow?.webContents.send('ingest:progress', {
        stage: progress.stage,
        progress: progress.progress,
        message: progress.message,
        thinkingChars: progress.thinkingChars,
        outputChars: progress.outputChars,
      });
    });

    const result = await pipeline.runIngest(filePath, false);
    return { success: true, ...result };
  } catch (err: any) { return { success: false, error: err.message }; }
});

ipcMain.handle('ingest:processBatch', async (_event: IpcMainInvokeEvent, filePaths: string[]) => {
  const config = getConfig();
  if (!coreModules.IngestPipeline) throw new Error('IngestPipeline 模块未加载');
  const pipeline = new coreModules.IngestPipeline(config);
  const results = [];
  const total = filePaths.length;
  for (let i = 0; i < filePaths.length; i++) {
    try {
      const result = await pipeline.runIngest(filePaths[i], false);
      results.push({ success: true, ...result });
      mainWindow?.webContents.send('ingest:progress', {
        index: i + 1, total, stage: 'completed', filePath: filePaths[i]
      });
    } catch (err: any) {
      results.push({ success: false, filePath: filePaths[i], error: err.message });
      mainWindow?.webContents.send('ingest:progress', {
        index: i + 1, total, stage: 'error', filePath: filePaths[i]
      });
    }
  }
  return results;
});

ipcMain.handle('ingest:processUrl', async (_event: IpcMainInvokeEvent, url: string) => {
  try {
    const config = getConfig();
    if (!coreModules.IngestPipeline) throw new Error('IngestPipeline 模块未加载');
    const pipeline = new coreModules.IngestPipeline(config);

    pipeline.on('progress', (progress: { stage: string; progress: number; message: string; thinkingChars?: number; outputChars?: number }) => {
      mainWindow?.webContents.send('ingest:progress', {
        stage: progress.stage,
        progress: progress.progress,
        message: progress.message,
        thinkingChars: progress.thinkingChars,
        outputChars: progress.outputChars,
      });
    });

    const result = await pipeline.runIngest(url, true);
    return { success: true, ...result };
  } catch (err: any) { throw new Error(err.message); }
});

// ============================================================================
// IPC Handlers - Query Engine
// ============================================================================
ipcMain.handle('query:ask', async (_event: IpcMainInvokeEvent, question: string) => {
  try {
    const config = getConfig();
    if (!coreModules.QueryEngine) throw new Error('QueryEngine 模块未加载');
    const engine = new coreModules.QueryEngine(config);
    return await engine.runQuery(question);
  } catch (err: any) { throw new Error(err.message); }
});

ipcMain.handle('query:saveToWiki', async (_event: IpcMainInvokeEvent, question: string, answerData: any) => {
  try {
    const config = getConfig();
    if (!coreModules.QueryEngine) throw new Error('QueryEngine 模块未加载');
    const engine = new coreModules.QueryEngine(config);
    return await engine.saveToWiki(question, answerData.answer, answerData.derivedFrom);
  } catch (err: any) { throw new Error(err.message); }
});

ipcMain.handle('query:getTopicRecommendations', async (_event: IpcMainInvokeEvent, question: string, answer: string) => {
  try {
    const config = getConfig();
    if (!coreModules.QueryEngine) throw new Error('QueryEngine 模块未加载');
    const engine = new coreModules.QueryEngine(config);
    return await engine.getTopicRecommendations(question, answer);
  } catch (err: any) { throw new Error(err.message); }
});

ipcMain.handle('query:getKnowledgeGaps', async () => {
  try {
    const config = getConfig();
    if (!coreModules.QueryEngine) throw new Error('QueryEngine 模块未加载');
    const engine = new coreModules.QueryEngine(config);
    return await engine.getKnowledgeGaps();
  } catch (err: any) { throw new Error(err.message); }
});

// ============================================================================
// IPC Handlers - Lint Checker
// ============================================================================
ipcMain.handle('lint:runLint', async () => {
  try {
    const config = getConfig();
    if (!coreModules.LintChecker) throw new Error('LintChecker 模块未加载');
    const checker = new coreModules.LintChecker(config);
    return await checker.runLint();
  } catch (err: any) { throw new Error(err.message); }
});

ipcMain.handle('lint:getWikiStatistics', async () => {
  try {
    const config = getConfig();
    if (!coreModules.LintChecker) throw new Error('LintChecker 模块未加载');
    const checker = new coreModules.LintChecker(config);
    return await checker.getWikiStatistics();
  } catch (err: any) { throw new Error(err.message); }
});

// ============================================================================
// IPC Handlers - LLM
// ============================================================================
ipcMain.handle('llm:chat', async (_event: IpcMainInvokeEvent, messages: any[], options: any) => {
  try {
    const config = getConfig();
    if (!coreModules.LLMClient) throw new Error('LLMClient 模块未加载');
    const client = new coreModules.LLMClient(config);
    return await client.chat(messages, options);
  } catch (err: any) { throw new Error(err.message); }
});

ipcMain.handle('llm:ping', async () => {
  try {
    const config = getConfig();
    if (!coreModules.LLMClient) throw new Error('LLMClient 模块未加载');
    const client = new coreModules.LLMClient(config);
    return await client.ping();
  } catch (err: any) { return false; }
});

ipcMain.handle('llm:listModels', async () => {
  try {
    const config = getConfig();
    if (!coreModules.LLMClient) throw new Error('LLMClient 模块未加载');
    const client = new coreModules.LLMClient(config);
    return await client.listModels();
  } catch (err: any) { throw new Error(err.message); }
});

// ============================================================================
// IPC Handlers - Shell / External
// ============================================================================
ipcMain.handle('shell:openExternal', (_event: IpcMainInvokeEvent, url: string) => shell.openExternal(url));
ipcMain.handle('shell:openPath', (_event: IpcMainInvokeEvent, filePath: string) => shell.openPath(filePath));

// ============================================================================
// App Lifecycle
// ============================================================================
// 添加命令行参数来禁用 Autofill
app.commandLine.appendSwitch('disable-features', 'Autofill');
app.commandLine.appendSwitch('disable-autofill');
app.commandLine.appendSwitch('disable-autofill-service');

app.whenReady().then(async () => {
  console.log('[Karpathy LLM Wiki] Starting up...');
  try {
    // 加载配置
    loadConfig();

    // 跳过 buildCore，因为在 npm run dev 中已经运行过了
    // await buildCore();
    await loadCoreModules();
    createWindow();
    console.log('[Karpathy LLM Wiki] Main process ready');
  } catch (err: any) {
    console.error('[Karpathy LLM Wiki] Startup failed:', err.message);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

console.log('[Karpathy LLM Wiki] Main process script loaded');