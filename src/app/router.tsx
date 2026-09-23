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
  CallsOverviewView,
  CallsProvider,
} from "../features/calls";
import { isLogsLevel, openLogs } from "./flows";
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
      onOpenLogs={(service) => openLogs(navigate, service, 'all')}
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

function CallsRoute() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedCallId = searchParams.get("callId");

  const inspectCall = (callId: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("callId", callId);
    setSearchParams(next);
  };

  const closeInspection = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("callId");
    setSearchParams(next, { replace: true });
  };

  return (
    <CallsOverviewView
      selectedCallId={selectedCallId}
      onInspect={inspectCall}
      onCloseInspection={closeInspection}
    />
  );
}

function LegacyTimelineRoute() {
  const [searchParams] = useSearchParams();
  const callId = searchParams.get("callId");
  return (
    <Navigate
      to={callId ? `/calls?callId=${encodeURIComponent(callId)}` : "/calls"}
      replace
    />
  );
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
      { path: "calls", element: <CallsRoute /> },
      { path: "call-quality", element: <Navigate to="/calls" replace /> },
      { path: "recent-calls", element: <Navigate to="/calls" replace /> },
      { path: "timeline", element: <LegacyTimelineRoute /> },
      { path: "*", element: <Navigate to="/server" replace /> },
    ],
  },
]);
