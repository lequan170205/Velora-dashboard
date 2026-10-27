import test from 'node:test'
import assert from 'node:assert/strict'
import { buildCommand, checkMixed, describeScenarios, estimateSeconds, summarize, validateParams } from './scenarios.mjs'

const PATHS = {
  bins: { chat: '/b/chat.mjs', connections: '/b/connections.mjs', signaling: '/b/churn.mjs', media: '/b/media.mjs', browserBundle: '/b/browser.js', mixed: '/b/mixed.mjs' },
  binsDir: '/b', configFile: '/t/config.json', chatConfigFile: '/t/chat.json', output: '/t/report.json', accounts: 50,
  baseUrl: 'http://127.0.0.1', chrome: '/chrome', lanAddress: '192.168.2.60',
}
const flag = (argv, name) => argv[argv.indexOf(name) + 1]

test('four scenarios are offered, each with three presets that pass validation', () => {
  for (const capabilities of [{ media: false }, { media: true }]) {
    const scenarios = describeScenarios(capabilities)
    assert.deepEqual(scenarios.map(s => s.id), ['chat', 'sockets', 'calls', 'mixed'])
    for (const s of scenarios) {
      assert.equal(s.presets.length, 3)
      for (const p of s.presets) assert.doesNotThrow(() => validateParams(s.id, p.values, capabilities), `${s.id}/${p.id}/${capabilities.media}`)
    }
  }
})

test('mixed presets are accepted by the mixed tool itself', () => {
  for (const capabilities of [{ media: false }, { media: true }])
    for (const p of describeScenarios(capabilities).find(s => s.id === 'mixed').presets) assert.doesNotThrow(() => checkMixed(validateParams('mixed', p.values, capabilities)))
})

test('without Chrome, real audio is unavailable', () => {
  const calls = describeScenarios({ media: false }).find(s => s.id === 'calls')
  assert.equal(calls.fields.find(f => f.key === 'media').disabled, true)
  assert.throws(() => validateParams('calls', { calls: 2, seconds: 30, media: true }, { media: false }), /Chrome/)
  assert.equal(describeScenarios({ media: false }).find(s => s.id === 'mixed').fields.find(f => f.key === 'calls').max, 0)
})

test('parameters are bounded and unknown ones rejected', () => {
  const ok = { rps: 10, seconds: 30 }
  assert.deepEqual(validateParams('chat', ok), ok)
  assert.throws(() => validateParams('chat', { ...ok, extra: 1 }), /không hợp lệ/)
  assert.throws(() => validateParams('chat', { rps: 0, seconds: 30 }), /Tin mỗi giây/)
  assert.throws(() => validateParams('chat', { rps: 1.5, seconds: 30 }), /Tin mỗi giây/)
  assert.throws(() => validateParams('chat', { rps: 300, seconds: 300 }), /10\.000/)
  assert.throws(() => validateParams('sockets', { sockets: 99999, hold: 10, storm: false }), /Số socket/)
  assert.throws(() => validateParams('mixed', { sockets: 200, chat: 5, churn: 15, calls: 10, seconds: 30 }, { media: true }), /tối đa 20/)
  assert.throws(() => validateParams('nope', {}), /không tồn tại/)
  assert.throws(() => validateParams('chat', '[]'), /Tin mỗi giây/)
})

test('chat runs every fixture account over a generated stage and never puts secrets in argv', () => {
  const command = buildCommand('chat', { rps: 10, seconds: 30 }, PATHS)
  assert.deepEqual(command.stages, [{ name: 'chat 10/s', users: 50, rps: 10, seconds: 30 }])
  assert.equal(flag(command.argv, '--config'), '/t/chat.json')
  assert.ok(!command.argv.some(a => /password|token/i.test(a)))
})

