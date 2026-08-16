import { useEffect, useState, type ReactNode } from 'react';
import InfoTip from '@components/InfoTip';
import { apiErrorStatus, nodeService } from '@services/nodeService';
import type { CacheType, FitMode, FlashAttn, ServerParams } from '@/types';

const inputClass = 'field-input';

const CACHE_TYPES: CacheType[] = ['f32', 'f16', 'bf16', 'q8_0', 'q4_0', 'q4_1', 'iq4_nl', 'q5_0', 'q5_1'];

const INFO = {
  ctxSize: 'Prompt context size in tokens (--ctx-size). 0 uses the size stored in the model.',
  gpuLayers: 'How many transformer layers to put in GPU/Metal memory (--n-gpu-layers). auto lets llama.cpp choose; all offloads every layer; a number is an exact count.',
  flashAttn: 'Flash Attention (--flash-attn). Faster prompt processing and a smaller KV cache when the hardware supports it.',
  threads: 'CPU threads used during generation (--threads). Omit to use the binary default.',
  parallel: 'How many parallel request slots share this context (--parallel). Context is split across slots.',
  batchSize: 'Logical maximum batch size for prompt processing (--batch-size).',
  ubatchSize: 'Physical micro-batch size (--ubatch-size). Lower this if you run out of memory.',
  kvOffload: 'Keep the KV cache on GPU/Metal (--kv-offload). Turn off to keep the cache on CPU RAM.',
  fit: 'Let llama.cpp shrink unset sizes so the model fits device memory (--fit).',
  cacheTypeK: 'Quantization type for the K cache (--cache-type-k). Smaller types save VRAM and can hurt quality.',
  cacheTypeV: 'Quantization type for the V cache (--cache-type-v). Usually match K.',
  nPredict: 'Maximum tokens to generate per request (--n-predict). -1 is unlimited.',
  keep: 'Tokens from the first prompt to keep when the context rolls (--keep).',
  threadsBatch: 'CPU threads for batch/prompt processing (--threads-batch). Defaults to --threads.',
  splitMode: 'How to split the model across GPUs (--split-mode): none, layer, row, or tensor.',
  mainGpu: 'Which GPU holds intermediate results or the whole model when split-mode is none (--main-gpu).',
  tensorSplit: 'Fraction of the model on each GPU, comma-separated (--tensor-split), e.g. 3,1.',
  device: 'Comma-separated devices to offload to (--device). Use llama-server --list-devices to see names.',
  cpuMoe: 'Keep all Mixture-of-Experts weights on CPU (--cpu-moe). Frees GPU memory on large MoE models.',
  nCpuMoe: 'Keep MoE weights of the first N layers on CPU (--n-cpu-moe).',
  loadMode: 'How the GGUF is mapped into memory (--load-mode): auto, mmap, mlock, dio, or none.',
  jinja: 'Enable Jinja chat templates (--jinja). Needed for many tool-calling models.',
  chatTemplate: 'Override the chat template name or string (--chat-template).',
  metrics: 'Expose Prometheus metrics on the server (--metrics).',
  alias: 'Name the model reports on the OpenAI /v1/models API (-a / --alias).',
  extraFlags: 'Raw extra CLI flags, appended last. Do not set -m, --model, --host, or --port — those are owned by the form.',
};

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
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

