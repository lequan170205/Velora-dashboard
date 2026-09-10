import { formatMonitoringAge } from '../fresshness'
import type { Tone } from '../formatters'

type HealthSummaryProps = {
  tone: Tone
  label: string
  title: string
  detail: string
  generatedAt?: string
  refreshing?: boolean
}

export function HealthSummary({
  tone,
  label,
  title,
  detail,
  generatedAt,
  refreshing = false,
}: HealthSummaryProps) {
  const icon = tone === 'good' ? '✓' : tone === 'warn' || tone === 'bad' ? '!' : '…'
  const generatedAtTimestamp = generatedAt ? new Date(generatedAt).getTime() : Number.NaN
  const hasGeneratedAt = Number.isFinite(generatedAtTimestamp)
  const generatedAtLabel = hasGeneratedAt
    ? formatMonitoringAge(Date.now(), generatedAtTimestamp)
    : 'Waiting'

  return (
    <div className={`health-summary ${tone}`}>
      <div className="health-summary-icon" aria-hidden="true">{icon}</div>
      <div className="health-summary-copy">
        <span>{label}</span>
        <strong>{title}</strong>
        <p>{detail}</p>
      </div>
      <div className="health-summary-time">
        <span>{refreshing ? 'Refreshing' : 'Overview updated'}</span>
        <strong
          title={hasGeneratedAt ? new Date(generatedAtTimestamp).toLocaleString() : undefined}
        >
          {refreshing ? 'Updating…' : generatedAtLabel}
        </strong>
      </div>
    </div>
  )
}
