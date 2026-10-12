import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

const toDataUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
const transpile = (source) => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
const loadTranspiled = async (url) => import(toDataUrl(transpile(await readFile(url, 'utf8'))))

const {
  getReelPipelineQueueHealth,
  getReelQueueHealth,
  getReelQueueLabel,
} = await loadTranspiled(
  new URL('../src/features/monitoring/dashboard/reelQueueHealth.ts', import.meta.url),
)

globalThis.__reelsFormatters = await loadTranspiled(
  new URL('../src/features/monitoring/formatters.ts', import.meta.url),
)
globalThis.__reelsDependencyHealth = await loadTranspiled(
  new URL('../src/features/monitoring/dashboard/dependencyHealth.ts', import.meta.url),
)
globalThis.__reelsQueueHealth = {
  getReelPipelineQueueHealth,
  getReelQueueHealth,
  getReelQueueLabel,
}
let reelsConfigSource = transpile(await readFile(
  new URL('../src/features/monitoring/dashboard/configs/reels.ts', import.meta.url),
  'utf8',
))
reelsConfigSource = reelsConfigSource
  .replace(/import \{[\s\S]*?\} from '\.\.\/\.\.\/formatters';\n/, 'const { formatCount, formatPercent, formatRate, formatSeconds, toneForThreshold } = globalThis.__reelsFormatters;\n')
  .replace(/import \{ getDependencyHealth \} from '\.\.\/dependencyHealth';\n/, 'const { getDependencyHealth } = globalThis.__reelsDependencyHealth;\n')
  .replace(/import \{[\s\S]*?\} from '\.\.\/reelQueueHealth';\n/, 'const { getReelPipelineQueueHealth, getReelQueueHealth, getReelQueueLabel } = globalThis.__reelsQueueHealth;\n')
const { reelsConfig } = await import(toDataUrl(reelsConfigSource))

const queue = (name, ready, consumers, vhost = '/') => ({ queue: name, vhost, ready, consumers })

const overview = (reelsOverrides = {}) => ({
  reels: {
    snapshotUp: true,
    rabbitmqUp: true,
    stalled: 0,
    recentFailed: 0,
    media: {
      queues: [
        queue('reel_media_short_jobs', 0, 1),
        queue('reel_media_long_jobs', 0, 1),
      ],
      dlqDepth: 0,
      failureRate: 0,
      queueWaitP95Seconds: 0,
    },
    index: {
      queues: [
        queue('reel_index_short_jobs', 0, 1),
        queue('reel_index_long_jobs', 0, 1),
      ],
      dlqDepth: 0,
      failureRate: 0,
      queueWaitP95Seconds: 0,
    },
    ...reelsOverrides,
  },
})

test('a stalled SHORT lane is degraded even when LONG is active', () => {
  assert.equal(
    getReelQueueHealth([
      queue('reel_media_short_jobs', 4, 0),
      queue('reel_media_long_jobs', 0, 2),
    ]),
    'degraded',
  )
  assert.equal(getReelQueueLabel('reel_media_short_jobs', 0), 'SHORT')
  assert.equal(getReelQueueLabel('reel_media_long_jobs', 1), 'LONG')
})

test('both known lanes are healthy only when every lane has known counts', () => {
  assert.equal(
    getReelQueueHealth([
      queue('reel_index_short_jobs', 0, 1),
      queue('reel_index_long_jobs', 3, 1),
    ]),
    'healthy',
  )
  assert.equal(getReelQueueHealth(undefined), 'unknown')
  assert.equal(getReelQueueHealth([]), 'unknown')
  assert.equal(getReelQueueHealth([queue('reel_index_short_jobs', null, 1)]), 'unknown')
  assert.equal(getReelPipelineQueueHealth([queue('reel_index_short_jobs', 0, 1)], 'index'), 'unknown')
})

test('pipeline completeness is checked independently for every vhost', () => {
  assert.equal(
    getReelPipelineQueueHealth([
      queue('reel_media_short_jobs', 0, 1, 'A'),
      queue('reel_media_long_jobs', 0, 1, 'A'),
      queue('reel_media_short_jobs', 0, 1, 'B'),
      queue('reel_media_long_jobs', 0, 1, 'B'),
    ], 'media'),
    'healthy',
  )
  assert.equal(
    getReelPipelineQueueHealth([
      queue('reel_media_short_jobs', 0, 1, 'A'),
      queue('reel_media_long_jobs', 0, 1, 'B'),
    ], 'media'),
    'unknown',
  )
  assert.equal(
    getReelPipelineQueueHealth([
      queue('reel_media_short_jobs', 0, 1, 'unknown'),
      queue('reel_media_long_jobs', 0, 1, 'unknown'),
    ], 'media'),
    'unknown',
  )
  assert.equal(
    getReelPipelineQueueHealth([
      queue('reel_media_short_jobs', 2, 0, 'unknown'),
      queue('reel_media_long_jobs', 0, 1, 'unknown'),
    ], 'media'),
    'degraded',
  )
  assert.equal(
    getReelPipelineQueueHealth([
      queue('reel_media_short_jobs', 0, 1, ''),
      queue('reel_media_long_jobs', 0, 1, ''),
    ], 'media'),
    'unknown',
  )
})

test('known Reel failures remain visible when lane or dependency evidence is missing', () => {
  assert.equal(
    reelsConfig.health(overview({
      media: { ...overview().reels.media, queues: undefined, dlqDepth: 1 },
    }), true).tone,
    'bad',
  )
  assert.equal(
    reelsConfig.health(overview({
      snapshotUp: null,
      rabbitmqUp: null,
      stalled: 1,
      media: { ...overview().reels.media, queues: undefined },
      index: { ...overview().reels.index, queues: undefined },
    }), true).tone,
    'warn',
  )
  assert.equal(
    reelsConfig.health(overview({
      snapshotUp: null,
      rabbitmqUp: null,
      recentFailed: 1,
      media: { ...overview().reels.media, queues: undefined },
      index: { ...overview().reels.index, queues: undefined },
    }), true).tone,
    'warn',
  )
  assert.equal(
    reelsConfig.health(overview({
      media: {
        ...overview().reels.media,
        queues: [queue('reel_media_short_jobs', 3, 0)],
      },
      index: { ...overview().reels.index, queues: undefined },
    }), true).tone,
    'bad',
  )
})

test('a missing lane plus a known elevated failure remains a warning', () => {
  assert.equal(
    reelsConfig.health(overview({
      media: { ...overview().reels.media, queues: undefined, failureRate: 0.3 },
    }), true).tone,
    'warn',
  )
})

test('complete queues without worker measurements stay idle-unmeasured', () => {
  const result = reelsConfig.health(overview({
    media: { ...overview().reels.media, failureRate: null },
  }), true)
  assert.equal(result.tone, 'neutral')
  assert.equal(result.title, 'Reel worker health is unmeasured')
})

test('fully measured healthy worker evidence can report healthy', () => {
  assert.equal(reelsConfig.health(overview(), true).tone, 'good')
})
