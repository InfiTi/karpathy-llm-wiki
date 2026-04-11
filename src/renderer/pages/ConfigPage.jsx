import React, { useState } from 'react';
import useStore from '../store/useStore';

export default function ConfigPage() {
  const { config, setConfig } = useStore();
  const [saved, setSaved] = useState(false);

  const saveAll = async () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const fields = [
    { key: 'projectRoot', label: '项目根目录', type: 'dir' },
    { key: 'rawSourcesDir', label: '原始文档目录', type: 'text', default: 'raw_sources' },
    { key: 'wikiDir', label: 'Wiki 目录', type: 'text', default: 'wiki' },
  ];

  const llmFields = [
    { key: 'ollamaUrl', label: 'Ollama 地址', type: 'text', default: 'http://localhost:11434' },
    { key: 'lmStudioUrl', label: 'LM Studio 地址', type: 'text', default: 'http://localhost:1234' },
    { key: 'defaultModel', label: '默认模型', type: 'text', placeholder: '如: qwen3.5:latest' },
  ];

  return (
    <div style={{ maxWidth: 700 }}>
      <h1 style={{ fontSize: 24, marginBottom: 24 }}>🔧 配置</h1>

      {/* Project Config */}
      <div className="card">
        <div className="card-title">📂 项目配置</div>
        {fields.map(f => (
          <div className="form-group" key={f.key}>
            <label className="form-label">{f.label}</label>
            <div className="flex gap-8">
              <input
                className="input"
                type="text"
                value={config[f.key] || ''}
                placeholder={f.default}
                onChange={e => setConfig(f.key, e.target.value)}
                style={{ flex: 1 }}
              />
              {f.type === 'dir' && (
                <button className="btn btn-secondary" onClick={async () => {
                  if (!window.electronAPI) return;
                  const dir = await window.electronAPI.selectDirectory();
                  if (dir) setConfig(f.key, dir);
                }}>浏览</button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* LLM Config */}
      <div className="card mt-16">
        <div className="card-title">🤖 AI 后端配置</div>

        <div className="form-group">
          <label className="form-label">后端类型</label>
          <div className="flex gap-8">
            {[
              { key: 'ollama', label: '🦙 Ollama', desc: '开源本地模型' },
              { key: 'lmstudio', label: '💡 LM Studio', desc: '桌面模型管理' },
            ].map(b => (
              <div
                key={b.key}
                onClick={() => setConfig('llmBackend', b.key)}
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  borderRadius: 8,
                  border: `1px solid ${config.llmBackend === b.key ? 'var(--accent-blue)' : 'var(--border)'}`,
                  background: config.llmBackend === b.key ? 'rgba(88,166,255,0.08)' : 'var(--bg-primary)',
                  cursor: 'pointer',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 14 }}>{b.label}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{b.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {llmFields.map(f => (
          <div className="form-group" key={f.key}>
            <label className="form-label">{f.label}</label>
            <input
              className="input"
              type="text"
              value={config[f.key] || ''}
              placeholder={f.placeholder || f.default}
              onChange={e => setConfig(f.key, e.target.value)}
            />
          </div>
        ))}

        <div className="mt-16">
          <button className="btn btn-primary" onClick={async () => {
            const url = config.llmBackend === 'ollama' 
              ? (config.ollamaUrl || 'http://localhost:11434')
              : (config.lmStudioUrl || 'http://localhost:1234');
            try {
              const res = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(5000) });
              alert(res.ok ? '✅ 连接成功！' : `❌ 返回 ${res.status}`);
            } catch (e) {
              alert(`❌ 无法连接: ${e.message}`);
            }
          }}>🔗 测试连接</button>
        </div>
      </div>

      {/* About */}
      <div className="card mt-16">
        <div className="card-title">ℹ️ 关于</div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
          <div><strong>Karpathy LLM Wiki</strong> v0.1.0</div>
          <div style={{ marginTop: 8 }}>
            基于 Andrej Karpathy 提出的 LLM Wiki 概念构建的本地知识库系统。
          </div>
          <div style={{ marginTop: 8 }}>
            三层架构: <strong>Ingest</strong> (摄入) → <strong>Query</strong> (查询) → <strong>Lint</strong> (检查)
          </div>
        </div>
      </div>
    </div>
  );
}
