import { useQuery } from '@tanstack/react-query'

import { fetchMonitoringAlerts } from '../alertsApi'
import { MONITORING_REFRESH_INTERVAL_MS } from '../freshness'

export function useAlertsQuery() {
  const query = useQuery({
    queryKey: ['monitoring', 'alerts'],
    queryFn: ({ signal }) => fetchMonitoringAlerts(signal),
    refetchInterval: MONITORING_REFRESH_INTERVAL_MS,
    staleTime: MONITORING_REFRESH_INTERVAL_MS,
    refetchIntervalInBackground: false,
    gcTime: 0,
  })

  const hasUsableData = query.data !== undefined

  return {
    response: query.data ?? null,
    alerts: query.data?.alerts ?? [],
    counts: query.data?.counts ?? null,
    error: query.isError ? query.error.message : null,
    initialLoading: query.isPending,
    refreshing: query.isFetching && hasUsableData,
    hasUsableData,
    isStale: hasUsableData && query.isError,
    refreshNow: () => void query.refetch(),
  }
}
