import { useQuery } from '@tanstack/react-query'

import { fetchMonitoringContainers } from '../api'
import { MONITORING_REFRESH_INTERVAL_MS } from '../freshness'

export function useContainerResourcesQuery(enabled = true) {
  return useQuery({
    queryKey: ['monitoring', 'containers'],
    queryFn: ({ signal }) => fetchMonitoringContainers(signal),
    refetchInterval: MONITORING_REFRESH_INTERVAL_MS,
    staleTime: MONITORING_REFRESH_INTERVAL_MS,
    refetchIntervalInBackground: false,
    enabled,
    gcTime: 0,
  })
}