test('socket test maps storm to one storm and scales the ramp', () => {
  const light = buildCommand('sockets', { sockets: 200, hold: 30, storm: false }, PATHS).argv
  const heavy = buildCommand('sockets', { sockets: 6000, hold: 60, storm: true }, PATHS).argv
  assert.equal(flag(light, '--storms'), '0'); assert.equal(flag(heavy, '--storms'), '1')
  assert.equal(flag(light, '--ramp'), '10'); assert.equal(flag(heavy, '--ramp'), '200')
})

test('calls use signaling unless real audio is chosen, and signaling never queues more than the pairs can cycle', () => {
  const sig = buildCommand('calls', { calls: 10, seconds: 60, media: false }, PATHS)
  assert.equal(sig.tool, 'signaling')
  const cps = Number(flag(sig.argv, '--cps'))
  assert.ok(cps * (Number(flag(sig.argv, '--hold-ms')) / 1000 + 0.2) <= 10)
  const media = buildCommand('calls', { calls: 5, seconds: 60, media: true }, PATHS)
  assert.equal(media.tool, 'media')
  assert.equal(flag(media.argv, '--calls'), '5'); assert.ok(media.argv.includes('--local-origin'))
})

test('mixed passes the bins directory and only adds Chrome flags when long calls are requested', () => {
  const without = buildCommand('mixed', { sockets: 200, chat: 5, churn: 3, calls: 0, seconds: 30 }, PATHS).argv
  assert.equal(flag(without, '--bins-dir'), '/b'); assert.ok(!without.includes('--chrome'))
  const withMedia = buildCommand('mixed', { sockets: 2000, chat: 33, churn: 10, calls: 10, seconds: 300 }, PATHS).argv
  assert.equal(flag(withMedia, '--chrome'), '/chrome'); assert.ok(withMedia.includes('--media-local'))
})

test('estimates grow with the plan', () => {
  assert.ok(estimateSeconds('sockets', { sockets: 2000, hold: 120, storm: true }) > estimateSeconds('sockets', { sockets: 200, hold: 30, storm: false }))
  assert.ok(estimateSeconds('calls', { calls: 2, seconds: 30, media: true }) > estimateSeconds('calls', { calls: 2, seconds: 30, media: false }))
})

test('estimates follow the mixed tool timeline (ramp + 10 s settle + window + 60 s margin)', () => {
  // 200 sockets ramp at 10/s -> 20 s; measured light mixed run took 110 s
  assert.equal(estimateSeconds('mixed', { sockets: 200, chat: 5, churn: 3, calls: 0, seconds: 30 }), 120)
  assert.equal(estimateSeconds('sockets', { sockets: 200, hold: 30, storm: false }), 65)
})

test('chat verdict reports failed, missing and skipped messages as reasons', () => {
  const good = { passed: true, stopReason: null, stages: [{ planned: 300, skipped: 0, achievedRps: 10 }],
    totals: { emitted: 300, failedMessages: 0, ack: { p95: 40 }, delivery: { p95: 70 }, deliveries: { missing: 0 } } }
  const ok = summarize('chat', { rps: 10, seconds: 30 }, good)
  assert.equal(ok.passed, true); assert.equal(ok.reason, null)
  assert.deepEqual(ok.metrics.map(m => m.label), ['Tin đã gửi', 'Tin lỗi', 'Xác nhận p95', 'Giao tin p95', 'Thiếu lượt giao', 'Tốc độ thực'])
  assert.equal(ok.metrics[0].value, '300 / 300')
  const bad = summarize('chat', { rps: 10, seconds: 30 }, { ...good, passed: false, stages: [{ planned: 300, skipped: 4, achievedRps: 9 }],
    totals: { ...good.totals, failedMessages: 2, deliveries: { missing: 3 } } })
  assert.equal(bad.passed, false); assert.equal(bad.failures.length, 3); assert.equal(bad.metrics[1].bad, true)
})

