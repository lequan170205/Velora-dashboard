import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import type { MonitoringPoint } from '../api'
import { fetchHostsHistory, type HostsHistoryMetric } from '../hosts/api'

const SPARKLINE_REFRESH_MS = 30_000
const SPARKLINE_WINDOW_MS = 15 * 60_000
const SPARKLINE_STEP_SECONDS = 30

/* One grouped query returns a series per host, so sparklines for the whole
   fleet cost a single request every 30 seconds. */
export function useHostsHistoryQuery(metric: HostsHistoryMetric, enabled: boolean) {
  const query = useQuery({
    queryKey: ['monitoring', 'hosts', 'history', metric],
    queryFn: ({ signal }) => {
      const to = new Date()
      const from = new Date(to.getTime() - SPARKLINE_WINDOW_MS)
      return fetchHostsHistory({
        metric,
        from: from.toISOString(),
        to: to.toISOString(),
        stepSeconds: SPARKLINE_STEP_SECONDS,
        signal,
      })
    },
    refetchInterval: SPARKLINE_REFRESH_MS,
    refetchIntervalInBackground: false,
    staleTime: SPARKLINE_REFRESH_MS,
    placeholderData: (previous) => previous,
    gcTime: 0,
    enabled,
  })

  const byHost = useMemo(
    () => new Map<string, MonitoringPoint[]>((query.data?.series ?? []).map((item) => [item.host, item.points])),
    [query.data],
  )

  return { byHost, isError: query.isError }
}
