import { useQuery } from '@tanstack/react-query'

import { fetchMonitoringAlerts } from '../alertsApi'

const ALERTS_REFRESH_INTERVAL_MS = 15_000

export function useAlertsQuery() {
  const query = useQuery({
    queryKey: ['monitoring', 'alerts'],
    queryFn: ({ signal }) => fetchMonitoringAlerts(signal),
    refetchInterval: ALERTS_REFRESH_INTERVAL_MS,
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