test('a passing tool with an early-stop reason is still a failure', () => {
  const r = summarize('chat', { rps: 5, seconds: 5 }, { passed: true, stopReason: 'operator stop', stages: [], totals: {} })
  assert.equal(r.passed, false); assert.match(r.failures[0], /Dừng sớm/)
})

test('socket verdict covers ramp, hold and storm', () => {
  const report = { passed: true, stopReason: null, plan: {}, ramp: { target: 200, connected: 200, failed: 0, unexpectedDisconnects: 0, connectMs: { p95: 120 } },
    hold: { unexpectedDisconnects: 0, probes: { failed: 0, lastDeliveryMs: { p95: 80 } } }, storms: [{ lost: 0, allRestoredMs: 4200 }] }
  const ok = summarize('sockets', { sockets: 200, hold: 30, storm: true }, report)
  assert.equal(ok.passed, true); assert.equal(ok.metrics.at(-1).value, '4.2 s')
  const bad = summarize('sockets', { sockets: 200, hold: 30, storm: true }, { ...report, passed: false, ramp: { ...report.ramp, connected: 190, failed: 10 }, storms: [{ lost: 5, allRestoredMs: null }] })
  assert.equal(bad.passed, false); assert.equal(bad.failures.length, 2)
})

test('signaling and media call verdicts', () => {
  const signaling = { passed: true, counts: { planned: 100, completed: 100, failed: 0, skipped: 0 }, peakConcurrentCalls: 10, latencyMs: { setupMs: { p95: 300 }, leaveMs: { p95: 90 } }, cleanup: { callsStuck: 0 } }
  assert.equal(summarize('calls', { calls: 10, seconds: 60, media: false }, signaling).passed, true)
  const stuck = summarize('calls', { calls: 10, seconds: 60, media: false }, { ...signaling, passed: false, counts: { ...signaling.counts, failed: 3 }, cleanup: { callsStuck: 1 } })
  assert.equal(stuck.passed, false); assert.equal(stuck.failures.length, 2)
  const media = { passed: true, stages: [{ pairs: [{ audio: [{ packets: 900, lost: 0, jitterSeconds: 0.004 }, { packets: 880, lost: 2, jitterSeconds: 0.006 }] }] }] }
  const mediaOk = summarize('calls', { calls: 1, seconds: 20, media: true }, media)
  assert.equal(mediaOk.passed, true); assert.equal(mediaOk.metrics[1].value, '880')
  assert.equal(summarize('calls', { calls: 1, seconds: 20, media: true }, { passed: false, failure: 'media stalled', stages: [] }).failures[0], 'Cuộc gọi lỗi: media stalled')
})

test('mixed verdict lists the criteria that failed', () => {
  const report = { passed: false, criteria: [
    { workload: 'connections', name: 'sockets connected', value: 200, limit: 200, op: '===', pass: true },
    { workload: 'chat', name: 'ack p95 ms', value: 1500, limit: 1000, op: '<=', pass: false },
  ], children: { chat: { exitCode: 0 }, connections: { exitCode: 0 } }, resources: { gateway: { cpuPeak: 80 } } }
  const r = summarize('mixed', { sockets: 200, chat: 5, churn: 0, calls: 0, seconds: 30 }, report)
  assert.equal(r.passed, false); assert.match(r.failures[0], /chat: ack p95 ms = 1500/)
  assert.equal(r.metrics[0].value, '1 / 2'); assert.equal(r.metrics.at(-1).value, '80%')
})

test('a missing report fails, and a stop is reported as a stop', () => {
  assert.match(summarize('chat', { rps: 1, seconds: 5 }, null).reason, /báo cáo/)
  assert.equal(summarize('chat', { rps: 1, seconds: 5 }, null, { stopped: true }).reason, 'Đã dừng theo yêu cầu')
  assert.equal(summarize('chat', { rps: 1, seconds: 5 }, { passed: true, totals: {}, stages: [] }, { stopped: true }).passed, false)
})
