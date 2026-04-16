const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const { spawn } = require('child_process');

// Set userData to project directory to avoid AppData access
app.setPath('userData', path.join(__dirname, '..', '..', '.electron-data'));

// ============================================================================
// Core Modules (loaded after app ready)
// ============================================================================
let coreModules = {};

async function loadCoreModules() {
  const distCore = path.join(__dirname, '..', '..', 'dist', 'core');
  const { LLMClient } = require(path.join(distCore, 'llm', 'client.cjs'));
  const { WikiManager } = require(path.join(distCore, 'wiki', 'index.cjs'));
  const { IngestPipeline } = require(path.join(distCore, 'ingest', 'index.cjs'));
  const { QueryEngine } = require(path.join(distCore, 'query', 'index.cjs'));
  const { LintEngine } = require(path.join(distCore, 'lint', 'index.cjs'));
  coreModules = { LLMClient, WikiManager, IngestPipeline, QueryEngine, LintEngine };
  console.log('[Core] All modules loaded');
}

function getConfig() {
  return {
    ...configData,
  };
}

// ============================================================================
// Configuration
// ============================================================================
let configData = {
  projectRoot: '',
  obsidianVault: '',
  llmBackend: 'ollama',
  ollamaUrl: 'http://localhost:11434',
  lmStudioUrl: 'http://localhost:1234',
  defaultModel: 'qwen3.5:latest',
  rawSourcesDir: 'raw_sources',
  wikiDir: 'wiki',
};

const configPath = path.join(__dirname, '..', '..', 'config.json');

// Load config from file
function loadConfig() {
  try {
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf8');
      configData = { ...configData, ...JSON.parse(data) };
    }
  } catch (err) {
    console.error('Error loading config:', err.message);
  }
}

// Save config to file
function saveConfig() {
  try {
    fs.writeFileSync(configPath, JSON.stringify(configData, null, 2));
  } catch (err) {
    console.error('Error saving config:', err.message);
  }
}

let mainWindow;

// ============================================================================
// Build Core (run once before app ready)
// ============================================================================
async function buildCore() {
  return new Promise((resolve, reject) => {
    const script = path.join(__dirname, '..', '..', 'scripts', 'build-core.js');
    console.log('[buildCore] Starting build-core script:', script);
    const child = spawn(process.execPath, [script], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => stdout += d.toString());
    child.stderr.on('data', d => stderr += d.toString());
    child.on('close', code => {
      console.log('[buildCore] build-core script exited with code:', code);
      console.log('[buildCore] stdout:', stdout);
      console.log('[buildCore] stderr:', stderr);
      if (code === 0) resolve();
      else reject(new Error(`build-core failed: ${stderr}`));
    });
  });
}

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
    },
  });

  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/dist/index.html'));
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ============================================================================
// IPC Handlers - File System
// ============================================================================
ipcMain.handle('dialog:selectDirectory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
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
      name: e.name, isDirectory: e.isDirectory(),
      isFile: e.isFile(), path: path.join(dirPath, e.name)
    }));
  } catch (err) { throw new Error(`读取目录失败: ${err.message}`); }
});

ipcMain.handle('fs:readFile', async (event, filePath) => {
  try { return await fs.readFile(filePath, 'utf-8'); }
  catch (err) { throw new Error(`读取文件失败: ${err.message}`); }
});

ipcMain.handle('fs:writeFile', async (event, filePath, content) => {
  try {
    await fs.ensureFile(filePath);
    await fs.writeFile(filePath, content, 'utf-8');
    return true;
  } catch (err) { throw new Error(`写入文件失败: ${err.message}`); }
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
  return { isFile: stat.isFile(), isDirectory: stat.isDirectory(), size: stat.size, mtime: stat.mtime };
});

// ============================================================================
// IPC Handlers - Config
// ============================================================================
ipcMain.handle('config:get', (event, key) => configData[key]);
ipcMain.handle('config:set', (event, key, value) => {
  configData[key] = value;
  saveConfig();
  return true;
});
ipcMain.handle('config:getAll', () => configData);

