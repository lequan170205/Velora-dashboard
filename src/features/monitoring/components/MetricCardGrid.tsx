import type { MetricCardDefinition } from '../model'

type MetricCardGridProps = {
  cards: readonly MetricCardDefinition[]
  className?: string
  refreshing?: boolean
}

export function MetricCardGrid({ cards, className = '', refreshing = false }: MetricCardGridProps) {
  return (
    <div className={`friendly-metric-grid ${className}`.trim()} aria-busy={refreshing}>
      {cards.map((card) => (
        <article className={`friendly-metric-card tone-${card.tone}`} key={card.label}>
          <div className="friendly-metric-topline">
            <span>{card.label}</span>
            <span className={`metric-badge ${card.tone}`}>{card.badge}</span>
          </div>
          <strong>{card.value}</strong>
          <p>{card.helper}</p>
        </article>
      ))}
    </div>
  )
}
