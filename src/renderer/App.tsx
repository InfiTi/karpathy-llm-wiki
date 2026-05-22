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

interface NavItem {
  path: string;
  icon: string;
  label: string;
  desc?: string;
}

const NAV_ITEMS: NavItem[] = [
  { path: '/', icon: '🏠', label: '概览' },
  { path: '/setup', icon: '⚙️', label: '项目初始化' },
  { path: '/ingest', icon: '📥', label: 'Ingest', desc: '摄入原始文档' },
  { path: '/query', icon: '🔍', label: 'Query', desc: '查询知识库' },
  { path: '/lint', icon: '✅', label: 'Lint', desc: '质量检查' },
  { path: '/config', icon: '🔧', label: '配置' },
];

export default function App() {
  const { config, loadConfig, toast, hideToast } = useStore();

  // Play notification sound
  useEffect(() => {
    if (toast && config?.notifications?.sound !== false) {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = toast.type === 'success' ? 800 : toast.type === 'error' ? 400 : 600;
      oscillator.type = 'sine';
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.5);
    }
  }, [toast, config]);

  useEffect(() => {
    loadConfig();
  }, []);

  return (
    <>
      {/* Toast Notification - Codex Style */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 99999,
            background: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'auto',
            outline: '1px solid red',
          }}
          onClick={hideToast}
        >
          <div
            style={{
              background: '#1a1a2e',
              border: `3px solid ${toast.type === 'success' ? '#4ade80' :
                toast.type === 'error' ? '#f87171' : '#60a5fa'}`,
              borderRadius: 16,
              padding: '40px',
              minWidth: 350,
              maxWidth: 500,
              textAlign: 'center',
              boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
              pointerEvents: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 64, marginBottom: 20 }}>
              {toast.type === 'success' ? '✅' : toast.type === 'error' ? '❌' : 'ℹ️'}
            </div>
            <div style={{ fontWeight: 700, fontSize: 24, color: '#ffffff', marginBottom: 16 }}>
              {toast.title}
            </div>
            {toast.message && (
              <div style={{ fontSize: 16, color: 'rgba(255,255,255,0.8)', marginBottom: 24 }}>
                {toast.message}
              </div>
            )}
            <button
              onClick={hideToast}
              style={{
                background: toast.type === 'success' ? '#4ade80' :
                  toast.type === 'error' ? '#f87171' : '#60a5fa',
                border: 'none',
                borderRadius: 8,
                padding: '14px 40px',
                color: '#000000',
                fontSize: 16,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              好的
            </button>
          </div>
        </div>
      )}

      <BrowserRouter>
        <div className="app-shell">

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
                    {config.llm?.backend === 'ollama' ? '🦙 Ollama' : '💡 LM Studio'}
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
              </Routes>
            </main>
          </div>
        </div>
      </BrowserRouter>
      );
}

      function StatusIndicator() {
  const {config} = useStore();

  const checkBackend = async () => {
    if (!window.electronAPI) return 'no-api';
      try {
      const res = await fetch(`${config.llm?.url || 'http://localhost:11434'}/api/tags`, {signal: AbortSignal.timeout(3000) });
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