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
      id: 'chat', title: 'Gửi tin nhắn', description: '50 người dùng thật gửi tin vào 20 phòng; mỗi tin phải được xác nhận và đến đủ người nhận.',
      fields: [field('rps', 'Tin mỗi giây', 'tin/s', 1, 300), field('seconds', 'Thời gian', 'giây', 5, 300)],
      presets: [
        { id: 'light', label: 'Nhẹ', values: { rps: 5, seconds: 30 } },
        { id: 'medium', label: 'Vừa', values: { rps: 33, seconds: 60 } },
        { id: 'heavy', label: 'Nặng', values: { rps: 100, seconds: 100 } },
      ],
    },
    {
      id: 'sockets', title: 'Kết nối socket', description: 'Mở nhiều kết nối chat cùng lúc, giữ một lúc, rồi (tuỳ chọn) ngắt và nối lại hàng loạt.',
      fields: [
        field('sockets', 'Số socket', 'socket', 50, 6000), field('hold', 'Giữ kết nối', 'giây', 0, 1800),
        { key: 'storm', label: 'Ngắt và nối lại hàng loạt', type: 'boolean' },
      ],
      presets: [
        { id: 'light', label: 'Nhẹ', values: { sockets: 200, hold: 30, storm: false } },
        { id: 'medium', label: 'Vừa', values: { sockets: 1000, hold: 60, storm: true } },
        { id: 'heavy', label: 'Nặng', values: { sockets: 2000, hold: 120, storm: true } },
      ],
    },
    {
      id: 'calls', title: 'Gọi điện', description: media
        ? 'Các cuộc gọi 1-1 chạy cùng lúc. Bật “Âm thanh thật” để đo cả đường media qua SFU.'
        : 'Các cuộc gọi 1-1 chạy cùng lúc (chỉ báo hiệu). Âm thanh thật cần agent chạy với Chrome.',
      fields: [
        field('calls', 'Cuộc gọi cùng lúc', 'cuộc', 1, 20), field('seconds', 'Thời gian', 'giây', 10, 300),
        { key: 'media', label: 'Âm thanh thật', type: 'boolean', disabled: !media },
      ],
      presets: [
        { id: 'light', label: 'Nhẹ', values: { calls: 2, seconds: 30, media: false } },
        { id: 'medium', label: 'Vừa', values: { calls: 5, seconds: 60, media: media } },
        { id: 'heavy', label: 'Nặng', values: { calls: 10, seconds: 120, media: media } },
      ],
    },
    {
      id: 'mixed', title: 'Hỗn hợp', description: 'Chat, nhiều socket và cuộc gọi chạy cùng một lúc như lúc app đông người dùng.',
      fields: [
        field('sockets', 'Số socket', 'socket', 50, 6000), field('chat', 'Tin mỗi giây', 'tin/s', 0, 100),
        field('churn', 'Cặp gọi ngắn liên tục', 'cặp', 0, 20), field('calls', 'Cuộc gọi dài (âm thanh thật)', 'cuộc', 0, media ? 20 : 0),
        field('seconds', 'Thời gian', 'giây', 20, 900),
      ],
      presets: [
        { id: 'light', label: 'Nhẹ', values: { sockets: 200, chat: 5, churn: 3, calls: 0, seconds: 30 } },
        { id: 'medium', label: 'Vừa', values: { sockets: 1000, chat: 17, churn: 5, calls: media ? 4 : 0, seconds: 120 } },
        { id: 'school', label: 'Trường học 10k', values: { sockets: 2000, chat: 33, churn: 10, calls: media ? 10 : 0, seconds: 300 } },
      ],
    },
  ]
}

const num = (value, label, min, max, integer = true) => {
  const n = Number(value)
  if (!Number.isFinite(n) || (integer && !Number.isInteger(n)) || n < min || n > max) throw new Error(`${label} phải từ ${min} đến ${max}`)
  return n
}

