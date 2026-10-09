import { readFile, writeFile, mkdir, stat, chmod } from 'node:fs/promises'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { io } from 'socket.io-client'
import { Ledger, sleep, boundedMap, skippedSlots } from './protocol.mjs'

export const LIMITS = Object.freeze({ minAccounts: 2, maxAccounts: 200, rooms: 20, pending: 100, messages: 10000, seconds: 1200 })
export const DEFAULT_STAGES = [{ name: '50 users', users: 50, rps: 5, seconds: 180 }]
// Identify this authorized Node runner consistently for the public HTTP/WS edge.
export const STRESS_USER_AGENT = 'VeloraStressDemo/1.0'
export function claims(token) {
  try { return JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString()) } catch { return {} }
}
export const parseJwtSub = token => claims(token).sub ?? null

export function validateConfig(input) {
  const url = new URL(input?.baseUrl)
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/') throw new Error('baseUrl must be an origin')
  if (!/^mu-[a-f0-9]{12}$/.test(input.fixtureNamespace ?? '')) throw new Error('fixtureNamespace must be isolated')
  const { accounts, rooms } = input
  if (!Array.isArray(accounts) || accounts.length < 2 || accounts.length > 200) throw new Error('accounts must contain 2..200 fixture accounts')
  const ids = new Set(), emails = new Set()
  for (const [i, a] of accounts.entries()) {
    if (!a?.id || ids.has(a.id) || emails.has(a.email) ||
        a.email !== `${input.fixtureNamespace}.${String(i + 1).padStart(3, '0')}@velora-stress.invalid` ||
        typeof a.password !== 'string' || a.password.length < 24) throw new Error('fixture identities must be unique and isolated')
    ids.add(a.id); emails.add(a.email)
  }
  if (!Array.isArray(rooms) || rooms.length !== 20) throw new Error('exactly 20 rooms required')
  const roomIds = new Set(), covered = new Set()
  for (const room of rooms) {
    const members = new Set(room?.participantIds)
    if (!room?.id || roomIds.has(room.id) || !Array.isArray(room.participantIds) || members.size < 2 ||
        members.size !== room.participantIds.length || [...members].some(id => !ids.has(id))) throw new Error('room participants must be fixture accounts')
    roomIds.add(room.id); members.forEach(id => covered.add(id))
  }
  if (covered.size !== accounts.length) throw new Error('every configured account must belong to a room')
  const stages = input.stages ?? DEFAULT_STAGES
  if (!Array.isArray(stages) || !stages.length || stages.length > 10) throw new Error('1..10 stages required')
  let messages = 0, seconds = 0
  for (const s of stages) {
    // Separate cohorts require separate runs; do not keep 150 online and claim 50.
    if (typeof s.name !== 'string' || !s.name || s.name.length > 80 || s.users !== accounts.length ||
        !Number.isInteger(s.seconds) || s.seconds < 1 || !Number.isFinite(s.rps) || s.rps < 0 || s.rps > 1000) throw new Error('invalid fixed-cohort stage')
    messages += Math.floor(s.rps * s.seconds); seconds += s.seconds
  }
  if (messages > LIMITS.messages || seconds > LIMITS.seconds) throw new Error('run exceeds bounded limits')
  return { ...input, stages }
}

