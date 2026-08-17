import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useMatch, useNavigate } from 'react-router-dom';
import ErrorBanner from '@components/ErrorBanner';
import SuccessModal from '@components/SuccessModal';
import InfoTip from '@components/InfoTip';
import ServerParamsFields from '@components/ServerParamsFields';
import SetupInstructions from '@components/SetupInstructions';
import VllmParamsFields from '@components/VllmParamsFields';
import { useClusters } from '@contexts/ClusterContext';
import { engineBinaryName, engineLabel, isVllm } from '@/lib/engine';
import { clusterService } from '@services/clusterService';
import { nodeService } from '@services/nodeService';
import type { Node, NodeIn, NodeType, ServerParams, SshAuthType, TestSshResult } from '@/types';

const inputClass = 'field-input';

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function defaultServerParams(): ServerParams {
  return {
    ctxSize: 0,
    gpuLayers: 'auto',
    flashAttn: 'auto',
    threads: null,
    parallel: 1,
    batchSize: null,
    ubatchSize: null,
    kvOffload: true,
    fit: 'on',
    cacheTypeK: null,
    cacheTypeV: null,
    nPredict: null,
    keep: null,
    threadsBatch: null,
    splitMode: null,
    mainGpu: null,
    tensorSplit: null,
    device: null,
    cpuMoe: null,
    nCpuMoe: null,
    loadMode: null,
    jinja: null,
    chatTemplate: null,
    metrics: null,
    alias: null,
    extraFlags: '',
    tensorParallelSize: 1,
    gpuMemoryUtilization: 0.9,
    maxModelLen: null,
    dtype: null,
    quantization: null,
    maxNumSeqs: null,
    swapSpace: null,
    kvCacheDtype: null,
    servedModelName: null,
    trustRemoteCode: null,
    enforceEager: null,
    enablePrefixCaching: null,
  };
}

function mergeServerParams(raw?: Partial<ServerParams> | null): ServerParams {
  return { ...defaultServerParams(), ...(raw ?? {}) };
}

