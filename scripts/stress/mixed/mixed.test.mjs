import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { test } from 'node:test'
import { MIXED_LIMITS, buildCommands, buildTimeline, chatStage, evaluate, parseDockerStats, resolveScenario, summarizeResources } from './scenario.mjs'
import { parseArgs, scenarioFromArgs } from './cli.mjs'
import { runMixed } from './orchestrator.mjs'

const paths = {
  node: 'node', bins: { chat: '/b/chat.mjs', connections: '/b/connections.mjs', churn: '/b/churn.mjs', media: '/b/media.mjs', browserBundle: '/b/browser.js' },
  config: '/m/public.json', localConfig: '/o/local.json', chatConfig: '/o/chat.json', outDir: '/o', chrome: '/c/chrome', lanAddress: '192.168.2.60',
}
const arg = (argv, name) => argv[argv.indexOf(name) + 1]

test('the default profile documents its assumptions and fits the fixture limits', () => {
  const s = resolveScenario()
  assert.equal(s.name, 'campus10k'); assert.equal(s.sockets, 2000); assert.equal(s.chatRps, 33); assert.equal(s.mediaCalls, 10)
  assert.equal(s.assumptions.registeredUsers, 10000)
  // 20% online, one message per online user per minute
  assert.equal(s.assumptions.registeredUsers * s.assumptions.onlineAtPeak, s.sockets)
  assert.equal(Math.round(s.sockets * s.assumptions.messagesPerOnlineUserPerMinute / 60), s.chatRps)
  assert.ok(s.mediaCalls + s.churn.pairs <= MIXED_LIMITS.pairs)
})

test('scenario bounds protect the fixtures and the production services', () => {
  for (const bad of [{ sockets: 10 }, { sockets: 7000 }, { rampPerSecond: 101 }, { windowSeconds: 10 }, { chatRps: 101 }, { chatRps: 40, windowSeconds: 300 }, { mediaCalls: 11, churnPairs: 10 },
    { mediaCalls: 21 }, { churnPairs: 5, churnCps: 0 }, { churnHoldMs: 60001 }, { churnPairs: 7, churnCps: 1, churnHoldMs: 8000 }]) assert.throws(() => resolveScenario('campus10k', bad), undefined, JSON.stringify(bad))
  assert.throws(() => resolveScenario('nope'), /unknown profile/)
  assert.equal(resolveScenario('campus10k', { mediaCalls: 0, churnPairs: 20 }).churn.pairs, 20)
  assert.throws(() => resolveScenario('campus10k', { churnPairs: 7 }), /at least 9 pairs/)
  assert.equal(resolveScenario('smoke').churn.pairs, 3)
})

test('the timeline starts load only after the sockets are up and covers the whole window', () => {
  const s = resolveScenario(), t = buildTimeline(s)
  assert.equal(t.rampSeconds, 80); assert.equal(t.beginSeconds, 90)
  assert.equal(t.connections.startS, 0); assert.equal(t.connections.holdSeconds, 10 + 300 + 40)
  assert.deepEqual(t.chat, { startS: 90, seconds: 300 }); assert.deepEqual(t.churn, { startS: 90, seconds: 300 })
  assert.equal(t.media.startS, 90); assert.equal(t.media.seconds, 300 - (5 * 10 + 20))
  assert.equal(t.totalSeconds, 90 + 300 + 60)
  const small = buildTimeline(resolveScenario('smoke'))
  assert.equal(small.media, null); assert.ok(small.chat && small.churn)
})

test('commands keep every tool on its own users and use the right base URL', () => {
  const s = resolveScenario(), commands = buildCommands(s, buildTimeline(s), paths)
  assert.deepEqual(commands.map(c => c.name), ['connections', 'chat', 'churn', 'media'])
  const by = Object.fromEntries(commands.map(c => [c.name, c.argv]))
  assert.equal(arg(by.connections, '--sockets'), '2000'); assert.equal(arg(by.connections, '--config'), '/o/local.json'); assert.equal(arg(by.connections, '--storms'), '0')
  assert.equal(arg(by.chat, '--config'), '/o/chat.json')
  assert.equal(arg(by.churn, '--pair-offset'), '10'); assert.equal(arg(by.churn, '--pairs'), '10'); assert.equal(arg(by.churn, '--hold-ms'), '8000')
  assert.equal(arg(by.media, '--pair-offset'), '0'); assert.equal(arg(by.media, '--calls'), '10'); assert.equal(arg(by.media, '--manifest'), '/m/public.json')
  assert.equal(arg(by.media, '--lan-media-address'), '192.168.2.60')
  assert.ok(commands.every(c => c.argv.every(a => typeof a === 'string')))
  assert.deepEqual(chatStage(s, 50), { name: 'mixed chat 33/s', users: 50, rps: 33, seconds: 300 })
  const none = buildCommands(resolveScenario('campus10k', { mediaCalls: 0 }), buildTimeline(resolveScenario('campus10k', { mediaCalls: 0 })), paths)
  assert.equal(none.find(c => c.name === 'media'), undefined); assert.equal(arg(none.find(c => c.name === 'churn').argv, '--pair-offset'), '0')
})

