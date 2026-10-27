import { fetchApi } from '../../shared/api/client'

export type Field = { key: string; label: string; type: 'number' | 'boolean'; unit?: string; min?: number; max?: number; disabled?: boolean }
export type Values = Record<string, number | boolean>
export type Preset = { id: string; label: string; values: Values }
export type Scenario = { id: string; title: string; description: string; fields: Field[]; presets: Preset[] }
export type Metric = { label: string; value: string; bad?: boolean }
export type RunStatus = 'running' | 'stopping' | 'passed' | 'failed' | 'cancelled'
export type Run = {
  id: string; scenario: string; params: Values; status: RunStatus; phase: string; startedAt: string; finishedAt: string | null
  estimatedSeconds: number; reason: string | null; metrics: Metric[]; failures: string[]
}
export type StressState = { busy: boolean; scenarios: Scenario[]; active: Run | null; recent: Run[] }

const PATH = '/monitoring/stress/runs'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const STATUSES: RunStatus[] = ['running', 'stopping', 'passed', 'failed', 'cancelled']
const invalid = () => new Error('Agent trả về dữ liệu không hợp lệ')

const object = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw invalid()
  return v as Record<string, unknown>
}
const array = (v: unknown, max: number): unknown[] => {
  if (!Array.isArray(v) || v.length > max) throw invalid()
  return v
}
const text = (v: unknown, max = 300): string => {
  if (typeof v !== 'string' || v.length > max) throw invalid()
  return v
}
const finite = (v: unknown): number => {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw invalid()
  return v
}
const values = (v: unknown): Values => {
  const out: Values = {}
  for (const [key, value] of Object.entries(object(v))) {
    if (typeof value !== 'number' && typeof value !== 'boolean') throw invalid()
    out[key] = value
  }
  return out
}

export function parseRun(value: unknown): Run {
  const v = object(value)
  const status = text(v.status) as RunStatus
  if (!UUID.test(text(v.id)) || !STATUSES.includes(status)) throw invalid()
  return {
    id: v.id as string, scenario: text(v.scenario, 20), params: values(v.params), status, phase: text(v.phase, 60), startedAt: text(v.startedAt, 40),
    finishedAt: v.finishedAt == null ? null : text(v.finishedAt, 40), estimatedSeconds: finite(v.estimatedSeconds),
    reason: v.reason == null ? null : text(v.reason),
    metrics: array(v.metrics ?? [], 10).map((m) => { const o = object(m); return { label: text(o.label, 60), value: text(o.value, 60), bad: o.bad === true } }),
    failures: array(v.failures ?? [], 20).map((f) => text(f)),
  }
}

export function parseState(value: unknown): StressState {
  const v = object(value)
  if (v.available !== true || typeof v.busy !== 'boolean') throw invalid()
  return {
    busy: v.busy,
    scenarios: array(v.scenarios, 10).map((s) => {
      const o = object(s)
      return {
        id: text(o.id, 20), title: text(o.title, 60), description: text(o.description, 300),
        fields: array(o.fields, 10).map((f) => {
          const p = object(f)
          if (p.type !== 'number' && p.type !== 'boolean') throw invalid()
          return { key: text(p.key, 30), label: text(p.label, 80), type: p.type, unit: p.unit == null ? undefined : text(p.unit, 20),
            min: p.min == null ? undefined : finite(p.min), max: p.max == null ? undefined : finite(p.max), disabled: p.disabled === true }
        }),
        presets: array(o.presets, 6).map((p) => { const q = object(p); return { id: text(q.id, 20), label: text(q.label, 40), values: values(q.values) } }),
      }
    }),
    active: v.active == null ? null : parseRun(v.active),
    recent: array(v.recent, 5).map(parseRun),
  }
}

async function request(url: string, options?: RequestInit): Promise<unknown> {
  const response = await fetchApi(url, { ...options, cache: 'no-store', signal: AbortSignal.timeout(10_000) })
  if (!response.ok) {
    throw new Error(
      response.status === 400 ? 'Agent từ chối thông số này. Kiểm tra lại giá trị.'
        : response.status === 409 ? 'Đang có một lần chạy khác. Đợi nó xong hoặc dừng nó.'
          : response.status === 403 ? 'Cần tài khoản admin và mở từ trang dashboard.'
            : 'Agent stress chưa chạy trên server. Khởi động agent rồi tải lại.',
    )
  }
  return response.json()
}

export const getState = async () => parseState(await request(PATH))
export const startRun = async (scenario: string, params: Values, requestId: string) =>
  parseRun(await request(PATH, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ scenario, params, requestId }) }))
export const stopRun = async (id: string) => {
  if (!UUID.test(id)) throw new Error('Mã lần chạy không hợp lệ')
  return parseRun(await request(`${PATH}/${id}/stop`, { method: 'POST' }))
}

/** Clamp a preset to what the agent allows right now (for example no real-audio calls without Chrome). */
export function presetValues(scenario: Scenario, preset: Preset): Values {
  const out: Values = {}
  for (const f of scenario.fields) {
    const v = preset.values[f.key]
    if (f.type === 'boolean') out[f.key] = f.disabled ? false : v === true
    else out[f.key] = Math.min(f.max ?? Infinity, Math.max(f.min ?? -Infinity, typeof v === 'number' ? v : f.min ?? 0))
  }
  return out
}

/** The first problem with the typed values, in Vietnamese, or null when the form can run. */
export function checkValues(scenario: Scenario, vals: Values): string | null {
  for (const f of scenario.fields) {
    if (f.type !== 'number') continue
    const v = vals[f.key]
    if (typeof v !== 'number' || !Number.isInteger(v) || v < (f.min ?? 0) || v > (f.max ?? Infinity)) return `${f.label}: nhập số nguyên từ ${f.min} đến ${f.max}`
  }
  const n = (key: string) => (typeof vals[key] === 'number' ? (vals[key] as number) : 0)
  if (scenario.id === 'chat' && n('rps') * n('seconds') > 10000) return 'Tối đa 10.000 tin mỗi lần chạy'
  if (scenario.id === 'mixed') {
    if (n('chat') * n('seconds') > 10000) return 'Tối đa 10.000 tin mỗi lần chạy'
    if (n('calls') + n('churn') > 20) return 'Cuộc gọi dài + cặp gọi ngắn tối đa 20'
  }
  return null
}
