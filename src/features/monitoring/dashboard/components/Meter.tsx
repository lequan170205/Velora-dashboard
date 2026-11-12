import type { Tone } from '../../formatters'
import { cn } from '@/shared/lib/cn'

const METER_FILL: Record<Tone, string> = {
  good: 'bg-ok/70',
  warn: 'bg-warn',
  bad: 'bg-bad',
  neutral: 'bg-ink-3/40',
}

/* Capacity gauge (0..1) with optional threshold notches. */
export function Meter({
  ratio,
  tone = 'good',
  warnAt,
  badAt,
  className,
}: {
  ratio: number
  tone?: Tone
  warnAt?: number
  badAt?: number
  className?: string
}) {
  if (!Number.isFinite(ratio)) return null
  const pct = Math.min(100, Math.max(0, ratio * 100))

  return (
    <div className={cn('relative h-1.5 overflow-hidden rounded-full bg-inset', className)}>
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
