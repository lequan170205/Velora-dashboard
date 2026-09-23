import {
  formatBytes,
  formatCpu,
  formatCount,
  formatPercent,
  formatRate,
  formatSeconds,
  toneForThreshold,
  type Tone,
} from "../../formatters";
import type { InfraViewConfig, StatCardGroupVm } from "../types";

const statusValue = (value: boolean | null | undefined) =>
  value === true ? "Available" : value === false ? "Unavailable" : "—";

const statusTone = (value: boolean | null | undefined): Tone =>
  value === true ? "good" : value === false ? "bad" : "neutral";

export const authServiceConfig: InfraViewConfig = {
  id: "auth-service",
  errorTitle: "Auth-service metrics are temporarily unavailable.",
  errorMessage: "Unable to load auth-service metrics",
  toolbar: {
    eyebrow: "Auth service · sessions and identity",
    title: "Authentication health",
    titleId: "auth-service-observability-title",
    description:
      "Runtime, login and refresh-token reliability, dependency health, cleanup freshness, and auth_queue pressure without exposing credentials or user identifiers.",
    rangeLabel: "Auth service history range",
    placement: "top",
  },
  health: (overview) => {
    const auth = overview?.auth;
    const up = auth?.up ?? null;
    const databaseUp = auth?.databaseUp ?? null;
    const redisUp = auth?.redisUp ?? null;
    const errorRate = auth?.errorRate ?? null;
    const replayRate = auth?.replayDetectionsPerSecond ?? null;
    const tone: Tone =
      up === false || databaseUp === false || redisUp === false
        ? "bad"
        : (replayRate ?? 0) > 0 || (errorRate ?? 0) >= 0.05
          ? "warn"
          : up === true
            ? "good"
            : "neutral";

    return {
      tone,
      label: "Quick read",
      title:
        up === false
          ? "Auth service is offline"
          : databaseUp === false
            ? "Auth database is unavailable"
            : redisUp === false
              ? "Auth Redis is unavailable"
              : (replayRate ?? 0) > 0
                ? "Refresh-token replay needs attention"
                : up === true
                  ? "Authentication service is healthy"
                  : "Waiting for Auth telemetry",
      detail:
        "Traffic and latency use rolling five-minute Prometheus windows; refresh recovery is tracked separately from invalid or replayed tokens.",
    };
  },
  cardGroups: ({ overview, hasData }) => {
    const auth = overview?.auth;
    const detail = hasData ? "Rolling 5 min" : "Waiting for data";
    const groups: readonly StatCardGroupVm[] = [
      {
        id: "health",
        heading: "Service health",
        hint: "Live",
        gridClassName: "sm:grid-cols-2 xl:grid-cols-3",
        cards: [
          { label: "PostgreSQL", value: statusValue(auth?.databaseUp), detail: "Live dependency check", helper: "Can auth-service reach its PostgreSQL database?", badge: auth?.databaseUp === true ? "Connected" : auth?.databaseUp === false ? "Outage" : "Waiting", tone: statusTone(auth?.databaseUp) },
          { label: "Redis", value: statusValue(auth?.redisUp), detail: "Live dependency check", helper: "Can auth-service reach Redis for verification and role-cache operations?", badge: auth?.redisUp === true ? "Connected" : auth?.redisUp === false ? "Outage" : "Waiting", tone: statusTone(auth?.redisUp) },
          { label: "p95 latency", value: formatSeconds(auth?.p95LatencySeconds ?? Number.NaN), detail, helper: "p95 handling time across Auth RPC operations.", badge: auth?.p95LatencySeconds == null ? "Waiting" : auth.p95LatencySeconds < 1 ? "Healthy" : "Watch", tone: toneForThreshold(auth?.p95LatencySeconds ?? null, 1, 2) },
        ],
      },
      {
        id: "traffic",
        heading: "Authentication traffic",
        hint: "Rolling 5 min",
        gridClassName: "sm:grid-cols-2 xl:grid-cols-4",
        cards: [
          { label: "All requests", value: formatRate(auth?.requestsPerSecond ?? Number.NaN), detail, helper: "All Auth RPC requests per second.", badge: "Traffic", tone: "neutral" },
          { label: "Internal error rate", value: formatPercent(auth?.errorRate ?? Number.NaN), detail, helper: "Unexpected failures only; rejected credentials and validation failures are excluded.", badge: auth?.errorRate == null ? "Waiting" : auth.errorRate < 0.05 ? "Healthy" : "Watch", tone: toneForThreshold(auth?.errorRate ?? null, 0.05, 0.1) },
          { label: "Login requests", value: formatRate(auth?.loginRequestsPerSecond ?? Number.NaN), detail, helper: "Password-login requests per second.", badge: "Login", tone: "neutral" },
          { label: "Login success", value: formatPercent(auth?.loginSuccessRate ?? Number.NaN), detail, helper: "Successful password logins divided by recent login requests.", badge: "Outcome", tone: "neutral" },
        ],
      },
      {
        id: "refresh",
        heading: "Session and refresh health",
        hint: "Rolling 5 min",
        gridClassName: "sm:grid-cols-2 xl:grid-cols-4",
        cards: [
          { label: "Refresh requests", value: formatRate(auth?.refreshRequestsPerSecond ?? Number.NaN), detail, helper: "Refresh-token requests per second.", badge: "Sessions", tone: "neutral" },
          { label: "Refresh success", value: formatPercent(auth?.refreshSuccessRate ?? Number.NaN), detail, helper: "Normal rotations plus request-bound recovery divided by refresh requests.", badge: "Rotation", tone: "neutral" },
          { label: "Recovered retries", value: formatRate(auth?.refreshRecoveriesPerSecond ?? Number.NaN), detail, helper: "Safe repeated refresh requests recovered using the same refresh request ID.", badge: "Recovered", tone: "neutral" },
          { label: "Replay detections", value: formatRate(auth?.replayDetectionsPerSecond ?? Number.NaN), detail, helper: "Refresh attempts classified as token replay rather than safe request recovery.", badge: auth?.replayDetectionsPerSecond ? "Investigate" : "None", tone: (auth?.replayDetectionsPerSecond ?? 0) > 0 ? "warn" : "neutral" },
        ],
      },
      {
        id: "queue",
        heading: "Queue health",
        hint: "RabbitMQ live",
        gridClassName: "sm:grid-cols-3",
        cards: [
          { label: "Ready", value: formatCount(auth?.queueReady ?? Number.NaN), detail: "auth_queue", helper: "Messages ready for an auth-service consumer.", badge: (auth?.queueReady ?? 0) > 0 ? "Backlog" : "Clear", tone: toneForThreshold(auth?.queueReady ?? null, 1, 20) },
          { label: "Unacked", value: formatCount(auth?.queueUnacked ?? Number.NaN), detail: "auth_queue", helper: "Auth messages currently being processed but not acknowledged.", badge: "In flight", tone: "neutral" },
          { label: "Consumers", value: formatCount(auth?.consumers ?? Number.NaN), detail: "auth_queue", helper: "RabbitMQ consumers attached to auth_queue.", badge: auth?.consumers == null ? "Waiting" : auth.consumers > 0 ? "Online" : "None", tone: auth?.consumers == null ? "neutral" : auth.consumers > 0 ? "good" : (auth?.queueReady ?? 0) > 0 ? "bad" : "neutral" },
        ],
      },
      {
        id: "process",
        heading: "Process",
        hint: "Live",
        gridClassName: "sm:grid-cols-3",
        cards: [
          { label: "Memory", value: formatBytes(auth?.residentMemoryBytes ?? Number.NaN), helper: "Resident memory used by auth-service.", badge: "Service only", tone: "neutral" },
          { label: "CPU", value: formatCpu(auth?.cpuUsageRatio ?? Number.NaN), helper: "Share of total host CPU capacity used by auth-service.", badge: "Host share", tone: toneForThreshold(auth?.cpuUsageRatio ?? null, 0.7, 0.9) },
          { label: "Event-loop p99", value: formatSeconds(auth?.eventLoopP99Seconds ?? Number.NaN), helper: "p99 Node.js event-loop delay.", badge: "Responsiveness", tone: toneForThreshold(auth?.eventLoopP99Seconds ?? null, 0.1, 0.25) },
        ],
      },
    ];
    return groups;
  },
  historyHeading: { title: "History", hint: "Rolling five-minute rates and quantiles" },
  historyEnabled: (overview) => overview?.auth !== undefined,
  series: [
    { metric: "auth_request_rate", title: "Auth requests / second", question: "How much authentication traffic is arriving?", description: "All auth-service RPC request traffic.", formatter: formatRate, axisFormatter: formatRate, accentToken: "blue", emptyTitle: "No Auth traffic yet", emptyDescription: "This chart appears after auth-service receives requests.", emptyStateKind: "no-traffic" },
    { metric: "auth_error_rate", title: "Internal error rate", question: "How often are Auth operations failing unexpectedly?", description: "Internal errors divided by all Auth requests; business rejections are excluded.", formatter: formatPercent, axisFormatter: formatPercent, accentToken: "rose", emptyTitle: "No error-rate samples yet", emptyDescription: "A rate is available when Auth traffic is present.", emptyStateKind: "no-traffic" },
    { metric: "auth_p95_latency", title: "Auth p95 latency", question: "How long do slow Auth operations take?", description: "p95 Auth RPC handling latency.", formatter: formatSeconds, axisFormatter: formatSeconds, accentToken: "amber", emptyTitle: "No Auth latency samples yet", emptyDescription: "Latency appears after requests complete." },
    { metric: "auth_login_success_rate", title: "Login success rate", question: "What share of password logins succeed?", description: "Successful password logins divided by login requests.", formatter: formatPercent, axisFormatter: formatPercent, accentToken: "teal", emptyTitle: "No login samples yet", emptyDescription: "This chart appears after password-login traffic.", emptyStateKind: "no-traffic" },
    { metric: "auth_refresh_success_rate", title: "Refresh success rate", question: "Are session refreshes rotating or recovering correctly?", description: "Normal refresh rotations and request-bound recoveries divided by refresh requests.", formatter: formatPercent, axisFormatter: formatPercent, accentToken: "indigo", emptyTitle: "No refresh samples yet", emptyDescription: "This chart appears after refresh traffic.", emptyStateKind: "no-traffic" },
    { metric: "auth_refresh_replay_rate", title: "Refresh replay detections / second", question: "Are stale or replayed refresh tokens being presented?", description: "Refresh attempts classified as replay detections.", formatter: formatRate, axisFormatter: formatRate, accentToken: "rose", emptyTitle: "No replay detections", emptyDescription: "No replay-detection history is available in this range.", emptyStateKind: "no-traffic" },
    { metric: "auth_queue_ready", title: "auth_queue ready messages", question: "Is Auth work accumulating?", description: "RabbitMQ messages waiting for auth-service consumers.", formatter: formatCount, axisFormatter: formatCount, accentToken: "amber", emptyTitle: "No queue history yet", emptyDescription: "Queue samples appear after RabbitMQ detailed metrics are scraped." },
  ],
  currentValues: (overview) => ({
    auth_request_rate: { value: overview?.auth?.requestsPerSecond },
    auth_error_rate: { value: overview?.auth?.errorRate },
    auth_p95_latency: { value: overview?.auth?.p95LatencySeconds },
    auth_login_success_rate: { value: overview?.auth?.loginSuccessRate },
    auth_refresh_success_rate: { value: overview?.auth?.refreshSuccessRate },
    auth_refresh_replay_rate: { value: overview?.auth?.replayDetectionsPerSecond },
    auth_queue_ready: { value: overview?.auth?.queueReady },
  }),
};
