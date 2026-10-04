import type { Socket } from 'socket.io-client'

export type Stage = { name: string; sockets: number; rps: number; seconds: number }
export const PROFILES: Record<string, Stage[]> = {
  smoke: [{ name: 'Smoke', sockets: 1, rps: 1, seconds: 5 }],
  demo: [
    { name: 'Baseline', sockets: 5, rps: 2, seconds: 60 },
    { name: 'Ramp', sockets: 15, rps: 10, seconds: 60 },
    { name: 'Peak', sockets: 30, rps: 25, seconds: 60 },
    { name: 'Cooldown', sockets: 0, rps: 0, seconds: 30 },
    { name: 'Recovery', sockets: 1, rps: 1, seconds: 15 },
  ],
  recovery: [{ name: 'Recovery', sockets: 1, rps: 1, seconds: 15 }],
}
export type Attempt = { stage: string; id: string; outcome: string; ms: number }
export type Stats = { attempted: number; synced: number; failed: number; timeout: number; disconnected: number; p50: number | null; p95: number | null; p99: number | null }
export type StageResult = Stats & Stage & { skipped: number; emittedRps: number }
export type Report = {
  id: string; conversationId: string; profile: string; startedAt: string; finishedAt: string | null;
  phase: string; senderSockets: number; signedInUsers: 1; inFlight: number; skipped: number;
  preflight: boolean; loadPassed: boolean; passed: boolean; stopReason: string | null; totals: Stats;
  retryCheck: { status: 'pending' | 'passed' | 'failed'; detail: string | null };
  delivery: { received: number; duplicates: number; p95: number | null };
  stages: StageResult[]; samples: { time: string; sent: number; synced: number; p95: number | null }[];
  plan: Stage[];
}
type Message = { clientMessageId?: string; id?: string; conversationId?: string }
type SocketLike = Pick<Socket, 'connected' | 'on' | 'off' | 'emit' | 'connect' | 'disconnect'>
export type RunnerOptions = {
  conversationId: string; profile: string; stages: Stage[]; signal: AbortSignal;
  ensureSession: () => Promise<void>; createSocket: () => SocketLike;
  onUpdate: (report: Report) => void;
  ackTimeoutMs?: number; sessionIntervalMs?: number;
}
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
class RunError extends Error {}
export function percentile(values: number[], fraction: number) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  return Math.round(sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)])
}
export function stats(attempts: Attempt[]): Stats {
  const good = attempts.filter((a) => a.outcome === 'synced').map((a) => a.ms)
  return { attempted: attempts.length, synced: good.length,
    failed: attempts.filter((a) => a.outcome === 'failed').length,
    timeout: attempts.filter((a) => a.outcome === 'timeout').length,
    disconnected: attempts.filter((a) => a.outcome === 'disconnected').length,
    p50: percentile(good, .5), p95: percentile(good, .95), p99: percentile(good, .99) }
}
export function validateStages(stages: Stage[]) {
  if (!stages.length || stages.length > 10) throw new Error('Choose 1–10 stages.')
  for (const s of stages) {
    if (![s.sockets, s.rps, s.seconds].every(Number.isInteger) || s.sockets < 0 || s.sockets > 100 || s.rps < 0 || s.rps > 100 || s.seconds < 1 || s.seconds > 600 || (s.sockets === 0) !== (s.rps === 0)) throw new Error('Stage limits: 100 sockets, 100 messages/s, 1–600 seconds.')
  }
  if (stages.reduce((n, s) => n + s.seconds * s.rps, 0) > 10000 || stages.reduce((n, s) => n + s.seconds, 0) > 1200) throw new Error('Run limit: 10,000 messages and 20 minutes.')
}
export function csvReport(report: Report) {
  const columns = ['name', 'sockets', 'rps', 'seconds', 'emittedRps', 'attempted', 'synced', 'failed', 'timeout', 'disconnected', 'skipped', 'p50', 'p95', 'p99'] as const
  const quote = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`
  return [[...columns, 'loadPassed', 'retryCheck', 'retryDetail'].join(','), ...report.stages.map((s) => [...columns.map((key) => s[key]), report.loadPassed, report.retryCheck?.status ?? 'unknown', report.retryCheck?.detail].map(quote).join(','))].join('\n')
}

export async function runChat(options: RunnerOptions): Promise<Report> {
  validateStages(options.stages)
  const { signal, conversationId } = options
  const ackTimeoutMs = options.ackTimeoutMs ?? 8000
  const allSockets = new Set<SocketLike>()
  const senders: SocketLike[] = []
  const pending = new Map<string, { socket: SocketLike; finish: (outcome: string, messageId?: string) => void }>()
  const attempts: Attempt[] = []
  const tasks = new Set<Promise<void>>()
  const sentAt = new Map<string, number>()
  const deliveries = new Map<string, { count: number; ms: number }>()
  const report: Report = {
    id: `stress-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`, conversationId,
    profile: options.profile, startedAt: new Date().toISOString(), finishedAt: null,
    phase: 'Checking session', senderSockets: 0, signedInUsers: 1, inFlight: 0, skipped: 0,
    preflight: false, loadPassed: false, passed: false, stopReason: null, totals: stats([]),
    retryCheck: { status: 'pending', detail: null },
    delivery: { received: 0, duplicates: 0, p95: null }, stages: [], samples: [], plan: structuredClone(options.stages),
  }
  let observer: SocketLike | undefined
  let sessionCheck: Promise<void> | null = null
  let sessionTimer: ReturnType<typeof setInterval> | undefined
  let updateTimer: ReturnType<typeof setInterval> | undefined
  const update = () => {
    report.totals = stats(attempts)
    report.inFlight = pending.size
    report.senderSockets = senders.length
    const received = attempts.filter((a) => deliveries.has(a.id))
    report.delivery = { received: received.length,
      duplicates: received.reduce((sum, a) => sum + Math.max(0, deliveries.get(a.id)!.count - 1), 0),
      p95: percentile(received.map((a) => deliveries.get(a.id)!.ms), .95) }
    options.onUpdate(structuredClone(report))
  }
  const abort = () => {
    report.stopReason ??= typeof signal.reason === 'string' ? signal.reason : 'Stopped by operator'
    for (const socket of allSockets) socket.disconnect()
  }
  const checkStopped = () => {
    if (signal.aborted || report.stopReason) throw new RunError('Stopped')
  }
  const ensureSession = async () => {
    checkStopped()
    if (!sessionCheck) sessionCheck = new Promise<void>((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); signal.removeEventListener('abort', stopped) }
      const stopped = () => { cleanup(); reject(new RunError('Stopped')) }
      const timer = setTimeout(() => { cleanup(); reject(new RunError('Session check timed out')) }, 10000)
      signal.addEventListener('abort', stopped, { once: true })
      Promise.resolve().then(options.ensureSession).then(() => { cleanup(); resolve() }, (error) => { cleanup(); reject(error) })
    }).catch(() => {
      report.stopReason ??= 'Session unavailable. Sign in again or check the API.'
      for (const socket of allSockets) socket.disconnect()
    }).finally(() => { sessionCheck = null })
    await sessionCheck
    checkStopped()
  }
  const connect = async () => {
    checkStopped()
    const socket = options.createSocket()
    allSockets.add(socket)
    socket.on('message_synced', (message: Message) => {
      if (message?.conversationId && message.conversationId !== conversationId) return
      const entry = pending.get(message?.clientMessageId ?? '')
      if (entry?.socket === socket) entry.finish('synced', message.id)
    })
    socket.on('message_failed', (message: Message) => {
      if (message?.conversationId && message.conversationId !== conversationId) return
      const entry = pending.get(message?.clientMessageId ?? '')
      if (entry?.socket === socket) entry.finish('failed')
    })
    socket.on('disconnect', () => {
      for (const entry of [...pending.values()]) if (entry.socket === socket) entry.finish('disconnected')
    })
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); socket.off('connect', ready); socket.off('connect_error', failed); signal.removeEventListener('abort', failed) }
      const ready = () => { cleanup(); resolve() }
      const failed = () => { cleanup(); socket.disconnect(); reject(new RunError('Socket connection failed. Check the API origin and session.')) }
      const timer = setTimeout(failed, ackTimeoutMs)
      socket.on('connect', ready); socket.on('connect_error', failed)
      signal.addEventListener('abort', failed, { once: true })
      socket.connect()
    })
    return socket
  }
  const send = (socket: SocketLike, id: string): Promise<{ outcome: string; ms: number; messageId?: string }> => {
    const start = performance.now()
    sentAt.set(id, start)
    return new Promise((resolve) => {
      const finish = (outcome: string, messageId?: string) => {
        if (!pending.has(id)) return
        clearTimeout(timer); pending.delete(id)
        resolve({ outcome, messageId, ms: performance.now() - start })
      }
      const timer = setTimeout(() => finish('timeout'), ackTimeoutMs)
      pending.set(id, { socket, finish })
      if (!socket.connected) { finish('disconnected'); return }
      socket.emit('send_message', { conversationId, clientMessageId: id, type: 'text', signalType: 0, content: `[Velora stress fixture] ${id}` })
    })
  }
  signal.addEventListener('abort', abort, { once: true })
  try {
    await ensureSession()
    checkStopped()
    observer = await connect()
    observer.on('new_message', (message: Message) => {
      const id = message?.clientMessageId
      if (!id || !id.startsWith(report.id) || !sentAt.has(id)) return
      const previous = deliveries.get(id)
      deliveries.set(id, { count: (previous?.count ?? 0) + 1, ms: previous?.ms ?? performance.now() - sentAt.get(id)! })
    })
    observer.emit('join_conversation', conversationId)
    await delay(250)
    report.phase = 'Preflight: send, receive, replay'; update()
    const sender = await connect(); senders.push(sender)
    const probeId = `${report.id}-probe`
    const first = await send(sender, probeId)
    if (first.outcome !== 'synced' || !first.messageId) throw new RunError('Preflight send failed. This account must be a conversation member.')
    const deadline = performance.now() + ackTimeoutMs
    while (!deliveries.has(probeId) && performance.now() < deadline) { checkStopped(); await delay(25) }
    if (!deliveries.has(probeId)) throw new RunError('Preflight receiver event missing. Load was not started.')
    const replay = await send(sender, probeId)
    await delay(250)
    checkStopped()
    const retryDetail = replay.outcome !== 'synced' ? `Replay outcome: ${replay.outcome}.`
      : replay.messageId !== first.messageId ? 'Replay returned a different stored message ID.'
      : deliveries.get(probeId)?.count !== 1 ? 'Observer received duplicate events for the retry probe.' : null
    report.retryCheck = { status: retryDetail ? 'failed' : 'passed', detail: retryDetail }
    report.preflight = true
    sessionTimer = setInterval(() => { void ensureSession().catch(() => {}) }, options.sessionIntervalMs ?? 60000)
    updateTimer = setInterval(() => {
      report.samples.push({ time: new Date().toISOString(), sent: attempts.length + tasks.size, synced: stats(attempts).synced, p95: stats(attempts).p95 })
      update()
    }, 1000)
    for (const [stageIndex, stage] of options.stages.entries()) {
      checkStopped()
      report.phase = `${stage.name}: preparing`; update()
      await ensureSession()
      while (senders.length > stage.sockets) { const socket = senders.pop()!; socket.disconnect(); allSockets.delete(socket) }
      while (senders.length < stage.sockets) {
        checkStopped()
        const socket = await connect(); senders.push(socket)
        const setup = await send(socket, `${report.id}-setup-${stageIndex}-${senders.length}`)
        if (setup.outcome !== 'synced') throw new RunError('Sender setup failed. Check session or conversation membership.')
      }
      report.phase = stage.name; update()
      const before = attempts.length
      const started = performance.now()
      const planned = stage.rps * stage.seconds
      let offered = 0, skipped = 0, completed = 0, errors = 0
      while (performance.now() - started < stage.seconds * 1000 && !signal.aborted && !report.stopReason) {
        const elapsed = performance.now() - started
        const due = stage.rps ? Math.min(planned, Math.floor(elapsed * stage.rps / 1000) + 1) : 0
        if (due > offered) {
          skipped += Math.max(0, due - offered - 1); offered = due
          if (tasks.size >= 100 || sessionCheck) skipped++
          else {
            const socket = senders[(offered - 1) % senders.length]
            const id = `${report.id}-${stageIndex}-${offered}`
            const task = send(socket, id).then((result) => {
              attempts.push({ id, stage: stage.name, outcome: result.outcome, ms: result.ms })
              completed++; if (result.outcome !== 'synced') errors++
            }).finally(() => tasks.delete(task))
            tasks.add(task)
          }
        }
        if (completed >= 20 && errors / completed >= .3) report.stopReason = 'Error ratio exceeded 30%'
        if (!observer.connected || senders.some((s) => !s.connected)) report.stopReason ??= 'A load socket disconnected'
        await delay(10)
      }
      const sendingSeconds = (performance.now() - started) / 1000
      await Promise.all([...tasks])
      skipped += Math.max(0, planned - offered)
      report.skipped += skipped
      report.stages.push({ ...stage, skipped, emittedRps: (attempts.length - before) / Math.max(.001, sendingSeconds), ...stats(attempts.slice(before)) })
    }
  } catch (error) {
    // Only our fixed operational messages reach the report; auth/transport payloads do not.
    report.stopReason ??= error instanceof RunError ? error.message : 'Run could not complete. Check the API and network.'
  } finally {
    clearInterval(sessionTimer); clearInterval(updateTimer)
    await Promise.all([...tasks])
    if (!signal.aborted) await delay(250)
    for (const socket of allSockets) socket.disconnect()
    senders.length = 0
    signal.removeEventListener('abort', abort)
    report.finishedAt = new Date().toISOString()
    report.phase = report.stopReason ? 'Stopped' : 'Complete'
    update()
    report.loadPassed = !report.stopReason && report.preflight && attempts.length > 0 && report.totals.synced === attempts.length && report.skipped === 0 && report.delivery.received === attempts.length && report.delivery.duplicates === 0
    report.passed = report.loadPassed && report.retryCheck.status === 'passed'
    update()
  }
  return report
}
