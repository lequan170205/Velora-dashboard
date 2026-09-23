import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Check, CheckCircle2, Copy, Minus, Search } from 'lucide-react'

import { milliseconds, percent, type RecentCallLeg } from '../../api'
import { useCalls } from '../../CallsProvider'
import { useCallSummaryQuery, useRecentCallsQuery } from '../../useCallsQueries'
import { FilterBar } from '../../components/FilterBar'
import { InspectCallDialog } from '../../components/InspectCallDialog'
import { CallDetailsDrawer } from '../../components/CallDetailsDrawer'
import { Button, EmptyState, Skeleton, SkeletonRows } from '@/shared/components/ui'
import { cn } from '@/shared/lib/cn'
import { useNow } from '@/shared/lib/useNow'

const MOBILE_BATCH_SIZE = 8

type CallsOverviewViewProps = {
  selectedCallId: string | null
  onInspect: (callId: string) => void
  onCloseInspection: () => void
}

const pill = (tone: 'good' | 'muted' | 'bad') =>
  cn(
    'inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium',
    tone === 'good' && 'bg-ok-soft text-ok',
    tone === 'muted' && 'bg-raised text-ink-3',
    tone === 'bad' && 'bg-bad-soft text-bad',
  )

const legState = (leg: RecentCallLeg) => {
  if (leg.failure) return { label: `${leg.failure.stage}:${leg.failure.errorCode ?? 'unknown'}`, tone: 'bad' as const }
  if (leg.mediaReady) return { label: 'Media ready', tone: 'good' as const }
  if (leg.controlPlaneActive) return { label: 'Signaling ready', tone: 'muted' as const }
  return { label: 'Setup', tone: 'muted' as const }
}

function MetricTile({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="min-w-0 rounded-card border border-line bg-panel px-4 py-3">
      <p className="text-xs font-medium text-ink-3">{label}</p>
      <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-ink">{value}</p>
      {detail && <p className="mt-0.5 truncate text-[11px] text-ink-3" title={detail}>{detail}</p>}
    </div>
  )
}

function RecentTelemetry({
  legs,
  scope,
  onScopeChange,
  onInspect,
}: {
  legs: readonly RecentCallLeg[]
  scope: 'all' | 'failed'
  onScopeChange: (scope: 'all' | 'failed') => void
  onInspect: (callId: string) => void
}) {
  const [mobileCount, setMobileCount] = useState(MOBILE_BATCH_SIZE)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => {
    setMobileCount(MOBILE_BATCH_SIZE)
  }, [scope, legs])

  const filtered = scope === 'failed' ? legs.filter((leg) => leg.failure) : legs
  const mobileLegs = filtered.slice(0, mobileCount)

  const copyId = async (event: React.MouseEvent, callId: string) => {
    event.stopPropagation()
    try {
      await navigator.clipboard.writeText(callId)
      setCopiedId(callId)
      window.setTimeout(() => setCopiedId(null), 1_500)
    } catch {
      setCopiedId(null)
    }
  }

  if (legs.length === 0) {
    return <EmptyState icon={Minus} title="No recent telemetry" description="Adjust the filters or wait for new call telemetry." />
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-control border border-line bg-raised p-0.5" role="group" aria-label="Recent call telemetry view">
          {(['all', 'failed'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={scope === value}
              onClick={() => onScopeChange(value)}
              className={cn(
                'h-7 rounded-[6px] px-2.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-brand',
                scope === value ? 'bg-panel text-ink shadow-sm' : 'text-ink-3 hover:text-ink',
              )}
            >
              {value === 'all' ? 'All' : 'Failed'}
            </button>
          ))}
        </div>
        <span className="text-xs tabular-nums text-ink-3">
          {legs.length === 50 ? 'Latest 50 legs' : `${legs.length} legs`}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-card border border-line bg-panel px-4 py-8 text-center text-[13px] text-ink-3">
          No failed legs in the current result set.
        </div>
      ) : (
        <>
          <div className="hidden max-h-[420px] overflow-auto rounded-card border border-line bg-panel md:block">
            <table className="au-table">
              <caption className="sr-only">Latest call telemetry legs matching the selected filters</caption>
              <thead>
                <tr>
                  <th scope="col" className="sticky top-0 z-10">Last seen</th>
                  <th scope="col" className="sticky top-0 z-10">Call ID</th>
                  <th scope="col" className="sticky top-0 z-10">Client</th>
                  <th scope="col" className="sticky top-0 z-10">Leg</th>
                  <th scope="col" className="sticky top-0 z-10">State</th>
                  <th scope="col" className="sticky top-0 z-10" aria-label="Open" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((leg) => {
                  const state = legState(leg)
                  return (
                    <tr
                      key={`${leg.callId}:${leg.attemptId}`}
                      tabIndex={0}
                      role="button"
                      aria-label={`Inspect call ${leg.callId}`}
                      onClick={() => onInspect(leg.callId)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          onInspect(leg.callId)
                        }
                      }}
                      className="cursor-pointer focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-brand"
                    >
                      <td className="whitespace-nowrap tabular-nums">{new Date(leg.lastOccurredAt).toLocaleString()}</td>
                      <td>
                        <div className="flex items-center gap-1">
                          <code className="max-w-44 truncate font-mono text-xs text-ink" title={leg.callId}>{leg.callId}</code>
                          <button
                            type="button"
                            aria-label={`Copy call ID ${leg.callId}`}
                            title="Copy call ID"
                            onClick={(event) => void copyId(event, leg.callId)}
                            className="inline-flex size-7 shrink-0 items-center justify-center rounded-control text-ink-3 hover:bg-inset hover:text-ink focus-visible:outline-2 focus-visible:outline-brand"
                          >
                            {copiedId === leg.callId ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
                          </button>
                        </div>
                      </td>
                      <td className="whitespace-nowrap">{leg.platform} · {leg.appVersion}</td>
                      <td className="whitespace-nowrap">{leg.role ?? '—'} · {leg.direction ?? '—'}</td>
                      <td><span className={pill(state.tone)}>{state.label}</span></td>
                      <td className="text-right text-ink-3"><ArrowRight size={15} aria-hidden="true" /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-2.5 md:hidden">
            {mobileLegs.map((leg) => {
              const state = legState(leg)
              return (
                <button
                  key={`${leg.callId}:${leg.attemptId}`}
                  type="button"
                  onClick={() => onInspect(leg.callId)}
                  className="flex flex-col gap-2 rounded-card border border-line bg-panel px-4 py-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  <div className="flex items-center justify-between gap-2">
                    <code className="min-w-0 truncate font-mono text-[13px] font-semibold text-ink">{leg.callId}</code>
                    <ArrowRight size={15} aria-hidden="true" className="shrink-0 text-ink-3" />
                  </div>
                  <p className="text-xs text-ink-3">
                    {new Date(leg.lastOccurredAt).toLocaleString()} · {leg.platform} {leg.appVersion}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={pill(state.tone)}>{state.label}</span>
                    <span className={pill('muted')}>{leg.role ?? '—'} · {leg.direction ?? '—'}</span>
                  </div>
                </button>
              )
            })}
            {mobileCount < filtered.length && (
              <Button variant="secondary" size="sm" onClick={() => setMobileCount((count) => count + MOBILE_BATCH_SIZE)}>
                Load {Math.min(MOBILE_BATCH_SIZE, filtered.length - mobileCount)} more
              </Button>
            )}
          </div>
        </>
      )}
    </>
  )
}

