import { create } from 'zustand';

const useStore = create((set, get) => ({
  // Config
  config: {},
  projectRoot: '',
  wikiDir: '',

  loadConfig: async () => {
    if (!window.electronAPI) return;
    const cfg = await window.electronAPI.getAllConfig();
    set({ config: cfg, projectRoot: cfg.projectRoot || '', wikiDir: cfg.wikiDir || '' });
  },

  setConfig: async (key, value) => {
    if (!window.electronAPI) return;
    await window.electronAPI.setConfig(key, value);
    set(state => ({ config: { ...state.config, [key]: value } }));
  },

  // File Browser
  currentPath: '',
  fileTree: [],
  selectedFiles: [],

  setCurrentPath: (path) => set({ currentPath: path }),
  setFileTree: (tree) => set({ fileTree: tree }),
  setSelectedFiles: (files) => set({ selectedFiles: files }),

  loadDirectory: async (dirPath) => {
    if (!window.electronAPI) return;
    const entries = await window.electronAPI.readDir(dirPath);
    set({ currentPath: dirPath, fileTree: entries });
  },

  // Logs
  logs: [],

  addLog: (level, message) => {
    const timestamp = new Date().toLocaleTimeString('zh-CN');
    set(state => ({
      logs: [...state.logs.slice(-200), { level, message, timestamp }]
    }));
  },

  clearLogs: () => set({ logs: [] }),

  // Ingest State
  ingestProgress: 0,
  ingestStatus: 'idle', // idle | running | done | error
  ingestCurrentFile: '',

  setIngestProgress: (v) => set({ ingestProgress: v }),
  setIngestStatus: (s) => set({ ingestStatus: s }),
  setIngestCurrentFile: (f) => set({ ingestCurrentFile: f }),

  // Query State
  queryResult: null,
  queryLoading: false,

  setQueryResult: (r) => set({ queryResult: r }),
  setQueryLoading: (l) => set({ queryLoading: l }),

  // Lint State
  lintResults: [],
  lintRunning: false,

  setLintResults: (r) => set({ lintResults: r }),
  setLintRunning: (r) => set({ lintRunning: r }),
}));

export default useStore;
