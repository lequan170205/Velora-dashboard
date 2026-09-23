import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

import {
  defaultCallTelemetryFilters,
  hasValidCustomRange,
  type CallTelemetryFilters,
} from './api'

const AUTO_APPLY_DELAY_MS = 350

type CallsContextValue = {
  draft: CallTelemetryFilters
  applied: CallTelemetryFilters
  updateFilter: <Key extends keyof CallTelemetryFilters>(key: Key, value: CallTelemetryFilters[Key]) => void
}

const CallsContext = createContext<CallsContextValue | null>(null)

export function CallsProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<CallTelemetryFilters>(defaultCallTelemetryFilters)
  const [applied, setApplied] = useState<CallTelemetryFilters>(defaultCallTelemetryFilters)

  const updateFilter = useCallback(
    <Key extends keyof CallTelemetryFilters>(key: Key, value: CallTelemetryFilters[Key]) => {
      setDraft((previous) => ({ ...previous, [key]: value }))
    },
    [],
  )

  useEffect(() => {
    if (JSON.stringify(draft) === JSON.stringify(applied)) return
    if (!hasValidCustomRange(draft)) return

    const timeout = window.setTimeout(() => {
      setApplied({ ...draft })
    }, AUTO_APPLY_DELAY_MS)

    return () => window.clearTimeout(timeout)
  }, [draft, applied])

  const value = useMemo(
    () => ({ draft, applied, updateFilter }),
    [draft, applied, updateFilter],
  )

  return <CallsContext.Provider value={value}>{children}</CallsContext.Provider>
}

export function useCalls(): CallsContextValue {
  const context = useContext(CallsContext)
  if (!context) throw new Error('useCalls must be used within a CallsProvider')
  return context
}
