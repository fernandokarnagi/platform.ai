import { useEffect, useState, type ReactNode } from 'react';
import { MaybeCollapsible } from '@components/CollapsibleCard';
import InheritPill from '@components/InheritPill';
import InfoTip from '@components/InfoTip';
import {
  LLAMA_ADVANCED_KEYS,
  LLAMA_ENGINE_DEFAULTS,
  LLAMA_EXTRA_KEYS,
  LLAMA_LOAD_KEYS,
  clearParamKeys,
  inheritPlaceholder,
  inheritResolved,
  sectionInheritLine,
  sectionSetCount,
  type InheritLayer,
} from '@/lib/inherit';
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
  jinja: 'Enable Jinja chat templates (--jinja). Needed for many tool-calling models. Turn this on to paste a custom template.',
  chatTemplate: 'Built-in template name such as chatml or llama3 (--chat-template).',
  jinjaTemplate: 'Jinja chat template used on llama-server start (--chat-template). Leave empty to use the template stored in the model. --jinja is passed before this flag so custom templates are accepted.',
  metrics: 'Expose Prometheus metrics on the server (--metrics).',
  alias: 'Name the model reports on the OpenAI /v1/models API (-a / --alias).',
  extraFlags: 'Raw extra CLI flags, appended last. Do not set -m, --model, --models-dir, --host, or --port — those are owned by the form.',
};

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function Field({
  label,
  info,
  source,
  children,
}: {
  label: string;
  info?: string;
  source?: InheritLayer;
  children: ReactNode;
}) {
  return (
    <div>
      <span className="field-label">
        {label}
        {info ? <InfoTip text={info} /> : null}
        {source ? <InheritPill layer={source} /> : null}
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

function gpuMode(value: string | number | null | undefined): 'inherit' | 'auto' | 'all' | 'number' {
  if (value === null || value === undefined || value === '') return 'inherit';
  if (value === 'auto' || value === 'all') return value;
  return 'number';
}

function boolSelect(value: boolean | null | undefined): '' | 'on' | 'off' {
  if (value === true) return 'on';
  if (value === false) return 'off';
  return '';
}

export interface ServerParamsFieldsProps {
  params: ServerParams;
  listenHost: string;
  listenPort: number;
  modelDir: string;
  onChange: (params: ServerParams) => void;
  onPreviewError: (message: string | null) => void;
  emptyLabel?: string;
  inheritValues?: Partial<ServerParams> | null;
  applySettings?: boolean;
  collapsible?: boolean;
}

export default function ServerParamsFields({
  params,
  listenHost,
  listenPort,
  modelDir,
  onChange,
  onPreviewError,
  emptyLabel = 'Settings',
  inheritValues = null,
  applySettings = true,
  collapsible = false,
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
            applySettings,
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
  }, [listenHost, listenPort, modelDir, params, onPreviewError, applySettings]);

  function patch(partial: Partial<ServerParams>) {
    onChange({ ...params, ...partial });
  }

  const mode = gpuMode(params.gpuLayers);
  const resetLabel = emptyLabel === 'Settings' ? 'Reset to Settings' : 'Reset to engine';

  function resolved(key: keyof ServerParams) {
    return inheritResolved(params[key], inheritValues?.[key], LLAMA_ENGINE_DEFAULTS[key]);
  }

  function hint(key: keyof ServerParams): string {
    return inheritPlaceholder(inheritResolved(null, inheritValues?.[key], LLAMA_ENGINE_DEFAULTS[key]));
  }

  function source(key: keyof ServerParams): InheritLayer {
    return resolved(key).layer;
  }

  function resetAction(keys: readonly (keyof ServerParams)[]) {
    const set = sectionSetCount(keys, params);
    return (
      <button
        type="button"
        className="toggle"
        disabled={set === 0}
        onClick={() => onChange(clearParamKeys(params, keys))}
      >
        {resetLabel}
      </button>
    );
  }

  return (
    <>
      <MaybeCollapsible
        title="Load parameters"
        collapsible={collapsible}
        description={sectionInheritLine(LLAMA_LOAD_KEYS, params, inheritValues, LLAMA_ENGINE_DEFAULTS)}
        actions={resetAction(LLAMA_LOAD_KEYS)}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Context length" info={INFO.ctxSize} source={source('ctxSize')}>
            <input
              type="number"
              value={params.ctxSize ?? ''}
              onChange={(event) => patch({ ctxSize: parseOptionalInt(event.target.value) })}
              className={inputClass}
              placeholder={hint('ctxSize')}
            />
          </Field>
          <div>
            <span className="field-label">
              GPU layers
              <InfoTip text={INFO.gpuLayers} />
              <InheritPill layer={source('gpuLayers')} />
            </span>
            <div className="flex gap-2">
              <select
                value={mode === 'inherit' ? '' : mode}
                onChange={(event) => {
                  const next = event.target.value;
                  if (!next) {
                    patch({ gpuLayers: null });
                    return;
                  }
                  if (next === 'auto' || next === 'all') {
                    patch({ gpuLayers: next });
                    return;
                  }
                  patch({ gpuLayers: typeof params.gpuLayers === 'number' ? params.gpuLayers : 0 });
                }}
                className={inputClass}
              >
                <option value="">{hint('gpuLayers')}</option>
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
          <Field label="Flash attention" info={INFO.flashAttn} source={source('flashAttn')}>
            <select
              value={params.flashAttn ?? ''}
              onChange={(event) =>
                patch({ flashAttn: event.target.value === '' ? null : (event.target.value as FlashAttn) })
              }
              className={inputClass}
            >
              <option value="">{hint('flashAttn')}</option>
              <option value="auto">auto</option>
              <option value="on">on</option>
              <option value="off">off</option>
            </select>
          </Field>
          <Field label="CPU threads" info={INFO.threads} source={source('threads')}>
            <input
              type="number"
              value={params.threads ?? ''}
              onChange={(event) => patch({ threads: parseOptionalInt(event.target.value) })}
              className={inputClass}
              placeholder={hint('threads')}
            />
          </Field>
          <Field label="Parallel slots" info={INFO.parallel} source={source('parallel')}>
            <input
              type="number"
              value={params.parallel ?? ''}
              onChange={(event) => patch({ parallel: parseOptionalInt(event.target.value) })}
              className={inputClass}
              placeholder={hint('parallel')}
            />
          </Field>
          <Field label="Batch size" info={INFO.batchSize} source={source('batchSize')}>
            <input
              type="number"
              value={params.batchSize ?? ''}
              onChange={(event) => patch({ batchSize: parseOptionalInt(event.target.value) })}
              className={inputClass}
              placeholder={hint('batchSize')}
            />
          </Field>
          <Field label="µbatch size" info={INFO.ubatchSize} source={source('ubatchSize')}>
            <input
              type="number"
              value={params.ubatchSize ?? ''}
              onChange={(event) => patch({ ubatchSize: parseOptionalInt(event.target.value) })}
              className={inputClass}
              placeholder={hint('ubatchSize')}
            />
          </Field>
          <Field label="KV offload" info={INFO.kvOffload} source={source('kvOffload')}>
            <select
              value={boolSelect(params.kvOffload)}
              onChange={(event) => {
                const next = event.target.value;
                patch({ kvOffload: next === '' ? null : next === 'on' });
              }}
              className={inputClass}
            >
              <option value="">{hint('kvOffload')}</option>
              <option value="on">on</option>
              <option value="off">off</option>
            </select>
          </Field>
          <Field label="Fit in memory" info={INFO.fit} source={source('fit')}>
            <select
              value={params.fit ?? ''}
              onChange={(event) => patch({ fit: event.target.value === '' ? null : (event.target.value as FitMode) })}
              className={inputClass}
            >
              <option value="">{hint('fit')}</option>
              <option value="on">on</option>
              <option value="off">off</option>
            </select>
          </Field>
          <Field label="Cache type K" info={INFO.cacheTypeK} source={source('cacheTypeK')}>
            <select
              value={params.cacheTypeK ?? ''}
              onChange={(event) =>
                patch({ cacheTypeK: event.target.value === '' ? null : (event.target.value as CacheType) })
              }
              className={inputClass}
            >
              <option value="">{hint('cacheTypeK')}</option>
              {CACHE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Cache type V" info={INFO.cacheTypeV} source={source('cacheTypeV')}>
            <select
              value={params.cacheTypeV ?? ''}
              onChange={(event) =>
                patch({ cacheTypeV: event.target.value === '' ? null : (event.target.value as CacheType) })
              }
              className={inputClass}
            >
              <option value="">{hint('cacheTypeV')}</option>
              {CACHE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </MaybeCollapsible>

      <MaybeCollapsible
        title="Advanced"
        collapsible
        defaultOpen={false}
        className="card"
        description={sectionInheritLine(LLAMA_ADVANCED_KEYS, params, inheritValues, LLAMA_ENGINE_DEFAULTS)}
        actions={resetAction(LLAMA_ADVANCED_KEYS)}
      >
        <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Max predict" info={INFO.nPredict} source={source('nPredict')}>
              <input
                type="number"
                value={params.nPredict ?? ''}
                onChange={(event) => patch({ nPredict: parseOptionalInt(event.target.value) })}
                className={inputClass}
                placeholder={hint('nPredict')}
              />
            </Field>
            <Field label="Keep tokens" info={INFO.keep} source={source('keep')}>
              <input
                type="number"
                value={params.keep ?? ''}
                onChange={(event) => patch({ keep: parseOptionalInt(event.target.value) })}
                className={inputClass}
                placeholder={hint('keep')}
              />
            </Field>
            <Field label="Batch threads" info={INFO.threadsBatch} source={source('threadsBatch')}>
              <input
                type="number"
                value={params.threadsBatch ?? ''}
                onChange={(event) => patch({ threadsBatch: parseOptionalInt(event.target.value) })}
                className={inputClass}
                placeholder={hint('threadsBatch')}
              />
            </Field>
            <Field label="Split mode" info={INFO.splitMode} source={source('splitMode')}>
              <input
                value={params.splitMode ?? ''}
                onChange={(event) => patch({ splitMode: event.target.value || null })}
                className={inputClass}
                placeholder={hint('splitMode')}
              />
            </Field>
            <Field label="Main GPU" info={INFO.mainGpu} source={source('mainGpu')}>
              <input
                type="number"
                value={params.mainGpu ?? ''}
                onChange={(event) => patch({ mainGpu: parseOptionalInt(event.target.value) })}
                className={inputClass}
                placeholder={hint('mainGpu')}
              />
            </Field>
            <Field label="Tensor split" info={INFO.tensorSplit} source={source('tensorSplit')}>
              <input
                value={params.tensorSplit ?? ''}
                onChange={(event) => patch({ tensorSplit: event.target.value || null })}
                className={inputClass}
                placeholder={hint('tensorSplit')}
              />
            </Field>
            <Field label="Device list" info={INFO.device} source={source('device')}>
              <input
                value={params.device ?? ''}
                onChange={(event) => patch({ device: event.target.value || null })}
                className={inputClass}
                placeholder={hint('device')}
              />
            </Field>
            <Field label="CPU MoE" info={INFO.cpuMoe} source={source('cpuMoe')}>
              <select
                value={boolSelect(params.cpuMoe)}
                onChange={(event) => {
                  const next = event.target.value;
                  patch({ cpuMoe: next === '' ? null : next === 'on' });
                }}
                className={inputClass}
              >
                <option value="">{hint('cpuMoe')}</option>
                <option value="on">on</option>
                <option value="off">off</option>
              </select>
            </Field>
            <Field label="N CPU MoE layers" info={INFO.nCpuMoe} source={source('nCpuMoe')}>
              <input
                type="number"
                value={params.nCpuMoe ?? ''}
                onChange={(event) => patch({ nCpuMoe: parseOptionalInt(event.target.value) })}
                className={inputClass}
                placeholder={hint('nCpuMoe')}
              />
            </Field>
            <Field label="Load mode" info={INFO.loadMode} source={source('loadMode')}>
              <input
                value={params.loadMode ?? ''}
                onChange={(event) => patch({ loadMode: event.target.value || null })}
                className={inputClass}
                placeholder={hint('loadMode')}
              />
            </Field>
            <Field label="Jinja" info={INFO.jinja} source={source('jinja')}>
              <select
                value={boolSelect(params.jinja)}
                onChange={(event) => {
                  const next = event.target.value;
                  patch({ jinja: next === '' ? null : next === 'on' });
                }}
                className={inputClass}
              >
                <option value="">{hint('jinja')}</option>
                <option value="on">on</option>
                <option value="off">off</option>
              </select>
            </Field>
            {params.jinja ? (
              <div className="sm:col-span-2">
                <Field label="Jinja template" info={INFO.jinjaTemplate} source={source('chatTemplate')}>
                  <textarea
                    value={params.chatTemplate ?? ''}
                    onChange={(event) => patch({ chatTemplate: event.target.value || null })}
                    rows={12}
                    spellCheck={false}
                    className={`${inputClass} field-mono`}
                    placeholder={hint('chatTemplate') || "Paste the Jinja chat template. Leave empty to use the model's built-in template."}
                  />
                </Field>
              </div>
            ) : (
              <Field label="Chat template" info={INFO.chatTemplate} source={source('chatTemplate')}>
                <input
                  value={params.chatTemplate ?? ''}
                  onChange={(event) => patch({ chatTemplate: event.target.value || null })}
                  className={inputClass}
                  placeholder={hint('chatTemplate')}
                />
              </Field>
            )}
            <Field label="Metrics" info={INFO.metrics} source={source('metrics')}>
              <select
                value={boolSelect(params.metrics)}
                onChange={(event) => {
                  const next = event.target.value;
                  patch({ metrics: next === '' ? null : next === 'on' });
                }}
                className={inputClass}
              >
                <option value="">{hint('metrics')}</option>
                <option value="on">on</option>
                <option value="off">off</option>
              </select>
            </Field>
            <Field label="Model alias" info={INFO.alias} source={source('alias')}>
              <input
                value={params.alias ?? ''}
                onChange={(event) => patch({ alias: event.target.value || null })}
                className={inputClass}
                placeholder={hint('alias')}
              />
            </Field>
          </div>
      </MaybeCollapsible>

      <MaybeCollapsible
        title="Extra flags"
        collapsible={collapsible}
        className="card space-y-3"
        description={sectionInheritLine(LLAMA_EXTRA_KEYS, params, inheritValues, LLAMA_ENGINE_DEFAULTS)}
        actions={resetAction(LLAMA_EXTRA_KEYS)}
      >
        <label>
          <span className="field-label">
            Flags
            <InfoTip text={INFO.extraFlags} />
            <InheritPill layer={source('extraFlags')} />
          </span>
          <textarea
            value={params.extraFlags ?? ''}
            onChange={(event) => patch({ extraFlags: event.target.value })}
            rows={3}
            className={inputClass}
            placeholder={hint('extraFlags') || 'appended last — do not set -m, --model, --models-dir, --host, or --port'}
          />
        </label>
        {extraFlagsError ? <p className="err-banner">{extraFlagsError}</p> : null}
      </MaybeCollapsible>

      <MaybeCollapsible
        title="Command preview"
        collapsible={collapsible}
        className="card space-y-3"
        actions={
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
        }
      >
        <pre className="preview-box">{command || '…'}</pre>
      </MaybeCollapsible>
    </>
  );
}
