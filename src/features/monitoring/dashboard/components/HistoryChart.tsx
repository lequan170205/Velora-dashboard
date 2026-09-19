import { useId, type ReactNode } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { CircleOff, Minus, TriangleAlert } from 'lucide-react'

import type { MonitoringPoint } from '../../api'
import {
  formatMonitoringAge,
  getMonitoringHistoryFreshnessState,
} from '../../freshness'
import type { MonitoringEmptyStateKind, MonitoringThresholdDefinition, MonitoringTooltipSnapshot, MonitoringCurrentValue, MonitoringYAxisDefinition } from '../../model'
import type { ChartSeriesToken } from '@/shared/lib/chartTheme'
import { useChartTheme } from '@/shared/lib/chartTheme'
import { ChartPlotSkeleton } from '@/shared/components/ui'
import { cn } from '@/shared/lib/cn'

type HistoryChartProps = {
  points: MonitoringPoint[]
  metric: string
  title: string
  question: string
  description: string
  valueFormatter: (value: number) => string
  axisFormatter: (value: number) => string
  accentToken: ChartSeriesToken
  emptyTitle: string
  emptyDescription: string
  emptyStateKind?: MonitoringEmptyStateKind
  yAxis?: MonitoringYAxisDefinition
  currentValue?: MonitoringCurrentValue
  currentSnapshot?: MonitoringTooltipSnapshot
  historyError?: string | null
  now: number
  loading?: boolean
}

type ThresholdState = {
  label: 'Healthy' | 'Watch' | 'High'
  tone: 'good' | 'warn' | 'bad'
}

type ChartEmptyState = {
  kind: 'error' | MonitoringEmptyStateKind
  label: 'Failed to load' | 'No data yet' | 'No traffic data'
  icon: typeof Minus
  title: string
  description: string
}

const normalizeTimestamp = (timestamp: number) =>
  timestamp > 10_000_000_000 ? timestamp : timestamp * 1000

const formatTime = (timestamp: number) =>
  new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

