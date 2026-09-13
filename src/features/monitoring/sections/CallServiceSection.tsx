import type { MonitoringMetric } from '../api'
import {
  badgeForThreshold,
  formatBytes,
  formatBytesAxis,
  formatCount,
  formatCpu,
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

const SERIES: readonly MonitoringSeriesDefinition[] = [
  {
    metric: 'call_cpu',
    title: 'Call service CPU',
    question: 'How busy is the call signaling process?',
    description: 'Share of total host CPU capacity used by the call-service Node.js process. The value includes all host cores in its denominator.',
    formatter: formatCpu,
    axisFormatter: formatCpu,
    accent: '#7f8dff',
    fill: 'rgba(127, 141, 255, .12)',
    emptyTitle: 'No call CPU history yet',
    emptyDescription: 'Prometheus will populate this chart after collecting call-service samples.',
  },
  {
    metric: 'call_memory',
    title: 'Call service memory',
    question: 'Is call-service memory growing over time?',
    description: 'Resident memory used by the call-service Node.js process. It does not include Mediasoup worker memory yet.',
    formatter: formatBytes,
    axisFormatter: formatBytesAxis,
    accent: '#42d392',
    fill: 'rgba(66, 211, 146, .10)',
    emptyTitle: 'No call memory history yet',
    emptyDescription: 'Memory history appears after Prometheus has scraped call-service for a short time.',
  },
  {
    metric: 'call_event_loop_p99',
    title: 'Call service event-loop p99',
    question: 'Can the signaling process react quickly?',
    description: 'p99 Node.js event-loop delay for call signaling. Sustained delay can make signaling feel sluggish.',
    formatter: formatSeconds,
    axisFormatter: formatSeconds,
    accent: '#f5b84b',
    fill: 'rgba(245, 184, 75, .10)',
    emptyTitle: 'No event-loop history yet',
    emptyDescription: 'Event-loop samples will appear after Prometheus collects call-service metrics.',
  },
  {
    metric: 'call_sockets',
    title: 'Call Socket.IO connections',
    question: 'How many clients are connected to call signaling?',
    description: 'Current Socket.IO clients connected to the /call namespace across scraped call-service instances.',
    formatter: formatCount,
    axisFormatter: formatCount,
    accent: '#64c7ff',
    fill: 'rgba(100, 199, 255, .10)',
    emptyTitle: 'No call socket samples yet',
    emptyDescription: 'Socket history appears after Prometheus begins scraping call-service.',
  },
]

export function CallServiceSection() {
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
    errorMessage: 'Unable to load call-service metrics',
  })

  const call = overview?.call
  const serviceUp = call?.up ?? null
  const eventLoopP99 = call?.eventLoopP99Seconds ?? null
  const chartCurrentValues: Partial<Record<MonitoringMetric, MonitoringCurrentValue>> = {
    call_cpu: { value: call?.cpuUsageRatio },
    call_memory: { value: call?.residentMemoryBytes },
    call_event_loop_p99: { value: call?.eventLoopP99Seconds },
    call_sockets: { value: call?.socketConnections },
  }

  const healthTone: Tone = serviceUp === null
    ? 'neutral'
    : serviceUp === false
      ? 'bad'
      : toneForThreshold(eventLoopP99, 0.1, 0.25)

  const healthTitle = serviceUp === null
    ? 'Call-service status is unavailable'
    : serviceUp === false
      ? 'Call service is offline'
      : healthTone === 'bad'
        ? 'Call signaling is delayed'
        : healthTone === 'warn'
          ? 'Call signaling is online, but worth watching'
          : 'Call signaling is healthy'

  const healthDetail = serviceUp === true
    ? 'CPU is the call-service process share of the whole host across all cores. Media-worker CPU remains part of the container breakdown on Server.'
    : 'Prometheus must be able to scrape call-service before runtime metrics can be trusted.'

  const cards: readonly MetricCardDefinition[] = [
    {
      label: 'Service status',
      value: serviceUp === true ? 'Online' : serviceUp === false ? 'Offline' : '—',
      helper: 'Can Prometheus scrape call-service?',
      badge: serviceUp === true ? 'Reachable' : serviceUp === false ? 'Unreachable' : 'Waiting',
      tone: serviceUp === true ? 'good' : serviceUp === false ? 'bad' : 'neutral',
    },
    {
      label: 'Connected call sockets',
      value: formatCount(call?.socketConnections ?? Number.NaN),
      helper: 'Clients currently connected to call signaling.',
      badge: hasData ? 'Live' : 'Waiting',
      tone: 'neutral',
    },
    {
      label: 'Process memory',
      value: formatBytes(call?.residentMemoryBytes ?? Number.NaN),
      helper: 'Resident memory for call-service only.',
      badge: hasData ? 'Service only' : 'Waiting',
      tone: 'neutral',
    },
    {
      label: 'Process CPU',
      value: formatCpu(call?.cpuUsageRatio ?? Number.NaN),
      helper: 'Share of total host CPU capacity used by the call-service process.',
      badge: badgeForThreshold(call?.cpuUsageRatio ?? null, 0.7, 0.9),
      tone: toneForThreshold(call?.cpuUsageRatio ?? null, 0.7, 0.9),
    },
    {
      label: 'Event-loop p99',
      value: formatSeconds(call?.eventLoopP99Seconds ?? Number.NaN),
      helper: 'Delay before call-service can react to signaling work.',
      badge: eventLoopP99 === null
        ? 'Waiting'
        : eventLoopP99 < 0.1
          ? 'Responsive'
          : eventLoopP99 < 0.25
            ? 'Watch'
            : 'Delayed',
      tone: toneForThreshold(eventLoopP99, 0.1, 0.25),
    },
  ]

  return (
    <section className="system-observability" aria-labelledby="call-service-observability-title" aria-busy={initialLoading}>
      <MonitoringToolbar
        eyebrow="Call service · signaling"
        title="Call service performance"
        titleId="call-service-observability-title"
        description="Runtime health for Velora call signaling: reachability, host CPU share, memory, event-loop delay, and connected call sockets."
        rangeLabel="Call service history range"
        rangeHours={rangeHours}
        onRangeChange={setRangeHours}
        refreshing={refreshing}
        onRefresh={() => void refreshNow()}
      />

      <MonitoringError error={error} title="Call-service metrics are temporarily unavailable." hasData={hasData} />
      <HealthSummary
        tone={healthTone}
        label="Quick read"
        title={healthTitle}
        detail={healthDetail}
        generatedAt={overview?.generatedAt}
        refreshing={refreshing}
      />
      <MetricCardGrid cards={cards} refreshing={refreshing} />

      <div className="monitoring-explainer">
        <strong>Scope of this view</strong>
        <p>These metrics describe call-service signaling only. CPU is shown as a share of the whole host across all cores; the Server breakdown includes the separate Mediasoup worker too.</p>
      </div>

      <MonitoringCharts
        series={SERIES}
        history={history}
        historyErrors={historyErrors}
        currentValues={chartCurrentValues}
        initialLoading={initialLoading}
        historyRefreshing={historyRefreshing}
      />
    </section>
  )
}
