import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { test } from 'node:test'
import { CONNECTION_LIMITS, assignSockets, safeFailure, summarize, validateConnectionPlan } from './plan.mjs'
import { parseArgs, planFromArgs } from './cli.mjs'
import { runConnectionCapacity } from './runner.mjs'

const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const emitLocal = (target, event, payload) => EventEmitter.prototype.emit.call(target, event, payload)

const config = {
  baseUrl: 'http://127.0.0.1', fixtureNamespace: 'mu-aaaaaaaaaaaa',
  accounts: ['a0', 'a1', 'a2', 'a3'].map(id => ({ id })),
  rooms: [{ id: 'r0', participantIds: ['a0', 'a1'] }, { id: 'r1', participantIds: ['a2', 'a3'] }],
}
const fakeAuth = () => { const stats = { logout: 0 }; return { stats, token: async account => `tok-${account.id}`, logoutAll: async () => { stats.logout++; return { revoked: 4, failed: 0 } } } }

// In-memory stand-in for the chat gateway: accepts the websocket first, answers presence and message events afterwards.
class FakeChat {
  constructor({ latency = 2, maxConnections = Infinity, refuseFirst = 0, silentPresence = false, ackDelay = 0 } = {}) {
    Object.assign(this, { latency, maxConnections, refuseFirst, silentPresence, ackDelay })
    this.live = new Set(); this.connects = 0; this.attemptsByUser = new Map(); this.messages = []
  }
  factory = (_url, options) => {
    const server = this, socket = new EventEmitter(), userId = options.auth.token.slice(4)
    socket.connected = false
    const later = fn => setTimeout(fn, server.latency)
    socket.connect = () => later(() => {
      const attempt = (server.attemptsByUser.get(userId + socket.__n) ?? 0)
      server.connects++
      if (server.live.size >= server.maxConnections || server.refuseFirst > 0 && server.connects <= server.refuseFirst) return emitLocal(socket, 'connect_error', new Error('refused'))
      socket.connected = true; server.live.add(socket); socket.userId = userId; void attempt
      emitLocal(socket, 'connect')
    })
    socket.disconnect = () => { if (!socket.connected) return socket; socket.connected = false; server.live.delete(socket); emitLocal(socket, 'disconnect'); return socket }
    socket.drop = () => socket.disconnect()
    socket.emit = (event, payload) => {
      if (!socket.connected) return true
      if (event === 'check_presence' && !server.silentPresence) later(() => socket.connected && emitLocal(socket, 'presence_update', { userId: payload.userId, isOnline: true }))
      if (event === 'send_message') {
        server.messages.push(payload)
        later(() => {
          if (server.ackDelay) setTimeout(() => emitLocal(socket, 'message_synced', { clientMessageId: payload.clientMessageId }), server.ackDelay)
          else emitLocal(socket, 'message_synced', { clientMessageId: payload.clientMessageId })
          const room = config.rooms.find(r => r.id === payload.conversationId)
          for (const other of server.live) if (other.userId !== socket.userId && room.participantIds.includes(other.userId)) emitLocal(other, 'new_message', { clientMessageId: payload.clientMessageId })
        })
      }
      return true
    }
    return socket
  }
}
const run = (server, plan, extra = {}) => runConnectionCapacity(config, plan, { createSocket: server.factory, auth: fakeAuth(), sleep: wait, backoffBaseMs: 5, connectTimeoutMs: 400, probeDeadlineMs: 600, ...extra })

test('plan bounds protect the production chat gateway', () => {
  assert.deepEqual(validateConnectionPlan({}), { sockets: 500, rampPerSecond: 50, holdSeconds: 30, probesPerSecond: 1, storms: 0, stormJitterMs: 5000 })
  for (const bad of [{ sockets: 0 }, { sockets: CONNECTION_LIMITS.sockets + 1 }, { sockets: 1.5 }, { rampPerSecond: 0 }, { rampPerSecond: 201 }, { holdSeconds: 1801 },
    { probesPerSecond: 6 }, { storms: 4 }, { storms: -1 }, { stormJitterMs: 60001 }, { sockets: 'x' }]) assert.throws(() => validateConnectionPlan(bad), undefined, JSON.stringify(bad))
})

