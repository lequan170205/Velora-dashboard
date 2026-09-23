import { keepPreviousData, useQuery } from '@tanstack/react-query'

import {
  fetchCallSummary,
  fetchCallTimeline,
  fetchRecentCallLegs,
  isValidCallId,
  type CallTelemetryFilters,
} from './api'

const CALL_TELEMETRY_REFRESH_INTERVAL_MS = 15_000

const refreshIntervalFor = (filters: CallTelemetryFilters) =>
  filters.range === 'custom' ? false : CALL_TELEMETRY_REFRESH_INTERVAL_MS

export function useCallSummaryQuery(filters: CallTelemetryFilters) {
  return useQuery({
    queryKey: ['calls', 'summary', filters],
    queryFn: () => fetchCallSummary(filters),
    placeholderData: keepPreviousData,
    refetchInterval: refreshIntervalFor(filters),
    refetchIntervalInBackground: false,
    staleTime: 10_000,
    gcTime: 5 * 60_000,
  })
}

export function useRecentCallsQuery(filters: CallTelemetryFilters) {
  return useQuery({
    queryKey: ['calls', 'recent', filters],
    queryFn: () => fetchRecentCallLegs(filters),
    placeholderData: keepPreviousData,
    refetchInterval: refreshIntervalFor(filters),
    refetchIntervalInBackground: false,
    staleTime: 10_000,
    gcTime: 5 * 60_000,
  })
}

export function useCallTimelineQuery(callId: string) {
  return useQuery({
    queryKey: ['calls', 'timeline', callId],
    queryFn: () => fetchCallTimeline(callId),
    enabled: isValidCallId(callId),
    gcTime: 5 * 60_000,
  })
}
