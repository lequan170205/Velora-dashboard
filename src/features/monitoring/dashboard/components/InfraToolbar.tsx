import { RefreshCw } from 'lucide-react'

import { RANGE_OPTIONS, type RangeHours } from '../../model'
import { cn } from '@/shared/lib/cn'

type InfraToolbarProps = {
  title: string
  titleId: string
  eyebrow?: string
  description?: string
  rangeLabel: string
  rangeHours: RangeHours
  onRangeChange: (hours: RangeHours) => void
  refreshing: boolean
  onRefresh: () => void
}

export function InfraToolbar({
  title,
  titleId,
  eyebrow,
  description,
  rangeLabel,
  rangeHours,
  onRangeChange,
  refreshing,
  onRefresh,
}: InfraToolbarProps) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">{eyebrow}</p>
        )}
        <h2 className="sr-only" id={titleId}>{title}</h2>
        {description && (
          <p className="mt-0.5 max-w-prose text-[13px] leading-relaxed text-ink-2">{description}</p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <div
          role="group"
          aria-label={rangeLabel}
          className="flex rounded-control border border-line bg-raised p-0.5"
        >
          {RANGE_OPTIONS.map((option) => {
            const active = option.hours === rangeHours
            return (
              <button
                key={option.hours}
                type="button"
                aria-pressed={active}
                onClick={() => onRangeChange(option.hours)}
                className={cn(
                  'h-7 rounded-[6px] px-2.5 text-xs font-medium tabular-nums transition-colors duration-150',
                  'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand',
                  active ? 'bg-panel text-ink shadow-panel' : 'text-ink-2 hover:text-ink',
                )}
              >
                {option.label}
                <span className="sr-only">{option.accessibleLabel}</span>
              </button>
            )
          })}
        </div>

        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          aria-busy={refreshing}
          className={cn(
            'inline-flex h-8 items-center gap-1.5 rounded-control border border-line bg-raised px-3 text-[13px] font-medium text-ink',
            'transition-colors duration-150 hover:border-line-strong hover:bg-inset',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
            'disabled:pointer-events-none disabled:opacity-50',
          )}
        >
          <RefreshCw size={13} aria-hidden="true" className={refreshing ? 'animate-spin' : undefined} />
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
    </div>
  )
}
