import assert from 'node:assert/strict';
import test from 'node:test';
import {
  chatModelOptions,
  isModelServed,
  localServedModels,
  modelsMatch,
  pickChatModel,
} from './chatModel.ts';

test('pickChatModel prefers selected folder name over the current served path', () => {
  const served = [
    '/mnt/data/vllmmodels/LiquidAI--LFM2.5-2.6B',
    '/mnt/data/vllmmodels/Qwen--Qwen3.8-27B',
  ];
  const current = '/mnt/data/vllmmodels/LiquidAI--LFM2.5-2.6B';
  assert.equal(
    pickChatModel(served, current, 'Qwen--Qwen3.8-27B'),
    '/mnt/data/vllmmodels/Qwen--Qwen3.8-27B',
  );
});

test('pickChatModel keeps the selected folder name when it is not live yet', () => {
  const served = ['/mnt/data/vllmmodels/LiquidAI--LFM2.5-2.6B'];
  const current = '/mnt/data/vllmmodels/LiquidAI--LFM2.5-2.6B';
  assert.equal(pickChatModel(served, current, 'Qwen--Qwen3.8-27B'), 'Qwen--Qwen3.8-27B');
});

test('chatModelOptions inserts the selected model when OpenAI has not listed it', () => {
  const options = chatModelOptions(
    ['/mnt/data/vllmmodels/LiquidAI--LFM2.5-2.6B'],
    'Qwen--Qwen3.8-27B',
  );
  assert.deepEqual(options, ['Qwen--Qwen3.8-27B', '/mnt/data/vllmmodels/LiquidAI--LFM2.5-2.6B']);
});

test('isModelServed matches a snapshot folder to the full served path', () => {
  assert.equal(
    isModelServed(['/mnt/data/vllmmodels/Qwen--Qwen3.8-27B'], 'Qwen--Qwen3.8-27B'),
    true,
  );
  assert.equal(
    isModelServed(['/mnt/data/vllmmodels/LiquidAI--LFM2.5-2.6B'], 'Qwen--Qwen3.8-27B'),
    false,
  );
});

test('modelsMatch treats a GGUF filename as the served id', () => {
  assert.equal(modelsMatch('Qwen3.5-4B-UD-Q4_K_XL', 'Qwen3.5-4B-UD-Q4_K_XL.gguf'), true);
  assert.equal(modelsMatch('Qwen3.5-4B-UD-Q4_K_XL.gguf', 'Qwen3.5-4B-UD-Q4_K_XL'), true);
});

test('localServedModels drops OpenAI ids that are not in the model dir', () => {
  assert.deepEqual(
    localServedModels(
      ['LiquidAI/LFM2.5-2.6B-GGUF', 'Qwen3.5-4B-UD-Q4_K_XL', 'Qwen3.5-35B-A3B-UD-Q2_K_XL'],
      ['Qwen3.5-4B-UD-Q4_K_XL.gguf'],
    ),
    ['Qwen3.5-4B-UD-Q4_K_XL'],
  );
});

test('pickChatModel without a preferred id drops an unserved current model', () => {
  assert.equal(
    pickChatModel(['Qwen3.5-4B-UD-Q4_K_XL'], 'Qwen3.5-35B-A3B-UD-Q2_K_XL'),
    'Qwen3.5-4B-UD-Q4_K_XL',
  );
});

test('chatModelOptions keeps only served ids when selected is omitted', () => {
  assert.deepEqual(chatModelOptions(['Qwen3.5-4B-UD-Q4_K_XL'], undefined), ['Qwen3.5-4B-UD-Q4_K_XL']);
});
