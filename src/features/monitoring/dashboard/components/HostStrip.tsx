import { Badge, type BadgeTone } from '@/shared/components/ui'
import { formatMonitoringAge } from '../../freshness'
import type { MonitoringPoint } from '../../api'
import type { Tone } from '../../formatters'
import type { FactVm, HealthVm, ServerMetric, StatCardVm } from '../types'
import { useNow } from '@/shared/lib/useNow'
import { cn } from '@/shared/lib/cn'

/* The host at a glance: one panel instead of a health banner, a card grid and a
   facts row. The first metric is the lead (big number + sparkline); capacity
   metrics read as gauges. Quiet while healthy — tone appears only when crossed. */

const DOT_CLASS: Record<Tone, string> = {
  good: 'bg-ok',
  warn: 'bg-warn',
  bad: 'bg-bad',
  neutral: 'bg-ink-3/50',
}

const METER_FILL: Record<Tone, string> = {
  good: 'bg-ok/70',
  warn: 'bg-warn',
  bad: 'bg-bad',
  neutral: 'bg-ink-3/40',
}

const BADGE_TONE: Record<Tone, BadgeTone> = {
  good: 'good',
  warn: 'warn',
  bad: 'bad',
  neutral: 'neutral',
}

function Sparkline({ points }: { points: readonly MonitoringPoint[] }) {
  if (points.length < 2) return null

  const width = 220
  const height = 40
  const pad = 3
  const values = points.map((point) => point.value).filter(Number.isFinite)
  if (values.length < 2) return null

  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const step = (width - pad * 2) / (points.length - 1)

  const path = points
    .map((point, index) => {
      const x = pad + index * step
      const y = height - pad - ((point.value - min) / span) * (height - pad * 2)
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      className="h-10 w-full"
    >
      <path
        d={path}
        fill="none"
        strokeWidth={1.5}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        className="stroke-brand"
      />
    </svg>
  )
}

function Meter({
  ratio,
  tone = 'good',
  warnAt,
  badAt,
}: {
  ratio: number
  tone?: Tone
  warnAt?: number
  badAt?: number
}) {
  if (!Number.isFinite(ratio)) return null
  const pct = Math.min(100, Math.max(0, ratio * 100))

  return (
    <div className="relative h-1.5 overflow-hidden rounded-full bg-inset">
      <div className={cn('absolute inset-y-0 left-0 rounded-full', METER_FILL[tone])} style={{ width: `${pct}%` }} />
      {[warnAt, badAt].map(
        (notch) =>
          Number.isFinite(notch) && (
            <span
              key={notch}
              aria-hidden="true"
              className="absolute inset-y-0 w-px bg-canvas/70"
              style={{ left: `${Math.min(100, Math.max(0, (notch as number) * 100))}%` }}
            />
          ),
      )}
    </div>
  )
}

function MetricBlock({
  card,
  hero = false,
  sparkPoints,
  onDialog,
}: {
  card: StatCardVm
  hero?: boolean
  sparkPoints?: readonly MonitoringPoint[]
  onDialog?: (metric: ServerMetric) => void
}) {
  const interactive = Boolean(card.dialog && onDialog)
  const showBadge = card.tone === 'warn' || card.tone === 'bad' || card.tone === 'neutral'

  const body = (
    <>
      <span className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-ink-3">
          {card.label}
        </span>
        {showBadge && (
          <Badge tone={BADGE_TONE[card.tone]} dot>
            {card.badge}
          </Badge>
        )}
      </span>
      <span
        className={cn(
          'font-mono font-semibold leading-none tracking-tight text-ink tabular-nums',
          hero ? 'text-[32px]' : 'text-2xl',
        )}
      >
        {card.value}
      </span>
      {sparkPoints ? (
        <Sparkline points={sparkPoints} />
      ) : (
        card.meter && (
          <Meter
            ratio={card.meter.ratio}
            tone={card.tone}
            warnAt={card.meter.warnAt}
            badAt={card.meter.badAt}
          />
        )
      )}
      {card.detail && (
        <span className="font-mono text-xs tabular-nums text-ink-3">{card.detail}</span>
      )}
      <span className="sr-only">{card.helper}</span>
    </>
  )

  const className = cn(
    'flex flex-col gap-2.5 rounded-control p-3 text-left transition-colors duration-150',
    interactive &&
      'cursor-pointer hover:bg-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
  )

  if (interactive) {
    return (
      <button
        type="button"
        className={className}
        aria-haspopup="dialog"
        aria-label={`${card.label}: ${card.value}. Open breakdown`}
        title={card.helper}
        onClick={() => onDialog?.(card.dialog as ServerMetric)}
      >
        {body}
      </button>
    )
  }

  return (
    <div className={className} title={card.helper}>
      {body}
    </div>
  )
}

type HostStripProps = {
  health: HealthVm
  cards: readonly StatCardVm[]
  facts: readonly FactVm[]
  sparkPoints?: readonly MonitoringPoint[]
  generatedAt?: string
  refreshing?: boolean
  onDialog?: (metric: ServerMetric) => void
}

export function HostStrip({
  health,
  cards,
  facts,
  sparkPoints,
  generatedAt,
  refreshing = false,
  onDialog,
}: HostStripProps) {
  const now = useNow(5_000)

  const parsedTimestamp = generatedAt ? Date.parse(generatedAt) : Number.NaN
  const timeLabel = refreshing
    ? 'updating…'
    : Number.isFinite(parsedTimestamp)
      ? `updated ${formatMonitoringAge(now, parsedTimestamp)}`
      : null

  return (
    <section className="rounded-card border border-line bg-panel" aria-label="Host overview">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden="true"
            className={cn('size-2 shrink-0 rounded-full', DOT_CLASS[health.tone])}
          />
          <h2
            className="truncate text-[13px] font-medium text-ink"
            title={health.detail}
          >
            <span className="sr-only">{health.label}: </span>
            {health.title}
          </h2>
        </div>
        {timeLabel && (
          <time
            className="shrink-0 font-mono text-xs lowercase tabular-nums text-ink-3"
            dateTime={generatedAt}
            title={Number.isFinite(parsedTimestamp) ? new Date(parsedTimestamp).toLocaleString() : undefined}
          >
            {timeLabel}
          </time>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2 p-2 sm:grid-cols-3 sm:p-3">
        {cards.map((card, index) => (
          <MetricBlock
            key={card.label}
            card={card}
            hero={index === 0}
            sparkPoints={index === 0 ? sparkPoints : undefined}
            onDialog={onDialog}
          />
        ))}
      </div>

      {facts.length > 0 && (
        <dl className="flex flex-wrap gap-x-6 gap-y-1.5 border-t border-line px-4 py-3 sm:px-5">
          {facts.map((fact) => (
            <div key={fact.label} className="flex items-baseline gap-1.5">
              <dt className="text-xs text-ink-3">{fact.label}</dt>
              <dd className="font-mono text-xs tabular-nums text-ink-2">{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  )
}
