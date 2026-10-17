import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { test } from 'node:test'
import { CALL_LIMITS, safeFailure, selectPairs, validateCallPlan } from './plan.mjs'
import { endCall, runCycle } from './cycle.mjs'
import { parseArgs, planFromArgs } from './cli.mjs'
import { connectCallSocket, runCallSignaling } from './runner.mjs'

const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

// In-memory stand-in for the call gateway: replies after `latency` ms unless told to stay silent.
class FakeGateway {
  constructor({ latency = 2, silent = new Set(), dropOnInitiate = false, ignoreGuestLeave = false } = {}) {
    Object.assign(this, { latency, silent, dropOnInitiate, ignoreGuestLeave })
    this.users = new Map(); this.calls = new Map(); this.busy = new Set(); this.log = []; this.nextId = 1
  }
  socket(userId) {
    const gateway = this, socket = new EventEmitter()
    const deliver = (target, event, payload) => { if (!gateway.silent.has(event)) setTimeout(() => EventEmitter.prototype.emit.call(target, event, payload), gateway.latency) }
    socket.connected = true; socket.userId = userId
    socket.disconnect = () => { if (!socket.connected) return; socket.connected = false; EventEmitter.prototype.emit.call(socket, 'disconnect') }
    socket.emit = (event, payload) => {
      gateway.log.push({ userId, event, payload })
      if (event === 'initiate_call') {
        if (gateway.dropOnInitiate) return setTimeout(() => socket.disconnect(), gateway.latency)
        if (gateway.busy.has(userId) || gateway.busy.has(payload.targetUserId))
          return deliver(socket, 'exception', { status: 'error', message: 'You are already in another call', code: 'http_403', event: 'initiate_call' })
        gateway.busy.add(userId); gateway.busy.add(payload.targetUserId)
        const callId = `call-${gateway.nextId++}`
        gateway.calls.set(callId, { host: userId, callee: payload.targetUserId, roomId: payload.conversationId })
        deliver(socket, 'call_joined', { callId, role: 'host', session: { conversationId: payload.conversationId, initiatorId: userId }, rtpCapabilities: {} })
        deliver(gateway.users.get(payload.targetUserId), 'incoming_call', { callId, conversationId: payload.conversationId, initiatorId: userId, invitationId: `inv-${callId}` })
      } else if (event === 'accept_incoming_call') {
        deliver(socket, 'incoming_call_acceptance', { callId: payload.callId, outcome: 'accepted', rtpCapabilities: {} })
      } else if (event === 'leave_call') {
        if (!(gateway.ignoreGuestLeave && gateway.calls.get(payload.callId)?.callee === userId)) gateway.busy.delete(userId)
        const call = gateway.calls.get(payload.callId)
        if (call && !gateway.busy.has(call.host) && !gateway.busy.has(call.callee)) gateway.calls.delete(payload.callId)
        deliver(socket, 'call_left', { callId: payload.callId })
      }
      return true
    }
    gateway.users.set(userId, socket)
    return socket
  }
}

const configFor = rooms => ({
  baseUrl: 'http://127.0.0.1', fixtureNamespace: 'mu-aaaaaaaaaaaa',
  accounts: [...new Set(rooms.flatMap(r => r.participantIds))].map(id => ({ id })), rooms,
})
const rooms = Array.from({ length: 6 }, (_, i) => ({ id: `room-${i}`, participantIds: [`u${2 * i}`, `u${2 * i + 1}`] }))
const fakeAuth = () => { const calls = { logout: 0 }; return { calls, token: async account => account.id, logoutAll: async () => { calls.logout++; return { revoked: 12, failed: 0 } } } }
const options = (gateway, extra = {}) => ({ connect: async (_url, token) => gateway.socket(token), auth: fakeAuth(), sleep: wait, cycleTimeoutMs: 200, ...extra })

test('plan bounds protect the production Call Service', () => {
  assert.deepEqual(validateCallPlan({}), { pairs: 5, cps: 5, seconds: 20, holdMs: 0, planned: 100 })
  for (const bad of [{ pairs: 0 }, { pairs: 21 }, { pairs: 1.5 }, { cps: 0 }, { cps: 51 }, { seconds: 301 }, { holdMs: 60001 }, { holdMs: -1 }, { cps: 50, seconds: 300 }, { cps: 'x' }])
    assert.throws(() => validateCallPlan(bad), undefined, JSON.stringify(bad))
  assert.equal(validateCallPlan({ pairs: CALL_LIMITS.pairs, cps: 50, seconds: 100 }).planned, 5000)
})

test('pairs never share users across overlapping rooms', () => {
  const config = { rooms: [{ id: 'a', participantIds: ['u', 'v'] }, { id: 'b', participantIds: ['u', 'w'] }, { id: 'c', participantIds: ['x', 'y', 'z'] }] }
  const pairs = selectPairs(config, 2)
  assert.deepEqual(pairs.map(p => p.roomId), ['a', 'c'])
  assert.equal(new Set(pairs.flatMap(p => [p.caller, p.callee])).size, 4)
  assert.throws(() => selectPairs(config, 3), /only 2 disjoint/)
})

