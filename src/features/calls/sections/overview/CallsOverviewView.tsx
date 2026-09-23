import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, ChevronDown, ChevronUp, Minus } from 'lucide-react'

import { milliseconds, percent, type RecentCallLeg } from '../../api'
import { useCalls } from '../../CallsProvider'
import { useCallSummaryQuery, useRecentCallsQuery } from '../../useCallsQueries'
import { FilterBar } from '../../components/FilterBar'
import { Button, EmptyState, Skeleton, SkeletonRows } from '@/shared/components/ui'
import { cn } from '@/shared/lib/cn'

const COLLAPSED_RECENT_CALLS = 8

type CallsOverviewViewProps = {
  onInspect: (callId: string) => void
}

const pill = (tone: 'good' | 'muted' | 'bad') =>
  cn(
    'inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium',
    tone === 'good' && 'bg-ok-soft text-ok',
    tone === 'muted' && 'bg-raised text-ink-3',
    tone === 'bad' && 'bg-bad-soft text-bad',
  )

function MetricTile({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail?: string
}) {
  return (
    <div className="min-w-0 rounded-card border border-line bg-panel px-4 py-3">
      <p className="text-xs font-medium text-ink-3">{label}</p>
      <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-ink">{value}</p>
      {detail && <p className="mt-0.5 truncate text-[11px] text-ink-3" title={detail}>{detail}</p>}
    </div>
  )
}

