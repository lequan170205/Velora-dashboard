export type MonitoringConnectionState = 'live' | 'refreshing' | 'stale' | 'disconnected'
export type MonitoringHistoryFreshnessState = 'fresh' | 'stale' | 'unknown'

export const HISTORY_REFRESH_INTERVAL_MS = 60_000

export const getMonitoringConnectionState = ({
  now,
  lastSuccessfulAt,
  refreshing,
  hasError,
}: {
  now: number
  lastSuccessfulAt: number | null
  refreshing: boolean
  hasError: boolean
}): MonitoringConnectionState => {
  if (lastSuccessfulAt === null) {
    return hasError ? 'disconnected' : 'refreshing'
  }

  const ageMs = now - lastSuccessfulAt

  if (hasError && ageMs > 90_000) {
    return 'disconnected'
  }

  if (ageMs > 30_000) {
    return 'stale'
  }

  if (refreshing) {
    return 'refreshing'
  }

  return 'live'
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
