import { useQuery } from '@tanstack/react-query'

import { fetchMonitoringOverview } from '../api'

const OVERVIEW_REFRESH_INTERVAL_MS = 15_000

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
    refetchInterval: OVERVIEW_REFRESH_INTERVAL_MS,
    refetchIntervalInBackground: false,
    gcTime: 0,
  })
}
