import type { MonitoringAlert } from './alertsApi'

export type AlertMetricView =
  | 'server'
  | 'service'
  | 'conversation'
  | 'call-service'
  | 'notification-service'
  | 'auth-service'
  | 'user-service'
  | 'reels'

type AlertRoutingInput = Pick<MonitoringAlert, 'service' | 'name' | 'summary'> & {
  labels?: Record<string, string>
}

export const REEL_WORKER_LOG_SERVICES = [
  'media-processing-service',
  'media-processing-long-service',
  'reel-indexing-service',
  'reel-indexing-long-service',
] as const

const isReelWorkerService = (service: string) =>
  (REEL_WORKER_LOG_SERVICES as readonly string[]).includes(service)

/**
 * Prometheus alerts that aggregate over several series can lose their job label.
 * Infer the owning service from the alert name/summary so the investigation links
 * still land on a useful view instead of querying an "unknown" log stream.
 */
export const alertServiceForRouting = (
  alert: Pick<MonitoringAlert, 'service' | 'name' | 'summary'>,
) => {
  const service = alert.service.trim().toLowerCase()
  const context = `${alert.name} ${alert.summary}`.toLowerCase()
  const candidate = service === 'unknown' || service.length === 0 ? context : service

  if (isReelWorkerService(service) || service === 'reel-pipeline' || service === 'rabbitmq') return service
  if (candidate.includes('conversation')) return 'conversation-service'
  if (candidate.includes('call')) return 'call-service'
  if (candidate.includes('notification')) return 'notification-service'
  if (candidate.includes('auth-service') || candidate.includes('auth')) return 'auth-service'
  if (candidate.includes('user-service') || candidate.includes('user service')) return 'user-service'
  if (candidate.includes('ai-service') || candidate.includes('rag')) return 'ai-service'
  if (candidate.includes('content-service')) return 'content-service'
  if (candidate.includes('reel')) return 'content-service'
  if (candidate.includes('monitoring')) return 'monitoring-service'
  if (candidate.includes('node-exporter') || candidate.includes('host')) return 'node-exporter'
  if (candidate.includes('api-gateway') || candidate.includes('gateway')) return 'api-gateway'
  if (service === 'unknown' || service.length === 0) return 'all'
  return service
}

export const metricViewForAlert = (
  alert: Pick<MonitoringAlert, 'service' | 'name' | 'summary'>,
): AlertMetricView | null => {
  const service = alertServiceForRouting(alert)
  const context = `${service} ${alert.name} ${alert.summary}`.toLowerCase()

  if (service === 'conversation-service') return 'conversation'
  if (service === 'call-service') return 'call-service'
  if (service === 'notification-service') return 'notification-service'
  if (service === 'auth-service') return 'auth-service'
  if (service === 'user-service') return 'user-service'
  if (service === 'ai-service') return null
  if (
    isReelWorkerService(service) ||
    service === 'reel-pipeline' ||
    (service === 'rabbitmq' && context.includes('reel')) ||
    context.includes('reel pipeline') ||
    service === 'content-service'
  ) return 'reels'
  if (service === 'monitoring-service') return 'service'
  if (service === 'node-exporter') return 'server'
  return null
}

const longLane = (alert: AlertRoutingInput) =>
  `${alert.labels?.lane ?? ''} ${alert.labels?.worker ?? ''} ${alert.labels?.queue ?? ''}`.toLowerCase().includes('long')

const shortLane = (alert: AlertRoutingInput) =>
  `${alert.labels?.lane ?? ''} ${alert.labels?.worker ?? ''} ${alert.labels?.queue ?? ''}`.toLowerCase().includes('short')

/** Preserve the exact worker selector, including the SHORT/LONG service label. */
export const logServiceForAlert = (alert: AlertRoutingInput) => {
  const service = alert.service.trim().toLowerCase()
  const context = `${alert.name} ${alert.summary}`.toLowerCase()
  const isLong = longLane(alert)
  const isShort = shortLane(alert)
  const pipeline = alert.labels?.pipeline?.toLowerCase() ?? ''

  if (service === 'media-processing-long-service' || service === 'reel-indexing-long-service') return service
  if (service === 'media-processing-service') return isLong ? 'media-processing-long-service' : service
  if (service === 'reel-indexing-service') return isLong ? 'reel-indexing-long-service' : service
  if (service === 'reel-pipeline') {
    if (pipeline.includes('media')) {
      if (isLong) return 'media-processing-long-service'
      if (isShort) return 'media-processing-service'
      return 'all'
    }
    if (pipeline.includes('index')) {
      if (isLong) return 'reel-indexing-long-service'
      if (isShort) return 'reel-indexing-service'
      return 'all'
    }
    return 'all'
  }
  if (service === 'rabbitmq' && context.includes('reel')) return 'rabbitmq'
  if (service === 'unknown' || service.length === 0) {
    if (context.includes('media')) return isLong ? 'media-processing-long-service' : 'media-processing-service'
    if (context.includes('index')) return isLong ? 'reel-indexing-long-service' : 'reel-indexing-service'
  }
  return alertServiceForRouting(alert)
}

export const logActionLabel = (service: string) => {
  if (service === 'ai-service') return 'View AI logs'
  if (service.startsWith('media-processing')) return 'View media logs'
  if (service.startsWith('reel-indexing')) return 'View indexing logs'
  return 'View logs'
}

export const normalizePublicOrigin = (value: string | undefined) => {
  const candidate = value?.trim()
  if (!candidate) return null

  try {
    const url = new URL(candidate)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) return null
    return url.href.replace(/\/+$/, '')
  } catch {
    return null
  }
}

export const langfuseInvestigationUrl = normalizePublicOrigin(import.meta.env?.VITE_LANGFUSE_ORIGIN)
