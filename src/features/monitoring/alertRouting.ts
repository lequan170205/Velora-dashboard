import type { MonitoringAlert } from './alertsApi'

export type AlertMetricView = 'server' | 'service' | 'conversation' | 'call-service'

/**
 * Prometheus alerts that aggregate over several series can lose their job label.
 * Infer the owning service from the alert name/summary so the investigation links
 * still land on a useful view instead of querying an "unknown" log stream.
 */
export const alertServiceForRouting = (alert: Pick<MonitoringAlert, 'service' | 'name' | 'summary'>) => {
  const service = alert.service.trim().toLowerCase()
  const context = `${alert.name} ${alert.summary}`.toLowerCase()
  const candidate = service === 'unknown' || service.length === 0 ? context : service

  if (candidate.includes('conversation')) return 'conversation-service'
  if (candidate.includes('call')) return 'call-service'
  if (candidate.includes('monitoring')) return 'monitoring-service'
  if (candidate.includes('node-exporter') || candidate.includes('host')) return 'node-exporter'
  if (candidate.includes('api-gateway') || candidate.includes('gateway')) return 'api-gateway'
  if (service === 'unknown' || service.length === 0) return 'all'
  return service
}

export const metricViewForAlert = (alert: Pick<MonitoringAlert, 'service' | 'name' | 'summary'>): AlertMetricView | null => {
  const service = alertServiceForRouting(alert)
  if (service === 'conversation-service') return 'conversation'
  if (service === 'call-service') return 'call-service'
  if (service === 'monitoring-service') return 'service'
  if (service === 'node-exporter') return 'server'
  return null
}
