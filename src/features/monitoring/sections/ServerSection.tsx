import type { MonitoringMetric } from '../api'
import {
  badgeForThreshold,
  formatBytes,
  formatLoad,
  formatPercent,
  formatUptime,
  toneForThreshold,
  type Tone,
} from '../formatters'
import {
  HealthSummary,
  ContainerResourcesPanel,
  MetricCardGrid,
  MonitoringCharts,
  MonitoringError,
  MonitoringToolbar,
} from '../components'
import { useMonitoringView } from '../hooks/useMonitoringView'
import { useContainerResources } from '../hooks/useContainerResources'
import type {
  MetricCardDefinition,
  MonitoringCurrentValue,
  MonitoringSeriesDefinition,
  MonitoringTooltipSnapshot,
} from '../model'

const SERIES: readonly MonitoringSeriesDefinition[] = [
  {
    metric: 'host_cpu',
    title: 'Server CPU usage',
    question: 'How busy is the server?',
    description: 'CPU usage across the Ubuntu host. Sustained high usage can slow every Velora service.',
    formatter: formatPercent,
    axisFormatter: formatPercent,
    accent: '#7f8dff',
    fill: 'rgba(127, 141, 255, .12)',
    emptyTitle: 'No CPU history yet',
    emptyDescription: 'Node exporter will fill this chart after Prometheus collects a few host samples.',
    yAxis: {
      mode: 'adaptive',
      min: 0,
      max: 1,
      minSpan: 0.15,
      roundStep: 0.05,
      thresholds: [
        { value: 0.7, label: 'Watch 70%', tone: 'warn' },
        { value: 0.9, label: 'High 90%', tone: 'bad' },
      ],
    },
  },
  {
    metric: 'host_memory',
    title: 'Server RAM usage',
    question: 'Is the host running out of memory?',
    description: 'Real Ubuntu memory pressure based on MemAvailable, matching the useful view behind free -h.',
    formatter: formatPercent,
    axisFormatter: formatPercent,
    accent: '#42d392',
    fill: 'rgba(66, 211, 146, .10)',
    emptyTitle: 'No RAM history yet',
    emptyDescription: 'RAM history appears once node exporter has been scraped for a short time.',
    yAxis: {
      mode: 'adaptive',
      min: 0,
      max: 1,
      minSpan: 0.15,
      roundStep: 0.05,
      thresholds: [
        { value: 0.75, label: 'Watch 75%', tone: 'warn' },
        { value: 0.9, label: 'High 90%', tone: 'bad' },
      ],
    },
  },
  {
    metric: 'host_disk',
    title: 'Root disk usage',
    question: 'How full is the server disk?',
    description: 'Usage of the Ubuntu root filesystem. Disk pressure can break deployments, logs, and databases.',
    formatter: formatPercent,
    axisFormatter: formatPercent,
    accent: '#f5b84b',
    fill: 'rgba(245, 184, 75, .10)',
    emptyTitle: 'No disk history yet',
    emptyDescription: 'Root filesystem samples will appear after node exporter is available.',
    yAxis: {
      mode: 'adaptive',
      min: 0,
      max: 1,
      minSpan: 0.15,
      roundStep: 0.05,
      thresholds: [
        { value: 0.8, label: 'Watch 80%', tone: 'warn' },
        { value: 0.92, label: 'High 92%', tone: 'bad' },
      ],
    },
  },
  {
    metric: 'host_load1',
    title: '1-minute load average',
    question: 'How much work is waiting for CPU?',
    description: 'Linux 1-minute load average. Read it together with CPU usage rather than as a percentage.',
    formatter: formatLoad,
    axisFormatter: formatLoad,
    accent: '#64c7ff',
    fill: 'rgba(100, 199, 255, .10)',
    emptyTitle: 'No load history yet',
    emptyDescription: 'Load history will appear after Prometheus starts scraping the host.',
  },
]

const capacitySnapshot = (
  title: string,
  used: number | null | undefined,
  total: number | null | undefined,
  available: number | null | undefined,
): MonitoringTooltipSnapshot | undefined => {
  if (used == null || total == null || available == null) return undefined
  if (![used, total, available].every(Number.isFinite)) return undefined

  return {
    title,
    details: [
      { label: 'Used', value: `${formatBytes(used)} / ${formatBytes(total)} total` },
      { label: 'Available', value: formatBytes(available) },
    ],
  }
}

const usedContext = (used: number | null | undefined) =>
  used != null && Number.isFinite(used) ? `${formatBytes(used)} used` : null

type ServerSectionProps = {
  onOpenLogs?: (service: string) => void
}

