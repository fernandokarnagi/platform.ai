import { useEffect, useState, type ReactNode } from 'react';
import { nodeService } from '@services/nodeService';
import type { CacheType, FitMode, FlashAttn, ServerParams } from '@/types';

const inputClass =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500';

const CACHE_TYPES: CacheType[] = ['f32', 'f16', 'bf16', 'q8_0', 'q4_0', 'q4_1', 'iq4_nl', 'q5_0', 'q5_1'];

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-700">{label}</span>
      {children}
    </label>
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
}

export default function ServerParamsFields({
  params,
  listenHost,
  listenPort,
  modelDir,
  onChange,
}: ServerParamsFieldsProps) {
  const [command, setCommand] = useState('');
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
        } catch (err) {
          if (cancelled) return;
          setExtraFlagsError(errorMessage(err));
        }
      })();
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [listenHost, listenPort, modelDir, params]);

  function patch(partial: Partial<ServerParams>) {
    onChange({ ...params, ...partial });
  }

  const mode = gpuMode(params.gpuLayers);

  return (
    <>
      <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Load parameters</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Context length">
            <input
              type="number"
              value={params.ctxSize}
              onChange={(event) => patch({ ctxSize: parseRequiredInt(event.target.value, 0) })}
              className={inputClass}
            />
          </Field>
          <div className="text-sm">
            <span className="mb-1 block font-medium text-slate-700">GPU layers</span>
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
          <Field label="Flash attention">
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
          <Field label="CPU threads">
            <input
              type="number"
              value={params.threads ?? ''}
              onChange={(event) => patch({ threads: parseOptionalInt(event.target.value) })}
              className={inputClass}
              placeholder="omit"
            />
          </Field>
          <Field label="Parallel slots">
            <input
              type="number"
              value={params.parallel}
              onChange={(event) => patch({ parallel: parseRequiredInt(event.target.value, 1) })}
              className={inputClass}
            />
          </Field>
          <Field label="Batch size">
            <input
              type="number"
              value={params.batchSize ?? ''}
              onChange={(event) => patch({ batchSize: parseOptionalInt(event.target.value) })}
              className={inputClass}
              placeholder="omit"
            />
          </Field>
          <Field label="µbatch size">
            <input
              type="number"
              value={params.ubatchSize ?? ''}
              onChange={(event) => patch({ ubatchSize: parseOptionalInt(event.target.value) })}
              className={inputClass}
              placeholder="omit"
            />
          </Field>
          <label className="flex items-end gap-2 text-sm">
            <input
              type="checkbox"
              checked={params.kvOffload}
              onChange={(event) => patch({ kvOffload: event.target.checked })}
              className="h-4 w-4 rounded border-slate-300"
            />
            <span className="font-medium text-slate-700">KV offload</span>
          </label>
          <Field label="Fit in memory">
            <select
              value={params.fit}
              onChange={(event) => patch({ fit: event.target.value as FitMode })}
              className={inputClass}
            >
              <option value="on">on</option>
              <option value="off">off</option>
            </select>
          </Field>
          <Field label="Cache type K">
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
          <Field label="Cache type V">
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

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <details>
          <summary className="cursor-pointer text-sm font-semibold uppercase tracking-wide text-slate-500">
            Advanced
          </summary>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Max predict">
              <input
                type="number"
                value={params.nPredict ?? ''}
                onChange={(event) => patch({ nPredict: parseOptionalInt(event.target.value) })}
                className={inputClass}
                placeholder="omit"
              />
            </Field>
            <Field label="Keep tokens">
              <input
                type="number"
                value={params.keep ?? ''}
                onChange={(event) => patch({ keep: parseOptionalInt(event.target.value) })}
                className={inputClass}
                placeholder="omit"
              />
            </Field>
            <Field label="Batch threads">
              <input
                type="number"
                value={params.threadsBatch ?? ''}
                onChange={(event) => patch({ threadsBatch: parseOptionalInt(event.target.value) })}
                className={inputClass}
                placeholder="omit"
              />
            </Field>
            <Field label="Split mode">
              <input
                value={params.splitMode ?? ''}
                onChange={(event) => patch({ splitMode: event.target.value || null })}
                className={inputClass}
                placeholder="omit"
              />
            </Field>
            <Field label="Main GPU">
              <input
                type="number"
                value={params.mainGpu ?? ''}
                onChange={(event) => patch({ mainGpu: parseOptionalInt(event.target.value) })}
                className={inputClass}
                placeholder="omit"
              />
            </Field>
            <Field label="Tensor split">
              <input
                value={params.tensorSplit ?? ''}
                onChange={(event) => patch({ tensorSplit: event.target.value || null })}
                className={inputClass}
                placeholder="omit"
              />
            </Field>
            <Field label="Device list">
              <input
                value={params.device ?? ''}
                onChange={(event) => patch({ device: event.target.value || null })}
                className={inputClass}
                placeholder="omit"
              />
            </Field>
            <label className="flex items-end gap-2 text-sm">
              <input
                type="checkbox"
                checked={Boolean(params.cpuMoe)}
                onChange={(event) => patch({ cpuMoe: event.target.checked ? true : null })}
                className="h-4 w-4 rounded border-slate-300"
              />
              <span className="font-medium text-slate-700">CPU MoE</span>
            </label>
            <Field label="N CPU MoE layers">
              <input
                type="number"
                value={params.nCpuMoe ?? ''}
                onChange={(event) => patch({ nCpuMoe: parseOptionalInt(event.target.value) })}
                className={inputClass}
                placeholder="omit"
              />
            </Field>
            <Field label="Load mode">
              <input
                value={params.loadMode ?? ''}
                onChange={(event) => patch({ loadMode: event.target.value || null })}
                className={inputClass}
                placeholder="omit"
              />
            </Field>
            <label className="flex items-end gap-2 text-sm">
              <input
                type="checkbox"
                checked={Boolean(params.jinja)}
                onChange={(event) => patch({ jinja: event.target.checked ? true : null })}
                className="h-4 w-4 rounded border-slate-300"
              />
              <span className="font-medium text-slate-700">Jinja</span>
            </label>
            <Field label="Chat template">
              <input
                value={params.chatTemplate ?? ''}
                onChange={(event) => patch({ chatTemplate: event.target.value || null })}
                className={inputClass}
                placeholder="omit"
              />
            </Field>
            <label className="flex items-end gap-2 text-sm">
              <input
                type="checkbox"
                checked={Boolean(params.metrics)}
                onChange={(event) => patch({ metrics: event.target.checked ? true : null })}
                className="h-4 w-4 rounded border-slate-300"
              />
              <span className="font-medium text-slate-700">Metrics</span>
            </label>
            <Field label="Model alias">
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

      <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Extra flags</h2>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Flags</span>
          <textarea
            value={params.extraFlags}
            onChange={(event) => patch({ extraFlags: event.target.value })}
            rows={3}
            className={inputClass}
            placeholder="appended last — do not set -m, --model, --host, or --port"
          />
        </label>
        {extraFlagsError ? <p className="text-sm text-red-700">{extraFlagsError}</p> : null}
      </section>

      <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Command preview</h2>
        <pre className="overflow-x-auto rounded-md bg-slate-900 p-3 text-xs leading-5 text-slate-100">
          {command || '…'}
        </pre>
      </section>
    </>
  );
}