// Returns clean, typed parameters or throws an Error whose message is safe to show the operator.
export function validateParams(id, input, capabilities = {}) {
  const raw = input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  const scenario = describeScenarios(capabilities).find(s => s.id === id)
  if (!scenario) throw new Error('Kịch bản không tồn tại')
  const known = new Set(scenario.fields.map(f => f.key))
  if (Object.keys(raw).some(key => !known.has(key))) throw new Error('Có thông số không hợp lệ')
  const out = {}
  for (const f of scenario.fields) {
    if (f.type === 'boolean') {
      if (raw[f.key] !== undefined && typeof raw[f.key] !== 'boolean') throw new Error(`${f.label} phải là bật/tắt`)
      out[f.key] = Boolean(raw[f.key])
      if (f.disabled && out[f.key]) throw new Error('Agent chưa có Chrome nên chưa chạy được âm thanh thật')
    } else out[f.key] = num(raw[f.key], f.label, f.min, f.max)
  }
  if (id === 'chat' && out.rps * out.seconds > 10000) throw new Error('Tối đa 10.000 tin mỗi lần chạy; giảm tin/giây hoặc thời gian')
  if (id === 'mixed') {
    if (out.chat * out.seconds > 10000) throw new Error('Tối đa 10.000 tin mỗi lần chạy; giảm tin/giây hoặc thời gian')
    if (out.calls + out.churn > 20) throw new Error('Cuộc gọi dài + cặp gọi ngắn tối đa 20 (mỗi người chỉ ở một cuộc gọi)')
    if (out.churn + out.calls === 0 && out.chat === 0) throw new Error('Chọn ít nhất chat hoặc cuộc gọi')
  }
  return out
}

// Rough run length for the progress bar, including setup and cleanup.
export function estimateSeconds(id, p) {
  if (id === 'chat') return p.seconds + 20
  if (id === 'sockets') return Math.ceil(p.sockets / 50) + p.hold + (p.storm ? 30 : 0) + 15
  if (id === 'calls') return p.seconds + (p.media ? 60 : 15)
  return Math.ceil(p.sockets / 25) + 10 + p.seconds + (p.calls ? 60 : 15)
}

const churnCps = churn => (churn > 0 ? Math.min(1, Math.max(0.1, Math.floor(churn / (MIXED_CHURN_HOLD_MS / 1000 + 0.2) * 100) / 100)) : 0)

// What the agent has to launch. `config` is the manifest the tool reads (stages are filled for chat);
// `paths` has bins (bundled tools), configFile, chatConfigFile, output and the media settings.
export function buildCommand(id, p, paths) {
  const a = value => String(value)
  if (id === 'chat') return { tool: 'chat', configKind: 'chat', stages: [{ name: `chat ${p.rps}/s`, users: paths.accounts, rps: p.rps, seconds: p.seconds }],
    argv: [paths.bins.chat, '--config', paths.chatConfigFile, '--run', '--output', paths.output] }
  if (id === 'sockets') return { tool: 'connections', configKind: 'plain',
    argv: [paths.bins.connections, '--config', paths.configFile, '--run', '--sockets', a(p.sockets), '--ramp', a(Math.min(200, Math.max(10, Math.round(p.sockets / 20)))),
      '--hold', a(p.hold), '--probes', '1', '--storms', p.storm ? '1' : '0', '--output', paths.output] }
  if (id === 'calls' && p.media) return { tool: 'media', configKind: 'plain',
    argv: [paths.bins.media, '--manifest', paths.configFile, '--run', '--calls', a(p.calls), '--seconds', a(p.seconds), '--pair-offset', '0',
      '--lan-media-address', paths.lanAddress, '--chrome', paths.chrome, '--browser-bundle', paths.bins.browserBundle, '--local-origin', '--output', paths.output] }
  if (id === 'calls') return { tool: 'signaling', configKind: 'plain',
    argv: [paths.bins.signaling, '--config', paths.configFile, '--run', '--pairs', a(p.calls), '--cps', a(Math.max(0.1, Math.floor(p.calls / (SIGNALING_HOLD_S + 0.5) * 100) / 100)),
      '--seconds', a(p.seconds), '--hold-ms', a(SIGNALING_HOLD_S * 1000), '--output', paths.output] }
  // The mixed tool needs the mixed.mjs bundle plus the other bundled tools in one directory.
  const argv = [paths.bins.mixed, '--config', paths.configFile, '--bins-dir', paths.binsDir, '--run', '--profile', 'campus10k', '--base-url', paths.baseUrl,
    '--sockets', a(p.sockets), '--ramp', a(Math.min(100, Math.max(10, Math.round(p.sockets / 20)))), '--window', a(p.seconds), '--chat-rps', a(p.chat),
    '--media-calls', a(p.calls), '--churn-pairs', a(p.churn), '--churn-cps', a(churnCps(p.churn)), '--churn-hold-ms', a(MIXED_CHURN_HOLD_MS), '--output', paths.output]
  if (p.calls > 0) argv.push('--chrome', paths.chrome, '--lan-address', paths.lanAddress, '--media-local')
  return { tool: 'mixed', configKind: 'plain', argv }
}