export function ServerSection({ onOpenLogs }: ServerSectionProps) {
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
    errorMessage: 'Unable to load server metrics',
  })
  const containerResources = useContainerResources()

  const host = overview?.host
  const hostUp = host?.up ?? null
  const serverHealthy = hostUp === true
  const hostTone: Tone = hostUp === null ? 'neutral' : serverHealthy ? 'good' : 'bad'
  const chartCurrentValues: Partial<Record<MonitoringMetric, MonitoringCurrentValue>> = {
    host_cpu: { value: host?.cpuUsageRatio },
    host_memory: {
      value: host?.memoryUsageRatio,
      context: usedContext(host?.memoryUsedBytes),
    },
    host_disk: {
      value: host?.diskUsageRatio,
      context: usedContext(host?.diskUsedBytes),
    },
    host_load1: { value: host?.load1 },
  }
  const chartSnapshots: Partial<Record<MonitoringMetric, MonitoringTooltipSnapshot>> = {
    host_memory: capacitySnapshot(
      'Current host snapshot',
      host?.memoryUsedBytes,
      host?.memoryTotalBytes,
      host?.memoryAvailableBytes,
    ),
    host_disk: capacitySnapshot(
      'Current host snapshot',
      host?.diskUsedBytes,
      host?.diskTotalBytes,
      host?.diskAvailableBytes,
    ),
  }

  const primaryCards: readonly MetricCardDefinition[] = [
    {
      label: 'CPU usage',
      value: formatPercent(host?.cpuUsageRatio ?? Number.NaN),
      helper: 'Real CPU usage across the Ubuntu host.',
      badge: badgeForThreshold(host?.cpuUsageRatio ?? null, 0.7, 0.9),
      tone: toneForThreshold(host?.cpuUsageRatio ?? null, 0.7, 0.9),
    },
    {
      label: 'RAM used',
      value: `${formatBytes(host?.memoryUsedBytes ?? Number.NaN)} / ${formatBytes(host?.memoryTotalBytes ?? Number.NaN)}`,
      helper: `${formatBytes(host?.memoryAvailableBytes ?? Number.NaN)} available · comparable to free -h.`,
      badge: badgeForThreshold(host?.memoryUsageRatio ?? null, 0.75, 0.9),
      tone: toneForThreshold(host?.memoryUsageRatio ?? null, 0.75, 0.9),
    },
    {
      label: 'Root disk',
      value: `${formatBytes(host?.diskUsedBytes ?? Number.NaN)} / ${formatBytes(host?.diskTotalBytes ?? Number.NaN)}`,
      helper: `${formatBytes(host?.diskAvailableBytes ?? Number.NaN)} available on /.`,
      badge: badgeForThreshold(host?.diskUsageRatio ?? null, 0.8, 0.92),
      tone: toneForThreshold(host?.diskUsageRatio ?? null, 0.8, 0.92),
    },
  ]

  const secondaryFacts = [
    {
      label: 'Swap',
      value: `${formatBytes(host?.swapUsedBytes ?? Number.NaN)} / ${formatBytes(host?.swapTotalBytes ?? Number.NaN)}`,
    },
    { label: 'Load', value: formatLoad(host?.load1 ?? Number.NaN) },
    { label: 'Uptime', value: formatUptime(host?.uptimeSeconds ?? Number.NaN) },
  ] as const

  const healthTitle = hostUp === null
    ? 'Host status is unavailable'
    : serverHealthy
      ? 'Host online'
      : 'Host metrics are unavailable'

  const healthDetail = hostUp === null
    ? 'Prometheus returned no host status sample, so the dashboard will not guess that the server is offline.'
    : serverHealthy
      ? 'These values describe the whole Ubuntu machine, not a single container or Node.js process.'
      : 'Prometheus can see node-exporter but cannot currently scrape it. Check the exporter target and deployment.'

  return (
    <section className="server-observability" aria-labelledby="server-observability-title" aria-busy={initialLoading}>
      <h2 className="sr-only" id="server-observability-title">Server resources</h2>

      <MonitoringError error={error} title="Server metrics are temporarily unavailable." hasData={hasData} />
      <HealthSummary
        tone={hostTone}
        label="Host status"
        title={healthTitle}
        detail={healthDetail}
        generatedAt={overview?.generatedAt}
        refreshing={refreshing}
      />
      <MetricCardGrid cards={primaryCards} className="server-metric-grid" refreshing={refreshing} />
      <dl className="server-facts" aria-label="Additional host metrics">
        {secondaryFacts.map((fact) => (
          <div key={fact.label}>
            <dt>{fact.label}</dt>
            <dd>{fact.value}</dd>
          </div>
        ))}
      </dl>
      <ContainerResourcesPanel
        containers={containerResources.containers}
        generatedAt={containerResources.response?.generatedAt}
        dockerEngineUp={containerResources.response?.dockerEngineUp}
        error={containerResources.error}
        initialLoading={containerResources.initialLoading}
        refreshing={containerResources.refreshing}
        onRefresh={() => void containerResources.refreshNow()}
        onOpenLogs={onOpenLogs}
      />
      <details className="server-history">
        <summary>
          <span>History</span>
          <small>CPU · RAM · Disk · Load</small>
        </summary>
        <div className="server-history-content">
          <MonitoringToolbar
            eyebrow="Host history"
            title="Resource history"
            titleId="server-history-title"
            description="Historical host metrics from Prometheus node exporter."
            rangeLabel="Server history range"
            rangeHours={rangeHours}
            onRangeChange={setRangeHours}
            refreshing={refreshing}
            onRefresh={() => void refreshNow()}
          />
          <MonitoringCharts
            series={SERIES}
            history={history}
            historyErrors={historyErrors}
            currentValues={chartCurrentValues}
            snapshots={chartSnapshots}
            className="server-chart-grid"
            initialLoading={initialLoading}
            historyRefreshing={historyRefreshing}
          />
        </div>
      </details>
    </section>
  )
}
