import type { EngineType } from '@/types';

export function isVllm(engine?: string | null): boolean {
  return engine === 'vllm';
}

export function engineLabel(engine?: string | null): string {
  return isVllm(engine) ? 'vLLM' : 'llama.cpp';
}

export function engineBinaryName(engine?: string | null): string {
  return isVllm(engine) ? 'vLLM' : 'llama-server';
}

export function defaultListenPort(engine?: string | null): number {
  return isVllm(engine) ? 8000 : 8080;
}

export function previewEnginePath(engine?: EngineType | string | null): string {
  return isVllm(engine) ? 'vllm' : 'llama.cpp';
}
