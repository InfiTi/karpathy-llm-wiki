import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import useStore from './store/useStore';

// Pages
import SetupPage from './pages/SetupPage';
import DashboardPage from './pages/DashboardPage';
import IngestPage from './pages/IngestPage';
import QueryPage from './pages/QueryPage';
import LintPage from './pages/LintPage';
import ConfigPage from './pages/ConfigPage';
import DebugPage from './pages/DebugPage';

const NAV_ITEMS = [
  { path: '/', icon: '🏠', label: '概览' },
  { path: '/setup', icon: '⚙️', label: '项目初始化' },
  { path: '/ingest', icon: '📥', label: 'Ingest', desc: '摄入原始文档' },
  { path: '/query', icon: '🔍', label: 'Query', desc: '查询知识库' },
  { path: '/lint', icon: '✅', label: 'Lint', desc: '质量检查' },
  { path: '/config', icon: '🔧', label: '配置' },
  { path: '/debug', icon: '🐛', label: '调试', desc: '查看后台输出' },
];

export default function App() {
  const { config, loadConfig } = useStore();

  useEffect(() => {
    loadConfig();
  }, []);

  const [lastModified, setLastModified] = useState(new Date().toLocaleString());

  useEffect(() => {
    // 尝试获取最后构建时间或文件修改时间
    if (window.electronAPI) {
      window.electronAPI.getLastModified().then(date => {
        if (date) setLastModified(date);
      }).catch(() => {
        // 如果失败，使用当前时间
        setLastModified(new Date().toLocaleString());
      });
    }
  }, []);

  return (
    <BrowserRouter>
      <div className="app-shell">
        {/* Header */}
        <header className="app-header">
          <span className="logo">🧠 Karpathy LLM Wiki</span>
          <span className="subtitle">本地 AI 知识库管理系统</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 16, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>v0.1.0 · {lastModified}</span>
            <StatusIndicator />
          </div>
        </header>

        <div className="app-body">
          {/* Sidebar */}
          <nav className="sidebar">
            <div className="sidebar-section">
              <div className="sidebar-title">导航</div>
              {NAV_ITEMS.map(item => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}
                >
                  <span className="icon">{item.icon}</span>
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>

            {/* Project Status */}
            <div className="sidebar-section">
              <div className="sidebar-title">项目状态</div>
              <div style={{ padding: '4px 16px' }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
                  项目目录
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
                  {config.projectRoot || '未设置'}
                </div>
              </div>
              <div style={{ padding: '4px 16px' }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
                  AI 后端
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {config.llmBackend === 'ollama' ? '🦙 Ollama' : '💡 LM Studio'}
                </div>
              </div>
            </div>
          </nav>

          {/* Main Content */}
          <main className="main-content">
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/setup" element={<SetupPage />} />
              <Route path="/ingest" element={<IngestPage />} />
              <Route path="/query" element={<QueryPage />} />
              <Route path="/lint" element={<LintPage />} />
              <Route path="/config" element={<ConfigPage />} />
              <Route path="/debug" element={<DebugPage />} />
            </Routes>
          </main>
        </div>
      </div>
    </BrowserRouter>
  );
}

function StatusIndicator() {
  const { config } = useStore();

  const checkBackend = async () => {
    if (!window.electronAPI) return 'no-api';
    try {
      const res = await fetch(`${config.ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
      return res.ok ? 'online' : 'offline';
    } catch {
      return 'offline';
    }
  };

  return (
    <span className="status-badge green">
      <span className="dot" />
      系统就绪
    </span>
  );
}
