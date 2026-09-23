import { keepPreviousData, useQuery } from '@tanstack/react-query'

import {
  fetchCallSummary,
  fetchCallTimeline,
  fetchRecentCallLegs,
  type CallTelemetryFilters,
} from './api'

const CALL_TELEMETRY_REFRESH_INTERVAL_MS = 15_000

export function useCallSummaryQuery(filters: CallTelemetryFilters) {
  return useQuery({
    queryKey: ['calls', 'summary', filters],
    queryFn: () => fetchCallSummary(filters),
    placeholderData: keepPreviousData,
    refetchInterval: CALL_TELEMETRY_REFRESH_INTERVAL_MS,
    refetchIntervalInBackground: false,
    gcTime: 0,
  })
}

export function useRecentCallsQuery(filters: CallTelemetryFilters) {
  return useQuery({
    queryKey: ['calls', 'recent', filters],
    queryFn: () => fetchRecentCallLegs(filters),
    placeholderData: keepPreviousData,
    refetchInterval: CALL_TELEMETRY_REFRESH_INTERVAL_MS,
    refetchIntervalInBackground: false,
    gcTime: 0,
  })
}

export function useCallTimelineQuery(callId: string) {
  return useQuery({
    queryKey: ['calls', 'timeline', callId],
    queryFn: () => fetchCallTimeline(callId),
    enabled: callId.trim().length > 0,
    gcTime: 0,
  })
}
