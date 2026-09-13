import { keepPreviousData, useQuery } from '@tanstack/react-query'

import {
  fetchCallSummary,
  fetchCallTimeline,
  fetchRecentCallLegs,
  type CallTelemetryFilters,
} from './api'

export function useCallSummaryQuery(filters: CallTelemetryFilters) {
  return useQuery({
    queryKey: ['calls', 'summary', filters],
    queryFn: () => fetchCallSummary(filters),
    placeholderData: keepPreviousData,
    gcTime: 0,
  })
}

export function useRecentCallsQuery(filters: CallTelemetryFilters) {
  return useQuery({
    queryKey: ['calls', 'recent', filters],
    queryFn: () => fetchRecentCallLegs(filters),
    placeholderData: keepPreviousData,
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
