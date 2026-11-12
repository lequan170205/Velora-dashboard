import type { MonitoringMetric } from '../api'
import {
  badgeForThreshold,
  formatBytes,
  formatBytesPerSecond,
  formatLoad,
  formatPercent,
  formatUptime,
  toneForThreshold,
} from '../formatters'
import type {
  MonitoringCurrentValue,
  MonitoringTooltipDetail,
  MonitoringTooltipSnapshot,
} from '../model'
import type { FactVm, SeriesConfig, StatCardVm } from '../dashboard/types'
import type { MonitoringHost } from './api'
import { HOST_THRESHOLDS } from './model'

/* Everything the Servers page shows for one host, computed from its snapshot:
   the three gauges, the facts line and the history charts. The page template
   only renders these. */

export type HostSeriesConfig = Omit<SeriesConfig, 'tooltipDetails'> & {
  tooltipDetails?: (host: MonitoringHost | null, value: number) => readonly MonitoringTooltipDetail[]
}

const capacityDetails = (
  total: number | null | undefined,
  value: number,
): readonly MonitoringTooltipDetail[] => {
  if (total == null || !Number.isFinite(total) || total <= 0) return []
  return [
    { label: 'Approx. used', value: formatBytes(value * total) },
    { label: 'Capacity', value: formatBytes(total) },
  ]
}

const ratioAxis = (warn: { value: number; label: string }, bad: { value: number; label: string }) =>
  ({
    mode: 'adaptive' as const,
    min: 0,
    max: 1,
    minSpan: 0.15,
    roundStep: 0.05,
    thresholds: [
      { ...warn, tone: 'warn' as const },
      { ...bad, tone: 'bad' as const },
    ],
  })

export const HOST_SERIES: readonly HostSeriesConfig[] = [
  {
    metric: 'host_cpu',
    variant: 'hero',
    title: 'CPU usage',
    question: 'How busy is this server?',
    description: 'Rolling 1-minute CPU usage across all cores. Sustained high usage can slow every workload on the host.',
    formatter: formatPercent,
    axisFormatter: formatPercent,
    accentToken: 'indigo',
    emptyTitle: 'No CPU history yet',
    emptyDescription: 'Node exporter will fill this chart after Prometheus collects a few host samples.',
    yAxis: ratioAxis(
      { value: HOST_THRESHOLDS.cpu.warn, label: 'Watch 70%' },
      { value: HOST_THRESHOLDS.cpu.bad, label: 'High 90%' },
    ),
  },
  {
    metric: 'host_memory',
    title: 'RAM usage',
    question: 'Is the host running out of memory?',
    description: 'Host memory pressure based on MemAvailable, matching the useful view behind free -h.',
    formatter: formatPercent,
    axisFormatter: formatPercent,
    accentToken: 'teal',
    emptyTitle: 'No RAM history yet',
    emptyDescription: 'RAM history appears once node exporter has been scraped for a short time.',
    yAxis: ratioAxis(
      { value: HOST_THRESHOLDS.memory.warn, label: 'Watch 75%' },
      { value: HOST_THRESHOLDS.memory.bad, label: 'High 90%' },
    ),
    tooltipDetails: (host, value) => capacityDetails(host?.memoryTotalBytes, value),
  },
  {
    metric: 'host_disk',
    title: 'Disk usage',
    question: 'How full is the monitored storage?',
    description: 'Usage of the main filesystem node exporter reports for this host, the volume that holds its Docker data.',
    formatter: formatPercent,
    axisFormatter: formatPercent,
    accentToken: 'amber',
    emptyTitle: 'No disk history yet',
    emptyDescription: 'Monitored filesystem samples will appear after node exporter is available.',
    yAxis: ratioAxis(
      { value: HOST_THRESHOLDS.disk.warn, label: 'Watch 80%' },
      { value: HOST_THRESHOLDS.disk.bad, label: 'High 92%' },
    ),
    tooltipDetails: (host, value) => capacityDetails(host?.diskTotalBytes, value),
  },
  {
    metric: 'host_load1',
    title: '1-minute load average',
    question: 'How much work is waiting for CPU?',
    description: 'Linux 1-minute load average. Read it together with CPU usage rather than as a percentage.',
    formatter: formatLoad,
    axisFormatter: formatLoad,
    accentToken: 'blue',
    emptyTitle: 'No load history yet',
    emptyDescription: 'Load history will appear after Prometheus starts scraping the host.',
  },
  {
    metric: 'host_network_receive',
    title: 'Network in',
    question: 'How much traffic is the host receiving?',
    description: 'Bytes per second received on the physical network interfaces (container bridges and the Tailscale tunnel are not counted twice).',
    formatter: formatBytesPerSecond,
    axisFormatter: formatBytesPerSecond,
    accentToken: 'teal',
    emptyTitle: 'No traffic history yet',
    emptyDescription: 'Traffic history appears once node exporter has been scraped for a short time.',
  },
  {
    metric: 'host_network_transmit',
    title: 'Network out',
    question: 'How much traffic is the host sending?',
    description: 'Bytes per second sent on the physical network interfaces. Watch it on VPS plans with a monthly traffic quota.',
    formatter: formatBytesPerSecond,
    axisFormatter: formatBytesPerSecond,
    accentToken: 'rose',
    emptyTitle: 'No traffic history yet',
    emptyDescription: 'Traffic history appears once node exporter has been scraped for a short time.',
  },
]

