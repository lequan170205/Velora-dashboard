import type { MonitoringMetric, MonitoringOverview } from '../../api'
import {
  badgeForThreshold,
  formatBytes,
  formatBytesAxis,
  formatCpu,
  formatPercent,
  formatRate,
  formatSeconds,
  toneForThreshold,
  type Tone,
} from '../../formatters'
import type { InfraViewConfig, StatCardVm } from '../types'

const formatSuccessRate = (errorRate: number) =>
  Number.isFinite(errorRate) ? `${((1 - errorRate) * 100).toFixed(2)}%` : '—'

const responsivenessBadge = (seconds: number) => {
  const ms = seconds * 1000
  if (!Number.isFinite(ms)) return { label: 'Waiting', tone: 'neutral' as Tone }
  if (ms < 100) return { label: 'Responsive', tone: 'good' as Tone }
  if (ms < 250) return { label: 'Some delay', tone: 'warn' as Tone }
  return { label: 'Delayed', tone: 'bad' as Tone }
}

const successBadge = (errorRate: number) => {
  if (!Number.isFinite(errorRate)) return { label: 'Waiting', tone: 'neutral' as Tone }
  if (errorRate < 0.01) return { label: 'Healthy', tone: 'good' as Tone }
  if (errorRate < 0.05) return { label: 'Watch', tone: 'warn' as Tone }
  return { label: 'Needs attention', tone: 'bad' as Tone }
}

