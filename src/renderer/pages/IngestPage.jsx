import React, { useState, useEffect } from 'react';
import useStore from '../store/useStore';

export default function IngestPage() {
  const { config, addLog, showToast } = useStore();
  const [files, setFiles] = useState([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [thinkingChars, setThinkingChars] = useState(0);
  const [outputChars, setOutputChars] = useState(0);
  const [currentFile, setCurrentFile] = useState('');
  const [results, setResults] = useState([]);
  const [abortRef] = useState({ current: false });
  const [url, setUrl] = useState('');
  const [urlBatchText, setUrlBatchText] = useState('');
  const [minDelaySeconds, setMinDelaySeconds] = useState(30);
  const [maxDelaySeconds, setMaxDelaySeconds] = useState(90);
  const [retryCount, setRetryCount] = useState(1);
  const [skipExistingSourceUrls, setSkipExistingSourceUrls] = useState(true);
  const [batchSummary, setBatchSummary] = useState(null);

  useEffect(() => {
    if (!window.electronAPI) return;
    const unsubscribe = window.electronAPI.onIngestProgress((data) => {
      if (data.progress !== undefined) {
        setProgress(Math.round(data.progress));
      }
      if (data.message) {
        setProgressMessage(data.message);
      }
      if (data.thinkingChars !== undefined) {
        setThinkingChars(data.thinkingChars);
      }
      if (data.outputChars !== undefined) {
        setOutputChars(data.outputChars);
      }
      if (data.filePath) {
        setCurrentFile(data.filePath.split('\\').pop() || data.filePath);
      }
      if (data.url) {
        setCurrentFile(data.url);
      }
      if (data.stage === 'complete') {
        setProgress(100);
      }
    });
    return unsubscribe;
  }, []);

  const selectFiles = async () => {
    if (!window.electronAPI) return;
    const paths = await window.electronAPI.selectFile({
      filters: [{ name: 'Supported files', extensions: ['txt', 'md', 'html', 'csv', 'json'] }]
    });
    if (paths?.length > 0) {
      const fileInfos = await Promise.all(paths.map(async (p) => {
        const stat = await window.electronAPI.stat(p);
        const name = p.split('\\').pop();
        return { path: p, name, size: stat.size };
      }));
      setFiles((prev) => [...prev, ...fileInfos.filter((f) => !prev.some((x) => x.path === f.path))]);
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
        .filter((e) => e.isFile && supported.some((ext) => e.name.toLowerCase().endsWith(ext)))
        .map(async (e) => {
          const stat = await window.electronAPI.stat(e.path);
          return { path: e.path, name: e.name, size: stat.size };
        })
    );
    setFiles((prev) => [...prev, ...fileInfos.filter((f) => !prev.some((x) => x.path === f.path))]);
  };

  const removeFile = (path) => setFiles((prev) => prev.filter((f) => f.path !== path));

  const ingestUrl = async () => {
    if (!url || !config.projectRoot) return;
    setRunning(true);
    abortRef.current = false;
    setResults([]);
    setBatchSummary(null);
    addLog('info', `Start URL ingest: ${url}`);

    try {
      const result = await window.electronAPI.ingestProcessUrl(url);
      const successCount = result.success ? 1 : 0;
      const resultItem = {
        name: result.title || url.split('/').pop() || 'Web page',
        status: result.success ? 'success' : 'error',
        message: result.success ? 'Completed' : result.error,
        path: result.filePath,
        rawPath: result.rawPath,
        wikiPath: result.filePath,
      };
      setResults([resultItem]);
      addLog(successCount === 1 ? 'success' : 'warning', `URL ingest finished: ${successCount}/1 succeeded`);

      if (result.success) {
        showToast('success', 'Ingest succeeded', `Created wiki entry: ${resultItem.name}`);
      } else {
        showToast('error', 'Ingest failed', resultItem.message);
      }
    } catch (err) {
      const message = err?.message || String(err);
      addLog('error', `URL ingest failed: ${message}`);
      showToast('error', 'Ingest failed', message);
    }

    setProgress(100);
    setRunning(false);
    setUrl('');
  };

  const buildBatchItemMessage = (item) => {
    if (item.success) {
      return `Succeeded after ${item.attempts || 1} attempt(s)`;
    }
    if (item.skipReason === 'duplicate_existing') {
      return 'Skipped: source_url already exists';
    }
    if (item.skipReason === 'duplicate_input') {
      return 'Skipped: duplicate URL in current batch';
    }
    if (item.skipReason === 'invalid_url') {
      return 'Skipped: invalid URL';
    }
    return item.error || 'Failed';
  };

  const ingestUrlBatch = async () => {
    const urls = urlBatchText
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);

    if (!urls.length || !config.projectRoot) return;

    setRunning(true);
    abortRef.current = false;
    setResults([]);
    setProgress(0);
    setThinkingChars(0);
    setOutputChars(0);
    setBatchSummary(null);
    addLog('info', `Start batch URL ingest: ${urls.length} line(s)`);

    try {
      const batchResult = await window.electronAPI.ingestProcessUrlBatch(urls, {
        minDelaySeconds,
        maxDelaySeconds,
        retryCount,
        skipExistingSourceUrls,
      });
      const resultItems = batchResult.results || [];
      const duplicateInputCount = resultItems.filter((item) => item.skipReason === 'duplicate_input').length;
      const duplicateExistingCount = resultItems.filter((item) => item.skipReason === 'duplicate_existing').length;
      const invalidUrlCount = resultItems.filter((item) => item.skipReason === 'invalid_url').length;
      const uniqueInputCount = new Set(
        resultItems
          .map((item) => item.normalizedUrl)
          .filter(Boolean)
      ).size;

      setBatchSummary({
        totalRequested: batchResult.totalRequested,
        uniqueInputCount,
        totalQueued: batchResult.totalQueued,
        duplicateInputCount,
        duplicateExistingCount,
        invalidUrlCount,
      });

      const formattedResults = resultItems.map((item) => ({
        name: item.title || item.url,
        status: item.success ? 'success' : item.skipped ? 'skipped' : 'error',
        message: buildBatchItemMessage(item),
        path: item.filePath,
        rawPath: item.rawPath,
        wikiPath: item.filePath,
        skipReason: item.skipReason,
        normalizedUrl: item.normalizedUrl,
      }));

      setResults(formattedResults);
      addLog(
        batchResult.failedCount === 0 ? 'success' : 'warning',
        `Batch URL ingest finished: requested ${batchResult.totalRequested}, unique ${uniqueInputCount}, queued ${batchResult.totalQueued}, success ${batchResult.successCount}, skipped ${batchResult.skippedCount}, failed ${batchResult.failedCount}`
      );

      if (batchResult.failedCount === 0) {
        showToast(
          'success',
          'Batch URL ingest finished',
          `Success ${batchResult.successCount}, skipped ${batchResult.skippedCount}`
        );
      } else {
        showToast(
          'info',
          'Batch URL ingest finished',
          `Success ${batchResult.successCount}, skipped ${batchResult.skippedCount}, failed ${batchResult.failedCount}`
        );
      }
    } catch (err) {
      const message = err?.message || String(err);
      addLog('error', `Batch URL ingest failed: ${message}`);
      showToast('error', 'Batch URL ingest failed', message);
    }

    setProgress(100);
    setRunning(false);
  };

  const runIngest = async () => {
    if (!files.length || !config.projectRoot) return;
    setRunning(true);
    abortRef.current = false;
    setResults([]);
    setBatchSummary(null);
    addLog('info', `Start file ingest: ${files.length} file(s)`);

    const filePaths = files.map((f) => f.path);

    try {
      const allResults = await window.electronAPI.ingestProcessBatch(filePaths);
      const successCount = allResults.filter((r) => r.success).length;
      const formattedResults = allResults.map((r) => ({
        name: r.title || r.filePath?.split('\\').pop() || 'Unknown',
        status: r.success ? 'success' : 'error',
        message: r.success ? 'Completed' : r.error,
        path: r.filePath,
        rawPath: r.rawPath,
        wikiPath: r.filePath,
      }));
      setResults(formattedResults);
      addLog(
        successCount === allResults.length ? 'success' : 'warning',
        `File ingest finished: ${successCount}/${allResults.length} succeeded`
      );

      if (successCount === allResults.length) {
        showToast('success', 'Ingest succeeded', `Processed ${successCount} file(s)`);
      } else if (successCount > 0) {
        showToast('info', 'Ingest partially succeeded', `${successCount}/${allResults.length} succeeded`);
      } else {
        showToast('error', 'Ingest failed', 'Check logs for details');
      }
    } catch (err) {
      const message = err?.message || String(err);
      addLog('error', `Ingest failed: ${message}`);
      showToast('error', 'Ingest failed', message);
    }

    setProgress(100);
    setRunning(false);
  };

  const totalSize = files.reduce((sum, f) => sum + (f.size || 0), 0);
  const successCount = results.filter((r) => r.status === 'success').length;
  const skippedCount = results.filter((r) => r.status === 'skipped').length;
  const failedCount = results.filter((r) => r.status === 'error').length;

  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 8 }}>Ingest - Import content</h1>
      <div className="text-muted mb-24">
        Import raw files or URLs and generate structured wiki entries.
      </div>

      <div className="card">
        <div className="card-title">Select input</div>
        <div className="flex gap-8 mb-16">
          <button className="btn btn-secondary" onClick={selectFiles}>Select files...</button>
          <button className="btn btn-secondary" onClick={selectFolder}>Select folder</button>
          {files.length > 0 && (
            <button className="btn btn-danger" onClick={() => setFiles([])}>Clear</button>
          )}
        </div>

        <div className="mb-16">
          <div style={{ marginBottom: 8, fontSize: 13, color: 'var(--text-muted)' }}>Single URL</div>
          <div className="flex gap-8">
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              style={{
                flex: 1,
                padding: '8px 12px',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                fontSize: 13,
                fontFamily: 'var(--font-mono)'
              }}
            />
            <button
              className="btn btn-secondary"
              onClick={ingestUrl}
              disabled={!url || !config.projectRoot || running}
            >
              Ingest URL
            </button>
          </div>
        </div>

        <div className="mb-16">
          <div style={{ marginBottom: 8, fontSize: 13, color: 'var(--text-muted)' }}>
            Batch URL list (one URL per line)
          </div>
          <textarea
            value={urlBatchText}
            onChange={(e) => setUrlBatchText(e.target.value)}
            placeholder={'https://mp.weixin.qq.com/s/...\nhttps://mp.weixin.qq.com/s/...'}
            style={{
              width: '100%',
              minHeight: 120,
              padding: '10px 12px',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              fontSize: 13,
              fontFamily: 'var(--font-mono)',
              resize: 'vertical'
            }}
          />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12, marginTop: 12 }}>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Min delay (sec)</div>
              <input
                type="number"
                min="1"
                value={minDelaySeconds}
                onChange={(e) => setMinDelaySeconds(Number(e.target.value) || 1)}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 4 }}
              />
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Max delay (sec)</div>
              <input
                type="number"
                min="1"
                value={maxDelaySeconds}
                onChange={(e) => setMaxDelaySeconds(Number(e.target.value) || 1)}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 4 }}
              />
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Retry count</div>
              <input
                type="number"
                min="0"
                max="3"
                value={retryCount}
                onChange={(e) => setRetryCount(Number(e.target.value) || 0)}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 4 }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'end' }}>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
                <input
                  type="checkbox"
                  checked={skipExistingSourceUrls}
                  onChange={(e) => setSkipExistingSourceUrls(e.target.checked)}
                />
                Skip existing source_url
              </label>
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <button
              className="btn btn-secondary"
              onClick={ingestUrlBatch}
              disabled={!urlBatchText.trim() || !config.projectRoot || running}
            >
              Run batch URL ingest
            </button>
          </div>
        </div>

        {files.length > 0 ? (
          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                  <th style={{ textAlign: 'left', padding: '6px 8px' }}>Name</th>
                  <th style={{ textAlign: 'right', padding: '6px 8px' }}>Size</th>
                  <th style={{ width: 40 }}></th>
                </tr>
              </thead>
              <tbody>
                {files.map((f) => (
                  <tr key={f.path} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '6px 8px', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{f.name}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text-muted)', fontSize: 12 }}>
                      {(f.size / 1024).toFixed(1)} KB
                    </td>
                    <td style={{ padding: '6px 4px', textAlign: 'center' }}>
                      <button
                        className="btn btn-danger"
                        style={{ padding: '2px 8px', fontSize: 11 }}
                        onClick={() => removeFile(f.path)}
                      >
                        x
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)', fontSize: 13 }}>
            No files selected
          </div>
        )}

        <div style={{ marginTop: 16 }}>
          <div className="text-muted mb-8">
            Pending files: {files.length} ({(totalSize / 1024 / 1024).toFixed(1)} MB)
          </div>
          {!config.projectRoot && (
            <div style={{ color: 'var(--accent-red)', fontSize: 13 }}>
              Set project root first in Project Init.
            </div>
          )}
        </div>
      </div>

      {(running || progress > 0) && (
        <div className="card mt-16">
          <div className="card-title">Progress</div>
          <div className="progress-bar" style={{ marginBottom: 8 }}>
            <div
              className="progress-fill"
              style={{
                width: `${progress}%`,
                background: running ? 'var(--accent-blue)' : 'var(--accent-green)'
              }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)' }}>
            <span>{currentFile}</span>
            <span>{progress}%</span>
          </div>
          {progressMessage && (
            <div style={{ fontSize: 12, color: 'var(--accent-blue)', marginTop: 4 }}>
              {progressMessage}
            </div>
          )}
          {(thinkingChars > 0 || outputChars > 0) && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              {thinkingChars > 0 && <span style={{ marginRight: 16 }}>Thinking: {thinkingChars} chars</span>}
              {outputChars > 0 && <span>Output: {outputChars} chars</span>}
            </div>
          )}
        </div>
      )}

      <div className="mt-16">
        <button
          className="btn btn-primary"
          onClick={runIngest}
          disabled={!files.length || !config.projectRoot || running}
          style={{ fontSize: 15, padding: '10px 32px' }}
        >
          {running ? 'Running...' : `Start file ingest (${files.length})`}
        </button>
      </div>

      {results.length > 0 && (
        <div className="card mt-16">
          <div className="card-title">Results</div>
          <div style={{ fontSize: 12, color: 'var(--accent-green)', marginBottom: 8 }}>
            Success {successCount} | Skipped {skippedCount} | Failed {failedCount}
          </div>
          {batchSummary && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
              Requested {batchSummary.totalRequested} | Unique URLs {batchSummary.uniqueInputCount} | Queued {batchSummary.totalQueued}
              <br />
              Skip detail: existing {batchSummary.duplicateExistingCount} | duplicate input {batchSummary.duplicateInputCount} | invalid {batchSummary.invalidUrlCount}
            </div>
          )}
          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            {results.map((r, i) => (
              <div key={i} style={{ padding: '10px 0', fontSize: 12, borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div>
                      <span style={{ color: r.status === 'success' ? 'var(--accent-green)' : r.status === 'skipped' ? 'var(--text-muted)' : 'var(--accent-red)' }}>
                        {r.status === 'success' ? 'OK' : r.status === 'skipped' ? 'SKIP' : 'ERR'}
                      </span>
                      <span style={{ marginLeft: 8, fontWeight: 500, fontSize: 13 }}>{r.name}</span>
                      {r.message && r.status !== 'success' && (
                        <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>- {r.message}</span>
                      )}
                    </div>
                    {r.wikiPath && (
                      <div style={{ marginTop: 6, marginLeft: 20, color: 'var(--text-muted)', fontSize: 11 }}>
                        Wiki: <span style={{ fontFamily: 'var(--font-mono)' }}>{r.wikiPath}</span>
                      </div>
                    )}
                    {r.rawPath && (
                      <div style={{ marginTop: 4, marginLeft: 20, color: 'var(--text-muted)', fontSize: 11 }}>
                        Raw: <span style={{ fontFamily: 'var(--font-mono)' }}>{r.rawPath}</span>
                      </div>
                    )}
                  </div>

                  {r.status === 'success' && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                      {r.wikiPath && (
                        <>
                          <button
                            className="btn btn-secondary"
                            style={{ padding: '4px 12px', fontSize: 11 }}
                            onClick={() => window.electronAPI?.openPath(r.wikiPath)}
                          >
                            Open file
                          </button>
                          <button
                            className="btn btn-primary"
                            style={{ padding: '4px 12px', fontSize: 11 }}
                            onClick={() => {
                              if (window.electronAPI?.openPath) {
                                window.electronAPI.openPath(r.wikiPath);
                              }
                            }}
                          >
                            Open in Obsidian
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
