import type { Tone } from '../../formatters'
import { formatMonitoringAge } from '../../freshness'
import type { HealthVm } from '../types'
import { useNow } from '@/shared/lib/useNow'
import { cn } from '@/shared/lib/cn'

const DOT_CLASS: Record<Tone, string> = {
  good: 'bg-ok',
  warn: 'bg-warn',
  bad: 'bg-bad',
  neutral: 'bg-ink-3/50',
}

/* Compact status line — same shape as the HostStrip header. Quiet while
   healthy; the dot and title carry the tone, detail sits in a tooltip. */
export function HealthBanner({ tone, label, title, detail, generatedAt, refreshing = false }: HealthVm & {
  generatedAt?: string
  refreshing?: boolean
}) {
  const now = useNow(5_000)

  const parsedTimestamp = generatedAt ? Date.parse(generatedAt) : Number.NaN
  const timeLabel = refreshing
    ? 'updating…'
    : Number.isFinite(parsedTimestamp)
      ? `updated ${formatMonitoringAge(now, parsedTimestamp)}`
      : null

  return (
    <div className="flex items-center justify-between gap-3 px-1">
      <div className="flex min-w-0 items-center gap-2">
        <span
          aria-hidden="true"
          className={cn('size-2 shrink-0 rounded-full', DOT_CLASS[tone])}
        />
        <p className="min-w-0 truncate text-[13px] font-medium text-ink" title={detail}>
          <span className="sr-only">{label}: </span>
          {title}
        </p>
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
  )
}
