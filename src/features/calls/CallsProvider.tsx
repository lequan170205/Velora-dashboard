import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

import { defaultCallTelemetryFilters, type CallTelemetryFilters } from './api'

type CallsContextValue = {
  /** Edited filter state — data only refetches when apply() runs. */
  draft: CallTelemetryFilters
  /** Filters the current data was loaded with. */
  applied: CallTelemetryFilters
  updateFilter: <Key extends keyof CallTelemetryFilters>(key: Key, value: CallTelemetryFilters[Key]) => void
  apply: () => void
}

const CallsContext = createContext<CallsContextValue | null>(null)

/* Shared date-range filter state for the call quality + explorer views.
   Keeping draft/applied apart fixes the old behaviour where every keystroke
   refetched telemetry before Apply was pressed. */
export function CallsProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<CallTelemetryFilters>(defaultCallTelemetryFilters)
  const [applied, setApplied] = useState<CallTelemetryFilters>(defaultCallTelemetryFilters)

  const updateFilter = useCallback(
    <Key extends keyof CallTelemetryFilters>(key: Key, value: CallTelemetryFilters[Key]) => {
      setDraft((prev) => ({ ...prev, [key]: value }))
    },
    [],
  )

  const apply = useCallback(() => {
    setApplied(draft)
  }, [draft])

  const value = useMemo(
    () => ({ draft, applied, updateFilter, apply }),
    [draft, applied, updateFilter, apply],
  )

  return <CallsContext.Provider value={value}>{children}</CallsContext.Provider>
}

export function useCalls(): CallsContextValue {
  const context = useContext(CallsContext)
  if (!context) {
    throw new Error('useCalls must be used within a CallsProvider')
  }
  return context
}
