import { Minus } from 'lucide-react'

import type { CallTelemetryFilters, RecentCallLeg } from '../../api'
import { useRecentCallsQuery } from '../../useCallsQueries'
import { useCalls } from '../../CallsProvider'
import { FilterBar } from '../../components/FilterBar'
import { Button, EmptyState } from '@/shared/components/ui'
import { cn } from '@/shared/lib/cn'

type RecentCallsViewProps = {
  appliedFilters: CallTelemetryFilters
  onInspect: (callId: string) => void
}

const pill = (tone: 'good' | 'muted' | 'bad') =>
  cn(
    'inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium',
    tone === 'good' && 'bg-ok-soft text-ok',
    tone === 'muted' && 'bg-raised text-ink-3',
    tone === 'bad' && 'bg-bad-soft text-bad',
  )

export function RecentCallsView({ appliedFilters, onInspect }: RecentCallsViewProps) {
  const { draft, apply, updateFilter } = useCalls()
  const { data: recentCallLegs = [], error, isFetching } = useRecentCallsQuery(appliedFilters)

  return (
    <section className="flex flex-col gap-4" aria-labelledby="recent-calls-title" aria-busy={isFetching && recentCallLegs.length === 0}>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">Call explorer</p>
          <h2 className="sr-only" id="recent-calls-title">Recent calls</h2>
          <p className="mt-0.5 max-w-prose text-[13px] leading-relaxed text-ink-2">
            Inspect individual call legs and jump directly into their telemetry timeline.
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-line px-2.5 py-1 text-xs tabular-nums text-ink-3">
          {recentCallLegs.length} call legs
        </span>
      </div>

      <FilterBar filters={draft} onChange={updateFilter} onApply={apply} />

      {error && (
        <div role="alert" className="flex items-start gap-2.5 rounded-card border border-bad-soft bg-bad-soft/50 px-4 py-3 text-[13px]">
          <p className="leading-relaxed text-ink">
            <strong className="font-semibold">Something needs attention.</strong> {error.message}
          </p>
        </div>
      )}

      {recentCallLegs.length === 0 ? (
        <EmptyState
          icon={Minus}
          title="No calls in this range"
          description="Adjust the filters or wait for new call telemetry."
        />
      ) : (
        <>
          {/* Desktop: full table */}
          <div className="hidden overflow-hidden rounded-card border border-line bg-panel md:block">
            <div className="overflow-x-auto">
              <table className="au-table">
                <caption className="sr-only">Recent call legs matching the selected filters</caption>
                <thead>
                  <tr>
                    <th scope="col">Started</th>
                    <th scope="col">Call ID</th>
                    <th scope="col">Client</th>
                    <th scope="col">Role / direction</th>
                    <th scope="col">Control-plane</th>
                    <th scope="col">Media</th>
                    <th scope="col">Failure</th>
                    <th scope="col" aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {recentCallLegs.map((leg) => (
                    <tr key={`${leg.callId}:${leg.attemptId}`}>
                      <td className="whitespace-nowrap tabular-nums">{new Date(leg.startedAt).toLocaleString()}</td>
                      <td><code className="font-mono text-xs text-ink">{leg.callId}</code></td>
                      <td className="whitespace-nowrap">{`${leg.platform} ${leg.appVersion}`}</td>
                      <td className="whitespace-nowrap">{`${leg.role ?? '—'} / ${leg.direction ?? '—'}`}</td>
                      <td>
                        <span className={pill(leg.controlPlaneActive ? 'good' : 'muted')}>
                          {leg.controlPlaneActive ? 'Ready' : 'Not ready'}
                        </span>
                      </td>
                      <td>
                        <span className={pill(leg.mediaReady ? 'good' : 'muted')}>
                          {leg.mediaReady ? 'Ready' : 'Not ready'}
                        </span>
                      </td>
                      <td>
                        {leg.failure
                          ? <span className={pill('bad')}>{leg.failure.stage}:{leg.failure.errorCode ?? 'unknown'}</span>
                          : <span className={pill('good')}>None</span>}
                      </td>
                      <td className="text-right">
                        <Button variant="secondary" size="sm" onClick={() => onInspect(leg.callId)}>
                          Inspect
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile: card stack */}
          <div className="flex flex-col gap-2.5 md:hidden">
            {recentCallLegs.map((leg) => (
              <article key={`${leg.callId}:${leg.attemptId}`} className="flex flex-col gap-2 rounded-card border border-line bg-panel px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <code className="min-w-0 truncate font-mono text-[13px] font-semibold text-ink">{leg.callId}</code>
                  <time className="shrink-0 text-[11px] tabular-nums text-ink-3">
                    {new Date(leg.startedAt).toLocaleString()}
                  </time>
                </div>
                <p className="text-xs text-ink-2">
                  {`${leg.role ?? '—'} · ${leg.direction ?? '—'} · ${leg.platform} ${leg.appVersion}`}
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={pill(leg.controlPlaneActive ? 'good' : 'muted')}>
                    {leg.controlPlaneActive ? 'Control-plane ready' : 'Control-plane not ready'}
                  </span>
                  <span className={pill(leg.mediaReady ? 'good' : 'muted')}>
                    {leg.mediaReady ? 'Media ready' : 'Media not ready'}
                  </span>
                  {leg.failure
                    ? <span className={pill('bad')}>{leg.failure.stage}:{leg.failure.errorCode ?? 'unknown'}</span>
                    : <span className={pill('good')}>No failure</span>}
                </div>
                <div>
                  <Button variant="secondary" size="sm" onClick={() => onInspect(leg.callId)}>
                    Inspect
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
