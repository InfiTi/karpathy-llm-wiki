import React, { useState, useEffect } from 'react';
import useStore from '../store/useStore';

export default function IngestPage() {
  const { config, addLog } = useStore();
  const [files, setFiles] = useState([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentFile, setCurrentFile] = useState('');
  const [results, setResults] = useState([]);
  const [abortRef] = useState({ current: false });

  // Subscribe to progress events from main process
  useEffect(() => {
    if (!window.electronAPI) return;
    const unsubscribe = window.electronAPI.onIngestProgress((data) => {
      if (data.stage) setCurrentFile(data.filePath?.split('\\').pop() || data.filePath || '');
    });
    return unsubscribe;
  }, []);

  const selectFiles = async () => {
    if (!window.electronAPI) return;
    const paths = await window.electronAPI.selectFile({
      filters: [{ name: '支持的文件', extensions: ['txt', 'md', 'html', 'csv', 'json'] }]
    });
    if (paths?.length > 0) {
      const fileInfos = await Promise.all(paths.map(async p => {
        const stat = await window.electronAPI.stat(p);
        const name = p.split('\\').pop();
        return { path: p, name, size: stat.size };
      }));
      setFiles(prev => [...prev, ...fileInfos.filter(f => !prev.some(x => x.path === f.path))]);
    }
  };

  const selectFolder = async () => {
    if (!window.electronAPI) return;
    const dir = await window.electronAPI.selectDirectory();
    if (!dir) return;
    const entries = await window.electronAPI.readDir(dir);
    const supported = ['.txt', '.md', '.html', '.csv', '.json'];
    const fileInfos = await Promise.all(
      entries
        .filter(e => e.isFile && supported.some(ext => e.name.toLowerCase().endsWith(ext)))
        .map(async e => {
          const stat = await window.electronAPI.stat(e.path);
          return { path: e.path, name: e.name, size: stat.size };
        })
    );
    setFiles(prev => [...prev, ...fileInfos.filter(f => !prev.some(x => x.path === f.path))]);
  };

  const removeFile = (path) => setFiles(prev => prev.filter(f => f.path !== path));

  const runIngest = async () => {
    if (!files.length || !config.projectRoot) return;
    setRunning(true);
    abortRef.current = false;
    setResults([]);
    addLog('info', `开始 Ingest，共 ${files.length} 个文件...`);

    const filePaths = files.map(f => f.path);

    try {
      const allResults = await window.electronAPI.ingestProcessBatch(filePaths);
      const successCount = allResults.filter(r => r.success).length;
      setResults(allResults.map(r => ({
        name: r.title || r.filePath?.split('\\').pop() || '未知',
        status: r.success ? 'success' : 'error',
        message: r.success ? '处理完成' : r.error,
        path: r.savedPath,
      })));
      addLog(successCount === allResults.length ? 'success' : 'warning',
        `✅ Ingest 完成！${successCount}/${allResults.length} 成功`);
    } catch (err) {
      addLog('error', `Ingest 失败: ${err.message}`);
    }

    setProgress(100);
    setRunning(false);
  };

  const totalSize = files.reduce((sum, f) => sum + (f.size || 0), 0);

  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 8 }}>📥 Ingest - 文档摄入</h1>
      <div className="text-muted mb-24">
        将原始文档摄入系统，通过 AI 处理生成结构化 Wiki 条目。
      </div>

      {/* File Selection */}
      <div className="card">
        <div className="card-title">选择文件</div>
        <div className="flex gap-8 mb-16">
          <button className="btn btn-secondary" onClick={selectFiles}>📄 选择文件...</button>
          <button className="btn btn-secondary" onClick={selectFolder}>📂 选择文件夹</button>
          {files.length > 0 && (
            <button className="btn btn-danger" onClick={() => setFiles([])}>🗑 清空</button>
          )}
        </div>

        {files.length > 0 ? (
          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                  <th style={{ textAlign: 'left', padding: '6px 8px' }}>文件名</th>
                  <th style={{ textAlign: 'right', padding: '6px 8px' }}>大小</th>
                  <th style={{ width: 40 }}></th>
                </tr>
              </thead>
              <tbody>
                {files.map(f => (
                  <tr key={f.path} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '6px 8px', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{f.name}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text-muted)', fontSize: 12 }}>
                      {(f.size / 1024).toFixed(1)} KB
                    </td>
                    <td style={{ padding: '6px 4px', textAlign: 'center' }}>
                      <button className="btn btn-danger" style={{ padding: '2px 8px', fontSize: 11 }}
                        onClick={() => removeFile(f.path)}>×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)', fontSize: 13 }}>
            尚未选择文件
          </div>
        )}

        <div style={{ marginTop: 16 }}>
          <div className="text-muted mb-8">
            待处理: {files.length} 个文件（{(totalSize / 1024 / 1024).toFixed(1)} MB）
          </div>
          {!config.projectRoot && (
            <div style={{ color: 'var(--accent-red)', fontSize: 13 }}>⚠️ 请先在「项目初始化」设置项目目录</div>
          )}
        </div>
      </div>

      {/* Progress */}
      {(running || progress > 0) && (
        <div className="card mt-16">
          <div className="card-title">处理进度</div>
          <div className="progress-bar" style={{ marginBottom: 8 }}>
            <div className="progress-fill" style={{
              width: `${progress}%`,
              background: running ? 'var(--accent-blue)' : 'var(--accent-green)'
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)' }}>
            <span>{currentFile}</span>
            <span>{progress}%</span>
          </div>
        </div>
      )}

      {/* Run Button */}
      <div className="mt-16">
        <button
          className="btn btn-primary"
          onClick={runIngest}
          disabled={!files.length || !config.projectRoot || running}
          style={{ fontSize: 15, padding: '10px 32px' }}
        >
          {running ? '⏳ 处理中...' : `▶ 开始 Ingest (${files.length})`}
        </button>
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="card mt-16">
          <div className="card-title">处理结果</div>
          <div style={{ fontSize: 12, color: 'var(--accent-green)', marginBottom: 12 }}>
            ✅ {results.filter(r => r.status === 'success').length} / {results.length} 成功
          </div>
          <div style={{ maxHeight: 200, overflowY: 'auto' }}>
            {results.map((r, i) => (
              <div key={i} style={{ padding: '4px 0', fontSize: 12 }}>
                <span style={{ color: r.status === 'success' ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                  {r.status === 'success' ? '✓' : '✗'}
                </span>
                <span style={{ marginLeft: 8 }}>{r.name}</span>
                {r.message && r.status !== 'success' && (
                  <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>— {r.message}</span>
                )}
                {r.path && (
                  <button className="btn btn-secondary" style={{ marginLeft: 8, padding: '1px 8px', fontSize: 11 }}
                    onClick={() => window.electronAPI?.openPath(r.path)}>打开</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
