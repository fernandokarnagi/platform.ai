import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import ErrorBanner from '@components/ErrorBanner';
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

function Badge({ ok, on, off }: { ok: boolean; on: string; off: string }) {
  return (
    <span
      className={[
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        ok ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600',
      ].join(' ')}
    >
      {ok ? on : off}
    </span>
  );
}

export default function ClusterDetailScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [cluster, setCluster] = useState<Cluster | null>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [probes, setProbes] = useState<Record<string, NodeProbe>>({});
  const [loading, setLoading] = useState(true);
  const [probing, setProbing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-8">
      <div>
        <Link to="/" className="text-sm text-blue-600 hover:underline">
          ← Clusters
        </Link>
        <div className="mt-3 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">{cluster?.name ?? 'Cluster'}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {cluster ? `${cluster.engine}${cluster.description ? ` · ${cluster.description}` : ''}` : ' '}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void handleRefresh()}
              disabled={loading || probing}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
            >
              {probing ? 'Probing…' : 'Refresh'}
            </button>
            <button
              type="button"
              onClick={() => id && navigate(`/clusters/${id}/nodes/new`)}
              className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Register node
            </button>
          </div>
        </div>
      </div>

      {error ? <ErrorBanner message={error} /> : null}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Host</th>
              <th className="px-4 py-3 font-medium">SSH</th>
              <th className="px-4 py-3 font-medium">Engine</th>
              <th className="px-4 py-3 font-medium">OpenAI</th>
              <th className="px-4 py-3 font-medium">Current model</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            ) : null}
            {!loading && nodes.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  No nodes yet. Register a node to start.
                </td>
              </tr>
            ) : null}
            {!loading
              ? nodes.map((node) => {
                  const probe = probes[node.id];
                  const currentModel = probe?.status.models.join(', ') || '—';
                  return (
                    <tr
                      key={node.id}
                      className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                      onClick={() => navigate(`/nodes/${node.id}`)}
                    >
                      <td className="px-4 py-3 font-medium text-slate-900">{node.name}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {node.host}:{node.sshPort}
                      </td>
                      <td className="px-4 py-3">
                        {probe ? (
                          <Badge ok={probe.status.ssh === 'up'} on="up" off="down" />
                        ) : (
                          <span className="text-slate-400">…</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {probe?.engine ? (
                          <Badge ok={probe.engine.running} on="running" off="stopped" />
                        ) : probe ? (
                          <span className="text-slate-400">—</span>
                        ) : (
                          <span className="text-slate-400">…</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {probe ? (
                          <Badge ok={probe.status.openai === 'up'} on="up" off="down" />
                        ) : (
                          <span className="text-slate-400">…</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{probe ? currentModel : '…'}</td>
                    </tr>
                  );
                })
              : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
