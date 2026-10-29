// The four stress scenarios the dashboard offers: their fields, how a request becomes a CLI
// command, and how the tool's report becomes a pass/fail verdict with a few numbers.
// Pure code: no network, no processes. The agent and the dashboard share this definition.
import { resolveScenario } from '../mixed/scenario.mjs'

export const SCENARIO_IDS = ['chat', 'sockets', 'calls', 'mixed']

// A call held through signaling lasts this long; the cps below keeps every pair busy without queueing.
const SIGNALING_HOLD_S = 5
const MIXED_CHURN_HOLD_MS = 8000

const field = (key, label, unit, min, max, extra = {}) => ({ key, label, unit, min, max, type: 'number', ...extra })

// `capabilities.media` is true when the agent was started with Chrome; without it real-audio calls are unavailable.
export function describeScenarios(capabilities = {}) {
  const media = Boolean(capabilities.media)
  return [
    {
      id: 'chat', title: 'Chat messages', description: '50 fixture users send messages into 20 rooms; every message must be acknowledged and delivered to all recipients.',
      fields: [field('rps', 'Messages per second', 'msg/s', 1, 300), field('seconds', 'Duration', 'sec', 5, 300)],
      presets: [
        { id: 'light', label: 'Light', values: { rps: 5, seconds: 30 } },
        { id: 'medium', label: 'Medium', values: { rps: 33, seconds: 60 } },
        { id: 'heavy', label: 'Heavy', values: { rps: 100, seconds: 100 } },
        // 300 msg/s is the field maximum; the 10,000-message cap per run leaves 33 s.
        { id: 'max', label: 'Max', values: { rps: 300, seconds: 33 } },
      ],
    },
    {
      id: 'sockets', title: 'Socket connections', description: 'Open many chat sockets at once, hold them for a while, then optionally drop and reconnect them all together.',
      fields: [
        field('sockets', 'Sockets', 'sockets', 50, 6000), field('hold', 'Hold time', 'sec', 0, 1800),
        { key: 'storm', label: 'Drop and reconnect all at once', type: 'boolean' },
      ],
      presets: [
        { id: 'light', label: 'Light', values: { sockets: 200, hold: 30, storm: false } },
        { id: 'medium', label: 'Medium', values: { sockets: 1000, hold: 60, storm: true } },
        { id: 'heavy', label: 'Heavy', values: { sockets: 2000, hold: 120, storm: true } },
        { id: 'max', label: 'Max', values: { sockets: 6000, hold: 120, storm: true } },
      ],
    },
    {
      id: 'calls', title: 'Calls', description: media
        ? 'Concurrent 1-1 calls. Turn on “Real audio” to measure the media path through the SFU as well.'
        : 'Concurrent 1-1 calls (signaling only). Real audio needs the agent to run with Chrome.',
      fields: [
        field('calls', 'Concurrent calls', 'calls', 1, 20), field('seconds', 'Duration', 'sec', 10, 300),
        { key: 'media', label: 'Real audio', type: 'boolean', disabled: !media },
      ],
      presets: [
        { id: 'light', label: 'Light', values: { calls: 2, seconds: 30, media: false } },
        { id: 'medium', label: 'Medium', values: { calls: 5, seconds: 60, media: media } },
        { id: 'heavy', label: 'Heavy', values: { calls: 10, seconds: 120, media: media } },
        { id: 'max', label: 'Max', values: { calls: 20, seconds: 120, media: media } },
      ],
    },
    {
      id: 'mixed', title: 'Mixed', description: 'Chat, many sockets and calls running together, like the app at a busy hour.',
      fields: [
        field('sockets', 'Sockets', 'sockets', 50, 6000), field('chat', 'Messages per second', 'msg/s', 0, 100),
        field('churn', 'Short-call pairs', 'pairs', 0, 20), field('calls', 'Long calls (real audio)', 'calls', 0, media ? 20 : 0),
        field('seconds', 'Duration', 'sec', 20, 900),
      ],
      presets: [
        { id: 'light', label: 'Light', values: { sockets: 200, chat: 5, churn: 3, calls: 0, seconds: 30 } },
        { id: 'medium', label: 'Medium', values: { sockets: 1000, chat: 17, churn: 5, calls: media ? 4 : 0, seconds: 120 } },
        { id: 'school', label: 'Campus 10k', values: { sockets: 2000, chat: 33, churn: 10, calls: media ? 10 : 0, seconds: 300 } },
        // Long calls and short-call pairs share the 20 call pairs, so without Chrome the pairs go to short calls.
        { id: 'max', label: 'Max', values: { sockets: 6000, chat: 33, churn: media ? 0 : 20, calls: media ? 20 : 0, seconds: 300 } },
      ],
    },
  ]
}

