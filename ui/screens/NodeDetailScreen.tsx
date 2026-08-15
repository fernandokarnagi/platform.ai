import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import ErrorBanner from '@components/ErrorBanner';
import { nodeService } from '@services/nodeService';
import type {
  ChatIn,
  ChatMessage,
  DownloadModelIn,
  EngineStatus,
  Node,
  NodeStatus,
  RemoteModel,
} from '@/types';

const inputClass =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500';

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

function Section({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
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

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatStamp(iso: string): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

function parseOptionalNumber(raw: string, label: string): { ok: true; value?: number } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true };
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return { ok: false, error: `${label} must be a number` };
  return { ok: true, value: n };
}

function parseOptionalInt(raw: string, label: string): { ok: true; value?: number } | { ok: false; error: string } {
  const parsed = parseOptionalNumber(raw, label);
  if (!parsed.ok) return parsed;
  if (parsed.value === undefined) return parsed;
  if (!Number.isInteger(parsed.value)) return { ok: false, error: `${label} must be an integer` };
  return parsed;
}

function assistantContent(reply: { choices?: Array<{ message?: ChatMessage }> }): string {
  const content = reply.choices?.[0]?.message?.content;
  if (typeof content === 'string' && content.length > 0) return content;
  return '(empty reply)';
}