// Check the mixed settings the same way the tool will, so a bad value fails before anything starts.
export function checkMixed(p) {
  resolveScenario('campus10k', { sockets: p.sockets, rampPerSecond: Math.min(100, Math.max(10, Math.round(p.sockets / 20))), windowSeconds: p.seconds, chatRps: p.chat,
    mediaCalls: p.calls, churnPairs: p.churn, churnCps: churnCps(p.churn), churnHoldMs: MIXED_CHURN_HOLD_MS })
}

const ms = v => (v == null ? '—' : `${Math.round(v)} ms`)
const count = v => (v == null ? '—' : Number(v).toLocaleString('en-US'))
const pct = (n, d) => (d > 0 ? `${Math.round(n / d * 10000) / 100}%` : '0%')

// Turns a tool report into { passed, reason, metrics: [{label, value, bad?}], failures: [text] }.
export function summarize(id, p, report, { stopped = false } = {}) {
  const r = report && typeof report === 'object' ? report : null
  if (!r) return { passed: false, reason: stopped ? 'Đã dừng theo yêu cầu' : 'Công cụ không tạo được báo cáo', metrics: [], failures: [] }
  const out = (passed, metrics, failures, reason) => ({
    passed: Boolean(passed) && !stopped && failures.length === 0,
    reason: stopped ? 'Đã dừng theo yêu cầu' : passed && failures.length === 0 ? null : reason ?? failures[0] ?? 'Không đạt',
    metrics, failures,
  })
  const failures = []
  if (r.stopReason) failures.push(`Dừng sớm: ${String(r.stopReason).slice(0, 120)}`)
  if (id === 'chat') {
    const t = r.totals ?? {}, planned = (r.stages ?? []).reduce((n, s) => n + (s.planned ?? 0), 0) || p.rps * p.seconds
    const missing = t.deliveries?.missing ?? 0, skipped = (r.stages ?? []).reduce((n, s) => n + (s.skipped ?? 0), 0)
    if (t.failedMessages) failures.push(`${count(t.failedMessages)} tin lỗi hoặc quá hạn xác nhận`)
    if (missing) failures.push(`${count(missing)} lượt giao tin bị thiếu`)
    if (skipped) failures.push(`${count(skipped)} lượt gửi bị bỏ qua vì máy chạy test không theo kịp`)
    if (!r.passed && failures.length === 0) failures.push('Công cụ báo không đạt')
    return out(r.passed, [
      { label: 'Tin đã gửi', value: `${count(t.emitted ?? 0)} / ${count(planned)}` },
      { label: 'Tin lỗi', value: count(t.failedMessages ?? 0), bad: Boolean(t.failedMessages) },
      { label: 'Xác nhận p95', value: ms(t.ack?.p95) }, { label: 'Giao tin p95', value: ms(t.delivery?.p95) },
      { label: 'Thiếu lượt giao', value: count(missing), bad: Boolean(missing) },
      { label: 'Tốc độ thực', value: `${Math.round((r.stages?.[0]?.achievedRps ?? 0) * 10) / 10} tin/s` },
    ], failures)
  }
  if (id === 'sockets') {
    const ramp = r.ramp ?? {}, hold = r.hold, storm = r.storms?.[0]
    if (ramp.failed) failures.push(`${count(ramp.failed)} socket không kết nối được`)
    if (hold?.unexpectedDisconnects) failures.push(`${count(hold.unexpectedDisconnects)} socket bị rớt khi đang giữ`)
    if (hold?.probes?.failed) failures.push(`${count(hold.probes.failed)} tin thử không đến đủ socket`)
    for (const s of r.storms ?? []) if (s.lost) failures.push(`${count(s.lost)} socket không nối lại được sau khi ngắt hàng loạt`)
    if (!r.passed && failures.length === 0) failures.push('Công cụ báo không đạt')
    const metrics = [
      { label: 'Socket kết nối', value: `${count(ramp.connected ?? 0)} / ${count(ramp.target ?? p.sockets)}`, bad: Boolean(ramp.failed) },
      { label: 'Kết nối p95', value: ms(ramp.connectMs?.p95) },
      { label: 'Rớt bất thường', value: count((ramp.unexpectedDisconnects ?? 0) + (hold?.unexpectedDisconnects ?? 0)), bad: Boolean(hold?.unexpectedDisconnects) },
      { label: 'Giao tin thử p95', value: ms(hold?.probes?.lastDeliveryMs?.p95) },
    ]
    if (storm) metrics.push({ label: 'Nối lại sau ngắt', value: storm.allRestoredMs == null ? `${count(storm.lost)} socket mất` : `${(storm.allRestoredMs / 1000).toFixed(1)} s`, bad: Boolean(storm.lost) })
    return out(r.passed, metrics, failures)
  }
  if (id === 'calls' && p.media) {
    const stage = r.stages?.[0], audio = (stage?.pairs ?? []).flatMap(x => x.audio ?? [])
    const packets = audio.reduce((n, a) => n + (a.packets ?? 0), 0), lost = audio.reduce((n, a) => n + (a.lost ?? 0), 0)
    if (r.failure) failures.push(`Cuộc gọi lỗi: ${String(r.failure).slice(0, 120)}`)
    else if (!r.passed) failures.push(stage?.failure ? `Cuộc gọi lỗi: ${String(stage.failure).slice(0, 120)}` : 'Công cụ báo không đạt')
    return out(r.passed, [
      { label: 'Cuộc gọi', value: count(p.calls) },
      { label: 'Gói âm thanh ít nhất', value: audio.length ? count(Math.min(...audio.map(a => a.packets ?? 0))) : '—' },
      { label: 'Mất gói', value: pct(lost, packets + lost), bad: lost > 0 && lost / (packets + lost) > 0.005 },
      { label: 'Jitter cao nhất', value: audio.length ? ms(Math.max(...audio.map(a => (a.jitterSeconds ?? 0) * 1000))) : '—' },
    ], failures)
  }
  if (id === 'calls') {
    const c = r.counts ?? {}, lat = r.latencyMs ?? {}
    if (c.failed) failures.push(`${count(c.failed)} cuộc gọi lỗi`)
    if (r.cleanup?.callsStuck) failures.push(`${count(r.cleanup.callsStuck)} cuộc gọi bị kẹt chưa kết thúc`)
    if (c.skipped > Math.floor((c.planned ?? 0) / 1000)) failures.push(`${count(c.skipped)} lượt gọi bị bỏ qua vì không còn cặp rảnh`)
    if (!r.passed && failures.length === 0) failures.push('Công cụ báo không đạt')
    return out(r.passed, [
      { label: 'Cuộc gọi hoàn tất', value: `${count(c.completed ?? 0)} / ${count(c.planned ?? 0)}` },
      { label: 'Cuộc gọi lỗi', value: count(c.failed ?? 0), bad: Boolean(c.failed) },
      { label: 'Gọi cùng lúc cao nhất', value: count(r.peakConcurrentCalls ?? 0) },
      { label: 'Thiết lập p95', value: ms(lat.setupMs?.p95) },
      { label: 'Kết thúc p95', value: ms(lat.leaveMs?.p95) },
    ], failures)
  }
  // mixed: the orchestrator already judged every criterion
  const criteria = Array.isArray(r.criteria) ? r.criteria : []
  for (const c of criteria.filter(x => !x.pass)) failures.push(`${c.workload}: ${c.name} = ${c.value ?? 'thiếu'} (giới hạn ${c.op} ${c.limit})`)
  for (const [name, child] of Object.entries(r.children ?? {})) if (child.exitCode !== 0 && !failures.some(f => f.startsWith(name))) failures.push(`${name} không chạy xong`)
  const peaks = Object.values(r.resources ?? {}).map(x => x.cpuPeak).filter(Number.isFinite)
  const find = (workload, name) => criteria.find(c => c.workload === workload && c.name === name)?.value
  return out(r.passed, [
    { label: 'Tiêu chí đạt', value: `${criteria.filter(c => c.pass).length} / ${criteria.length}`, bad: criteria.some(c => !c.pass) },
    { label: 'Socket kết nối', value: find('connections', 'sockets connected') == null ? '—' : count(find('connections', 'sockets connected')) },
    { label: 'Xác nhận tin p95', value: ms(find('chat', 'ack p95 ms')) },
    { label: 'Thiết lập cuộc gọi p95', value: ms(find('calls (signaling)', 'setup p95 ms')) },
    ...(peaks.length ? [{ label: 'CPU cao nhất (container)', value: `${Math.max(...peaks)}%` }] : []),
  ], failures)
}
