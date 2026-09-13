import { useCallback, useEffect, useRef, useState } from 'react'

import {
  fetchMonitoringAlerts,
  type MonitoringAlertsResponse,
} from '../alertsApi'

const AUTO_REFRESH_INTERVAL_MS = 15_000

type AlertsRequestState = {
  status: 'loading' | 'success' | 'error'
  background: boolean
  error?: string
}

export function useAlertsView() {
  const [response, setResponse] = useState<MonitoringAlertsResponse | null>(null)
  const [requestState, setRequestState] = useState<AlertsRequestState | null>(null)
  const requestIdRef = useRef(0)
  const abortControllerRef = useRef<AbortController | null>(null)

  const load = useCallback(async (background = false) => {
    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller
    const requestId = ++requestIdRef.current
    setRequestState({ status: 'loading', background })

    try {
      const next = await fetchMonitoringAlerts(controller.signal)
      if (requestId !== requestIdRef.current) return
      setResponse(next)
      setRequestState({ status: 'success', background: false })
    } catch (cause) {
      if (requestId !== requestIdRef.current) return
      if (cause instanceof Error && cause.name === 'AbortError') return
      setRequestState({
        status: 'error',
        background,
        error: cause instanceof Error ? cause.message : 'Unable to load active alerts',
      })
    } finally {
      if (requestId !== requestIdRef.current) return
      if (abortControllerRef.current === controller) abortControllerRef.current = null
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void load(true)
      }
    }, AUTO_REFRESH_INTERVAL_MS)

    return () => window.clearInterval(timer)
  }, [load])

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void load(true)
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [load])

  useEffect(() => () => {
    requestIdRef.current += 1
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
  }, [])

  const hasUsableData = response !== null
  const initialLoading = !hasUsableData && (!requestState || requestState.status === 'loading')
  const refreshing = requestState?.status === 'loading' && requestState.background
  const error = requestState?.status === 'error' ? requestState.error ?? 'Unable to load active alerts' : null
  const isStale = hasUsableData && requestState?.status === 'error'

  return {
    response,
    alerts: response?.alerts ?? [],
    counts: response?.counts ?? null,
    error,
    initialLoading,
    refreshing,
    hasUsableData,
    isStale,
    refreshNow: () => load(true),
  }
}
