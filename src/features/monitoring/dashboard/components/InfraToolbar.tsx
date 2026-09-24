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

/* Range controls + icon refresh, right-aligned. The page heading in the topbar
   already names the section, so the toolbar carries no prose. */
export function InfraToolbar({
  title,
  titleId,
  rangeLabel,
  rangeHours,
  onRangeChange,
  refreshing,
  onRefresh,
}: InfraToolbarProps) {
  return (
    <div className="flex items-center justify-end">
      <h2 className="sr-only" id={titleId}>{title}</h2>
      <div className="flex items-center gap-2">
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
          aria-label="Refresh data"
          title="Refresh data"
          className={cn(
            'inline-flex size-8 items-center justify-center rounded-control border border-line bg-raised text-ink-2',
            'transition-colors duration-150 hover:border-line-strong hover:bg-inset hover:text-ink',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
            'disabled:pointer-events-none disabled:opacity-50',
          )}
        >
          <RefreshCw size={14} aria-hidden="true" className={refreshing ? 'animate-spin' : undefined} />
        </button>
      </div>
    </div>
  )
}
