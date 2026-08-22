import type { ServerParams } from '../types';

/** Match `param_is_set` in api/helpers.py. `0` and `false` are real values. */
export function isParamSet(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string' && value.trim() === '') return false;
  return true;
}

export function formatParamValue(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'on' : 'off';
  return String(value);
}

/** Match `llama_cpp_engine_defaults` in api/helpers.py. */
export const LLAMA_ENGINE_DEFAULTS: Partial<ServerParams> = {
  ctxSize: 0,
  gpuLayers: 'auto',
  flashAttn: 'auto',
  parallel: 1,
  kvOffload: true,
  fit: 'on',
};

/** Match `vllm_engine_defaults` in api/helpers.py. */
export const VLLM_ENGINE_DEFAULTS: Partial<ServerParams> = {
  tensorParallelSize: 1,
  gpuMemoryUtilization: 0.9,
};

export const LLAMA_LOAD_KEYS = [
  'ctxSize',
  'gpuLayers',
  'flashAttn',
  'threads',
  'parallel',
  'batchSize',
  'ubatchSize',
  'kvOffload',
  'fit',
  'cacheTypeK',
  'cacheTypeV',
] as const satisfies readonly (keyof ServerParams)[];

export const LLAMA_ADVANCED_KEYS = [
  'nPredict',
  'keep',
  'threadsBatch',
  'splitMode',
  'mainGpu',
  'tensorSplit',
  'device',
  'cpuMoe',
  'nCpuMoe',
  'loadMode',
  'jinja',
  'chatTemplate',
  'metrics',
  'alias',
] as const satisfies readonly (keyof ServerParams)[];

export const LLAMA_EXTRA_KEYS = ['extraFlags'] as const satisfies readonly (keyof ServerParams)[];

export const VLLM_LOAD_KEYS = [
  'tensorParallelSize',
  'gpuMemoryUtilization',
  'maxModelLen',
  'dtype',
  'quantization',
  'maxNumSeqs',
] as const satisfies readonly (keyof ServerParams)[];

export const VLLM_ADVANCED_KEYS = [
  'swapSpace',
  'kvCacheDtype',
  'servedModelName',
  'trustRemoteCode',
  'enforceEager',
  'enablePrefixCaching',
] as const satisfies readonly (keyof ServerParams)[];

export const VLLM_EXTRA_KEYS = ['extraFlags'] as const satisfies readonly (keyof ServerParams)[];

export type InheritLayer = 'set' | 'settings' | 'engine';

export type InheritResolved = {
  layer: InheritLayer;
  value: unknown;
};

export function inheritResolved(
  value: unknown,
  settingsValue: unknown,
  engineValue: unknown,
): InheritResolved {
  if (isParamSet(value)) return { layer: 'set', value };
  if (isParamSet(settingsValue)) return { layer: 'settings', value: settingsValue };
  return { layer: 'engine', value: engineValue };
}

export function inheritPlaceholder(resolved: InheritResolved): string {
  if (resolved.layer === 'set') return '';
  if (!isParamSet(resolved.value)) return 'engine default';
  const source = resolved.layer === 'settings' ? 'Settings' : 'engine';
  return `${source}: ${formatParamValue(resolved.value)}`;
}

export function inheritBadge(layer: InheritLayer): string {
  if (layer === 'set') return 'set';
  if (layer === 'settings') return 'Settings';
  return 'engine';
}

export function sectionInheritLine(
  keys: readonly (keyof ServerParams)[],
  params: Partial<ServerParams>,
  settings: Partial<ServerParams> | null | undefined,
  engineDefaults: Partial<ServerParams>,
): string {
  let set = 0;
  let fromSettings = 0;
  let fromEngine = 0;
  for (const key of keys) {
    const resolved = inheritResolved(params[key], settings?.[key], engineDefaults[key]);
    if (resolved.layer === 'set') set += 1;
    else if (resolved.layer === 'settings') fromSettings += 1;
    else fromEngine += 1;
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

export function sectionSetCount(
  keys: readonly (keyof ServerParams)[],
  params: Partial<ServerParams>,
): number {
  return keys.filter((key) => isParamSet(params[key])).length;
}

export function clearParamKeys(params: ServerParams, keys: readonly (keyof ServerParams)[]): ServerParams {
  const next: ServerParams = { ...params };
  for (const key of keys) {
    if (key === 'extraFlags') next.extraFlags = '';
    else (next as Record<string, unknown>)[key] = null;
  }
  return next;
}
