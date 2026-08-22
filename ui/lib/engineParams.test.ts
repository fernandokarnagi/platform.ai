import assert from 'node:assert/strict';
import test from 'node:test';
import { launchParamRows } from './engineParams.ts';
import type { ServerParams } from '../types';

test('empty llama node shows engine defaults with engine pills', () => {
  const { summary, rows } = launchParamRows(
    { listenHost: '0.0.0.0', listenPort: 8080, modelDir: '~/models', engine: 'llama.cpp', serverParams: {} },
    { llamaCpp: {}, vllm: {} },
  );
  assert.equal(summary, 'all inherit engine');
  assert.equal(rows.filter((row) => row.layer === 'engine').length, 6);
  const ctx = rows.find((row) => row.label === 'Context length');
  assert.deepEqual(ctx, { label: 'Context length', value: '0', layer: 'engine' });
  const gpu = rows.find((row) => row.label === 'GPU layers');
  assert.deepEqual(gpu, { label: 'GPU layers', value: 'auto', layer: 'engine' });
  assert.equal(rows.find((row) => row.label === 'CPU threads'), undefined);
});

test('Settings fills empty node fields', () => {
  const { rows } = launchParamRows(
    { listenHost: '0.0.0.0', listenPort: 8080, modelDir: '~/models', engine: 'llama.cpp', serverParams: {} },
    { llamaCpp: { gpuLayers: 'all', cacheTypeK: 'q8_0' }, vllm: {} },
  );
  assert.deepEqual(
    rows.find((row) => row.label === 'GPU layers'),
    { label: 'GPU layers', value: 'all', layer: 'settings' },
  );
  assert.deepEqual(
    rows.find((row) => row.label === 'Cache type K'),
    { label: 'Cache type K', value: 'q8_0', layer: 'settings' },
  );
});

test('node values win over Settings and engine', () => {
  const params = { ctxSize: 4096, gpuLayers: 'all' } as ServerParams;
  const { rows, summary } = launchParamRows(
    { listenHost: '0.0.0.0', listenPort: 8080, modelDir: '~/models', engine: 'llama.cpp', serverParams: params },
    { llamaCpp: { ctxSize: 0, gpuLayers: 'auto' }, vllm: {} },
  );
  assert.match(summary, /2 set/);
  assert.doesNotMatch(summary, /1[0-9] engine/);
  assert.deepEqual(
    rows.find((row) => row.label === 'Context length'),
    { label: 'Context length', value: '4096', layer: 'set' },
  );
});

test('vLLM empty node shows engine tensor parallel and omits unset optionals', () => {
  const { rows } = launchParamRows(
    {
      listenHost: '0.0.0.0',
      listenPort: 8000,
      modelDir: '~/models',
      engine: 'vllm-metal',
      selectedModel: 'Qwen/Qwen2.5-7B-Instruct',
      serverParams: {},
    },
    { llamaCpp: {}, vllm: { maxModelLen: 32768 } },
  );
  assert.deepEqual(
    rows.find((row) => row.label === 'Tensor parallel'),
    { label: 'Tensor parallel', value: '1', layer: 'engine' },
  );
  assert.deepEqual(
    rows.find((row) => row.label === 'Max model length'),
    { label: 'Max model length', value: '32768', layer: 'settings' },
  );
  assert.deepEqual(
    rows.find((row) => row.label === 'vLLM path'),
    { label: 'vLLM path', value: '~/.venv-vllm-metal/bin/vllm', layer: 'engine' },
  );
  assert.equal(rows.find((row) => row.label === 'Quantization'), undefined);
});
