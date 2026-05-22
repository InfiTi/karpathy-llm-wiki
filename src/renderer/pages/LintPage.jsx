import React, { useMemo, useState } from 'react';
import useStore from '../store/useStore';

const SEVERITIES = ['all', 'high', 'medium', 'low'];

export default function LintPage() {
  const { config, addLog } = useStore();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [expandedKeys, setExpandedKeys] = useState({});
  const [severityFilter, setSeverityFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  const runLint = async () => {
    if (!config.projectRoot || !window.electronAPI) return;

    setRunning(true);
    setResult(null);
    setExpandedKeys({});
    setSeverityFilter('all');
    setTypeFilter('all');
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

  const allIssues = result?.issues || [];

  const typeOptions = useMemo(() => {
    const set = new Set(allIssues.map(issue => issue.type));
    return ['all', ...Array.from(set)];
  }, [allIssues]);

  const typeCounts = useMemo(() => {
    return allIssues.reduce((acc, issue) => {
      acc[issue.type] = (acc[issue.type] || 0) + 1;
      return acc;
    }, {});
  }, [allIssues]);

  const filteredIssues = useMemo(() => {
    return allIssues
      .filter(issue => severityFilter === 'all' || issue.severity === severityFilter)
      .filter(issue => typeFilter === 'all' || issue.type === typeFilter)
      .sort((a, b) => {
        const severityRank = { high: 3, medium: 2, low: 1 };
        const severityDiff = severityRank[b.severity] - severityRank[a.severity];
        if (severityDiff !== 0) return severityDiff;

        const detailDiff = (b.details?.length || 0) - (a.details?.length || 0);
        if (detailDiff !== 0) return detailDiff;

        return a.type.localeCompare(b.type, 'zh-CN');
      });
  }, [allIssues, severityFilter, typeFilter]);

  const groupedIssues = filteredIssues.reduce((acc, issue) => {
    if (!acc[issue.severity]) acc[issue.severity] = [];
    acc[issue.severity].push(issue);
    return acc;
  }, {});

  const summaryCounts = useMemo(() => {
    return {
      high: allIssues.filter(issue => issue.severity === 'high').length,
      medium: allIssues.filter(issue => issue.severity === 'medium').length,
      low: allIssues.filter(issue => issue.severity === 'low').length,
    };
  }, [allIssues]);

  const toggleExpanded = (key) => {
    setExpandedKeys(prev => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const renderFilterButton = (key, label) => {
    const active = severityFilter === key;
    return (
      <button
        key={key}
        className="btn btn-secondary"
        style={{
          padding: '4px 10px',
          fontSize: 12,
          background: active ? 'var(--accent-blue)' : undefined,
          color: active ? '#fff' : undefined,
        }}
        onClick={() => setSeverityFilter(key)}
      >
        {label}
      </button>
    );
  };

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
              <SummaryCard
                label="综合评分"
                value={result.score}
                color={result.score >= 80 ? 'var(--accent-green)' : result.score >= 60 ? 'var(--accent-yellow)' : 'var(--accent-red)'}
                active={severityFilter === 'all'}
                onClick={() => setSeverityFilter('all')}
              />
              <SummaryCard
                label="高优先级"
                value={summaryCounts.high}
                color="var(--accent-red)"
                active={severityFilter === 'high'}
                onClick={() => setSeverityFilter('high')}
              />
              <SummaryCard
                label="中优先级"
                value={summaryCounts.medium}
                color="var(--accent-yellow)"
                active={severityFilter === 'medium'}
                onClick={() => setSeverityFilter('medium')}
              />
              <SummaryCard
                label="低优先级"
                value={summaryCounts.low}
                color="var(--accent-blue)"
                active={severityFilter === 'low'}
                onClick={() => setSeverityFilter('low')}
              />
            </div>

            <div style={{ marginTop: 16, fontSize: 13, color: 'var(--text-secondary)' }}>
              {result.summary}
            </div>
          </div>

          <div className="card mt-16">
            <div className="card-title">问题类型统计</div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
              <TypeChip
                label="全部类型"
                count={allIssues.length}
                active={typeFilter === 'all'}
                onClick={() => setTypeFilter('all')}
              />
              {typeOptions.filter(type => type !== 'all').map(type => (
                <TypeChip
                  key={type}
                  label={type}
                  count={typeCounts[type] || 0}
                  active={typeFilter === type}
                  onClick={() => setTypeFilter(type)}
                />
              ))}
            </div>
          </div>

          <div className="card mt-16">
            <div className="card-title">筛选与排序</div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 12 }}>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>按严重级别</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {renderFilterButton('all', '全部')}
                  {renderFilterButton('high', '高优先级')}
                  {renderFilterButton('medium', '中优先级')}
                  {renderFilterButton('low', '低优先级')}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>按问题类型</div>
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    background: 'var(--bg-elevated)',
                    color: 'var(--text-primary)',
                    fontSize: 12,
                  }}
                >
                  {typeOptions.map(option => (
                    <option key={option} value={option}>
                      {option === 'all' ? '全部类型' : option}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="mt-16">
            {SEVERITIES.filter(severity => severity !== 'all').map((severity) => {
              const issues = groupedIssues[severity] || [];
              if (!issues.length) return null;

              return (
                <div key={severity} className="card mt-16">
                  <div className="card-title" style={{ color: severityColor(severity) }}>
                    {severity === 'high' ? '高优先级问题' : severity === 'medium' ? '中优先级问题' : '低优先级问题'}
                  </div>

                  <div style={{ marginTop: 12 }}>
                    {issues.map((issue, index) => {
                      const expandKey = `${severity}-${issue.type}-${index}`;
                      const expanded = !!expandedKeys[expandKey];
                      const hasDetails = Array.isArray(issue.details) && issue.details.length > 0;

                      return (
                        <div
                          key={expandKey}
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

                          {hasDetails && (
                            <div style={{ marginTop: 8 }}>
                              <button
                                className="btn btn-secondary"
                                style={{ padding: '4px 10px', fontSize: 12 }}
                                onClick={() => toggleExpanded(expandKey)}
                              >
                                {expanded ? '收起详情' : `查看详情（${issue.details.length}）`}
                              </button>
                            </div>
                          )}

                          {hasDetails && expanded && (
                            <div style={{
                              marginTop: 10,
                              padding: '10px 12px',
                              background: 'rgba(255,255,255,0.03)',
                              borderRadius: 8,
                              fontSize: 12,
                              color: 'var(--text-secondary)',
                            }}>
                              {issue.details.map((detail, detailIndex) => (
                                <div
                                  key={`${expandKey}-detail-${detailIndex}`}
                                  style={{ marginBottom: detailIndex === issue.details.length - 1 ? 0 : 6 }}
                                >
                                  - {detail}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
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

function SummaryCard({ label, value, color, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        textAlign: 'center',
        flex: 1,
        background: active ? 'rgba(88,166,255,0.12)' : 'transparent',
        border: active ? '1px solid var(--accent-blue)' : '1px solid transparent',
        borderRadius: 10,
        padding: '8px 10px',
        cursor: 'pointer',
      }}
    >
      <div style={{ fontSize: 28, fontWeight: 700, color }}>
        {value}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
        {label}
      </div>
    </button>
  );
}

function TypeChip({ label, count, active, onClick }) {
  return (
    <button
      className="btn btn-secondary"
      onClick={onClick}
      style={{
        padding: '6px 10px',
        fontSize: 12,
        background: active ? 'var(--accent-blue)' : undefined,
        color: active ? '#fff' : undefined,
      }}
    >
      {label} ({count})
    </button>
  );
}
