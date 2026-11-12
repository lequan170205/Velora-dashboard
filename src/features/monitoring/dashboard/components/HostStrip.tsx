import { Badge, type BadgeTone } from '@/shared/components/ui'
import { Meter } from './Meter'
import { Sparkline } from './Sparkline'
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

const BADGE_TONE: Record<Tone, BadgeTone> = {
  good: 'good',
  warn: 'warn',
  bad: 'bad',
  neutral: 'neutral',
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
        <div role="status" aria-live="polite" aria-atomic="true" className="flex min-w-0 items-center gap-2">
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