export function CallsOverviewView({
  selectedCallId,
  onInspect,
  onCloseInspection,
}: CallsOverviewViewProps) {
  const { draft, applied, apply, updateFilter } = useCalls()
  const summaryQuery = useCallSummaryQuery(applied)
  const recentQuery = useRecentCallsQuery(applied)
  const summary = summaryQuery.data
  const recentCallLegs = recentQuery.data ?? []
  const [inspectDialogOpen, setInspectDialogOpen] = useState(false)
  const [recentScope, setRecentScope] = useState<'all' | 'failed'>('all')
  const now = useNow(5_000)

  const failures = useMemo(
    () => Object.entries(summary?.failures ?? {}).sort((left, right) => right[1] - left[1]),
    [summary],
  )
  const failureEventCount = failures.reduce((total, [, count]) => total + count, 0)
  const summaryLoading = summaryQuery.isPending && !summary
  const recentLoading = recentQuery.isPending && recentCallLegs.length === 0
  const updatedAtValues = [summaryQuery.dataUpdatedAt, recentQuery.dataUpdatedAt].filter((value) => value > 0)
  const oldestUpdate = updatedAtValues.length > 0 ? Math.min(...updatedAtValues) : 0

  const freshness = applied.range === 'custom'
    ? 'Historical range'
    : summaryQuery.isFetching || recentQuery.isFetching
      ? 'Refreshing…'
      : oldestUpdate > 0
        ? `Updated ${Math.max(0, Math.floor((now - oldestUpdate) / 1000))}s ago`
        : 'Live'

  const errors = [summaryQuery.error?.message, recentQuery.error?.message]
    .filter((message, index, all): message is string => Boolean(message) && all.indexOf(message) === index)

  return (
    <section className="flex flex-col gap-4" aria-labelledby="calls-overview-title" aria-busy={summaryLoading || recentLoading}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">Call telemetry</p>
          <h2 className="sr-only" id="calls-overview-title">Calls overview</h2>
          <p className="mt-0.5 max-w-prose text-[13px] leading-relaxed text-ink-2">
            Spot degraded call behavior, find the affected leg, then inspect its attempts.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-line px-2.5 py-1 text-xs tabular-nums text-ink-3">{freshness}</span>
          <Button variant="secondary" size="sm" onClick={() => setInspectDialogOpen(true)}>
            <Search size={14} aria-hidden="true" />
            Inspect call ID
          </Button>
        </div>
      </div>

      <FilterBar filters={draft} appliedFilters={applied} onChange={updateFilter} onApply={apply} />

      {errors.length > 0 && (
        <div role="alert" className="rounded-card border border-bad-soft bg-bad-soft/50 px-4 py-3 text-[13px] text-ink">
          <strong className="font-semibold">Some call telemetry could not refresh.</strong> {errors.join(' · ')}
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
            label="Poor samples"
            value={percent(summary?.quality.badSampleRate ?? null)}
            detail={summary ? `${summary.quality.samples} quality samples` : undefined}
          />
        </div>
      )}

      <section className="flex flex-col gap-3" aria-labelledby="recent-telemetry-heading">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">Drill down</p>
          <h3 id="recent-telemetry-heading" className="text-sm font-semibold text-ink">Recent telemetry</h3>
        </div>

        {recentLoading ? (
          <div className="overflow-hidden rounded-card border border-line bg-panel" aria-label="Loading recent telemetry">
            <SkeletonRows rows={8} rowClassName="py-[13px]" />
          </div>
        ) : (
          <RecentTelemetry
            legs={recentCallLegs}
            scope={recentScope}
            onScopeChange={setRecentScope}
            onInspect={onInspect}
          />
        )}
      </section>

      <details className="overflow-hidden rounded-card border border-line bg-panel">
        <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-ink">
          Diagnostics
          <span className="ml-2 text-xs font-normal text-ink-3">
            latency, network averages, and {failureEventCount} failure events
          </span>
        </summary>
        <div className="grid grid-cols-1 border-t border-line xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
          <section className="border-b border-line xl:border-b-0 xl:border-r" aria-label="Latency and network averages">
            <div className="grid grid-cols-2 sm:grid-cols-4">
              {[
                ['Setup p95', milliseconds(summary?.timeToControlPlaneActiveMs.p95 ?? null), `p50 ${milliseconds(summary?.timeToControlPlaneActiveMs.p50 ?? null)}`],
                ['First audio p95', milliseconds(summary?.timeToFirstRemoteAudioMs.p95 ?? null), `p50 ${milliseconds(summary?.timeToFirstRemoteAudioMs.p50 ?? null)}`],
                ['Avg packet loss', percent(summary?.quality.packetLossRate ?? null), null],
                ['Avg jitter', milliseconds(summary?.quality.jitterMs ?? null), null],
                ['Avg RTT', milliseconds(summary?.quality.roundTripTimeMs ?? null), null],
                ['Avg concealment', percent(summary?.quality.concealmentRate ?? null), null],
                ['Avg jitter buffer', milliseconds(summary?.quality.jitterBufferDelayMs ?? null), null],
                ['Quality samples', summary?.quality.samples.toString() ?? '—', null],
              ].map(([label, value, detail]) => (
                <div key={label} className="border-b border-r border-line px-4 py-3 sm:[&:nth-child(4n)]:border-r-0 sm:[&:nth-last-child(-n+4)]:border-b-0">
                  <dt className="text-xs text-ink-3">{label}</dt>
                  <dd className="mt-1 font-mono text-base font-semibold tabular-nums text-ink">{value}</dd>
                  {detail && <dd className="mt-0.5 text-[11px] text-ink-3">{detail}</dd>}
                </div>
              ))}
            </div>
          </section>

          <section aria-label="Failure events">
            <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
              <span className="text-xs font-semibold text-ink">Failure events</span>
              <span className={cn(
                'rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums',
                failureEventCount > 0 ? 'bg-bad-soft text-bad' : 'bg-ok-soft text-ok',
              )}>
                {failureEventCount}
              </span>
            </div>
            {failures.length === 0 ? (
              <div className="flex min-h-32 items-center justify-center gap-2 px-4 py-6 text-[13px] text-ink-2">
                <CheckCircle2 size={16} aria-hidden="true" className="text-ok" />
                No failure events
              </div>
            ) : (
              <ul className="max-h-56 divide-y divide-line overflow-y-auto">
                {failures.map(([reason, count]) => (
                  <li key={reason} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <code className="min-w-0 truncate text-xs text-ink-2" title={reason}>{reason}</code>
                    <strong className="shrink-0 font-mono text-sm tabular-nums text-ink">{count}</strong>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </details>

      <InspectCallDialog
        open={inspectDialogOpen}
        onOpenChange={setInspectDialogOpen}
        onInspect={onInspect}
      />
      <CallDetailsDrawer callId={selectedCallId} onClose={onCloseInspection} />
    </section>
  )
}
