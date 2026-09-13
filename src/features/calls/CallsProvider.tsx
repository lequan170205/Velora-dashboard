import { createContext, useContext, type ReactNode } from 'react'

import { useCallTelemetry } from './useCallTelemetry'
import { useAuth } from '../../app/providers/auth'

type CallsContextValue = ReturnType<typeof useCallTelemetry>

const CallsContext = createContext<CallsContextValue | null>(null)

/* One telemetry store for the three call views, mounted for the authenticated
   shell only — logging out discards its state instead of requiring an explicit reset. */
export function CallsProvider({ children }: { children: ReactNode }) {
  const { status } = useAuth()
  const calls = useCallTelemetry(status === 'authenticated')

  return <CallsContext.Provider value={calls}>{children}</CallsContext.Provider>
}

export function useCalls(): CallsContextValue {
  const context = useContext(CallsContext)
  if (!context) {
    throw new Error('useCalls must be used within a CallsProvider')
  }
  return context
}