const inferSampleStepMs = (timestamps: number[]): number | null => {
  const recent = timestamps.slice(-6)
  const intervals: number[] = []

  for (let index = 1; index < recent.length; index += 1) {
    const interval = recent[index] - recent[index - 1]
    if (Number.isFinite(interval) && interval > 0) intervals.push(interval)
  }

  if (intervals.length === 0) return null

  intervals.sort((a, b) => a - b)
  const middle = Math.floor(intervals.length / 2)
  return intervals.length % 2 === 0
    ? (intervals[middle - 1] + intervals[middle]) / 2
    : intervals[middle]
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const calculateAdaptiveDomain = (
  values: number[],
  definition?: MonitoringYAxisDefinition,
): [number, number] | undefined => {
  if (!definition || definition.mode !== 'adaptive' || values.length === 0) return undefined

  const finiteValues = values.filter(Number.isFinite)
  if (finiteValues.length === 0) return undefined

  const dataMin = Math.min(...finiteValues)
  const dataMax = Math.max(...finiteValues)
  const minBound = definition.min ?? Number.NEGATIVE_INFINITY
  const maxBound = definition.max ?? Number.POSITIVE_INFINITY
  const availableSpan = maxBound - minBound
  const rawSpan = Math.max(0, dataMax - dataMin)
  const minimumSpan = Math.max(0, definition.minSpan ?? 0)

  let span = Math.max(rawSpan * 1.35, minimumSpan)
  if (!Number.isFinite(span) || span <= 0) {
    span = Math.max(Math.abs(dataMax) * 0.2, 1)
  }
  if (Number.isFinite(availableSpan)) {
    span = Math.min(span, availableSpan)
  }

  const center = (dataMin + dataMax) / 2
  let lower = center - span / 2
  let upper = center + span / 2

  if (lower < minBound) {
    upper += minBound - lower
    lower = minBound
  }
  if (upper > maxBound) {
    lower -= upper - maxBound
    upper = maxBound
  }

  lower = Math.max(minBound, lower)
  upper = Math.min(maxBound, upper)

  const roundStep = definition.roundStep
  if (roundStep && Number.isFinite(roundStep) && roundStep > 0) {
    lower = Math.floor(lower / roundStep) * roundStep
    upper = Math.ceil(upper / roundStep) * roundStep
    lower = clamp(lower, minBound, maxBound)
    upper = clamp(upper, minBound, maxBound)
  }

  if (!(upper > lower)) return undefined
  return [lower, upper]
}

const thresholdStateForValue = (
  value: number,
  thresholds?: readonly MonitoringThresholdDefinition[],
): ThresholdState | null => {
  if (!Number.isFinite(value) || !thresholds?.length) return null

  const crossedThresholds = thresholds.filter(
    (threshold) => Number.isFinite(threshold.value) && value >= threshold.value,
  )

  if (thresholds.every((threshold) => !Number.isFinite(threshold.value))) return null
  if (crossedThresholds.some((threshold) => threshold.tone === 'bad')) {
    return { label: 'High', tone: 'bad' }
  }
  if (crossedThresholds.some((threshold) => threshold.tone === 'warn')) {
    return { label: 'Watch', tone: 'warn' }
  }

  return { label: 'Healthy', tone: 'good' }
}

export function HistoryChart({
  points,
  metric,
  title,
  question,
  description,
  valueFormatter,
  axisFormatter,
  accentToken,
  emptyTitle,
  emptyDescription,
  emptyStateKind = 'no-data',
  yAxis,
  currentValue,
  currentSnapshot,
  historyError,
  now,
  loading = false,
}: HistoryChartProps) {
  const chartTheme = useChartTheme()
  const gradientId = useId()
  const seriesColor = chartTheme.series[accentToken]

  const data = points.map((point) => ({
    timestamp: normalizeTimestamp(point.timestamp),
    value: point.value,
  }))

  const timestamps = data.map((point) => point.timestamp)
  const values = data.map((point) => point.value)
  const latestHistoryValue = values.at(-1)
  const latestTimestampCandidate = timestamps.at(-1)
  const latestTimestamp = latestTimestampCandidate !== undefined && Number.isFinite(latestTimestampCandidate)
    ? latestTimestampCandidate
    : undefined
  const sampleStepMs = inferSampleStepMs(timestamps)
  const hasHistoryError = Boolean(historyError)
  const historyFreshness = latestTimestamp === undefined
    ? null
    : getMonitoringHistoryFreshnessState({
        now,
        lastSampleAt: latestTimestamp,
        sampleStepMs,
        hasError: hasHistoryError,
      })
  const hasStaleHistory = hasHistoryError || historyFreshness === 'stale'
  const historyAge = latestTimestamp === undefined ? null : formatMonitoringAge(now, latestTimestamp)
  const liveValue = currentValue?.value
  const hasLiveCurrent = liveValue != null && Number.isFinite(liveValue)
  const headingValue = hasLiveCurrent ? liveValue : latestHistoryValue
  const currentThresholdState = hasLiveCurrent
    ? thresholdStateForValue(liveValue, yAxis?.thresholds)
    : null
  const min = values.length ? Math.min(...values) : undefined
  const max = values.length ? Math.max(...values) : undefined
  const yDomain = calculateAdaptiveDomain(values, yAxis)
  const visibleThresholds = yAxis?.thresholds?.filter((threshold) =>
    !yDomain || (threshold.value >= yDomain[0] && threshold.value <= yDomain[1]),
  ) ?? []

  const emptyState: ChartEmptyState = hasHistoryError
      ? {
          kind: 'error',
          label: 'Failed to load',
          icon: TriangleAlert,
          title: 'History temporarily unavailable',
          description: `${historyError} Other charts can continue updating.`,
        }
      : emptyStateKind === 'no-traffic'
        ? {
            kind: 'no-traffic',
            label: 'No traffic data',
            icon: CircleOff,
            title: emptyTitle,
            description: emptyDescription,
          }
        : {
            kind: 'no-data',
            label: 'No data yet',
            icon: Minus,
            title: emptyTitle,
            description: emptyDescription,
          }

  const freshnessLabel = historyFreshness === 'stale'
    ? `Stale · ${historyAge}`
    : historyFreshness === 'fresh'
      ? `Updated ${historyAge}`
      : historyFreshness === 'unknown' && historyAge
        ? `Last sample ${historyAge}`
        : null

  const EmptyIcon = emptyState.icon

  return (
    <article
      className="flex flex-col gap-3 rounded-card border border-line bg-panel p-4"
      aria-label={`${title}. ${question}. ${description}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-ink">{title}</h3>
            {hasStaleHistory && data.length > 0 && (
              <span
                className="rounded-full bg-warn-soft px-2 py-0.5 text-[11px] font-medium text-warn"
                title={historyError ?? 'The last history sample is older than expected for this series.'}
              >
                Stale history
              </span>
            )}
          </div>
          {freshnessLabel && latestTimestamp !== undefined && (
            <time
              className={cn(
                'mt-0.5 block text-[11px] tabular-nums',
                historyFreshness === 'stale' ? 'text-warn' : 'text-ink-3',
              )}
              dateTime={new Date(latestTimestamp).toISOString()}
              title={`Last history sample: ${new Date(latestTimestamp).toLocaleString()}`}
            >
              {freshnessLabel}
            </time>
          )}
        </div>

        {headingValue !== undefined && Number.isFinite(headingValue) && (
          <div className="shrink-0 text-right">
            <div className="flex items-center justify-end gap-1.5">
              <span className="text-[10px] font-medium uppercase tracking-wider text-ink-3">
                {hasLiveCurrent ? 'Current' : 'Latest sample'}
              </span>
              {currentThresholdState && (
                <span
                  className={cn(
                    'rounded-full px-1.5 py-px text-[10px] font-medium',
                    currentThresholdState.tone === 'good' && 'bg-ok-soft text-ok',
                    currentThresholdState.tone === 'warn' && 'bg-warn-soft text-warn',
                    currentThresholdState.tone === 'bad' && 'bg-bad-soft text-bad',
                  )}
                  aria-label={`${currentThresholdState.label} threshold status`}
                >
                  {currentThresholdState.label}
                </span>
              )}
            </div>
            <p className="mt-0.5 font-mono text-lg font-semibold tabular-nums text-ink">
              {valueFormatter(headingValue)}
            </p>
            {hasLiveCurrent && currentValue?.context && (
              <p className="text-[11px] text-ink-3">{currentValue.context}</p>
            )}
          </div>
        )}
      </div>

      {loading && data.length === 0 ? (
        <ChartPlotSkeleton />
      ) : data.length === 0 ? (
        <div
          className={cn(
            'flex h-44 flex-col items-center justify-center gap-1.5 rounded-control border border-dashed border-line px-4 text-center',
            emptyState.kind === 'error' && 'border-warn-soft',
          )}
          role={emptyState.kind === 'error' ? 'alert' : 'status'}
        >
          <EmptyIcon
            size={18}
            aria-hidden="true"
            className="mb-0.5 text-ink-3"
          />
          <span className="text-[11px] font-medium uppercase tracking-wider text-ink-3">{emptyState.label}</span>
          <strong className="text-[13px] font-semibold text-ink">{emptyState.title}</strong>
          <p className="max-w-xs text-xs leading-relaxed text-ink-2">{emptyState.description}</p>
        </div>
      ) : (
        <>
          <div className="au-chart h-44" role="img" aria-label={`${title} history`}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={seriesColor} stopOpacity={0.26} />
                    <stop offset="100%" stopColor={seriesColor} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={chartTheme.grid} vertical={false} />
                <XAxis
                  dataKey="timestamp"
                  type="number"
                  domain={['dataMin', 'dataMax']}
                  scale="time"
                  axisLine={false}
                  tickLine={false}
                  minTickGap={32}
                  tick={{ fill: chartTheme.tick, fontSize: 11 }}
                  tickFormatter={(value) => formatTime(Number(value))}
                />
                <YAxis
                  width={70}
                  domain={yDomain ?? ['auto', 'auto']}
                  allowDataOverflow={Boolean(yDomain)}
                  tickCount={5}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: chartTheme.tick, fontSize: 11 }}
                  tickFormatter={(value) => axisFormatter(Number(value))}
                />
                {visibleThresholds.map((threshold) => (
                  <ReferenceLine
                    key={`${threshold.tone}-${threshold.value}`}
                    y={threshold.value}
                    stroke={threshold.tone === 'bad' ? chartTheme.thresholdBad : chartTheme.thresholdWarn}
                    strokeDasharray="5 5"
                    strokeOpacity={0.7}
                    ifOverflow="hidden"
                    label={{
                      value: threshold.label,
                      position: 'insideTopRight',
                      fill: threshold.tone === 'bad' ? chartTheme.thresholdBad : chartTheme.thresholdWarn,
                      fontSize: 10,
                    }}
                  />
                ))}
                <Tooltip
                  isAnimationActive={false}
                  cursor={{ stroke: chartTheme.cursor, strokeDasharray: '4 4' }}
                  content={({ active, label, payload }) => {
                    if (!active || label === undefined || label === null || !payload?.length) return null

                    const hoveredTimestamp = Number(label)
                    const hoveredValue = Number(payload[0]?.value)
                    if (!Number.isFinite(hoveredTimestamp) || !Number.isFinite(hoveredValue)) return null

                    const showCurrentSnapshot = Boolean(
                      currentSnapshot &&
                      historyFreshness === 'fresh' &&
                      latestTimestamp !== undefined &&
                      hoveredTimestamp === latestTimestamp,
                    )

                    return (
                      <div className="rounded-control border border-line bg-panel px-3 py-2 shadow-modal">
                        <span className="block text-[11px] text-ink-3">
                          {new Date(hoveredTimestamp).toLocaleString()}
                        </span>
                        <div className="mt-1 flex items-center justify-between gap-4">
                          <span className="text-xs text-ink-2">{title}</span>
                          <strong className="font-mono text-sm tabular-nums text-ink">
                            {valueFormatter(hoveredValue)}
                          </strong>
                        </div>
                        {showCurrentSnapshot && currentSnapshot && (
                          <div className="mt-2 border-t border-line pt-2">
                            <span className="text-[11px] font-medium uppercase tracking-wide text-ink-3">
                              {currentSnapshot.title}
                            </span>
                            {currentSnapshot.details.map((detail) => (
                              <div key={detail.label} className="mt-0.5 flex items-center justify-between gap-4">
                                <small className="text-[11px] text-ink-3">{detail.label}</small>
                                <strong className="font-mono text-xs tabular-nums text-ink">{detail.value}</strong>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={seriesColor}
                  fill={`url(#${gradientId})`}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0, fill: seriesColor }}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-line pt-2.5" aria-label={`${title} range summary`}>
            <span className="text-xs text-ink-3"><span className="mr-1.5 text-[10px] font-medium uppercase tracking-wide">Low</span><span className="font-mono tabular-nums text-ink-2">{min === undefined ? '—' : valueFormatter(min)}</span></span>
            <span className="text-xs text-ink-3"><span className="mr-1.5 text-[10px] font-medium uppercase tracking-wide">{hasStaleHistory ? 'Last' : 'Latest'}</span><span className="font-mono tabular-nums text-ink-2">{latestHistoryValue === undefined ? '—' : valueFormatter(latestHistoryValue)}</span></span>
            <span className="text-xs text-ink-3"><span className="mr-1.5 text-[10px] font-medium uppercase tracking-wide">High</span><span className="font-mono tabular-nums text-ink-2">{max === undefined ? '—' : valueFormatter(max)}</span></span>
          </div>
        </>
      )}
    </article>
  )
}

export function HistoryChartGrid({
  charts,
}: {
  charts: readonly ReactNode[]
}) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {charts}
    </div>
  )
}
