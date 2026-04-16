import React, { useState } from 'react';
import useStore from '../store/useStore';

export default function SetupPage() {
  const { config, setConfig, addLog } = useStore();
  const [step, setStep] = useState(1);
  const [creating, setCreating] = useState(false);

  const selectProjectRoot = async () => {
    if (!window.electronAPI) return;
    const dir = await window.electronAPI.selectDirectory();
    if (dir) {
      await setConfig('projectRoot', dir);
      addLog('info', `项目目录设置为: ${dir}`);
    }
  };

  const createProject = async () => {
    if (!config.projectRoot) return;
    setCreating(true);
    try {
      const dirs = ['raw', 'wiki', 'wiki/.index', 'logs'];
      for (const d of dirs) {
        await window.electronAPI.ensureDir(config.projectRoot + '\\' + d);
      }
      // Create README
      const readme = [
        '# ' + config.projectRoot.split('\\').pop() + ' - LLM Wiki',
        '',
        '项目初始化完成。',
        '',
        '## 目录结构',
        '',
        '- `raw/` - 存放原始文档',
        '- `wiki/` - 生成的维基文档',
        '- `logs/` - 运行日志',
        '',
        '## 三层架构',
        '',
        '1. **Ingest** - 摄入原始文档',
        '2. **Query** - 查询知识库',
        '3. **Lint** - 质量检查',
      ].join('\n');
      await window.electronAPI.writeFile(config.projectRoot + '\\README.md', readme);
      addLog('success', '✅ 项目初始化完成！');
      setStep(3);
    } catch (e) {
      addLog('error', `初始化失败: ${e.message}`);
    }
    setCreating(false);
  };

  const testLLM = async () => {
    addLog('info', '正在测试 LLM 连接...');
    try {
      const url = config.llmBackend === 'ollama' ? config.ollamaUrl : config.lmStudioUrl;
      const res = await fetch(`${url}/api/tags`);
      if (res.ok) {
        const data = await res.json();
        const models = data.models || [];
        addLog('success', `✅ LLM 连接成功！可用模型: ${models.map(m => m.name).join(', ') || '无'}`);
      } else {
        addLog('error', `❌ LLM 返回错误: ${res.status}`);
      }
    } catch (e) {
      addLog('error', `❌ 无法连接 LLM: ${e.message}`);
    }
  };

  return (
    <div style={{ maxWidth: 800 }}>
      <h1 style={{ fontSize: 24, marginBottom: 24 }}>⚙️ 项目初始化</h1>

      {/* Progress Steps */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 32 }}>
        {[1, 2, 3].map(s => (
          <div key={s} style={{
            flex: 1, height: 4, borderRadius: 2,
            background: s <= step ? 'var(--accent-blue)' : 'var(--bg-tertiary)'
          }} />
        ))}
      </div>

      {/* Step 1: Select Project Root */}
      <div className="card">
        <div className="card-title">① 设置项目目录</div>
        <div className="card-desc" style={{ marginBottom: 16 }}>
          选择一个空目录（或已存在的文件夹），作为 LLM Wiki 的根目录。
          将在此目录下创建 <code>raw_sources/</code> 和 <code>wiki/</code> 目录结构。
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div className="input" style={{ flex: 1 }}>{config.projectRoot || '未选择目录'}</div>
          <button className="btn btn-primary" onClick={selectProjectRoot}>浏览...</button>
        </div>
        {config.projectRoot && step < 1 && setStep(1)}
      </div>

      {/* Step 2: LLM Config */}
      <div className="card mt-16">
        <div className="card-title">② 配置 AI 后端</div>
        <div className="card-desc" style={{ marginBottom: 16 }}>
          选择本地 AI 后端服务（Ollama 或 LM Studio），确保服务已启动。
        </div>

        <div className="form-group">
          <label className="form-label">后端类型</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {['ollama', 'lmstudio'].map(b => (
              <button
                key={b}
                className={`btn ${config.llmBackend === b ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setConfig('llmBackend', b)}
              >
                {b === 'ollama' ? '🦙 Ollama' : '💡 LM Studio'}
              </button>
            ))}
          </div>
        </div>

        <div className="grid-2">
          <div className="form-group">
            <label className="form-label">服务地址</label>
            <input
              className="input"
              value={config.llmBackend === 'ollama' ? (config.ollamaUrl || 'http://localhost:11434') : (config.lmStudioUrl || 'http://localhost:1234')}
              onChange={e => setConfig(config.llmBackend === 'ollama' ? 'ollamaUrl' : 'lmStudioUrl', e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">默认模型</label>
            <input
              className="input"
              placeholder="如: qwen3.5:latest"
              value={config.defaultModel || ''}
              onChange={e => setConfig('defaultModel', e.target.value)}
            />
          </div>
        </div>

        <button className="btn btn-secondary" onClick={testLLM}>🔗 测试连接</button>
      </div>

      {/* Step 3: Create */}
      <div className="card mt-16">
        <div className="card-title">③ 创建项目结构</div>
        {step < 3 ? (
          <div>
            <div className="card-desc" style={{ marginBottom: 16 }}>
              确认配置后，点击「创建项目」初始化目录结构。
            </div>
            <div style={{
              background: 'var(--bg-primary)',
              borderRadius: 8,
              padding: '12px 16px',
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              color: 'var(--text-secondary)',
              marginBottom: 16
            }}>
              {config.projectRoot || '...'}/<br />
              &nbsp;&nbsp;├── raw_sources/<br />
              &nbsp;&nbsp;├── wiki/<br />
              &nbsp;&nbsp;│&nbsp;&nbsp;└── .index/<br />
              &nbsp;&nbsp;└── logs/
            </div>
            <button
              className="btn btn-success"
              onClick={createProject}
              disabled={!config.projectRoot || creating}
            >
              {creating ? '⏳ 创建中...' : '🚀 创建项目'}
            </button>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--accent-green)', marginBottom: 8 }}>
              项目创建成功！
            </div>
            <div className="card-desc">
              项目目录已就绪，现在可以开始使用了。
            </div>
            <div style={{ marginTop: 16 }}>
              <a href="/ingest" className="btn btn-primary">📥 开始 Ingest</a>
            </div>
          </div>
        )}
      </div>

      {/* Logs */}
      <div className="card mt-16">
        <div className="card-title">📋 操作日志</div>
        <OperationLog />
      </div>
    </div>
  );
}

function OperationLog() {
  const { logs } = useStore();
  return (
    <div className="console-output" style={{ maxHeight: 200 }}>
      {logs.length === 0 ? (
        <div className="console-line">等待操作...</div>
      ) : (
        logs.map((log, i) => (
          <div key={i} className={`console-line ${log.level}`}>
            <span style={{ color: 'var(--text-muted)' }}>[{log.timestamp}]</span> {log.message}
          </div>
        ))
      )}
    </div>
  );
}
