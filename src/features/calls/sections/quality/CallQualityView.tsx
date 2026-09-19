import { useMemo } from 'react'
import { CheckCircle2 } from 'lucide-react'

import { milliseconds, percent, type CallTelemetryFilters } from '../../api'
import { useCallSummaryQuery } from '../../useCallsQueries'
import { useCalls } from '../../CallsProvider'
import { FilterBar } from '../../components/FilterBar'
import { EmptyState, Skeleton, SkeletonRows, StatCardsSkeleton } from '@/shared/components/ui'
import { cn } from '@/shared/lib/cn'

type CallQualityViewProps = {
  appliedFilters: CallTelemetryFilters
}

export function CallQualityView({ appliedFilters }: CallQualityViewProps) {
  const { draft, apply, updateFilter } = useCalls()
  const { data: summary, error, isFetching, isPending } = useCallSummaryQuery(appliedFilters)
  const initialLoading = isPending && !summary

  const callCards = useMemo(
    () => [
      { label: 'Call attempts', value: summary?.attempts.toString() ?? '—', helper: 'Call legs observed in this filter range.' },
      { label: 'Call setup success', value: percent(summary?.controlPlaneSuccessRate ?? null), helper: 'Calls that reached an active control-plane state.' },
      { label: 'Media ready', value: percent(summary?.mediaReadySuccessRate ?? null), helper: 'Calls that successfully reached media-ready.' },
      { label: 'Setup time p95', value: milliseconds(summary?.timeToControlPlaneActiveMs.p95 ?? null), helper: `Median ${milliseconds(summary?.timeToControlPlaneActiveMs.p50 ?? null)} · lower is better.` },
      { label: 'First audio p95', value: milliseconds(summary?.timeToFirstRemoteAudioMs.p95 ?? null), helper: `Median ${milliseconds(summary?.timeToFirstRemoteAudioMs.p50 ?? null)} · lower is better.` },
      { label: 'Poor audio samples', value: percent(summary?.quality.badSampleRate ?? null), helper: 'Share of quality samples classified as poor.' },
    ],
    [summary],
  )

  const qualityCards = useMemo(
    () => [
      ['Packet loss', percent(summary?.quality.packetLossRate ?? null), 'Audio packets that never arrived.'],
      ['Jitter', milliseconds(summary?.quality.jitterMs ?? null), 'Variation in packet arrival time.'],
      ['Round-trip time', milliseconds(summary?.quality.roundTripTimeMs ?? null), 'Network response delay.'],
      ['Concealment', percent(summary?.quality.concealmentRate ?? null), 'Audio reconstructed to hide missing packets.'],
      ['Jitter buffer', milliseconds(summary?.quality.jitterBufferDelayMs ?? null), 'Extra buffering used to smooth playback.'],
      ['Samples', summary?.quality.samples.toString() ?? '—', 'Quality samples included in this view.'],
    ] as const,
    [summary],
  )

  const failures = useMemo(() => Object.entries(summary?.failures ?? {}), [summary])
  const failureCount = useMemo(
    () => Object.values(summary?.failures ?? {}).reduce((total, count) => total + count, 0),
    [summary],
  )

  return (
    <section className="flex flex-col gap-4" aria-labelledby="call-quality-title" aria-busy={initialLoading || (isFetching && !summary)}>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">Application telemetry</p>
          <h2 className="sr-only" id="call-quality-title">Call quality</h2>
          <p className="mt-0.5 max-w-prose text-[13px] leading-relaxed text-ink-2">
            Setup reliability, media readiness, and network quality reported by Velora clients.
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-line px-2.5 py-1 text-xs tabular-nums text-ink-3">
          {summary?.quality.samples ?? 0} quality samples
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

      {initialLoading ? (
        <StatCardsSkeleton count={callCards.length} />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {callCards.map((card) => (
            <article
              key={card.label}
              title={card.helper}
              className="flex flex-col gap-1.5 rounded-card border border-line bg-panel px-4 pb-4 pt-[18px]"
            >
              <span className="text-[13px] font-medium text-ink-2">{card.label}</span>
              <span className="text-[26px] font-semibold leading-tight tracking-tight text-ink tabular-nums">
                {card.value}
              </span>
              <span className="sr-only">{card.helper}</span>
            </article>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <section className="overflow-hidden rounded-card border border-line bg-panel" aria-label="Average quality">
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">Network experience</p>
              <h3 className="text-sm font-semibold text-ink">Average quality</h3>
            </div>
            <span className="rounded-full border border-line px-2.5 py-1 text-[11px] text-ink-3">Client reported</span>
          </div>
          {summary ? (
            <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {qualityCards.map(([label, value, helper]) => (
                <div
                  key={label}
                  title={helper}
                  className="border-b border-r border-line px-4 py-3.5 [&:nth-child(2n)]:border-r-0 sm:[&:nth-child(2n)]:border-r lg:[&:nth-child(2n)]:border-r-0 [&:nth-last-child(-n+2)]:border-b-0 sm:[&:nth-last-child(-n+2)]:border-b-0 lg:[&:nth-last-child(-n+3)]:border-b-0"
                >
                  <dt className="text-xs text-ink-3">{label}</dt>
                  <dd className="mt-1 font-mono text-base font-semibold tabular-nums text-ink">{value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }, (_, index) => (
                <div key={index} className="border-b border-r border-line px-4 py-3.5 [&:nth-child(2n)]:border-r-0">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="mt-2 h-5 w-20" />
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="flex flex-col overflow-hidden rounded-card border border-line bg-panel" aria-label="Failures">
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">Reliability</p>
              <h3 className="text-sm font-semibold text-ink">Failures</h3>
            </div>
            <span
              className={cn(
                'rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums',
                failureCount > 0 ? 'bg-bad-soft text-bad' : 'bg-ok-soft text-ok',
              )}
            >
              {failureCount}
            </span>
          </div>
          {initialLoading ? (
            <SkeletonRows rows={3} rowClassName="py-2.5" />
          ) : failures.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="No failures in this range"
              description="Nothing needs attention for the selected filters."
              className="flex-1 border-x-0 border-b-0 rounded-t-none border-dashed"
            />
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {failures.map(([reason, count]) => (
                <li key={reason} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span className="min-w-0 truncate font-mono text-[13px] text-ink-2">{reason}</span>
                  <strong className="shrink-0 font-mono text-sm tabular-nums text-ink">{count}</strong>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </section>
  )
}
