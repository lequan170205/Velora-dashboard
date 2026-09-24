import { Badge, type BadgeTone } from '@/shared/components/ui'
import { cn } from '@/shared/lib/cn'
import type { Tone } from '../../formatters'
import type { StatCardGroupVm, StatCardVm } from '../types'

const BADGE_TONE: Record<Tone, BadgeTone> = {
  good: 'good',
  warn: 'warn',
  bad: 'bad',
  neutral: 'neutral',
}

/* Healthy cards stay quiet — no badge, no tone bar. A tone surfaces only when a
   threshold is actually crossed, so abnormal state is what catches the eye. */
function StatCardBody({ card }: { card: StatCardVm }) {
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 text-[13px] font-medium leading-snug text-ink-2">{card.label}</span>
        {card.tone !== 'good' && (
          <Badge tone={BADGE_TONE[card.tone]} dot>
            {card.badge}
          </Badge>
        )}
      </div>
      <span className="font-mono text-[26px] font-semibold leading-tight tracking-tight text-ink tabular-nums">
        {card.value}
      </span>
      {card.meter && Number.isFinite(card.meter.ratio) && (
        <div className="relative h-1.5 overflow-hidden rounded-full bg-inset">
          <div
            className={cn(
              'absolute inset-y-0 left-0 rounded-full',
              card.tone === 'bad' ? 'bg-bad' : card.tone === 'warn' ? 'bg-warn' : 'bg-ok/70',
            )}
            style={{ width: `${Math.min(100, Math.max(0, card.meter.ratio * 100))}%` }}
          />
        </div>
      )}
      {card.detail && <span className="text-xs text-ink-3">{card.detail}</span>}
      <span className="sr-only">{card.helper}</span>
    </>
  )
}

const cardClass =
  'relative flex flex-col gap-1.5 rounded-card border border-line bg-panel px-4 pb-4 pt-4 text-left transition-colors duration-150'

export function StatCard({
  card,
  onDialog,
}: {
  card: StatCardVm
  onDialog?: (metric: StatCardVm['dialog']) => void
}) {
  if (card.dialog && onDialog) {
    return (
      <button
        type="button"
        className={cn(cardClass, 'cursor-pointer hover:border-line-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand')}
        aria-haspopup="dialog"
        aria-label={`${card.label}: ${card.value}. Open breakdown`}
        title={card.helper}
        onClick={() => onDialog(card.dialog)}
      >
        <StatCardBody card={card} />
      </button>
    )
  }

  return (
    <article className={cardClass} title={card.helper}>
      <StatCardBody card={card} />
    </article>
  )
}

export function StatCardGrid({
  cards,
  gridClassName,
  refreshing = false,
  onDialog,
}: {
  cards: readonly StatCardVm[]
  gridClassName?: string
  refreshing?: boolean
  onDialog?: (metric: StatCardVm['dialog']) => void
}) {
  return (
    <div
      aria-busy={refreshing}
      className={cn('grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3', gridClassName)}
    >
      {cards.map((card) => (
        <StatCard key={card.label} card={card} onDialog={onDialog} />
      ))}
    </div>
  )
}

export function StatCardGroups({ groups, refreshing, onDialog }: {
  groups: readonly StatCardGroupVm[]
  refreshing?: boolean
  onDialog?: (metric: StatCardVm['dialog']) => void
}) {
  return (
    <div className="flex flex-col gap-5">
      {groups.map((group) => (
        <section key={group.id} aria-label={group.heading}>
          {group.heading && (
            <div className="mb-2 flex items-baseline gap-2">
              <h3 className="text-sm font-semibold text-ink">{group.heading}</h3>
              {group.hint && <span className="text-xs text-ink-3">{group.hint}</span>}
            </div>
          )}
          <StatCardGrid
            cards={group.cards}
            gridClassName={group.gridClassName}
            refreshing={refreshing}
            onDialog={onDialog}
          />
        </section>
      ))}
    </div>
  )
}
