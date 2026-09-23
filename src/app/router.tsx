import { useMemo } from "react";
import {
  createHashRouter,
  Navigate,
  useNavigate,
  useSearchParams,
} from "react-router";

import { AlertsView, LogsView } from "../features/monitoring";
import { InfraDashboard } from "../features/monitoring/dashboard/InfraDashboard";
import {
  authServiceConfig,
  callServiceConfig,
  conversationConfig,
  monitoringServiceConfig,
  notificationServiceConfig,
  ragConfig,
  reelsConfig,
  serverConfig,
  userServiceConfig,
} from "../features/monitoring/dashboard/configs";
import type { LogsPreset } from "../features/monitoring/hooks/useLogsQuery";
import {
  CallsProvider,
  CallQualityView,
  CallTimelineView,
  RecentCallsView,
  useCalls,
} from "../features/calls";
import { isLogsLevel, openLogs, openTimeline } from "./flows";
import { LoginScreen } from "./LoginScreen";
import { useAuth } from "./providers/auth";
import { SessionLoader } from "./SessionLoader";
import { AppShell } from "./shell/AppShell";

function AuthGate() {
  const { status } = useAuth();

  if (status === "checking") return <SessionLoader />;
  if (status === "unauthenticated") return <LoginScreen />;

  return (
    <CallsProvider>
      <AppShell />
    </CallsProvider>
  );
}

function ServerRoute() {
  const navigate = useNavigate();
  return (
    <InfraDashboard
      config={serverConfig}
      onOpenLogs={(service) => openLogs(navigate, service)}
    />
  );
}

function AlertsRoute() {
  const navigate = useNavigate();
  return (
    <AlertsView
      onNavigate={(view) => navigate(`/${view}`)}
      onOpenLogs={(service) => openLogs(navigate, service)}
    />
  );
}

/* Log presets travel in the URL (#/logs?service=x&level=error) so they stay
   deep-linkable; the hook receives them as a stable prop like before. */
function LogsRoute() {
  const [searchParams] = useSearchParams();
  const service = searchParams.get("service");
  const level = searchParams.get("level");

  const preset = useMemo<LogsPreset | null>(() => {
    if (!service || !isLogsLevel(level)) return null;
    return { service, level };
  }, [service, level]);

  return <LogsView preset={preset} />;
}

function CallQualityRoute() {
  const { applied } = useCalls();
  return <CallQualityView appliedFilters={applied} />;
}

function RecentCallsRoute() {
  const { applied } = useCalls();
  const navigate = useNavigate();
  return (
    <RecentCallsView
      appliedFilters={applied}
      onInspect={(callId) => openTimeline(navigate, callId)}
    />
  );
}

/* The URL parameter is a deep link: arriving with ?callId=… loads that timeline. */
function TimelineRoute() {
  const [searchParams] = useSearchParams();
  const callIdParam = searchParams.get("callId") ?? "";
  return <CallTimelineView initialCallId={callIdParam} />;
}

export const router = createHashRouter([
  {
    path: "/",
    element: <AuthGate />,
    children: [
      { index: true, element: <Navigate to="/server" replace /> },
      { path: "server", element: <ServerRoute /> },
      {
        path: "service",
        element: <InfraDashboard config={monitoringServiceConfig} />,
      },
      {
        path: "conversation",
        element: <InfraDashboard config={conversationConfig} />,
      },
      {
        path: "call-service",
        element: <InfraDashboard config={callServiceConfig} />,
      },
      {
        path: "notification-service",
        element: <InfraDashboard config={notificationServiceConfig} />,
      },
      {
        path: "auth-service",
        element: <InfraDashboard config={authServiceConfig} />,
      },
      {
        path: "user-service",
        element: <InfraDashboard config={userServiceConfig} />,
      },
      { path: "rag", element: <InfraDashboard config={ragConfig} /> },
      { path: "reels", element: <InfraDashboard config={reelsConfig} /> },
      { path: "alerts", element: <AlertsRoute /> },
      { path: "logs", element: <LogsRoute /> },
      { path: "call-quality", element: <CallQualityRoute /> },
      { path: "recent-calls", element: <RecentCallsRoute /> },
      { path: "timeline", element: <TimelineRoute /> },
      { path: "*", element: <Navigate to="/server" replace /> },
    ],
  },
]);
