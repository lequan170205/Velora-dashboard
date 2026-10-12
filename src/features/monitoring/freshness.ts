import type { HealthVm } from './dashboard/types'

export type MonitoringConnectionState = 'live' | 'refreshing' | 'degraded' | 'unknown' | 'stale' | 'disconnected'
export type MonitoringHistoryFreshnessState = 'fresh' | 'stale' | 'unknown'

export const MONITORING_REFRESH_INTERVAL_MS = 5_000
export const HISTORY_REFRESH_INTERVAL_MS = 10_000

export const getMonitoringConnectionState = ({
  now,
  lastSuccessfulAt,
  refreshing,
  hasError,
  monitoringUp,
  hostUp,
}: {
  now: number
  lastSuccessfulAt: number | null
  refreshing: boolean
  hasError: boolean
  monitoringUp?: boolean | null
  hostUp?: boolean | null
}): MonitoringConnectionState => {
  if (lastSuccessfulAt === null) {
    if (hasError) return 'disconnected'
    if (monitoringUp === false || hostUp === false) return 'degraded'
    if (monitoringUp !== undefined || hostUp !== undefined) {
      return monitoringUp === true && hostUp === true ? 'refreshing' : 'unknown'
    }
    return 'refreshing'
  }

  const ageMs = now - lastSuccessfulAt

  if (hasError && ageMs > MONITORING_REFRESH_INTERVAL_MS * 6) {
    return 'disconnected'
  }

  if (ageMs > MONITORING_REFRESH_INTERVAL_MS * 3) {
    return 'stale'
  }

  if (hasError) return 'stale'
  if (monitoringUp === false || hostUp === false) return 'degraded'
  if (monitoringUp !== true || hostUp !== true) return 'unknown'

  if (refreshing) {
    return 'refreshing'
  }

  return 'live'
}

export const getMonitoringOverviewHealth = ({
  health, now, generatedAt, lastSuccessfulAt, hasError,
}: {
  health: HealthVm
  now: number
  generatedAt: string | undefined
  lastSuccessfulAt: number
  hasError: boolean
}): HealthVm => {
  const generatedTime = generatedAt ? Date.parse(generatedAt) : Number.NaN
  if (hasError || now - lastSuccessfulAt > MONITORING_REFRESH_INTERVAL_MS * 3 ||
      (Number.isFinite(generatedTime) && now - generatedTime > MONITORING_REFRESH_INTERVAL_MS * 3)) {
    return { tone: 'warn', label: 'Stale', title: 'Health evidence is stale', detail: `Showing the last available snapshot. Previous summary: ${health.title}. Refresh to confirm current health.` }
  }
  if (!Number.isFinite(generatedTime)) {
    return { tone: 'neutral', label: 'Unknown', title: 'Health freshness is unknown', detail: 'The overview has no usable generation timestamp.' }
  }
  return health
}

export const getMonitoringHistoryFreshnessState = ({
  now,
  lastSampleAt,
  sampleStepMs,
  hasError,
}: {
  now: number
  lastSampleAt: number
  sampleStepMs: number | null
  hasError: boolean
}): MonitoringHistoryFreshnessState => {
  if (hasError) return 'stale'

  if (sampleStepMs === null || !Number.isFinite(sampleStepMs) || sampleStepMs <= 0) {
    return 'unknown'
  }

  const ageMs = Math.max(0, now - lastSampleAt)
  const staleAfterMs = Math.max(HISTORY_REFRESH_INTERVAL_MS * 2, sampleStepMs * 2)
  return ageMs > staleAfterMs ? 'stale' : 'fresh'
}

export const formatMonitoringAge = (now: number, timestamp: number) => {
  const ageMs = Math.max(0, now - timestamp)
  const seconds = Math.floor(ageMs / 1000)

  if (seconds < 5) return 'just now'
  if (seconds < 60) return `${seconds}s ago`

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  return `${Math.floor(hours / 24)}d ago`
}
