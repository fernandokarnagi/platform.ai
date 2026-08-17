import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ErrorBanner from '@components/ErrorBanner';
import { downloadService } from '@services/downloadService';
import { formatDateTime } from '@/lib/format';
import type { DownloadJob } from '@/types';

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
  if (job.status === 'running') return 'Downloading';
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

  const load = useCallback(async () => {
    try {
      setJobs(await downloadService.list());
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
          <p className="page-sub">Background GGUF downloads on your nodes</p>
        </div>
        <button type="button" className="toggle" onClick={() => void load()}>
          Refresh
        </button>
      </div>

      <p className="note">
        After a download finishes, restart the engine on that node if the new model does not appear in Served models.
      </p>

      {error ? <ErrorBanner message={error} /> : null}

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
                    {job.status === 'running' || job.status === 'queued' ? (
                      <button
                        type="button"
                        className="toggle danger"
                        disabled={cancelling === job.id}
                        onClick={() => void handleCancel(job)}
                      >
                        {cancelling === job.id ? 'Cancelling…' : 'Cancel'}
                      </button>
                    ) : null}
                    {job.status === 'failed' || job.status === 'cancelled' ? (
                      <button
                        type="button"
                        className="toggle"
                        disabled={retrying === job.id}
                        onClick={() => void handleRetry(job)}
                      >
                        {retrying === job.id ? 'Retrying…' : 'Retry'}
                      </button>
                    ) : null}
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
