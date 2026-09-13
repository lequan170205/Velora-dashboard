import { useQuery } from '@tanstack/react-query'

import { fetchMonitoringContainers } from '../api'

const CONTAINERS_REFRESH_INTERVAL_MS = 15_000

export function useContainerResourcesQuery(enabled = true) {
  return useQuery({
    queryKey: ['monitoring', 'containers'],
    queryFn: ({ signal }) => fetchMonitoringContainers(signal),
    refetchInterval: CONTAINERS_REFRESH_INTERVAL_MS,
    refetchIntervalInBackground: false,
    enabled,
    gcTime: 0,
  })
}
