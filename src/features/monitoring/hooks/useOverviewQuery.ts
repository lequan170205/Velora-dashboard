import { useQuery } from '@tanstack/react-query'

import { fetchMonitoringOverview } from '../api'
import { MONITORING_REFRESH_INTERVAL_MS } from '../freshness'

export function useOverviewQuery(errorMessage: string) {
  return useQuery({
    queryKey: ['monitoring', 'overview'],
    queryFn: async ({ signal }) => {
      try {
        return await fetchMonitoringOverview(signal)
      } catch {
        // Views surface one stable sentence; the retry keeps polling in the background.
        throw new Error(errorMessage)
      }
    },
    refetchInterval: MONITORING_REFRESH_INTERVAL_MS,
    staleTime: MONITORING_REFRESH_INTERVAL_MS,
    refetchIntervalInBackground: false,
    gcTime: 0,
  })
}
