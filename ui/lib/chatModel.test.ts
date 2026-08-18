import assert from 'node:assert/strict';
import test from 'node:test';
import { chatModelOptions, isModelServed, pickChatModel } from './chatModel.ts';

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
