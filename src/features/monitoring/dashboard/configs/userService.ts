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

export const userServiceConfig: InfraViewConfig = {
  id: "user-service",
  errorTitle: "User-service metrics are temporarily unavailable.",
  errorMessage: "Unable to load user-service metrics",
  toolbar: {
    eyebrow: "User service · profiles and discovery",
    title: "User service health",
    titleId: "user-service-observability-title",
    description:
      "Runtime, profile operations, public search, user recommendations, avatar-storage checks, and user_queue pressure.",
    rangeLabel: "User service history range",
    placement: "top",
  },
  health: (overview) => {
    const user = overview?.user;
    const up = user?.up ?? null;
    const databaseUp = user?.databaseUp ?? null;
    const errorRate = user?.errorRate ?? null;
    const storageFailureRate = user?.storageFailureRate ?? null;
    const tone: Tone =
      up === false || databaseUp === false
        ? "bad"
        : (errorRate ?? 0) >= 0.05 || (storageFailureRate ?? 0) > 0
          ? "warn"
          : up === true
            ? "good"
            : "neutral";
    return {
      tone,
      label: "Quick read",
      title:
        up === false
          ? "User service is offline"
          : databaseUp === false
            ? "User database is unavailable"
            : (storageFailureRate ?? 0) > 0
              ? "Avatar storage checks need attention"
              : up === true
                ? "User service is healthy"
                : "Waiting for User telemetry",
      detail:
        "Request, search, recommendation, and storage rates use rolling five-minute Prometheus windows.",
    };
  },
  cardGroups: ({ overview, hasData }) => {
    const user = overview?.user;
    const detail = hasData ? "Rolling 5 min" : "Waiting for data";
    const groups: readonly StatCardGroupVm[] = [
      {
        id: "health",
        heading: "Service health",
        hint: "Live",
        gridClassName: "sm:grid-cols-2 xl:grid-cols-3",
        cards: [
          { label: "PostgreSQL", value: statusValue(user?.databaseUp), detail: "Live dependency check", helper: "Can user-service reach PostgreSQL?", badge: user?.databaseUp === true ? "Connected" : user?.databaseUp === false ? "Outage" : "Waiting", tone: statusTone(user?.databaseUp) },
          { label: "Internal error rate", value: formatPercent(user?.errorRate ?? Number.NaN), detail, helper: "Unexpected User RPC failures; expected domain rejections are excluded.", badge: user?.errorRate == null ? "Waiting" : user.errorRate < 0.05 ? "Healthy" : "Watch", tone: toneForThreshold(user?.errorRate ?? null, 0.05, 0.1) },
          { label: "p95 latency", value: formatSeconds(user?.p95LatencySeconds ?? Number.NaN), detail, helper: "p95 handling time across User RPC operations.", badge: user?.p95LatencySeconds == null ? "Waiting" : user.p95LatencySeconds < 1 ? "Healthy" : "Watch", tone: toneForThreshold(user?.p95LatencySeconds ?? null, 1, 2) },
        ],
      },
      {
        id: "operations",
        heading: "User operations",
        hint: "Rolling 5 min",
        gridClassName: "sm:grid-cols-2 xl:grid-cols-3",
        cards: [
          { label: "All requests", value: formatRate(user?.requestsPerSecond ?? Number.NaN), detail, helper: "All User RPC requests per second.", badge: "Traffic", tone: "neutral" },
          { label: "Create requests", value: formatRate(user?.createRequestsPerSecond ?? Number.NaN), detail, helper: "User-creation requests per second.", badge: "Create", tone: "neutral" },
          { label: "Process memory", value: formatBytes(user?.residentMemoryBytes ?? Number.NaN), detail: "Live", helper: "Resident memory used by user-service.", badge: "Service only", tone: "neutral" },
        ],
      },
      {
        id: "discovery",
        heading: "Search and recommendations",
        hint: "Rolling 5 min",
        gridClassName: "sm:grid-cols-2 xl:grid-cols-4",
        cards: [
          { label: "Search requests", value: formatRate(user?.searchRequestsPerSecond ?? Number.NaN), detail, helper: "Public-user search requests per second.", badge: "Search", tone: "neutral" },
          { label: "Search p95", value: formatSeconds(user?.searchP95LatencySeconds ?? Number.NaN), detail, helper: "p95 public-user search latency.", badge: "Latency", tone: toneForThreshold(user?.searchP95LatencySeconds ?? null, 1, 2) },
          { label: "Recommendation requests", value: formatRate(user?.recommendationRequestsPerSecond ?? Number.NaN), detail, helper: "Public-user recommendation requests per second.", badge: "Discovery", tone: "neutral" },
          { label: "Recommendation p95", value: formatSeconds(user?.recommendationP95LatencySeconds ?? Number.NaN), detail, helper: "p95 end-to-end user recommendation latency.", badge: "Latency", tone: toneForThreshold(user?.recommendationP95LatencySeconds ?? null, 2, 4) },
        ],
      },
      {
        id: "storage",
        heading: "Storage",
        hint: "Avatar key checks",
        gridClassName: "sm:grid-cols-2",
        cards: [
          { label: "Storage failure rate", value: formatPercent(user?.storageFailureRate ?? Number.NaN), detail, helper: "Transport failures while user-service validates avatar object keys in storage.", badge: user?.storageFailureRate == null ? "Waiting" : user.storageFailureRate === 0 ? "Healthy" : "Watch", tone: toneForThreshold(user?.storageFailureRate ?? null, 0.01, 0.05) },
          { label: "Avg candidates / recommendation", value: formatCount(user?.recommendationCandidates ?? Number.NaN), detail, helper: "Average public-user candidates returned per successful recommendation request.", badge: "Candidates", tone: "neutral" },
        ],
      },
      {
        id: "queue",
        heading: "Queue health",
        hint: "RabbitMQ live",
        gridClassName: "sm:grid-cols-3",
        cards: [
          { label: "Ready", value: formatCount(user?.queueReady ?? Number.NaN), detail: "user_queue", helper: "Messages ready for a user-service consumer.", badge: (user?.queueReady ?? 0) > 0 ? "Backlog" : "Clear", tone: toneForThreshold(user?.queueReady ?? null, 1, 20) },
          { label: "Unacked", value: formatCount(user?.queueUnacked ?? Number.NaN), detail: "user_queue", helper: "User messages currently being processed but not acknowledged.", badge: "In flight", tone: "neutral" },
          { label: "Consumers", value: formatCount(user?.consumers ?? Number.NaN), detail: "user_queue", helper: "RabbitMQ consumers attached to user_queue.", badge: user?.consumers == null ? "Waiting" : user.consumers > 0 ? "Online" : "None", tone: user?.consumers == null ? "neutral" : user.consumers > 0 ? "good" : (user?.queueReady ?? 0) > 0 ? "bad" : "neutral" },
        ],
      },
      {
        id: "process",
        heading: "Process",
        hint: "Live",
        gridClassName: "sm:grid-cols-2",
        cards: [
          { label: "CPU", value: formatCpu(user?.cpuUsageRatio ?? Number.NaN), helper: "Share of total host CPU capacity used by user-service.", badge: "Host share", tone: toneForThreshold(user?.cpuUsageRatio ?? null, 0.7, 0.9) },
          { label: "Event-loop p99", value: formatSeconds(user?.eventLoopP99Seconds ?? Number.NaN), helper: "p99 Node.js event-loop delay.", badge: "Responsiveness", tone: toneForThreshold(user?.eventLoopP99Seconds ?? null, 0.1, 0.25) },
        ],
      },
    ];
    return groups;
  },
  historyHeading: { title: "History", hint: "Rolling five-minute rates and quantiles" },
  historyEnabled: (overview) => overview?.user !== undefined,
  series: [
    { metric: "user_request_rate", title: "User requests / second", question: "How much User Service traffic is arriving?", description: "All user-service RPC request traffic.", formatter: formatRate, axisFormatter: formatRate, accentToken: "blue", emptyTitle: "No User traffic yet", emptyDescription: "This chart appears after user-service receives requests.", emptyStateKind: "no-traffic" },
    { metric: "user_error_rate", title: "Internal error rate", question: "How often are User operations failing unexpectedly?", description: "Internal errors divided by all User requests; expected domain rejections are excluded.", formatter: formatPercent, axisFormatter: formatPercent, accentToken: "rose", emptyTitle: "No error-rate samples yet", emptyDescription: "A rate is available when User traffic is present.", emptyStateKind: "no-traffic" },
    { metric: "user_p95_latency", title: "User p95 latency", question: "How long do slow User operations take?", description: "p95 User RPC handling latency.", formatter: formatSeconds, axisFormatter: formatSeconds, accentToken: "amber", emptyTitle: "No User latency samples yet", emptyDescription: "Latency appears after requests complete." },
    { metric: "user_search_p95_latency", title: "Search p95 latency", question: "How responsive is public-user search?", description: "p95 public-user search latency.", formatter: formatSeconds, axisFormatter: formatSeconds, accentToken: "teal", emptyTitle: "No search latency samples yet", emptyDescription: "This chart appears after public-user searches." },
    { metric: "user_recommendation_p95_latency", title: "Recommendation p95 latency", question: "How responsive is user discovery?", description: "p95 public-user recommendation latency.", formatter: formatSeconds, axisFormatter: formatSeconds, accentToken: "indigo", emptyTitle: "No recommendation latency samples yet", emptyDescription: "This chart appears after user recommendation traffic." },
    { metric: "user_recommendation_candidates", title: "Candidates / recommendation", question: "How many public-user candidates are returned?", description: "Average candidates returned per successful recommendation request.", formatter: formatCount, axisFormatter: formatCount, accentToken: "blue", emptyTitle: "No candidate samples yet", emptyDescription: "Candidate averages appear after recommendation requests." },
    { metric: "user_storage_failure_rate", title: "Avatar storage failure rate", question: "Are avatar object checks reaching storage reliably?", description: "Transport failures divided by avatar storage existence checks.", formatter: formatPercent, axisFormatter: formatPercent, accentToken: "rose", emptyTitle: "No storage-check failures", emptyDescription: "No storage-check failure history is available in this range.", emptyStateKind: "no-traffic" },
    { metric: "user_queue_ready", title: "user_queue ready messages", question: "Is User work accumulating?", description: "RabbitMQ messages waiting for user-service consumers.", formatter: formatCount, axisFormatter: formatCount, accentToken: "amber", emptyTitle: "No queue history yet", emptyDescription: "Queue samples appear after RabbitMQ detailed metrics are scraped." },
  ],
  currentValues: (overview) => ({
    user_request_rate: { value: overview?.user?.requestsPerSecond },
    user_error_rate: { value: overview?.user?.errorRate },
    user_p95_latency: { value: overview?.user?.p95LatencySeconds },
    user_search_p95_latency: { value: overview?.user?.searchP95LatencySeconds },
    user_recommendation_p95_latency: { value: overview?.user?.recommendationP95LatencySeconds },
    user_recommendation_candidates: { value: overview?.user?.recommendationCandidates },
    user_storage_failure_rate: { value: overview?.user?.storageFailureRate },
    user_queue_ready: { value: overview?.user?.queueReady },
  }),
};
