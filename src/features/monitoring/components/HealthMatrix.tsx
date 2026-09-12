import type { ReactNode } from 'react'

export type HealthMatrixStatus = 'healthy' | 'warning' | 'offline' | 'unknown'

export type HealthMatrixItem = {
  name: string
  status: HealthMatrixStatus
  detail: string
  actionLabel?: string
  onAction?: () => void
}

type HealthMatrixProps = {
  items: readonly HealthMatrixItem[]
  footer?: ReactNode
}

const STATUS_LABELS: Record<HealthMatrixStatus, string> = {
  healthy: 'Healthy',
  warning: 'Warning',
  offline: 'Offline',
  unknown: 'Not monitored',
}

export function HealthMatrix({ items, footer }: HealthMatrixProps) {
  return (
    <section className="dashboard-panel health-matrix-panel" aria-labelledby="health-matrix-title">
      <div className="panel-heading health-matrix-heading">
        <div>
          <p className="eyebrow">System map</p>
          <h2 id="health-matrix-title">Core health</h2>
        </div>
        <span className="section-meta">{items.length} components</span>
      </div>

      <div className="health-matrix" role="table" aria-label="Core system health">
        {items.map((item) => (
          <div className="health-matrix-row" role="row" key={item.name}>
            <div className="health-matrix-service" role="cell">
              <span className={`health-status-dot ${item.status}`} aria-hidden="true" />
              <strong>{item.name}</strong>
            </div>
            <span className={`health-matrix-status ${item.status}`} role="cell">
              {STATUS_LABELS[item.status]}
            </span>
            <span className="health-matrix-detail" role="cell">{item.detail}</span>
            <div className="health-matrix-action-cell" role="cell">
              {item.onAction && item.actionLabel ? (
                <button className="table-action health-matrix-action" type="button" onClick={item.onAction}>
                  {item.actionLabel}
                </button>
              ) : (
                <span className="health-matrix-action-placeholder" aria-hidden="true" />
              )}
            </div>
          </div>
        ))}
      </div>

      {footer && <div className="health-matrix-footer">{footer}</div>}
    </section>
  )
}
