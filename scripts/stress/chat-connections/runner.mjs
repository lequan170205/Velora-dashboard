// Chat connection capacity: ramp N authenticated sockets, hold them while probing
// delivery fan-out, then drop and re-establish all of them (reconnect storm).
// Fixture accounts only; several sockets per account stand in for several devices.
import { randomUUID } from 'node:crypto'
import { io } from 'socket.io-client'
import { AuthManager, STRESS_USER_AGENT } from '../runner.mjs'
import { sleep as defaultSleep } from '../protocol.mjs'
import { assignSockets, safeFailure, summarize, validateConnectionPlan } from './plan.mjs'

const CONNECT_TIMEOUT_MS = 20000
const PROBE_DEADLINE_MS = 8000
const RAMP_STOP_RATIO = 0.2
const RAMP_STOP_MIN = 50
const STORM_ATTEMPTS = 6
const SERIES_LIMIT = 120

export async function runConnectionCapacity(config, rawPlan, {
  signal, onProgress = () => {}, now = performance.now.bind(performance), sleep = defaultSleep,
  createSocket = io, auth = new AuthManager(config, { signal }), random = Math.random,
  connectTimeoutMs = CONNECT_TIMEOUT_MS, probeDeadlineMs = PROBE_DEADLINE_MS, backoffBaseMs = 1000,
} = {}) {
  const plan = validateConnectionPlan(rawPlan)
  const runId = `${config.fixtureNamespace}-${randomUUID()}`
  const roomsOf = new Map(config.accounts.map(a => [a.id, config.rooms.filter(r => r.participantIds.includes(a.id))]))
  const entries = assignSockets(config.accounts, plan.sockets).map(item => {
    const room = roomsOf.get(item.account.id)[0]
    return { ...item, room, peer: room.participantIds.find(id => id !== item.account.id), socket: null, connected: false, expectDrop: false }
  })
  const report = {
    runId, startedAt: new Date().toISOString(), baseUrl: config.baseUrl, plan, accounts: config.accounts.length,
    socketsPerAccount: Math.ceil(plan.sockets / config.accounts.length), stopReason: null, passed: false,
    ramp: null, hold: null, storms: [], cleanup: null,
  }
  let phase = 'ramp'
  const counters = { unexpected: 0, byPhase: { ramp: 0, hold: 0, storm: 0 } }
  const probes = new Map()
  const connectedCount = () => entries.reduce((n, e) => n + (e.connected ? 1 : 0), 0)
  const downsample = series => (series.length <= SERIES_LIMIT ? series : series.filter((_, i) => i % Math.ceil(series.length / SERIES_LIMIT) === 0))

  const wire = entry => {
    const { socket } = entry
    socket.on('disconnect', () => {
      entry.connected = false
      if (!entry.expectDrop) { counters.unexpected++; counters.byPhase[phase]++ }
    })
    socket.on('message_synced', msg => probes.get(msg?.clientMessageId)?.onAck(msg))
    socket.on('new_message', msg => probes.get(msg?.clientMessageId)?.onDelivery(entry))
  }

  // One attempt: websocket up, then a presence round trip proves the token was accepted.
  const attempt = async (entry, token) => {
    entry.expectDrop = true
    entry.socket?.removeAllListeners?.(); entry.socket?.disconnect()
    const socket = createSocket(config.baseUrl, { path: '/socket.io', transports: ['websocket'],
      extraHeaders: { 'User-Agent': STRESS_USER_AGENT }, auth: { token }, autoConnect: false, forceNew: true, reconnection: false })
    entry.socket = socket; entry.connected = false
    const started = now()
    return new Promise((resolve, reject) => {
      let connectMs = null, done = false
      const finish = (fn, value) => { if (done) return; done = true; clearTimeout(timer); socket.off('presence_update', ready); fn(value) }
      const fail = message => { if (done) return; socket.removeAllListeners(); socket.disconnect(); finish(reject, new Error(message)) }
      const ready = payload => {
        if (payload?.userId !== entry.peer) return
        entry.expectDrop = false; entry.connected = true; wire(entry)
        finish(resolve, { connectMs, readyMs: now() - started - connectMs })
      }
      const timer = setTimeout(() => fail(connectMs === null ? 'connect timeout' : 'ready timeout'), connectTimeoutMs)
      socket.on('presence_update', ready)
      socket.once('connect_error', () => fail('connect error'))
      socket.once('disconnect', () => fail('socket disconnected'))
      socket.once('connect', () => {
        connectMs = now() - started
        for (const room of roomsOf.get(entry.account.id)) socket.emit('join_conversation', room.id)
        socket.emit('check_presence', { userId: entry.peer, conversationId: entry.room.id })
      })
      socket.connect()
    })
  }

  const establish = async (entry, maxAttempts, since = now()) => {
    let last
    for (let n = 1; n <= maxAttempts; n++) {
      try {
        const token = await auth.token(entry.account)
        const result = await attempt(entry, token)
        return { ok: true, attempts: n, ...result, elapsedMs: now() - since }
      } catch (error) {
        last = error
        if (signal?.aborted) break
        if (n < maxAttempts) await sleep(Math.min(16000, backoffBaseMs * 2 ** (n - 1)) + random() * 250, signal).catch(() => {})
      }
    }
    return { ok: false, attempts: maxAttempts, failure: safeFailure(last), elapsedMs: now() - since }
  }

  // A probe is a real message: ack from the sender's socket, then arrival on every
  // socket that belongs to the other room members (the multi-device fan-out).
  const probe = () => {
    const ready = entries.filter(e => e.connected)
    if (!ready.length) return null
    const sender = ready[Math.floor(random() * ready.length)]
    const members = new Set(sender.room.participantIds.filter(id => id !== sender.account.id))
    const targets = entries.filter(e => e.connected && members.has(e.account.id))
    const id = `${runId}-probe-${randomUUID()}`
    const sentAt = now()
    const seen = new Set()
    const record = { expected: targets.length, delivered: 0, ackMs: null, firstMs: null, lastMs: null, complete: false }
    let settle
    const promise = new Promise(resolve => { settle = resolve })
    const timer = setTimeout(() => { probes.delete(id); settle(record) }, probeDeadlineMs)
    probes.set(id, {
      onAck: () => { record.ackMs ??= now() - sentAt },
      onDelivery: entry => {
        if (entry.account.id === sender.account.id || seen.has(entry.index)) return
        seen.add(entry.index)
        const t = now() - sentAt
        record.delivered++; record.firstMs ??= t; record.lastMs = t
        if (record.delivered >= record.expected && record.ackMs !== null) { clearTimeout(timer); probes.delete(id); record.complete = true; settle(record) }
      },
    })
    sender.socket.emit('send_message', { conversationId: sender.room.id, clientMessageId: id, type: 'text', signalType: 0, content: `[Velora connection probe] ${id}` })
    return promise
  }
  const summarizeProbes = results => ({
    sent: results.length, complete: results.filter(r => r.complete).length, failed: results.filter(r => !r.complete).length,
    expectedPerProbe: results.length ? Math.round(results.reduce((n, r) => n + r.expected, 0) / results.length) : 0,
    ackMs: summarize(results.filter(r => r.ackMs !== null).map(r => r.ackMs)),
    firstDeliveryMs: summarize(results.filter(r => r.firstMs !== null).map(r => r.firstMs)),
    lastDeliveryMs: summarize(results.filter(r => r.lastMs !== null).map(r => r.lastMs)),
    missingDeliveries: results.reduce((n, r) => n + Math.max(0, r.expected - r.delivered), 0),
  })

  try {
    // --- ramp: paced, no retries, so connect failures are visible ---
    const rampStart = now(), interval = 1000 / plan.rampPerSecond
    const connectMs = [], readyMs = [], rampFailures = {}, series = []
    let launched = 0, settled = 0, failed = 0, lastSample = -1, stopRamp = false
    const tasks = new Set()
    while (launched < entries.length && !signal?.aborted && !stopRamp) {
      const due = Math.min(entries.length - launched, Math.floor((now() - rampStart) / interval) + 1 - launched)
      for (let i = 0; i < due; i++) {
        const entry = entries[launched++]
        const task = establish(entry, 1).then(result => {
          settled++
          if (result.ok) { connectMs.push(result.connectMs); readyMs.push(result.readyMs) }
          else { failed++; rampFailures[result.failure] = (rampFailures[result.failure] ?? 0) + 1 }
        }).finally(() => tasks.delete(task))
        tasks.add(task)
      }
      const second = Math.floor((now() - rampStart) / 1000)
      if (second !== lastSample) { lastSample = second; series.push({ t: second, launched, connected: connectedCount() }); onProgress({ phase: 'ramp', launched, connected: connectedCount(), failed }) }
      if (settled >= RAMP_STOP_MIN && failed / settled > RAMP_STOP_RATIO) { report.stopReason = 'connect failures above 20%'; stopRamp = true }
      await sleep(Math.max(1, Math.min(20, interval)), signal).catch(() => {})
    }
    await Promise.allSettled([...tasks])
    series.push({ t: Math.round((now() - rampStart) / 1000), launched, connected: connectedCount() })
    report.ramp = {
      target: plan.sockets, launched, connected: connectedCount(), failed, failures: rampFailures,
      unexpectedDisconnects: counters.byPhase.ramp, seconds: Math.round((now() - rampStart) / 100) / 10, connectMs: summarize(connectMs), readyMs: summarize(readyMs), series: downsample(series),
    }
    if (signal?.aborted && !report.stopReason) report.stopReason = 'operator stop'

    // --- hold: steady sockets, one probe stream ---
    if (!report.stopReason) {
      phase = 'hold'
      const samples = [], results = [], pending = new Set()
      const holdStart = now()
      let owed = 0, minConnected = connectedCount()
      for (let second = 1; second <= plan.holdSeconds && !signal?.aborted; second++) {
        await sleep(Math.max(0, holdStart + second * 1000 - now()), signal).catch(() => {})
        const connected = connectedCount()
        minConnected = Math.min(minConnected, connected)
        samples.push({ t: second, connected })
        owed += plan.probesPerSecond
        for (; owed >= 1; owed--) {
          const p = probe()
          if (p) { const tracked = p.then(r => { results.push(r) }).finally(() => pending.delete(tracked)); pending.add(tracked) }
        }
        if (second % 5 === 0) onProgress({ phase: 'hold', second, connected })
      }
      await Promise.allSettled([...pending])
      report.hold = { seconds: plan.holdSeconds, minConnected, unexpectedDisconnects: counters.byPhase.hold, series: downsample(samples), probes: summarizeProbes(results) }
      if (signal?.aborted) report.stopReason = 'operator stop'
    }

    // --- storms: everything drops at once, then reconnects with jitter and retries ---
    for (let round = 1; round <= plan.storms && !report.stopReason; round++) {
      phase = 'storm'
      const t0 = now()
      const dropped = connectedCount()
      for (const entry of entries) { entry.expectDrop = true; entry.socket?.disconnect(); entry.connected = false }
      onProgress({ phase: 'storm', round, dropped })
      await sleep(300, signal).catch(() => {})
      const restored = [], attempts = {}, failures = {}
      let inFlight = 0, peakInFlight = 0, lost = 0
      const storm = entries.map(async entry => {
        await sleep(random() * plan.stormJitterMs, signal).catch(() => {})
        inFlight++; peakInFlight = Math.max(peakInFlight, inFlight)
        const result = await establish(entry, STORM_ATTEMPTS)
        inFlight--
        attempts[result.attempts] = (attempts[result.attempts] ?? 0) + 1
        if (result.ok) restored.push(now() - t0)
        else { lost++; failures[result.failure] = (failures[result.failure] ?? 0) + 1 }
      })
      await Promise.allSettled(storm)
      await sleep(1500, signal).catch(() => {})
      const verification = await Promise.all([probe(), probe()].filter(Boolean))
      report.storms.push({
        round, jitterMs: plan.stormJitterMs, dropped, restored: restored.length, lost, failures, attempts, peakConcurrentAttempts: peakInFlight,
        restoredMs: summarize(restored), allRestoredMs: lost === 0 && restored.length ? Math.round(Math.max(...restored)) : null,
        connectedAfter: connectedCount(), unexpectedDisconnectsAfter: counters.byPhase.storm, verification: summarizeProbes(verification),
      })
      if (signal?.aborted) report.stopReason = 'operator stop'
    }
  } catch (error) {
    report.stopReason ??= safeFailure(error)
  } finally {
    for (const entry of entries) { entry.expectDrop = true; entry.socket?.disconnect() }
    try { report.cleanup = { sockets: entries.length, logins: await auth.logoutAll() } } catch { report.cleanup = { sockets: entries.length, logins: { revoked: 0, failed: 'logout unavailable' } } }
  }
  const allowedFailures = Math.floor(plan.sockets / 1000)
  report.passed = !report.stopReason && report.ramp?.failed <= allowedFailures &&
    (report.hold ? report.hold.unexpectedDisconnects === 0 && report.hold.probes.failed === 0 : plan.holdSeconds === 0) &&
    report.storms.length === plan.storms && report.storms.every(s => s.lost === 0 && s.verification.failed === 0) && !report.cleanup?.logins?.failed
  report.finishedAt = new Date().toISOString()
  return report
}