const gaugeBadge = (host: MonitoringHost | null, ratio: number | null, warn: number, bad: number) =>
  host?.up === false ? 'Offline' : badgeForThreshold(ratio, warn, bad)

export const hostCards = (host: MonitoringHost | null): readonly StatCardVm[] => [
  {
    label: 'CPU',
    value: formatPercent(host?.cpuUsageRatio ?? Number.NaN),
    detail: host?.cpuCount != null ? `${host.cpuCount} ${host.cpuCount === 1 ? 'core' : 'cores'}` : undefined,
    helper: 'Rolling 1-minute CPU usage across all cores of this host. Opens the container breakdown.',
    badge: gaugeBadge(host, host?.cpuUsageRatio ?? null, HOST_THRESHOLDS.cpu.warn, HOST_THRESHOLDS.cpu.bad),
    tone: toneForThreshold(host?.cpuUsageRatio ?? null, HOST_THRESHOLDS.cpu.warn, HOST_THRESHOLDS.cpu.bad),
    dialog: 'cpu',
  },
  {
    label: 'RAM',
    value: formatPercent(host?.memoryUsageRatio ?? Number.NaN),
    detail: `${formatBytes(host?.memoryUsedBytes ?? Number.NaN)} / ${formatBytes(host?.memoryTotalBytes ?? Number.NaN)} · ${formatBytes(host?.memoryAvailableBytes ?? Number.NaN)} free`,
    helper: 'Host memory pressure, the useful view behind free -h. Opens the container breakdown.',
    badge: gaugeBadge(host, host?.memoryUsageRatio ?? null, HOST_THRESHOLDS.memory.warn, HOST_THRESHOLDS.memory.bad),
    tone: toneForThreshold(host?.memoryUsageRatio ?? null, HOST_THRESHOLDS.memory.warn, HOST_THRESHOLDS.memory.bad),
    meter: {
      ratio: host?.memoryUsageRatio ?? Number.NaN,
      warnAt: HOST_THRESHOLDS.memory.warn,
      badAt: HOST_THRESHOLDS.memory.bad,
    },
    dialog: 'memory',
  },
  {
    label: 'Disk',
    value: formatPercent(host?.diskUsageRatio ?? Number.NaN),
    detail: `${formatBytes(host?.diskUsedBytes ?? Number.NaN)} / ${formatBytes(host?.diskTotalBytes ?? Number.NaN)} · ${formatBytes(host?.diskAvailableBytes ?? Number.NaN)} free`,
    helper: 'Usage of the main filesystem node exporter reports for this host, the volume that holds its Docker data. Opens the container breakdown.',
    badge: gaugeBadge(host, host?.diskUsageRatio ?? null, HOST_THRESHOLDS.disk.warn, HOST_THRESHOLDS.disk.bad),
    tone: toneForThreshold(host?.diskUsageRatio ?? null, HOST_THRESHOLDS.disk.warn, HOST_THRESHOLDS.disk.bad),
    meter: {
      ratio: host?.diskUsageRatio ?? Number.NaN,
      warnAt: HOST_THRESHOLDS.disk.warn,
      badAt: HOST_THRESHOLDS.disk.bad,
    },
    dialog: 'disk',
  },
]

