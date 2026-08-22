import {
  LLAMA_ENGINE_DEFAULTS,
  VLLM_ENGINE_DEFAULTS,
  formatParamValue,
  inheritResolved,
  isParamSet,
  type InheritLayer,
} from './inherit.ts';
import type { ServerParams, Settings } from '../types.ts';

export type EngineParamsSource = {
  listenHost?: string | null;
  listenPort?: number | null;
  modelDir?: string | null;
  serverParams?: ServerParams | null;
  engine?: string | null;
  selectedModel?: string | null;
  vllmImage?: string | null;
  llamaServerPath?: string | null;
};

export type ParamRow = {
  label: string;
  value: string;
  layer?: InheritLayer;
};

function isVllm(engine?: string | null): boolean {
  return engine === 'vllm' || engine === 'vllm-metal';
}

function isVllmMetal(engine?: string | null): boolean {
  return engine === 'vllm-metal';
}

function isVllmDocker(engine?: string | null): boolean {
  return engine === 'vllm';
}

type LaunchField = {
  label: string;
  key: keyof ServerParams;
  always?: boolean;
};

const LLAMA_FIELDS: LaunchField[] = [
  { label: 'Context length', key: 'ctxSize', always: true },
  { label: 'GPU layers', key: 'gpuLayers', always: true },
  { label: 'Flash attention', key: 'flashAttn', always: true },
  { label: 'Parallel slots', key: 'parallel', always: true },
  { label: 'KV offload', key: 'kvOffload', always: true },
  { label: 'Fit in memory', key: 'fit', always: true },
  { label: 'CPU threads', key: 'threads' },
  { label: 'Batch size', key: 'batchSize' },
  { label: 'µbatch size', key: 'ubatchSize' },
  { label: 'Cache type K', key: 'cacheTypeK' },
  { label: 'Cache type V', key: 'cacheTypeV' },
  { label: 'Max predict', key: 'nPredict' },
  { label: 'Keep tokens', key: 'keep' },
  { label: 'Batch threads', key: 'threadsBatch' },
  { label: 'Split mode', key: 'splitMode' },
  { label: 'Main GPU', key: 'mainGpu' },
  { label: 'Tensor split', key: 'tensorSplit' },
  { label: 'Device list', key: 'device' },
  { label: 'CPU MoE', key: 'cpuMoe' },
  { label: 'N CPU MoE layers', key: 'nCpuMoe' },
  { label: 'Load mode', key: 'loadMode' },
  { label: 'Jinja', key: 'jinja' },
  { label: 'Chat template', key: 'chatTemplate' },
  { label: 'Metrics', key: 'metrics' },
  { label: 'Model alias', key: 'alias' },
  { label: 'Extra flags', key: 'extraFlags' },
];

const VLLM_FIELDS: LaunchField[] = [
  { label: 'Tensor parallel', key: 'tensorParallelSize', always: true },
  { label: 'GPU memory util', key: 'gpuMemoryUtilization', always: true },
  { label: 'Max model length', key: 'maxModelLen' },
  { label: 'Dtype', key: 'dtype' },
  { label: 'Quantization', key: 'quantization' },
  { label: 'Max sequences', key: 'maxNumSeqs' },
  { label: 'Swap space', key: 'swapSpace' },
  { label: 'KV cache dtype', key: 'kvCacheDtype' },
  { label: 'Served model name', key: 'servedModelName' },
  { label: 'Trust remote code', key: 'trustRemoteCode' },
  { label: 'Enforce eager', key: 'enforceEager' },
  { label: 'Prefix caching', key: 'enablePrefixCaching' },
  { label: 'Extra flags', key: 'extraFlags' },
];

function nodeValue(params: ServerParams, key: keyof ServerParams): unknown {
  if (key === 'servedModelName') return params.servedModelName ?? params.alias;
  return params[key];
}

function settingsValue(settings: Partial<ServerParams> | null | undefined, key: keyof ServerParams): unknown {
  if (!settings) return undefined;
  if (key === 'servedModelName') return settings.servedModelName ?? settings.alias;
  return settings[key];
}

function display(value: unknown): string | null {
  if (!isParamSet(value)) return null;
  return formatParamValue(value);
}

export function launchParamRows(
  node: EngineParamsSource,
  settings: Pick<Settings, 'llamaCpp' | 'vllm'> | null | undefined,
): { summary: string; rows: ParamRow[] } {
  const params = node.serverParams ?? {};
  const vllm = isVllm(node.engine);
  const inherit = vllm ? (settings?.vllm ?? null) : (settings?.llamaCpp ?? null);
  const defaults = vllm ? VLLM_ENGINE_DEFAULTS : LLAMA_ENGINE_DEFAULTS;
  const fields = vllm ? VLLM_FIELDS : LLAMA_FIELDS;

  const rows: ParamRow[] = [
    { label: 'Listen host', value: display(node.listenHost) ?? '—' },
    { label: 'Listen port', value: display(node.listenPort) ?? '—' },
    { label: 'Model dir', value: display(node.modelDir) ?? '—' },
  ];

  if (vllm) {
    if (isVllmDocker(node.engine)) {
      rows.push({ label: 'Docker image', value: display(node.vllmImage) ?? '—' });
    }
    if (isVllmMetal(node.engine)) {
      const path = node.llamaServerPath?.trim();
      rows.push(
        path
          ? { label: 'vLLM path', value: path, layer: 'set' }
          : { label: 'vLLM path', value: '~/.venv-vllm-metal/bin/vllm', layer: 'engine' },
      );
    }
    rows.push({ label: 'Model', value: display(node.selectedModel) ?? '—' });
  }

  for (const field of fields) {
    const resolved = inheritResolved(nodeValue(params, field.key), settingsValue(inherit, field.key), defaults[field.key]);
    const value = display(resolved.value);
    if (value === null && !field.always) continue;
    rows.push({
      label: field.label,
      value: value ?? '—',
      layer: resolved.layer,
    });
  }

  return {
    summary: visibleInheritLine(rows),
    rows,
  };
}

function visibleInheritLine(rows: ParamRow[]): string {
  let set = 0;
  let fromSettings = 0;
  let fromEngine = 0;
  for (const row of rows) {
    if (row.layer === 'set') set += 1;
    else if (row.layer === 'settings') fromSettings += 1;
    else if (row.layer === 'engine') fromEngine += 1;
  }
  const parts: string[] = [];
  if (set) parts.push(`${set} set`);
  if (fromSettings) parts.push(`${fromSettings} Settings`);
  if (fromEngine) parts.push(`${fromEngine} engine`);
  if (!parts.length) return 'all inherit engine';
  if (set === 0 && fromSettings === 0) return 'all inherit engine';
  if (set === 0 && fromEngine === 0) return 'all inherit Settings';
  return parts.join(' · ');
}
