import type { MetricCardDefinition } from '../model'

type MetricCardGridProps = {
  cards: readonly MetricCardDefinition[]
  className?: string
  refreshing?: boolean
}

export function MetricCardGrid({ cards, className = '', refreshing = false }: MetricCardGridProps) {
  return (
    <div className={`friendly-metric-grid ${className}`.trim()} aria-busy={refreshing}>
      {cards.map((card) => {
        const className = `friendly-metric-card tone-${card.tone}${card.onClick ? ' is-interactive' : ''}`
        const content = (
          <>
            <div className="friendly-metric-topline">
              <span>{card.label}</span>
              <span className={`metric-badge ${card.tone}`}>{card.badge}</span>
            </div>
            <strong>{card.value}</strong>
            {card.detail && <small className="friendly-metric-detail">{card.detail}</small>}
            <p className="sr-only">{card.helper}</p>
          </>
        )

        return card.onClick ? (
          <button
            className={className}
            key={card.label}
            type="button"
            title={card.helper}
            aria-haspopup="dialog"
            aria-label={`${card.label}: ${card.value}. Open breakdown`}
            onClick={card.onClick}
          >
            {content}
          </button>
        ) : (
          <article className={className} key={card.label} title={card.helper}>
            {content}
          </article>
        )
      })}
    </div>
  )
}
