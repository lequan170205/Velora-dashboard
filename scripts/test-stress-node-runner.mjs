import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { AuthManager, parseJwtSub, validateConfig, run, STRESS_USER_AGENT } from './stress/runner.mjs'
import { Ledger, skippedSlots } from './stress/protocol.mjs'

const token = (sub, exp = Math.floor(Date.now() / 1000) + 3600) => `e30.${Buffer.from(JSON.stringify({ sub, exp })).toString('base64url')}.x`
function config(extra = {}) {
  const fixtureNamespace = 'mu-0123456789ab'
  const accounts = ['a', 'b', 'c'].map((id, i) => ({ id,
    email: `${fixtureNamespace}.${String(i + 1).padStart(3, '0')}@velora-stress.invalid`, password: 'test-only-password-0123456789' }))
  return { baseUrl: 'https://fixture.test', fixtureNamespace, accounts,
    rooms: Array.from({ length: 20 }, (_, i) => ({ id: `r${i}`, participantIds: ['a', 'b', 'c'] })),
    stages: [{ name: 'tiny', users: 3, rps: 10, seconds: 1 }], ...extra }
}
test('reject identity collisions, real emails, external members, and inflated cohort count', () => {
  assert.throws(() => validateConfig(config({ accounts: [config().accounts[0], config().accounts[0]] })), /unique/)
  const bad = config(); bad.accounts[0].email = 'real@example.com'
  assert.throws(() => validateConfig(bad), /isolated/)
  const badRoom = config(); badRoom.rooms[0].participantIds.push('outsider')
  assert.throws(() => validateConfig(badRoom), /fixture/)
  assert.throws(() => validateConfig(config({ stages: [{ name: 'fake', users: 2, rps: 1, seconds: 1 }] })), /cohort/)
  assert.equal(parseJwtSub(token('a')), 'a')
})
test('lagging scheduler accounts every missed slot and resumes at a future slot without catchup', () => {
  assert.equal(skippedSlots(0, 0, 225, 100, 10), 3)
  assert.equal(skippedSlots(0, 3, 225, 100, 10), 0)
  assert.equal(skippedSlots(0, 0, 2, 100, 10), 0)
  assert.equal(skippedSlots(0, 8, 1100, 100, 10), 2)
  const skipped = skippedSlots(0, 0, 225, 100, 10)
  assert.equal(skipped + 1, 4) // Three skipped, one subsequent offered/emitted slot.
  assert.ok(skipped * 100 > 225)
})
test('refresh single-flight uses per-user rotated state and same retry identity after lost response', async () => {
  let failFirst = true
  const calls = []
  const manager = new AuthManager(config(), { jitter: () => 0, fetchImpl: async (url, init) => {
    assert.equal(init.headers['User-Agent'], STRESS_USER_AGENT)
    const body = JSON.parse(init.body); calls.push({ path: url.pathname, body })
    if (url.pathname.endsWith('login')) return { ok: true, json: async () => ({ accessToken: token('a', 1), refreshToken: 'old' }) }
    if (failFirst) { failFirst = false; throw new Error('lost response') }
    return { ok: true, json: async () => ({ accessToken: token('a'), refreshToken: 'rotated' }) }
  } })
  await manager.login(config().accounts[0])
  await Promise.all(Array.from({ length: 5 }, () => manager.token(config().accounts[0])))
  const refresh = calls.filter(c => c.path.endsWith('refresh'))
  assert.equal(refresh.length, 2); assert.equal(refresh[0].body.refreshRequestId, refresh[1].body.refreshRequestId)
  assert.equal(manager.sessions.get('a').refreshToken, 'rotated'); assert.equal(manager.stats.refreshAttempts, 1)
})
function message(e) { return { clientMessageId: e.id, conversationId: e.room, senderId: e.sender, id: 'stored-' + e.id } }
test('cleanup budgets the whole cohort without increasing request concurrency or exposing tokens', async t => {
  const budgets = []
  t.mock.method(AbortSignal, 'timeout', ms => { budgets.push(ms); return new AbortController().signal })
  let active = 0, peak = 0, requests = 0
  const manager = new AuthManager(config(), { fetchImpl: async (url, init) => {
    assert.equal(url.pathname, '/auth/mobile/logout')
    assert.equal(init.headers['User-Agent'], STRESS_USER_AGENT)
    requests++; active++; peak = Math.max(peak, active)
    await new Promise(resolve => setTimeout(resolve, 2))
    active--; return { ok: true, json: async () => ({ message: 'logged out' }) }
  } })
  for (let i = 0; i < 50; i++) manager.sessions.set(String(i), { refreshToken: 'fixture-' + i })
  const result = await manager.logoutAll()
  assert.deepEqual(result, { revoked: 50, failed: 0 })
  assert.equal(requests, 50); assert.equal(peak, 2); assert.equal(manager.sessions.size, 0)
  assert.ok(budgets[0] >= 25 * 5000)
  assert.ok(budgets.slice(1).every(ms => ms === 5000))
})
test('ACK before fanout does not settle; two recipients are two deliveries, not duplicates', async () => {
  const l = new Ledger(config().accounts, { deadline: 100 })
  const e = l.begin({ id: 'one', room: 'r0', sender: 'a', recipients: ['b', 'c'], kind: 'load' })
  l.ack(message(e), 'a'); assert.equal(e.done, false)
  l.delivery(message(e), 'b'); assert.equal(e.done, false)
  l.delivery(message(e), 'c'); await e.promise
  assert.equal(l.good(e), true); assert.equal(l.summary([e]).deliveries.timely, 2)
  l.delivery(message(e), 'c'); assert.equal(l.good(e), false); assert.equal(e.duplicate, 1); l.close()
})
test('wrong room, sender, receiver and stored identity cannot be successful fanout', async () => {
  const l = new Ledger(config().accounts, { deadline: 100 })
  const e = l.begin({ id: 'one', room: 'r0', sender: 'a', recipients: ['b'], kind: 'load' })
  l.delivery({ ...message(e), conversationId: 'wrong' }, 'b')
  l.delivery({ ...message(e), senderId: 'c' }, 'b')
  l.delivery(message(e), 'a'); l.ack(message(e), 'a')
  l.delivery({ ...message(e), id: 'different' }, 'b')
  assert.equal(e.unexpected, 4); assert.equal(e.seen, 0n); l.close(); await e.promise
})
test('late ACK and delivery remain deadline failures', async () => {
  let now = 0
  const l = new Ledger(config().accounts, { deadline: 20, now: () => now })
  const e = l.begin({ id: 'one', room: 'r0', sender: 'a', recipients: ['b'], kind: 'load' })
  await e.promise; now = 30; l.ack(message(e), 'a'); l.delivery(message(e), 'b')
  const s = l.summary([e]); assert.equal(s.timelyAck, 0); assert.equal(s.ackTimeout, 1)
  assert.equal(s.lateAck, 1); assert.equal(s.deliveries.missing, 1); assert.equal(s.deliveries.late, 1); l.close()
})
test('diagnostics are capped and cancellation settles every pending record', async () => {
  const controller = new AbortController(), l = new Ledger(config().accounts, { signal: controller.signal })
  const entries = Array.from({ length: 510 }, (_, i) => l.begin({ id: String(i), room: 'r0', sender: 'a', recipients: ['b'] }))
  controller.abort(); await Promise.all(entries.map(e => e.promise))
  assert.equal(l.traces.length, 500); assert.equal(l.omitted, 10); assert.equal(l.pending.size, 0); l.close()
})
function fixture(options = {}) {
  const sockets = [], seen = new Set(), emitted = []
  let cleanup = 0
  const auth = { token: async a => token(a.id),
    request: async path => config().rooms.find(r => path.endsWith(r.id)),
    logoutAll: async () => { cleanup++; return { revoked: 3, failed: 0 } } }
  class FakeSocket extends EventEmitter {
    constructor(opts) { super(); this.userId = parseJwtSub(opts.auth.token); this.rooms = new Set() }
    connect() { queueMicrotask(() => super.emit('connect')); return this }
    disconnect() { super.emit('disconnect') }
    emit(event, payload) {
      if (event === 'join_conversation') { this.rooms.add(payload); return this }
      if (event === 'send_message') {
        emitted.push({ at: performance.now(), id: payload.clientMessageId })
        const first = !seen.has(payload.clientMessageId); seen.add(payload.clientMessageId)
        const msg = { ...payload, senderId: this.userId, id: 'stored-' + payload.clientMessageId }
        setTimeout(() => super.emit('message_synced', msg), options.ackDelay ?? 2)
        if (first) setTimeout(() => {
          for (const peer of sockets) if (peer !== this && peer.rooms.has(payload.conversationId) &&
              !(options.dropLoad && payload.clientMessageId.includes('-load-'))) peer.emit('new_message', msg)
        }, options.deliveryDelay ?? 5)
        return this
      }
      return super.emit(event, payload)
    }
  }
  return { auth, emitted, cleanup: () => cleanup, createSocket: (_, opts) => {
    assert.equal(opts.extraHeaders['User-Agent'], STRESS_USER_AGENT)
    const s = new FakeSocket(opts); sockets.push(s); return s
  } }
}
test('integration fake: independent pacing, async all-recipient fanout, replay and owned cleanup', async () => {
  const f = fixture({ ackDelay: 80, deliveryDelay: 90 })
  const report = await run(config(), { ...f, warmMs: 0, replayQuietMs: 10, deadline: 200 })
  assert.equal(report.passed, true, report.stopReason)
  assert.equal(report.totals.emitted, 10); assert.equal(report.totals.deliveries.expected, 20)
  assert.equal(report.totals.deliveries.timely, 20); assert.equal(report.stages[0].skipped, 0)
  assert.equal(report.preflightResults.emitted, 61); assert.equal(f.cleanup(), 1)
  const load = f.emitted.filter(e => e.id.includes('-load-'))
  assert.ok(load.at(-1).at - load[0].at < 1050)
})
test('missing delivery stops escalation even with timely ACK; load counters exclude probes', async () => {
  const f = fixture({ dropLoad: true })
  const report = await run(config({ stages: [
    { name: 'first', users: 3, rps: 2, seconds: 1 }, { name: 'must not run', users: 3, rps: 3, seconds: 1 },
  ] }), { ...f, warmMs: 0, replayQuietMs: 10, deadline: 30 })
  assert.equal(report.passed, false); assert.equal(report.stages.length, 1)
  assert.equal(report.totals.timelyAck, 2); assert.equal(report.totals.deliveries.missing, 4)
  assert.equal(report.totals.emitted, 2); assert.equal(f.cleanup(), 1)
})
test('JWT collision fails before transport and revokes owned sessions', async () => {
  let cleaned = false
  const report = await run(config(), { auth: { token: async () => token('wrong'),
    logoutAll: async () => { cleaned = true; return { revoked: 0, failed: 0 } } },
    createSocket: () => { throw new Error('must not connect') } })
  assert.equal(report.passed, false); assert.equal(report.authenticated, 0); assert.equal(cleaned, true)
})