/** False when the host's exporter cannot see the machine's network interfaces. */
export const hasNetworkFigures = (host: Pick<MonitoringHost, 'network'> | null): boolean =>
  host?.network !== 'unavailable'

/** The history charts that make sense for this host. */
export const seriesForHost = (
  host: Pick<MonitoringHost, 'network'> | null,
  legacy = false,
): readonly HostSeriesConfig[] =>
  // A host without network visibility, or a backend that cannot serve the
  // traffic metrics, gets no traffic charts instead of empty or wrong ones.
  legacy || !hasNetworkFigures(host)
    ? HOST_SERIES.filter((item) => !item.metric.startsWith('host_network_'))
    : HOST_SERIES

export const hostFacts = (host: MonitoringHost | null): readonly FactVm[] => [
  { label: 'swap', value: `${formatBytes(host?.swapUsedBytes ?? Number.NaN)} / ${formatBytes(host?.swapTotalBytes ?? Number.NaN)}` },
  { label: 'load', value: formatLoad(host?.load1 ?? Number.NaN) },
  { label: 'uptime', value: formatUptime(host?.uptimeSeconds ?? Number.NaN) },
  ...(hasNetworkFigures(host)
    ? [
        { label: 'net in', value: formatBytesPerSecond(host?.networkReceiveBytesPerSecond ?? Number.NaN) },
        { label: 'net out', value: formatBytesPerSecond(host?.networkTransmitBytesPerSecond ?? Number.NaN) },
      ]
    : []),
]

const usedContext = (used: number | null | undefined) =>
  used != null && Number.isFinite(used) ? `${formatBytes(used)} used` : null

export const hostCurrentValues = (
  host: MonitoringHost | null,
): Partial<Record<MonitoringMetric, MonitoringCurrentValue>> => ({
  host_cpu: { value: host?.cpuUsageRatio },
  host_memory: { value: host?.memoryUsageRatio, context: usedContext(host?.memoryUsedBytes) },
  host_disk: { value: host?.diskUsageRatio, context: usedContext(host?.diskUsedBytes) },
  host_load1: { value: host?.load1 },
  host_network_receive: { value: host?.networkReceiveBytesPerSecond },
  host_network_transmit: { value: host?.networkTransmitBytesPerSecond },
})

const capacitySnapshot = (
  used: number | null | undefined,
  total: number | null | undefined,
  available: number | null | undefined,
): MonitoringTooltipSnapshot | undefined => {
  if (used == null || total == null || available == null) return undefined
  if (![used, total, available].every(Number.isFinite)) return undefined

  return {
    title: 'Current host snapshot',
    details: [
      { label: 'Used', value: `${formatBytes(used)} / ${formatBytes(total)} total` },
      { label: 'Available', value: formatBytes(available) },
    ],
  }
}

export const hostSnapshots = (
  host: MonitoringHost | null,
): Partial<Record<MonitoringMetric, MonitoringTooltipSnapshot>> => {
  const snapshots: Partial<Record<MonitoringMetric, MonitoringTooltipSnapshot>> = {}
  const memory = capacitySnapshot(host?.memoryUsedBytes, host?.memoryTotalBytes, host?.memoryAvailableBytes)
  const disk = capacitySnapshot(host?.diskUsedBytes, host?.diskTotalBytes, host?.diskAvailableBytes)
  if (memory) snapshots.host_memory = memory
  if (disk) snapshots.host_disk = disk
  return snapshots
}
