// A realistic mixed workload: many idle sockets, steady chat, call churn and a few long calls at once.
// Pure planning code: it builds the timeline and child commands and judges the child reports.
export const MIXED_LIMITS = Object.freeze({ sockets: 6000, ramp: 100, window: 900, chatMessages: 10000, pairs: 20, mediaCalls: 20 })

// Assumptions behind the default profile, written down so the numbers can be defended.
export const PROFILES = Object.freeze({
  campus10k: {
    description: '10,000 registered users, 20% online at peak',
    assumptions: {
      registeredUsers: 10000, onlineAtPeak: 0.2, messagesPerOnlineUserPerMinute: 1, usersInCallAtPeak: 0.02,
      note: 'sockets = online users; chat rate = online users x messages per minute / 60; calls = users in a call / 2, split between held media calls and short signaling-only calls',
    },
    sockets: 2000, rampPerSecond: 25, windowSeconds: 300,
    chatRps: 33,
    mediaCalls: 10,
    churn: { pairs: 10, cps: 1, holdMs: 8000 },
  },
  smoke: {
    description: 'Small functional check of every workload',
    assumptions: { note: 'not a capacity statement' },
    sockets: 200, rampPerSecond: 25, windowSeconds: 30, chatRps: 5, mediaCalls: 0, churn: { pairs: 3, cps: 1, holdMs: 2000 },
  },
})

export const DEFAULT_THRESHOLDS = Object.freeze({
  chatAckP95Ms: 1000, chatDeliveryP95Ms: 2000, probeLastDeliveryP95Ms: 1000, callSetupP95Ms: 1000, failureRatio: 0.001, mediaLossRatio: 0.005,
})

