import { fetchApi } from '../../shared/api/client'

export type CallSummary = {
  attempts: number
  controlPlaneSuccessRate: number | null
  mediaReadySuccessRate: number | null
  timeToControlPlaneActiveMs: { p50: number | null; p95: number | null }
  timeToFirstRemoteAudioMs: { p50: number | null; p95: number | null }
  failures: Record<string, number>
  quality: {
    samples: number
    packetLossRate: number | null
    jitterMs: number | null
    roundTripTimeMs: number | null
    concealmentRate: number | null
    jitterBufferDelayMs: number | null
    badSampleRate: number | null
  }
}

export type CallTimelineEvent = {
  eventId: string
  attemptId: string
  role: string | null
  eventType: string
  stage: string
  outcome: string | null
  elapsedMs: number
  occurredAt: string
  platform: string
  appVersion: string
  osVersion: string | null
  direction: string | null
  errorCode: string | null
  metricsJson: Record<string, unknown> | null
}

export type RecentCallLeg = {
  callId: string
  attemptId: string
  role: string | null
  platform: string
  appVersion: string
  direction: string | null
  startedAt: string
  lastOccurredAt: string
  controlPlaneActive: boolean
  mediaReady: boolean
  failure: { stage: string; errorCode: string | null } | null
}

export type CallRangePreset = '15m' | '1h' | '6h' | '24h' | '7d' | 'custom'

export type CallTelemetryFilters = {
  range: CallRangePreset
  customFrom: string
  customTo: string
  platform: string
  osVersion: string
  appVersion: string
  direction: string
}

const RANGE_MS: Record<Exclude<CallRangePreset, 'custom'>, number> = {
  '15m': 15 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
}

export const toLocalDateTimeValue = (date: Date) => {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return shifted.toISOString().slice(0, 16)
}

export const defaultCallTelemetryFilters = (): CallTelemetryFilters => {
  const now = new Date()
  return {
    range: '1h',
    customFrom: toLocalDateTimeValue(new Date(now.getTime() - RANGE_MS['1h'])),
    customTo: toLocalDateTimeValue(now),
    platform: '',
    osVersion: '',
    appVersion: '',
    direction: '',
  }
}

export const isValidCallId = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim())

export const hasValidCustomRange = (filters: CallTelemetryFilters) => {
  if (filters.range !== 'custom') return true
  if (!filters.customFrom || !filters.customTo) return false

  const from = new Date(filters.customFrom)
  const to = new Date(filters.customTo)
  return Number.isFinite(from.getTime()) && Number.isFinite(to.getTime()) && from <= to
}

const resolveTelemetryWindow = (filters: CallTelemetryFilters, now = new Date()) => {
  if (filters.range === 'custom') {
    if (!hasValidCustomRange(filters)) throw new Error('Invalid custom call telemetry range')
    return {
      from: new Date(filters.customFrom).toISOString(),
      to: new Date(filters.customTo).toISOString(),
    }
  }

  return {
    from: new Date(now.getTime() - RANGE_MS[filters.range]).toISOString(),
    to: now.toISOString(),
  }
}

const telemetrySearch = (filters: CallTelemetryFilters) => {
  const window = resolveTelemetryWindow(filters)
  return new URLSearchParams({
    from: window.from,
    to: window.to,
    ...(filters.platform ? { platform: filters.platform } : {}),
    ...(filters.osVersion ? { osVersion: filters.osVersion } : {}),
    ...(filters.appVersion ? { appVersion: filters.appVersion } : {}),
    ...(filters.direction ? { direction: filters.direction } : {}),
  })
}

export const fetchCallSummary = async (filters: CallTelemetryFilters) => {
  const response = await fetchApi(`/calls/telemetry/summary?${telemetrySearch(filters)}`)
  if (!response.ok) throw new Error('Unable to load call telemetry')
  return (await response.json()) as CallSummary
}

export const fetchRecentCallLegs = async (filters: CallTelemetryFilters) => {
  const response = await fetchApi(`/calls/telemetry/calls?${telemetrySearch(filters)}`)
  if (!response.ok) throw new Error('Unable to load recent call legs')
  return (await response.json()) as RecentCallLeg[]
}

export const fetchCallTimeline = async (callId: string) => {
  const response = await fetchApi(`/calls/telemetry/calls/${encodeURIComponent(callId.trim())}`)
  if (!response.ok) throw new Error('Call telemetry was not found')
  return (await response.json()) as CallTimelineEvent[]
}

export const percent = (value: number | null) =>
  value === null ? '—' : `${(value * 100).toFixed(1)}%`

export const milliseconds = (value: number | null) =>
  value === null ? '—' : `${Math.round(value)} ms`

export const formatTimelineMetrics = (value: Record<string, unknown> | null) => {
  if (!value) return '—'
  const entries = Object.entries(value).filter(([, metric]) => metric !== null)
  if (entries.length === 0) return '—'

  return entries
    .map(([name, metric]) => {
      if (typeof metric === 'number') {
        return Number.isInteger(metric) ? `${name}: ${metric}` : `${name}: ${metric.toFixed(3)}`
      }
      return `${name}: ${JSON.stringify(metric)}`
    })
    .join(' · ')
}