const num = (value, label, min, max, integer = true) => {
  const n = Number(value)
  if (!Number.isFinite(n) || (integer && !Number.isInteger(n)) || n < min || n > max) throw new Error(`${label} must be between ${min} and ${max}`)
  return n
}

// Returns clean, typed parameters or throws an Error whose message is safe to show the operator.
export function validateParams(id, input, capabilities = {}) {
  const raw = input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  const scenario = describeScenarios(capabilities).find(s => s.id === id)
  if (!scenario) throw new Error('Unknown scenario')
  const known = new Set(scenario.fields.map(f => f.key))
  if (Object.keys(raw).some(key => !known.has(key))) throw new Error('Unknown setting')
  const out = {}
  for (const f of scenario.fields) {
    if (f.type === 'boolean') {
      if (raw[f.key] !== undefined && typeof raw[f.key] !== 'boolean') throw new Error(`${f.label} must be on or off`)
      out[f.key] = Boolean(raw[f.key])
      if (f.disabled && out[f.key]) throw new Error('The agent has no Chrome, so real audio is unavailable')
    } else out[f.key] = num(raw[f.key], f.label, f.min, f.max)
  }
  if (id === 'chat' && out.rps * out.seconds > 10000) throw new Error('At most 10,000 messages per run; lower the rate or the duration')
  if (id === 'mixed') {
    if (out.chat * out.seconds > 10000) throw new Error('At most 10,000 messages per run; lower the rate or the duration')
    if (out.calls + out.churn > 20) throw new Error('Long calls + short-call pairs: at most 20 (a user can be in one call at a time)')
    if (out.churn + out.calls === 0 && out.chat === 0) throw new Error('Choose at least chat or calls')
  }
  return out
}

// Rough run length for the progress bar, including setup and cleanup.
export function estimateSeconds(id, p) {
  if (id === 'chat') return p.seconds + 20
  if (id === 'sockets') return Math.ceil(p.sockets / rampFor(p.sockets, 200)) + p.hold + (p.storm ? 30 : 0) + 15
  if (id === 'calls') return p.seconds + (p.media ? 60 : 15)
  // the mixed tool's own timeline: ramp, 10 s settle, the window, then 60 s of margin
  return Math.ceil(p.sockets / rampFor(p.sockets, 100)) + 10 + p.seconds + 60
}

// Sockets opened per second: about 5% of the target per second, within what each tool allows.
const rampFor = (sockets, max) => Math.min(max, Math.max(10, Math.round(sockets / 20)))
const churnCps = churn => (churn > 0 ? Math.min(1, Math.max(0.1, Math.floor(churn / (MIXED_CHURN_HOLD_MS / 1000 + 0.2) * 100) / 100)) : 0)

// What the agent has to launch. `config` is the manifest the tool reads (stages are filled for chat);
// `paths` has bins (bundled tools), configFile, chatConfigFile, output and the media settings.
export function buildCommand(id, p, paths) {
  const a = value => String(value)
  if (id === 'chat') return { tool: 'chat', configKind: 'chat', stages: [{ name: `chat ${p.rps}/s`, users: paths.accounts, rps: p.rps, seconds: p.seconds }],
    argv: [paths.bins.chat, '--config', paths.chatConfigFile, '--run', '--output', paths.output] }
  if (id === 'sockets') return { tool: 'connections', configKind: 'plain',
    argv: [paths.bins.connections, '--config', paths.configFile, '--run', '--sockets', a(p.sockets), '--ramp', a(rampFor(p.sockets, 200)),
      '--hold', a(p.hold), '--probes', '1', '--storms', p.storm ? '1' : '0', '--output', paths.output] }
  if (id === 'calls' && p.media) return { tool: 'media', configKind: 'plain',
    argv: [paths.bins.media, '--manifest', paths.configFile, '--run', '--calls', a(p.calls), '--seconds', a(p.seconds), '--pair-offset', '0',
      '--lan-media-address', paths.lanAddress, '--chrome', paths.chrome, '--browser-bundle', paths.bins.browserBundle, '--local-origin', '--output', paths.output] }
  if (id === 'calls') return { tool: 'signaling', configKind: 'plain',
    argv: [paths.bins.signaling, '--config', paths.configFile, '--run', '--pairs', a(p.calls), '--cps', a(Math.max(0.1, Math.floor(p.calls / (SIGNALING_HOLD_S + 0.5) * 100) / 100)),
      '--seconds', a(p.seconds), '--hold-ms', a(SIGNALING_HOLD_S * 1000), '--output', paths.output] }
  // The mixed tool needs the mixed.mjs bundle plus the other bundled tools in one directory.
  const argv = [paths.bins.mixed, '--config', paths.configFile, '--bins-dir', paths.binsDir, '--run', '--profile', 'campus10k', '--base-url', paths.baseUrl,
    '--sockets', a(p.sockets), '--ramp', a(rampFor(p.sockets, 100)), '--window', a(p.seconds), '--chat-rps', a(p.chat),
    '--media-calls', a(p.calls), '--churn-pairs', a(p.churn), '--churn-cps', a(churnCps(p.churn)), '--churn-hold-ms', a(MIXED_CHURN_HOLD_MS), '--output', paths.output]
  if (p.calls > 0) argv.push('--chrome', paths.chrome, '--lan-address', paths.lanAddress, '--media-local')
  return { tool: 'mixed', configKind: 'plain', argv }
}

