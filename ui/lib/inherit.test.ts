import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearParamKeys,
  inheritBadge,
  inheritPlaceholder,
  inheritResolved,
  isParamSet,
  LLAMA_ENGINE_DEFAULTS,
  LLAMA_LOAD_KEYS,
  sectionInheritLine,
  sectionSetCount,
} from './inherit.ts';
import type { ServerParams } from '../types';

test('isParamSet treats 0 and false as real values', () => {
  assert.equal(isParamSet(0), true);
  assert.equal(isParamSet(false), true);
  assert.equal(isParamSet(''), false);
  assert.equal(isParamSet('  '), false);
  assert.equal(isParamSet(null), false);
  assert.equal(isParamSet(undefined), false);
});

test('inheritResolved walks node → Settings → engine', () => {
  assert.deepEqual(inheritResolved(4096, 0, 0), { layer: 'set', value: 4096 });
  assert.deepEqual(inheritResolved(null, 'all', 'auto'), { layer: 'settings', value: 'all' });
  assert.deepEqual(inheritResolved('', null, 'auto'), { layer: 'engine', value: 'auto' });
  assert.deepEqual(inheritResolved(null, null, 0), { layer: 'engine', value: 0 });
});

test('inheritPlaceholder names the source and the value', () => {
  assert.equal(inheritPlaceholder({ layer: 'settings', value: 'all' }), 'Settings: all');
  assert.equal(inheritPlaceholder({ layer: 'engine', value: 0 }), 'engine: 0');
  assert.equal(inheritPlaceholder({ layer: 'engine', value: true }), 'engine: on');
  assert.equal(inheritPlaceholder({ layer: 'engine', value: null }), 'engine default');
  assert.equal(inheritPlaceholder({ layer: 'set', value: 1 }), '');
});

test('empty option ignores the local value and shows what inherit would be', () => {
  const ifCleared = inheritResolved(null, 'all', 'auto');
  assert.equal(inheritPlaceholder(ifCleared), 'Settings: all');
  assert.equal(inheritPlaceholder(inheritResolved(null, null, 'auto')), 'engine: auto');
});

test('inheritBadge labels the layer', () => {
  assert.equal(inheritBadge('set'), 'set');
  assert.equal(inheritBadge('settings'), 'Settings');
  assert.equal(inheritBadge('engine'), 'engine');
});

test('sectionInheritLine counts set vs Settings vs engine', () => {
  const params: Partial<ServerParams> = { gpuLayers: 'all', cacheTypeK: 'q8_0' };
  const settings: Partial<ServerParams> = { kvOffload: true };
  const line = sectionInheritLine(LLAMA_LOAD_KEYS, params, settings, LLAMA_ENGINE_DEFAULTS);
  assert.equal(line, '2 set · 1 Settings · 8 engine');
});

test('sectionInheritLine collapses to a single source when nothing is set', () => {
  assert.equal(
    sectionInheritLine(LLAMA_LOAD_KEYS, {}, null, LLAMA_ENGINE_DEFAULTS),
    'all inherit engine',
  );
  assert.equal(
    sectionInheritLine(LLAMA_LOAD_KEYS, {}, { ctxSize: 4096, gpuLayers: 'all' }, LLAMA_ENGINE_DEFAULTS),
    '2 Settings · 9 engine',
  );
});

test('clearParamKeys blanks a section without touching other fields', () => {
  const params = {
    ctxSize: 4096,
    gpuLayers: 'all',
    extraFlags: '--verbose',
  } as ServerParams;
  const cleared = clearParamKeys(params, LLAMA_LOAD_KEYS);
  assert.equal(cleared.ctxSize, null);
  assert.equal(cleared.gpuLayers, null);
  assert.equal(cleared.extraFlags, '--verbose');
  assert.equal(sectionSetCount(LLAMA_LOAD_KEYS, cleared), 0);
});