// ============================================================================
// IPC Handlers - Wiki Manager
// ============================================================================
ipcMain.handle('wiki:initialize', async () => {
  try {
    const wiki = new coreModules.WikiManager(getConfig().projectRoot);
    await wiki.initialize();
    return { success: true };
  } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('wiki:listDocuments', async () => {
  try {
    const wiki = new coreModules.WikiManager(getConfig().projectRoot);
    return await wiki.listDocuments();
  } catch (err) { throw new Error(err.message); }
});

ipcMain.handle('wiki:getDocument', async (event, title) => {
  try {
    const wiki = new coreModules.WikiManager(getConfig().projectRoot);
    return await wiki.getDocument(title);
  } catch (err) { throw new Error(err.message); }
});

ipcMain.handle('wiki:searchDocuments', async (event, query) => {
  try {
    const wiki = new coreModules.WikiManager(getConfig().projectRoot);
    return await wiki.searchDocuments(query);
  } catch (err) { throw new Error(err.message); }
});

ipcMain.handle('wiki:getStats', async () => {
  try {
    const wiki = new coreModules.WikiManager(getConfig().projectRoot);
    const docs = await wiki.listDocuments();
    return { docCount: docs.length };
  } catch (err) { return { docCount: 0 }; }
});

// ============================================================================
// IPC Handlers - Ingest Pipeline
// ============================================================================
ipcMain.handle('ingest:processFile', async (event, filePath) => {
  try {
    const pipeline = new coreModules.IngestPipeline(getConfig());
    const result = await pipeline.processFile(filePath, (stage) => {
      mainWindow?.webContents.send('ingest:progress', { stage, filePath });
    });
    return { success: true, ...result };
  } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('ingest:processBatch', async (event, filePaths) => {
  const pipeline = new coreModules.IngestPipeline(getConfig());
  const results = [];
  const total = filePaths.length;
  for (let i = 0; i < filePaths.length; i++) {
    try {
      const result = await pipeline.processFile(filePaths[i], (stage) => {
        mainWindow?.webContents.send('ingest:progress', {
          index: i + 1, total, stage, filePath: filePaths[i]
        });
      });
      results.push({ success: true, ...result });
    } catch (err) {
      results.push({ success: false, filePath: filePaths[i], error: err.message });
    }
  }
  return results;
});

// ============================================================================
// IPC Handlers - Query Engine
// ============================================================================
ipcMain.handle('query:ask', async (event, question) => {
  try {
    const engine = new coreModules.QueryEngine(getConfig());
    return await engine.ask(question, { useLLM: true });
  } catch (err) { throw new Error(err.message); }
});

ipcMain.handle('query:search', async (event, query, limit) => {
  try {
    const engine = new coreModules.QueryEngine(getConfig());
    return await engine.search(query, { limit: limit || 10 });
  } catch (err) { throw new Error(err.message); }
});

ipcMain.handle('query:saveToWiki', async (event, question, answerData) => {
  try {
    const engine = new coreModules.QueryEngine(getConfig());
    return await engine.saveToWiki(question, answerData);
  } catch (err) { throw new Error(err.message); }
});

ipcMain.handle('query:getTopicRecommendations', async () => {
  try {
    const engine = new coreModules.QueryEngine(getConfig());
    return await engine.getTopicRecommendations();
  } catch (err) { throw new Error(err.message); }
});

ipcMain.handle('query:getRelatedQuestions', async (event, query) => {
  try {
    const engine = new coreModules.QueryEngine(getConfig());
    return await engine.getRelatedQuestions(query);
  } catch (err) { throw new Error(err.message); }
});

ipcMain.handle('query:getRelatedQuestionsForDocument', async (event, title) => {
  try {
    const engine = new coreModules.QueryEngine(getConfig());
    return await engine.getRelatedQuestionsForDocument(title);
  } catch (err) { throw new Error(err.message); }
});

ipcMain.handle('query:getKnowledgeExploration', async () => {
  try {
    const engine = new coreModules.QueryEngine(getConfig());
    return await engine.getKnowledgeExploration();
  } catch (err) { throw new Error(err.message); }
});

ipcMain.handle('query:getCombinedRecommendations', async (event, query) => {
  try {
    const engine = new coreModules.QueryEngine(getConfig());
    return await engine.getCombinedRecommendations(query);
  } catch (err) { throw new Error(err.message); }
});

// ============================================================================
// IPC Handlers - Lint Engine
// ============================================================================
ipcMain.handle('lint:lintDocument', async (event, filePath) => {
  try {
    const engine = new coreModules.LintEngine(getConfig());
    return await engine.lintDocument(filePath);
  } catch (err) { throw new Error(err.message); }
});

ipcMain.handle('lint:lintAll', async () => {
  const engine = new coreModules.LintEngine(getConfig());
  const docs = await coreModules.WikiManager.prototype.listDocuments
    ? (new coreModules.WikiManager(getConfig().projectRoot)).listDocuments()
    : [];
  const results = [];
  for (let i = 0; i < docs.length; i++) {
    const result = await engine.lintDocument(docs[i].filePath);
    results.push(result);
    mainWindow?.webContents.send('lint:progress', { index: i + 1, total: docs.length, title: docs[i].title });
  }
  return results;
});

ipcMain.handle('lint:quickCheck', async (event, filePath) => {
  try {
    const engine = new coreModules.LintEngine(getConfig());
    return await engine.quickCheck(filePath);
  } catch (err) { throw new Error(err.message); }
});

// ============================================================================
// IPC Handlers - LLM
// ============================================================================
ipcMain.handle('llm:chat', async (event, messages, options) => {
  try {
    const client = new coreModules.LLMClient(getConfig());
    return await client.chat(messages, options);
  } catch (err) { throw new Error(err.message); }
});

ipcMain.handle('llm:test', async () => {
  try {
    const client = new coreModules.LLMClient(getConfig());
    const result = await client.test();
    return { success: true, ...result };
  } catch (err) { return { success: false, error: err.message }; }
});

// ============================================================================
// IPC Handlers - Shell / External
// ============================================================================
ipcMain.handle('shell:openExternal', (event, url) => shell.openExternal(url));
ipcMain.handle('shell:openPath', (event, filePath) => shell.openPath(filePath));

// ============================================================================
// App Lifecycle
// ============================================================================
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
  } catch (err) {
    console.error('[Karpathy LLM Wiki] Startup failed:', err.message);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

console.log('[Karpathy LLM Wiki] Main process script loaded');
