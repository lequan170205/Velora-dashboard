import { useQuery } from '@tanstack/react-query'

import { fetchMonitoringHosts } from '../hosts/api'
import { MONITORING_REFRESH_INTERVAL_MS } from '../freshness'

/* One request carries every host, so the fleet tiles and the selected host's
   detail read the same snapshot and cost one backend batch per refresh. */
export function useHostsQuery(refreshIntervalMs = MONITORING_REFRESH_INTERVAL_MS) {
  return useQuery({
    queryKey: ['monitoring', 'hosts'],
    queryFn: async ({ signal }) => {
      try {
        return await fetchMonitoringHosts(signal)
      } catch {
        // One stable sentence; the retry keeps polling in the background.
        throw new Error('Unable to load server metrics')
      }
    },
    refetchInterval: refreshIntervalMs,
    staleTime: refreshIntervalMs,
    refetchIntervalInBackground: false,
    gcTime: 0,
  })
}
