import { useEffect, useMemo } from 'react'
import {
  createHashRouter,
  Navigate,
  useNavigate,
  useSearchParams,
} from 'react-router'

import { AlertsSection, LogsSection } from '../features/monitoring'
import { InfraDashboard } from '../features/monitoring/dashboard/InfraDashboard'
import {
  callServiceConfig,
  conversationConfig,
  monitoringServiceConfig,
  serverConfig,
} from '../features/monitoring/dashboard/configs'
import type { LogsPreset } from '../features/monitoring/hooks/useLogsView'
import {
  CallQualitySection,
  CallTimelineSection,
  RecentCallsSection,
} from '../features/calls'
import { CallsProvider, useCalls } from '../features/calls/CallsProvider'
import { isLogsLevel, openLogs, openTimeline } from './flows'
import { LoginScreen } from './LoginScreen'
import { useAuth } from './providers/auth'
import { SessionLoader } from './SessionLoader'
import { AppShell } from './shell/AppShell'

function AuthGate() {
  const { status } = useAuth()

  if (status === 'checking') return <SessionLoader />
  if (status === 'unauthenticated') return <LoginScreen />

  return (
    <CallsProvider>
      <AppShell />
    </CallsProvider>
  )
}

function ServerRoute() {
  const navigate = useNavigate()
  return <InfraDashboard config={serverConfig} onOpenLogs={(service) => openLogs(navigate, service)} />
}

function AlertsRoute() {
  const navigate = useNavigate()
  return (
    <AlertsSection
      onNavigate={(view) => navigate(`/${view}`)}
      onOpenLogs={(service) => openLogs(navigate, service)}
    />
  )
}

/* Log presets travel in the URL (#/logs?service=x&level=error) so they stay
   deep-linkable; the hook receives them as a stable prop like before. */
function LogsRoute() {
  const [searchParams] = useSearchParams()
  const service = searchParams.get('service')
  const level = searchParams.get('level')

  const preset = useMemo<LogsPreset | null>(() => {
    if (!service || !isLogsLevel(level)) return null
    return { service, level }
  }, [service, level])

  return <LogsSection preset={preset} />
}

function CallQualityRoute() {
  const calls = useCalls()
  return (
    <CallQualitySection
      summary={calls.summary}
      filters={calls.filters}
      error={calls.error}
      onFilterChange={calls.updateFilter}
      onApplyFilters={calls.applyFilters}
    />
  )
}

function RecentCallsRoute() {
  const calls = useCalls()
  const navigate = useNavigate()
  return (
    <RecentCallsSection
      recentCallLegs={calls.recentCallLegs}
      filters={calls.filters}
      error={calls.error}
      onFilterChange={calls.updateFilter}
      onApplyFilters={calls.applyFilters}
      onInspect={(callId) => {
        calls.inspectCall(callId)
        openTimeline(navigate, callId)
      }}
    />
  )
}

function TimelineRoute() {
  const calls = useCalls()
  const [searchParams] = useSearchParams()
  const callIdParam = searchParams.get('callId')

  // React to deep links only; form submissions drive state without rewriting the URL.
  useEffect(() => {
    if (callIdParam && callIdParam !== calls.callId) {
      calls.setCallId(callIdParam)
      void calls.loadTimeline(callIdParam)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callIdParam])

  return (
    <CallTimelineSection
      callId={calls.callId}
      timeline={calls.timeline}
      error={calls.error}
      onCallIdChange={calls.setCallId}
      onLoadTimeline={(callId) => void calls.loadTimeline(callId)}
    />
  )
}

export const router = createHashRouter([
  {
    path: '/',
    element: <AuthGate />,
    children: [
      { index: true, element: <Navigate to="/server" replace /> },
      { path: 'server', element: <ServerRoute /> },
      { path: 'service', element: <InfraDashboard config={monitoringServiceConfig} /> },
      { path: 'conversation', element: <InfraDashboard config={conversationConfig} /> },
      { path: 'call-service', element: <InfraDashboard config={callServiceConfig} /> },
      { path: 'alerts', element: <AlertsRoute /> },
      { path: 'logs', element: <LogsRoute /> },
      { path: 'call-quality', element: <CallQualityRoute /> },
      { path: 'recent-calls', element: <RecentCallsRoute /> },
      { path: 'timeline', element: <TimelineRoute /> },
      { path: '*', element: <Navigate to="/server" replace /> },
    ],
  },
])
