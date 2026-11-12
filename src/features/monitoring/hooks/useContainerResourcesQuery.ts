import { useQuery } from '@tanstack/react-query'

import { fetchMonitoringContainers } from '../api'
import { MONITORING_REFRESH_INTERVAL_MS } from '../freshness'

/* Container resources are read from Docker on demand, per host, so the query
   only runs while a breakdown dialog is open. */
export function useContainerResourcesQuery(host: string | null, enabled = true) {
  return useQuery({
    queryKey: ['monitoring', 'containers', host],
    queryFn: ({ signal }) => fetchMonitoringContainers({ host: host ?? undefined, signal }),
    refetchInterval: MONITORING_REFRESH_INTERVAL_MS,
    staleTime: MONITORING_REFRESH_INTERVAL_MS,
    refetchIntervalInBackground: false,
    enabled: enabled && host !== null,
    gcTime: 0,
  })
}
