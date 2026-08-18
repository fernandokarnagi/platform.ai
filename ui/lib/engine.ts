import type { EngineType } from '@/types';

export function isVllm(engine?: string | null): boolean {
  return engine === 'vllm' || engine === 'vllm-metal';
}

export function isVllmMetal(engine?: string | null): boolean {
  return engine === 'vllm-metal';
}

export function isVllmDocker(engine?: string | null): boolean {
  return engine === 'vllm';
}

export function engineLabel(engine?: string | null): string {
  if (engine === 'vllm-metal') return 'vLLM Mac Metal';
  if (engine === 'vllm') return 'vLLM AMD ROCm Linux';
  return 'llama.cpp';
}

export function engineBinaryName(engine?: string | null): string {
  return isVllm(engine) ? 'vLLM' : 'llama-server';
}

export function defaultListenPort(engine?: string | null): number {
  return isVllm(engine) ? 8000 : 8080;
}

export function previewEnginePath(engine?: EngineType | string | null): string {
  if (engine === 'vllm-metal') return 'vllm-metal';
  if (isVllm(engine)) return 'vllm';
  return 'llama.cpp';
}
