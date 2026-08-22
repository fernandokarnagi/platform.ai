import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import ErrorBanner from '@components/ErrorBanner';
import { downloadService } from '@services/downloadService';
import { libraryService } from '@services/libraryService';
import { formatDateTime } from '@/lib/format';
import type { DownloadJob, HfRepoFile, LibraryList } from '@/types';

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function statusLabel(job: DownloadJob): string {
  if (job.status === 'running') return job.source === 'library' ? 'Copying' : 'Downloading';
  if (job.status === 'queued') return 'Queued';
  if (job.status === 'done') return 'Done';
  if (job.status === 'cancelled') return 'Cancelled';
  return 'Failed';
}

export default function DownloadsScreen() {
  const [jobs, setJobs] = useState<DownloadJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [library, setLibrary] = useState<LibraryList | null>(null);
  const [fetchKind, setFetchKind] = useState<'llama.cpp' | 'vllm'>('llama.cpp');
  const [fetchSource, setFetchSource] = useState<'huggingface' | 'url'>('huggingface');
  const [fetchRepo, setFetchRepo] = useState('');
  const [fetchFilename, setFetchFilename] = useState('');
  const [fetchUrl, setFetchUrl] = useState('');
  const [hfFiles, setHfFiles] = useState<HfRepoFile[]>([]);
  const [fetching, setFetching] = useState(false);

  const load = useCallback(async () => {
    try {
      const [jobList, catalog] = await Promise.all([downloadService.list(), libraryService.list()]);
      setJobs(jobList);
      setLibrary(catalog);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const active = jobs.some((job) => job.status === 'running' || job.status === 'queued');
    if (!active) return;
    const timer = window.setInterval(() => {
      void load();
    }, 2000);
    return () => window.clearInterval(timer);
  }, [jobs, load]);

  async function handleCancel(job: DownloadJob) {
    if (!window.confirm(`Cancel download of "${job.filename}"?`)) return;
    setCancelling(job.id);
    try {
      await downloadService.cancel(job.id);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setCancelling(null);
    }
  }

  async function handleDelete(job: DownloadJob) {
    if (!window.confirm(`Remove download "${job.filename}" from this list?`)) return;
    setRemoving(job.id);
    try {
      await downloadService.remove(job.id);
      setJobs((current) => current.filter((item) => item.id !== job.id));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setRemoving(null);
    }
  }

  useEffect(() => {
    if (fetchSource !== 'huggingface') return;
    const repo = fetchRepo.trim();
    if (!repo.includes('/')) {
      setHfFiles([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void libraryService
        .listHf(repo, fetchKind)
        .then((listed) => {
          if (cancelled) return;
          setHfFiles(listed.files);
          setFetchFilename((current) => {
            if (current && listed.files.some((item) => item.name === current || item.name.endsWith(`/${current}`))) {
              return current;
            }
            return listed.files[0]?.name ?? '';
          });
        })
        .catch(() => {
          if (!cancelled) setHfFiles([]);
        });
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [fetchSource, fetchRepo, fetchKind]);

  async function handleFetch(event: FormEvent) {
    event.preventDefault();
    setFetching(true);
    setError(null);
    try {
      await libraryService.download(
        fetchSource === 'huggingface'
          ? { kind: fetchKind, source: 'huggingface', repo: fetchRepo.trim(), filename: fetchFilename.trim() }
          : { kind: fetchKind, source: 'url', url: fetchUrl.trim(), filename: fetchFilename.trim() || undefined },
      );
      setFetchRepo('');
      setFetchUrl('');
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setFetching(false);
    }
  }

  async function handleRetry(job: DownloadJob) {
    setRetrying(job.id);
    try {
      await downloadService.retry(job.id);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setRetrying(null);
    }
  }

  return (
    <div className="page space-y-5">
      <div className="page-head">
        <div>
          <h1>Downloads</h1>
          <p className="page-sub">Fetch into the library, then copy onto nodes</p>
        </div>
        <button type="button" className="toggle" onClick={() => void load()}>
          Refresh
        </button>
      </div>

      <p className="note">
        Library path is set in Settings. After a copy finishes, restart the engine on that node if the model does not
        appear in Served models.
      </p>

      {error ? <ErrorBanner message={error} /> : null}

      <section className="card space-y-4">
        <div className="card-head">
          <h2 className="card-title">Library</h2>
          <span className="muted">{library?.libraryDir || '…'}</span>
        </div>
        <form onSubmit={(event) => void handleFetch(event)} className="grid gap-4 sm:grid-cols-2">
          <label>
            <span className="field-label">Kind</span>
            <select
              value={fetchKind}
              onChange={(event) => setFetchKind(event.target.value as 'llama.cpp' | 'vllm')}
              className="field-input"
            >
              <option value="llama.cpp">llama.cpp (GGUF)</option>
              <option value="vllm">vLLM (snapshot)</option>
            </select>
          </label>
          <label>
            <span className="field-label">Source</span>
            <select
              value={fetchSource}
              onChange={(event) => setFetchSource(event.target.value as 'huggingface' | 'url')}
              className="field-input"
            >
              <option value="huggingface">Hugging Face</option>
              <option value="url">URL</option>
            </select>
          </label>
          {fetchSource === 'huggingface' ? (
            <>
              <label className="sm:col-span-2">
                <span className="field-label">Repo</span>
                <input
                  value={fetchRepo}
                  onChange={(event) => setFetchRepo(event.target.value)}
                  className="field-input"
                  placeholder="org/model"
                />
              </label>
              {fetchKind === 'llama.cpp' ? (
                <label className="sm:col-span-2">
                  <span className="field-label">File</span>
                  {hfFiles.length ? (
                    <select
                      value={fetchFilename}
                      onChange={(event) => setFetchFilename(event.target.value)}
                      className="field-input"
                    >
                      {hfFiles.map((file) => (
                        <option key={file.name} value={file.name}>
                          {file.name.split('/').pop()} ({formatBytes(file.sizeBytes)})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={fetchFilename}
                      onChange={(event) => setFetchFilename(event.target.value)}
                      className="field-input"
                      placeholder="model.gguf"
                    />
                  )}
                </label>
              ) : (
                <p className="muted sm:col-span-2">Fetches the full snapshot into vllm/org--model.</p>
              )}
            </>
          ) : (
            <>
              <label className="sm:col-span-2">
                <span className="field-label">URL</span>
                <input
                  value={fetchUrl}
                  onChange={(event) => setFetchUrl(event.target.value)}
                  className="field-input"
                  placeholder="https://…/model.gguf"
                />
              </label>
              <label className="sm:col-span-2">
                <span className="field-label">Filename</span>
                <input
                  value={fetchFilename}
                  onChange={(event) => setFetchFilename(event.target.value)}
                  className="field-input"
                  placeholder="optional"
                />
              </label>
            </>
          )}
          <div className="sm:col-span-2">
            <button type="submit" disabled={fetching} className="toggle accent">
              {fetching ? 'Fetching…' : 'Fetch into library'}
            </button>
          </div>
        </form>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Kind</th>
                <th>Name</th>
                <th>Size</th>
              </tr>
            </thead>
            <tbody>
              {(library?.items || []).length === 0 ? (
                <tr>
                  <td colSpan={3} className="empty">
                    Empty library. Fetch a GGUF or vLLM snapshot above.
                  </td>
                </tr>
              ) : (
                (library?.items || []).map((item) => (
                  <tr key={`${item.kind}-${item.name}`}>
                    <td>{item.kind}</td>
                    <td>{item.name}</td>
                    <td className="muted">{formatBytes(item.sizeBytes)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>File</th>
              <th>Node</th>
              <th>Status</th>
              <th>Progress</th>
              <th>Started</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && jobs.length === 0 ? (
              <tr>
                <td colSpan={6} className="empty">
                  Loading…
                </td>
              </tr>
            ) : null}
            {!loading && jobs.length === 0 ? (
              <tr>
                <td colSpan={6} className="empty">
                  No downloads yet. Start one from a node.
                </td>
              </tr>
            ) : null}
            {jobs.map((job) => {
              const pct = job.totalBytes > 0 ? Math.min(100, Math.round((job.bytes / job.totalBytes) * 100)) : null;
              return (
                <tr key={job.id}>
                  <td>
                    <div>{job.filename}</div>
                    {job.repo ? <div className="muted">{job.repo}</div> : null}
                  </td>
                  <td>
                    {job.nodeId ? (
                      <Link to={`/nodes/${job.nodeId}`} className="back">
                        {job.nodeName || 'Node'}
                      </Link>
                    ) : (
                      job.nodeName || '—'
                    )}
                  </td>
                  <td>
                    <span className={`pill ${job.status === 'done' ? 'up' : job.status === 'failed' ? 'down' : ''}`}>
                      {statusLabel(job)}
                    </span>
                    {job.detail && job.status === 'failed' ? <div className="muted">{job.detail}</div> : null}
                  </td>
                  <td>
                    <div className="progress" title={pct !== null ? `${pct}%` : formatBytes(job.bytes)}>
                      <span style={{ width: pct !== null ? `${pct}%` : job.status === 'running' ? '40%' : '0%' }} />
                    </div>
                    <div className="muted">
                      {formatBytes(job.bytes)}
                      {job.totalBytes > 0 ? ` / ${formatBytes(job.totalBytes)}` : ''}
                      {pct !== null ? ` · ${pct}%` : ''}
                    </div>
                  </td>
                  <td className="muted">{formatDateTime(job.createdAt)}</td>
                  <td>
                    <div className="flex flex-wrap gap-2">
                      {job.status === 'running' || job.status === 'queued' ? (
                        <button
                          type="button"
                          className="toggle danger"
                          disabled={cancelling === job.id || removing === job.id}
                          onClick={() => void handleCancel(job)}
                        >
                          {cancelling === job.id ? 'Cancelling…' : 'Cancel'}
                        </button>
                      ) : null}
                      {job.status === 'failed' || job.status === 'cancelled' ? (
                        <button
                          type="button"
                          className="toggle"
                          disabled={retrying === job.id || removing === job.id}
                          onClick={() => void handleRetry(job)}
                        >
                          {retrying === job.id ? 'Retrying…' : 'Retry'}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="toggle danger"
                        disabled={removing === job.id || cancelling === job.id}
                        onClick={() => void handleDelete(job)}
                      >
                        {removing === job.id ? 'Removing…' : 'Delete'}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
