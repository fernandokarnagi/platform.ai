import { useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import ErrorBanner from '@components/ErrorBanner';
import SuccessModal from '@components/SuccessModal';
import { useClusters } from '@contexts/ClusterContext';
import { clusterService } from '@services/clusterService';
import { formatDateTime } from '@/lib/format';

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <span>{title}</span>
          <button type="button" onClick={onClose} className="modal-x">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function ClustersScreen() {
  const navigate = useNavigate();
  const { clusters, loading, error, setError, refresh } = useClusters();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  function openCreate() {
    setName('');
    setDescription('');
    setCreating(true);
    setError(null);
    setNotice(null);
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Name is required');
      return;
    }
    setSaving(true);
    try {
      await clusterService.create({
        name: trimmed,
        engine: 'llama.cpp',
        description: description.trim(),
      });
      setCreating(false);
      setError(null);
      await refresh();
      setNotice(`Cluster "${trimmed}" created`);
    } catch (err) {
      setNotice(null);
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page space-y-5">
      <div className="page-head">
        <div>
          <h1>Clusters</h1>
          <p className="page-sub">Inferencing clusters running llama.cpp</p>
        </div>
        <button type="button" onClick={openCreate} className="toggle accent">
          Create cluster
        </button>
      </div>

      {error ? <ErrorBanner message={error} /> : null}
      {notice ? <SuccessModal message={notice} onClose={() => setNotice(null)} /> : null}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Engine</th>
              <th>Nodes</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {loading && clusters.length === 0 ? (
              <tr>
                <td colSpan={4} className="empty">
                  Loading…
                </td>
              </tr>
            ) : null}
            {!loading && clusters.length === 0 ? (
              <tr>
                <td colSpan={4} className="empty">
                  No clusters yet. Create one to register nodes.
                </td>
              </tr>
            ) : null}
            {clusters.map((cluster) => (
              <tr key={cluster.id} className="clickable" onClick={() => navigate(`/clusters/${cluster.id}`)}>
                <td>{cluster.name}</td>
                <td>
                  <span className="badge">{cluster.engine}</span>
                </td>
                <td>
                  {cluster.nodeCount === 0 ? (
                    <span className="muted">0</span>
                  ) : (
                    <span className="status-cell">
                      <span>{cluster.runningCount ?? 0} running</span>
                      <span className="muted">{cluster.stoppedCount ?? cluster.nodeCount} stopped</span>
                    </span>
                  )}
                </td>
                <td className="muted">{formatDateTime(cluster.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {creating ? (
        <Modal title="Create cluster" onClose={() => setCreating(false)}>
          <form onSubmit={(event) => void handleCreate(event)}>
            <label>
              <span className="field-label">Name</span>
              <input
                autoFocus
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="field-input"
                placeholder="desk-macs"
              />
            </label>
            <label>
              <span className="field-label">Description</span>
              <input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="field-input"
                placeholder="optional"
              />
            </label>
            <label>
              <span className="field-label">Engine</span>
              <input value="llama.cpp" readOnly className="field-input" />
            </label>
            <div className="modal-actions">
              <button type="button" onClick={() => setCreating(false)} className="toggle">
                Cancel
              </button>
              <button type="submit" disabled={saving} className="toggle accent">
                {saving ? 'Creating…' : 'Create'}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
