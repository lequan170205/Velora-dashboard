import type { MonitoringContainers, MonitoringOverview } from '../monitoring/api'
import type { Values } from './api'

/** One point of the live view: what the server reports while a stress run is going. */
export type Sample = {
  t: number
  chatSockets: number | null
  msgPerSec: number | null
  p95Ms: number | null
  hostCpu: number | null
  callSockets: number | null
  mediaRooms: number | null
  workerCpu: number | null
  cpu: Record<string, number>
}

export const MAX_SAMPLES = 900
const pct = (ratio: number | null | undefined) => (ratio == null ? null : Math.round(ratio * 1000) / 10)

export function makeSample(t: number, overview: MonitoringOverview, containers: MonitoringContainers | undefined): Sample {
  const cpu: Record<string, number> = {}
  for (const c of containers?.containers ?? []) if (c.cpuCores != null) cpu[c.service] = Math.max(cpu[c.service] ?? 0, Math.round(c.cpuCores * 100) / 100)
  const latency = overview.conversation.p95SendLatencySeconds
  return {
    t: Math.max(0, Math.round(t * 10) / 10),
    chatSockets: overview.conversation.socketConnections ?? null,
    msgPerSec: overview.conversation.messagesPerSecond == null ? null : Math.round(overview.conversation.messagesPerSecond * 10) / 10,
    p95Ms: latency == null ? null : Math.round(latency * 1000),
    hostCpu: pct(overview.host.cpuUsageRatio),
    callSockets: overview.call.socketConnections ?? null,
    mediaRooms: overview.call.mediaRooms ?? null,
    workerCpu: pct(overview.call.mediaWorkerCpuRatio),
    cpu,
  }
}

export const appendSample = (series: Sample[], sample: Sample): Sample[] => [...series, sample].slice(-MAX_SAMPLES)

/** The busiest containers over the whole run, so the CPU chart shows who actually worked. */
export function topContainers(series: Sample[], count = 3): string[] {
  const peak = new Map<string, number>()
  for (const s of series) for (const [name, cores] of Object.entries(s.cpu)) peak.set(name, Math.max(peak.get(name) ?? 0, cores))
  return [...peak].sort((a, b) => b[1] - a[1]).slice(0, count).map(([name]) => name)
}

export type Phase = { label: string; seconds: number }

// Sockets opened per second; mirrors the stress agent so the bar matches the run it starts.
const rampFor = (sockets: number, max: number) => Math.min(max, Math.max(10, Math.round(sockets / 20)))
const num = (values: Values, key: string) => (typeof values[key] === 'number' ? (values[key] as number) : 0)

/** The phases of a run in order. Their lengths add up to the agent's estimate of the whole run. */
export function timelineFor(scenario: string, p: Values): Phase[] {
  if (scenario === 'chat') return [{ label: 'Sign in 50 users', seconds: 20 }, { label: 'Send messages', seconds: num(p, 'seconds') }]
  if (scenario === 'sockets') {
    const sockets = num(p, 'sockets')
    return [
      { label: 'Open sockets', seconds: Math.ceil(sockets / rampFor(sockets, 200)) }, { label: 'Hold connections', seconds: num(p, 'hold') },
      ...(p.storm === true ? [{ label: 'Drop and reconnect all', seconds: 30 }] : []), { label: 'Clean up', seconds: 15 },
    ]
  }
  if (scenario === 'calls') {
    return p.media === true
      ? [{ label: 'Start browser, set up calls', seconds: 30 }, { label: 'Hold calls with audio', seconds: num(p, 'seconds') }, { label: 'Clean up', seconds: 30 }]
      : [{ label: 'Place and end calls', seconds: num(p, 'seconds') }, { label: 'Clean up', seconds: 15 }]
  }
  const sockets = num(p, 'sockets')
  return [
    { label: 'Open sockets', seconds: Math.ceil(sockets / rampFor(sockets, 100)) }, { label: 'Settle', seconds: 10 },
    { label: 'Steady load', seconds: num(p, 'seconds') }, { label: 'Wind down', seconds: 60 },
  ]
}

export const timelineSeconds = (timeline: Phase[]) => timeline.reduce((n, phase) => n + phase.seconds, 0)

/** Index of the phase running at `elapsed` seconds; the last one once the plan is used up. */
export function phaseIndex(timeline: Phase[], elapsed: number): number {
  let end = 0
  for (const [index, phase] of timeline.entries()) {
    end += phase.seconds
    if (elapsed < end) return index
  }
  return Math.max(0, timeline.length - 1)
}

/** The values a one-click demo uses: the heaviest mixed level, with real audio when the agent has it. */
export function demoValues(media: boolean): Values {
  return { sockets: 2000, chat: 33, churn: 10, calls: media ? 10 : 0, seconds: 300 }
}
