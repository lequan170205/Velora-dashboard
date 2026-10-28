import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import { describeScenarios, estimateSeconds } from './stress/agent/scenarios.mjs'

const source = await readFile(new URL('../src/features/stress-test/live.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const { makeSample, appendSample, topContainers, timelineFor, timelineSeconds, phaseIndex, demoValues, MAX_SAMPLES } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)

const overview = (patch = {}) => ({
  host: { cpuUsageRatio: 0.4235 },
  conversation: { socketConnections: 1850, messagesPerSecond: 31.46, p95SendLatencySeconds: 0.0374 },
  call: { socketConnections: 20, mediaRooms: 10, mediaWorkerCpuRatio: 0.12 }, ...patch,
})
const containers = { containers: [
  { service: 'rabbitmq', cpuCores: 1.7391 }, { service: 'mongo', cpuCores: 1.3 }, { service: 'conversation-service', cpuCores: 0.95 },
  { service: 'conversation-service', cpuCores: 1.1 }, { service: 'redis', cpuCores: null },
] }

test('a sample turns the server overview into chart values', () => {
  const s = makeSample(12.34, overview(), containers)
  assert.deepEqual({ ...s, cpu: undefined }, { t: 12.3, chatSockets: 1850, msgPerSec: 31.5, p95Ms: 37, hostCpu: 42.4, callSockets: 20, mediaRooms: 10, workerCpu: 12, cpu: undefined })
  assert.deepEqual(s.cpu, { rabbitmq: 1.74, mongo: 1.3, 'conversation-service': 1.1 })
})

test('missing metrics stay empty instead of becoming zero', () => {
  const s = makeSample(-1, overview({ host: { cpuUsageRatio: null }, conversation: { socketConnections: null, messagesPerSecond: null, p95SendLatencySeconds: null }, call: { socketConnections: null } }), undefined)
  assert.equal(s.t, 0)
  for (const key of ['chatSockets', 'msgPerSec', 'p95Ms', 'hostCpu', 'callSockets', 'mediaRooms', 'workerCpu']) assert.equal(s[key], null, key)
  assert.deepEqual(s.cpu, {})
})

test('the series is capped and the busiest containers are ranked by peak', () => {
  let series = []
  for (let i = 0; i < MAX_SAMPLES + 5; i++) series = appendSample(series, makeSample(i, overview(), containers))
  assert.equal(series.length, MAX_SAMPLES); assert.equal(series[0].t, 5)
  assert.deepEqual(topContainers(series, 2), ['rabbitmq', 'mongo'])
  assert.deepEqual(topContainers([], 3), [])
})

test('every preset timeline adds up to the length the agent estimates', () => {
  for (const media of [false, true])
    for (const scenario of describeScenarios({ media }))
      for (const preset of scenario.presets)
        assert.equal(timelineSeconds(timelineFor(scenario.id, preset.values)), estimateSeconds(scenario.id, preset.values), `${scenario.id}/${preset.id}/${media}`)
})

test('the current phase follows elapsed time and stays on the last one afterwards', () => {
  const timeline = timelineFor('mixed', { sockets: 2000, chat: 33, churn: 10, calls: 0, seconds: 300 })
  assert.deepEqual(timeline.map((p) => p.label), ['Open sockets', 'Settle', 'Steady load', 'Wind down'])
  assert.equal(phaseIndex(timeline, 0), 0); assert.equal(phaseIndex(timeline, 19.9), 0); assert.equal(phaseIndex(timeline, 20), 1)
  assert.equal(phaseIndex(timeline, 31), 2); assert.equal(phaseIndex(timeline, 331), 3); assert.equal(phaseIndex(timeline, 9999), 3)
})

test('the demo uses the heaviest mixed level and only asks for real audio when it is available', () => {
  assert.deepEqual(demoValues(false), { sockets: 2000, chat: 33, churn: 10, calls: 0, seconds: 300 })
  assert.equal(demoValues(true).calls, 10)
  const school = describeScenarios({ media: true }).find((s) => s.id === 'mixed').presets.find((p) => p.id === 'school')
  assert.deepEqual(demoValues(true), school.values)
})