test('sockets are spread evenly over the accounts', () => {
  const items = assignSockets([{ id: 'a' }, { id: 'b' }, { id: 'c' }], 7)
  assert.deepEqual(items.map(i => i.account.id), ['a', 'b', 'c', 'a', 'b', 'c', 'a'])
  assert.deepEqual(items.map(i => i.device), [0, 0, 0, 1, 1, 1, 2])
})

test('summaries and failure labels are stable', () => {
  assert.deepEqual(summarize([]), { count: 0, p50: null, p95: null, p99: null, max: null })
  assert.deepEqual(summarize([4, 1, 3, 2]), { count: 4, p50: 2, p95: 4, p99: 4, max: 4 })
  assert.equal(safeFailure(new Error('Bearer secret')), 'unexpected failure (details withheld)')
  assert.equal(safeFailure(new Error('connect timeout')), 'connect timeout')
})

test('ramp and hold connect every socket and deliver probes to every other-member socket', async () => {
  const server = new FakeChat()
  const report = await run(server, { sockets: 20, rampPerSecond: 200, holdSeconds: 2, probesPerSecond: 2 })
  assert.equal(report.ramp.connected, 20); assert.equal(report.ramp.failed, 0)
  assert.equal(report.ramp.readyMs.count, 20)
  assert.equal(report.hold.minConnected, 20); assert.equal(report.hold.unexpectedDisconnects, 0)
  assert.equal(report.hold.probes.sent, 4); assert.equal(report.hold.probes.failed, 0)
  assert.equal(report.hold.probes.expectedPerProbe, 5) // 20 sockets / 4 accounts = 5 sockets for the single other member
  assert.equal(report.hold.probes.missingDeliveries, 0)
  assert.equal(report.passed, true, JSON.stringify(report))
  assert.equal(server.live.size, 0)
  assert.equal(report.socketsPerAccount, 5)
})

test('a probe completes even when the ack arrives after every delivery', async () => {
  const server = new FakeChat({ ackDelay: 30 })
  const report = await run(server, { sockets: 8, rampPerSecond: 200, holdSeconds: 2, probesPerSecond: 2 })
  assert.equal(report.hold.probes.sent, 4); assert.equal(report.hold.probes.failed, 0, JSON.stringify(report.hold.probes))
  assert.ok(report.hold.probes.ackMs.p50 >= 29)
  assert.equal(report.passed, true)
})

test('refused connections are counted by cause and fail the verdict', async () => {
  const server = new FakeChat({ maxConnections: 12 })
  const report = await run(server, { sockets: 20, rampPerSecond: 200, holdSeconds: 0, probesPerSecond: 0 })
  assert.equal(report.ramp.connected, 12); assert.equal(report.ramp.failed, 8)
  assert.deepEqual(report.ramp.failures, { 'connect error': 8 })
  assert.equal(report.passed, false)
})

test('a socket that never gets a presence answer is a ready timeout', async () => {
  const server = new FakeChat({ silentPresence: true })
  const report = await run(server, { sockets: 4, rampPerSecond: 100, holdSeconds: 0, probesPerSecond: 0 }, { connectTimeoutMs: 60 })
  assert.equal(report.ramp.failed, 4); assert.deepEqual(report.ramp.failures, { 'ready timeout': 4 })
  assert.equal(server.live.size, 0)
})

// Wraps the fake so connects are refused while `refusing()` is true; the drop notification arms it.
const withRefusals = (server, refusing) => (url, options) => {
  const socket = server.factory(url, options), connect = socket.connect
  socket.connect = () => (refusing() ? setTimeout(() => emitLocal(socket, 'connect_error', new Error('refused')), 1) : connect())
  return socket
}

