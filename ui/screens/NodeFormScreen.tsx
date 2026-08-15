import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useMatch, useNavigate } from 'react-router-dom';
import ErrorBanner from '@components/ErrorBanner';
import ServerParamsFields from '@components/ServerParamsFields';
import SetupInstructions from '@components/SetupInstructions';
import { useClusters } from '@contexts/ClusterContext';
import { nodeService } from '@services/nodeService';
import type { Node, NodeIn, ServerParams, SshAuthType, TestSshResult } from '@/types';

const inputClass =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500';

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
  };
}

function mergeServerParams(raw?: Partial<ServerParams> | null): ServerParams {
  return { ...defaultServerParams(), ...(raw ?? {}) };
}

function parseRequiredInt(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      {children}
    </section>
  );
}

export default function NodeFormScreen() {
  const navigate = useNavigate();
  const { refresh } = useClusters();
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
  const [sshResult, setSshResult] = useState<TestSshResult | null>(null);
  const [loadedClusterId, setLoadedClusterId] = useState<string | null>(clusterId ?? null);

  const [name, setName] = useState('');
  const [host, setHost] = useState('');
  const [sshPort, setSshPort] = useState(22);
  const [sshUser, setSshUser] = useState('');
  const [sshAuthType, setSshAuthType] = useState<SshAuthType>('password');
  const [sshPassword, setSshPassword] = useState('');
  const [sshPrivateKey, setSshPrivateKey] = useState('');
  const [sshPassphrase, setSshPassphrase] = useState('');
  const [openaiBaseUrl, setOpenaiBaseUrl] = useState('');
  const [openaiApiKey, setOpenaiApiKey] = useState('');
  const [hfToken, setHfToken] = useState('');
  const [listenHost, setListenHost] = useState('0.0.0.0');
  const [listenPort, setListenPort] = useState(8080);
  const [modelDir, setModelDir] = useState('~/models');
  const [serverParams, setServerParams] = useState<ServerParams>(defaultServerParams);

  function applyNode(node: Node) {
    setLoadedClusterId(node.clusterId);
    setName(node.name);
    setHost(node.host);
    setSshPort(node.sshPort);
    setSshUser(node.sshUser);
    setSshAuthType(node.sshAuthType);
    setSshPassword(node.sshPassword);
    setSshPrivateKey(node.sshPrivateKey);
    setSshPassphrase(node.sshPassphrase);
    setOpenaiBaseUrl(node.openaiBaseUrl);
    setOpenaiApiKey(node.openaiApiKey);
    setHfToken(node.hfToken);
    setListenHost(node.listenHost);
    setListenPort(node.listenPort);
    setModelDir(node.modelDir);
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

  function buildPayload(): NodeIn {
    return {
      name: name.trim(),
      host: host.trim(),
      sshPort,
      sshUser: sshUser.trim(),
      sshAuthType,
      sshPassword: sshAuthType === 'password' ? sshPassword : '',
      sshPrivateKey: sshAuthType === 'private_key' ? sshPrivateKey : '',
      sshPassphrase: sshAuthType === 'private_key' ? sshPassphrase : '',
      openaiBaseUrl: openaiBaseUrl.trim(),
      openaiApiKey,
      hfToken,
      listenHost: listenHost.trim() || '0.0.0.0',
      listenPort,
      modelDir: modelDir.trim() || '~/models',
      serverParams,
    };
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    const payload = buildPayload();
    if (!payload.name || !payload.host || !payload.sshUser || !payload.openaiBaseUrl) {
      setError('Name, host, SSH user, and OpenAI base URL are required');
      return;
    }
    if (payload.sshAuthType === 'password' && !payload.sshPassword) {
      setError('SSH password is required');
      return;
    }
    if (payload.sshAuthType === 'private_key' && !payload.sshPrivateKey) {
      setError('SSH private key is required');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (isEdit && nodeId) {
        applyNode(await nodeService.update(nodeId, payload));
      } else if (clusterId) {
        const created = await nodeService.create(clusterId, payload);
        void refresh();
        navigate(`/nodes/${created.id}/edit`, { replace: true });
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
      setError('Save the node before testing SSH');
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
    <div className="mx-auto max-w-3xl space-y-6 p-8">
      <div>
        <Link to={backTo} className="text-sm text-blue-600 hover:underline">
          ← {loadedClusterId ? 'Cluster' : 'Clusters'}
        </Link>
        <h1 className="mt-3 text-2xl font-semibold text-slate-900">{isEdit ? 'Edit node' : 'Register node'}</h1>
        <p className="mt-1 text-sm text-slate-500">llama.cpp · no login · SSH secrets stay on this laptop</p>
      </div>

      {error ? <ErrorBanner message={error} /> : null}

      {loading ? <p className="text-sm text-slate-500">Loading…</p> : null}

      {ready && !loading ? (
      <form className="space-y-6" onSubmit={(event) => void handleSave(event)}>
        <Section title="Identity">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name">
              <input value={name} onChange={(event) => setName(event.target.value)} className={inputClass} required />
            </Field>
            <Field label="Host">
              <input
                value={host}
                onChange={(event) => setHost(event.target.value)}
                className={inputClass}
                placeholder="192.168.1.20"
                required
              />
            </Field>
            <Field label="SSH port">
              <input
                type="number"
                value={sshPort}
                onChange={(event) => setSshPort(parseRequiredInt(event.target.value, 22))}
                className={inputClass}
              />
            </Field>
          </div>
        </Section>

        <Section title="SSH">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="User">
              <input value={sshUser} onChange={(event) => setSshUser(event.target.value)} className={inputClass} required />
            </Field>
            <Field label="Auth type">
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
              <Field label="Password">
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
                  <Field label="Private key">
                    <textarea
                      value={sshPrivateKey}
                      onChange={(event) => setSshPrivateKey(event.target.value)}
                      rows={6}
                      className={`${inputClass} font-mono`}
                      placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                    />
                  </Field>
                </div>
                <Field label="Passphrase">
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

        <Section title="OpenAI">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Base URL">
                <input
                  value={openaiBaseUrl}
                  onChange={(event) => setOpenaiBaseUrl(event.target.value)}
                  className={inputClass}
                  placeholder="http://192.168.1.20:8080/v1"
                  required
                />
              </Field>
            </div>
            <Field label="API key">
              <input
                type="password"
                value={openaiApiKey}
                onChange={(event) => setOpenaiApiKey(event.target.value)}
                className={inputClass}
                placeholder="optional"
                autoComplete="off"
              />
            </Field>
            <Field label="Hugging Face token">
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
            <Field label="Listen host">
              <input value={listenHost} onChange={(event) => setListenHost(event.target.value)} className={inputClass} />
            </Field>
            <Field label="Listen port">
              <input
                type="number"
                value={listenPort}
                onChange={(event) => setListenPort(parseRequiredInt(event.target.value, 8080))}
                className={inputClass}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Model dir">
                <input value={modelDir} onChange={(event) => setModelDir(event.target.value)} className={inputClass} />
              </Field>
            </div>
          </div>
        </Section>

        <ServerParamsFields
          params={serverParams}
          listenHost={listenHost}
          listenPort={listenPort}
          modelDir={modelDir}
          onChange={setServerParams}
        />

        {isEdit ? <SetupInstructions /> : null}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <button
              type="button"
              onClick={() => void handleTestSsh()}
              disabled={!nodeId || testing || loading}
              title={nodeId ? 'Test SSH' : 'Save the node first'}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
            >
              {testing ? 'Testing SSH…' : 'Test SSH'}
            </button>
            {sshResult ? (
              <p className="text-sm text-emerald-700">
                SSH ok · {sshResult.uname} · {sshResult.llamaServer}
              </p>
            ) : null}
          </div>
          <button
            type="submit"
            disabled={saving || loading}
            className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? 'Saving…' : isEdit ? 'Save' : 'Create'}
          </button>
        </div>
      </form>
      ) : null}
    </div>
  );
}
