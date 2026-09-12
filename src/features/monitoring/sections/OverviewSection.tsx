import type { CallSummary } from '../../calls/api'
import { HealthMatrix, HealthSummary, MetricCardGrid, MonitoringError } from '../components'
import { useAlertsView } from '../hooks/useAlertsView'
import type { MonitoringOverview } from '../api'
import { formatPercent, formatSeconds, type Tone } from '../formatters'
import type { HealthMatrixItem, HealthMatrixStatus } from '../components/HealthMatrix'
import { alertServiceForRouting } from '../alertRouting'

type ServiceView = 'server' | 'service' | 'conversation' | 'call-service' | 'call-quality'

type OverviewSectionProps = {
  overview: MonitoringOverview | null
  callSummary: CallSummary | null
  monitoringError?: string | null
  callError?: string | null
  onNavigate: (view: ServiceView | 'alerts') => void
  onOpenLogs: (service: string) => void
}

const statusFromUp = (up: boolean | null, warning = false): HealthMatrixStatus => {
  if (up === null) return 'unknown'
  if (!up) return 'offline'
  return warning ? 'warning' : 'healthy'
}

const hasHostWarning = (overview: MonitoringOverview) => {
  const host = overview.host
  return (
    (host.cpuUsageRatio ?? 0) >= 0.7 ||
    (host.memoryUsageRatio ?? 0) >= 0.75 ||
    (host.swapUsageRatio ?? 0) >= 0.25 ||
    (host.diskUsageRatio ?? 0) >= 0.8
  )
}

const hasMonitoringWarning = (overview: MonitoringOverview) => (
  (overview.rpc.errorRate ?? 0) >= 0.01 ||
  (overview.rpc.p95LatencySeconds ?? 0) >= 0.5 ||
  (overview.process.eventLoopP99Seconds ?? 0) >= 0.1
)

const hasConversationWarning = (overview: MonitoringOverview) => {
  const failureRate = (overview.conversation.errorRate ?? 0) + (overview.conversation.rejectRate ?? 0)
  return failureRate >= 0.01 || (overview.conversation.p95SendLatencySeconds ?? 0) >= 0.5
}

const hasCallWarning = (overview: MonitoringOverview) => (
  (overview.call.eventLoopP99Seconds ?? 0) >= 0.1
)

const callQualityStatus = (summary: CallSummary | null): HealthMatrixStatus => {
  if (!summary || summary.quality.samples === 0) return 'unknown'
  if (
    (summary.quality.badSampleRate ?? 0) >= 0.05 ||
    (summary.mediaReadySuccessRate ?? 1) < 0.95 ||
    (summary.controlPlaneSuccessRate ?? 1) < 0.95
  ) return 'warning'
  return 'healthy'
}

const callQualityDetail = (summary: CallSummary | null) => {
  if (!summary || summary.quality.samples === 0) return 'No client quality samples yet'
  return `${summary.quality.samples.toLocaleString()} samples · ${formatPercent(summary.quality.badSampleRate ?? Number.NaN, 1)} poor`
}

const statusDetail = (status: HealthMatrixStatus, healthy: string, warning: string) => {
  if (status === 'offline') return 'Target is unreachable'
  if (status === 'unknown') return 'No current sample'
  return status === 'warning' ? warning : healthy
}

const overallHealth = (
  items: readonly HealthMatrixItem[],
  criticalCount: number | null,
  warningCount: number | null,
): { tone: Tone; title: string; detail: string } => {
  if (items.some((item) => item.status === 'offline')) {
    return {
      tone: 'bad',
      title: 'The system needs attention',
      detail: 'At least one critical alert or core component is offline. Open the affected service or logs to investigate.',
    }
  }
  if (criticalCount !== null && criticalCount > 0) {
    return {
      tone: 'bad',
      title: 'The system needs attention',
      detail: 'At least one critical alert is active. Open the alert or related logs to investigate.',
    }
  }
  if ((warningCount !== null && warningCount > 0) || items.some((item) => item.status === 'warning')) {
    return {
      tone: 'warn',
      title: 'The system is online, but worth watching',
      detail: 'Core components are reachable, but one or more signals are above the normal operating range.',
    }
  }
  if (criticalCount === null || items.some((item) => item.status === 'unknown')) {
    return {
      tone: 'neutral',
      title: 'System status is partially available',
      detail: 'Some telemetry is still loading or is not being collected, so this page will not guess that everything is healthy.',
    }
  }
  return {
    tone: 'good',
    title: 'Core system looks healthy',
    detail: 'The monitored host and services are reachable and their primary signals are within the normal range.',
  }
}

