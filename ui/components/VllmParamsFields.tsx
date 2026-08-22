import { useEffect, useState, type ReactNode } from 'react';
import { MaybeCollapsible } from '@components/CollapsibleCard';
import InheritPill from '@components/InheritPill';
import InfoTip from '@components/InfoTip';
import {
  VLLM_ADVANCED_KEYS,
  VLLM_ENGINE_DEFAULTS,
  VLLM_EXTRA_KEYS,
  VLLM_LOAD_KEYS,
  clearParamKeys,
  inheritPlaceholder,
  inheritResolved,
  sectionInheritLine,
  sectionSetCount,
  type InheritLayer,
} from '@/lib/inherit';
import { apiErrorStatus, nodeService } from '@services/nodeService';
import type { ServerParams } from '@/types';

const inputClass = 'field-input';

const INFO = {
  tensorParallelSize: 'Number of GPUs to split the model across (--tensor-parallel-size / -tp). 1 keeps the model on one GPU.',
  gpuMemoryUtilization: 'Fraction of GPU memory vLLM may use (--gpu-memory-utilization). Lower this if the node also runs other GPU work.',
  maxModelLen: 'Maximum context length in tokens (--max-model-len). Omit to use the model default. Long-context models (128k/256k) often need a cap or KV cache will not fit.',
  dtype: 'Weight/activation dtype (--dtype): auto, half, float16, bfloat16, or float32.',
  quantization: 'Quantization method (--quantization), e.g. awq, gptq, fp8, bitsandbytes. Omit if the weights are already the right format.',
  maxNumSeqs: 'Maximum concurrent sequences (--max-num-seqs).',
  swapSpace: 'CPU swap space per GPU in GiB (--swap-space) for overflow KV cache.',
  kvCacheDtype: 'KV cache dtype (--kv-cache-dtype), e.g. auto, fp8, fp8_e5m2.',
  servedModelName: 'Name reported on /v1/models (--served-model-name).',
  trustRemoteCode: 'Allow custom model code from the Hugging Face repo (--trust-remote-code).',
  enforceEager: 'Disable CUDA graphs (--enforce-eager). Slower, sometimes needed to debug or save memory.',
  enablePrefixCaching: 'Reuse KV cache prefixes across requests (--enable-prefix-caching).',
  extraFlags: 'Raw extra CLI flags, appended last. Do not set --host, --port, --model, or -m — those are owned by the form.',
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

function parseOptionalFloat(value: string): number | null {
  if (value.trim() === '') return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function boolSelect(value: boolean | null | undefined): '' | 'on' | 'off' {
  if (value === true) return 'on';
  if (value === false) return 'off';
  return '';
}

export interface VllmParamsFieldsProps {
  params: ServerParams;
  listenHost: string;
  listenPort: number;
  modelDir: string;
  modelFilename?: string;
  vllmImage?: string;
  engine?: string;
  llamaServerPath?: string;
  onChange: (params: ServerParams) => void;
  onPreviewError: (message: string | null) => void;
  emptyLabel?: string;
  inheritValues?: Partial<ServerParams> | null;
  applySettings?: boolean;
  collapsible?: boolean;
}

export default function VllmParamsFields({
  params,
  listenHost,
  listenPort,
  modelDir,
  modelFilename = '$MODEL',
  vllmImage = '',
  engine = 'vllm',
  llamaServerPath = '',
  onChange,
  onPreviewError,
  emptyLabel = 'Settings',
  inheritValues = null,
  applySettings = true,
  collapsible = false,
}: VllmParamsFieldsProps) {
  const [command, setCommand] = useState('');
  const [copied, setCopied] = useState(false);
  const [extraFlagsError, setExtraFlagsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const handle = window.setTimeout(() => {
      void (async () => {
        try {
          const preview = await nodeService.previewCommand(
            {
              listenHost,
              listenPort,
              modelDir,
              serverParams: params,
              modelFilename: modelFilename || '$MODEL',
              vllmImage,
              llamaServerPath,
              applySettings,
            },
            engine,
          );
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
  }, [listenHost, listenPort, modelDir, modelFilename, vllmImage, engine, llamaServerPath, params, onPreviewError, applySettings]);

  function patch(partial: Partial<ServerParams>) {
    onChange({ ...params, ...partial });
  }

  const resetLabel = emptyLabel === 'Settings' ? 'Reset to Settings' : 'Reset to engine';

  function resolved(key: keyof ServerParams) {
    return inheritResolved(params[key], inheritValues?.[key], VLLM_ENGINE_DEFAULTS[key]);
  }

  function hint(key: keyof ServerParams): string {
    return inheritPlaceholder(inheritResolved(null, inheritValues?.[key], VLLM_ENGINE_DEFAULTS[key]));
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
        description={sectionInheritLine(VLLM_LOAD_KEYS, params, inheritValues, VLLM_ENGINE_DEFAULTS)}
        actions={resetAction(VLLM_LOAD_KEYS)}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tensor parallel" info={INFO.tensorParallelSize} source={source('tensorParallelSize')}>
            <input
              type="number"
              min={1}
              value={params.tensorParallelSize ?? ''}
              onChange={(event) => patch({ tensorParallelSize: parseOptionalInt(event.target.value) })}
              className={inputClass}
              placeholder={hint('tensorParallelSize')}
            />
          </Field>
          <Field label="GPU memory util" info={INFO.gpuMemoryUtilization} source={source('gpuMemoryUtilization')}>
            <input
              type="number"
              min={0.1}
              max={1}
              step={0.05}
              value={params.gpuMemoryUtilization ?? ''}
              onChange={(event) => patch({ gpuMemoryUtilization: parseOptionalFloat(event.target.value) })}
              className={inputClass}
              placeholder={hint('gpuMemoryUtilization')}
            />
          </Field>
          <Field label="Max model length" info={INFO.maxModelLen} source={source('maxModelLen')}>
            <input
              type="number"
              value={params.maxModelLen ?? ''}
              onChange={(event) => patch({ maxModelLen: parseOptionalInt(event.target.value) })}
              className={inputClass}
              placeholder={hint('maxModelLen')}
            />
          </Field>
          <Field label="Dtype" info={INFO.dtype} source={source('dtype')}>
            <select
              value={params.dtype ?? ''}
              onChange={(event) => patch({ dtype: event.target.value || null })}
              className={inputClass}
            >
              <option value="">{hint('dtype')}</option>
              <option value="auto">auto</option>
              <option value="half">half</option>
              <option value="float16">float16</option>
              <option value="bfloat16">bfloat16</option>
              <option value="float32">float32</option>
            </select>
          </Field>
          <Field label="Quantization" info={INFO.quantization} source={source('quantization')}>
            <input
              value={params.quantization ?? ''}
              onChange={(event) => patch({ quantization: event.target.value || null })}
              className={inputClass}
              placeholder={hint('quantization')}
            />
          </Field>
          <Field label="Max sequences" info={INFO.maxNumSeqs} source={source('maxNumSeqs')}>
            <input
              type="number"
              value={params.maxNumSeqs ?? ''}
              onChange={(event) => patch({ maxNumSeqs: parseOptionalInt(event.target.value) })}
              className={inputClass}
              placeholder={hint('maxNumSeqs')}
            />
          </Field>
        </div>
      </MaybeCollapsible>

      <MaybeCollapsible
        title="Advanced"
        collapsible
        defaultOpen={false}
        className="card"
        description={sectionInheritLine(VLLM_ADVANCED_KEYS, params, inheritValues, VLLM_ENGINE_DEFAULTS)}
        actions={resetAction(VLLM_ADVANCED_KEYS)}
      >
        <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Swap space (GiB)" info={INFO.swapSpace} source={source('swapSpace')}>
              <input
                type="number"
                value={params.swapSpace ?? ''}
                onChange={(event) => patch({ swapSpace: parseOptionalInt(event.target.value) })}
                className={inputClass}
                placeholder={hint('swapSpace')}
              />
            </Field>
            <Field label="KV cache dtype" info={INFO.kvCacheDtype} source={source('kvCacheDtype')}>
              <input
                value={params.kvCacheDtype ?? ''}
                onChange={(event) => patch({ kvCacheDtype: event.target.value || null })}
                className={inputClass}
                placeholder={hint('kvCacheDtype')}
              />
            </Field>
            <Field label="Served model name" info={INFO.servedModelName} source={source('servedModelName')}>
              <input
                value={params.servedModelName ?? params.alias ?? ''}
                onChange={(event) => patch({ servedModelName: event.target.value || null })}
                className={inputClass}
                placeholder={hint('servedModelName')}
              />
            </Field>
            <Field label="Trust remote code" info={INFO.trustRemoteCode} source={source('trustRemoteCode')}>
              <select
                value={boolSelect(params.trustRemoteCode)}
                onChange={(event) => {
                  const next = event.target.value;
                  patch({ trustRemoteCode: next === '' ? null : next === 'on' });
                }}
                className={inputClass}
              >
                <option value="">{hint('trustRemoteCode')}</option>
                <option value="on">on</option>
                <option value="off">off</option>
              </select>
            </Field>
            <Field label="Enforce eager" info={INFO.enforceEager} source={source('enforceEager')}>
              <select
                value={boolSelect(params.enforceEager)}
                onChange={(event) => {
                  const next = event.target.value;
                  patch({ enforceEager: next === '' ? null : next === 'on' });
                }}
                className={inputClass}
              >
                <option value="">{hint('enforceEager')}</option>
                <option value="on">on</option>
                <option value="off">off</option>
              </select>
            </Field>
            <Field label="Prefix caching" info={INFO.enablePrefixCaching} source={source('enablePrefixCaching')}>
              <select
                value={boolSelect(params.enablePrefixCaching)}
                onChange={(event) => {
                  const next = event.target.value;
                  patch({ enablePrefixCaching: next === '' ? null : next === 'on' });
                }}
                className={inputClass}
              >
                <option value="">{hint('enablePrefixCaching')}</option>
                <option value="on">on</option>
                <option value="off">off</option>
              </select>
            </Field>
          </div>
      </MaybeCollapsible>

      <MaybeCollapsible
        title="Extra flags"
        collapsible={collapsible}
        className="card space-y-3"
        description={sectionInheritLine(VLLM_EXTRA_KEYS, params, inheritValues, VLLM_ENGINE_DEFAULTS)}
        actions={resetAction(VLLM_EXTRA_KEYS)}
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
            placeholder={hint('extraFlags') || 'appended last — do not set --host, --port, --model, or -m'}
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