export const monitoringServiceConfig: InfraViewConfig = {
  id: 'service',
  errorTitle: 'Monitoring-service data is temporarily unavailable.',
  errorMessage: 'Unable to load monitoring-service data',
  toolbar: {
    eyebrow: 'Monitoring service · live',
    title: 'How is Velora monitoring doing?',
    titleId: 'system-observability-title',
    description: 'These numbers describe the monitoring-service process. CPU is normalized to the whole host across all cores.',
    rangeLabel: 'Monitoring history range',
    placement: 'top',
  },
  health: (overview) => {
    if (!overview || overview.service.up === null) {
      return {
        tone: 'neutral',
        label: 'Quick read',
        title: 'Service status is unavailable',
        detail: 'Prometheus returned no monitoring-service target sample, so the dashboard will not guess a healthy value.',
      }
    }

    if (!overview.service.up) {
      return {
        tone: 'bad',
        label: 'Quick read',
        title: 'Monitoring service is offline',
        detail: 'Prometheus can see the target, but cannot currently scrape monitoring-service.',
      }
    }

    const eventLoopMs = overview.process.eventLoopP99Seconds === null ? Number.NaN : overview.process.eventLoopP99Seconds * 1000
    const latencyMs = overview.rpc.p95LatencySeconds === null ? Number.NaN : overview.rpc.p95LatencySeconds * 1000
    const requestRate = overview.rpc.requestsPerSecond
    const errorRate = overview.rpc.errorRate ?? Number.NaN
    const hasTraffic = requestRate !== null && requestRate > 0.001

    if (errorRate >= 0.05 || eventLoopMs >= 250 || (hasTraffic && latencyMs >= 1000)) {
      return { tone: 'bad', label: 'Quick read', title: 'The service needs attention', detail: 'The service is online, but errors or delays are high enough to investigate.' }
    }

    if (errorRate >= 0.01 || eventLoopMs >= 100 || (hasTraffic && latencyMs >= 500)) {
      return { tone: 'warn', label: 'Quick read', title: 'The service is online, but worth watching', detail: 'No outage is detected, but response delay or request errors are elevated.' }
    }

    return {
      tone: 'good',
      label: 'Quick read',
      title: 'Everything looks healthy',
      detail: hasTraffic
        ? 'The monitoring service is online, requests are succeeding, and its runtime is responsive.'
        : 'The monitoring service is online and responsive. There is no internal monitoring traffic right now.',
    }
  },
  topNote: {
    mark: '1',
    title: 'You are looking at one Velora service, not the whole server.',
    lines: ['Memory belongs to monitoring-service only. CPU is shown as the service share of the whole host across all cores.'],
    badge: 'See Server view for host totals',
  },
  bottomNote: {
    title: 'How to read these charts',
    lines: ['Every chart here is scoped to monitoring-service. Look for sudden jumps or a trend that keeps rising. Hover over a line to see the exact value and time. Empty traffic charts are normal when no monitoring requests are being made.'],
  },
  cards: ({ overview, hasData }) => {
    const processCpuRatio = overview?.process.cpuUsageRatio ?? null
    const requestRate = overview?.rpc.requestsPerSecond ?? null
    const successState = successBadge(overview?.rpc.errorRate ?? Number.NaN)
    const responsivenessState = responsivenessBadge(overview?.process.eventLoopP99Seconds ?? Number.NaN)

    const cards: readonly StatCardVm[] = [
      {
        label: 'Monitoring service memory',
        value: formatBytes(overview?.process.residentMemoryBytes ?? Number.NaN),
        helper: 'RAM used by this service process only — not total server memory.',
        badge: hasData ? 'Service only' : 'Waiting',
        tone: 'neutral',
      },
      {
        label: 'Monitoring service CPU',
        value: formatCpu(processCpuRatio ?? Number.NaN),
        helper: 'Share of total host CPU capacity used by this service process.',
        badge: badgeForThreshold(processCpuRatio, 0.7, 0.9),
        tone: toneForThreshold(processCpuRatio, 0.7, 0.9),
      },
      {
        label: 'Internal traffic',
        value: formatRate(overview?.rpc.requestsPerSecond ?? Number.NaN),
        helper: 'Monitoring requests handled each second.',
        badge: requestRate === null ? 'Waiting' : requestRate <= 0.001 ? 'Idle' : 'Active',
        tone: 'neutral',
      },
      {
        label: 'Successful requests',
        value: formatSuccessRate(overview?.rpc.errorRate ?? Number.NaN),
        helper: `Request success rate. Errors: ${formatPercent(overview?.rpc.errorRate ?? Number.NaN, 2)}.`,
        badge: successState.label,
        tone: successState.tone,
      },
      {
        label: 'Service responsiveness',
        value: formatSeconds(overview?.process.eventLoopP99Seconds ?? Number.NaN),
        helper: 'Delay before this Node.js service can react to incoming work. Lower is better.',
        badge: responsivenessState.label,
        tone: responsivenessState.tone,
      },
    ]
    return cards
  },
  series: [
    {
      metric: 'memory',
      title: 'Monitoring service memory',
      question: 'Is this service using more memory over time?',
      description: 'RAM used by the monitoring-service process only, not the whole Ubuntu server. A steady climb matters more than a single spike.',
      formatter: formatBytes,
      axisFormatter: formatBytesAxis,
      accentToken: 'indigo',
      emptyTitle: 'No memory history yet',
      emptyDescription: 'Prometheus will fill this chart after it has collected a few samples from monitoring-service.',
    },
    {
      metric: 'cpu',
      title: 'Monitoring service CPU',
      question: 'How busy is this service?',
      description: 'Share of total host CPU capacity used by the monitoring-service process. The value includes all host cores in its denominator.',
      formatter: formatCpu,
      axisFormatter: formatCpu,
      accentToken: 'blue',
      emptyTitle: 'No CPU history yet',
      emptyDescription: 'CPU samples will appear after Prometheus has observed monitoring-service for a short time.',
    },
    {
      metric: 'rpc_rate',
      title: 'Internal monitoring traffic',
      question: 'How many monitoring requests are arriving?',
      description: 'Internal monitoring requests handled each second. Zero is normal when nobody is using monitoring APIs.',
      formatter: formatRate,
      axisFormatter: formatRate,
      accentToken: 'teal',
      emptyTitle: 'No monitoring traffic yet',
      emptyDescription: 'This chart starts filling when the dashboard or another service calls the monitoring APIs.',
      emptyStateKind: 'no-traffic',
    },
    {
      metric: 'p95_rpc_latency',
      title: 'Monitoring response time',
      question: 'Are monitoring requests slowing down?',
      description: '95% of internal monitoring requests finish within this time. Lower is better.',
      formatter: formatSeconds,
      axisFormatter: formatSeconds,
      accentToken: 'amber',
      emptyTitle: 'No response-time samples yet',
      emptyDescription: 'There is no request history to measure yet. This is expected when traffic is zero.',
      emptyStateKind: 'no-traffic',
    },
  ],
  currentValues: (overview) => ({
    memory: { value: overview?.process.residentMemoryBytes },
    cpu: { value: overview?.process.cpuUsageRatio },
    rpc_rate: { value: overview?.rpc.requestsPerSecond },
    p95_rpc_latency: { value: overview?.rpc.p95LatencySeconds },
  }),
  technicalDetails: (overview) => {
    const requestRate = overview?.rpc.requestsPerSecond ?? null
    return {
      summary: 'Technical details for monitoring-service',
      rows: [
        { label: 'JavaScript heap', value: formatBytes(overview?.process.heapUsedBytes ?? Number.NaN) },
        {
          label: 'RPC p95 latency',
          value: requestRate === null ? '—' : requestRate <= 0.001 ? 'No traffic' : formatSeconds(overview?.rpc.p95LatencySeconds ?? Number.NaN),
        },
        { label: 'RPC error rate', value: formatPercent(overview?.rpc.errorRate ?? Number.NaN, 2) },
      ],
      note: 'These technical values belong to monitoring-service. Whole-server CPU, RAM, swap, and disk are available in the separate Server view.',
    }
  },
}
