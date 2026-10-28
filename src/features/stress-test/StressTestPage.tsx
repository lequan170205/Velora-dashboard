import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, Play, Square } from 'lucide-react'
import { Badge, type BadgeTone } from '../../shared/components/ui/badge'
import { Button } from '../../shared/components/ui/button'
import { Card, CardContent } from '../../shared/components/ui/card'
import { Input } from '../../shared/components/ui/input'
import { Label } from '../../shared/components/ui/label'
import { cn } from '../../shared/lib/cn'
import { checkValues, getState, presetValues, startRun, stopRun, type Run, type Scenario, type Values } from './api'

const QUERY_KEY = ['stress-state']
const VERDICT: Record<Run['status'], { label: string; tone: BadgeTone }> = {
  running: { label: 'Running', tone: 'info' }, stopping: { label: 'Stopping', tone: 'warn' },
  passed: { label: 'PASSED', tone: 'good' }, failed: { label: 'FAILED', tone: 'bad' }, cancelled: { label: 'Stopped', tone: 'warn' },
}
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`

function download(run: Run) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(run, null, 2)], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url; a.download = `velora-stress-${run.scenario}-${run.startedAt.replace(/[:.]/g, '-')}.json`; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [active])
  return now
}

function Result({ run, scenario, now }: { run: Run; scenario: Scenario | undefined; now: number }) {
  const verdict = VERDICT[run.status]
  const live = run.status === 'running' || run.status === 'stopping'
  const elapsed = Math.max(0, ((run.finishedAt ? Date.parse(run.finishedAt) : now) - Date.parse(run.startedAt)) / 1000)
  return <Card><CardContent className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <Badge tone={verdict.tone} className="px-3 py-1 text-sm">{verdict.label}</Badge>
        <span className="text-sm text-ink-2">{scenario?.title ?? run.scenario} · {live ? `${run.phase} · ${clock(elapsed)} / ~${clock(run.estimatedSeconds)}` : `${clock(elapsed)}`}</span>
      </div>
      {!live && <Button variant="ghost" size="sm" onClick={() => download(run)}><Download size={14} aria-hidden="true" />Download JSON</Button>}
    </div>
    {live && <div className="h-1.5 overflow-hidden rounded-full bg-inset" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(99, Math.round(elapsed / run.estimatedSeconds * 100))}>
      <div className="h-full bg-brand transition-all" style={{ width: `${Math.min(99, elapsed / run.estimatedSeconds * 100)}%` }} /></div>}
    {run.reason && !run.failures.includes(run.reason) && <p role="alert" className="rounded-card border border-line bg-raised p-3 text-sm text-ink-2">{run.reason}</p>}
    {!live && run.failures.length > 0 && <ul className="space-y-1 text-sm text-bad">{run.failures.map((f) => <li key={f}>• {f}</li>)}</ul>}
    {run.metrics.length > 0 && <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">{run.metrics.map((m) => <div key={m.label}>
      <dt className="text-xs text-ink-3">{m.label}</dt><dd className={cn('mt-1 font-mono text-lg font-semibold', m.bad && 'text-bad')}>{m.value}</dd></div>)}</dl>}
  </CardContent></Card>
}

export function StressTestPage() {
  const client = useQueryClient()
  const state = useQuery({ queryKey: QUERY_KEY, queryFn: getState, retry: false, refetchInterval: (query) => (query.state.data?.busy ? 2000 : 8000) })
  const [selected, setSelected] = useState('')
  const [edited, setEdited] = useState<Record<string, Values>>({})
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const submitting = useRef(false)
  const data = state.data
  const scenario = data?.scenarios.find((s) => s.id === selected) ?? data?.scenarios[0]
  const busy = pending || Boolean(data?.busy)
  const now = useNow(Boolean(data?.active))
  if (!data || !scenario) return <section className="space-y-5" aria-labelledby="stress-title">
    <Header badge={state.isLoading ? { label: 'Connecting to the agent…', tone: 'neutral' } : { label: 'Agent offline', tone: 'bad' }} />
    {!state.isLoading && <Card><CardContent className="space-y-3 text-sm text-ink-2">
      <p role="alert" className="text-bad">{state.error instanceof Error ? state.error.message : 'Could not reach the stress agent.'}</p>
      <p>This page controls the stress agent running on the server (homelab). Start the agent, then reload:</p>
      <pre className="overflow-x-auto rounded-control border border-line bg-inset p-3 font-mono text-xs">pnpm stress:agent:build{'\n'}node .stress-agent/agent.mjs --manifest ~/velora-chat-stress/manifest.json</pre>
      <Button variant="secondary" size="sm" onClick={() => void state.refetch()}>Retry</Button></CardContent></Card>}
  </section>

  const values = edited[scenario.id] ?? presetValues(scenario, scenario.presets[1] ?? scenario.presets[0])
  const problem = checkValues(scenario, values)
  const shown = data.active ?? data.recent.find((r) => r.scenario === scenario.id) ?? null
  const set = (next: Values) => setEdited((current) => ({ ...current, [scenario.id]: next }))

  async function start() {
    if (submitting.current || !scenario || problem) return
    submitting.current = true; setPending(true); setError(null)
    try { await startRun(scenario.id, values, crypto.randomUUID()) } catch (e) { setError(e instanceof Error ? e.message : 'Could not start the run') }
    finally { submitting.current = false; setPending(false); void client.invalidateQueries({ queryKey: QUERY_KEY }) }
  }
  async function stop() {
    if (!data?.active) return
    setError(null)
    try { await stopRun(data.active.id) } catch (e) { setError(e instanceof Error ? e.message : 'Could not stop the run') }
    finally { void client.invalidateQueries({ queryKey: QUERY_KEY }) }
  }

  const badge = data.active ? VERDICT[data.active.status] : { label: 'Ready', tone: 'good' as BadgeTone }
  return <section className="space-y-5" aria-labelledby="stress-title">
    <Header badge={badge} />
    <div role="tablist" aria-label="Scenario" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {data.scenarios.map((s) => <button key={s.id} role="tab" type="button" aria-selected={s.id === scenario.id}
        onClick={() => { setSelected(s.id); setError(null) }}
        className={cn('rounded-control border px-3 py-2.5 text-sm font-medium transition-colors', s.id === scenario.id ? 'border-brand bg-brand/10 text-ink' : 'border-line bg-raised text-ink-2 hover:border-line-strong')}>{s.title}</button>)}
    </div>
    <Card><CardContent className="space-y-5">
      <p className="text-sm text-ink-2">{scenario.description}</p>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-ink-3">Level:</span>
        {scenario.presets.map((p) => {
          const preset = presetValues(scenario, p)
          const active = scenario.fields.every((f) => preset[f.key] === values[f.key])
          return <Button key={p.id} size="sm" variant={active ? 'primary' : 'secondary'} disabled={busy} onClick={() => set(preset)}>{p.label}</Button>
        })}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{scenario.fields.map((f) => f.type === 'boolean'
        ? <label key={f.key} className={cn('flex items-center gap-3 self-end pb-2 text-sm', f.disabled ? 'text-ink-3' : 'cursor-pointer text-ink-2')}>
          <input type="checkbox" className="size-4 accent-brand" checked={values[f.key] === true} disabled={busy || f.disabled} onChange={(e) => set({ ...values, [f.key]: e.target.checked })} />{f.label}</label>
        : <div key={f.key}><Label htmlFor={`stress-${f.key}`}>{f.label}{f.unit ? ` (${f.unit})` : ''}</Label>
          <Input id={`stress-${f.key}`} type="number" inputMode="numeric" min={f.min} max={f.max} value={Number.isNaN(values[f.key]) ? '' : String(values[f.key] ?? '')} disabled={busy || f.max === 0}
            onChange={(e) => set({ ...values, [f.key]: e.target.value === '' ? NaN : Number(e.target.value) })} /></div>)}</div>
      {(problem || error) && <p role="alert" className="text-sm text-bad">{problem ?? error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <Button className="h-11 min-w-32" disabled={busy || Boolean(problem)} onClick={() => void start()}><Play size={16} aria-hidden="true" />Run</Button>
        <Button variant="danger" className="h-11" disabled={!data.active || data.active.status === 'stopping'} onClick={() => void stop()}><Square size={16} aria-hidden="true" />Stop</Button>
        <span className="text-xs text-ink-3">Runs real load on the live system with test accounts. Closing this tab does not stop a run.</span>
      </div>
    </CardContent></Card>
    {shown && <Result run={shown} scenario={data.scenarios.find((s) => s.id === shown.scenario)} now={now} />}
  </section>
}

function Header({ badge }: { badge: { label: string; tone: BadgeTone } }) {
  return <div className="flex flex-wrap items-start justify-between gap-4">
    <div><p className="text-xs font-medium uppercase tracking-wider text-ink-3">Demo tools</p>
      <h1 id="stress-title" className="mt-1 text-2xl font-semibold">Stress test</h1></div>
    <Badge tone={badge.tone}>{badge.label}</Badge>
  </div>
}
