import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  fetchMonitoringLogs,
  type MonitoringLogLevel,
  type MonitoringLogsResponse,
} from '../logsApi'

export type LogsRangeMinutes = 15 | 60 | 360 | 1440

export type LogsFilters = {
  service: string
  level: MonitoringLogLevel
  search: string
  rangeMinutes: LogsRangeMinutes
}

export type LogsPreset = Pick<LogsFilters, 'service' | 'level'>

const DEFAULT_FILTERS: LogsFilters = {
  service: 'all',
  level: 'all',
  search: '',
  rangeMinutes: 60,
}

const AUTO_REFRESH_INTERVAL_MS = 10_000
const SEARCH_DEBOUNCE_MS = 400

type LogsResponseState = {
  queryKey: string
  response: MonitoringLogsResponse
}

type LogsRequestState = {
  queryKey: string
  status: 'loading' | 'success' | 'error'
  background: boolean
  error?: string
}

export const createLogsQueryKey = (filters: LogsFilters) => JSON.stringify({
  service: filters.service,
  level: filters.level,
  search: filters.search.trim(),
  rangeMinutes: filters.rangeMinutes,
})

export function useLogsView(preset?: LogsPreset | null) {
  const [filters, setFilters] = useState<LogsFilters>(() => (
    preset ? { ...DEFAULT_FILTERS, ...preset } : DEFAULT_FILTERS
  ))
  const [debouncedSearch, setDebouncedSearch] = useState(DEFAULT_FILTERS.search)
  const [responseState, setResponseState] = useState<LogsResponseState | null>(null)
  const [requestState, setRequestState] = useState<LogsRequestState | null>(null)
  const [live, setLive] = useState(true)
  const requestIdRef = useRef(0)
  const abortControllerRef = useRef<AbortController | null>(null)

  const effectiveFilters = useMemo<LogsFilters>(
    () => ({
      service: filters.service,
      level: filters.level,
      search: debouncedSearch,
      rangeMinutes: filters.rangeMinutes,
    }),
    [debouncedSearch, filters.level, filters.rangeMinutes, filters.service],
  )

  const activeQueryKey = useMemo(
    () => createLogsQueryKey(effectiveFilters),
    [effectiveFilters],
  )

  const load = useCallback(async (nextFilters: LogsFilters, background = false) => {
    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller
    const requestId = ++requestIdRef.current
    const queryKey = createLogsQueryKey(nextFilters)
    setRequestState({ queryKey, status: 'loading', background })

    const to = new Date()
    const from = new Date(to.getTime() - nextFilters.rangeMinutes * 60_000)

    try {
      const next = await fetchMonitoringLogs({
        service: nextFilters.service,
        level: nextFilters.level,
        search: nextFilters.search.trim(),
        from: from.toISOString(),
        to: to.toISOString(),
        limit: 200,
        signal: controller.signal,
      })

      if (requestId !== requestIdRef.current) return
      setResponseState({ queryKey, response: next })
      setRequestState({ queryKey, status: 'success', background: false })
    } catch (cause) {
      if (requestId !== requestIdRef.current) return
      if (cause instanceof Error && cause.name === 'AbortError') return
      setRequestState({
        queryKey,
        status: 'error',
        background,
        error: cause instanceof Error ? cause.message : 'Unable to load service logs',
      })
    } finally {
      if (requestId !== requestIdRef.current) return
      if (abortControllerRef.current === controller) abortControllerRef.current = null
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(filters.search.trim())
    }, SEARCH_DEBOUNCE_MS)

    return () => window.clearTimeout(timer)
  }, [filters.search])

  useEffect(() => {
    if (!preset) return
    setFilters((current) => ({ ...current, service: preset.service, level: preset.level }))
    setDebouncedSearch('')
  }, [preset?.level, preset?.service])

  useEffect(() => {
    void load(effectiveFilters)
  }, [effectiveFilters, load])

  useEffect(() => {
    if (!live) return

    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void load(effectiveFilters, true)
      }
    }, AUTO_REFRESH_INTERVAL_MS)

    return () => window.clearInterval(timer)
  }, [effectiveFilters, live, load])

  useEffect(() => {
    const handleVisibility = () => {
      if (live && document.visibilityState === 'visible') {
        void load(effectiveFilters, true)
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [effectiveFilters, live, load])

  useEffect(() => () => {
    requestIdRef.current += 1
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
  }, [])

  const updateFilter = <K extends keyof LogsFilters>(key: K, value: LogsFilters[K]) => {
    setFilters((current) => ({ ...current, [key]: value }))
  }

  const refreshNow = () => load(effectiveFilters, true)

  const response = responseState?.queryKey === activeQueryKey ? responseState.response : null
  const request = requestState?.queryKey === activeQueryKey ? requestState : null
  const hasUsableData = response !== null
  const initialLoading = !hasUsableData && (!request || request.status === 'loading')
  const refreshing = request?.status === 'loading' && request.background
  const error = request?.status === 'error' ? request.error ?? 'Unable to load service logs' : null
  const isStale = hasUsableData && request?.status === 'error'

  return {
    filters,
    appliedFilters: effectiveFilters,
    updateFilter,
    response,
    entries: response?.entries ?? [],
    error,
    initialLoading,
    refreshing,
    hasUsableData,
    isStale,
    live,
    setLive,
    refreshNow,
  }
}
