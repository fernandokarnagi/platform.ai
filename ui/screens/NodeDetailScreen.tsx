import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import ErrorBanner from '@components/ErrorBanner';
import StatusIcon from '@components/StatusIcon';
import { useClusters } from '@contexts/ClusterContext';
import { formatDateTime, formatFileTime } from '@/lib/format';
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

const inputClass = 'field-input';

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function Section({
  title,
  actions,
  children,
  className,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card space-y-4${className ? ` ${className}` : ''}`}>
      <div className="card-head">
        <h2 className="card-title">{title}</h2>
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

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatStamp(iso: string): string {
  return formatDateTime(iso);
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export default function NodeDetailScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { refresh } = useClusters();

  const [node, setNode] = useState<Node | null>(null);
  const [status, setStatus] = useState<NodeStatus | null>(null);
  const [engine, setEngine] = useState<EngineStatus | null>(null);
  const [models, setModels] = useState<RemoteModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [busy, setBusy] = useState<
    'start' | 'stop' | 'restart' | 'download' | 'delete' | 'delete-node' | 'chat' | null
  >(null);

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
  const [topK, setTopK] = useState('');
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

  async function refreshAfterEngine(waitForOpenAI = false) {
    if (!id) return;
    const details: string[] = [];
    try {
      setEngine(await nodeService.engine(id));
    } catch (err) {
      details.push(errorMessage(err));
    }

    const attempts = waitForOpenAI ? 5 : 1;
    let lastStatus: NodeStatus | undefined;
    let lastStatusError: string | undefined;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (attempt > 0) await sleep(1000);
      try {
        lastStatus = await nodeService.status(id);
        lastStatusError = undefined;
        applyStatus(lastStatus);
        if (!waitForOpenAI || lastStatus.openai === 'up') break;
      } catch (err) {
        lastStatusError = errorMessage(err);
      }
    }

    if (lastStatusError) details.push(lastStatusError);
    else if (lastStatus?.detail) details.push(lastStatus.detail);
    setError(details.length ? details.join(' · ') : null);
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
      await refreshAfterEngine(true);
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
      await refreshAfterEngine(true);
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

  async function handleDeleteNode() {
    if (!id || !node) return;
    if (!window.confirm(`Delete node "${node.name}"?`)) return;
    setBusy('delete-node');
    setError(null);
    try {
      await nodeService.remove(id);
      await refresh();
      navigate(node.clusterId ? `/clusters/${node.clusterId}` : '/');
    } catch (err) {
      setError(errorMessage(err));
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
    const k = parseOptionalInt(topK, 'topK');
    const tokens = parseOptionalInt(maxTokens, 'maxTokens');
    if (!temp.ok) {
      setError(temp.error);
      return;
    }
    if (!p.ok) {
      setError(p.error);
      return;
    }
    if (!k.ok) {
      setError(k.error);
      return;
    }
    if (!tokens.ok) {
      setError(tokens.error);
      return;
    }

    const previousDraft = draft;
    const previousMessages = messages;
    const nextMessages: ChatMessage[] = [...previousMessages, { role: 'user', content: text }];
    const payload: ChatIn = { model: chatModel, messages: nextMessages };
    if (temp.value !== undefined) payload.temperature = temp.value;
    if (p.value !== undefined) payload.topP = p.value;
    if (k.value !== undefined) payload.topK = k.value;
    if (tokens.value !== undefined) payload.maxTokens = tokens.value;

    setMessages(nextMessages);
    setDraft('');
    setBusy('chat');
    setError(null);
    try {
      const reply = await nodeService.chat(id, payload);
      setMessages([...nextMessages, { role: 'assistant', content: assistantContent(reply) }]);
    } catch (err) {
      setMessages(previousMessages);
      setDraft(previousDraft);
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  const running = Boolean(engine?.running);
  const backTo = node ? `/clusters/${node.clusterId}` : '/';
  const served = status?.models ?? [];

  return (
    <div className="page page-wide space-y-5">
      <div>
        <Link to={backTo} className="back">
          ← {node ? 'Cluster' : 'Clusters'}
        </Link>
        <div className="page-head mt-3">
          <div>
            <h1>{node?.name ?? 'Node'}</h1>
            <p className="page-sub">
              {node
                ? node.nodeType === 'local'
                  ? `localhost · ${node.listenHost}:${node.listenPort}`
                  : `${node.host}:${node.sshPort} · ${node.listenHost}:${node.listenPort}`
                : ' '}
            </p>
          </div>
          <div className="page-actions">
            <button
              type="button"
              onClick={() => void load('refresh')}
              disabled={loading || refreshing}
              className="toggle"
            >
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
            {id ? (
              <Link to={`/nodes/${id}/edit`} className="toggle accent">
                Edit node
              </Link>
            ) : null}
            {id && node ? (
              <button
                type="button"
                className="toggle danger"
                disabled={busy === 'delete-node'}
                onClick={() => void handleDeleteNode()}
              >
                {busy === 'delete-node' ? 'Deleting…' : 'Delete node'}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {error ? <ErrorBanner message={error} /> : null}

      {loading ? <p className="muted">Loading…</p> : null}

      {!loading ? (
        <div className="node-layout">
          <Section title="Chat" className="node-chat">
            <form className="chat-compose" onSubmit={(event) => void handleChat(event)}>
              <div className="chat-params">
                <label className="chat-model">
                  <span className="field-label">Model</span>
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
                <label>
                  <span className="field-label">Temp</span>
                  <input
                    value={temperature}
                    onChange={(event) => setTemperature(event.target.value)}
                    className={inputClass}
                    placeholder="opt"
                  />
                </label>
                <label>
                  <span className="field-label">topP</span>
                  <input
                    value={topP}
                    onChange={(event) => setTopP(event.target.value)}
                    className={inputClass}
                    placeholder="opt"
                  />
                </label>
                <label>
                  <span className="field-label">topK</span>
                  <input
                    value={topK}
                    onChange={(event) => setTopK(event.target.value)}
                    className={inputClass}
                    placeholder="opt"
                  />
                </label>
                <label>
                  <span className="field-label">maxTokens</span>
                  <input
                    value={maxTokens}
                    onChange={(event) => setMaxTokens(event.target.value)}
                    className={inputClass}
                    placeholder="opt"
                  />
                </label>
              </div>
              <div className="chat-input">
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
                  className="toggle accent"
                >
                  {busy === 'chat' ? 'Sending…' : 'Send'}
                </button>
              </div>
            </form>
            <hr className="chat-rule" />
            <div className="chat-log">
              {messages.length === 0 ? (
                <p className="muted">No messages yet. Send a turn after the engine is up.</p>
              ) : (
                messages.map((message, index) => (
                  <div key={`${message.role}-${index}`} className={`event ${message.role}`}>
                    <div className="kind">{message.role}</div>
                    <div className="body">{message.content}</div>
                  </div>
                ))
              )}
            </div>
          </Section>

          <div className="node-side">
            <Section
              title="Status"
              actions={
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void openStart()}
                    disabled={running || busy !== null}
                    className="toggle accent"
                  >
                    Start
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleStop()}
                    disabled={!running || busy !== null}
                    className="toggle"
                  >
                    {busy === 'stop' ? 'Stopping…' : 'Stop'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleRestart()}
                    disabled={busy !== null}
                    className="toggle"
                  >
                    {busy === 'restart' ? 'Restarting…' : 'Restart'}
                  </button>
                </div>
              }
            >
              <dl className="stat-grid stat-grid-side">
                <div>
                  <dt className="stat-label">{node?.nodeType === 'local' ? 'Local' : 'SSH'}</dt>
                  <dd className="stat-value">
                    {status ? <StatusIcon kind={status.ssh === 'up' ? 'up' : 'down'} /> : <span className="muted">—</span>}
                  </dd>
                </div>
                <div>
                  <dt className="stat-label">Engine</dt>
                  <dd className="stat-value flex flex-wrap items-center gap-2">
                    {engine ? <StatusIcon kind={engine.running ? 'running' : 'stopped'} /> : <span className="muted">—</span>}
                    <span className="muted">pid {engine?.pid ?? '—'}</span>
                  </dd>
                </div>
                <div>
                  <dt className="stat-label">OpenAI</dt>
                  <dd className="stat-value">
                    {status ? <StatusIcon kind={status.openai === 'up' ? 'up' : 'down'} /> : <span className="muted">—</span>}
                  </dd>
                </div>
                <div>
                  <dt className="stat-label">Served models</dt>
                  <dd className="stat-value">{served.length ? served.join(', ') : '—'}</dd>
                </div>
              </dl>
              {engine?.lastStart ? (
                <p className="muted">
                  Last start {engine.lastStart.modelFilename}
                  {engine.lastStart.startedAt ? ` · ${formatStamp(engine.lastStart.startedAt)}` : ''}
                </p>
              ) : (
                <p className="muted">No previous start. Pick a GGUF to launch llama-server.</p>
              )}
            </Section>

            <Section
              title="Models"
              actions={
                <button
                  type="button"
                  onClick={openDownload}
                  disabled={busy !== null}
                  className="toggle accent"
                >
                  Download
                </button>
              }
            >
              {models.length === 0 ? (
                <p className="muted">No GGUF files in {node?.modelDir ?? '~/models'}.</p>
              ) : (
                <ul className="model-list">
                  {models.map((model) => (
                    <li key={model.name} className="model-row">
                      <div className="model-meta">
                        <div className="model-name">{model.name}</div>
                        <div className="muted">
                          {formatBytes(model.sizeBytes)} · {formatFileTime(model.mtime)}
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={busy !== null}
                        className="toggle danger"
                        onClick={() => void handleDelete(model.name)}
                      >
                        Delete
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>
        </div>
      ) : null}

      {startOpen ? (
        <Modal title="Start llama-server" onClose={() => busy === null && setStartOpen(false)}>
          <form onSubmit={(event) => void handleStart(event)}>
            <label>
              <span className="field-label">GGUF</span>
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
            <div className="modal-actions">
              <button type="button" onClick={() => setStartOpen(false)} disabled={busy !== null} className="toggle">
                Cancel
              </button>
              <button type="submit" disabled={busy !== null || !startFilename} className="toggle accent">
                {busy === 'start' ? 'Starting…' : 'Start'}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {downloadOpen ? (
        <Modal title="Download model" onClose={() => busy === null && setDownloadOpen(false)}>
          <form onSubmit={(event) => void handleDownload(event)}>
            <fieldset className="space-y-2">
              <legend className="field-label">Source</legend>
              <label className="mr-4 inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="download-source"
                  checked={downloadSource === 'huggingface'}
                  onChange={() => setDownloadSource('huggingface')}
                />
                Hugging Face
              </label>
              <label className="inline-flex items-center gap-2">
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
                <label>
                  <span className="field-label">Repo</span>
                  <input
                    value={downloadRepo}
                    onChange={(event) => setDownloadRepo(event.target.value)}
                    className={inputClass}
                    placeholder="org/model"
                    autoFocus
                  />
                </label>
                <label>
                  <span className="field-label">Filename</span>
                  <input
                    value={downloadFilename}
                    onChange={(event) => setDownloadFilename(event.target.value)}
                    className={inputClass}
                    placeholder="model.Q4_K_M.gguf"
                  />
                </label>
                <label>
                  <span className="field-label">HF token</span>
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
                <label>
                  <span className="field-label">URL</span>
                  <input
                    value={downloadUrl}
                    onChange={(event) => setDownloadUrl(event.target.value)}
                    className={inputClass}
                    placeholder="https://…/model.gguf"
                    autoFocus
                  />
                </label>
                <label>
                  <span className="field-label">Filename</span>
                  <input
                    value={downloadFilename}
                    onChange={(event) => setDownloadFilename(event.target.value)}
                    className={inputClass}
                    placeholder="optional — last path segment"
                  />
                </label>
              </>
            )}
            <div className="modal-actions">
              <button type="button" onClick={() => setDownloadOpen(false)} disabled={busy !== null} className="toggle">
                Cancel
              </button>
              <button type="submit" disabled={busy !== null} className="toggle accent">
                {busy === 'download' ? 'Downloading…' : 'Download'}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
