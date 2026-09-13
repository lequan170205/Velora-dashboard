import { CircleCheck, Loader2, TriangleAlert } from 'lucide-react'

import type { Tone } from '../../formatters'
import { formatMonitoringAge } from '../../freshness'
import type { HealthVm } from '../types'
import { useNow } from '@/shared/lib/useNow'
import { cn } from '@/shared/lib/cn'

const TONE_ICON: Record<Tone, typeof CircleCheck> = {
  good: CircleCheck,
  warn: TriangleAlert,
  bad: TriangleAlert,
  neutral: Loader2,
}

const TONE_CLASS: Record<Tone, string> = {
  good: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  bad: 'bg-bad-soft text-bad',
  neutral: 'bg-raised text-ink-3',
}

type HealthBannerProps = HealthVm & {
  generatedAt?: string
  refreshing?: boolean
}

export function HealthBanner({ tone, label, title, detail, generatedAt, refreshing = false }: HealthBannerProps) {
  const now = useNow(5_000)
  const Icon = TONE_ICON[tone]

  const parsedTimestamp = generatedAt ? Date.parse(generatedAt) : Number.NaN
  const timeLabel = refreshing
    ? 'Updating…'
    : Number.isFinite(parsedTimestamp)
      ? formatMonitoringAge(now, parsedTimestamp)
      : 'Waiting'

  return (
    <div className="flex items-center justify-between gap-3 rounded-card border border-line bg-panel px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <span
          aria-hidden="true"
          className={cn('grid size-8 shrink-0 place-items-center rounded-full', TONE_CLASS[tone])}
        >
          <Icon size={16} className={tone === 'neutral' ? 'animate-spin' : undefined} />
        </span>
        <p className="min-w-0 truncate text-sm font-semibold text-ink">
          <span className="sr-only">{label}: </span>
          {title}
          <span className="sr-only">. {detail}</span>
        </p>
      </div>
      <time
        className="shrink-0 text-xs tabular-nums text-ink-3"
        dateTime={generatedAt}
        title={Number.isFinite(parsedTimestamp) ? new Date(parsedTimestamp).toLocaleString() : undefined}
      >
        {timeLabel}
      </time>
    </div>
  )
}