test('a reconnect storm drops everything and restores it with retries', async () => {
  const server = new FakeChat()
  let storm = false, refused = 0
  // During the storm each socket's first attempt is refused once, so retries are exercised.
  const first = new Set()
  const factory = withRefusals(server, () => false)
  const report = await run(server, { sockets: 12, rampPerSecond: 200, holdSeconds: 0, probesPerSecond: 0, storms: 1, stormJitterMs: 40 }, {
    onProgress: info => { if (info.phase === 'storm') storm = true },
    createSocket: (url, options) => {
      const key = `${options.auth.token}:${options.forceNew}:${first.size}`
      if (storm && first.size < 8) { first.add(key); refused++; return withRefusals(server, () => true)(url, options) }
      return factory(url, options)
    },
  })
  const s = report.storms[0]
  assert.equal(s.dropped, 12); assert.equal(s.lost, 0); assert.equal(s.restored, 12)
  assert.equal(s.connectedAfter, 12)
  assert.equal(refused, 8); assert.equal(s.attempts[2], 8); assert.equal(s.attempts[1], 4)
  assert.ok(s.allRestoredMs !== null && s.restoredMs.count === 12)
  assert.equal(s.verification.failed, 0)
  assert.equal(report.passed, true, JSON.stringify(report))
})

test('sockets that cannot reconnect after all retries are reported as lost', async () => {
  const server = new FakeChat()
  let blocked = false
  const report = await run(server, { sockets: 4, rampPerSecond: 200, holdSeconds: 0, probesPerSecond: 0, storms: 1, stormJitterMs: 5 }, {
    onProgress: info => { if (info.phase === 'storm') blocked = true },
    createSocket: withRefusals(server, () => blocked), backoffBaseMs: 1,
  })
  const s = report.storms[0]
  assert.equal(s.lost, 4); assert.deepEqual(s.failures, { 'connect error': 4 })
  assert.equal(s.attempts[6], 4)
  assert.equal(report.passed, false)
})

test('a socket dropped by the server during the hold is reported', async () => {
  const server = new FakeChat()
  const running = run(server, { sockets: 8, rampPerSecond: 200, holdSeconds: 2, probesPerSecond: 0 })
  await wait(700); ;[...server.live][0].drop()
  const report = await running
  assert.equal(report.hold.unexpectedDisconnects, 1); assert.equal(report.hold.minConnected, 7)
  assert.equal(report.passed, false)
})

test('an abort stops the run, closes every socket and logs the fixtures out', async () => {
  const server = new FakeChat(), controller = new AbortController(), auth = fakeAuth()
  const sleep = (ms, signal) => new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('operator stop')) }, { once: true })
  })
  const running = run(server, { sockets: 8, rampPerSecond: 200, holdSeconds: 30, probesPerSecond: 1 }, { signal: controller.signal, auth, sleep })
  await wait(300); controller.abort()
  const report = await running
  assert.equal(report.stopReason, 'operator stop'); assert.equal(report.passed, false)
  assert.equal(server.live.size, 0); assert.equal(auth.stats.logout, 1)
})

test('CLI options are strict', () => {
  assert.deepEqual(planFromArgs(parseArgs(['--sockets', '2000', '--ramp', '100', '--hold', '60', '--probes', '2', '--storms', '1', '--jitter-ms', '3000'])),
    { sockets: 2000, rampPerSecond: 100, holdSeconds: 60, probesPerSecond: 2, storms: 1, stormJitterMs: 3000 })
  assert.throws(() => parseArgs(['--nope']), /unknown option/)
  assert.throws(() => parseArgs(['--sockets']), /needs a value/)
  assert.throws(() => planFromArgs(parseArgs(['--sockets', '9999'])), /sockets must be/)
})
