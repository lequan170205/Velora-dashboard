import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { type BadgeTone } from '../../shared/components/ui/badge'
import { Card, CardContent } from '../../shared/components/ui/card'
import { useChartTheme, type ChartSeriesToken } from '../../shared/lib/chartTheme'
import { cn } from '../../shared/lib/cn'
import type { Run } from './api'
import { phaseIndex, timelineFor, timelineSeconds, topContainers, type Sample } from './live'

export const VERDICT: Record<Run['status'], { label: string; tone: BadgeTone }> = {
  running: { label: 'Running', tone: 'info' }, stopping: { label: 'Stopping', tone: 'warn' },
  passed: { label: 'PASSED', tone: 'good' }, failed: { label: 'FAILED', tone: 'bad' }, cancelled: { label: 'Stopped', tone: 'warn' },
}

export const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`

/** The run's phases as one bar: finished phases filled, the current one highlighted, a fill for elapsed time. */
export function PhaseBar({ run, elapsed, large = false }: { run: Run; elapsed: number; large?: boolean }) {
  const timeline = timelineFor(run.scenario, run.params)
  const total = Math.max(1, timelineSeconds(timeline))
  const live = run.status === 'running' || run.status === 'stopping'
  const current = live ? phaseIndex(timeline, elapsed) : -1
  return <div>
    <div className={cn('relative flex overflow-hidden rounded-control border border-line bg-inset', large ? 'h-12' : 'h-9')} role="progressbar"
      aria-label="Run phases" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.round(elapsed / total * 100))}>
      <div className="absolute inset-y-0 left-0 bg-brand/25 transition-all duration-1000 ease-linear" style={{ width: `${live ? Math.min(99, elapsed / total * 100) : 100}%` }} />
      {timeline.map((phase, index) => <div key={phase.label} style={{ flex: `${Math.max(phase.seconds, 1)} 1 0` }}
        className={cn('relative flex min-w-[4.5rem] items-center justify-center truncate border-r border-line px-2 text-center last:border-r-0', large ? 'text-sm' : 'text-xs',
          index === current ? 'font-semibold text-ink' : 'text-ink-3')}>{phase.label}</div>)}
    </div>
  </div>
}

type Panel = { id: string; title: string; unit: string; token: ChartSeriesToken; target?: number; lines: { key: keyof Sample; label: string; token: ChartSeriesToken }[] }
const num = (run: Run, key: string) => (typeof run.params[key] === 'number' ? (run.params[key] as number) : undefined)

function panelsFor(run: Run): Panel[] {
  const scenario = run.scenario
  const panels: Panel[] = []
  if (scenario !== 'calls') panels.push({ id: 'sockets', title: 'Chat sockets connected', unit: '', token: 'teal', target: num(run, 'sockets'), lines: [{ key: 'chatSockets', label: 'Connected', token: 'teal' }] })
  if (scenario === 'chat' || scenario === 'mixed') {
    panels.push({ id: 'msg', title: 'Messages per second (server)', unit: '/s', token: 'indigo', target: num(run, 'rps') ?? num(run, 'chat'), lines: [{ key: 'msgPerSec', label: 'Messages/s', token: 'indigo' }] })
    panels.push({ id: 'p95', title: 'Send latency p95', unit: ' ms', token: 'amber', lines: [{ key: 'p95Ms', label: 'p95', token: 'amber' }] })
  }
  if (scenario === 'calls' || scenario === 'mixed') panels.push({ id: 'calls', title: 'Calls on the server', unit: '', token: 'blue', lines: [
    { key: 'callSockets', label: 'Call sockets', token: 'blue' }, { key: 'mediaRooms', label: 'SFU rooms (active calls)', token: 'rose' }] })
  panels.push({ id: 'cpu', title: 'CPU: busiest containers (% of one core)', unit: '', token: 'rose', lines: [] })
  return panels
}

type Row = Record<string, number | null>
function rowsFor(series: Sample[], cpuNames: string[]): Row[] {
  return series.map((s) => ({ ...(s as unknown as Row), ...Object.fromEntries(cpuNames.map((name) => [`cpu:${name}`, s.cpu[name] == null ? null : Math.round(s.cpu[name] * 100)])) }))
}

const last = (series: Sample[], key: keyof Sample) => {
  for (let i = series.length - 1; i >= 0; i--) { const v = series[i][key]; if (typeof v === 'number') return v }
  return null
}

function Chart({ panel, rows, cpuNames, height, large }: { panel: Panel; rows: Row[]; cpuNames: string[]; height: number; large: boolean }) {
  const theme = useChartTheme()
  const lines = [...panel.lines.map((l) => ({ dataKey: l.key as string, label: l.label, color: theme.series[l.token] })),
    ...(panel.id === 'cpu' ? cpuNames.map((name, i) => ({ dataKey: `cpu:${name}`, label: name, color: theme.series[(['teal', 'blue', 'amber'] as ChartSeriesToken[])[i]] })) : [])]
  const current = panel.id === 'cpu' ? last(rows as unknown as Sample[], 'hostCpu') : last(rows as unknown as Sample[], panel.lines[0].key)
  const hasData = rows.some((r) => lines.some((l) => typeof r[l.dataKey] === 'number'))
  return <Card><CardContent className={large ? 'p-5' : 'p-4'}>
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 className={cn('font-medium text-ink-2', large ? 'text-base' : 'text-sm')}>{panel.title}</h3>
      <p className={cn('font-mono font-semibold', large ? 'text-3xl' : 'text-xl')}>{current == null ? '—' : `${current.toLocaleString('en-US')}${panel.id === 'cpu' ? '%' : panel.unit}`}
        {panel.id === 'cpu' && <span className="ml-2 text-sm font-normal text-ink-3">host total</span>}
        {panel.target != null && <span className="ml-2 text-sm font-normal text-ink-3">/ target {panel.target.toLocaleString('en-US')}{panel.unit}</span>}</p>
    </div>
    <div style={{ height }} className="mt-3">{hasData ? <ResponsiveContainer width="100%" height="100%">
      <LineChart data={rows} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={theme.grid} vertical={false} />
        <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickFormatter={clock} stroke={theme.tick} tick={{ fill: theme.tick, fontSize: 11 }} minTickGap={32} />
        <YAxis stroke={theme.tick} tick={{ fill: theme.tick, fontSize: 11 }} width={44} domain={[0, 'auto']} allowDecimals={false} />
        <Tooltip contentStyle={{ background: theme.tooltipBg, border: `1px solid ${theme.tooltipBorder}`, color: theme.tooltipText, fontSize: 12 }} labelFormatter={(t) => clock(Number(t))} />
        {panel.target != null && <ReferenceLine y={panel.target} stroke={theme.thresholdWarn} strokeDasharray="5 4" />}
        {lines.map((l) => <Line key={l.dataKey} dataKey={l.dataKey} name={l.label} stroke={l.color} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />)}
      </LineChart>
    </ResponsiveContainer> : <p className="flex h-full items-center justify-center text-sm text-ink-3">Waiting for server samples…</p>}</div>
    {lines.length > 1 && <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-3">{lines.map((l) => <li key={l.dataKey} className="flex items-center gap-1.5">
      <span className="size-2 rounded-full" style={{ background: l.color }} />{l.label}</li>)}</ul>}
  </CardContent></Card>
}

/** Live server-side charts for the run, taken from the monitoring service while the load runs. */
export function LiveCharts({ run, series, large = false }: { run: Run; series: Sample[]; large?: boolean }) {
  const cpuNames = topContainers(series, 3)
  const rows = rowsFor(series, cpuNames)
  const panels = panelsFor(run)
  return <div className={cn('grid gap-4', large ? 'lg:grid-cols-2' : 'md:grid-cols-2')}>
    {panels.map((panel) => <Chart key={panel.id} panel={panel} rows={rows} cpuNames={cpuNames} height={large ? 240 : 150} large={large} />)}
  </div>
}