export default function NodeDetailScreen() {
  const { id } = useParams<{ id: string }>();

  const [node, setNode] = useState<Node | null>(null);
  const [status, setStatus] = useState<NodeStatus | null>(null);
  const [engine, setEngine] = useState<EngineStatus | null>(null);
  const [models, setModels] = useState<RemoteModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [busy, setBusy] = useState<'start' | 'stop' | 'restart' | 'download' | 'delete' | 'chat' | null>(null);

  const [startOpen, setStartOpen] = useState(false);
  const [startFilename, setStartFilename] = useState('');
  const [startModelsLoading, setStartModelsLoading] = useState(false);

  const [downloadOpen, setDownloadOpen] = useState(false);
  const [downloadSource, setDownloadSource] = useState<'huggingface' | 'url'>('huggingface');
  const [downloadRepo, setDownloadRepo] = useState('');
  const [downloadFilename, setDownloadFilename] = useState('');
  const [downloadUrl, setDownloadUrl] = useState('');
  const [downloadToken, setDownloadToken] = useState('');

  const [chatModel, setChatModel] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [temperature, setTemperature] = useState('');
  const [topP, setTopP] = useState('');
  const [maxTokens, setMaxTokens] = useState('');

  const applyStatus = useCallback((next: NodeStatus) => {
    setStatus(next);
    setChatModel((current) => {
      if (current && next.models.includes(current)) return current;
      return next.models[0] ?? '';
    });
  }, []);

  const load = useCallback(
    async (mode: 'full' | 'refresh' = 'full') => {
      if (!id) {
        setError('Missing node id');
        setLoading(false);
        return;
      }
      if (mode === 'full') setLoading(true);
      else setRefreshing(true);
      setError(null);
      try {
        const nodeData = await nodeService.get(id);
        setNode(nodeData);

        const details: string[] = [];
        const [statusRes, engineRes, modelsRes] = await Promise.allSettled([
          nodeService.status(id),
          nodeService.engine(id),
          nodeService.listModels(id),
        ]);

        if (statusRes.status === 'fulfilled') {
          applyStatus(statusRes.value);
          if (statusRes.value.detail) details.push(statusRes.value.detail);
        } else {
          const detail = errorMessage(statusRes.reason);
          applyStatus({ ssh: 'down', openai: 'down', models: [], detail });
          details.push(detail);
        }

        if (engineRes.status === 'fulfilled') {
          setEngine(engineRes.value);
        } else {
          setEngine(null);
          details.push(errorMessage(engineRes.reason));
        }

        if (modelsRes.status === 'fulfilled') {
          setModels(modelsRes.value);
        } else {
          setModels([]);
          details.push(errorMessage(modelsRes.reason));
        }

        setError(details.length ? details.join(' · ') : null);
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [id, applyStatus],
  );

  useEffect(() => {
    void load('full');
  }, [load]);

  async function refreshAfterEngine() {
    if (!id) return;
    const details: string[] = [];
    const [statusRes, engineRes] = await Promise.allSettled([
      nodeService.status(id),
      nodeService.engine(id),
    ]);
    if (statusRes.status === 'fulfilled') {
      applyStatus(statusRes.value);
      if (statusRes.value.detail) details.push(statusRes.value.detail);
    } else {
      details.push(errorMessage(statusRes.reason));
    }
    if (engineRes.status === 'fulfilled') {
      setEngine(engineRes.value);
    } else {
      details.push(errorMessage(engineRes.reason));
    }
    if (details.length) setError(details.join(' · '));
  }

  async function openStart() {
    if (!id) return;
    setStartOpen(true);
    setStartModelsLoading(true);
    setError(null);
    try {
      const list = await nodeService.listModels(id);
      setModels(list);
      setStartFilename((current) => {
        if (current && list.some((item) => item.name === current)) return current;
        return list[0]?.name ?? '';
      });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setStartModelsLoading(false);
    }
  }

  async function handleStart(event: FormEvent) {
    event.preventDefault();
    if (!id || !startFilename) {
      setError('Pick a GGUF to start');
      return;
    }
    setBusy('start');
    setError(null);
    try {
      setEngine(await nodeService.start(id, startFilename));
      setStartOpen(false);
      await refreshAfterEngine();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleStop() {
    if (!id) return;
    setBusy('stop');
    setError(null);
    try {
      setEngine(await nodeService.stop(id));
      await refreshAfterEngine();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleRestart() {
    if (!id) return;
    setBusy('restart');
    setError(null);
    try {
      setEngine(await nodeService.restart(id));
      await refreshAfterEngine();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  function openDownload() {
    setDownloadSource('huggingface');
    setDownloadRepo('');
    setDownloadFilename('');
    setDownloadUrl('');
    setDownloadToken('');
    setDownloadOpen(true);
    setError(null);
  }

  async function handleDownload(event: FormEvent) {
    event.preventDefault();
    if (!id) return;
    const payload: DownloadModelIn =
      downloadSource === 'huggingface'
        ? {
            source: 'huggingface',
            repo: downloadRepo.trim(),
            filename: downloadFilename.trim(),
            hfToken: downloadToken.trim() || undefined,
          }
        : {
            source: 'url',
            url: downloadUrl.trim(),
            filename: downloadFilename.trim() || undefined,
          };
    if (payload.source === 'huggingface' && (!payload.repo || !payload.filename)) {
      setError('Hugging Face repo and filename are required');
      return;
    }
    if (payload.source === 'url' && !payload.url) {
      setError('URL is required');
      return;
    }
    setBusy('download');
    setError(null);
    try {
      await nodeService.downloadModel(id, payload);
      setDownloadOpen(false);
      setModels(await nodeService.listModels(id));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete(filename: string) {
    if (!id) return;
    if (!window.confirm(`Delete model "${filename}" from this node?`)) return;
    setBusy('delete');
    setError(null);
    try {
      await nodeService.deleteModel(id, filename);
      setModels((current) => current.filter((item) => item.name !== filename));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleChat(event: FormEvent) {
    event.preventDefault();
    if (!id) return;
    const text = draft.trim();
    if (!text) return;
    if (!chatModel) {
      setError('No served model to chat with');
      return;
    }
    const temp = parseOptionalNumber(temperature, 'temperature');
    const p = parseOptionalNumber(topP, 'topP');
    const tokens = parseOptionalInt(maxTokens, 'maxTokens');
    if (!temp.ok) {
      setError(temp.error);
      return;
    }
    if (!p.ok) {
      setError(p.error);
      return;
    }
    if (!tokens.ok) {
      setError(tokens.error);
      return;
    }

    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content: text }];
    const payload: ChatIn = { model: chatModel, messages: nextMessages };
    if (temp.value !== undefined) payload.temperature = temp.value;
    if (p.value !== undefined) payload.topP = p.value;
    if (tokens.value !== undefined) payload.maxTokens = tokens.value;

    setMessages(nextMessages);
    setDraft('');
    setBusy('chat');
    setError(null);
    try {
      const reply = await nodeService.chat(id, payload);
      setMessages([...nextMessages, { role: 'assistant', content: assistantContent(reply) }]);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  const running = Boolean(engine?.running);
  const backTo = node ? `/clusters/${node.clusterId}` : '/';
  const served = status?.models ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-8">
      <div>
        <Link to={backTo} className="text-sm text-blue-600 hover:underline">
          ← {node ? 'Cluster' : 'Clusters'}
        </Link>
        <div className="mt-3 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">{node?.name ?? 'Node'}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {node ? `${node.host}:${node.sshPort} · ${node.listenHost}:${node.listenPort}` : ' '}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void load('refresh')}
              disabled={loading || refreshing}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
            >
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
            {id ? (
              <Link
                to={`/nodes/${id}/edit`}
                className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Edit node
              </Link>
            ) : null}
          </div>
        </div>
      </div>

      {error ? <ErrorBanner message={error} /> : null}

      {loading ? <p className="text-sm text-slate-500">Loading…</p> : null}

      {!loading ? (
        <>
          <Section title="Status">
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">SSH</dt>
                <dd className="mt-1">
                  {status ? <Badge ok={status.ssh === 'up'} on="up" off="down" /> : <span className="text-slate-400">—</span>}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Engine</dt>
                <dd className="mt-1 flex flex-wrap items-center gap-2">
                  {engine ? <Badge ok={engine.running} on="running" off="stopped" /> : <span className="text-slate-400">—</span>}
                  <span className="text-sm text-slate-600">pid {engine?.pid ?? '—'}</span>
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">OpenAI</dt>
                <dd className="mt-1">
                  {status ? (
                    <Badge ok={status.openai === 'up'} on="up" off="down" />
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Served models</dt>
                <dd className="mt-1 text-sm text-slate-800">{served.length ? served.join(', ') : '—'}</dd>
              </div>
            </dl>
          </Section>

          <Section
            title="Engine"
            actions={
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void openStart()}
                  disabled={running || busy !== null}
                  className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  Start
                </button>
                <button
                  type="button"
                  onClick={() => void handleStop()}
                  disabled={!running || busy !== null}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-60"
                >
                  {busy === 'stop' ? 'Stopping…' : 'Stop'}
                </button>
                <button
                  type="button"
                  onClick={() => void handleRestart()}
                  disabled={busy !== null}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-60"
                >
                  {busy === 'restart' ? 'Restarting…' : 'Restart'}
                </button>
              </div>
            }
          >
            {engine?.lastStart ? (
              <p className="text-sm text-slate-600">
                Last start {engine.lastStart.modelFilename}
                {engine.lastStart.startedAt ? ` · ${formatStamp(engine.lastStart.startedAt)}` : ''}
              </p>
            ) : (
              <p className="text-sm text-slate-500">No previous start. Pick a GGUF to launch llama-server.</p>
            )}
          </Section>

          <Section
            title="Models"
            actions={
              <button
                type="button"
                onClick={openDownload}
                disabled={busy !== null}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                Download
              </button>
            }
          >
            <div className="overflow-hidden rounded-md border border-slate-200">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">File</th>
                    <th className="px-4 py-3 font-medium">Size</th>
                    <th className="px-4 py-3 font-medium">Modified</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {models.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                        No GGUF files in {node?.modelDir ?? '~/models'}.
                      </td>
                    </tr>
                  ) : (
                    models.map((model) => (
                      <tr key={model.name} className="border-t border-slate-100">
                        <td className="px-4 py-3 font-medium text-slate-900">{model.name}</td>
                        <td className="px-4 py-3 text-slate-600">{formatBytes(model.sizeBytes)}</td>
                        <td className="px-4 py-3 text-slate-600">{formatStamp(model.mtime)}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            disabled={busy !== null}
                            className="rounded px-2 py-1 text-red-700 hover:bg-red-50 disabled:opacity-60"
                            onClick={() => void handleDelete(model.name)}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="Chat">
            <div className="grid gap-4 sm:grid-cols-4">
              <label className="block text-sm sm:col-span-2">
                <span className="mb-1 block font-medium text-slate-700">Model</span>
                <select
                  value={chatModel}
                  onChange={(event) => setChatModel(event.target.value)}
                  className={inputClass}
                  disabled={served.length === 0}
                >
                  {served.length === 0 ? <option value="">No served models</option> : null}
                  {served.map((modelId) => (
                    <option key={modelId} value={modelId}>
                      {modelId}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-700">Temperature</span>
                <input
                  value={temperature}
                  onChange={(event) => setTemperature(event.target.value)}
                  className={inputClass}
                  placeholder="optional"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-700">topP</span>
                <input
                  value={topP}
                  onChange={(event) => setTopP(event.target.value)}
                  className={inputClass}
                  placeholder="optional"
                />
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="mb-1 block font-medium text-slate-700">maxTokens</span>
                <input
                  value={maxTokens}
                  onChange={(event) => setMaxTokens(event.target.value)}
                  className={inputClass}
                  placeholder="optional"
                />
              </label>
            </div>

            <div className="min-h-48 space-y-3 rounded-md border border-slate-200 bg-slate-50 p-4">
              {messages.length === 0 ? (
                <p className="text-sm text-slate-500">No messages yet. Send a turn after the engine is up.</p>
              ) : (
                messages.map((message, index) => (
                  <div
                    key={`${message.role}-${index}`}
                    className={message.role === 'user' ? 'text-right' : 'text-left'}
                  >
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{message.role}</p>
                    <p className="mt-1 inline-block max-w-full whitespace-pre-wrap rounded-md bg-white px-3 py-2 text-sm text-slate-800 shadow-sm">
                      {message.content}
                    </p>
                  </div>
                ))
              )}
            </div>

            <form className="flex flex-col gap-3 sm:flex-row" onSubmit={(event) => void handleChat(event)}>
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                rows={2}
                className={`${inputClass} flex-1`}
                placeholder="Message"
              />
              <button
                type="submit"
                disabled={busy !== null || !chatModel || !draft.trim()}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {busy === 'chat' ? 'Sending…' : 'Send'}
              </button>
            </form>
          </Section>
        </>
      ) : null}

      {startOpen ? (
        <Modal title="Start llama-server" onClose={() => busy === null && setStartOpen(false)}>
          <form className="space-y-4" onSubmit={(event) => void handleStart(event)}>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">GGUF</span>
              <select
                value={startFilename}
                onChange={(event) => setStartFilename(event.target.value)}
                className={inputClass}
                disabled={startModelsLoading || models.length === 0}
              >
                {startModelsLoading ? <option value="">Loading…</option> : null}
                {!startModelsLoading && models.length === 0 ? <option value="">No GGUF files</option> : null}
                {models.map((model) => (
                  <option key={model.name} value={model.name}>
                    {model.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setStartOpen(false)}
                disabled={busy !== null}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy !== null || !startFilename}
                className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {busy === 'start' ? 'Starting…' : 'Start'}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {downloadOpen ? (
        <Modal title="Download model" onClose={() => busy === null && setDownloadOpen(false)}>
          <form className="space-y-4" onSubmit={(event) => void handleDownload(event)}>
            <fieldset className="space-y-2">
              <legend className="mb-1 text-sm font-medium text-slate-700">Source</legend>
              <label className="mr-4 inline-flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="download-source"
                  checked={downloadSource === 'huggingface'}
                  onChange={() => setDownloadSource('huggingface')}
                />
                Hugging Face
              </label>
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="download-source"
                  checked={downloadSource === 'url'}
                  onChange={() => setDownloadSource('url')}
                />
                URL
              </label>
            </fieldset>
            {downloadSource === 'huggingface' ? (
              <>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-700">Repo</span>
                  <input
                    value={downloadRepo}
                    onChange={(event) => setDownloadRepo(event.target.value)}
                    className={inputClass}
                    placeholder="org/model"
                    autoFocus
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-700">Filename</span>
                  <input
                    value={downloadFilename}
                    onChange={(event) => setDownloadFilename(event.target.value)}
                    className={inputClass}
                    placeholder="model.Q4_K_M.gguf"
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-700">HF token</span>
                  <input
                    type="password"
                    value={downloadToken}
                    onChange={(event) => setDownloadToken(event.target.value)}
                    className={inputClass}
                    placeholder="optional — uses node token if empty"
                    autoComplete="off"
                  />
                </label>
              </>
            ) : (
              <>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-700">URL</span>
                  <input
                    value={downloadUrl}
                    onChange={(event) => setDownloadUrl(event.target.value)}
                    className={inputClass}
                    placeholder="https://…/model.gguf"
                    autoFocus
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-700">Filename</span>
                  <input
                    value={downloadFilename}
                    onChange={(event) => setDownloadFilename(event.target.value)}
                    className={inputClass}
                    placeholder="optional — last path segment"
                  />
                </label>
              </>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDownloadOpen(false)}
                disabled={busy !== null}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy !== null}
                className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {busy === 'download' ? 'Downloading…' : 'Download'}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
