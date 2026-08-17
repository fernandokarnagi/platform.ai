import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import EngineParamsModal from '@components/EngineParamsModal';
import ErrorBanner from '@components/ErrorBanner';
import SuccessModal from '@components/SuccessModal';
import ModelRadios from '@components/ModelRadios';
import StatusIcon from '@components/StatusIcon';
import { usefulDetail } from '@/lib/errors';
import { useClusters } from '@contexts/ClusterContext';
import { clusterService } from '@services/clusterService';
import { nodeService } from '@services/nodeService';
import type { Cluster, EngineStatus, Node, NodeStatus } from '@/types';

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
  wide,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`modal${wide ? ' modal-wide' : ''}`} onClick={(event) => event.stopPropagation()}>
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

function probeFromNode(node: Node): NodeProbe | null {
  const cache = node.statusCache;
  if (!cache) return null;
  return {
    status: {
      ssh: cache.ssh,
      openai: cache.openai,
      models: cache.models,
      detail: cache.detail ?? null,
      checkedAt: cache.checkedAt,
      cached: true,
    },
    engine: {
      running: cache.running,
      pid: cache.pid,
      lastStart: node.lastStart,
    },
  };
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
  const [notice, setNotice] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [paramsNode, setParamsNode] = useState<Node | null>(null);

  const applyCachedProbes = useCallback((nodeList: Node[]) => {
    const next: Record<string, NodeProbe> = {};
    for (const node of nodeList) {
      const probe = probeFromNode(node);
      if (probe) next[node.id] = probe;
    }
    setProbes(next);
  }, []);

  const probeNodes = useCallback(async (nodeList: Node[], refresh = false) => {
    if (nodeList.length === 0) return;
    setProbing(true);
    const next: Record<string, NodeProbe> = {};
    const details: string[] = [];

    const addDetail = (nodeName: string, message: string) => {
      const text = `${nodeName}: ${message}`;
      if (message && !details.includes(text)) details.push(text);
    };

    await Promise.all(
      nodeList.map(async (node) => {
        let status: NodeStatus;
        try {
          status = await nodeService.status(node.id, refresh);
          const statusDetail = usefulDetail(status.detail);
          if (status.ssh === 'down' && statusDetail) {
            addDetail(node.name, statusDetail);
          }
        } catch (err) {
          const detail = errorMessage(err);
          status = { ssh: 'down', openai: 'down', models: [], detail };
          addDetail(node.name, detail);
        }

        next[node.id] = {
          status,
          engine: {
            running: Boolean(status.running),
            pid: status.pid ?? null,
            lastStart: node.lastStart,
          },
        };
      }),
    );
    setProbes((current) => ({ ...current, ...next }));
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
      applyCachedProbes(nodeList);
      const stale = nodeList.filter((node) => !node.statusCache?.fresh);
      if (stale.length) void probeNodes(stale, false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [id, applyCachedProbes, probeNodes]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleRefresh() {
    if (!id) return;
    setError(null);
    try {
      const nodeList = await nodeService.listByCluster(id);
      setNodes(nodeList);
      applyCachedProbes(nodeList);
      await probeNodes(nodeList, true);
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
    setNotice(null);
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
      setNotice(`Cluster "${trimmed}" saved`);
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
      {notice ? <SuccessModal message={notice} onClose={() => setNotice(null)} /> : null}

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
                  const models = probe?.status.models ?? node.statusCache?.models ?? node.lastOpenAICheck?.models ?? [];
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
                        <span className="flex flex-wrap items-center gap-2">
                          {probe?.engine ? (
                            <StatusIcon kind={probe.engine.running ? 'running' : 'stopped'} />
                          ) : probe ? (
                            <span className="muted">—</span>
                          ) : (
                            <span className="muted">…</span>
                          )}
                          <button
                            type="button"
                            className="toggle stat-check-btn"
                            onClick={(event) => {
                              event.stopPropagation();
                              setParamsNode(node);
                            }}
                          >
                            Params
                          </button>
                        </span>
                      </td>
                      <td>
                        {probe ? (
                          <StatusIcon kind={probe.status.openai === 'up' ? 'up' : 'down'} />
                        ) : node.lastOpenAICheck ? (
                          <StatusIcon kind={node.lastOpenAICheck.openai === 'up' ? 'up' : 'down'} />
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td className="muted">
                        {probe || node.statusCache || node.lastOpenAICheck ? (
                          <ModelRadios models={models} />
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              : null}
          </tbody>
        </table>
      </div>

      {editing ? (
        <Modal title="Edit cluster" wide onClose={() => setEditing(false)}>
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
              <textarea
                value={editDescription}
                onChange={(event) => setEditDescription(event.target.value)}
                className="field-input"
                placeholder="optional"
                rows={4}
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

      {paramsNode ? <EngineParamsModal node={paramsNode} onClose={() => setParamsNode(null)} /> : null}
    </div>
  );
}
