import type { MonitoringMetric, MonitoringOverview } from '../api'
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
} from '../formatters'
import {
  HealthSummary,
  MetricCardGrid,
  MonitoringCharts,
  MonitoringError,
  MonitoringToolbar,
} from '../components'
import { useMonitoringView } from '../hooks/useMonitoringView'
import type {
  MetricCardDefinition,
  MonitoringCurrentValue,
  MonitoringSeriesDefinition,
} from '../model'

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

const getHealthSummary = (overview: MonitoringOverview | null) => {
  if (!overview || overview.service.up === null) {
    return {
      tone: 'neutral' as Tone,
      title: 'Service status is unavailable',
      detail: 'Prometheus returned no monitoring-service target sample, so the dashboard will not guess a healthy value.',
    }
  }

  if (!overview.service.up) {
    return {
      tone: 'bad' as Tone,
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
    return { tone: 'bad' as Tone, title: 'The service needs attention', detail: 'The service is online, but errors or delays are high enough to investigate.' }
  }

  if (errorRate >= 0.01 || eventLoopMs >= 100 || (hasTraffic && latencyMs >= 500)) {
    return { tone: 'warn' as Tone, title: 'The service is online, but worth watching', detail: 'No outage is detected, but response delay or request errors are elevated.' }
  }

  return {
    tone: 'good' as Tone,
    title: 'Everything looks healthy',
    detail: hasTraffic
      ? 'The monitoring service is online, requests are succeeding, and its runtime is responsive.'
      : 'The monitoring service is online and responsive. There is no internal monitoring traffic right now.',
  }
}

const SERIES: readonly MonitoringSeriesDefinition[] = [
  {
    metric: 'memory',
    title: 'Monitoring service memory',
    question: 'Is this service using more memory over time?',
    description: 'RAM used by the monitoring-service process only, not the whole Ubuntu server. A steady climb matters more than a single spike.',
    formatter: formatBytes,
    axisFormatter: formatBytesAxis,
    accent: '#7c3aed',
    fill: '#ede9fe',
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
    accent: '#2563eb',
    fill: '#dbeafe',
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
    accent: '#0f766e',
    fill: '#ccfbf1',
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
    accent: '#c2410c',
    fill: '#ffedd5',
    emptyTitle: 'No response-time samples yet',
    emptyDescription: 'There is no request history to measure yet. This is expected when traffic is zero.',
    emptyStateKind: 'no-traffic',
  },
]

export function MonitoringSection() {
  const {
    overview,
    history,
    historyErrors,
    rangeHours,
    setRangeHours,
    error,
    initialLoading,
    refreshing,
    historyRefreshing,
    hasData,
    refreshNow,
  } = useMonitoringView({
    series: SERIES,
    errorMessage: 'Unable to load monitoring-service data',
  })

  const health = getHealthSummary(overview)
  const processCpuRatio = overview?.process.cpuUsageRatio ?? null
  const cpuState = {
    label: badgeForThreshold(processCpuRatio, 0.7, 0.9),
    tone: toneForThreshold(processCpuRatio, 0.7, 0.9),
  }
  const successState = successBadge(overview?.rpc.errorRate ?? Number.NaN)
  const responsivenessState = responsivenessBadge(overview?.process.eventLoopP99Seconds ?? Number.NaN)
  const serviceUp = overview?.service.up ?? null
  const requestRate = overview?.rpc.requestsPerSecond ?? null
  const chartCurrentValues: Partial<Record<MonitoringMetric, MonitoringCurrentValue>> = {
    memory: { value: overview?.process.residentMemoryBytes },
    cpu: { value: processCpuRatio },
    rpc_rate: { value: overview?.rpc.requestsPerSecond },
    p95_rpc_latency: { value: overview?.rpc.p95LatencySeconds },
  }

  const cards: readonly MetricCardDefinition[] = [
    {
      label: 'Service status',
      value: serviceUp === true ? 'Online' : serviceUp === false ? 'Offline' : '—',
      helper: 'Can Prometheus reach monitoring-service?',
      badge: serviceUp === true ? 'Reachable' : serviceUp === false ? 'Unreachable' : 'Waiting',
      tone: serviceUp === true ? 'good' : serviceUp === false ? 'bad' : 'neutral',
    },
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
      badge: cpuState.label,
      tone: cpuState.tone,
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

  return (
    <section className="system-observability" aria-labelledby="system-observability-title" aria-busy={initialLoading}>
      <MonitoringToolbar
        eyebrow="Monitoring service · live"
        title="How is Velora monitoring doing?"
        titleId="system-observability-title"
        description="These numbers describe the monitoring-service process. CPU is normalized to the whole host across all cores."
        rangeLabel="Monitoring history range"
        rangeHours={rangeHours}
        onRangeChange={setRangeHours}
        refreshing={refreshing}
        onRefresh={() => void refreshNow()}
      />

      <MonitoringError error={error} title="Monitoring-service data is temporarily unavailable." hasData={hasData} />
      <HealthSummary tone={health.tone} label="Quick read" title={health.title} detail={health.detail} generatedAt={overview?.generatedAt} refreshing={refreshing} />

      <div className="monitoring-scope-note" role="note">
        <div className="monitoring-scope-mark" aria-hidden="true">1</div>
        <div>
          <strong>You are looking at one Velora service, not the whole server.</strong>
          <p>Memory belongs to <b>monitoring-service</b> only. CPU is shown as the service share of the whole host across all cores.</p>
        </div>
        <span className="monitoring-scope-badge">See Server view for host totals</span>
      </div>

      <MetricCardGrid cards={cards} refreshing={refreshing} />

      <div className="monitoring-explainer">
        <strong>How to read these charts</strong>
        <p>Every chart here is scoped to monitoring-service. Look for sudden jumps or a trend that keeps rising. Hover over a line to see the exact value and time. Empty traffic charts are normal when no monitoring requests are being made.</p>
      </div>

      <MonitoringCharts
        series={SERIES}
        history={history}
        historyErrors={historyErrors}
        currentValues={chartCurrentValues}
        initialLoading={initialLoading}
        historyRefreshing={historyRefreshing}
      />

      <details className="technical-details">
        <summary>Technical details for monitoring-service</summary>
        <div><span>JavaScript heap</span><strong>{formatBytes(overview?.process.heapUsedBytes ?? Number.NaN)}</strong></div>
        <div>
          <span>RPC p95 latency</span>
          <strong>{requestRate === null ? '—' : requestRate <= 0.001 ? 'No traffic' : formatSeconds(overview?.rpc.p95LatencySeconds ?? Number.NaN)}</strong>
        </div>
        <div><span>RPC error rate</span><strong>{formatPercent(overview?.rpc.errorRate ?? Number.NaN, 2)}</strong></div>
        <p>These technical values belong to monitoring-service. Whole-server CPU, RAM, swap, and disk are available in the separate Server view.</p>
      </details>
    </section>
  )
}
