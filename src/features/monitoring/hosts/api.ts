import { fetchApi } from '../../../shared/api/client'
import { fetchMonitoringOverview, type MonitoringOverview, type MonitoringPoint } from '../api'

type NullableMetric = number | null

export type HostRole = 'primary' | 'worker'

/** How container resources of a host can be read. */
export type HostContainerAccess = 'local' | 'remote' | 'none'

export type HostNetworkAccess = 'host' | 'unavailable'

/**
 * One monitored VPS: its identity (from the Prometheus target labels) and its
 * current state. Ratios are fractions (0..1) of the host's own capacity.
 */
export type MonitoringHost = {
  id: string
  name: string
  role: HostRole
  region: string | null
  provider: string | null
  /** node-exporter scrape address, e.g. 100.86.68.16:9100. */
  instance: string
  containers: HostContainerAccess
  /**
   * `unavailable` when the host's node-exporter cannot see the machine's network
   * interfaces, so it reports no network figures. Absent on an older backend.
   */
  network?: HostNetworkAccess
  up: boolean | null
  cpuUsageRatio: NullableMetric
  cpuCount: NullableMetric
  memoryTotalBytes: NullableMetric
  memoryAvailableBytes: NullableMetric
  memoryUsedBytes: NullableMetric
  memoryUsageRatio: NullableMetric
  swapTotalBytes: NullableMetric
  swapFreeBytes: NullableMetric
  swapUsedBytes: NullableMetric
  swapUsageRatio: NullableMetric
  diskTotalBytes: NullableMetric
  diskAvailableBytes: NullableMetric
  diskUsedBytes: NullableMetric
  diskUsageRatio: NullableMetric
  load1: NullableMetric
  uptimeSeconds: NullableMetric
  networkReceiveBytesPerSecond: NullableMetric
  networkTransmitBytesPerSecond: NullableMetric
}

export type MonitoringHosts = {
  generatedAt: string
  source: 'prometheus'
  /** The host to open first: the primary machine. */
  defaultHostId: string | null
  hosts: MonitoringHost[]
  /** True when the backend predates multi-host support and only the primary host is known. */
  legacy?: boolean
}

export type HostsHistoryMetric = 'host_cpu' | 'host_memory' | 'host_disk'

export type HostsHistory = {
  metric: HostsHistoryMetric
  from: string
  to: string
  stepSeconds: number
  series: { host: string; points: MonitoringPoint[] }[]
}

/* A backend deployed before multi-host support has no /monitoring/hosts. The
   dashboard and the backend deploy independently, so fall back to the single
   host block of the overview instead of leaving the page empty. */
const legacyFleet = async (signal?: AbortSignal): Promise<MonitoringHosts> => {
  const overview: MonitoringOverview = await fetchMonitoringOverview(signal)
  const { host } = overview

  return {
    generatedAt: overview.generatedAt,
    source: 'prometheus',
    defaultHostId: 'local',
    legacy: true,
    hosts: [
      {
        id: 'local',
        name: 'Server',
        role: 'primary',
        region: null,
        provider: null,
        instance: '',
        containers: 'local',
        up: host.up,
        cpuUsageRatio: host.cpuUsageRatio,
        cpuCount: null,
        memoryTotalBytes: host.memoryTotalBytes,
        memoryAvailableBytes: host.memoryAvailableBytes,
        memoryUsedBytes: host.memoryUsedBytes,
        memoryUsageRatio: host.memoryUsageRatio,
        swapTotalBytes: host.swapTotalBytes,
        swapFreeBytes: host.swapFreeBytes,
        swapUsedBytes: host.swapUsedBytes,
        swapUsageRatio: host.swapUsageRatio,
        diskTotalBytes: host.diskTotalBytes,
        diskAvailableBytes: host.diskAvailableBytes,
        diskUsedBytes: host.diskUsedBytes,
        diskUsageRatio: host.diskUsageRatio,
        load1: host.load1,
        uptimeSeconds: host.uptimeSeconds,
        networkReceiveBytesPerSecond: null,
        networkTransmitBytesPerSecond: null,
      },
    ],
  }
}

export const fetchMonitoringHosts = async (signal?: AbortSignal) => {
  const response = await fetchApi('/monitoring/hosts', { signal })
  if (response.status === 404) return legacyFleet(signal)
  if (!response.ok) throw new Error(`Unable to load hosts (${response.status})`)
  return (await response.json()) as MonitoringHosts
}

export const fetchHostsHistory = async ({
  metric,
  from,
  to,
  stepSeconds,
  signal,
}: {
  metric: HostsHistoryMetric
  from: string
  to: string
  stepSeconds: number
  signal?: AbortSignal
}) => {
  const search = new URLSearchParams({ metric, from, to, stepSeconds: String(stepSeconds) })
  const response = await fetchApi(`/monitoring/hosts/history?${search}`, { signal })
  if (!response.ok) throw new Error(`Unable to load host history (${response.status})`)
  return (await response.json()) as HostsHistory
}