function parseOptionalInt(value: string): number | null {
  if (value.trim() === '') return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseRequiredInt(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function gpuMode(value: string | number): 'auto' | 'all' | 'number' {
  if (value === 'auto' || value === 'all') return value;
  return 'number';
}

export interface ServerParamsFieldsProps {
  params: ServerParams;
  listenHost: string;
  listenPort: number;
  modelDir: string;
  onChange: (params: ServerParams) => void;
  onPreviewError: (message: string | null) => void;
}

export default function ServerParamsFields({
  params,
  listenHost,
  listenPort,
  modelDir,
  onChange,
  onPreviewError,
}: ServerParamsFieldsProps) {
  const [command, setCommand] = useState('');
  const [copied, setCopied] = useState(false);
  const [extraFlagsError, setExtraFlagsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const handle = window.setTimeout(() => {
      void (async () => {
        try {
          const preview = await nodeService.previewCommand({
            listenHost,
            listenPort,
            modelDir,
            serverParams: params,
          });
          if (cancelled) return;
          setCommand(preview.command);
          setExtraFlagsError(null);
          onPreviewError(null);
        } catch (err) {
          if (cancelled) return;
          const message = errorMessage(err);
          if (apiErrorStatus(err) === 400) {
            setExtraFlagsError(message);
            onPreviewError(null);
          } else {
            setExtraFlagsError(null);
            onPreviewError(message);
          }
        }
      })();
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [listenHost, listenPort, modelDir, params, onPreviewError]);

  function patch(partial: Partial<ServerParams>) {
    onChange({ ...params, ...partial });
  }

  const mode = gpuMode(params.gpuLayers);

  return (
    <>
      <section className="card space-y-4">
        <h2 className="card-title">Load parameters</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Context length" info={INFO.ctxSize}>
            <input
              type="number"
              value={params.ctxSize}
              onChange={(event) => patch({ ctxSize: parseRequiredInt(event.target.value, 0) })}
              className={inputClass}
            />
          </Field>
          <div>
            <span className="field-label">
              GPU layers
              <InfoTip text={INFO.gpuLayers} />
            </span>
            <div className="flex gap-2">
              <select
                value={mode}
                onChange={(event) => {
                  const next = event.target.value;
                  if (next === 'auto' || next === 'all') {
                    patch({ gpuLayers: next });
                    return;
                  }
                  patch({ gpuLayers: typeof params.gpuLayers === 'number' ? params.gpuLayers : 0 });
                }}
                className={inputClass}
              >
                <option value="auto">auto</option>
                <option value="all">all</option>
                <option value="number">number</option>
              </select>
              {mode === 'number' ? (
                <input
                  type="number"
                  value={typeof params.gpuLayers === 'number' ? params.gpuLayers : 0}
                  onChange={(event) => patch({ gpuLayers: parseRequiredInt(event.target.value, 0) })}
                  className={inputClass}
                />
              ) : null}
            </div>
          </div>
          <Field label="Flash attention" info={INFO.flashAttn}>
            <select
              value={params.flashAttn}
              onChange={(event) => patch({ flashAttn: event.target.value as FlashAttn })}
              className={inputClass}
            >
              <option value="auto">auto</option>
              <option value="on">on</option>
              <option value="off">off</option>
            </select>
          </Field>
          <Field label="CPU threads" info={INFO.threads}>
            <input
              type="number"
              value={params.threads ?? ''}
              onChange={(event) => patch({ threads: parseOptionalInt(event.target.value) })}
              className={inputClass}
              placeholder="omit"
            />
          </Field>
          <Field label="Parallel slots" info={INFO.parallel}>
            <input
              type="number"
              value={params.parallel}
              onChange={(event) => patch({ parallel: parseRequiredInt(event.target.value, 1) })}
              className={inputClass}
            />
          </Field>
          <Field label="Batch size" info={INFO.batchSize}>
            <input
              type="number"
              value={params.batchSize ?? ''}
              onChange={(event) => patch({ batchSize: parseOptionalInt(event.target.value) })}
              className={inputClass}
              placeholder="omit"
            />
          </Field>
          <Field label="µbatch size" info={INFO.ubatchSize}>
            <input
              type="number"
              value={params.ubatchSize ?? ''}
              onChange={(event) => patch({ ubatchSize: parseOptionalInt(event.target.value) })}
              className={inputClass}
              placeholder="omit"
            />
          </Field>
          <label className="flex items-end gap-2">
            <input
              type="checkbox"
              checked={params.kvOffload}
              onChange={(event) => patch({ kvOffload: event.target.checked })}
            />
            <span className="field-label" style={{ margin: 0 }}>
              KV offload
              <InfoTip text={INFO.kvOffload} />
            </span>
          </label>
          <Field label="Fit in memory" info={INFO.fit}>
            <select
              value={params.fit}
              onChange={(event) => patch({ fit: event.target.value as FitMode })}
              className={inputClass}
            >
              <option value="on">on</option>
              <option value="off">off</option>
            </select>
          </Field>
          <Field label="Cache type K" info={INFO.cacheTypeK}>
            <select
              value={params.cacheTypeK ?? ''}
              onChange={(event) =>
                patch({ cacheTypeK: event.target.value === '' ? null : (event.target.value as CacheType) })
              }
              className={inputClass}
            >
              <option value="">omit</option>
              {CACHE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Cache type V" info={INFO.cacheTypeV}>
            <select
              value={params.cacheTypeV ?? ''}
              onChange={(event) =>
                patch({ cacheTypeV: event.target.value === '' ? null : (event.target.value as CacheType) })
              }
              className={inputClass}
            >
              <option value="">omit</option>
              {CACHE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </section>

      <section className="card">
        <details>
          <summary className="card-title cursor-pointer">Advanced</summary>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Max predict" info={INFO.nPredict}>
              <input
                type="number"
                value={params.nPredict ?? ''}
                onChange={(event) => patch({ nPredict: parseOptionalInt(event.target.value) })}
                className={inputClass}
                placeholder="omit"
              />
            </Field>
            <Field label="Keep tokens" info={INFO.keep}>
              <input
                type="number"
                value={params.keep ?? ''}
                onChange={(event) => patch({ keep: parseOptionalInt(event.target.value) })}
                className={inputClass}
                placeholder="omit"
              />
            </Field>
            <Field label="Batch threads" info={INFO.threadsBatch}>
              <input
                type="number"
                value={params.threadsBatch ?? ''}
                onChange={(event) => patch({ threadsBatch: parseOptionalInt(event.target.value) })}
                className={inputClass}
                placeholder="omit"
              />
            </Field>
            <Field label="Split mode" info={INFO.splitMode}>
              <input
                value={params.splitMode ?? ''}
                onChange={(event) => patch({ splitMode: event.target.value || null })}
                className={inputClass}
                placeholder="omit"
              />
            </Field>
            <Field label="Main GPU" info={INFO.mainGpu}>
              <input
                type="number"
                value={params.mainGpu ?? ''}
                onChange={(event) => patch({ mainGpu: parseOptionalInt(event.target.value) })}
                className={inputClass}
                placeholder="omit"
              />
            </Field>
            <Field label="Tensor split" info={INFO.tensorSplit}>
              <input
                value={params.tensorSplit ?? ''}
                onChange={(event) => patch({ tensorSplit: event.target.value || null })}
                className={inputClass}
                placeholder="omit"
              />
            </Field>
            <Field label="Device list" info={INFO.device}>
              <input
                value={params.device ?? ''}
                onChange={(event) => patch({ device: event.target.value || null })}
                className={inputClass}
                placeholder="omit"
              />
            </Field>
            <label className="flex items-end gap-2">
              <input
                type="checkbox"
                checked={Boolean(params.cpuMoe)}
                onChange={(event) => patch({ cpuMoe: event.target.checked ? true : null })}
              />
              <span className="field-label" style={{ margin: 0 }}>
                CPU MoE
                <InfoTip text={INFO.cpuMoe} />
              </span>
            </label>
            <Field label="N CPU MoE layers" info={INFO.nCpuMoe}>
              <input
                type="number"
                value={params.nCpuMoe ?? ''}
                onChange={(event) => patch({ nCpuMoe: parseOptionalInt(event.target.value) })}
                className={inputClass}
                placeholder="omit"
              />
            </Field>
            <Field label="Load mode" info={INFO.loadMode}>
              <input
                value={params.loadMode ?? ''}
                onChange={(event) => patch({ loadMode: event.target.value || null })}
                className={inputClass}
                placeholder="omit"
              />
            </Field>
            <label className="flex items-end gap-2">
              <input
                type="checkbox"
                checked={Boolean(params.jinja)}
                onChange={(event) => patch({ jinja: event.target.checked ? true : null })}
              />
              <span className="field-label" style={{ margin: 0 }}>
                Jinja
                <InfoTip text={INFO.jinja} />
              </span>
            </label>
            <Field label="Chat template" info={INFO.chatTemplate}>
              <input
                value={params.chatTemplate ?? ''}
                onChange={(event) => patch({ chatTemplate: event.target.value || null })}
                className={inputClass}
                placeholder="omit"
              />
            </Field>
            <label className="flex items-end gap-2">
              <input
                type="checkbox"
                checked={Boolean(params.metrics)}
                onChange={(event) => patch({ metrics: event.target.checked ? true : null })}
              />
              <span className="field-label" style={{ margin: 0 }}>
                Metrics
                <InfoTip text={INFO.metrics} />
              </span>
            </label>
            <Field label="Model alias" info={INFO.alias}>
              <input
                value={params.alias ?? ''}
                onChange={(event) => patch({ alias: event.target.value || null })}
                className={inputClass}
                placeholder="omit"
              />
            </Field>
          </div>
        </details>
      </section>

      <section className="card space-y-3">
        <h2 className="card-title">Extra flags</h2>
        <label>
          <span className="field-label">
            Flags
            <InfoTip text={INFO.extraFlags} />
          </span>
          <textarea
            value={params.extraFlags}
            onChange={(event) => patch({ extraFlags: event.target.value })}
            rows={3}
            className={inputClass}
            placeholder="appended last — do not set -m, --model, --host, or --port"
          />
        </label>
        {extraFlagsError ? <p className="err-banner">{extraFlagsError}</p> : null}
      </section>

      <section className="card space-y-3">
        <div className="preview-head">
          <h2 className="card-title">Command preview</h2>
          <button
            type="button"
            className="toggle"
            disabled={!command}
            onClick={() => {
              if (!command) return;
              void navigator.clipboard.writeText(command).then(() => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1500);
              });
            }}
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <pre className="preview-box">{command || '…'}</pre>
      </section>
    </>
  );
}