test('failure labels never expose server text', () => {
  assert.equal(safeFailure(new Error('Bearer secret-token leaked')), 'unexpected failure (details withheld)')
  assert.equal(safeFailure(new Error('accept timeout')), 'accept timeout')
})

test('a cycle sends the real gateway events and reports each phase', async () => {
  const gateway = new FakeGateway({ latency: 5 }), pair = { roomId: 'room-0', caller: 'u0', callee: 'u1' }
  const caller = gateway.socket('u0'), callee = gateway.socket('u1')
  const result = await runCycle(pair, { caller, callee }, { sleep: wait, holdMs: 20 })
  assert.deepEqual(gateway.log.map(e => `${e.userId}:${e.event}`), ['u0:initiate_call', 'u1:accept_incoming_call', 'u0:leave_call', 'u1:leave_call'])
  assert.deepEqual(gateway.log[0].payload, { conversationId: 'room-0', targetUserId: 'u1', selectedInviteeIds: ['u1'], callType: 'VOICE' })
  assert.equal(gateway.log[1].payload.invitationId, 'inv-call-1')
  assert.deepEqual(gateway.log[2].payload, { callId: 'call-1', reason: 'ended' })
  assert.ok(result.initiateMs >= 4 && result.ringMs >= result.initiateMs - 1 && result.acceptMs >= 4 && result.leaveMs >= 4 && result.guestLeaveMs >= 4)
  assert.ok(result.totalMs >= result.setupMs + 20 + result.leaveMs)
  assert.equal(gateway.calls.size, 0)
})

test('a missing invitation fails in the ring phase and the call can still be ended', async () => {
  const gateway = new FakeGateway({ silent: new Set(['incoming_call']) }), pair = { roomId: 'room-0', caller: 'u0', callee: 'u1' }
  const caller = gateway.socket('u0'), callee = gateway.socket('u1')
  const error = await runCycle(pair, { caller, callee }, { sleep: wait, timeoutMs: 40 }).catch(e => e)
  assert.equal(error.phase, 'ring'); assert.equal(error.callId, 'call-1'); assert.match(error.message, /invitation timeout/)
  assert.equal(gateway.calls.size, 1)
  assert.equal(await endCall(caller, error.callId, { callee }), true)
  assert.equal(gateway.calls.size, 0)
  assert.deepEqual(gateway.log.filter(e => e.event === 'leave_call').map(e => e.userId).sort(), ['u0', 'u1'])
  assert.equal(await endCall({ connected: false }, 'x'), false)
  assert.equal(await endCall(caller, null), false)
})

test('both sides leave, so a single pair can run back-to-back calls', async () => {
  const gateway = new FakeGateway()
  const report = await runCallSignaling(configFor(rooms), { pairs: 1, cps: 20, seconds: 1 }, options(gateway, { cycleTimeoutMs: 500 }))
  assert.equal(report.counts.failed, 0, JSON.stringify(report.failures))
  assert.ok(report.counts.completed >= 10, JSON.stringify(report.counts))
  assert.equal(gateway.busy.size, 0)
})

test('server exception codes and masked messages are reported when the gateway refuses a call', async () => {
  const gateway = new FakeGateway({ ignoreGuestLeave: true })
  const report = await runCallSignaling(configFor(rooms), { pairs: 1, cps: 10, seconds: 1 }, options(gateway, { cycleTimeoutMs: 100 }))
  assert.ok(report.counts.completed <= 1)
  assert.ok(report.failures['initiate: socket exception (http_403)'] >= 1, JSON.stringify(report.failures))
  assert.deepEqual(report.exceptionSamples, ['You are already in another call'])
})

test('a dropped socket is reported as a disconnect', async () => {
  const gateway = new FakeGateway({ dropOnInitiate: true }), pair = { roomId: 'room-0', caller: 'u0', callee: 'u1' }
  const error = await runCycle(pair, { caller: gateway.socket('u0'), callee: gateway.socket('u1') }, { sleep: wait }).catch(e => e)
  assert.equal(safeFailure(error), 'socket disconnected'); assert.equal(error.phase, 'initiate')
})

test('a paced run completes every call, reuses pairs and cleans up', async () => {
  const gateway = new FakeGateway({ latency: 3 }), opts = options(gateway)
  const report = await runCallSignaling(configFor(rooms), { pairs: 3, cps: 30, seconds: 1 }, opts)
  assert.equal(report.counts.planned, 30)
  assert.equal(report.counts.completed, 30); assert.equal(report.counts.failed, 0); assert.equal(report.counts.skipped, 0)
  assert.equal(report.passed, true); assert.equal(report.stopReason, null)
  assert.ok(report.peakConcurrentCalls >= 1 && report.peakConcurrentCalls <= 3)
  assert.equal(report.latencyMs.setupMs.count, 30)
  assert.equal(report.connect.sockets, 6)
  assert.equal(gateway.calls.size, 0)
  assert.equal(opts.auth.calls.logout, 1)
  assert.ok([...gateway.users.values()].every(s => !s.connected))
  assert.ok(report.achievedCps > 15 && report.achievedCps < 45, String(report.achievedCps))
})