const good = () => ({
  connections: { plan: { sockets: 2000 }, ramp: { failed: 0, connected: 2000, unexpectedDisconnects: 0 }, hold: { unexpectedDisconnects: 0, probes: { failed: 0, lastDeliveryMs: { p95: 80 } } } },
  chat: { stages: [{ failedMessages: 0, skipped: 2, planned: 9000, ack: { p95: 120 }, delivery: { p95: 300 }, deliveries: { missing: 0 } }] },
  churn: { counts: { failed: 0, skipped: 0, planned: 300 }, cleanup: { callsStuck: 0 }, latencyMs: { setupMs: { p95: 30 } } },
  media: { passed: true, stages: [{ pairs: [{ audio: [{ packets: 12000, lost: 0 }, { packets: 12000, lost: 4 }] }] }] },
})

test('a healthy run passes every criterion', () => {
  const v = evaluate(good(), resolveScenario())
  assert.equal(v.passed, true, JSON.stringify(v.criteria.filter(c => !c.pass)))
  assert.ok(v.criteria.length >= 14); assert.ok(v.criteria.every(c => c.pass))
})

test('each workload can fail the verdict on its own', () => {
  const s = resolveScenario()
  const failing = (mutate, workload, name) => {
    const r = good(); mutate(r)
    const v = evaluate(r, s)
    assert.equal(v.passed, false, name)
    assert.ok(v.criteria.some(c => !c.pass && c.workload === workload && c.name.includes(name)), `${workload}: ${name} ${JSON.stringify(v.criteria.filter(c => !c.pass))}`)
  }
  failing(r => { r.connections.ramp.failed = 5 }, 'connections', 'connect failure ratio')
  failing(r => { r.connections.ramp.connected = 1990 }, 'connections', 'sockets connected')
  failing(r => { r.connections.hold.unexpectedDisconnects = 1 }, 'connections', 'unexpected disconnects')
  failing(r => { r.connections.hold.probes.lastDeliveryMs.p95 = 5000 }, 'connections', 'last-delivery')
  failing(r => { r.chat.stages[0].failedMessages = 1 }, 'chat', 'failed messages')
  failing(r => { r.chat.stages[0].ack.p95 = 2000 }, 'chat', 'ack p95')
  failing(r => { r.chat.stages[0].delivery.p95 = 3000 }, 'chat', 'delivery p95')
  failing(r => { r.chat.stages[0].skipped = 90 }, 'chat', 'skipped ratio')
  failing(r => { r.churn.counts.failed = 3 }, 'calls (signaling)', 'failed calls')
  failing(r => { r.churn.cleanup.callsStuck = 1 }, 'calls (signaling)', 'stuck calls')
  failing(r => { r.churn.latencyMs.setupMs.p95 = 4000 }, 'calls (signaling)', 'setup p95')
  failing(r => { r.media.passed = false }, 'calls (media)', 'run passed')
  failing(r => { r.media.stages[0].pairs[0].audio[0].lost = 1000 }, 'calls (media)', 'packet loss')
})

test('a missing child report fails the verdict instead of passing silently', () => {
  const r = good(); delete r.churn
  const v = evaluate(r, resolveScenario())
  assert.equal(v.passed, false); assert.ok(v.criteria.some(c => c.workload === 'calls (signaling)' && c.value === null && !c.pass))
  assert.equal(evaluate({}, resolveScenario('smoke')).passed, false)
})

test('docker stats parsing and resource summaries', () => {
  const rows = parseDockerStats('microservices-boilerplate-call-service-1\t12.50%\t300MiB / 11.7GiB\nmicroservices-boilerplate-mongo-1\t80%\t1.5GiB / 11.7GiB\nbroken line\n')
  assert.deepEqual(rows, [{ name: 'call-service', cpu: 12.5, memMiB: 300 }, { name: 'mongo', cpu: 80, memMiB: 1536 }])
  const sum = summarizeResources([rows, [{ name: 'call-service', cpu: 7.5, memMiB: 320 }]])
  assert.deepEqual(sum['call-service'], { cpuMean: 10, cpuPeak: 12.5, memPeakMiB: 320 })
  assert.deepEqual(sum.mongo, { cpuMean: 80, cpuPeak: 80, memPeakMiB: 1536 })
})

