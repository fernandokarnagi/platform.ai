import { useEffect, useState, type FormEvent } from 'react';
import CollapsibleCard from '@components/CollapsibleCard';
import InheritPill from '@components/InheritPill';
import ErrorBanner from '@components/ErrorBanner';
import SuccessModal from '@components/SuccessModal';
import ServerParamsFields from '@components/ServerParamsFields';
import VllmParamsFields from '@components/VllmParamsFields';
import { settingsService } from '@services/settingsService';
import type { LlamaCppSettings, ServerParams, VllmSettings } from '@/types';

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function emptyLlamaCpp(): ServerParams {
  return {
    ctxSize: null,
    gpuLayers: null,
    flashAttn: null,
    threads: null,
    parallel: null,
    batchSize: null,
    ubatchSize: null,
    kvOffload: null,
    fit: null,
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
    tensorParallelSize: null,
    gpuMemoryUtilization: null,
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

function emptyVllm(): ServerParams {
  return emptyLlamaCpp();
}

export default function SettingsScreen() {
  const [hfToken, setHfToken] = useState('');
  const [libraryDir, setLibraryDir] = useState('');
  const [llamaCpp, setLlamaCpp] = useState<ServerParams>(emptyLlamaCpp);
  const [vllm, setVllm] = useState<ServerParams>(emptyVllm);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void settingsService
      .get()
      .then((settings) => {
        if (cancelled) return;
        setHfToken(settings.hfToken || '');
        setLibraryDir(settings.libraryDir || '');
        setLlamaCpp({ ...emptyLlamaCpp(), ...(settings.llamaCpp || {}), extraFlags: settings.llamaCpp?.extraFlags || '' });
        setVllm({ ...emptyVllm(), ...(settings.vllm || {}), extraFlags: settings.vllm?.extraFlags || '' });
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
  }, []);

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const llamaPayload: LlamaCppSettings = { ...llamaCpp, extraFlags: llamaCpp.extraFlags || '' };
      const vllmPayload: VllmSettings = { ...vllm, extraFlags: vllm.extraFlags || '' };
      const saved = await settingsService.update({
        hfToken: hfToken.trim(),
        libraryDir: libraryDir.trim(),
        llamaCpp: llamaPayload,
        vllm: vllmPayload,
      });
      setHfToken(saved.hfToken || '');
      setLibraryDir(saved.libraryDir || '');
      setLlamaCpp({ ...emptyLlamaCpp(), ...(saved.llamaCpp || {}), extraFlags: saved.llamaCpp?.extraFlags || '' });
      setVllm({ ...emptyVllm(), ...(saved.vllm || {}), extraFlags: saved.vllm?.extraFlags || '' });
      setNotice('Settings saved');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page space-y-5">
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p className="page-sub">Common configuration for every cluster and node</p>
        </div>
      </div>

      {error ? <ErrorBanner message={error} /> : null}
      {notice ? <SuccessModal message={notice} onClose={() => setNotice(null)} /> : null}

      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <form onSubmit={(event) => void handleSave(event)} className="space-y-5">
          <CollapsibleCard
            title="Hugging Face"
            description="Used for gated downloads and repo listing when the cluster and node leave their token empty."
          >
            <label>
              <span className="field-label">
                Access token
                <InheritPill layer={hfToken.trim() ? 'set' : 'none'} />
              </span>
              <input
                type="password"
                value={hfToken}
                onChange={(event) => setHfToken(event.target.value)}
                className="field-input"
                placeholder="empty — cluster and node tokens inherit nothing"
                autoComplete="off"
              />
            </label>
          </CollapsibleCard>
          <CollapsibleCard
            title="Model library"
            description="Central GGUF and vLLM snapshots. Node download copies from here instead of Hugging Face."
          >
            <label>
              <span className="field-label">Library path</span>
              <input
                value={libraryDir}
                onChange={(event) => setLibraryDir(event.target.value)}
                className="field-input"
                placeholder="/Users/fernando.karnagi/App/globalmodel"
                autoComplete="off"
              />
            </label>
            <p className="muted">
              llama.cpp files go in <span className="mono">llama.cpp/</span>. vLLM snapshots go in{' '}
              <span className="mono">vllm/</span>. Empty path uses the default.
            </p>
          </CollapsibleCard>
          <CollapsibleCard
            title="llama.cpp"
            description="Used when a llama.cpp node leaves a launch field empty. Node values override these."
            className=""
          >
            {previewError ? <ErrorBanner message={previewError} /> : null}
            <div className="space-y-4">
              <ServerParamsFields
                params={llamaCpp}
                listenHost="0.0.0.0"
                listenPort={8080}
                modelDir="~/models"
                onChange={setLlamaCpp}
                onPreviewError={setPreviewError}
                emptyLabel="engine default"
                applySettings={false}
                collapsible
              />
            </div>
          </CollapsibleCard>
          <CollapsibleCard
            title="vLLM"
            description="Used when a vLLM node (ROCm Docker or Mac Metal) leaves a launch field empty. Node values override these. Preview is the serve argv; ROCm still wraps it in docker on the node."
            className=""
          >
            <div className="space-y-4">
              <VllmParamsFields
                params={vllm}
                listenHost="0.0.0.0"
                listenPort={8000}
                modelDir="~/models"
                engine="vllm-metal"
                onChange={setVllm}
                onPreviewError={setPreviewError}
                emptyLabel="engine default"
                applySettings={false}
                collapsible
              />
            </div>
          </CollapsibleCard>
          <div className="page-actions">
            <button type="submit" disabled={saving} className="toggle accent">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
