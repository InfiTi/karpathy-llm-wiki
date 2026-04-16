import React, { useState } from 'react';
import useStore from '../store/useStore';

export default function QueryPage() {
  const { config, addLog, queryHistory, addQueryHistory, clearQueryHistory } = useStore();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState(null);
  const [searchMode, setSearchMode] = useState('ask'); // 'ask' | 'search'
  const [searchResults, setSearchResults] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [showRecommendations, setShowRecommendations] = useState(false);
  const [relatedQuestions, setRelatedQuestions] = useState([]);
  const [showHistory, setShowHistory] = useState(false);

  const runQuery = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setAnswer(null);
    setSearchResults([]);
    setShowHistory(false);
    addLog('info', `执行查询: ${query}`);

    try {
      if (searchMode === 'search') {
        const results = await window.electronAPI.wikiSearchDocuments(query);
        setSearchResults(results);
        addLog('success', `搜索到 ${results.length} 条相关文档`);
      } else {
        addQueryHistory(query);
        const result = await window.electronAPI.queryAsk(query);
        setAnswer({
          text: result.answer || '（未返回答案）',
          sources: result.sources?.map(s => s.title).filter(Boolean) || [],
          context: result.context || '',
          quality_score: result.quality_score || 0,
          suggest_save: result.suggest_save || false,
          derived_from: result.derived_from || [],
          original_question: query,
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

  const saveToWiki = async () => {
    if (!answer) return;

    try {
      setLoading(true);
      addLog('info', '保存到 Wiki...');

      const result = await window.electronAPI.querySaveToWiki(answer.original_question, {
        answer: answer.text,
        title: answer.original_question,
        tags: ['query-generated'],
        derived_from: answer.derived_from,
      });

      addLog('success', `已保存到 Wiki: ${result.saved_to_wiki}`);
      alert('✅ 已成功保存到 Wiki!');
    } catch (err) {
      addLog('error', `保存失败: ${err.message}`);
      alert(`❌ 保存失败: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const getTopicRecommendations = async () => {
    try {
      setLoading(true);
      addLog('info', '获取话题推荐...');

      const recs = await window.electronAPI.queryGetTopicRecommendations(query, '');
      setRecommendations(recs);
      setShowRecommendations(true);
      addLog('success', `获取到 ${recs.length} 个话题推荐`);
    } catch (err) {
      addLog('error', `获取推荐失败: ${err.message}`);
    } finally {
      setLoading(false);
    }
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
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn btn-secondary"
              onClick={() => setShowHistory(!showHistory)}
              style={{ fontSize: 12, padding: '4px 12px' }}
            >
              📜 历史 {queryHistory.length > 0 && `(${queryHistory.length})`}
            </button>
            <button
              className="btn btn-secondary"
              onClick={getTopicRecommendations}
              disabled={loading}
              style={{ fontSize: 12, padding: '4px 12px' }}
            >
              {loading ? '⏳ 分析中...' : '💡 话题推荐'}
            </button>
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
      </div>

      {/* Search History */}
      {showHistory && queryHistory.length > 0 && (
        <div className="card mt-16 fade-in">
          <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>📜 查询历史</div>
            <button
              className="btn btn-secondary"
              onClick={clearQueryHistory}
              style={{ fontSize: 11, padding: '2px 8px' }}
            >
              清空
            </button>
          </div>
          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            {queryHistory.map((q, i) => (
              <div
                key={i}
                style={{
                  padding: '8px 12px',
                  cursor: 'pointer',
                  borderBottom: '1px solid var(--border)',
                  fontSize: 13,
                }}
                onClick={() => {
                  setQuery(q);
                  setShowHistory(false);
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--background-secondary)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                {q}
              </div>
            ))}
          </div>
        </div>
      )}

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
                  } catch { }
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

      {/* Topic Recommendations */}
      {showRecommendations && (
        <div className="card mt-16 fade-in">
          <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            💡 话题推荐 ({recommendations.length})
          </div>
          {recommendations.length > 0 ? (
            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
              {recommendations.map((rec, i) => (
                <div key={i} className="card mt-8" style={{ cursor: 'pointer' }}
                  onClick={() => {
                    if (rec.type === 'related_question') {
                      setQuery(rec.question);
                    } else if (rec.topic) {
                      setQuery(`关于 ${rec.topic} 的详细信息`);
                    } else {
                      setQuery(`关于 ${rec.title} 的详细信息`);
                    }
                    setShowRecommendations(false);
                  }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>
                      {rec.type === 'missing_link' && '🔗 '}
                      {rec.type === 'orphaned' && '🏝️ '}
                      {rec.type === 'outdated' && '⏰ '}
                      {rec.type === 'related_question' && '❓ '}
                      {rec.type === 'exploration' && '🚀 '}
                      {rec.question || rec.topic || rec.title}
                    </div>
                    <span style={{
                      fontSize: 11,
                      padding: '2px 8px',
                      borderRadius: 10,
                      backgroundColor:
                        rec.priority === 'high' ? 'var(--accent-red)' :
                          rec.priority === 'medium' ? 'var(--accent-yellow)' :
                            'var(--accent-blue)',
                      color: 'white'
                    }}>
                      {rec.priority === 'high' ? '高' :
                        rec.priority === 'medium' ? '中' :
                          '低'}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                    {rec.reason}
                    {rec.source && `（来源：${rec.source}）`}
                    {rec.document && `（文档：${rec.document}）`}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)' }}>
              暂无推荐话题
            </div>
          )}
        </div>
      )}

      {/* Answer */}
      {answer && (
        <div className="card mt-16 fade-in">
          <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {answer.isError ? '❌' : '💡'} 回答
              {!answer.isError && answer.quality_score > 0 && (
                <span style={{ fontSize: 12, color: 'var(--text-muted)', padding: '2px 8px', borderRadius: 12, backgroundColor: 'var(--background-secondary)' }}>
                  质量: {answer.quality_score}/10
                </span>
              )}
            </div>
            {!answer.isError && (
              <button
                className="btn btn-secondary"
                onClick={saveToWiki}
                disabled={loading}
                style={{ fontSize: 12, padding: '4px 12px' }}
              >
                {loading ? '⏳ 保存中...' : '💾 保存到 Wiki'}
              </button>
            )}
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
          {answer.derived_from?.length > 0 && (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>来源条目</div>
              {answer.derived_from.map((s, i) => (
                <div key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 2 }}>📄 {s}</div>
              ))}
            </div>
          )}

          {relatedQuestions.length > 0 && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>相关问题</div>
              {relatedQuestions.map((q, i) => (
                <div key={i} style={{
                  fontSize: 13,
                  color: 'var(--accent-blue)',
                  marginBottom: 4,
                  cursor: 'pointer',
                  padding: '4px 8px',
                  borderRadius: 4,
                  backgroundColor: 'var(--background-secondary)'
                }}
                  onClick={() => {
                    setQuery(q.question);
                    setAnswer(null);
                    setRelatedQuestions([]);
                  }}>
                  ❓ {q.question}
                </div>
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
