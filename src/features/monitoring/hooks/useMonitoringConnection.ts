import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import { fetchMonitoringStatus } from '../api'
import {
  getMonitoringConnectionState,
  type MonitoringConnectionState,
} from '../freshness'

const STATUS_REFRESH_INTERVAL_MS = 15_000
const NOW_TICK_MS = 5_000

const useNow = (intervalMs: number): number => {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(timer)
  }, [intervalMs])

  return now
}

/* Connection state for the shell indicator. React Query keeps the last successful
   status on error, so the live/refreshing/stale/disconnected formula sees the same
   inputs as the previous heartbeat hook. */
export function useMonitoringConnection(): MonitoringConnectionState {
  const { dataUpdatedAt, isFetching, isError } = useQuery({
    queryKey: ['monitoring', 'status'],
    queryFn: ({ signal }) => fetchMonitoringStatus(signal),
    refetchInterval: STATUS_REFRESH_INTERVAL_MS,
    refetchIntervalInBackground: false,
    gcTime: 0,
  })

  const now = useNow(NOW_TICK_MS)

  return getMonitoringConnectionState({
    now,
    lastSuccessfulAt: dataUpdatedAt > 0 ? dataUpdatedAt : null,
    refreshing: isFetching,
    hasError: isError,
  })
}