export function resolveScenario(name = 'campus10k', overrides = {}) {
  const base = PROFILES[name]
  if (!base) throw new Error(`unknown profile ${name}; use ${Object.keys(PROFILES).join(' or ')}`)
  const s = {
    name, description: base.description, assumptions: base.assumptions,
    sockets: Number(overrides.sockets ?? base.sockets), rampPerSecond: Number(overrides.rampPerSecond ?? base.rampPerSecond),
    windowSeconds: Number(overrides.windowSeconds ?? base.windowSeconds), chatRps: Number(overrides.chatRps ?? base.chatRps),
    mediaCalls: Number(overrides.mediaCalls ?? base.mediaCalls),
    churn: {
      pairs: Number(overrides.churnPairs ?? base.churn.pairs), cps: Number(overrides.churnCps ?? base.churn.cps), holdMs: Number(overrides.churnHoldMs ?? base.churn.holdMs),
    },
    thresholds: { ...DEFAULT_THRESHOLDS, ...(overrides.thresholds ?? {}) },
  }
  const L = MIXED_LIMITS
  const int = (value, min, max, label) => { if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${label} must be ${min}..${max}`) }
  int(s.sockets, 50, L.sockets, 'sockets'); int(s.rampPerSecond, 1, L.ramp, 'rampPerSecond'); int(s.windowSeconds, 20, L.window, 'windowSeconds')
  int(s.mediaCalls, 0, L.mediaCalls, 'mediaCalls'); int(s.churn.pairs, 0, L.pairs, 'churnPairs'); int(s.churn.holdMs, 0, 60000, 'churnHoldMs')
  if (!Number.isFinite(s.chatRps) || s.chatRps < 0 || s.chatRps > 100) throw new Error('chatRps must be 0..100')
  if (!Number.isFinite(s.churn.cps) || s.churn.cps < 0 || s.churn.cps > 50) throw new Error('churnCps must be 0..50')
  if (s.mediaCalls + s.churn.pairs > L.pairs) throw new Error(`media calls + churn pairs must be at most ${L.pairs} (a user can be in one call at a time)`)
  if (Math.floor(s.chatRps * s.windowSeconds) > L.chatMessages) throw new Error(`chat plan exceeds ${L.chatMessages} messages; lower chatRps or windowSeconds`)
  if (s.churn.pairs > 0 && (s.churn.cps <= 0 || Math.floor(s.churn.cps * s.windowSeconds) > 5000)) throw new Error('churn needs 0 < cps and at most 5000 calls')
  // Little's law: calls in progress = rate x duration (hold plus about 0.2 s of signaling); each needs its own pair.
  if (s.churn.pairs > 0 && Math.ceil(s.churn.cps * (s.churn.holdMs / 1000 + 0.2)) > s.churn.pairs)
    throw new Error(`churn needs at least ${Math.ceil(s.churn.cps * (s.churn.holdMs / 1000 + 0.2))} pairs for ${s.churn.cps} calls/s held ${s.churn.holdMs} ms`)
  return s
}

// Everything starts after the sockets are up, so the steady window really has all of them.
export function buildTimeline(s) {
  const rampSeconds = Math.ceil(s.sockets / s.rampPerSecond)
  const begin = rampSeconds + 10
  const mediaSetup = 5 * s.mediaCalls + 20
  const timeline = {
    rampSeconds, beginSeconds: begin, windowSeconds: s.windowSeconds,
    connections: { startS: 0, holdSeconds: begin - rampSeconds + s.windowSeconds + 40 },
    chat: s.chatRps > 0 ? { startS: begin, seconds: s.windowSeconds } : null,
    churn: s.churn.pairs > 0 ? { startS: begin, seconds: s.windowSeconds } : null,
    media: s.mediaCalls > 0 ? { startS: begin, seconds: Math.max(10, s.windowSeconds - mediaSetup) } : null,
  }
  timeline.totalSeconds = begin + s.windowSeconds + 60
  return timeline
}

// paths: { node, bins: { chat, connections, churn, media, browserBundle }, config, localConfig, chatConfig, outDir, chrome, lanAddress }
export function buildCommands(s, timeline, paths) {
  const out = name => `${paths.outDir}/${name}.json`
  const commands = [{ name: 'connections', startS: timeline.connections.startS, output: out('connections'),
    argv: [paths.bins.connections, '--config', paths.localConfig, '--run', '--sockets', s.sockets, '--ramp', s.rampPerSecond, '--hold', timeline.connections.holdSeconds,
      '--probes', 1, '--storms', 0, '--output', out('connections')] }]
  if (timeline.chat) commands.push({ name: 'chat', startS: timeline.chat.startS, output: out('chat'),
    argv: [paths.bins.chat, '--config', paths.chatConfig, '--run', '--output', out('chat')] })
  if (timeline.churn) commands.push({ name: 'churn', startS: timeline.churn.startS, output: out('churn'),
    argv: [paths.bins.churn, '--config', paths.localConfig, '--run', '--pairs', s.churn.pairs, '--cps', s.churn.cps, '--seconds', timeline.churn.seconds,
      '--hold-ms', s.churn.holdMs, '--pair-offset', s.mediaCalls, '--output', out('churn')] })
  if (timeline.media) commands.push({ name: 'media', startS: timeline.media.startS, output: out('media'),
    // mediaLocal: reach the gateway on the local origin like the other tools instead of through the public edge.
    argv: [paths.bins.media, '--manifest', paths.mediaLocal ? paths.localConfig : paths.config, '--run', '--calls', s.mediaCalls, '--seconds', timeline.media.seconds, '--pair-offset', 0,
      '--lan-media-address', paths.lanAddress, '--chrome', paths.chrome, '--browser-bundle', paths.bins.browserBundle, '--output', out('media'), ...(paths.mediaLocal ? ['--local-origin'] : [])] })
  return commands.map(c => ({ ...c, argv: c.argv.map(String) }))
}

// Stage the chat runner should use: one stage over the steady window, all fixture accounts.
export function chatStage(s, accounts) {
  return { name: `mixed chat ${s.chatRps}/s`, users: accounts, rps: s.chatRps, seconds: s.windowSeconds }
}

const ratio = (n, d) => (d > 0 ? n / d : 0)
export function evaluate(reports, s) {
  const t = s.thresholds, criteria = []
  const add = (workload, name, value, limit, op) => {
    const missing = value === null || value === undefined || Number.isNaN(value)
    const pass = !missing && (op === '<=' ? value <= limit : op === '===' ? value === limit : false)
    criteria.push({ workload, name, value: missing ? null : Math.round(value * 1000) / 1000, limit, op, pass })
  }
  const missingReport = (workload, label) => add(workload, `${label} report present`, null, 'present', '===')

  const c = reports.connections
  if (!c) missingReport('connections', 'connections')
  else {
    add('connections', 'connect failure ratio', ratio(c.ramp?.failed ?? 0, c.plan?.sockets ?? 0), t.failureRatio, '<=')
    add('connections', 'sockets connected', c.ramp?.connected, c.plan?.sockets, '===')
    add('connections', 'unexpected disconnects', (c.ramp?.unexpectedDisconnects ?? 0) + (c.hold?.unexpectedDisconnects ?? 0), 0, '<=')
    add('connections', 'probe messages failed', c.hold?.probes?.failed, 0, '<=')
    add('connections', 'probe last-delivery p95 ms (all sockets)', c.hold?.probes?.lastDeliveryMs?.p95, t.probeLastDeliveryP95Ms, '<=')
  }
  if (reports.chat !== undefined || s.chatRps > 0) {
    const r = reports.chat, g = r?.stages?.[0]
    if (!g) missingReport('chat', 'chat')
    else {
      add('chat', 'failed messages', g.failedMessages, 0, '<=')
      add('chat', 'missing deliveries', g.deliveries?.missing, 0, '<=')
      add('chat', 'skipped ratio', ratio(g.skipped, g.planned), t.failureRatio, '<=')
      add('chat', 'ack p95 ms', g.ack?.p95, t.chatAckP95Ms, '<=')
      add('chat', 'delivery p95 ms', g.delivery?.p95, t.chatDeliveryP95Ms, '<=')
    }
  }
  if (s.churn.pairs > 0) {
    const r = reports.churn
    if (!r) missingReport('calls (signaling)', 'call signaling')
    else {
      add('calls (signaling)', 'failed calls', r.counts?.failed, 0, '<=')
      add('calls (signaling)', 'skipped ratio', ratio(r.counts?.skipped ?? 0, r.counts?.planned ?? 0), t.failureRatio, '<=')
      add('calls (signaling)', 'stuck calls', r.cleanup?.callsStuck, 0, '<=')
      add('calls (signaling)', 'setup p95 ms', r.latencyMs?.setupMs?.p95, t.callSetupP95Ms, '<=')
    }
  }
  if (s.mediaCalls > 0) {
    const r = reports.media, st = r?.stages?.[0]
    if (!r) missingReport('calls (media)', 'call media')
    else {
      add('calls (media)', 'run passed', r.passed ? 1 : 0, 1, '===')
      const audio = (st?.pairs ?? []).flatMap(p => p.audio ?? [])
      const packets = audio.reduce((n, a) => n + (a.packets ?? 0), 0), lost = audio.reduce((n, a) => n + (a.lost ?? 0), 0)
      add('calls (media)', 'packet loss ratio', ratio(lost, packets + lost), t.mediaLossRatio, '<=')
    }
  }
  return { criteria, passed: criteria.length > 0 && criteria.every(x => x.pass) }
}

// `docker stats --no-stream --format '{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}'` -> [{name, cpu, memMiB}]
export function parseDockerStats(text) {
  const toMiB = raw => {
    const m = /^([\d.]+)\s*([KMG]i?B)/i.exec(raw.trim()); if (!m) return null
    const v = Number(m[1]), u = m[2].toLowerCase()
    return u.startsWith('g') ? v * 1024 : u.startsWith('k') ? v / 1024 : v
  }
  return text.split('\n').map(line => line.split('\t')).filter(p => p.length >= 3).map(([name, cpu, mem]) => ({
    name: name.replace(/^microservices-boilerplate-/, '').replace(/-\d+$/, ''), cpu: Number(cpu.replace('%', '')), memMiB: toMiB(mem.split('/')[0]),
  })).filter(x => Number.isFinite(x.cpu))
}

export function summarizeResources(samples) {
  const by = new Map()
  for (const sample of samples) for (const row of sample) {
    const e = by.get(row.name) ?? { cpuSum: 0, cpuPeak: 0, memPeakMiB: 0, n: 0 }
    e.cpuSum += row.cpu; e.cpuPeak = Math.max(e.cpuPeak, row.cpu); e.memPeakMiB = Math.max(e.memPeakMiB, row.memMiB ?? 0); e.n++
    by.set(row.name, e)
  }
  return Object.fromEntries([...by].map(([name, e]) => [name, { cpuMean: Math.round(e.cpuSum / e.n * 10) / 10, cpuPeak: Math.round(e.cpuPeak * 10) / 10, memPeakMiB: Math.round(e.memPeakMiB) }]))
}
