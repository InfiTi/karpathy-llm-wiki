import React, { useState } from 'react';
import useStore from '../store/useStore';

export default function LintPage() {
  const { config, addLog } = useStore();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);

  const runLint = async () => {
    if (!config.projectRoot || !window.electronAPI) return;

    setRunning(true);
    setResult(null);
    addLog('info', '开始执行 Lint 检查...');

    try {
      const lintResult = await window.electronAPI.lintRunLint();
      setResult(lintResult);
      addLog('success', `Lint 完成：评分 ${lintResult.score}/100，发现 ${lintResult.issues.length} 类问题`);
    } catch (err) {
      addLog('error', `Lint 失败：${err.message}`);
    } finally {
      setRunning(false);
    }
  };

  const severityColor = (severity) => {
    if (severity === 'high') return 'var(--accent-red)';
    if (severity === 'medium') return 'var(--accent-yellow)';
    return 'var(--accent-blue)';
  };

  const groupedIssues = result?.issues?.reduce((acc, issue) => {
    if (!acc[issue.severity]) acc[issue.severity] = [];
    acc[issue.severity].push(issue);
    return acc;
  }, {}) || {};

  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 8 }}>🔍 Lint - 知识库检查</h1>
      <div className="text-muted mb-24">
        用规则检查当前 Wiki 的结构质量，重点识别重复条目、相似标题、孤立 Note 和失效链接。
      </div>

      <div className="card">
        <div className="flex justify-between items-center">
          <div>
            <div className="card-title">运行检查</div>
            <div className="card-desc">
              当前阶段先做确定性规则检查，不依赖大模型，适合清理重复 ingest 和知识孤岛。
            </div>
          </div>
          <button
            className="btn btn-primary"
            onClick={runLint}
            disabled={running || !config.projectRoot}
            style={{ fontSize: 15 }}
          >
            {running ? '检查中...' : '开始检查'}
          </button>
        </div>
      </div>

      {result && (
        <>
          <div className="card mt-16">
            <div className="card-title">检查摘要</div>
            <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
              <div style={{ textAlign: 'center', flex: 1 }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: result.score >= 80 ? 'var(--accent-green)' : result.score >= 60 ? 'var(--accent-yellow)' : 'var(--accent-red)' }}>
                  {result.score}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>综合评分</div>
              </div>
              <div style={{ textAlign: 'center', flex: 1 }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--accent-red)' }}>
                  {groupedIssues.high?.length || 0}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>高优先级</div>
              </div>
              <div style={{ textAlign: 'center', flex: 1 }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--accent-yellow)' }}>
                  {groupedIssues.medium?.length || 0}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>中优先级</div>
              </div>
              <div style={{ textAlign: 'center', flex: 1 }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--accent-blue)' }}>
                  {groupedIssues.low?.length || 0}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>低优先级</div>
              </div>
            </div>

            <div style={{ marginTop: 16, fontSize: 13, color: 'var(--text-secondary)' }}>
              {result.summary}
            </div>
          </div>

          <div className="mt-16">
            {['high', 'medium', 'low'].map((severity) => {
              const issues = groupedIssues[severity] || [];
              if (!issues.length) return null;

              return (
                <div key={severity} className="card mt-16">
                  <div className="card-title" style={{ color: severityColor(severity) }}>
                    {severity === 'high' ? '高优先级问题' : severity === 'medium' ? '中优先级问题' : '低优先级问题'}
                  </div>

                  <div style={{ marginTop: 12 }}>
                    {issues.map((issue, index) => (
                      <div
                        key={`${severity}-${index}`}
                        style={{
                          padding: '12px 0',
                          borderBottom: index === issues.length - 1 ? 'none' : '1px solid var(--border)',
                          fontSize: 13,
                        }}
                      >
                        <div style={{ fontWeight: 600, marginBottom: 6 }}>
                          [{issue.type}] {issue.description}
                        </div>
                        <div style={{ color: 'var(--text-muted)' }}>
                          建议：{issue.suggestion}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
