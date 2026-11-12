import { toneForThreshold, type Tone } from '../formatters'
import type { MonitoringHost } from './api'

/* Pure host logic: which host is selected, how healthy each one is. Kept free
   of React so it can be unit-tested directly. */

/** Same thresholds the Server page has always used for its gauges. */
export const HOST_THRESHOLDS = {
  cpu: { warn: 0.7, bad: 0.9 },
  memory: { warn: 0.75, bad: 0.9 },
  disk: { warn: 0.8, bad: 0.92 },
} as const

const TONE_RANK: Record<Tone, number> = { neutral: 0, good: 1, warn: 2, bad: 3 }

const worstTone = (tones: readonly Tone[]): Tone =>
  tones.reduce<Tone>((worst, tone) => (TONE_RANK[tone] > TONE_RANK[worst] ? tone : worst), 'neutral')

export const cpuTone = (host: Pick<MonitoringHost, 'cpuUsageRatio'>): Tone =>
  toneForThreshold(host.cpuUsageRatio, HOST_THRESHOLDS.cpu.warn, HOST_THRESHOLDS.cpu.bad)

export const memoryTone = (host: Pick<MonitoringHost, 'memoryUsageRatio'>): Tone =>
  toneForThreshold(host.memoryUsageRatio, HOST_THRESHOLDS.memory.warn, HOST_THRESHOLDS.memory.bad)

export const diskTone = (host: Pick<MonitoringHost, 'diskUsageRatio'>): Tone =>
  toneForThreshold(host.diskUsageRatio, HOST_THRESHOLDS.disk.warn, HOST_THRESHOLDS.disk.bad)

/**
 * Which host the Servers page shows: the one in the URL if it still exists,
 * else the backend's default (the primary machine), else the first host. A
 * stale link to a removed host therefore falls back instead of showing nothing.
 */
export const resolveSelectedHostId = (
  hosts: readonly Pick<MonitoringHost, 'id'>[],
  requestedId: string | null | undefined,
  defaultHostId: string | null | undefined,
): string | null => {
  if (hosts.length === 0) return null
  if (requestedId && hosts.some((host) => host.id === requestedId)) return requestedId
  if (defaultHostId && hosts.some((host) => host.id === defaultHostId)) return defaultHostId
  return hosts[0].id
}

export type HostState = 'online' | 'offline' | 'unknown'

/** `up` is the scrape result of node-exporter; missing means Prometheus has not said. */
export const hostState = (host: Pick<MonitoringHost, 'up'>): HostState =>
  host.up === true ? 'online' : host.up === false ? 'offline' : 'unknown'

/** Overall tone of a host: offline is bad, otherwise its most loaded resource. */
export const hostTone = (host: MonitoringHost): Tone => {
  const state = hostState(host)
  if (state === 'offline') return 'bad'
  if (state === 'unknown') return 'neutral'

  // Online but no readings yet stays neutral: never claim it is healthy.
  return worstTone([cpuTone(host), memoryTone(host), diskTone(host)])
}

export type HostHealth = {
  tone: Tone
  label: string
  title: string
  detail: string
}

export const hostHealth = (host: MonitoringHost): HostHealth => {
  const state = hostState(host)

  if (state === 'offline') {
    return {
      tone: 'bad',
      label: 'Host status',
      title: 'Offline',
      detail:
        'Prometheus cannot scrape node-exporter on this host. Check that the VPS is up and that the exporter is reachable over the private network.',
    }
  }

  if (state === 'unknown') {
    return {
      tone: 'neutral',
      label: 'Host status',
      title: 'Status unavailable',
      detail: 'Prometheus returned no status sample, so the dashboard will not guess that the host is offline.',
    }
  }

  const tone = hostTone(host)
  return {
    tone,
    label: 'Host status',
    title:
      tone === 'bad'
        ? 'Under pressure'
        : tone === 'warn'
          ? 'Needs attention'
          : tone === 'good'
            ? 'Online'
            : 'Online, waiting for metrics',
    detail: 'These values describe the whole VPS, not a single container or Node.js process.',
  }
}

export type FleetSummary = {
  total: number
  online: number
  offline: number
  unknown: number
  /** Online hosts above a warning threshold. */
  attention: number
}

export const summarizeFleet = (hosts: readonly MonitoringHost[]): FleetSummary => {
  const summary: FleetSummary = { total: hosts.length, online: 0, offline: 0, unknown: 0, attention: 0 }

  for (const host of hosts) {
    const state = hostState(host)
    summary[state] += 1
    if (state === 'online') {
      const tone = hostTone(host)
      if (tone === 'warn' || tone === 'bad') summary.attention += 1
    }
  }

  return summary
}

/** "Vietnam · Contabo": where the host runs. */
export const hostPlace = (host: Pick<MonitoringHost, 'region' | 'provider'>): string =>
  [host.region, host.provider].filter((part): part is string => Boolean(part)).join(' · ')

/** "Primary · Vietnam · Contabo": the quiet line under a host name. */
export const hostSubtitle = (host: Pick<MonitoringHost, 'role' | 'region' | 'provider'>): string =>
  [host.role === 'primary' ? 'Primary' : 'Worker', hostPlace(host)].filter(Boolean).join(' · ')

/** Query string for jumping to the Servers page on one host. */
export const serverPathForHost = (hostId: string | null | undefined): string =>
  hostId ? `/server?${new URLSearchParams({ host: hostId })}` : '/server'
