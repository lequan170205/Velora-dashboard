import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchMonitoringContainers, fetchMonitoringOverview } from '../monitoring/api'
import type { Run } from './api'
import { appendSample, makeSample, type Sample } from './live'

const POLL_MS = 2000

/**
 * Samples the server (monitoring overview + container CPU) every couple of seconds while a run is active.
 * The samples stay after the run ends, until the next run starts, so the charts can be shown with the verdict.
 */
export function useLiveSeries(active: Run | null): { runId: string | null; series: Sample[] } {
  const live = Boolean(active)
  const overview = useQuery({ queryKey: ['stress', 'overview'], queryFn: ({ signal }) => fetchMonitoringOverview(signal), enabled: live, refetchInterval: live ? POLL_MS : false, gcTime: 0, retry: false })
  const containers = useQuery({ queryKey: ['stress', 'containers'], queryFn: ({ signal }) => fetchMonitoringContainers(signal), enabled: live, refetchInterval: live ? POLL_MS : false, gcTime: 0, retry: false })
  const [state, setState] = useState<{ runId: string | null; series: Sample[] }>({ runId: null, series: [] })
  const seen = useRef(0)
  useEffect(() => {
    if (!active || !overview.data || overview.dataUpdatedAt === seen.current) return
    seen.current = overview.dataUpdatedAt
    const elapsed = (overview.dataUpdatedAt - Date.parse(active.startedAt)) / 1000
    const sample = makeSample(elapsed, overview.data, containers.data)
    setState((current) => ({ runId: active.id, series: current.runId === active.id ? appendSample(current.series, sample) : [sample] }))
  }, [active, overview.data, overview.dataUpdatedAt, containers.data])
  return state
}
