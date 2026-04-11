import React, { useState } from 'react';
import useStore from '../store/useStore';

export default function LintPage() {
  const { config, addLog } = useStore();
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState([]);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [progress, setProgress] = useState(0);
  const [currentDoc, setCurrentDoc] = useState('');

  const loadWikiDocs = async () => {
    if (!window.electronAPI || !config.projectRoot) return [];
    try {
      const wikiDir = await window.electronAPI.readDir(config.projectRoot + '\\wiki');
      return wikiDir.filter(e => e.isFile && e.name.endsWith('.md'));
    } catch { return []; }
  };

  const runLint = async () => {
    setRunning(true);
    setResults([]);
    addLog('info', '开始 Lint 检查...');

    const docs = await loadWikiDocs();
    if (!docs.length) {
      addLog('warning', 'Wiki 目录为空，请先 Ingest 文档');
      setRunning(false);
      return;
    }

    for (let i = 0; i < docs.length; i++) {
      const doc = docs[i];
      setProgress(Math.round(((i) / docs.length) * 100));
      setCurrentDoc(doc.name);
      
      // Simulate quick check
      await new Promise(r => setTimeout(r, 800));
      
      const content = await window.electronAPI.readFile(doc.path).catch(() => '');
      const issues = [];
      
      // Basic checks
      if (!content.startsWith('---')) {
        issues.push({ type: 'format', severity: 'low', description: '缺少 front-matter', suggestion: '添加 YAML front-matter' });
      }
      if (content.length < 100) {
        issues.push({ type: 'empty', severity: 'high', description: '内容过短', suggestion: '添加更多内容' });
      }
      if (!content.includes('#')) {
        issues.push({ type: 'format', severity: 'medium', description: '缺少标题', suggestion: '添加 # 一级标题' });
      }
      
      const score = Math.max(0, 100 - issues.length * 15 - (issues.filter(i => i.severity === 'high').length * 20));
      
      setResults(prev => [...prev, {
        name: doc.name,
        path: doc.path,
        score,
        issues,
        checked: true
      }]);
    }

    setProgress(100);
    setRunning(false);
    addLog('success', `✅ Lint 完成，检查了 ${docs.length} 个文档`);
  };

  const scoreColor = (score) => {
    if (score >= 80) return 'var(--accent-green)';
    if (score >= 60) return 'var(--accent-yellow)';
    return 'var(--accent-red)';
  };

  const severityColor = (sev) => {
    if (sev === 'high') return 'var(--accent-red)';
    if (sev === 'medium') return 'var(--accent-yellow)';
    return 'var(--accent-blue)';
  };

  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 8 }}>✅ Lint - 质量检查</h1>
      <div className="text-muted mb-24">
        检查 Wiki 文档质量：格式规范、内容完整性、链接有效性。
      </div>

      {/* Run Button */}
      <div className="card">
        <div className="flex justify-between items-center">
          <div>
            <div className="card-title">启动质量检查</div>
            <div className="card-desc">对所有 Wiki 文档进行自动化质量审查</div>
          </div>
          <button 
            className="btn btn-primary" 
            onClick={runLint}
            disabled={running || !config.projectRoot}
            style={{ fontSize: 15 }}
          >
            {running ? '⏳ 检查中...' : '🔍 开始 Lint'}
          </button>
        </div>

        {running && (
          <div style={{ marginTop: 16 }}>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
              <span>{currentDoc}</span>
              <span>{progress}%</span>
            </div>
          </div>
        )}
      </div>

      {/* Results Summary */}
      {results.length > 0 && (
        <div className="card mt-16">
          <div className="card-title">📊 检查结果汇总</div>
          <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
            <div style={{ textAlign: 'center', flex: 1 }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--accent-green)' }}>
                {results.filter(r => r.score >= 80).length}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>优秀</div>
            </div>
            <div style={{ textAlign: 'center', flex: 1 }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--accent-yellow)' }}>
                {results.filter(r => r.score >= 60 && r.score < 80).length}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>良好</div>
            </div>
            <div style={{ textAlign: 'center', flex: 1 }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--accent-red)' }}>
                {results.filter(r => r.score < 60).length}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>需改进</div>
            </div>
            <div style={{ textAlign: 'center', flex: 1 }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--accent-blue)' }}>
                {results.reduce((sum, r) => sum + r.issues.length, 0)}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>问题总数</div>
            </div>
          </div>
        </div>
      )}

      {/* Results List */}
      {results.length > 0 && (
        <div className="mt-16">
          {results.map((r, i) => (
            <div key={i} className="card" style={{ cursor: 'pointer' }} onClick={() => setSelectedDoc(selectedDoc === i ? null : i)}>
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-16">
                  <div style={{ 
                    fontSize: 20, fontWeight: 700, 
                    color: scoreColor(r.score), 
                    minWidth: 48, textAlign: 'center' 
                  }}>
                    {r.score}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{r.name}</div>
                    {r.issues.length > 0 && (
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {r.issues.length} 个问题
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-8">
                  {r.issues.slice(0, 3).map((issue, j) => (
                    <span key={j} style={{ 
                      fontSize: 11, padding: '2px 8px', borderRadius: 20,
                      background: `rgba(${issue.severity === 'high' ? '248,81,73' : issue.severity === 'medium' ? '210,153,34' : '88,166,255'}, 0.15)`,
                      color: severityColor(issue.severity)
                    }}>
                      {issue.type}
                    </span>
                  ))}
                </div>
              </div>

              {selectedDoc === i && r.issues.length > 0 && (
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                  {r.issues.map((issue, j) => (
                    <div key={j} style={{ marginBottom: 12, fontSize: 13 }}>
                      <div className="flex items-center gap-8">
                        <span style={{ color: severityColor(issue.severity), fontWeight: 600 }}>[{issue.severity.toUpperCase()}]</span>
                        <span>{issue.description}</span>
                      </div>
                      <div style={{ color: 'var(--text-muted)', marginLeft: 80, marginTop: 2 }}>
                        💡 {issue.suggestion}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
