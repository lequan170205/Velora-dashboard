// Paced call-lifecycle load against the real Call Service Socket.IO gateway.
// Fixture accounts only; every call it opens is ended again by this runner.
import { randomUUID } from 'node:crypto'
import { io } from 'socket.io-client'
import { AuthManager, STRESS_USER_AGENT } from '../runner.mjs'
import { boundedMap, dueSlots, pacingWake, percentiles, sleep as defaultSleep } from '../protocol.mjs'
import { runCycle, endCall, waitFor } from './cycle.mjs'
import { safeFailure, selectPairs, validateCallPlan } from './plan.mjs'

const TICK_MS = 5
const ERROR_STOP_RATIO = 0.3
const ERROR_STOP_MIN_ATTEMPTS = 20
const round = value => (value == null ? null : Math.round(value * 10) / 10)
const summarize = values => {
  const p = percentiles(values)
  return { count: p.count, p50: round(p.p50), p95: round(p.p95), p99: round(p.p99), max: values.length ? round(Math.max(...values)) : null }
}

// Server-authored exception metadata only: a short code and a message with ids masked.
export const exceptionCode = error => {
  const code = error?.serverException?.code
  return typeof code === 'string' && /^[a-z0-9_]{1,40}$/.test(code) ? code : null
}
export const exceptionText = error => {
  const message = error?.serverException?.message
  if (typeof message !== 'string' || !message) return null
  return message.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, '<id>').replace(/[0-9a-f]{24,}/gi, '<id>').replace(/\s+/g, ' ').slice(0, 120)
}

export async function connectCallSocket(baseUrl, token, { timeoutMs = 20000, factory = io } = {}) {
  const socket = factory(baseUrl + '/call', {
    path: '/call/socket.io', transports: ['websocket'], auth: { token, groupLifecycleVersion: 3 },
    extraHeaders: { 'User-Agent': STRESS_USER_AGENT }, autoConnect: false, forceNew: true, reconnection: false,
  })
  const abort = new AbortController()
  const ready = waitFor(socket, 'call_socket_ready', { ms: timeoutMs, label: 'socket ready', signal: abort.signal })
  const failed = new Promise((_, reject) => socket.once('connect_error', () => reject(new Error('socket disconnected'))))
  ready.catch(() => {}); failed.catch(() => {})
  socket.connect()
  try { await Promise.race([ready, failed]); return socket } catch (error) { abort.abort(); socket.disconnect(); throw error }
}

