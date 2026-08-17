import { useEffect, useState, type ReactNode } from 'react';
import InfoTip from '@components/InfoTip';
import { apiErrorStatus, nodeService } from '@services/nodeService';
import type { ServerParams } from '@/types';

const inputClass = 'field-input';

const INFO = {
  tensorParallelSize: 'Number of GPUs to split the model across (--tensor-parallel-size / -tp). 1 keeps the model on one GPU.',
  gpuMemoryUtilization: 'Fraction of GPU memory vLLM may use (--gpu-memory-utilization). Lower this if the node also runs other GPU work.',
  maxModelLen: 'Maximum context length in tokens (--max-model-len). Omit to use the model default.',
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

function parseRequiredFloat(value: string, fallback: number): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export interface VllmParamsFieldsProps {
  params: ServerParams;
  listenHost: string;
  listenPort: number;
  modelDir: string;
  modelFilename?: string;
  vllmImage?: string;
  onChange: (params: ServerParams) => void;
  onPreviewError: (message: string | null) => void;
}

export default function VllmParamsFields({
  params,
  listenHost,
  listenPort,
  modelDir,
  modelFilename = '$MODEL',
  vllmImage = '',
  onChange,
  onPreviewError,
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
            },
            'vllm',
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
  }, [listenHost, listenPort, modelDir, modelFilename, vllmImage, params, onPreviewError]);

  function patch(partial: Partial<ServerParams>) {
    onChange({ ...params, ...partial });
  }

  return (
    <>
      <section className="card space-y-4">
        <h2 className="card-title">Load parameters</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tensor parallel" info={INFO.tensorParallelSize}>
            <input
              type="number"
              min={1}
              value={params.tensorParallelSize ?? 1}
              onChange={(event) => patch({ tensorParallelSize: parseRequiredInt(event.target.value, 1) })}
              className={inputClass}
            />
          </Field>
          <Field label="GPU memory util" info={INFO.gpuMemoryUtilization}>
            <input
              type="number"
              min={0.1}
              max={1}
              step={0.05}
              value={params.gpuMemoryUtilization ?? 0.9}
              onChange={(event) => patch({ gpuMemoryUtilization: parseRequiredFloat(event.target.value, 0.9) })}
              className={inputClass}
            />
          </Field>
          <Field label="Max model length" info={INFO.maxModelLen}>
            <input
              type="number"
              value={params.maxModelLen ?? ''}
              onChange={(event) => patch({ maxModelLen: parseOptionalInt(event.target.value) })}
              className={inputClass}
              placeholder="omit"
            />
          </Field>
          <Field label="Dtype" info={INFO.dtype}>
            <select
              value={params.dtype ?? ''}
              onChange={(event) => patch({ dtype: event.target.value || null })}
              className={inputClass}
            >
              <option value="">omit</option>
              <option value="auto">auto</option>
              <option value="half">half</option>
              <option value="float16">float16</option>
              <option value="bfloat16">bfloat16</option>
              <option value="float32">float32</option>
            </select>
          </Field>
          <Field label="Quantization" info={INFO.quantization}>
            <input
              value={params.quantization ?? ''}
              onChange={(event) => patch({ quantization: event.target.value || null })}
              className={inputClass}
              placeholder="omit — awq, gptq, fp8"
            />
          </Field>
          <Field label="Max sequences" info={INFO.maxNumSeqs}>
            <input
              type="number"
              value={params.maxNumSeqs ?? ''}
              onChange={(event) => patch({ maxNumSeqs: parseOptionalInt(event.target.value) })}
              className={inputClass}
              placeholder="omit"
            />
          </Field>
        </div>
      </section>

      <section className="card">
        <details>
          <summary className="card-title cursor-pointer">Advanced</summary>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Swap space (GiB)" info={INFO.swapSpace}>
              <input
                type="number"
                value={params.swapSpace ?? ''}
                onChange={(event) => patch({ swapSpace: parseOptionalInt(event.target.value) })}
                className={inputClass}
                placeholder="omit"
              />
            </Field>
            <Field label="KV cache dtype" info={INFO.kvCacheDtype}>
              <input
                value={params.kvCacheDtype ?? ''}
                onChange={(event) => patch({ kvCacheDtype: event.target.value || null })}
                className={inputClass}
                placeholder="omit — auto, fp8"
              />
            </Field>
            <Field label="Served model name" info={INFO.servedModelName}>
              <input
                value={params.servedModelName ?? params.alias ?? ''}
                onChange={(event) => patch({ servedModelName: event.target.value || null })}
                className={inputClass}
                placeholder="omit"
              />
            </Field>
            <label className="flex items-end gap-2">
              <input
                type="checkbox"
                checked={Boolean(params.trustRemoteCode)}
                onChange={(event) => patch({ trustRemoteCode: event.target.checked ? true : null })}
              />
              <span className="field-label" style={{ margin: 0 }}>
                Trust remote code
                <InfoTip text={INFO.trustRemoteCode} />
              </span>
            </label>
            <label className="flex items-end gap-2">
              <input
                type="checkbox"
                checked={Boolean(params.enforceEager)}
                onChange={(event) => patch({ enforceEager: event.target.checked ? true : null })}
              />
              <span className="field-label" style={{ margin: 0 }}>
                Enforce eager
                <InfoTip text={INFO.enforceEager} />
              </span>
            </label>
            <label className="flex items-end gap-2">
              <input
                type="checkbox"
                checked={Boolean(params.enablePrefixCaching)}
                onChange={(event) => patch({ enablePrefixCaching: event.target.checked ? true : null })}
              />
              <span className="field-label" style={{ margin: 0 }}>
                Prefix caching
                <InfoTip text={INFO.enablePrefixCaching} />
              </span>
            </label>
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
            placeholder="appended last — do not set --host, --port, --model, or -m"
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
