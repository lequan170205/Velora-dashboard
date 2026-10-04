import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

async function load(relative) {
  const source = await readFile(new URL(relative, import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  return import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)
}
const { runChat, percentile, validateStages, csvReport } = await load('../src/features/stress-test/runner.ts')
function fixture({ reject = false, delay = 5, duplicateReplay = false, missingUniqueIndex = false, rejectReplay = false, dropDelivery = false } = {}) {
  const sockets = [], messages = new Map()
  let maximum = 0, current = 0, sent = 0
  class FakeSocket extends EventEmitter {
    connected = false
    room = null
    connect() { setTimeout(() => { this.connected = true; super.emit('connect') }, 1); return this }
    disconnect() { if (this.connected) { this.connected = false; super.emit('disconnect') }; return this }
    emit(event, payload) {
      if (event === 'join_conversation') { this.room = payload; return this }
      if (event !== 'send_message') return super.emit(event, payload)
      sent++; current++; maximum = Math.max(maximum, current)
      const isLoad = !payload.clientMessageId.endsWith('probe') && !payload.clientMessageId.includes('setup')
      setTimeout(() => {
        current--
        if (reject) { super.emit('message_failed', payload); return }
        const previous = messages.get(payload.clientMessageId)
        if (previous && rejectReplay) { super.emit('message_failed', payload); return }
        const message = missingUniqueIndex ? { ...payload, id: `db-${sent}` } : previous ?? { ...payload, id: `db-${messages.size + 1}` }
        messages.set(payload.clientMessageId, message)
        super.emit('message_synced', { ...message, clientMessageId: 'unrelated' })
        super.emit('message_synced', { ...message, conversationId: 'wrong-room' })
        super.emit('message_synced', message)
        if (!dropDelivery && (!previous || duplicateReplay || missingUniqueIndex)) for (const socket of sockets) if (socket !== this && socket.connected && socket.room === payload.conversationId) socket.receive('new_message', message)
      }, isLoad ? delay : 5)
      return this
    }
    receive(event, message) { super.emit(event, message) }
  }
  return { sockets, messages, sent: () => sent, maximum: () => maximum, createSocket: () => { const s = new FakeSocket(); sockets.push(s); return s } }
}
function options(f, overrides = {}) {
  return { conversationId: 'test-room', profile: 'smoke', stages: [{ name: 'Smoke', sockets: 2, rps: 5, seconds: 1 }], signal: new AbortController().signal, ensureSession: async () => {}, createSocket: f.createSocket, onUpdate: () => {}, ackTimeoutMs: 500, ...overrides }
}

test('validates bounded stages, distinguishes cooldown, and computes percentiles', () => {
  assert.throws(() => validateStages([{ name: 'x', sockets: 101, rps: 1, seconds: 1 }]))
  assert.throws(() => validateStages([{ name: 'x', sockets: 1, rps: 101, seconds: 1 }]))
  assert.throws(() => validateStages([{ name: 'x', sockets: 0, rps: 1, seconds: 1 }]))
  assert.throws(() => validateStages([{ name: 'x', sockets: 1, rps: 100, seconds: 600 }]))
  assert.equal(percentile([], .95), null)
  assert.equal(percentile(Array.from({ length: 100 }, (_, i) => i + 1), .95), 95)
})

test('real runner verifies preflight, correlation, fan-out, stage accounting and socket cleanup', async () => {
  const f = fixture()
  const snapshots = []
  const report = await runChat(options(f, { onUpdate: (r) => snapshots.push(r) }))
  assert.equal(report.passed, true)
  assert.equal(report.preflight, true)
  assert.equal(report.totals.synced, 5)
  assert.equal(report.delivery.received, 5)
  assert.equal(report.delivery.duplicates, 0)
  assert.equal(report.skipped, 0)
  assert.equal(report.signedInUsers, 1)
  assert.ok(f.sockets.every((s) => !s.connected))
  assert.ok(report.finishedAt)
  assert.ok(snapshots.some((r) => r.phase === 'Smoke'))
  assert.ok(csvReport(report).includes('emittedRps'))
  assert.ok(f.messages.size === 7)
})

test('bad membership or missing receiver event still prevents any load generation', async () => {
  for (const setting of [{ reject: true }, { dropDelivery: true }]) {
    const f = fixture(setting)
    const report = await runChat(options(f))
    assert.equal(report.passed, false)
    assert.equal(report.preflight, false)
    assert.equal(report.stages.length, 0)
    assert.equal(report.totals.attempted, 0)
    assert.ok(f.sockets.every((s) => !s.connected))
  }
})

test('retry failures do not block fresh-ID load or become an overall pass', async () => {
  for (const setting of [{ duplicateReplay: true }, { missingUniqueIndex: true }, { rejectReplay: true }]) {
    const f = fixture(setting)
    const report = await runChat(options(f))
    assert.equal(report.preflight, true)
    assert.equal(report.retryCheck.status, 'failed')
    assert.ok(report.retryCheck.detail)
    assert.equal(report.loadPassed, true)
    assert.equal(report.passed, false)
    assert.equal(report.stopReason, null)
    assert.equal(report.totals.synced, 5)
    assert.equal(report.delivery.received, 5)
    assert.equal(report.delivery.duplicates, 0)
    assert.ok(csvReport(report).includes('"true","failed"'))
    assert.ok(f.sockets.every((s) => !s.connected))
  }
})

test('stop during a run disconnects sockets and saves partial results', async () => {
  const f = fixture({ delay: 20 })
  const controller = new AbortController()
  const report = await runChat(options(f, { signal: controller.signal, onUpdate: (r) => { if (r.phase === 'Smoke') setTimeout(() => controller.abort('Stopped by operator'), 100) } }))
  assert.equal(report.stopReason, 'Stopped by operator')
  assert.equal(report.passed, false)
  assert.ok(report.finishedAt)
  assert.ok(f.sockets.every((s) => !s.connected))
})

test('session renewal is periodic; failed renewal stops the run without persisting credentials', async () => {
  const f = fixture()
  let renewals = 0
  const report = await runChat(options(f, { sessionIntervalMs: 100, ensureSession: async () => { renewals++; if (renewals >= 3) throw new Error('private-token-do-not-save') } }))
  assert.ok(renewals >= 3)
  assert.equal(report.passed, false)
  assert.equal(report.stopReason, 'Session unavailable. Sign in again or check the API.')
  assert.equal(JSON.stringify(report).includes('private-token-do-not-save'), false)
  assert.ok(f.sockets.every((s) => !s.connected))
})

test('timeouts do not become successes or false latency samples', async () => {
  const f = fixture({ delay: 800 })
  const report = await runChat(options(f, { stages: [{ name: 'Peak', sockets: 2, rps: 100, seconds: 1 }] }))
  assert.equal(report.passed, false)
  assert.ok(report.totals.timeout > 0)
  assert.equal(report.totals.synced, 0)
  assert.ok(f.maximum() <= 100)
})

test('generator saturation records skipped slots instead of claiming the target rate', async () => {
  const f = fixture({ delay: 3000 })
  const report = await runChat(options(f, { ackTimeoutMs: 2000, stages: [{ name: 'Peak', sockets: 2, rps: 100, seconds: 2 }] }))
  assert.equal(report.passed, false)
  assert.ok(report.skipped > 0)
  assert.equal(report.stages[0].attempted + report.stages[0].skipped, 200)
  assert.ok(f.maximum() <= 100)
})

test('raw transport exceptions are sanitized before snapshots or saved reports', async () => {
  const f = fixture()
  const report = await runChat(options(f, { createSocket: () => { throw new Error('SECRET-CREDENTIAL-IN-TRANSPORT') } }))
  assert.equal(report.passed, false)
  assert.equal(JSON.stringify(report).includes('SECRET-CREDENTIAL-IN-TRANSPORT'), false)
})

test('stop remains responsive when the shared session refresh never responds', async () => {
  const f = fixture()
  const controller = new AbortController()
  const run = runChat(options(f, { signal: controller.signal, ensureSession: () => new Promise(() => {}) }))
  setTimeout(() => controller.abort('Stopped by operator'), 20)
  const report = await Promise.race([run, new Promise((_, reject) => setTimeout(() => reject(new Error('Stop did not finish')), 500))])
  assert.equal(report.stopReason, 'Stopped by operator')
  assert.equal(report.totals.attempted, 0)
  assert.equal(f.sockets.length, 0)
})