// A fake clock whose sleeps resolve on the next macrotask, plus a fake spawn that writes canned reports.
function harness({ failChild } = {}) {
  let t = 1_000_000
  const reports = new Map(), spawned = [], events = []
  const canned = good()
  const spawnImpl = (_node, argv) => {
    const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter()
    const output = argv[argv.indexOf('--output') + 1]
    const name = output.split('/').pop().replace('.json', '')
    spawned.push({ name, at: t, argv })
    child.kill = signalName => { child.killed = signalName; setImmediate(() => child.emit('exit', null, signalName)) }
    setImmediate(() => {
      if (child.killed) return
      if (name === failChild) { child.stderr.emit('data', Buffer.from('boom')); return child.emit('exit', 1, null) }
      reports.set(output, canned[name]); child.emit('exit', 0, null)
    })
    return child
  }
  return { spawnImpl, reports, spawned, events, now: () => t, sleep: ms => new Promise(resolve => setImmediate(() => { t += ms; resolve() })), readReport: async path => reports.get(path) ?? null }
}

test('the orchestrator starts each workload at its planned offset and judges the combined result', async () => {
  const h = harness(), s = resolveScenario()
  const report = await runMixed(s, paths, { ...h, sample: false, onEvent: e => h.events.push(e) })
  const starts = Object.fromEntries(h.spawned.map(x => [x.name, (x.at - 1_000_000) / 1000]))
  assert.equal(starts.connections, 0); assert.ok(starts.chat >= 90 && starts.churn >= 90 && starts.media >= 90, JSON.stringify(starts))
  assert.deepEqual(Object.keys(report.children).sort(), ['chat', 'churn', 'connections', 'media'])
  assert.ok(Object.values(report.children).every(c => c.exitCode === 0))
  assert.equal(report.passed, true, JSON.stringify(report.criteria.filter(c => !c.pass)))
  assert.equal(h.events.filter(e => e.event === 'start').length, 4)
  assert.equal(report.timeline.totalSeconds, 450)
})

test('a crashed child with no report fails the run and keeps a short error tail', async () => {
  const h = harness({ failChild: 'churn' })
  const report = await runMixed(resolveScenario(), paths, { ...h, sample: false })
  assert.equal(report.children.churn.exitCode, 1); assert.match(report.children.churn.stderrTail, /boom/)
  assert.equal(report.passed, false)
})

test('resource samples are collected while children run', async () => {
  const h = harness(); let calls = 0
  const report = await runMixed(resolveScenario('smoke'), paths, { ...h, sample: true, sampleEveryMs: 1000,
    dockerStats: async () => { calls++; return [{ name: 'conversation-service', cpu: 10 + calls, memMiB: 100 }] } })
  assert.ok(report.resourceSamples >= 1 && calls >= 1)
  assert.ok(report.resources['conversation-service'].cpuPeak >= 11)
})

test('an abort stops children that have not started and terminates the running ones', async () => {
  const h = harness(), controller = new AbortController()
  const running = runMixed(resolveScenario(), paths, { ...h, sample: false, signal: controller.signal,
    spawnImpl: (...a) => { const c = h.spawnImpl(...a); c.kill = sig => { c.killed = sig; setImmediate(() => c.emit('exit', null, sig)) }; return c } })
  controller.abort()
  const report = await running
  assert.equal(report.stopReason, 'operator stop'); assert.equal(report.passed, false)
})

test('CLI options are strict', () => {
  assert.deepEqual(parseArgs(['--run', '--sockets', '1000', '--no-docker']), { run: true, sockets: '1000', 'no-docker': true })
  assert.throws(() => parseArgs(['--nope']), /unknown option/); assert.throws(() => parseArgs(['--sockets']), /needs a value/)
  const s = scenarioFromArgs(parseArgs(['--profile', 'campus10k', '--sockets', '1000', '--window', '120', '--media-calls', '0', '--churn-pairs', '4', '--churn-hold-ms', '2000']))
  assert.equal(s.sockets, 1000); assert.equal(s.windowSeconds, 120); assert.equal(s.mediaCalls, 0); assert.equal(s.churn.pairs, 4)
  assert.throws(() => scenarioFromArgs(parseArgs(['--sockets', '99999'])), /sockets must be/)
})
