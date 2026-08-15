import { useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import ErrorBanner from '@components/ErrorBanner';
import { useClusters } from '@contexts/ClusterContext';
import { clusterService } from '@services/clusterService';
import type { Cluster } from '@/types';

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function formatDate(iso: string): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg bg-white shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export default function ClustersScreen() {
  const navigate = useNavigate();
  const { clusters, loading, error, setError, refresh } = useClusters();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Cluster | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  function openCreate() {
    setName('');
    setDescription('');
    setCreating(true);
    setError(null);
  }

  function openEdit(cluster: Cluster) {
    setEditing(cluster);
    setName(cluster.name);
    setError(null);
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
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleEdit(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Name is required');
      return;
    }
    setSaving(true);
    try {
      await clusterService.update(editing.id, { name: trimmed });
      setEditing(null);
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(cluster: Cluster) {
    if (cluster.nodeCount > 0) return;
    if (!window.confirm(`Delete cluster "${cluster.name}"?`)) return;
    try {
      await clusterService.remove(cluster.id);
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Clusters</h1>
          <p className="mt-1 text-sm text-slate-500">Inferencing clusters running llama.cpp</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Create cluster
        </button>
      </div>

      {error ? <ErrorBanner message={error} /> : null}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Engine</th>
              <th className="px-4 py-3 font-medium">Nodes</th>
              <th className="px-4 py-3 font-medium">Created</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && clusters.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            ) : null}
            {!loading && clusters.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  No clusters yet. Create one to register nodes.
                </td>
              </tr>
            ) : null}
            {clusters.map((cluster) => (
              <tr
                key={cluster.id}
                className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                onClick={() => navigate(`/clusters/${cluster.id}`)}
              >
                <td className="px-4 py-3 font-medium text-slate-900">{cluster.name}</td>
                <td className="px-4 py-3 text-slate-600">{cluster.engine}</td>
                <td className="px-4 py-3 text-slate-600">{cluster.nodeCount}</td>
                <td className="px-4 py-3 text-slate-600">{formatDate(cluster.createdAt)}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    className="mr-2 rounded px-2 py-1 text-slate-700 hover:bg-slate-100"
                    onClick={(event) => {
                      event.stopPropagation();
                      openEdit(cluster);
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={cluster.nodeCount > 0}
                    title={cluster.nodeCount > 0 ? 'Delete disabled while nodes exist' : 'Delete cluster'}
                    className="rounded px-2 py-1 text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent"
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleDelete(cluster);
                    }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {creating ? (
        <Modal title="Create cluster" onClose={() => setCreating(false)}>
          <form className="space-y-4" onSubmit={(event) => void handleCreate(event)}>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Name</span>
              <input
                autoFocus
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                placeholder="desk-macs"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Description</span>
              <input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                placeholder="optional"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Engine</span>
              <input
                value="llama.cpp"
                readOnly
                className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600"
              />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {saving ? 'Creating…' : 'Create'}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {editing ? (
        <Modal title="Edit cluster" onClose={() => setEditing(null)}>
          <form className="space-y-4" onSubmit={(event) => void handleEdit(event)}>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Name</span>
              <input
                autoFocus
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
