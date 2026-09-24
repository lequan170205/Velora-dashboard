import type { MonitoringMetric, MonitoringOverview } from '../../api'
import {
  badgeForThreshold,
  formatBytes,
  formatLoad,
  formatPercent,
  formatUptime,
  toneForThreshold,
  type Tone,
} from '../../formatters'
import type { MonitoringTooltipSnapshot } from '../../model'
import type { InfraViewConfig, ServerMetric, StatCardVm } from '../types'

const SERIES = [
  {
    metric: 'host_cpu' as const,
    variant: 'hero' as const,
    title: 'Server CPU usage',
    question: 'How busy is the server?',
    description: 'CPU usage across the monitored host. Sustained high usage can slow every Velora service.',
    formatter: formatPercent,
    axisFormatter: formatPercent,
    accentToken: 'indigo' as const,
    emptyTitle: 'No CPU history yet',
    emptyDescription: 'Node exporter will fill this chart after Prometheus collects a few host samples.',
    yAxis: {
      mode: 'adaptive' as const,
      min: 0,
      max: 1,
      minSpan: 0.15,
      roundStep: 0.05,
      thresholds: [
        { value: 0.7, label: 'Watch 70%', tone: 'warn' as const },
        { value: 0.9, label: 'High 90%', tone: 'bad' as const },
      ],
    },
  },
  {
    metric: 'host_memory' as const,
    title: 'Server RAM usage',
    question: 'Is the host running out of memory?',
    description: 'Host memory pressure based on MemAvailable, matching the useful view behind free -h.',
    formatter: formatPercent,
    axisFormatter: formatPercent,
    accentToken: 'teal' as const,
    emptyTitle: 'No RAM history yet',
    emptyDescription: 'RAM history appears once node exporter has been scraped for a short time.',
    yAxis: {
      mode: 'adaptive' as const,
      min: 0,
      max: 1,
      minSpan: 0.15,
      roundStep: 0.05,
      thresholds: [
        { value: 0.75, label: 'Watch 75%', tone: 'warn' as const },
        { value: 0.9, label: 'High 90%', tone: 'bad' as const },
      ],
    },
    tooltipDetails: (overview: MonitoringOverview | null, value: number) => {
      const total = overview?.host.memoryTotalBytes
      if (total == null || !Number.isFinite(total) || total <= 0) return []
      return [
        { label: 'Approx. used', value: formatBytes(value * total) },
        { label: 'Capacity', value: formatBytes(total) },
      ]
    },
  },
  {
    metric: 'host_disk' as const,
    title: 'Server disk usage',
    question: 'How full is the monitored storage?',
    description: 'Usage of the filesystem reported by node exporter for the Docker host.',
    formatter: formatPercent,
    axisFormatter: formatPercent,
    accentToken: 'amber' as const,
    emptyTitle: 'No disk history yet',
    emptyDescription: 'Monitored filesystem samples will appear after node exporter is available.',
    yAxis: {
      mode: 'adaptive' as const,
      min: 0,
      max: 1,
      minSpan: 0.15,
      roundStep: 0.05,
      thresholds: [
        { value: 0.8, label: 'Watch 80%', tone: 'warn' as const },
        { value: 0.92, label: 'High 92%', tone: 'bad' as const },
      ],
    },
    tooltipDetails: (overview: MonitoringOverview | null, value: number) => {
      const total = overview?.host.diskTotalBytes
      if (total == null || !Number.isFinite(total) || total <= 0) return []
      return [
        { label: 'Approx. used', value: formatBytes(value * total) },
        { label: 'Capacity', value: formatBytes(total) },
      ]
    },
  },
  {
    metric: 'host_load1' as const,
    title: '1-minute load average',
    question: 'How much work is waiting for CPU?',
    description: 'Linux 1-minute load average. Read it together with CPU usage rather than as a percentage.',
    formatter: formatLoad,
    axisFormatter: formatLoad,
    accentToken: 'blue' as const,
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

export const serverConfig: InfraViewConfig = {
  id: 'server',
  errorTitle: 'Server metrics are temporarily unavailable.',
  errorMessage: 'Unable to load server metrics',
  toolbar: {
    eyebrow: 'Host history',
    title: 'History',
    titleId: 'server-history-title',
    rangeLabel: 'Server history range',
    placement: 'history',
  },
  breakdown: true,
  hostStrip: { sparkMetric: 'host_cpu' },
  health: (overview) => {
    const hostUp = overview?.host.up ?? null
    const serverHealthy = hostUp === true
    const tone: Tone = hostUp === null ? 'neutral' : serverHealthy ? 'good' : 'bad'

    const title = hostUp === null
      ? 'Host status is unavailable'
      : serverHealthy
        ? 'Host online'
        : 'Host metrics are unavailable'

    const detail = hostUp === null
      ? 'Prometheus returned no host status sample, so the dashboard will not guess that the server is offline.'
      : serverHealthy
        ? 'These values describe the whole monitored host, not a single container or Node.js process.'
        : 'Prometheus can see node-exporter but cannot currently scrape it. Check the exporter target and deployment.'

    return { tone, label: 'Host status', title, detail }
  },
  cards: ({ overview }) => {
    const host = overview?.host

    const cards: readonly StatCardVm[] = [
      {
        label: 'CPU',
        value: formatPercent(host?.cpuUsageRatio ?? Number.NaN),
        helper: 'CPU usage across all cores on the monitored host. Opens the container breakdown.',
        badge: badgeForThreshold(host?.cpuUsageRatio ?? null, 0.7, 0.9),
        tone: toneForThreshold(host?.cpuUsageRatio ?? null, 0.7, 0.9),
        dialog: 'cpu',
      },
      {
        label: 'RAM',
        value: formatPercent(host?.memoryUsageRatio ?? Number.NaN),
        detail: `${formatBytes(host?.memoryUsedBytes ?? Number.NaN)} / ${formatBytes(host?.memoryTotalBytes ?? Number.NaN)} · ${formatBytes(host?.memoryAvailableBytes ?? Number.NaN)} free`,
        helper: 'Host memory pressure, the useful view behind free -h. Opens the container breakdown.',
        badge: badgeForThreshold(host?.memoryUsageRatio ?? null, 0.75, 0.9),
        tone: toneForThreshold(host?.memoryUsageRatio ?? null, 0.75, 0.9),
        meter: { ratio: host?.memoryUsageRatio ?? Number.NaN, warnAt: 0.75, badAt: 0.9 },
        dialog: 'memory',
      },
      {
        label: 'Disk',
        value: formatPercent(host?.diskUsageRatio ?? Number.NaN),
        detail: `${formatBytes(host?.diskUsedBytes ?? Number.NaN)} / ${formatBytes(host?.diskTotalBytes ?? Number.NaN)} · ${formatBytes(host?.diskAvailableBytes ?? Number.NaN)} free`,
        helper: 'Usage of the filesystem node exporter reports for the Docker host. Opens the container breakdown.',
        badge: badgeForThreshold(host?.diskUsageRatio ?? null, 0.8, 0.92),
        tone: toneForThreshold(host?.diskUsageRatio ?? null, 0.8, 0.92),
        meter: { ratio: host?.diskUsageRatio ?? Number.NaN, warnAt: 0.8, badAt: 0.92 },
        dialog: 'disk',
      },
    ]
    return cards
  },
  facts: (overview) => {
    const host = overview?.host
    return [
      { label: 'swap', value: `${formatBytes(host?.swapUsedBytes ?? Number.NaN)} / ${formatBytes(host?.swapTotalBytes ?? Number.NaN)}` },
      { label: 'load', value: formatLoad(host?.load1 ?? Number.NaN) },
      { label: 'uptime', value: formatUptime(host?.uptimeSeconds ?? Number.NaN) },
    ]
  },
  series: SERIES,
  currentValues: (overview) => {
    const host = overview?.host
    return {
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
    } satisfies Partial<Record<MonitoringMetric, { value: number | null | undefined; context?: string | null }>>
  },
  snapshots: (overview) => {
    const host = overview?.host
    return {
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
  },
}

export type { ServerMetric, MonitoringOverview }
