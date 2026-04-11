import React, { useEffect, useState } from 'react';
import useStore from '../store/useStore';

export default function DashboardPage() {
  const { config, addLog } = useStore();
  const [stats, setStats] = useState({ docCount: 0, linkCount: 0 });
  const [recentDocs, setRecentDocs] = useState([]);
  const [llmStatus, setLlmStatus] = useState({ ok: false, checking: true });

  useEffect(() => {
    if (!window.electronAPI || !config.projectRoot) return;
    loadDashboard();
  }, [config.projectRoot]);

  const loadDashboard = async () => {
    // Load wiki stats
    try {
      const wikiStats = await window.electronAPI.wikiGetStats();
      setStats(wikiStats);

      // Load recent docs
      const docs = await window.electronAPI.wikiListDocuments();
      setRecentDocs(docs.slice(0, 5));
    } catch {}

    // Check LLM status
    try {
      const result = await window.electronAPI.llmTest();
      setLlmStatus({ ok: result.success, checking: false, info: result });
    } catch (err) {
      setLlmStatus({ ok: false, checking: false, error: err.message });
    }
  };

  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 8 }}>📊 Dashboard</h1>
      <div className="text-muted mb-24">
        知识库概览 · {config.projectRoot ? config.projectRoot : '未设置项目目录'}
      </div>

      {/* Stats Grid */}
      <div className="grid-3 gap-16 mb-24">
        <div className="card stat-card">
          <div style={{ fontSize: 36, marginBottom: 8 }}>📄</div>
          <div style={{ fontSize: 32, fontWeight: 700 }}>{stats.docCount}</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Wiki 文档</div>
        </div>
        <div className="card stat-card">
          <div style={{ fontSize: 36, marginBottom: 8 }}>🔗</div>
          <div style={{ fontSize: 32, fontWeight: 700 }}>{stats.linkCount}</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>双向链接</div>
        </div>
        <div className="card stat-card">
          <div style={{ fontSize: 36, marginBottom: 8 }}>
            {llmStatus.checking ? '⏳' : llmStatus.ok ? '✅' : '❌'}
          </div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>
            {llmStatus.checking ? '检测中...' : llmStatus.ok ? '已连接' : '未连接'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            AI 后端 ({config.llmBackend || 'ollama'})
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="card mb-16">
        <div className="card-title">⚡ 快速操作</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={() => window.electronAPI?.wikiInitialize?.()}>
            🔧 初始化 Wiki
          </button>
          <button className="btn btn-secondary" onClick={() => window.electronAPI?.openPath?.(config.projectRoot + '\\wiki')}>
            📂 打开 Wiki 目录
          </button>
          <button className="btn btn-secondary" onClick={() => window.electronAPI?.openPath?.(config.projectRoot + '\\raw_sources')}>
            📂 打开原始文档目录
          </button>
        </div>
      </div>

      {/* Recent Documents */}
      <div className="card">
        <div className="card-title">📑 最近文档</div>
        {recentDocs.length > 0 ? (
          <div>
            {recentDocs.map((doc, i) => (
              <div key={i} style={{
                padding: '10px 0', borderBottom: '1px solid var(--border)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
              }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>📄 {doc.name}</div>
                  {doc.path && <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{doc.path}</div>}
                </div>
                <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => window.electronAPI?.openPath?.(doc.path)}>
                  打开
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: 13 }}>
            暂无文档，请先 Ingest 原始文档
          </div>
        )}
      </div>
    </div>
  );
}
