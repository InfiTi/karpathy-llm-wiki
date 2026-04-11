import React, { useState } from 'react';
import useStore from '../store/useStore';

export default function QueryPage() {
  const { config, addLog } = useStore();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState(null);
  const [searchMode, setSearchMode] = useState('ask'); // 'ask' | 'search'
  const [searchResults, setSearchResults] = useState([]);

  const runQuery = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setAnswer(null);
    setSearchResults([]);
    addLog('info', `执行查询: ${query}`);

    try {
      if (searchMode === 'search') {
        // Wiki document search
        const results = await window.electronAPI.wikiSearchDocuments(query);
        setSearchResults(results);
        addLog('success', `搜索到 ${results.length} 条相关文档`);
      } else {
        // AI Q&A with wiki context
        const result = await window.electronAPI.queryAsk(query);
        setAnswer({
          text: result.answer || '（未返回答案）',
          sources: result.sources?.map(s => s.title).filter(Boolean) || [],
          context: result.context || '',
        });
        addLog('success', '查询完成');
      }
    } catch (err) {
      addLog('error', `查询失败: ${err.message}`);
      setAnswer({ text: `❌ 查询失败: ${err.message}`, sources: [], isError: true });
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
          📄 Wiki 搜索
        </button>
      </div>

      {/* Query Input */}
      <div className="card">
        <textarea
          className="textarea"
          placeholder={
            searchMode === 'ask'
              ? '输入你的问题... (Ctrl+Enter 发送)'
              : '输入搜索关键词...'
          }
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          style={{ width: '100%', minHeight: 100, resize: 'none', marginBottom: 12 }}
        />
        <div className="flex justify-between items-center">
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Ctrl + Enter 发送 | 后端: {config.llmBackend || 'ollama'}
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

      {/* Search Results */}
      {searchResults.length > 0 && (
        <div className="card mt-16">
          <div className="card-title">📄 搜索结果 ({searchResults.length})</div>
          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            {searchResults.map((doc, i) => (
              <div key={i} className="card mt-8" style={{ cursor: 'pointer' }}
                onClick={async () => {
                  try {
                    const full = await window.electronAPI.wikiGetDocument(doc.title);
                    setAnswer({
                      text: full?.body || '（无内容）',
                      sources: [doc.title],
                    });
                    setSearchMode('ask'); // switch to answer view
                  } catch {}
                }}>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>📄 {doc.title}</div>
                {doc.snippet && (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    {doc.snippet.slice(0, 200)}...
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Answer */}
      {answer && (
        <div className="card mt-16 fade-in">
          <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {answer.isError ? '❌' : '💡'} 回答
          </div>
          <div style={{
            lineHeight: 1.8, fontSize: 14, whiteSpace: 'pre-wrap',
            color: answer.isError ? 'var(--accent-red)' : 'var(--text-primary)',
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

      {/* Empty State */}
      {!answer && !loading && searchResults.length === 0 && (
        <div className="card mt-16" style={{ textAlign: 'center', padding: '40px 24px' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>💡</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
            {searchMode === 'ask'
              ? '输入问题，AI 将基于知识库内容为你解答'
              : '在 Wiki 文档中搜索相关条目'}
          </div>
        </div>
      )}
    </div>
  );
}
