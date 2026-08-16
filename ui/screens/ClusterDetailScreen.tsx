import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import ErrorBanner from '@components/ErrorBanner';
import StatusIcon from '@components/StatusIcon';
import { useClusters } from '@contexts/ClusterContext';
import { clusterService } from '@services/clusterService';
import { nodeService } from '@services/nodeService';
import { formatDateTime } from '@/lib/format';
import type { Cluster, EngineStatus, LastOpenAICheck, Node, NodeStatus } from '@/types';

interface NodeProbe {
  status: NodeStatus;
  engine: EngineStatus | null;
}

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

function OpenAIStatus({
  live,
  stored,
}: {
  live: NodeStatus | null;
  stored: LastOpenAICheck | null;
}) {
  const openai = live?.openai ?? stored?.openai;
  const checkedAt = live?.checkedAt ?? stored?.checkedAt;
  if (!openai) {
    return <span className="muted">Not checked</span>;
  }
  return (
    <span className="status-cell">
      <StatusIcon kind={openai === 'up' ? 'up' : 'down'} />
      <span className="muted">{formatDateTime(checkedAt)}</span>
    </span>
  );
}

export default function ClusterDetailScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { refresh } = useClusters();
  const [cluster, setCluster] = useState<Cluster | null>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [probes, setProbes] = useState<Record<string, NodeProbe>>({});
  const [loading, setLoading] = useState(true);
  const [probing, setProbing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const probeNodes = useCallback(async (nodeList: Node[]) => {
    setProbing(true);
    const next: Record<string, NodeProbe> = {};
    const details: string[] = [];

    const addDetail = (nodeName: string, message: string) => {
      const text = `${nodeName}: ${message}`;
      if (message && !details.includes(text)) details.push(text);
    };

    await Promise.all(
      nodeList.map(async (node) => {
        const [statusRes, engineRes] = await Promise.allSettled([
          nodeService.status(node.id),
          nodeService.engine(node.id),
        ]);

        let status: NodeStatus;
        if (statusRes.status === 'fulfilled') {
          status = statusRes.value;
          if (status.ssh === 'down' && status.detail) {
            addDetail(node.name, status.detail);
          }
        } else {
          const detail = errorMessage(statusRes.reason);
          status = { ssh: 'down', openai: 'down', models: [], detail };
          addDetail(node.name, detail);
        }

        let engine: EngineStatus | null = null;
        if (engineRes.status === 'fulfilled') {
          engine = engineRes.value;
        } else {
          addDetail(node.name, errorMessage(engineRes.reason));
        }

        next[node.id] = { status, engine };
      }),
    );
    setProbes(next);
    setError(details.length ? details.join(' · ') : null);
    setProbing(false);
  }, []);

  const load = useCallback(async () => {
    if (!id) {
      setError('Missing cluster id');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [clusterData, nodeList] = await Promise.all([
        clusterService.get(id),
        nodeService.listByCluster(id),
      ]);
      setCluster(clusterData);
      setNodes(nodeList);
      await probeNodes(nodeList);
      setNodes(await nodeService.listByCluster(id));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [id, probeNodes]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleRefresh() {
    if (!id) return;
    setError(null);
    try {
      const nodeList = await nodeService.listByCluster(id);
      setNodes(nodeList);
      await probeNodes(nodeList);
      setNodes(await nodeService.listByCluster(id));
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  function openEdit() {
    if (!cluster) return;
    setEditName(cluster.name);
    setEditDescription(cluster.description ?? '');
    setEditing(true);
    setError(null);
  }

  async function handleEdit(event: FormEvent) {
    event.preventDefault();
    if (!id) return;
    const trimmed = editName.trim();
    if (!trimmed) {
      setError('Name is required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await clusterService.update(id, {
        name: trimmed,
        description: editDescription.trim(),
      });
      setCluster(updated);
      setEditing(false);
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteCluster() {
    if (!id || !cluster) return;
    const extra =
      nodes.length > 0 ? ` This also deletes ${nodes.length} node${nodes.length === 1 ? '' : 's'}.` : '';
    if (!window.confirm(`Delete cluster "${cluster.name}"?${extra}`)) return;
    setDeleting(true);
    setError(null);
    try {
      await clusterService.remove(id, { cascade: nodes.length > 0 });
      await refresh();
      navigate('/');
    } catch (err) {
      setError(errorMessage(err));
      setDeleting(false);
    }
  }

  return (
    <div className="page space-y-5">
      <div>
        <Link to="/" className="back">
          ← Clusters
        </Link>
        <div className="page-head mt-3">
          <div>
            <h1>{cluster?.name ?? 'Cluster'}</h1>
            <p className="page-sub">
              {cluster ? `${cluster.engine}${cluster.description ? ` · ${cluster.description}` : ''}` : ' '}
            </p>
          </div>
          <div className="page-actions">
            <button type="button" onClick={() => void handleRefresh()} disabled={loading || probing} className="toggle">
              {probing ? 'Probing…' : 'Refresh'}
            </button>
            <button
              type="button"
              onClick={() => id && navigate(`/clusters/${id}/nodes/new`)}
              className="toggle accent"
            >
              Register node
            </button>
            <button
              type="button"
              disabled={!cluster || deleting}
              className="toggle"
              onClick={openEdit}
            >
              Edit cluster
            </button>
            <button
              type="button"
              disabled={!cluster || deleting}
              title={
                nodes.length > 0
                  ? `Delete cluster and ${nodes.length} node${nodes.length === 1 ? '' : 's'}`
                  : 'Delete cluster'
              }
              className="toggle danger"
              onClick={() => void handleDeleteCluster()}
            >
              {deleting ? 'Deleting…' : 'Delete cluster'}
            </button>
          </div>
        </div>
      </div>

      {error ? <ErrorBanner message={error} /> : null}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Host</th>
              <th>Access</th>
              <th>Engine</th>
              <th>OpenAI</th>
              <th>Model</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="empty">
                  Loading…
                </td>
              </tr>
            ) : null}
            {!loading && nodes.length === 0 ? (
              <tr>
                <td colSpan={6} className="empty">
                  No nodes yet. Register a node to start.
                </td>
              </tr>
            ) : null}
            {!loading
              ? nodes.map((node) => {
                  const probe = probes[node.id];
                  const currentModel = probe?.status.models.join(', ') || '—';
                  return (
                    <tr key={node.id} className="clickable" onClick={() => navigate(`/nodes/${node.id}`)}>
                      <td>{node.name}</td>
                      <td className="muted">
                        {node.nodeType === 'local' ? 'localhost' : `${node.host}:${node.sshPort}`}
                      </td>
                      <td>
                        {probe ? <StatusIcon kind={probe.status.ssh === 'up' ? 'up' : 'down'} /> : <span className="muted">…</span>}
                      </td>
                      <td>
                        {probe?.engine ? (
                          <StatusIcon kind={probe.engine.running ? 'running' : 'stopped'} />
                        ) : probe ? (
                          <span className="muted">—</span>
                        ) : (
                          <span className="muted">…</span>
                        )}
                      </td>
                      <td>
                        <OpenAIStatus
                          live={probe?.status ?? null}
                          stored={node.lastOpenAICheck}
                        />
                      </td>
                      <td className="muted">{probe ? currentModel : '…'}</td>
                    </tr>
                  );
                })
              : null}
          </tbody>
        </table>
      </div>

      {editing ? (
        <Modal title="Edit cluster" onClose={() => setEditing(false)}>
          <form onSubmit={(event) => void handleEdit(event)}>
            <label>
              <span className="field-label">Name</span>
              <input
                autoFocus
                value={editName}
                onChange={(event) => setEditName(event.target.value)}
                className="field-input"
              />
            </label>
            <label>
              <span className="field-label">Description</span>
              <input
                value={editDescription}
                onChange={(event) => setEditDescription(event.target.value)}
                className="field-input"
                placeholder="optional"
              />
            </label>
            <div className="modal-actions">
              <button type="button" onClick={() => setEditing(false)} className="toggle">
                Cancel
              </button>
              <button type="submit" disabled={saving} className="toggle accent">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