function parseRequiredInt(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function Field({ label, info, children }: { label: string; info?: string; children: ReactNode }) {
  return (
    <div>
      <span className="field-label">
        {label}
        {info ? <InfoTip text={info} /> : null}
      </span>
      {children}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card space-y-4">
      <h2 className="card-title">{title}</h2>
      {children}
    </section>
  );
}

export default function NodeFormScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const { clusters, refresh } = useClusters();
  const createMatch = useMatch('/clusters/:id/nodes/new');
  const editMatch = useMatch('/nodes/:id/edit');
  const clusterId = createMatch?.params.id;
  const nodeId = editMatch?.params.id;
  const isEdit = Boolean(editMatch);

  const [loading, setLoading] = useState(isEdit);
  const [ready, setReady] = useState(!isEdit);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [sshResult, setSshResult] = useState<TestSshResult | null>(null);
  const [loadedClusterId, setLoadedClusterId] = useState<string | null>(clusterId ?? null);

  const [name, setName] = useState('');
  const [nodeType, setNodeType] = useState<NodeType>('local');
  const [host, setHost] = useState('');
  const [sshPort, setSshPort] = useState(22);
  const [sshUser, setSshUser] = useState('');
  const [sshAuthType, setSshAuthType] = useState<SshAuthType>('password');
  const [sshPassword, setSshPassword] = useState('');
  const [sshPrivateKey, setSshPrivateKey] = useState('');
  const [sshPassphrase, setSshPassphrase] = useState('');
  const [openaiBaseUrl, setOpenaiBaseUrl] = useState('http://127.0.0.1:8080/v1');
  const [openaiApiKey, setOpenaiApiKey] = useState('');
  const [hfToken, setHfToken] = useState('');
  const [listenHost, setListenHost] = useState('0.0.0.0');
  const [listenPort, setListenPort] = useState(8080);
  const [modelDir, setModelDir] = useState('~/models');
  const [llamaServerPath, setLlamaServerPath] = useState('');
  const [vllmImage, setVllmImage] = useState(
    'rocm/vllm:rocm7.14.0_cdna_ubuntu24.04_py3.14_pytorch_2.11.0_vllm_0.23.0',
  );
  const [selectedModel, setSelectedModel] = useState('');
  const [nodeEngine, setNodeEngine] = useState('');
  const [serverParams, setServerParams] = useState<ServerParams>(defaultServerParams);

  const cluster = clusters.find((item) => item.id === (clusterId || loadedClusterId));
  const engine = cluster?.engine || nodeEngine || 'llama.cpp';
  const vllm = isVllm(engine);

  function applyNode(node: Node) {
    setLoadedClusterId(node.clusterId);
    setName(node.name);
    setNodeType(node.nodeType === 'remote' ? 'remote' : 'local');
    setHost(node.nodeType === 'remote' ? node.host : '');
    setSshPort(node.sshPort || 22);
    setSshUser(node.sshUser);
    setSshAuthType(node.nodeType === 'remote' && node.sshAuthType !== 'none' ? node.sshAuthType : 'password');
    setSshPassword(node.sshPassword);
    setSshPrivateKey(node.sshPrivateKey);
    setSshPassphrase(node.sshPassphrase);
    setOpenaiBaseUrl(node.openaiBaseUrl);
    setOpenaiApiKey(node.openaiApiKey);
    setHfToken(node.hfToken);
    setListenHost(node.listenHost);
    setListenPort(node.listenPort);
    setModelDir(node.modelDir);
    setLlamaServerPath(node.llamaServerPath || '');
    setVllmImage(
      node.vllmImage || 'rocm/vllm:rocm7.14.0_cdna_ubuntu24.04_py3.14_pytorch_2.11.0_vllm_0.23.0',
    );
    setSelectedModel(node.selectedModel || '');
    setNodeEngine(node.engine || '');
    setServerParams(mergeServerParams(node.serverParams));
  }

  useEffect(() => {
    if (!nodeId) return;
    let cancelled = false;
    setLoading(true);
    void nodeService
      .get(nodeId)
      .then((node) => {
        if (cancelled) return;
        applyNode(node);
        setReady(true);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [nodeId]);

  useEffect(() => {
    if (isEdit || !clusterId) return;
    let cancelled = false;
    void clusterService
      .get(clusterId)
      .then((clusterDoc) => {
        if (cancelled) return;
        setLoadedClusterId(clusterDoc.id);
        setNodeEngine(clusterDoc.engine || '');
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setNodeEngine('');
        setError(
          errorMessage(err) === 'Not found'
            ? 'This cluster is gone. Go back to Clusters and open the vLLM cluster again.'
            : errorMessage(err),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [clusterId, isEdit]);

  useEffect(() => {
    if (isEdit || !vllm) return;
    setListenPort((current) => (current === 8080 ? 8000 : current));
    setOpenaiBaseUrl((current) =>
      current.includes('127.0.0.1:8080') ? current.replace('127.0.0.1:8080', '127.0.0.1:8000') : current,
    );
  }, [isEdit, vllm]);

  useEffect(() => {
    const flash = (location.state as { notice?: string } | null)?.notice;
    if (!flash) return;
    setNotice(flash);
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.pathname, location.state, navigate]);

  function buildPayload(): NodeIn {
    const local = nodeType === 'local';
    return {
      name: name.trim(),
      nodeType,
      host: local ? 'localhost' : host.trim(),
      sshPort: local ? 22 : sshPort,
      sshUser: local ? '' : sshUser.trim(),
      sshAuthType: local ? 'none' : sshAuthType,
      sshPassword: !local && sshAuthType === 'password' ? sshPassword : '',
      sshPrivateKey: !local && sshAuthType === 'private_key' ? sshPrivateKey : '',
      sshPassphrase: !local && sshAuthType === 'private_key' ? sshPassphrase : '',
      openaiBaseUrl: openaiBaseUrl.trim() || (local ? `http://127.0.0.1:${listenPort}/v1` : ''),
      openaiApiKey,
      hfToken,
      listenHost: listenHost.trim() || '0.0.0.0',
      listenPort,
      modelDir: modelDir.trim() || '~/models',
      llamaServerPath: llamaServerPath.trim(),
      vllmImage: vllmImage.trim(),
      selectedModel: selectedModel.trim(),
      serverParams,
    };
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    const payload = buildPayload();
    const local = nodeType === 'local';
    if (!payload.name || !payload.openaiBaseUrl) {
      setError('Name and OpenAI base URL are required');
      return;
    }
    if (!local && !payload.host) {
      setError('Host is required for remote nodes');
      return;
    }
    if (!local && !payload.sshUser) {
      setError('SSH user is required for remote hosts');
      return;
    }
    if (!local && payload.sshAuthType === 'password' && !payload.sshPassword) {
      setError('SSH password is required');
      return;
    }
    if (!local && payload.sshAuthType === 'private_key' && !payload.sshPrivateKey) {
      setError('SSH private key is required');
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      if (isEdit && nodeId) {
        applyNode(await nodeService.update(nodeId, payload));
        setNotice(`Node "${payload.name}" saved`);
      } else if (clusterId) {
        try {
          await clusterService.get(clusterId);
        } catch (err) {
          setError(
            errorMessage(err) === 'Not found'
              ? 'This cluster is gone. Go back to Clusters and open the vLLM cluster again.'
              : errorMessage(err),
          );
          return;
        }
        const created = await nodeService.create(clusterId, payload);
        void refresh();
        navigate(`/nodes/${created.id}/edit`, {
          replace: true,
          state: { notice: `Node "${payload.name}" created` },
        });
        return;
      } else {
        setError('Missing cluster id');
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleTestSsh() {
    if (!nodeId) {
      setError(nodeType === 'local' ? 'Save the node before testing' : 'Save the node before testing SSH');
      return;
    }
    setTesting(true);
    setError(null);
    setSshResult(null);
    try {
      setSshResult(await nodeService.testSsh(nodeId));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setTesting(false);
    }
  }

  const backTo = loadedClusterId ? `/clusters/${loadedClusterId}` : '/';

  return (
    <div className="page page-narrow space-y-5">
      <div>
        <Link to={backTo} className="back">
          ← {loadedClusterId ? 'Cluster' : 'Clusters'}
        </Link>
        <h1 className="mt-3">{isEdit ? 'Edit node' : 'Register node'}</h1>
        <p className="page-sub">{engineLabel(engine)} · no login · SSH secrets stay on this laptop</p>
      </div>

      {error ? <ErrorBanner message={error} /> : previewError ? <ErrorBanner message={previewError} /> : null}
      {notice ? <SuccessModal message={notice} onClose={() => setNotice(null)} /> : null}

      {loading ? <p className="muted">Loading…</p> : null}

      {ready && !loading ? (
      <form className="space-y-6" onSubmit={(event) => void handleSave(event)}>
        <Section title="Identity">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <span className="field-label">
                Node type
                <InfoTip text="Localhost talks to processes and files on this machine. Remote uses SSH to another host." />
              </span>
              <div className="flex flex-wrap gap-4">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    name="node-type"
                    checked={nodeType === 'local'}
                    onChange={() => {
                      setNodeType('local');
                      setSshAuthType('none');
                      if (!openaiBaseUrl.trim()) {
                        setOpenaiBaseUrl(`http://127.0.0.1:${listenPort}/v1`);
                      }
                    }}
                  />
                  Localhost
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    name="node-type"
                    checked={nodeType === 'remote'}
                    onChange={() => {
                      setNodeType('remote');
                      if (sshAuthType === 'none') setSshAuthType('password');
                    }}
                  />
                  Remote (SSH)
                </label>
              </div>
            </div>
            <Field label="Name" info="Display name for this node in the cluster list.">
              <input value={name} onChange={(event) => setName(event.target.value)} className={inputClass} required />
            </Field>
            {nodeType === 'remote' ? (
              <>
                <Field label="Host" info="Remote hostname or IP. SSH is used to reach this machine.">
                  <input
                    value={host}
                    onChange={(event) => setHost(event.target.value)}
                    className={inputClass}
                    placeholder="192.168.1.20"
                    required
                  />
                </Field>
                <Field label="SSH port" info="Remote SSH port.">
                  <input
                    type="number"
                    value={sshPort}
                    onChange={(event) => setSshPort(parseRequiredInt(event.target.value, 22))}
                    className={inputClass}
                  />
                </Field>
              </>
            ) : (
              <p className="muted sm:col-span-1 self-end">
                This machine — engine, models, and files are local. No SSH host or port.
              </p>
            )}
          </div>
        </Section>

        {nodeType === 'remote' ? (
        <Section title="SSH">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="User" info="SSH login name on the remote machine.">
              <input value={sshUser} onChange={(event) => setSshUser(event.target.value)} className={inputClass} required />
            </Field>
            <Field label="Auth type" info="How the API logs in: password or a pasted private key.">
              <select
                value={sshAuthType}
                onChange={(event) => setSshAuthType(event.target.value as SshAuthType)}
                className={inputClass}
              >
                <option value="password">password</option>
                <option value="private_key">private key</option>
              </select>
            </Field>
            {sshAuthType === 'password' ? (
              <Field label="Password" info="SSH password. Stored as entered on this laptop.">
                <input
                  type="password"
                  value={sshPassword}
                  onChange={(event) => setSshPassword(event.target.value)}
                  className={inputClass}
                  autoComplete="new-password"
                />
              </Field>
            ) : (
              <>
                <div className="sm:col-span-2">
                  <Field label="Private key" info="PEM / OpenSSH private key text. Stored as entered.">
                    <textarea
                      value={sshPrivateKey}
                      onChange={(event) => setSshPrivateKey(event.target.value)}
                      rows={6}
                      className={`${inputClass} font-mono`}
                      placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                    />
                  </Field>
                </div>
                <Field label="Passphrase" info="Optional passphrase for the private key.">
                  <input
                    type="password"
                    value={sshPassphrase}
                    onChange={(event) => setSshPassphrase(event.target.value)}
                    className={inputClass}
                    placeholder="optional"
                    autoComplete="new-password"
                  />
                </Field>
              </>
            )}
          </div>
        </Section>
        ) : null}

        <Section title="OpenAI">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field
                label="Base URL"
                info="OpenAI-compatible base, including /v1. Used for health, model list, and chat."
              >
                <input
                  value={openaiBaseUrl}
                  onChange={(event) => setOpenaiBaseUrl(event.target.value)}
                  className={inputClass}
                  placeholder="http://192.168.1.20:8080/v1"
                  required
                />
              </Field>
            </div>
            <Field label="API key" info={`Optional Bearer token if ${engineBinaryName(engine)} was started with an API key.`}>
              <input
                type="password"
                value={openaiApiKey}
                onChange={(event) => setOpenaiApiKey(event.target.value)}
                className={inputClass}
                placeholder="optional"
                autoComplete="off"
              />
            </Field>
            <Field
              label="Hugging Face token"
              info={
                vllm
                  ? 'Optional token for gated Hugging Face snapshots on this node.'
                  : 'Optional token for gated GGUF downloads from Hugging Face.'
              }
            >
              <input
                type="password"
                value={hfToken}
                onChange={(event) => setHfToken(event.target.value)}
                className={inputClass}
                placeholder="optional"
                autoComplete="off"
              />
            </Field>
          </div>
        </Section>

        <Section title="Server">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Listen host"
              info={`Address ${engineBinaryName(engine)} binds (--host). 0.0.0.0 accepts LAN clients.`}
            >
              <input value={listenHost} onChange={(event) => setListenHost(event.target.value)} className={inputClass} />
            </Field>
            <Field
              label="Listen port"
              info={`TCP port ${engineBinaryName(engine)} listens on (--port). Must match the OpenAI base URL.`}
            >
              <input
                type="number"
                value={listenPort}
                onChange={(event) => setListenPort(parseRequiredInt(event.target.value, 8080))}
                className={inputClass}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field
                label="Model dir"
                info={
                  vllm
                    ? 'Directory on the node where Hugging Face model folders live. ~/models is expanded on the machine.'
                    : 'Directory on the node where GGUF files are stored. ~/models is expanded on the machine.'
                }
              >
                <input value={modelDir} onChange={(event) => setModelDir(event.target.value)} className={inputClass} />
              </Field>
            </div>
            {vllm ? (
              <div className="sm:col-span-2">
                <Field
                  label="Docker image"
                  info="ROCm vLLM image. Instinct MI210/MI300 use the cdna tag. Radeon cards use the rdna tag."
                >
                  <input
                    value={vllmImage}
                    onChange={(event) => setVllmImage(event.target.value)}
                    className={inputClass}
                    placeholder="rocm/vllm:rocm7.14.0_cdna_ubuntu24.04_py3.14_pytorch_2.11.0_vllm_0.23.0"
                  />
                </Field>
              </div>
            ) : (
              <div className="sm:col-span-2">
                <Field
                  label="llama-server path"
                  info="Full path to llama-server on the node. Leave empty to auto-detect (PATH, Homebrew, /opt/homebrew/bin, /usr/local/bin)."
                >
                  <input
                    value={llamaServerPath}
                    onChange={(event) => setLlamaServerPath(event.target.value)}
                    className={inputClass}
                    placeholder="/opt/homebrew/bin/llama-server"
                  />
                </Field>
              </div>
            )}
            {vllm ? (
              <div className="sm:col-span-2">
                <Field
                  label="Model to serve"
                  info="Local folder name under the model dir, or a Hugging Face repo id such as Qwen/Qwen2.5-7B-Instruct."
                >
                  <input
                    value={selectedModel}
                    onChange={(event) => setSelectedModel(event.target.value)}
                    className={inputClass}
                    placeholder="Qwen/Qwen2.5-7B-Instruct"
                  />
                </Field>
              </div>
            ) : null}
          </div>
        </Section>

        {vllm ? (
          <VllmParamsFields
            params={serverParams}
            listenHost={listenHost}
            listenPort={listenPort}
            modelDir={modelDir}
            modelFilename={selectedModel || '$MODEL'}
            vllmImage={vllmImage}
            onChange={setServerParams}
            onPreviewError={setPreviewError}
          />
        ) : (
          <ServerParamsFields
            params={serverParams}
            listenHost={listenHost}
            listenPort={listenPort}
            modelDir={modelDir}
            onChange={setServerParams}
            onPreviewError={setPreviewError}
          />
        )}

        {isEdit ? <SetupInstructions engine={engine} /> : null}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <button
              type="button"
              onClick={() => void handleTestSsh()}
              disabled={!nodeId || testing || loading}
              title={nodeId ? (nodeType === 'local' ? 'Test local engine' : 'Test SSH') : 'Save the node first'}
              className="toggle"
            >
              {testing
                ? nodeType === 'local'
                  ? 'Testing local…'
                  : 'Testing SSH…'
                : nodeType === 'local'
                  ? 'Test local'
                  : 'Test SSH'}
            </button>
            {sshResult ? (
              <p className="ok-line">
                {sshResult.local ? 'Local ok' : 'SSH ok'} · {sshResult.uname} · {sshResult.llamaServer}
              </p>
            ) : null}
          </div>
          <button
            type="submit"
            disabled={saving || loading}
            className="toggle accent"
          >
            {saving ? 'Saving…' : isEdit ? 'Save' : 'Create'}
          </button>
        </div>
      </form>
      ) : null}
    </div>
  );
}