export function OverviewSection({
  overview,
  callSummary,
  monitoringError = null,
  callError = null,
  onNavigate,
  onOpenLogs,
}: OverviewSectionProps) {
  const {
    alerts,
    counts,
    error: alertsError,
    initialLoading: alertsLoading,
    refreshing: alertsRefreshing,
  } = useAlertsView()
  const criticalCount = counts?.critical ?? null
  const warningCount = counts?.warning ?? null

  const host = overview?.host
  const monitoring = overview?.service
  const conversation = overview?.conversation
  const call = overview?.call

  const items: readonly HealthMatrixItem[] = [
    {
      name: 'Server host',
      status: overview ? statusFromUp(host?.up ?? null, hasHostWarning(overview)) : 'unknown',
      detail: overview
        ? statusDetail(
            statusFromUp(host?.up ?? null, hasHostWarning(overview)),
            `CPU ${formatPercent(host?.cpuUsageRatio ?? Number.NaN)} · RAM ${formatPercent(host?.memoryUsageRatio ?? Number.NaN)}`,
            `CPU ${formatPercent(host?.cpuUsageRatio ?? Number.NaN)} · disk ${formatPercent(host?.diskUsageRatio ?? Number.NaN)}`,
          )
        : 'Waiting for host metrics',
      actionLabel: 'Open metrics',
      onAction: () => onNavigate('server'),
    },
    {
      name: 'Monitoring service',
      status: overview ? statusFromUp(monitoring?.up ?? null, hasMonitoringWarning(overview)) : 'unknown',
      detail: overview
        ? statusDetail(
            statusFromUp(monitoring?.up ?? null, hasMonitoringWarning(overview)),
            `RPC ${formatPercent(1 - (overview.rpc.errorRate ?? Number.NaN), 1)} success`,
            `RPC ${formatPercent(overview.rpc.errorRate ?? Number.NaN, 1)} errors`,
          )
        : 'Waiting for service metrics',
      actionLabel: 'Open metrics',
      onAction: () => onNavigate('service'),
    },
    {
      name: 'Conversation service',
      status: overview ? statusFromUp(conversation?.up ?? null, hasConversationWarning(overview)) : 'unknown',
      detail: overview
        ? statusDetail(
            statusFromUp(conversation?.up ?? null, hasConversationWarning(overview)),
            `${formatPercent(conversation?.successRate ?? Number.NaN, 1)} message success`,
            `${formatPercent((conversation?.errorRate ?? 0) + (conversation?.rejectRate ?? 0), 1)} failed/rejected`,
          )
        : 'Waiting for service metrics',
      actionLabel: 'Open metrics',
      onAction: () => onNavigate('conversation'),
    },
    {
      name: 'Call service',
      status: overview ? statusFromUp(call?.up ?? null, hasCallWarning(overview)) : 'unknown',
      detail: overview
        ? statusDetail(
            statusFromUp(call?.up ?? null, hasCallWarning(overview)),
            `${formatSeconds(call?.eventLoopP99Seconds ?? Number.NaN)} event-loop p99`,
            `${formatSeconds(call?.eventLoopP99Seconds ?? Number.NaN)} event-loop p99`,
          )
        : 'Waiting for service metrics',
      actionLabel: 'Open metrics',
      onAction: () => onNavigate('call-service'),
    },
    {
      name: 'Call quality telemetry',
      status: callQualityStatus(callSummary),
      detail: callQualityDetail(callSummary),
      actionLabel: 'Open quality',
      onAction: () => onNavigate('call-quality'),
    },
  ]

  const health = overallHealth(items, criticalCount, warningCount)
  const quality = callSummary?.quality
  const cards = [
    {
      label: 'Critical alerts',
      value: counts ? String(counts.critical) : '—',
      helper: 'Active Prometheus alerts requiring attention.',
      badge: counts ? (counts.critical > 0 ? 'Investigate' : 'Clear') : 'Waiting',
      tone: counts ? (counts.critical > 0 ? 'bad' : 'good') : 'neutral',
    },
    {
      label: 'Firing alerts',
      value: counts ? String(counts.firing) : '—',
      helper: 'Rules that have met their firing duration.',
      badge: counts ? (counts.firing > 0 ? 'Active' : 'Clear') : 'Waiting',
      tone: counts ? (counts.firing > 0 ? 'warn' : 'good') : 'neutral',
    },
    {
      label: 'Call setup success',
      value: formatPercent(callSummary?.controlPlaneSuccessRate ?? Number.NaN, 1),
      helper: 'Default call telemetry range: last 24 hours.',
      badge: callSummary ? 'Last 24h' : 'Waiting',
      tone: callSummary ? ((callSummary.controlPlaneSuccessRate ?? 1) < 0.95 ? 'warn' : 'good') : 'neutral',
    },
    {
      label: 'Poor audio samples',
      value: formatPercent(quality?.badSampleRate ?? Number.NaN, 1),
      helper: 'Client-reported samples classified as poor.',
      badge: quality ? 'Last 24h' : 'Waiting',
      tone: quality ? ((quality.badSampleRate ?? 0) >= 0.05 ? 'warn' : 'good') : 'neutral',
    },
  ] as const

  return (
    <section className="overview-section dashboard-view" aria-labelledby="overview-title" aria-busy={!overview || alertsLoading}>
      <div className="overview-heading">
        <div>
          <p className="eyebrow">Operations overview</p>
          <h2 id="overview-title">Is Velora healthy right now?</h2>
          <p className="section-description">A quick read of the host, core services, active alerts, and client call experience.</p>
        </div>
        <button className="secondary-button" type="button" onClick={() => onNavigate('alerts')}>
          {alertsRefreshing ? 'Refreshing alerts…' : 'View active alerts'}
        </button>
      </div>

      <MonitoringError error={monitoringError} title="Core monitoring data is temporarily unavailable." hasData={overview !== null} />
      {callError && (
        <div className="dashboard-alert" role="alert">
          <strong>Call telemetry is temporarily unavailable.</strong>
          <span>{callError}</span>
        </div>
      )}
      {alertsError && (
        <div className="dashboard-alert" role="alert">
          <strong>Alert state is temporarily unavailable.</strong>
          <span>{alertsError}</span>
        </div>
      )}

      <HealthSummary
        tone={health.tone}
        label="System status"
        title={health.title}
        detail={health.detail}
        generatedAt={overview?.generatedAt}
        refreshing={!overview || alertsLoading || alertsRefreshing}
      />

      <MetricCardGrid cards={cards} refreshing={alertsLoading} className="overview-card-grid" />

      <HealthMatrix
        items={items}
        footer={
          <>
            <span>{counts ? `${counts.total} active alerts · ${alerts.length} alert records` : 'Waiting for alert state'}</span>
            <button className="text-button" type="button" onClick={() => onOpenLogs('all')}>Open all service logs</button>
          </>
        }
      />

      <section className="dashboard-panel overview-alert-panel" aria-labelledby="overview-alerts-title">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Needs attention</p>
            <h2 id="overview-alerts-title">Active alert summary</h2>
          </div>
          <button className="text-button" type="button" onClick={() => onNavigate('alerts')}>See all alerts</button>
        </div>
        {alertsLoading && alerts.length === 0 ? (
          <p className="overview-muted">Loading current Prometheus rule state…</p>
        ) : alerts.length === 0 ? (
          <p className="overview-clear"><span aria-hidden="true">✓</span>No active alerts. Core rule state is clear.</p>
        ) : (
          <div className="overview-alert-list">
            {alerts.slice(0, 4).map((alert) => (
              <div className="overview-alert-row" key={`${alert.name}:${alert.activeAt ?? 'unknown'}:${alert.service}`}>
                <span className={`alert-severity severity-${alert.severity}`}>{alert.severity}</span>
                <strong>{alert.summary}</strong>
                <span className="overview-alert-service">{alert.service === 'unknown' ? alertServiceForRouting(alert) : alert.service}</span>
                <button className="table-action" type="button" onClick={() => onOpenLogs(alertServiceForRouting(alert))}>View logs</button>
              </div>
            ))}
          </div>
        )}
      </section>
    </section>
  )
}
