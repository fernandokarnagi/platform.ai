import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import EngineParamsModal from '@components/EngineParamsModal';
import ErrorBanner from '@components/ErrorBanner';
import ModelRadios from '@components/ModelRadios';
import StatusIcon from '@components/StatusIcon';
import { useClusters } from '@contexts/ClusterContext';
import { usefulDetail } from '@/lib/errors';
import { chatModelOptions, isModelServed, pickChatModel } from '@/lib/chatModel';
import { engineBinaryName, isVllm } from '@/lib/engine';
import { formatDateTime, formatFileTime } from '@/lib/format';
import { nodeService } from '@services/nodeService';
import type {
  ChatIn,
  ChatMessage,
  DownloadModelIn,
  EngineStatus,
  HfRepoFile,
  Node,
  NodeStatus,
  RemoteModel,
  StatusCheck,
} from '@/types';

type ChatTurn = ChatMessage & { at: string };

const inputClass = 'field-input';

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function newestFirst(text: string): string {
  const lines = text.split('\n');
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines.reverse().join('\n');
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
  const [modelsKnown, setModelsKnown] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [busy, setBusy] = useState<
    'start' | 'stop' | 'restart' | 'serve' | 'download' | 'delete' | 'delete-node' | 'chat' | null
  >(null);
  const [checking, setChecking] = useState<StatusCheck | null>(null);
  const [paramsOpen, setParamsOpen] = useState(false);

  const [downloadOpen, setDownloadOpen] = useState(false);
  const [downloadSource, setDownloadSource] = useState<'huggingface' | 'url'>('huggingface');
  const [downloadRepo, setDownloadRepo] = useState('');
  const [downloadFilename, setDownloadFilename] = useState('');
  const [downloadUrl, setDownloadUrl] = useState('');
  const [hfFiles, setHfFiles] = useState<HfRepoFile[]>([]);
  const [hfListError, setHfListError] = useState<string | null>(null);
  const [hfListing, setHfListing] = useState(false);

  const [chatModel, setChatModel] = useState('');
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const chatLogRef = useRef<HTMLDivElement | null>(null);
  const [logText, setLogText] = useState('');
  const [logMissing, setLogMissing] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [logFollow, setLogFollow] = useState(true);
  const [logLoading, setLogLoading] = useState(false);
  const logRef = useRef<HTMLPreElement | null>(null);

  const [draft, setDraft] = useState('');
  const [temperature, setTemperature] = useState('1.0');
  const [topP, setTopP] = useState('0.95');
  const [topK, setTopK] = useState('20');
  const [minP, setMinP] = useState('0.0');
  const [presencePenalty, setPresencePenalty] = useState('0.0');
  const [repetitionPenalty, setRepetitionPenalty] = useState('1.0');
  const [maxTokens, setMaxTokens] = useState('');

  const selectedModelRef = useRef('');
  selectedModelRef.current = node?.selectedModel || '';

  const applyStatus = useCallback((next: NodeStatus, preferred?: string) => {
    setStatus(next);
    setChatModel((current) =>
      pickChatModel(next.models, current, preferred ?? selectedModelRef.current),
    );
  }, []);

  const applyNodeCaches = useCallback(
    (nodeData: Node) => {
      const cache = nodeData.statusCache;
      if (cache) {
        applyStatus(
          {
            ssh: cache.ssh,
            openai: cache.openai,
            models: cache.models,
            detail: cache.detail ?? null,
            checkedAt: cache.checkedAt,
            cached: true,
            running: cache.running,
            pid: cache.pid,
          },
          nodeData.selectedModel,
        );
        setEngine({
          running: cache.running,
          pid: cache.pid,
          lastStart: nodeData.lastStart,
        });
      }
      if (nodeData.modelsCache) {
        setModels(nodeData.modelsCache.items);
        setModelsKnown(true);
      }
    },
    [applyStatus],
  );

  const hydrate = useCallback(
    async (live: boolean, doStatus: boolean, doModels: boolean) => {
      if (!id) return;
      const details: string[] = [];
      const jobs: Array<Promise<void>> = [];
      if (doStatus) {
        jobs.push(
          (async () => {
            try {
              const next = await nodeService.status(id, live);
              applyStatus(next);
              setEngine((current) => ({
                running: Boolean(next.running),
                pid: next.pid ?? null,
                lastStart: current?.lastStart ?? null,
              }));
              const statusDetail = usefulDetail(next.detail);
              if (statusDetail) details.push(statusDetail);
            } catch (err) {
              const detail = usefulDetail(errorMessage(err));
              if (detail) details.push(detail);
            }
          })(),
        );
      }
      if (doModels) {
        jobs.push(
          (async () => {
            try {
              setModels(await nodeService.listModels(id, live));
              setModelsKnown(true);
            } catch (err) {
              const failed = usefulDetail(errorMessage(err));
              if (failed) details.push(failed);
            }
          })(),
        );
      }
      await Promise.all(jobs);
      setError(details.length ? details.join(' · ') : null);
    },
    [id, applyStatus],
  );

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
      setModelsKnown(false);
      try {
        const nodeData = await nodeService.get(id);
        setNode(nodeData);
        applyNodeCaches(nodeData);
        if (mode === 'full') {
          setLoading(false);
          const staleStatus = !nodeData.statusCache?.fresh;
          const staleModels = !nodeData.modelsCache?.fresh;
          if (staleStatus || staleModels) {
            void hydrate(false, staleStatus, staleModels);
          }
          return;
        }
        await hydrate(true, true, true);
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [id, applyNodeCaches, hydrate],
  );

  useEffect(() => {
    void load('full');
  }, [load]);

  const fetchLogs = useCallback(async () => {
    if (!id) return;
    setLogLoading(true);
    try {
      const logs = await nodeService.logs(id);
      setLogText(logs.missing ? logs.text : newestFirst(logs.text));
      setLogMissing(logs.missing);
    } catch (err) {
      setLogText(errorMessage(err));
      setLogMissing(false);
    } finally {
      setLogLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!showLogs) return;
    void fetchLogs();
  }, [showLogs, fetchLogs]);

  useEffect(() => {
    if (!showLogs || !logFollow) return;
    const timer = window.setInterval(() => {
      void fetchLogs();
    }, 2000);
    return () => window.clearInterval(timer);
  }, [showLogs, logFollow, fetchLogs]);

  useEffect(() => {
    if (!logFollow) return;
    const el = logRef.current;
    if (!el) return;
    el.scrollTop = 0;
  }, [logText, logFollow]);

  async function refreshAfterEngine(waitForOpenAI = false) {
    if (!id) return;
    const details: string[] = [];
    const attempts = waitForOpenAI ? 5 : 1;
    let lastStatus: NodeStatus | undefined;
    let lastStatusError: string | undefined;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (attempt > 0) await sleep(1000);
      try {
        lastStatus = await nodeService.status(id, true);
        lastStatusError = undefined;
        applyStatus(lastStatus);
        setEngine((current) => ({
          running: Boolean(lastStatus?.running),
          pid: lastStatus?.pid ?? null,
          lastStart: current?.lastStart ?? node?.lastStart ?? null,
        }));
        if (!waitForOpenAI || lastStatus.openai === 'up') break;
      } catch (err) {
        lastStatusError = errorMessage(err);
      }
    }

    if (lastStatusError) {
      const failed = usefulDetail(lastStatusError);
      if (failed) details.push(failed);
    } else {
      const statusDetail = usefulDetail(lastStatus?.detail);
      if (statusDetail) details.push(statusDetail);
    }
    setError(details.length ? details.join(' · ') : null);
  }

  async function handleStart() {
    if (!id) return;
    const vllm = isVllm(node?.engine);
    const model = node?.selectedModel || (vllm && models.length === 1 ? models[0].name : '');
    if (vllm && !model) {
      setError('Select a model to serve before starting vLLM');
      return;
    }
    setBusy('start');
    setError(null);
    try {
      setEngine(await nodeService.start(id, vllm ? model : undefined));
      await refreshAfterEngine(true);
      await fetchLogs();
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
      await fetchLogs();
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
      await fetchLogs();
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
    setHfFiles([]);
    setHfListError(null);
    setDownloadOpen(true);
    setError(null);
  }

  useEffect(() => {
    if (!downloadOpen || downloadSource !== 'huggingface' || !id) return;
    const repo = downloadRepo.trim();
    if (!repo.includes('/')) {
      setHfFiles([]);
      setHfListError(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        setHfListing(true);
        setHfListError(null);
        try {
          const listed = await nodeService.listHfFiles(id, repo);
          if (cancelled) return;
          setHfFiles(listed.files);
          setDownloadFilename((current) => {
            if (current && listed.files.some((item) => item.name === current || item.name.endsWith(`/${current}`))) {
              return current;
            }
            const tag = (listed.quant || '').toUpperCase();
            if (tag) {
              const match = listed.files.find((item) => item.name.toUpperCase().endsWith(`-${tag}.GGUF`));
              if (match) return match.name;
            }
            return listed.files[0]?.name ?? '';
          });
        } catch (err) {
          if (cancelled) return;
          setHfFiles([]);
          setHfListError(errorMessage(err));
        } finally {
          if (!cancelled) setHfListing(false);
        }
      })();
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [downloadOpen, downloadSource, downloadRepo, id]);

  async function handleDownload(event: FormEvent) {
    event.preventDefault();
    if (!id) return;
    const payload: DownloadModelIn =
      downloadSource === 'huggingface'
        ? {
            source: 'huggingface',
            repo: downloadRepo.trim(),
            filename: downloadFilename.trim(),
          }
        : {
            source: 'url',
            url: downloadUrl.trim(),
            filename: downloadFilename.trim() || undefined,
          };
    if (payload.source === 'huggingface' && !payload.repo) {
      setError('Hugging Face repo is required');
      return;
    }
    if (payload.source === 'huggingface' && !isVllm(node?.engine) && !payload.filename) {
      setError('Choose a GGUF file from the repo');
      return;
    }
    if (payload.source === 'url' && !payload.url) {
      setError('URL is required');
      return;
    }
    setError(null);
    try {
      await nodeService.downloadModel(id, payload);
      setDownloadOpen(false);
      navigate('/downloads');
    } catch (err) {
      setError(errorMessage(err));
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

  async function handleSelectModel(name: string) {
    if (!id || !node) return;
    const running = Boolean(engine?.running);
    if (running) {
      const ok = window.confirm(`Serve ${name}? This restarts the engine and unloads the current model.`);
      if (!ok) return;
    }
    setError(null);
    setBusy('serve');
    try {
      const updated = await nodeService.update(id, { selectedModel: name });
      setNode(updated);
      setChatModel((current) => pickChatModel(status?.models ?? [], current, name));
      if (running) {
        setEngine(await nodeService.restart(id));
      } else {
        setEngine(await nodeService.start(id, name));
      }
      await refreshAfterEngine(true);
      await fetchLogs();
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
    const k = parseOptionalInt(topK, 'topK');
    const min = parseOptionalNumber(minP, 'minP');
    const presence = parseOptionalNumber(presencePenalty, 'presencePenalty');
    const repeat = parseOptionalNumber(repetitionPenalty, 'repetitionPenalty');
    const tokens = parseOptionalInt(maxTokens, 'maxTokens');
    const parsed = [temp, p, k, min, presence, repeat, tokens];
    const failed = parsed.find((item) => !item.ok);
    if (failed && !failed.ok) {
      setError(failed.error);
      return;
    }

    const previousDraft = draft;
    const previousMessages = messages;
    const userTurn: ChatTurn = { role: 'user', content: text, at: new Date().toISOString() };
    const nextMessages = [...previousMessages, userTurn];
    const payload: ChatIn = {
      model: chatModel,
      messages: nextMessages.map(({ role, content }) => ({ role, content })),
    };
    if (temp.ok && temp.value !== undefined) payload.temperature = temp.value;
    if (p.ok && p.value !== undefined) payload.topP = p.value;
    if (k.ok && k.value !== undefined) payload.topK = k.value;
    if (min.ok && min.value !== undefined) payload.minP = min.value;
    if (presence.ok && presence.value !== undefined) payload.presencePenalty = presence.value;
    if (repeat.ok && repeat.value !== undefined) payload.repetitionPenalty = repeat.value;
    if (tokens.ok && tokens.value !== undefined) payload.maxTokens = tokens.value;

    setMessages(nextMessages);
    setDraft('');
    setBusy('chat');
    setError(null);
    try {
      const reply = await nodeService.chat(id, payload);
      setMessages([
        ...nextMessages,
        { role: 'assistant', content: assistantContent(reply), at: new Date().toISOString() },
      ]);
    } catch (err) {
      setMessages(previousMessages);
      setDraft(previousDraft);
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    const el = chatLogRef.current;
    if (!el) return;
    el.scrollTop = 0;
  }, [messages]);

  function handleClearChat() {
    setMessages([]);
  }

  async function handleCheck(part: StatusCheck) {
    if (!id) return;
    setChecking(part);
    setError(null);
    try {
      const next = await nodeService.status(id, false, part);
      applyStatus(next);
      setEngine((current) => ({
        running: Boolean(next.running),
        pid: next.pid ?? null,
        lastStart: current?.lastStart ?? node?.lastStart ?? null,
      }));
      setError(usefulDetail(next.detail));
    } catch (err) {
      setError(usefulDetail(errorMessage(err)));
    } finally {
      setChecking(null);
    }
  }

  const running = Boolean(engine?.running);
  const vllm = isVllm(node?.engine);
  const backTo = node ? `/clusters/${node.clusterId}` : '/';
  const served = status?.models ?? [];
  const chatOptions = chatModelOptions(served, node?.selectedModel);
  const visibleMessages = [...messages].reverse();

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
            <button
              type="button"
              className={showLogs ? 'toggle accent' : 'toggle'}
              onClick={() => setShowLogs((current) => !current)}
            >
              {showLogs ? 'Hide logs' : 'Show logs'}
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
        <div className={showLogs ? 'node-layout with-logs' : 'node-layout'}>
          <Section
            title="Chat"
            className="node-chat"
            actions={
              <button
                type="button"
                className="toggle"
                disabled={messages.length === 0 || busy !== null}
                onClick={handleClearChat}
              >
                Clear chat
              </button>
            }
          >
            <form className="chat-compose" onSubmit={(event) => void handleChat(event)}>
              <div className="chat-params">
                <label className="chat-model">
                  <span className="field-label">Model</span>
                  <select
                    value={chatModel}
                    onChange={(event) => setChatModel(event.target.value)}
                    className={inputClass}
                    disabled={chatOptions.length === 0}
                  >
                    {chatOptions.length === 0 ? <option value="">No served models</option> : null}
                    {chatOptions.map((modelId) => (
                      <option key={modelId} value={modelId}>
                        {modelId}
                      </option>
                    ))}
                  </select>
                </label>
                <label title="temperature">
                  <span className="field-label">Temp</span>
                  <input
                    value={temperature}
                    onChange={(event) => setTemperature(event.target.value)}
                    className={inputClass}
                  />
                </label>
                <label title="top_p">
                  <span className="field-label">topP</span>
                  <input
                    value={topP}
                    onChange={(event) => setTopP(event.target.value)}
                    className={inputClass}
                  />
                </label>
                <label title="top_k">
                  <span className="field-label">topK</span>
                  <input
                    value={topK}
                    onChange={(event) => setTopK(event.target.value)}
                    className={inputClass}
                  />
                </label>
                <label title="min_p">
                  <span className="field-label">minP</span>
                  <input
                    value={minP}
                    onChange={(event) => setMinP(event.target.value)}
                    className={inputClass}
                  />
                </label>
                <label title="presence_penalty">
                  <span className="field-label">pres</span>
                  <input
                    value={presencePenalty}
                    onChange={(event) => setPresencePenalty(event.target.value)}
                    className={inputClass}
                  />
                </label>
                <label title="repetition_penalty">
                  <span className="field-label">rep</span>
                  <input
                    value={repetitionPenalty}
                    onChange={(event) => setRepetitionPenalty(event.target.value)}
                    className={inputClass}
                  />
                </label>
                <label title="max_tokens">
                  <span className="field-label">maxTok</span>
                  <input
                    value={maxTokens}
                    onChange={(event) => setMaxTokens(event.target.value)}
                    className={inputClass}
                    placeholder="opt"
                  />
                </label>
              </div>
              {vllm && node?.selectedModel && !isModelServed(served, node.selectedModel) ? (
                <p className="muted">
                  {node.selectedModel} is selected. Waiting for the engine to serve it.
                </p>
              ) : null}
              <div className="chat-input">
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                  rows={2}
                  className={`${inputClass} flex-1`}
                  placeholder="Message"
                  title="⌘Enter or Ctrl+Enter to send"
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
            <div ref={chatLogRef} className="chat-log">
              {visibleMessages.length === 0 ? (
                <p className="muted">No messages yet. Send a turn after the engine is up.</p>
              ) : (
                visibleMessages.map((message) => (
                  <div key={`${message.at}-${message.role}`} className={`event ${message.role}`}>
                    <div className="kind-row">
                      <div className="kind">{message.role}</div>
                      <div className="when">{formatDateTime(message.at, { seconds: true })}</div>
                    </div>
                    <div className="body">{message.content}</div>
                  </div>
                ))
              )}
            </div>
          </Section>

          {showLogs ? (
            <Section
              title={`${engineBinaryName(node?.engine)} log`}
              className="node-logs"
              actions={
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={logFollow ? 'toggle accent' : 'toggle'}
                    onClick={() => setLogFollow((current) => !current)}
                  >
                    {logFollow ? 'Following' : 'Follow'}
                  </button>
                  <button type="button" className="toggle" disabled={logLoading} onClick={() => void fetchLogs()}>
                    {logLoading ? 'Reading…' : 'Refresh'}
                  </button>
                </div>
              }
            >
              {logMissing ? (
                <p className="muted">
                  No log yet. Start the engine to create ~/.platformai/{vllm ? 'vllm.log' : 'llama-server.log'}.
                </p>
              ) : (
                <pre ref={logRef} className="log-tail">
                  {logText.trim() ? logText : logLoading ? 'Reading…' : 'Log is empty.'}
                </pre>
              )}
            </Section>
          ) : null}

          <div className="node-side">
            <Section
              title="Status"
              actions={
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void handleStart()}
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
                    <button
                      type="button"
                      className="toggle stat-check-btn"
                      disabled={checking !== null || busy !== null}
                      onClick={() => void handleCheck('ssh')}
                    >
                      {checking === 'ssh' ? 'Checking…' : 'Check'}
                    </button>
                  </dd>
                </div>
                <div>
                  <dt className="stat-label">Engine</dt>
                  <dd className="stat-value">
                    <span className="flex flex-wrap items-center gap-2">
                      {engine ? <StatusIcon kind={engine.running ? 'running' : 'stopped'} /> : <span className="muted">—</span>}
                      <span className="muted">pid {engine?.pid ?? '—'}</span>
                    </span>
                    <span className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className="toggle stat-check-btn"
                        disabled={!node}
                        onClick={() => setParamsOpen(true)}
                      >
                        Params
                      </button>
                      <button
                        type="button"
                        className="toggle stat-check-btn"
                        disabled={checking !== null || busy !== null}
                        onClick={() => void handleCheck('engine')}
                      >
                        {checking === 'engine' ? 'Checking…' : 'Check'}
                      </button>
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="stat-label">OpenAI</dt>
                  <dd className="stat-value">
                    {status ? <StatusIcon kind={status.openai === 'up' ? 'up' : 'down'} /> : <span className="muted">—</span>}
                    <button
                      type="button"
                      className="toggle stat-check-btn"
                      disabled={checking !== null || busy !== null}
                      onClick={() => void handleCheck('openai')}
                    >
                      {checking === 'openai' ? 'Checking…' : 'Check'}
                    </button>
                  </dd>
                </div>
              </dl>
              <div>
                <div className="stat-label">Served models</div>
                <div className="stat-value">
                  <ModelRadios models={served} />
                </div>
              </div>
              {engine?.lastStart ? (
                <p className="muted">
                  Last start{' '}
                  {vllm
                    ? engine.lastStart.modelFilename || node?.selectedModel || 'model'
                    : `--models-dir ${node?.modelDir ?? '~/models'}`}
                  {engine.lastStart.startedAt ? ` · ${formatStamp(engine.lastStart.startedAt)}` : ''}
                </p>
              ) : (
                <p className="muted">
                  {vllm
                    ? 'No previous start. Pick a local snapshot or a Hugging Face repo id, then Start.'
                    : 'No previous start. Start loads every GGUF in the model dir.'}
                </p>
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
              {!modelsKnown ? (
                <p className="muted">Model dir not checked yet.</p>
              ) : models.length === 0 ? (
                <p className="muted">
                  {vllm ? 'No Hugging Face model folders in' : 'No GGUF files in'} {node?.modelDir ?? '~/models'}.
                </p>
              ) : (
                <ul className="model-list">
                  {models.map((model) => {
                    const selected = node?.selectedModel === model.name;
                    const live = isModelServed(served, model.name);
                    return (
                      <li key={model.name} className="model-row">
                        <div className="model-meta">
                          <div className="model-name">{model.name}</div>
                          <div className="muted">
                            {formatBytes(model.sizeBytes)} · {formatFileTime(model.mtime)}
                            {live ? ' · serving' : selected ? ' · selected' : ''}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {vllm ? (
                            <button
                              type="button"
                              disabled={busy !== null || selected}
                              className={selected ? 'toggle accent' : 'toggle'}
                              onClick={() => void handleSelectModel(model.name)}
                            >
                              {busy === 'serve' && selected ? 'Serving…' : selected ? 'Selected' : 'Serve'}
                            </button>
                          ) : null}
                          <button
                            type="button"
                            disabled={busy !== null}
                            className="toggle danger"
                            onClick={() => void handleDelete(model.name)}
                          >
                            Delete
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Section>
          </div>
        </div>
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
                    placeholder="org/model or org/model:F16"
                    autoFocus
                  />
                </label>
                {vllm ? (
                  <p className="muted">
                    {hfListing
                      ? 'Checking repo…'
                      : hfFiles.length
                        ? `Snapshot · ${hfFiles.length} files · ${formatBytes(hfFiles.reduce((sum, file) => sum + (file.sizeBytes || 0), 0))}`
                        : 'Downloads the full Hugging Face snapshot into the model dir.'}
                  </p>
                ) : (
                  <label>
                    <span className="field-label">File</span>
                    {hfFiles.length > 0 ? (
                      <select
                        value={downloadFilename}
                        onChange={(event) => setDownloadFilename(event.target.value)}
                        className={inputClass}
                      >
                        {hfFiles.map((file) => (
                          <option key={file.name} value={file.name}>
                            {file.name.split('/').pop()} ({formatBytes(file.sizeBytes)})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        value={downloadFilename}
                        onChange={(event) => setDownloadFilename(event.target.value)}
                        className={inputClass}
                        placeholder={hfListing ? 'Listing GGUFs…' : 'model.gguf'}
                        disabled={hfListing}
                      />
                    )}
                  </label>
                )}
                {hfListError ? <p className="muted">{hfListError}</p> : null}
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

      {paramsOpen && node ? <EngineParamsModal node={node} onClose={() => setParamsOpen(false)} /> : null}
    </div>
  );
}