function RecentCallsTable({
  calls,
  onInspect,
}: {
  calls: readonly RecentCallLeg[]
  onInspect: (callId: string) => void
}) {
  return (
    <>
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
              {calls.map((leg) => (
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

      <div className="flex flex-col gap-2.5 md:hidden">
        {calls.map((leg) => (
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
  )
}

export function CallsOverviewView({ onInspect }: CallsOverviewViewProps) {
  const { draft, applied, apply, updateFilter } = useCalls()
  const summaryQuery = useCallSummaryQuery(applied)
  const recentQuery = useRecentCallsQuery(applied)
  const summary = summaryQuery.data
  const recentCallLegs = recentQuery.data ?? []
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    setShowAll(false)
  }, [applied])

  const failures = useMemo(
    () => Object.entries(summary?.failures ?? {}).sort((left, right) => right[1] - left[1]),
    [summary],
  )
  const failureCount = failures.reduce((total, [, count]) => total + count, 0)
  const visibleFailures = failures.slice(0, 4)
  const visibleCalls = showAll ? recentCallLegs : recentCallLegs.slice(0, COLLAPSED_RECENT_CALLS)
  const hiddenCalls = Math.max(0, recentCallLegs.length - COLLAPSED_RECENT_CALLS)
  const summaryLoading = summaryQuery.isPending && !summary
  const recentLoading = recentQuery.isPending && recentCallLegs.length === 0

  const errors = [
    summaryQuery.error?.message,
    recentQuery.error?.message,
  ].filter((message, index, all): message is string => Boolean(message) && all.indexOf(message) === index)

  return (
    <section
      className="flex flex-col gap-4"
      aria-labelledby="calls-overview-title"
      aria-busy={summaryLoading || recentLoading}
    >
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">Call telemetry</p>
          <h2 className="sr-only" id="calls-overview-title">Calls overview</h2>
          <p className="mt-0.5 max-w-prose text-[13px] leading-relaxed text-ink-2">
            Health summary and recent call legs in one debugging flow.
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-line px-2.5 py-1 text-xs text-ink-3">
          Auto-refresh · 15s
        </span>
      </div>

      <FilterBar filters={draft} onChange={updateFilter} onApply={apply} />

      {errors.length > 0 && (
        <div role="alert" className="rounded-card border border-bad-soft bg-bad-soft/50 px-4 py-3 text-[13px] text-ink">
          <strong className="font-semibold">Some call telemetry could not refresh.</strong>{' '}
          {errors.join(' · ')}
        </div>
      )}

      {summaryLoading ? (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="rounded-card border border-line bg-panel px-4 py-3">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-2 h-7 w-24" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <MetricTile label="Attempts" value={summary?.attempts.toString() ?? '—'} />
          <MetricTile label="Setup success" value={percent(summary?.controlPlaneSuccessRate ?? null)} />
          <MetricTile label="Media ready" value={percent(summary?.mediaReadySuccessRate ?? null)} />
          <MetricTile
            label="Poor audio"
            value={percent(summary?.quality.badSampleRate ?? null)}
            detail={summary ? `${summary.quality.samples} quality samples` : undefined}
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        <section className="overflow-hidden rounded-card border border-line bg-panel" aria-label="Call diagnostics">
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">Diagnostics</p>
              <h3 className="text-sm font-semibold text-ink">Latency & network</h3>
            </div>
            <span className="text-[11px] text-ink-3">Client reported</span>
          </div>
          {summaryLoading ? (
            <div className="grid grid-cols-2 gap-px bg-line sm:grid-cols-4">
              {Array.from({ length: 8 }, (_, index) => (
                <div key={index} className="bg-panel px-4 py-3">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="mt-2 h-5 w-20" />
                </div>
              ))}
            </div>
          ) : (
            <dl className="grid grid-cols-2 sm:grid-cols-4">
              {[
                ['Setup p95', milliseconds(summary?.timeToControlPlaneActiveMs.p95 ?? null), `p50 ${milliseconds(summary?.timeToControlPlaneActiveMs.p50 ?? null)}`],
                ['First audio p95', milliseconds(summary?.timeToFirstRemoteAudioMs.p95 ?? null), `p50 ${milliseconds(summary?.timeToFirstRemoteAudioMs.p50 ?? null)}`],
                ['Packet loss', percent(summary?.quality.packetLossRate ?? null), null],
                ['Jitter', milliseconds(summary?.quality.jitterMs ?? null), null],
                ['RTT', milliseconds(summary?.quality.roundTripTimeMs ?? null), null],
                ['Concealment', percent(summary?.quality.concealmentRate ?? null), null],
                ['Jitter buffer', milliseconds(summary?.quality.jitterBufferDelayMs ?? null), null],
                ['Samples', summary?.quality.samples.toString() ?? '—', null],
              ].map(([label, value, detail]) => (
                <div key={label} className="border-b border-r border-line px-4 py-3 last:border-r-0 sm:[&:nth-child(4n)]:border-r-0 sm:[&:nth-last-child(-n+4)]:border-b-0">
                  <dt className="text-xs text-ink-3">{label}</dt>
                  <dd className="mt-1 font-mono text-base font-semibold tabular-nums text-ink">{value}</dd>
                  {detail && <dd className="mt-0.5 text-[11px] text-ink-3">{detail}</dd>}
                </div>
              ))}
            </dl>
          )}
        </section>

        <section className="overflow-hidden rounded-card border border-line bg-panel" aria-label="Call failures">
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">Reliability</p>
              <h3 className="text-sm font-semibold text-ink">Failures</h3>
            </div>
            <span className={cn(
              'rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums',
              failureCount > 0 ? 'bg-bad-soft text-bad' : 'bg-ok-soft text-ok',
            )}>
              {failureCount}
            </span>
          </div>

          {summaryLoading ? (
            <SkeletonRows rows={4} rowClassName="py-2.5" />
          ) : visibleFailures.length === 0 ? (
            <div className="flex min-h-36 items-center justify-center gap-2 px-4 py-6 text-[13px] text-ink-2">
              <CheckCircle2 size={16} aria-hidden="true" className="text-ok" />
              No failures in this range
            </div>
          ) : (
            <div>
              <ul className="divide-y divide-line">
                {visibleFailures.map(([reason, count]) => (
                  <li key={reason} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <code className="min-w-0 truncate text-xs text-ink-2" title={reason}>{reason}</code>
                    <strong className="shrink-0 font-mono text-sm tabular-nums text-ink">{count}</strong>
                  </li>
                ))}
              </ul>
              {failures.length > visibleFailures.length && (
                <p className="border-t border-line px-4 py-2 text-xs text-ink-3">
                  +{failures.length - visibleFailures.length} other failure types
                </p>
              )}
            </div>
          )}
        </section>
      </div>

      <section className="flex flex-col gap-3" aria-labelledby="recent-calls-heading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">Drill down</p>
            <h3 id="recent-calls-heading" className="text-sm font-semibold text-ink">Recent calls</h3>
          </div>
          <span className="rounded-full border border-line px-2.5 py-1 text-xs tabular-nums text-ink-3">
            {recentCallLegs.length} call legs
          </span>
        </div>

        {recentLoading ? (
          <div className="overflow-hidden rounded-card border border-line bg-panel" aria-label="Loading recent calls">
            <SkeletonRows rows={COLLAPSED_RECENT_CALLS} rowClassName="py-[13px]" />
          </div>
        ) : recentCallLegs.length === 0 ? (
          <EmptyState
            icon={Minus}
            title="No calls in this range"
            description="Adjust the filters or wait for new call telemetry."
          />
        ) : (
          <>
            <RecentCallsTable calls={visibleCalls} onInspect={onInspect} />
            {recentCallLegs.length > COLLAPSED_RECENT_CALLS && (
              <div className="flex justify-center">
                <Button variant="secondary" size="sm" onClick={() => setShowAll((value) => !value)}>
                  {showAll ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
                  {showAll ? 'Show less' : `Show all ${recentCallLegs.length} calls`}
                  {!showAll && hiddenCalls > 0 && <span className="sr-only">{hiddenCalls} more call legs</span>}
                </Button>
              </div>
            )}
          </>
        )}
      </section>
    </section>
  )
}