// Check the mixed settings the same way the tool will, so a bad value fails before anything starts.
export function checkMixed(p) {
  resolveScenario('campus10k', { sockets: p.sockets, rampPerSecond: rampFor(p.sockets, 100), windowSeconds: p.seconds, chatRps: p.chat,
    mediaCalls: p.calls, churnPairs: p.churn, churnCps: churnCps(p.churn), churnHoldMs: MIXED_CHURN_HOLD_MS })
}

const ms = v => (v == null ? '—' : `${Math.round(v)} ms`)
const count = v => (v == null ? '—' : Number(v).toLocaleString('en-US'))
const pct = (n, d) => (d > 0 ? `${Math.round(n / d * 10000) / 100}%` : '0%')

// Turns a tool report into { passed, reason, metrics: [{label, value, bad?}], failures: [text] }.
export function summarize(id, p, report, { stopped = false } = {}) {
  const r = report && typeof report === 'object' ? report : null
  if (!r) return { passed: false, reason: stopped ? 'Stopped by the operator' : 'The tool did not produce a report', metrics: [], failures: [] }
  const out = (passed, metrics, failures, reason) => ({
    passed: Boolean(passed) && !stopped && failures.length === 0,
    reason: stopped ? 'Stopped by the operator' : passed && failures.length === 0 ? null : reason ?? failures[0] ?? 'Failed',
    // A stopped run has no verdict, so its unmet criteria would only be noise.
    metrics, failures: stopped ? [] : failures,
  })
  const failures = []
  if (r.stopReason) failures.push(`Stopped early: ${String(r.stopReason).slice(0, 120)}`)
  if (id === 'chat') {
    const t = r.totals ?? {}, planned = (r.stages ?? []).reduce((n, s) => n + (s.planned ?? 0), 0) || p.rps * p.seconds
    const missing = t.deliveries?.missing ?? 0, skipped = (r.stages ?? []).reduce((n, s) => n + (s.skipped ?? 0), 0)
    if (t.failedMessages) failures.push(`${count(t.failedMessages)} messages failed or missed the acknowledgement deadline`)
    if (missing) failures.push(`${count(missing)} deliveries missing`)
    if (skipped) failures.push(`${count(skipped)} send slots skipped because the generator could not keep up`)
    if (!r.passed && failures.length === 0) failures.push('The tool reported a failure')
    return out(r.passed, [
      { label: 'Messages sent', value: `${count(t.emitted ?? 0)} / ${count(planned)}` },
      { label: 'Failed messages', value: count(t.failedMessages ?? 0), bad: Boolean(t.failedMessages) },
      { label: 'Ack p95', value: ms(t.ack?.p95) }, { label: 'Delivery p95', value: ms(t.delivery?.p95) },
      { label: 'Missing deliveries', value: count(missing), bad: Boolean(missing) },
      { label: 'Actual rate', value: `${Math.round((r.stages?.[0]?.achievedRps ?? 0) * 10) / 10} msg/s` },
    ], failures)
  }
  if (id === 'sockets') {
    const ramp = r.ramp ?? {}, hold = r.hold, storm = r.storms?.[0]
    if (ramp.failed) failures.push(`${count(ramp.failed)} sockets failed to connect`)
    if (hold?.unexpectedDisconnects) failures.push(`${count(hold.unexpectedDisconnects)} sockets dropped while held`)
    if (hold?.probes?.failed) failures.push(`${count(hold.probes.failed)} probe messages did not reach every socket`)
    for (const s of r.storms ?? []) if (s.lost) failures.push(`${count(s.lost)} sockets did not reconnect after the mass drop`)
    if (!r.passed && failures.length === 0) failures.push('The tool reported a failure')
    const metrics = [
      { label: 'Sockets connected', value: `${count(ramp.connected ?? 0)} / ${count(ramp.target ?? p.sockets)}`, bad: Boolean(ramp.failed) },
      { label: 'Connect p95', value: ms(ramp.connectMs?.p95) },
      { label: 'Unexpected drops', value: count((ramp.unexpectedDisconnects ?? 0) + (hold?.unexpectedDisconnects ?? 0)), bad: Boolean(hold?.unexpectedDisconnects) },
      { label: 'Probe delivery p95', value: ms(hold?.probes?.lastDeliveryMs?.p95) },
    ]
    if (storm) metrics.push({ label: 'Reconnect after drop', value: storm.allRestoredMs == null ? `${count(storm.lost)} lost` : `${(storm.allRestoredMs / 1000).toFixed(1)} s`, bad: Boolean(storm.lost) })
    return out(r.passed, metrics, failures)
  }
  if (id === 'calls' && p.media) {
    const stage = r.stages?.[0], audio = (stage?.pairs ?? []).flatMap(x => x.audio ?? [])
    const packets = audio.reduce((n, a) => n + (a.packets ?? 0), 0), lost = audio.reduce((n, a) => n + (a.lost ?? 0), 0)
    if (r.failure) failures.push(`Call failed: ${String(r.failure).slice(0, 120)}`)
    else if (!r.passed) failures.push(stage?.failure ? `Call failed: ${String(stage.failure).slice(0, 120)}` : 'The tool reported a failure')
    return out(r.passed, [
      { label: 'Calls', value: count(p.calls) },
      { label: 'Fewest audio packets', value: audio.length ? count(Math.min(...audio.map(a => a.packets ?? 0))) : '—' },
      { label: 'Packet loss', value: pct(lost, packets + lost), bad: lost > 0 && lost / (packets + lost) > 0.005 },
      { label: 'Peak jitter', value: audio.length ? ms(Math.max(...audio.map(a => (a.jitterSeconds ?? 0) * 1000))) : '—' },
    ], failures)
  }
  if (id === 'calls') {
    const c = r.counts ?? {}, lat = r.latencyMs ?? {}
    if (c.failed) failures.push(`${count(c.failed)} calls failed`)
    if (r.cleanup?.callsStuck) failures.push(`${count(r.cleanup.callsStuck)} calls stuck, not ended`)
    if (c.skipped > Math.floor((c.planned ?? 0) / 1000)) failures.push(`${count(c.skipped)} call slots skipped because no pair was free`)
    if (!r.passed && failures.length === 0) failures.push('The tool reported a failure')
    return out(r.passed, [
      { label: 'Calls completed', value: `${count(c.completed ?? 0)} / ${count(c.planned ?? 0)}` },
      { label: 'Failed calls', value: count(c.failed ?? 0), bad: Boolean(c.failed) },
      { label: 'Peak concurrent calls', value: count(r.peakConcurrentCalls ?? 0) },
      { label: 'Setup p95', value: ms(lat.setupMs?.p95) },
      { label: 'Hang-up p95', value: ms(lat.leaveMs?.p95) },
    ], failures)
  }
  // mixed: the orchestrator already judged every criterion
  const criteria = Array.isArray(r.criteria) ? r.criteria : []
  for (const c of criteria.filter(x => !x.pass)) failures.push(`${c.workload}: ${c.name} = ${c.value ?? 'missing'} (limit ${c.op} ${c.limit})`)
  // A child's exit code is not judged here: the criteria already require its report, and the tools' own strict exit rules
  // (for example chat exiting 1 for 4 skipped slots in 9,900) are looser in the mixed verdict, which allows 0.1% skipped.
  const peaks = Object.values(r.resources ?? {}).map(x => x.cpuPeak).filter(Number.isFinite)
  const find = (workload, name) => criteria.find(c => c.workload === workload && c.name === name)?.value
  return out(r.passed, [
    { label: 'Criteria passed', value: `${criteria.filter(c => c.pass).length} / ${criteria.length}`, bad: criteria.some(c => !c.pass) },
    { label: 'Sockets connected', value: find('connections', 'sockets connected') == null ? '—' : count(find('connections', 'sockets connected')) },
    { label: 'Message ack p95', value: ms(find('chat', 'ack p95 ms')) },
    { label: 'Call setup p95', value: ms(find('calls (signaling)', 'setup p95 ms')) },
    ...(peaks.length ? [{ label: 'Peak container CPU', value: `${Math.max(...peaks)}%` }] : []),
  ], failures)
}
