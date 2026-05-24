import React, { useState, useEffect } from 'react';
import useStore from '../store/useStore';

export default function ConfigPage() {
  const { config, setConfig } = useStore();
  const [saved, setSaved] = useState(false);

  const [testInput, setTestInput] = useState('香港银行高息存款指南：虚拟银行（如Livi、Ant、PAOBank）和部分中小银行（如南洋、华侨）提供较高存款利率。大行如汇丰、渣打利率较低。香港存款保险保障每个储户80万港币。新资金奖励活动可在7天内享受更高利率。\n\n原文：杨笑 (Katie)\n标签：香港银行、美元存款、港币存款、虚拟银行、中小银行');
  const [testOutput, setTestOutput] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [ingestPrompt, setIngestPrompt] = useState('');
  const [editedPrompt, setEditedPrompt] = useState('');

  useEffect(() => {
    loadIngestPrompt();
  }, []);

  const loadIngestPrompt = async () => {
    if (!window.electronAPI) return;
    try {
      const prompt = await window.electronAPI.getIngestPrompt();
      setIngestPrompt(prompt);
      setEditedPrompt(prompt);
    } catch (e) {
      console.error('Failed to load ingest prompt:', e);
    }
  };

  const testIngestPrompt = async () => {
    const promptToUse = editedPrompt || ingestPrompt;
    if (!window.electronAPI) {
      setTestOutput('错误：electronAPI 不可用');
      return;
    }
    setIsTesting(true);
    setTestOutput('正在测试...');

    try {
      const result = await window.electronAPI.llmTestPrompt(promptToUse, testInput);
      setTestOutput(result);
    } catch (err) {
      setTestOutput(`错误: ${err.message}`);
    }
    setIsTesting(false);
  };

  const resetPrompt = () => {
    setEditedPrompt(ingestPrompt);
  };

  const copyPrompt = () => {
    navigator.clipboard.writeText(editedPrompt);
    alert('Prompt 已复制到剪贴板');
  };

  const saveAll = async () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const llmFields = [
    { key: 'url', label: 'Service URL', type: 'text', default: 'http://localhost:11434' },
    { key: 'model', label: 'Default Model', type: 'text', placeholder: 'e.g. qwen3.5:latest' },
  ];

  return (
    <div style={{ maxWidth: 700 }}>
      <h1 style={{ fontSize: 24, marginBottom: 24 }}>🔧 配置</h1>

      {/* Project Config */}
      <div className="card">
        <div className="card-title">📂 项目配置</div>
        <div className="form-group">
          <label className="form-label">项目根目录</label>
          <div className="flex gap-8">
            <input
              className="input"
              type="text"
              value={config.projectRoot || ''}
              placeholder="选择项目目录"
              onChange={e => setConfig('projectRoot', e.target.value)}
              style={{ flex: 1 }}
            />
            <button className="btn btn-secondary" onClick={async () => {
              if (!window.electronAPI) return;
              const dir = await window.electronAPI.selectDirectory();
              if (dir) setConfig('projectRoot', dir);
            }}>浏览</button>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Wiki 目录</label>
          <input
            className="input"
            type="text"
            value={config.wiki?.directory || ''}
            placeholder="wiki"
            onChange={e => setConfig('wiki', { ...config.wiki, directory: e.target.value })}
          />
        </div>

        <div className="form-group">
          <label className="form-label">原始文档目录</label>
          <input
            className="input"
            type="text"
            value={config.wiki?.rawDirectory || ''}
            placeholder="raw_sources"
            onChange={e => setConfig('wiki', { ...config.wiki, rawDirectory: e.target.value })}
          />
        </div>
      </div>

      {/* LLM Config */}
      <div className="card mt-16">
        <div className="card-title">🤖 AI 后端配置</div>

        <div className="form-group">
          <label className="form-label">Backend Type</label>
          <div className="flex gap-8">
            {[
              { key: 'ollama', label: 'Ollama', desc: 'Open source local model' },
              { key: 'lmstudio', label: 'LM Studio', desc: 'Desktop model management' },
            ].map(b => (
              <div
                key={b.key}
                onClick={() => setConfig('llm', { ...config.llm, backend: b.key })}
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  borderRadius: 8,
                  border: `1px solid ${config.llm?.backend === b.key ? 'var(--accent-blue)' : 'var(--border)'}`,
                  background: config.llm?.backend === b.key ? 'rgba(88,166,255,0.08)' : 'var(--bg-primary)',
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
              value={config.llm?.[f.key] || ''}
              placeholder={f.placeholder || f.default}
              onChange={e => setConfig('llm', { ...config.llm, [f.key]: e.target.value })}
            />
          </div>
        ))}

        <div className="mt-16">
          <button className="btn btn-primary" onClick={async () => {
            try {
              const result = await window.electronAPI.llmPing();
              alert(result ? 'Connected!' : 'Cannot connect');
            } catch (e) {
              alert(`Cannot connect: ${e.message}`);
            }
          }}>Test Connection</button>
        </div>
      </div>

      {/* Prompt 调试面板 */}
      <div className="card mt-16">
        <div className="card-title">🧪 Prompt 调试面板</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* 左侧：Prompt 编辑 */}
          <div>
            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <label className="form-label">Ingest Prompt（可编辑）</label>
                <div className="flex gap-8">
                  <button className="btn btn-secondary" style={{ fontSize: 11, padding: '2px 8px' }} onClick={resetPrompt}>重置</button>
                  <button className="btn btn-secondary" style={{ fontSize: 11, padding: '2px 8px' }} onClick={copyPrompt}>复制</button>
                </div>
              </div>
              <textarea
                className="input"
                value={editedPrompt}
                onChange={e => setEditedPrompt(e.target.value)}
                rows={18}
                style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: 11 }}
              />
            </div>
          </div>

          {/* 右侧：测试输入和输出 */}
          <div>
            <div className="form-group">
              <label className="form-label">测试输入文本</label>
              <textarea
                className="input"
                value={testInput}
                onChange={e => setTestInput(e.target.value)}
                rows={6}
                style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: 11 }}
              />
            </div>

            <button
              className="btn btn-primary"
              onClick={testIngestPrompt}
              disabled={isTesting}
              style={{ width: '100%' }}
            >
              {isTesting ? '⏳ 测试中...' : '🚀 测试 Prompt'}
            </button>

            {testOutput && (
              <div className="mt-16">
                <label className="form-label">LLM 输出结果</label>
                <pre style={{
                  background: 'var(--bg-secondary)',
                  padding: 12,
                  borderRadius: 8,
                  fontSize: 11,
                  fontFamily: 'var(--font-mono)',
                  whiteSpace: 'pre-wrap',
                  maxHeight: 300,
                  overflow: 'auto',
                  border: testOutput.includes('错误') ? '1px solid var(--accent-red)' : '1px solid var(--border)'
                }}>
                  {testOutput}
                </pre>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="mt-24 flex justify-end">
        <button className="btn btn-primary" onClick={saveAll}>
          {saved ? '✓ Saved' : 'Save All'}
        </button>
      </div>
    </div>
  );
}
