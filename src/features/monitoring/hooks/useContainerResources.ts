import { useCallback, useEffect, useRef, useState } from 'react'

import { fetchMonitoringContainers, type MonitoringContainers } from '../api'

const REFRESH_INTERVAL_MS = 15_000

const messageFromError = (error: unknown) =>
  error instanceof Error ? error.message : 'Unable to load container resources'

export function useContainerResources() {
  const [response, setResponse] = useState<MonitoringContainers | null>(null)
  const [pending, setPending] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const requestIdRef = useRef(0)
  const abortControllerRef = useRef<AbortController | null>(null)

  const refresh = useCallback(async () => {
    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller
    const requestId = ++requestIdRef.current
    setPending(true)

    try {
      const nextResponse = await fetchMonitoringContainers(controller.signal)
      if (requestId !== requestIdRef.current) return
      setResponse(nextResponse)
      setError(null)
    } catch (cause) {
      if (requestId !== requestIdRef.current) return
      if (cause instanceof Error && cause.name === 'AbortError') return
      setError(messageFromError(cause))
    } finally {
      if (requestId === requestIdRef.current) {
        setPending(false)
        if (abortControllerRef.current === controller) abortControllerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    void refresh()

    const interval = window.setInterval(() => {
      if (!document.hidden) void refresh()
    }, REFRESH_INTERVAL_MS)

    const handleVisibilityChange = () => {
      if (!document.hidden) void refresh()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      requestIdRef.current += 1
      abortControllerRef.current?.abort()
      abortControllerRef.current = null
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [refresh])

  return {
    response,
    containers: response?.containers ?? [],
    error,
    initialLoading: pending && response === null,
    refreshing: pending && response !== null,
    hasData: response !== null,
    refreshNow: () => refresh(),
  }
}