test('offered load beyond the free pairs is skipped and fails the verdict, never queued', async () => {
  const gateway = new FakeGateway({ latency: 40 })
  const report = await runCallSignaling(configFor(rooms), { pairs: 1, cps: 40, seconds: 1 }, options(gateway, { cycleTimeoutMs: 1000 }))
  assert.ok(report.counts.skipped > 0)
  assert.equal(report.counts.failed, 0)
  assert.ok(report.counts.started + report.counts.skipped >= 30)
  assert.equal(report.peakConcurrentCalls, 1)
  assert.equal(report.passed, false)
})

test('failed calls are attributed to a phase and ended; unrecoverable leaves are reported as stuck', async () => {
  const gateway = new FakeGateway({ silent: new Set(['call_left']) })
  const report = await runCallSignaling(configFor(rooms), { pairs: 2, cps: 5, seconds: 2 }, options(gateway, { cycleTimeoutMs: 30 }))
  assert.equal(report.counts.completed, 0)
  assert.ok(report.counts.failed >= 1)
  assert.ok(Object.keys(report.failures).every(key => key.startsWith('leave: ')), JSON.stringify(report.failures))
  assert.ok(report.cleanup.callsStuck >= 1)
  assert.equal(report.passed, false)
})

test('the run stops when more than 30% of calls fail', async () => {
  const gateway = new FakeGateway({ silent: new Set(['incoming_call']) })
  const report = await runCallSignaling(configFor(rooms), { pairs: 6, cps: 50, seconds: 5 }, options(gateway, { cycleTimeoutMs: 20 }))
  assert.equal(report.stopReason, 'error ratio above 30%')
  assert.ok(report.counts.failed >= 20)
  assert.equal(report.passed, false)
})

test('an abort ends in-flight calls before the sockets close', async () => {
  const gateway = new FakeGateway({ latency: 5 }), controller = new AbortController()
  const running = runCallSignaling(configFor(rooms), { pairs: 2, cps: 10, seconds: 20, holdMs: 5000 }, options(gateway, { signal: controller.signal, sleep: (ms, signal) => new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('operator stop')) }, { once: true })
  }) }))
  await wait(150); controller.abort()
  const report = await running
  assert.equal(report.stopReason, 'operator stop')
  assert.equal(report.passed, false)
  assert.equal(gateway.calls.size, 0)
  assert.ok([...gateway.users.values()].every(s => !s.connected))
})

test('connectCallSocket joins the /call namespace with the lifecycle version and waits for readiness', async () => {
  let seen
  const socket = new EventEmitter()
  socket.connect = () => setTimeout(() => EventEmitter.prototype.emit.call(socket, 'call_socket_ready', {}), 5)
  socket.disconnect = () => {}
  const connected = await connectCallSocket('http://127.0.0.1', 'tok', { factory: (url, opts) => { seen = { url, opts }; return socket } })
  assert.equal(connected, socket)
  assert.equal(seen.url, 'http://127.0.0.1/call')
  assert.equal(seen.opts.path, '/call/socket.io')
  assert.deepEqual(seen.opts.auth, { token: 'tok', groupLifecycleVersion: 3 })
  assert.deepEqual(seen.opts.transports, ['websocket'])
  assert.equal(seen.opts.reconnection, false)
})

test('connectCallSocket rejects when the handshake fails', async () => {
  const socket = new EventEmitter()
  let closed = false
  socket.connect = () => setTimeout(() => EventEmitter.prototype.emit.call(socket, 'connect_error', new Error('nope')), 5)
  socket.disconnect = () => { closed = true }
  await assert.rejects(connectCallSocket('http://127.0.0.1', 't', { factory: () => socket }), /socket disconnected/)
  assert.equal(closed, true)
})

test('CLI options are strict', () => {
  assert.deepEqual(parseArgs(['--config', '/m.json', '--run', '--pairs', '3', '--hold-ms', '100']), { config: '/m.json', run: true, pairs: '3', 'hold-ms': '100' })
  assert.deepEqual(planFromArgs(parseArgs(['--pairs', '3', '--cps', '2', '--seconds', '10', '--hold-ms', '250'])), { pairs: 3, cps: 2, seconds: 10, holdMs: 250, planned: 20 })
  assert.throws(() => parseArgs(['--nope']), /unknown option/)
  assert.throws(() => parseArgs(['--pairs']), /needs a value/)
  assert.throws(() => parseArgs(['positional']), /unknown option/)
})
