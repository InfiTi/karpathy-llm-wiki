import React, { useState } from 'react';
import useStore from '../store/useStore';

export default function QueryPage() {
  const { config, addLog } = useStore();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState(null);
  const [searchMode, setSearchMode] = useState('ask'); // 'ask' | 'search'

  const runQuery = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setAnswer(null);
    addLog('info', `执行查询: ${query}`);

    try {
      // Call LLM directly for demo
      const messages = [
        { role: 'system', content: '你是知识库问答助手，基于提供的文档内容回答问题。如果信息不足，请明确说明。' },
        { role: 'user', content: query }
      ];

      const url = config.llmBackend === 'ollama' 
        ? `${config.ollamaUrl || 'http://localhost:11434'}/api/chat`
        : `${config.lmStudioUrl || 'http://localhost:1234'}/v1/chat/completions`;

      const body = config.llmBackend === 'ollama'
        ? { model: config.defaultModel || 'qwen3.5:latest', messages, stream: false }
        : { model: config.defaultModel || 'qwen3.5:latest', messages };

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60000),
      });

      if (!res.ok) throw new Error(`请求失败: ${res.status}`);
      const data = await res.json();
      const text = config.llmBackend === 'ollama' ? data.message.content : data.choices[0].message.content;

      setAnswer({ text, sources: [] });
      addLog('success', '查询完成');
    } catch (e) {
      addLog('error', `查询失败: ${e.message}`);
      setAnswer({ text: `❌ 查询失败: ${e.message}`, sources: [], isError: true });
    }
    setLoading(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) runQuery();
  };

  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 8 }}>🔍 Query - 知识查询</h1>
      <div className="text-muted mb-24">
        在 Wiki 知识库中搜索，或直接向 AI 提问。
      </div>

      {/* Mode Tabs */}
      <div className="tabs">
        <button className={`tab ${searchMode === 'ask' ? 'active' : ''}`} onClick={() => setSearchMode('ask')}>
          💬 AI 问答
        </button>
        <button className={`tab ${searchMode === 'search' ? 'active' : ''}`} onClick={() => setSearchMode('search')}>
          📄 文档搜索
        </button>
      </div>

      {/* Query Input */}
      <div className="card">
        <div style={{ display: 'flex', gap: 8 }}>
          <textarea
            className="textarea"
            placeholder={searchMode === 'ask' 
              ? '输入你的问题... (Ctrl+Enter 发送)'
              : '输入搜索关键词...'
            }
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            style={{ flex: 1, minHeight: 100, resize: 'none' }}
          />
        </div>
        <div className="flex justify-between items-center mt-16">
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Ctrl + Enter 发送
          </div>
          <button 
            className="btn btn-primary" 
            onClick={runQuery}
            disabled={!query.trim() || loading}
            style={{ fontSize: 15 }}
          >
            {loading ? '⏳ 思考中...' : '🔍 查询'}
          </button>
        </div>
      </div>

      {/* Answer */}
      {answer && (
        <div className="card mt-16 fade-in">
          <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {answer.isError ? '❌' : '💡'} 回答
          </div>
          <div style={{ 
            lineHeight: 1.8, 
            color: answer.isError ? 'var(--accent-red)' : 'var(--text-primary)',
            fontSize: 14,
            whiteSpace: 'pre-wrap'
          }}>
            {answer.text}
          </div>
          {answer.sources?.length > 0 && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>参考文档</div>
              {answer.sources.map((s, i) => (
                <div key={i} style={{ fontSize: 13, color: 'var(--accent-blue)', marginBottom: 4 }}>📄 {s}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tips */}
      {!answer && !loading && (
        <div className="card mt-16" style={{ textAlign: 'center', padding: '40px 24px' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>💡</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
            输入问题，AI 将基于知识库内容为你解答
          </div>
        </div>
      )}
    </div>
  );
}
