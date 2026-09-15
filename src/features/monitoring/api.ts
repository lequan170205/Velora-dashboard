import { fetchApi } from "../../shared/api/client";

type NullableMetric = number | null;

export type MonitoringOverview = {
  generatedAt: string;
  source: "prometheus";
  host: {
    up: boolean | null;
    cpuUsageRatio: NullableMetric;
    memoryTotalBytes: NullableMetric;
    memoryAvailableBytes: NullableMetric;
    memoryUsedBytes: NullableMetric;
    memoryUsageRatio: NullableMetric;
    swapTotalBytes: NullableMetric;
    swapFreeBytes: NullableMetric;
    swapUsedBytes: NullableMetric;
    swapUsageRatio: NullableMetric;
    diskTotalBytes: NullableMetric;
    diskAvailableBytes: NullableMetric;
    diskUsedBytes: NullableMetric;
    diskUsageRatio: NullableMetric;
    load1: NullableMetric;
    uptimeSeconds: NullableMetric;
  };
  service: { up: boolean | null };
  process: {
    residentMemoryBytes: NullableMetric;
    heapUsedBytes: NullableMetric;
    /** Fraction of the monitored host's total CPU capacity (all cores). */
    cpuUsageRatio: NullableMetric;
    eventLoopP99Seconds: NullableMetric;
  };
  rpc: {
    requestsPerSecond: NullableMetric;
    errorRate: NullableMetric;
    p95LatencySeconds: NullableMetric;
  };
  conversation: {
    up: boolean | null;
    residentMemoryBytes: NullableMetric;
    /** Fraction of the monitored host's total CPU capacity (all cores). */
    cpuUsageRatio: NullableMetric;
    eventLoopP99Seconds: NullableMetric;
    socketConnections: NullableMetric;
    messagesPerSecond: NullableMetric;
    sendRequestsPerSecond: NullableMetric;
    successRate: NullableMetric;
    rejectRate: NullableMetric;
    errorRate: NullableMetric;
    p95SendLatencySeconds: NullableMetric;
  };
  call: {
    up: boolean | null;
    residentMemoryBytes: NullableMetric;
    /** Fraction of the monitored host's total CPU capacity (all cores). */
    cpuUsageRatio: NullableMetric;
    eventLoopP99Seconds: NullableMetric;
    socketConnections: NullableMetric;
  };
  notification: {
    up: boolean | null;
    residentMemoryBytes: NullableMetric;
    /** Fraction of the monitored host's total CPU capacity (all cores). */
    cpuUsageRatio: NullableMetric;
    eventLoopP99Seconds: NullableMetric;
    databaseUp: boolean | null;
    apnsRequestsPerSecond: NullableMetric;
    apnsTransportFailuresPerSecond: NullableMetric;
    retrySchedulerCompletionAgeSeconds: NullableMetric;
  };
};

export type MonitoringStatus = {
  generatedAt: string;
  source: "prometheus";
  monitoringUp: boolean | null;
  hostUp: boolean | null;
};

export type ContainerResource = {
  service: string;
  container: string;
  cpuCores: NullableMetric;
  memoryWorkingSetBytes: NullableMetric;
  memoryLimitBytes: NullableMetric;
  filesystemUsageBytes: NullableMetric;
};

export type MonitoringContainers = {
  generatedAt: string;
  source: "docker";
  dockerEngineUp?: boolean | null;
  runningContainers?: number | null;
  sampledContainers?: number | null;
  hostCpuCount?: NullableMetric;
  storage?: {
    imagesBytes: NullableMetric;
    volumesBytes: NullableMetric;
    buildCacheBytes: NullableMetric;
  } | null;
  containers: ContainerResource[];
};

export type MonitoringMetric =
  | "memory"
  | "heap"
  | "cpu"
  | "rpc_rate"
  | "error_rate"
  | "p95_rpc_latency"
  | "event_loop_p99"
  | "host_cpu"
  | "host_memory"
  | "host_swap"
  | "host_disk"
  | "host_load1"
  | "conversation_cpu"
  | "conversation_memory"
  | "conversation_event_loop_p99"
  | "conversation_sockets"
  | "conversation_message_rate"
  | "conversation_send_rate"
  | "conversation_success_rate"
  | "conversation_reject_rate"
  | "conversation_error_rate"
  | "conversation_p95_send_latency"
  | "call_cpu"
  | "call_memory"
  | "call_event_loop_p99"
  | "call_sockets"
  | "notification_cpu"
  | "notification_memory"
  | "notification_event_loop_p99"
  | "notification_database_up"
  | "notification_apns_request_rate"
  | "notification_apns_transport_failure_rate"
  | "notification_retry_scheduler_completion_age_seconds";

export type MonitoringPoint = { timestamp: number; value: number };

export type MonitoringTimeseries = {
  metric: MonitoringMetric;
  from: string;
  to: string;
  stepSeconds: number;
  points: MonitoringPoint[];
};

export const fetchMonitoringOverview = async (signal?: AbortSignal) => {
  const response = await fetchApi("/monitoring/overview", { signal });
  if (!response.ok)
    throw new Error(`Unable to load system monitoring (${response.status})`);
  return (await response.json()) as MonitoringOverview;
};

export const fetchMonitoringStatus = async (signal?: AbortSignal) => {
  const response = await fetchApi("/monitoring/status", { signal });
  if (!response.ok)
    throw new Error(`Unable to load monitoring status (${response.status})`);
  return (await response.json()) as MonitoringStatus;
};

export const fetchMonitoringContainers = async (signal?: AbortSignal) => {
  const response = await fetchApi("/monitoring/containers", { signal });
  if (!response.ok)
    throw new Error(`Unable to load container resources (${response.status})`);
  return (await response.json()) as MonitoringContainers;
};

export const fetchMonitoringTimeseries = async ({
  metric,
  from,
  to,
  stepSeconds = 60,
  signal,
}: {
  metric: MonitoringMetric;
  from: string;
  to: string;
  stepSeconds?: number;
  signal?: AbortSignal;
}) => {
  const search = new URLSearchParams({
    metric,
    from,
    to,
    stepSeconds: String(stepSeconds),
  });
  const response = await fetchApi(`/monitoring/timeseries?${search}`, {
    signal,
  });
  if (!response.ok)
    throw new Error(`Unable to load ${metric} history (${response.status})`);
  return (await response.json()) as MonitoringTimeseries;
};
