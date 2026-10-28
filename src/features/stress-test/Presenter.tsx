import { useEffect } from 'react'
import { Play, Square, X } from 'lucide-react'
import { Badge } from '../../shared/components/ui/badge'
import { Button } from '../../shared/components/ui/button'
import { cn } from '../../shared/lib/cn'
import type { Run, Scenario } from './api'
import { LiveCharts, PhaseBar, VERDICT, clock } from './LiveView'
import type { Sample } from './live'

/** Full-screen view for presenting a run: big phase bar, big live numbers and charts, then the verdict. */
export function Presenter({ run, scenario, series, now, canDemo, busy, onDemo, onStop, onClose }: {
  run: Run | null; scenario: Scenario | undefined; series: Sample[]; now: number; canDemo: boolean; busy: boolean
  onDemo: () => void; onStop: () => void; onClose: () => void
}) {
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])
  const live = run?.status === 'running' || run?.status === 'stopping'
  const elapsed = run ? Math.max(0, ((run.finishedAt ? Date.parse(run.finishedAt) : now) - Date.parse(run.startedAt)) / 1000) : 0
  const verdict = run ? VERDICT[run.status] : null
  return <div role="dialog" aria-label="Presentation view" className="fixed inset-0 z-50 overflow-y-auto bg-canvas p-6 sm:p-10">
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div><p className="text-sm font-medium uppercase tracking-wider text-ink-3">Velora stress test</p>
          <h2 className="mt-1 text-3xl font-semibold">{run ? scenario?.title ?? run.scenario : 'Ready to run'}</h2></div>
        <div className="flex items-center gap-2">
          {live && <Button variant="danger" onClick={onStop} disabled={run?.status === 'stopping'}><Square size={16} aria-hidden="true" />Stop</Button>}
          <Button variant="secondary" onClick={onClose}><X size={16} aria-hidden="true" />Exit (Esc)</Button>
        </div>
      </div>
      {!run && <div className="rounded-card border border-line bg-raised p-8 text-center">
        <p className="text-lg text-ink-2">One click starts the heaviest mixed scenario: 2,000 sockets, 33 messages/s and calls at the same time.</p>
        <Button className="mt-6 h-12 px-8 text-base" disabled={!canDemo || busy} onClick={onDemo}><Play size={18} aria-hidden="true" />Start demo</Button></div>}
      {run && verdict && <>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Badge tone={verdict.tone} className="px-4 py-1.5 text-lg">{verdict.label}</Badge>
          <p className="font-mono text-4xl font-semibold">{clock(elapsed)}<span className="ml-3 text-xl font-normal text-ink-3">{live ? `/ ~${clock(run.estimatedSeconds)}` : 'total'}</span></p>
        </div>
        <PhaseBar run={run} elapsed={elapsed} large />
        {series.length > 0 && <LiveCharts run={run} series={series} large />}
        {!live && run.metrics.length > 0 && <dl className="grid grid-cols-2 gap-6 rounded-card border border-line bg-raised p-6 sm:grid-cols-3">
          {run.metrics.map((m) => <div key={m.label}><dt className="text-sm text-ink-3">{m.label}</dt>
            <dd className={cn('mt-1 font-mono text-3xl font-semibold', m.bad && 'text-bad')}>{m.value}</dd></div>)}</dl>}
        {!live && run.failures.length > 0 && <ul className="space-y-1 text-lg text-bad">{run.failures.map((f) => <li key={f}>• {f}</li>)}</ul>}
        {!live && <Button className="h-12 px-8 text-base" disabled={!canDemo || busy} onClick={onDemo}><Play size={18} aria-hidden="true" />Run the demo again</Button>}
      </>}
      <p className="text-sm text-ink-3">Tip: while the load runs, open the Velora app on a phone and send a message or place a call. It should stay smooth under load.</p>
    </div>
  </div>
}
