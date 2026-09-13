import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'

import { fetchMonitoringLogs, type MonitoringLogLevel } from '../logsApi'

export type LogsRangeMinutes = 15 | 60 | 360 | 1440
export type LogsFilters = {
  service: string
  level: MonitoringLogLevel
  search: string
  rangeMinutes: LogsRangeMinutes
}
export type LogsPreset = Pick<LogsFilters, 'service' | 'level'>

const SEARCH_DEBOUNCE_MS = 400
const LIVE_REFRESH_INTERVAL_MS = 10_000
const LOG_LIMIT = 200

const defaultFilters = (): LogsFilters => ({
  service: 'all',
  level: 'all',
  search: '',
  rangeMinutes: 60,
})

/* Live tailing with a bounded query. Applied filters (search debounced + trimmed)
   drive the query key, so React Query keeps the previous result visible while a
   new filter combination loads — replacing the hand-rolled queryKey matching. */
export function useLogsQuery(preset?: LogsPreset | null) {
  const [filters, setFilters] = useState<LogsFilters>(defaultFilters)
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [live, setLive] = useState(true)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(filters.search.trim()), SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [filters.search])

  const presetKey = preset ? `${preset.service}|${preset.level}` : null
  useEffect(() => {
    if (!preset) return
    setFilters((prev) => ({ ...prev, service: preset.service, level: preset.level, search: '' }))
  }, [presetKey]) // preset identity only — filter edits must not re-trigger it

  const appliedFilters = useMemo<LogsFilters>(
    () => ({ ...filters, search: debouncedSearch }),
    [filters, debouncedSearch],
  )

  const query = useQuery({
    queryKey: ['monitoring', 'logs', appliedFilters],
    queryFn: ({ signal }) => {
      const to = new Date()
      const from = new Date(to.getTime() - appliedFilters.rangeMinutes * 60 * 1000)
      return fetchMonitoringLogs({
        service: appliedFilters.service,
        level: appliedFilters.level,
        search: appliedFilters.search,
        from: from.toISOString(),
        to: to.toISOString(),
        limit: LOG_LIMIT,
        signal,
      })
    },
    refetchInterval: live ? LIVE_REFRESH_INTERVAL_MS : false,
    refetchIntervalInBackground: false,
    placeholderData: keepPreviousData,
    gcTime: 0,
  })

  const hasUsableData = query.data !== undefined

  const updateFilter = <Key extends keyof LogsFilters>(key: Key, value: LogsFilters[Key]) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  return {
    filters,
    appliedFilters,
    updateFilter,
    response: query.data ?? null,
    entries: query.data?.entries ?? [],
    error: query.isError ? query.error.message : null,
    initialLoading: query.isPending,
    refreshing: query.isFetching && hasUsableData,
    hasUsableData,
    isStale: hasUsableData && query.isError,
    live,
    setLive,
    refreshNow: () => void query.refetch(),
  }
}
