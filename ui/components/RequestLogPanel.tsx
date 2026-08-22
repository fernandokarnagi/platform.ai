import { formatDateTime } from '@/lib/format';
import type { RequestLogEntry } from '@/types';

function formatMs(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 1000) return `${n} ms`;
  return `${(n / 1000).toFixed(1)} s`;
}

export default function RequestLogPanel({
  rows,
  loading,
  onRefresh,
}: {
  rows: RequestLogEntry[];
  loading: boolean;
  onRefresh: () => void;
}) {
  return (
    <section className="card space-y-4">
      <div className="card-head">
        <h2 className="card-title">Requests</h2>
        <button type="button" className="toggle" disabled={loading} onClick={onRefresh}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="muted">No proxied chat yet. Send a Chat message to record model, latency, and tokens.</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table request-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Model</th>
                <th>Latency</th>
                <th>Tokens</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.at}-${index}`}>
                  <td className="muted">{formatDateTime(row.at, { seconds: true })}</td>
                  <td>{row.model || '—'}</td>
                  <td>{formatMs(row.latencyMs)}</td>
                  <td>
                    {row.promptTokens == null ? '—' : row.promptTokens}
                    {row.completionTokens != null ? ` → ${row.completionTokens}` : ''}
                  </td>
                  <td>
                    {row.ok ? (
                      <span className="ok">ok</span>
                    ) : (
                      <span className="fail" title={row.error}>
                        {row.error || 'error'}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
