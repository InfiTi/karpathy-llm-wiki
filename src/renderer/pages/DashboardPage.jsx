import React, { useEffect, useState } from 'react';
import useStore from '../store/useStore';

export default function DashboardPage() {
  const { config, addLog } = useStore();
  const [stats, setStats] = useState({ docs: 0, rawFiles: 0, lastUpdate: null });

  useEffect(() => {
    loadStats();
  }, [config.projectRoot]);

  const loadStats = async () => {
    if (!window.electronAPI || !config.projectRoot) return;
    try {
      // Count wiki docs
      const wikiDir = await window.electronAPI.readDir(config.projectRoot + '\\wiki');
      const mdFiles = wikiDir.filter(e => e.isFile && e.name.endsWith('.md'));
      const rawDir = await window.electronAPI.readDir(config.projectRoot + '\\raw_sources');
      setStats({ 
        docs: mdFiles.length, 
        rawFiles: rawDir.filter(e => e.isFile).length,
        lastUpdate: new Date().toLocaleString('zh-CN')
      });
    } catch (e) {
      // ignore
    }
  };

  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 24 }}>📊 项目概览</h1>

      {/* Stats Cards */}
      <div className="grid-3 mb-24">
        <div className="card">
          <div className="card-title">📄 Wiki 文档</div>
          <div style={{ fontSize: 36, fontWeight: 700, color: 'var(--accent-blue)' }}>
            {stats.docs}
          </div>
          <div className="text-muted mt-8">个知识条目</div>
        </div>
        <div className="card">
          <div className="card-title">📂 原始文件</div>
          <div style={{ fontSize: 36, fontWeight: 700, color: 'var(--accent-green)' }}>
            {stats.rawFiles}
          </div>
          <div className="text-muted mt-8">个待处理文件</div>
        </div>
        <div className="card">
          <div className="card-title">🕐 最后更新</div>
          <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--accent-purple)' }}>
            {stats.lastUpdate || '—'}
          </div>
          <div className="text-muted mt-8">实时统计</div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="card">
        <div className="card-title">🚀 快速操作</div>
        <div className="grid-3 mt-16">
          <QuickAction 
            icon="📥" 
            title="Ingest" 
            desc="摄入原始文档，生成 wiki 条目"
            path="/ingest"
          />
          <QuickAction 
            icon="🔍" 
            title="Query" 
            desc="查询知识库，AI 回答问题"
            path="/query"
          />
          <QuickAction 
            icon="✅" 
            title="Lint" 
            desc="质量检查，发现问题并修复"
            path="/lint"
          />
        </div>
      </div>

      {/* Project Setup Status */}
      <div className="card mt-16">
        <div className="card-title">⚙️ 项目状态</div>
        <div style={{ marginTop: 16 }}>
          <StatusRow label="项目目录" value={config.projectRoot || '❌ 未设置'} ok={!!config.projectRoot} />
          <StatusRow label="Wiki 目录" value={config.projectRoot ? config.projectRoot + '\\wiki' : '—'} ok={!!config.projectRoot} />
          <StatusRow label="AI 后端" value={config.llmBackend === 'ollama' ? '🦙 Ollama' : '💡 LM Studio'} ok={true} />
          <StatusRow label="模型" value={config.defaultModel || '未选择'} ok={!!config.defaultModel} />
          <StatusRow label="后端地址" value={
            config.llmBackend === 'ollama' 
              ? (config.ollamaUrl || 'localhost:11434')
              : (config.lmStudioUrl || 'localhost:1234')
          } ok={true} />
        </div>
        {!config.projectRoot && (
          <div style={{ marginTop: 16, padding: '12px 16px', background: 'rgba(248,81,73,0.1)', borderRadius: 8, color: 'var(--accent-red)', fontSize: 13 }}>
            ⚠️ 请先前往「项目初始化」设置项目目录
          </div>
        )}
      </div>
    </div>
  );
}

function QuickAction({ icon, title, desc, path }) {
  const navigate = (e) => {
    window.location.href = path;
  };
  return (
    <div 
      onClick={navigate}
      style={{ 
        padding: '20px 16px', 
        background: 'var(--bg-tertiary)', 
        borderRadius: 12, 
        cursor: 'pointer',
        border: '1px solid var(--border)',
        transition: 'var(--transition)',
        textAlign: 'center'
      }}
      onMouseOver={e => e.currentTarget.style.borderColor = 'var(--accent-blue)'}
      onMouseOut={e => e.currentTarget.style.borderColor = 'var(--border)'}
    >
      <div style={{ fontSize: 32, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{desc}</div>
    </div>
  );
}

function StatusRow({ label, value, ok }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ color: ok ? 'var(--accent-green)' : 'var(--accent-red)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{value}</span>
    </div>
  );
}