export async function runCallSignaling(config, rawPlan, {
  signal, onProgress = () => {}, now = performance.now.bind(performance), sleep = defaultSleep,
  connect = connectCallSocket, auth = new AuthManager(config, { signal }), cycleTimeoutMs = 15000, pairOffset = 0,
} = {}) {
  const plan = validateCallPlan(rawPlan)
  const pairs = selectPairs(config, plan.pairs, pairOffset)
  const accounts = new Map(config.accounts.map(a => [a.id, a]))
  const startedAt = new Date().toISOString()
  const runId = randomUUID()
  const sockets = []
  const report = {
    runId, startedAt, baseUrl: config.baseUrl, plan, pairs: pairs.length, stopReason: null, passed: false,
    connect: null, counts: { planned: plan.planned, offered: 0, started: 0, completed: 0, failed: 0, skipped: 0 },
    achievedCps: 0, peakConcurrentCalls: 0, latencyMs: {}, failures: {}, exceptionSamples: [], cleanup: { callsEnded: 0, callsStuck: 0, sockets: 0, logins: null },
  }
  const samples = { initiateMs: [], ringMs: [], acceptMs: [], setupMs: [], leaveMs: [], guestLeaveMs: [], totalMs: [] }
  const connectMs = []
  const free = []
  let active = 0, deadPairs = 0
  const inFlight = new Set()

  try {
    // Fixture pairs connect up front so the measured phases exclude login and handshake.
    const connected = await boundedMap(pairs, 4, async pair => {
      const open = async id => {
        const t = now()
        const socket = await connect(config.baseUrl, await auth.token(accounts.get(id)))
        sockets.push(socket); connectMs.push(now() - t)
        return socket
      }
      return { pair, caller: await open(pair.caller), callee: await open(pair.callee) }
    })
    report.connect = { sockets: sockets.length, ...summarize(connectMs) }
    free.push(...connected)
    onProgress({ phase: 'connected', sockets: sockets.length })

    const interval = 1000 / plan.cps
    const start = now()
    let slot = 0
    const settle = async entry => {
      try {
        const result = await runCycle(entry.pair, entry, { now, sleep, holdMs: plan.holdMs, timeoutMs: cycleTimeoutMs, signal })
        for (const key of Object.keys(samples)) samples[key].push(result[key])
        report.counts.completed++
        free.push(entry)
      } catch (error) {
        report.counts.failed++
        const label = safeFailure(error), code = exceptionCode(error)
        const key = `${error.phase ?? 'unknown'}: ${label}${code ? ` (${code})` : ''}`
        report.failures[key] = (report.failures[key] ?? 0) + 1
        const text = exceptionText(error)
        if (text && !report.exceptionSamples.includes(text) && report.exceptionSamples.length < 5) report.exceptionSamples.push(text)
        if (error.callId) {
          if (await endCall(entry.caller, error.callId, { callee: entry.callee })) report.cleanup.callsEnded++
          else report.cleanup.callsStuck++
        }
        // A pair whose sockets dropped cannot take more calls.
        if (entry.caller.connected && entry.callee.connected) free.push(entry); else deadPairs++
      } finally { active-- }
    }
    while (slot < plan.planned && !signal?.aborted) {
      const wait = pacingWake(start, slot, interval) - now()
      if (wait > 0) await sleep(Math.min(wait, TICK_MS), signal)
      const { skip, emit } = dueSlots(start, slot, now(), interval, plan.planned)
      report.counts.skipped += skip; report.counts.offered += skip + emit
      slot += skip + emit
      for (let i = 0; i < emit; i++) {
        const entry = free.pop()
        // No idle pair means the control plane is slower than the offered rate; record it, never queue it.
        if (!entry) { report.counts.skipped++; continue }
        report.counts.started++; active++
        report.peakConcurrentCalls = Math.max(report.peakConcurrentCalls, active)
        const task = settle(entry).finally(() => inFlight.delete(task))
        inFlight.add(task)
      }
      const attempts = report.counts.completed + report.counts.failed
      if (attempts >= ERROR_STOP_MIN_ATTEMPTS && report.counts.failed / attempts > ERROR_STOP_RATIO) { report.stopReason = 'error ratio above 30%'; break }
      if (deadPairs === pairs.length) { report.stopReason = 'all fixture pairs lost their sockets'; break }
    }
    if (signal?.aborted && !report.stopReason) report.stopReason = 'operator stop'
    await Promise.allSettled([...inFlight])
    const elapsed = (now() - start) / 1000
    report.durationSeconds = round(elapsed)
    report.achievedCps = round(report.counts.started / Math.max(elapsed, 0.001))
  } catch (error) {
    report.stopReason = safeFailure(error)
  } finally {
    // Let in-flight cycles end their calls before the sockets they need go away.
    await Promise.allSettled([...inFlight])
    report.cleanup.sockets = sockets.length
    sockets.forEach(socket => socket.disconnect())
    try { report.cleanup.logins = await auth.logoutAll() } catch { report.cleanup.logins = { revoked: 0, failed: 'logout unavailable' } }
  }
  for (const [key, values] of Object.entries(samples)) report.latencyMs[key] = summarize(values)
  const { planned, skipped, failed } = report.counts
  report.passed = !report.stopReason && failed === 0 && skipped <= Math.floor(planned / 1000) && report.cleanup.callsStuck === 0
  report.finishedAt = new Date().toISOString()
  return report
}
