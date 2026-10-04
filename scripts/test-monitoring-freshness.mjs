import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(
  new URL('../src/features/monitoring/freshness.ts', import.meta.url),
  'utf8',
);
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { getMonitoringConnectionState, getMonitoringHistoryFreshnessState } = await import(
  `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`
);

const connection = (ageMs, options = {}) => getMonitoringConnectionState({
  now: 100_000,
  lastSuccessfulAt: 100_000 - ageMs,
  refreshing: false,
  hasError: false,
  ...options,
});

// A missed refresh must not look live throughout a short stress-demo run.
test('connection tolerates jitter, then marks missed polls stale and failed polls disconnected', () => {
  assert.equal(connection(5_000), 'live');
  assert.equal(connection(15_000), 'live');
  assert.equal(connection(15_001), 'stale');
  assert.equal(connection(20_000, { refreshing: true }), 'stale');
  assert.equal(connection(30_000, { hasError: true }), 'stale');
  assert.equal(connection(30_001, { hasError: true }), 'disconnected');
  assert.equal(connection(30_001), 'stale');
});

test('initial failures and successful background refreshes have distinct states', () => {
  assert.equal(connection(0, { lastSuccessfulAt: null }), 'refreshing');
  assert.equal(connection(0, { lastSuccessfulAt: null, hasError: true }), 'disconnected');
  assert.equal(connection(5_000, { refreshing: true }), 'refreshing');
});

const history = (ageMs, sampleStepMs = 10_000, hasError = false) => getMonitoringHistoryFreshnessState({
  now: 100_000,
  lastSampleAt: 100_000 - ageMs,
  sampleStepMs,
  hasError,
});

test('short-range history turns stale after two missed refreshes without hiding available samples', () => {
  assert.equal(history(10_000), 'fresh');
  assert.equal(history(20_000), 'fresh');
  assert.equal(history(20_001), 'stale');
  assert.equal(history(1_000, 10_000, true), 'stale');
});

test('coarse 24-hour history respects sample spacing instead of the faster polling cadence', () => {
  assert.equal(history(599_999, 300_000), 'fresh');
  assert.equal(history(600_001, 300_000), 'stale');
});

test('unknown cadence and client clock skew do not manufacture stale samples', () => {
  for (const step of [null, 0, -1, Number.NaN]) assert.equal(history(0, step), 'unknown');
  assert.equal(history(-5_000), 'fresh');
});
