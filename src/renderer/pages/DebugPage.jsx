import React, { useState, useEffect } from 'react';
import useStore from '../store/useStore';

export default function DebugPage() {
  const { addLog } = useStore();
  const [logs, setLogs] = useState([]);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const loadLogs = async () => {
    try {
      if (!window.electronAPI) return;
      const logs = await window.electronAPI.debugGetLogs();
      setLogs(logs);
    } catch (err) {
      addLog('error', `获取日志失败: ${err.message}`);
    }
  };

  const clearLogs = async () => {
    try {
      if (!window.electronAPI) return;
      await window.electronAPI.debugClearLogs();
      setLogs([]);
      addLog('info', '日志已清空');
    } catch (err) {
      addLog('error', `清空日志失败: ${err.message}`);
    }
  };

  useEffect(() => {
    loadLogs();
    const interval = autoRefresh ? setInterval(loadLogs, 2000) : null;
    return () => interval && clearInterval(interval);
  }, [autoRefresh]);

  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 8 }}>🐛 调试</h1>
      <div className="text-muted mb-24">
        查看后台日志输出，用于调试问题。
      </div>

      <div className="card">
        <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>📋 后台日志</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
              />
              自动刷新
            </label>
            <button
              className="btn btn-secondary"
              onClick={loadLogs}
              style={{ fontSize: 12, padding: '4px 12px' }}
            >
              刷新
            </button>
            <button
              className="btn btn-danger"
              onClick={clearLogs}
              style={{ fontSize: 12, padding: '4px 12px' }}
            >
              清空
            </button>
          </div>
        </div>
        <div style={{ 
          maxHeight: 600, 
          overflowY: 'auto', 
          padding: 16, 
          fontSize: 12, 
          fontFamily: 'var(--font-mono)',
          lineHeight: 1.4,
          backgroundColor: 'var(--background-secondary)'
        }}>
          {logs.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 0' }}>
              暂无日志
            </div>
          ) : (
            logs.map((log, index) => (
              <div key={index} style={{ 
                marginBottom: 8,
                padding: 8,
                borderRadius: 4,
                backgroundColor: 
                  log.level === 'error' ? 'rgba(255, 88, 88, 0.1)' :
                  log.level === 'warning' ? 'rgba(255, 180, 0, 0.1)' :
                  log.level === 'info' ? 'rgba(88, 166, 255, 0.1)' :
                  'var(--background-primary)'
              }}>
                <div style={{ 
                  fontWeight: 600, 
                  color: 
                    log.level === 'error' ? 'var(--accent-red)' :
                    log.level === 'warning' ? 'var(--accent-yellow)' :
                    log.level === 'info' ? 'var(--accent-blue)' :
                    'var(--text-primary)'
                }}>
                  [{log.timestamp}] [{log.level.toUpperCase()}]
                </div>
                <div style={{ marginTop: 4, color: 'var(--text-secondary)' }}>
                  {log.message}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="card mt-16">
        <div className="card-title">🔧 调试工具</div>
        <div style={{ padding: 16 }}>
          <div style={{ marginBottom: 16 }}>
            <h4 style={{ marginBottom: 8, fontSize: 14 }}>系统信息</h4>
            <div style={{ fontSize: 13, lineHeight: 1.6 }}>
              <div>平台: {window.electronAPI?.platform || '未知'}</div>
              <div>Electron 版本: {process.versions.electron || '未知'}</div>
              <div>Chrome 版本: {process.versions.chrome || '未知'}</div>
              <div>Node.js 版本: {process.versions.node || '未知'}</div>
            </div>
          </div>
          <div>
            <h4 style={{ marginBottom: 8, fontSize: 14 }}>快速测试</h4>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                className="btn btn-secondary"
                onClick={async () => {
                  try {
                    addLog('info', '测试 IPC 连接...');
                    const config = await window.electronAPI.getAllConfig();
                    addLog('success', 'IPC 连接正常');
                  } catch (err) {
                    addLog('error', `IPC 连接失败: ${err.message}`);
                  }
                }}
                style={{ fontSize: 12, padding: '6px 12px' }}
              >
                测试 IPC 连接
              </button>
              <button
                className="btn btn-secondary"
                onClick={async () => {
                  try {
                    addLog('info', '测试文件系统...');
                    const cwd = await window.electronAPI.readDir('.');
                    addLog('success', `文件系统正常，当前目录有 ${cwd.length} 个文件/目录`);
                  } catch (err) {
                    addLog('error', `文件系统测试失败: ${err.message}`);
                  }
                }}
                style={{ fontSize: 12, padding: '6px 12px' }}
              >
                测试文件系统
              </button>
              <button
                className="btn btn-secondary"
                onClick={async () => {
                  try {
                    addLog('info', '测试 LLM 连接...');
                    const result = await window.electronAPI.llmPing();
                    addLog('success', `LLM 连接正常: ${result}`);
                  } catch (err) {
                    addLog('error', `LLM 连接失败: ${err.message}`);
                  }
                }}
                style={{ fontSize: 12, padding: '6px 12px' }}
              >
                测试 LLM 连接
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