export class AuthManager {
  constructor(config, { fetchImpl = fetch, now = Date.now, jitter = () => Math.random() * 10000, signal } = {}) {
    this.config = config; this.fetch = fetchImpl; this.now = now; this.jitter = jitter; this.signal = signal
    this.sessions = new Map(); this.flights = new Map(); this.queue = []; this.active = 0
    this.stats = { logins: 0, refreshAttempts: 0, refreshFailures: 0 }
  }
  async gate() {
    if (this.active < 2) { this.active++; return }
    await new Promise(resolve => this.queue.push(resolve))
  }
  release() { const next = this.queue.shift(); if (next) next(); else this.active-- }
  async request(path, body, { token, signal = this.signal, timeout = 30000 } = {}) {
    await this.gate()
    try {
      const s = AbortSignal.any([AbortSignal.timeout(timeout), ...(signal ? [signal] : [])])
      const r = await this.fetch(new URL(path, this.config.baseUrl), {
        method: body ? 'POST' : 'GET', headers: { 'User-Agent': STRESS_USER_AGENT, ...(body ? { 'content-type': 'application/json' } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body ? JSON.stringify(body) : undefined, signal: s })
      if (!r.ok) { const error = new Error('HTTP request failed'); error.status = r.status; throw error }
      return await r.json()
    } finally { this.release() }
  }
  accept(account, result) {
    const c = claims(result?.accessToken)
    if (c.sub !== account.id || !Number.isFinite(c.exp) || !result.refreshToken) throw new Error('authenticated identity did not match fixture account')
    this.sessions.set(account.id, { ...result, exp: c.exp, refreshAt: c.exp * 1000 - 30000 - this.jitter() })
    return result.accessToken
  }
  async login(account) {
    const result = await this.request('/auth/mobile/login', { email: account.email, password: account.password })
    this.stats.logins++; this.accept(account, result); return result
  }
  async token(account) {
    let flight = this.flights.get(account.id)
    if (flight) return flight
    const s = this.sessions.get(account.id)
    if (s && this.now() < s.refreshAt) return s.accessToken
    flight = (async () => {
      if (!s) return (await this.login(account)).accessToken
      this.stats.refreshAttempts++
      const body = { refreshToken: s.refreshToken, refreshRequestId: randomUUID() }
      try {
        let result
        try { result = await this.request('/auth/mobile/refresh', body) }
        catch (error) {
          if (error.status || this.signal?.aborted) throw error
          result = await this.request('/auth/mobile/refresh', body)
        }
        return this.accept(account, result)
      } catch (error) { this.stats.refreshFailures++; throw error }
    })().finally(() => this.flights.delete(account.id))
    this.flights.set(account.id, flight); return flight
  }
  async logoutAll() {
    // Two requests at a time; allow each owned session its existing 5s budget.
    const deadline = AbortSignal.timeout(Math.max(30000, Math.ceil(this.sessions.size / 2) * 5000 + 5000))
    let revoked = 0, failed = 0
    await boundedMap([...this.sessions.values()], 2, async session => {
      try { await this.request('/auth/mobile/logout', { refreshToken: session.refreshToken }, { signal: deadline, timeout: 5000 }); revoked++ }
      catch { failed++ }
    })
    this.sessions.clear(); return { revoked, failed }
  }
}

async function connect(state, token, signal) {
  state.socket.auth = { token }
  await new Promise((resolve, reject) => {
    const clean = () => { clearTimeout(timer); state.socket.off('connect', good); state.socket.off('connect_error', bad); signal?.removeEventListener('abort', bad) }
    const good = () => { clean(); state.connected = true; resolve() }
    const bad = () => { clean(); reject(new Error('socket connection failure')) }
    const timer = setTimeout(bad, 30000)
    state.socket.once('connect', good); state.socket.once('connect_error', bad)
    signal?.addEventListener('abort', bad, { once: true })
    if (signal?.aborted) return bad()
    state.socket.connect()
  })
  for (const room of state.rooms) state.socket.emit('join_conversation', room.id)
  state.token = token
}

export async function run(input, options = {}) {
  const config = validateConfig(input), signal = options.signal ?? new AbortController().signal
  const auth = options.auth ?? new AuthManager(config, { ...options, signal })
  const createSocket = options.createSocket ?? io
  const ledger = new Ledger(config.accounts, { deadline: options.deadline ?? 8000, signal })
  const runId = `${config.fixtureNamespace}-${randomUUID()}`
  const report = { runId, startedAt: new Date().toISOString(), finishedAt: null, passed: false,
    preflight: false, authenticated: 0, online: 0, sockets: 0, rooms: 20, stages: [], stopReason: null }
  const states = new Map(); let cleanup = false
  const progress = phase => options.onProgress?.({ phase, authenticated: report.authenticated,
    online: report.online, pending: ledger.pending.size })
  const payload = e => ({ conversationId: e.room, clientMessageId: e.id, type: 'text',
    signalType: 0, content: `[Velora multi-user fixture] ${e.id}` })
  const emit = (state, room, kind, stage) => {
    const e = ledger.begin({ id: `${runId}-${kind}-${randomUUID()}`, room: room.id,
      sender: state.account.id, recipients: room.participantIds.filter(id => id !== state.account.id), kind, stage })
    state.socket.emit('send_message', payload(e)); return e
  }
  try {
    await boundedMap(config.accounts, 2, async account => {
      const token = await auth.token(account)
      if (parseJwtSub(token) !== account.id) throw new Error('authenticated identity did not match fixture account')
      report.authenticated++
      const rooms = config.rooms.filter(r => r.participantIds.includes(account.id))
      const socket = createSocket(config.baseUrl, { path: '/socket.io', transports: ['websocket'],
        extraHeaders: { 'User-Agent': STRESS_USER_AGENT },
        auth: { token }, autoConnect: false, forceNew: true, reconnection: false })
      const state = { account, socket, rooms, connected: false, refreshing: false }
      states.set(account.id, state)
      socket.on('message_synced', msg => ledger.ack(msg, account.id))
      socket.on('new_message', msg => ledger.delivery(msg, account.id))
      socket.on('message_failed', msg => ledger.failed(msg, account.id))
      socket.on('disconnect', () => {
        state.connected = false
        if (!cleanup && !state.refreshing) report.stopReason ??= 'participant disconnected'
      })
      await connect(state, token, signal); report.online++; progress('setup')
      for (const room of rooms) {
        const detail = await auth.request(`/conversations/${room.id}`, null, { token })
        const ids = detail.participantIds ?? detail.participants?.map(p => p.id)
        if (!Array.isArray(ids) || ids.length !== room.participantIds.length ||
            [...ids].sort().some((id, i) => id !== [...room.participantIds].sort()[i])) throw new Error('membership mismatch')
      }
    })
    report.sockets = states.size
    if (report.stopReason || report.online !== config.accounts.length) throw new Error('cohort setup failed')
    await sleep(options.warmMs ?? 500, signal)
    const checks = config.rooms.flatMap(room => room.participantIds.map(id => ({ room, state: states.get(id) })))
    await boundedMap(checks, 2, async ({ room, state }) => {
      const e = await emit(state, room, 'preflight').promise
      if (!ledger.good(e)) throw new Error('membership or fan-out preflight failed')
    })
    const room = config.rooms[0], state = states.get(room.participantIds[0])
    const original = await emit(state, room, 'replay').promise
    if (!ledger.good(original)) throw new Error('initial replay preflight failed')
    const storedId = original.storedId
    await ledger.replay(original, () => state.socket.emit('send_message', payload(original)))
    await sleep(options.replayQuietMs ?? 500, signal)
    if (original.storedId !== storedId || original.ackCount !== 2 || !ledger.good(original)) throw new Error('replay identity or duplicate failure')
    report.preflight = true; report.loadStartedAt = new Date().toISOString()
    report.setupSeconds = (Date.parse(report.loadStartedAt) - Date.parse(report.startedAt)) / 1000
    let senderIndex = 0
    for (const [stageIndex, stage] of config.stages.entries()) {
      const start = performance.now(), interval = stage.rps ? 1000 / stage.rps : Infinity
      const planned = Math.floor(stage.rps * stage.seconds), tasks = new Set()
      let slot = 0, emitted = 0, skipped = 0
      const stageName = `${stageIndex + 1}: ${stage.name}`
      while (slot < planned && !signal.aborted && !report.stopReason) {
        const due = start + slot * interval
        await sleep(Math.max(0, due - performance.now()), signal)
        const missed = skippedSlots(start, slot, performance.now(), interval, planned)
        if (missed) { skipped += missed; slot += missed; continue }
        slot++
        if (tasks.size >= LIMITS.pending) { skipped++; continue }
        const account = config.accounts[senderIndex++ % config.accounts.length], s = states.get(account.id)
        const targetRoom = s.rooms[Math.floor((senderIndex - 1) / config.accounts.length) % s.rooms.length]
        const task = (async () => {
          try {
            const token = await auth.token(account)
            if (token !== s.token) {
              s.refreshing = true; s.socket.disconnect()
              await connect(s, token, signal); await sleep(300, signal); s.refreshing = false
            }
            if (!s.connected || signal.aborted || report.stopReason) { skipped++; return }
            emitted++
            await emit(s, targetRoom, 'load', stageName).promise
          } catch { report.stopReason ??= 'authentication or transport failure' }
        })()
        tasks.add(task); task.finally(() => tasks.delete(task))
        const completed = [...ledger.records.values()].filter(e => e.stage === stageName && e.done)
        if (completed.length >= 10 && completed.filter(e => !ledger.good(e)).length / completed.length > .3) report.stopReason ??= 'settled error ratio exceeded 30%'
        if (slot % Math.max(1, Math.round(stage.rps * 30)) === 0) progress('load')
      }
      if (!report.stopReason && !signal.aborted) await sleep(Math.max(0, start + stage.seconds * 1000 - performance.now()), signal)
      await Promise.allSettled([...tasks])
      const entries = [...ledger.records.values()].filter(e => e.stage === stageName)
      const summary = ledger.summary(entries)
      const elapsed = (performance.now() - start) / 1000
      const passed = !report.stopReason && !signal.aborted && emitted === planned && skipped === 0 && summary.failedMessages === 0
      report.stages.push({ name: stage.name, users: stage.users, planned, offered: slot,
        skipped, notOffered: planned - slot, plannedRps: stage.rps,
        achievedRps: emitted / stage.seconds, elapsedSeconds: elapsed, passed, ...summary })
      if (!passed) { report.stopReason ??= 'stage did not meet offered load and delivery deadlines'; break }
    }
    report.loadFinishedAt = new Date().toISOString()
  } catch (error) {
    const safe = ['authenticated identity did not match fixture account', 'membership mismatch',
      'membership or fan-out preflight failed', 'initial replay preflight failed',
      'replay identity or duplicate failure', 'socket connection failure', 'operator stop', 'cohort setup failed']
    report.stopReason ??= signal.aborted ? 'operator stop' : safe.includes(error?.message) ? error.message : 'setup or protocol failure'
  } finally {
    cleanup = true; ledger.close()
    for (const s of states.values()) s.socket.disconnect()
    report.cleanup = await auth.logoutAll()
    report.auth = auth.stats ?? {}
    const load = [...ledger.records.values()].filter(e => e.kind === 'load')
    report.totals = ledger.summary(load)
    report.preflightResults = ledger.summary([...ledger.records.values()].filter(e => e.kind !== 'load'))
    report.users = config.accounts.map(a => ({ id: a.id, ...ledger.summary(load.filter(e => e.sender === a.id)) }))
    report.perRoom = config.rooms.map(r => ({ id: r.id, members: r.participantIds.length, ...ledger.summary(load.filter(e => e.room === r.id)) }))
    report.diagnostics = ledger.diagnostics()
    report.passed = report.preflight && !report.stopReason && report.stages.length === config.stages.length &&
      report.stages.every(s => s.passed) && report.totals.failedMessages === 0 &&
      report.preflightResults.failedMessages === 0 && !(report.cleanup?.failed)
    report.finishedAt = new Date().toISOString(); progress('finished')
  }
  return report
}
export async function loadConfig(path) {
  if ((await stat(path)).mode & 0o077) throw new Error('private manifest must be mode 0600 or stricter')
  return validateConfig(JSON.parse(await readFile(path, 'utf8')))
}
export async function writeReport(report, path) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  await writeFile(path, JSON.stringify(report, null, 2), { mode: 0o600 }); await chmod(path, 0o600)
  const csvPath = path.endsWith('.json') ? path.slice(0, -5) + '.csv' : path + '.csv'
  const columns = ['stage', 'users', 'planned', 'offered', 'emitted', 'skipped', 'achieved_rps',
    'timely_ack', 'ack_timeout', 'ack_p95_ms', 'delivery_p95_ms', 'expected_recipients',
    'timely_recipients', 'missing_recipients', 'duplicate_delivery', 'passed']
  const quote = value => {
    const text = String(value ?? '')
    return '"' + (/^[=+@-]/.test(text) ? "'" : '') + text.replaceAll('"', '""') + '"'
  }
  const rows = report.stages.map(s => [s.name, s.users, s.planned, s.offered, s.emitted, s.skipped,
    s.achievedRps, s.timelyAck, s.ackTimeout, s.ack.p95, s.delivery.p95, s.deliveries.expected,
    s.deliveries.timely, s.deliveries.missing, s.deliveries.duplicate, s.passed])
  await writeFile(csvPath, [columns, ...rows].map(row => row.map(quote).join(',')).join('\n') + '\n', { mode: 0o600 })
  await chmod(csvPath, 0o600)
  return path
}
