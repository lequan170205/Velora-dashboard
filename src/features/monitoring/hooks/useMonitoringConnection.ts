import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import { fetchMonitoringStatus } from '../api'
import {
  getMonitoringConnectionState,
  MONITORING_REFRESH_INTERVAL_MS,
  type MonitoringConnectionState,
} from '../freshness'

const NOW_TICK_MS = 5_000

const useNow = (intervalMs: number): number => {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(timer)
  }, [intervalMs])

  return now
}

/* Retain the last status on polling errors, but mark its evidence stale. */
export function useMonitoringConnection(): MonitoringConnectionState {
  const { data, dataUpdatedAt, isFetching, isError } = useQuery({
    queryKey: ['monitoring', 'status'],
    queryFn: ({ signal }) => fetchMonitoringStatus(signal),
    refetchInterval: MONITORING_REFRESH_INTERVAL_MS,
    staleTime: MONITORING_REFRESH_INTERVAL_MS,
    refetchIntervalInBackground: false,
    gcTime: 0,
  })

  const now = useNow(NOW_TICK_MS)

  return getMonitoringConnectionState({
    now,
    lastSuccessfulAt: dataUpdatedAt > 0 ? dataUpdatedAt : null,
    refreshing: isFetching,
    hasError: isError,
    monitoringUp: data?.monitoringUp,
    hostUp: data?.hostUp,
  })
}
