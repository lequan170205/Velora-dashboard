import {
  badgeForThreshold,
  formatBytes,
  formatBytesAxis,
  formatCount,
  formatCpu,
  formatSeconds,
  toneForThreshold,
  type Tone,
} from '../../formatters'
import type { InfraViewConfig, StatCardVm } from '../types'

// One worker is one core. The capacity test saturated a worker near 95% core
// use, so warn well before that to leave room for real WebRTC overhead.
const MEDIA_WORKER_CPU_WARN = 0.6
const MEDIA_WORKER_CPU_BAD = 0.8

const TONE_RANK: Record<Tone, number> = { neutral: 0, good: 1, warn: 2, bad: 3 }
const worstTone = (...tones: Tone[]): Tone =>
  tones.reduce((worst, tone) => (TONE_RANK[tone] > TONE_RANK[worst] ? tone : worst), 'neutral' as Tone)

export const callServiceConfig: InfraViewConfig = {
  id: 'call-service',
  errorTitle: 'Call-service metrics are temporarily unavailable.',
  errorMessage: 'Unable to load call-service metrics',
  toolbar: {
    eyebrow: 'Call service · signaling',
    title: 'Call service performance',
    titleId: 'call-service-observability-title',
    description: 'Runtime health for Velora calls: signaling reachability, host CPU share, memory, event-loop delay, connected call sockets, and the media worker that forwards audio and video.',
    rangeLabel: 'Call service history range',
    placement: 'top',
  },
  health: (overview) => {
    const call = overview?.call
    const serviceUp = call?.up ?? null
    const eventLoopP99 = call?.eventLoopP99Seconds ?? null

    const tone: Tone = serviceUp === null
      ? 'neutral'
      : serviceUp === false
        ? 'bad'
        : worstTone(
            toneForThreshold(eventLoopP99, 0.1, 0.25),
            toneForThreshold(call?.mediaWorkerCpuRatio ?? null, MEDIA_WORKER_CPU_WARN, MEDIA_WORKER_CPU_BAD),
          )

    const title = serviceUp === null
      ? 'Call-service status is unavailable'
      : serviceUp === false
        ? 'Call service is offline'
        : tone === 'bad'
          ? 'Call service is under pressure'
          : tone === 'warn'
            ? 'Call service is online, but worth watching'
            : 'Call service is healthy'

    const detail = serviceUp === true
      ? 'CPU is the call-service process share of the whole host across all cores. Media worker CPU is separate: it is the share of one core, because a worker is single-threaded.'
      : 'Prometheus must be able to scrape call-service before runtime metrics can be trusted.'

    return { tone, label: 'Quick read', title, detail }
  },
  cardsGridClassName: 'sm:grid-cols-2 xl:grid-cols-3',
  cards: ({ overview, hasData }) => {
    const call = overview?.call
    const eventLoopP99 = call?.eventLoopP99Seconds ?? null

    const cards: readonly StatCardVm[] = [
      {
        label: 'Call sockets',
        value: formatCount(call?.socketConnections ?? Number.NaN),
        helper: 'Clients currently connected to call signaling.',
        badge: hasData ? 'Live' : 'Waiting',
        tone: hasData ? 'good' : 'neutral',
      },
      {
        label: 'Memory',
        value: formatBytes(call?.residentMemoryBytes ?? Number.NaN),
        detail: 'process RSS',
        helper: 'Resident memory for call-service only.',
        badge: hasData ? 'Service only' : 'Waiting',
        tone: hasData ? 'good' : 'neutral',
      },
      {
        label: 'CPU',
        value: formatCpu(call?.cpuUsageRatio ?? Number.NaN),
        detail: 'host share',
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
      {
        label: 'Media worker CPU',
        value: formatCpu(call?.mediaWorkerCpuRatio ?? Number.NaN),
        detail: 'busiest worker · 1 core',
        helper: 'Share of one CPU core used by the busiest mediasoup worker. A worker is single-threaded, so 100% means it cannot forward more media.',
        badge: badgeForThreshold(call?.mediaWorkerCpuRatio ?? null, MEDIA_WORKER_CPU_WARN, MEDIA_WORKER_CPU_BAD),
        tone: toneForThreshold(call?.mediaWorkerCpuRatio ?? null, MEDIA_WORKER_CPU_WARN, MEDIA_WORKER_CPU_BAD),
      },
      {
        label: 'Calls on media workers',
        value: formatCount(call?.mediaRooms ?? Number.NaN),
        detail: 'active rooms',
        helper: 'Calls currently holding a mediasoup room, including ringing calls that have prepared media.',
        badge: call?.mediaRooms == null ? 'Waiting' : 'Live',
        tone: call?.mediaRooms == null ? 'neutral' : 'good',
      },
    ]
    return cards
  },
  series: [
    {
      metric: 'call_cpu',
      variant: 'hero' as const,
      title: 'Call service CPU',
      question: 'How busy is the call signaling process?',
      description: 'Share of total host CPU capacity used by the call-service Node.js process. The value includes all host cores in its denominator.',
      formatter: formatCpu,
      axisFormatter: formatCpu,
      accentToken: 'indigo',
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
      accentToken: 'teal',
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
      accentToken: 'amber',
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
      accentToken: 'blue',
      emptyTitle: 'No call socket samples yet',
      emptyDescription: 'Socket history appears after Prometheus begins scraping call-service.',
    },
    {
      metric: 'call_media_worker_cpu',
      title: 'Media worker CPU',
      question: 'Is the media worker close to saturating its core?',
      description: 'Share of one CPU core used by the busiest mediasoup worker. Sustained values above about 80% leave no headroom for real-network overhead.',
      formatter: formatCpu,
      axisFormatter: formatCpu,
      accentToken: 'rose',
      emptyTitle: 'No media worker CPU history yet',
      emptyDescription: 'This appears once a call-service build that exports mediasoup worker metrics is scraped.',
    },
    {
      metric: 'call_media_rooms',
      title: 'Calls on media workers',
      question: 'How many calls is the media worker carrying?',
      description: 'Calls currently holding a mediasoup room. Compare with media worker CPU to see the CPU cost per call during a stress test.',
      formatter: formatCount,
      axisFormatter: formatCount,
      accentToken: 'indigo',
      emptyTitle: 'No media room samples yet',
      emptyDescription: 'Room counts appear after Prometheus scrapes the updated call-service.',
    },
  ],
  currentValues: (overview) => {
    const call = overview?.call
    return {
      call_cpu: { value: call?.cpuUsageRatio },
      call_memory: { value: call?.residentMemoryBytes },
      call_event_loop_p99: { value: call?.eventLoopP99Seconds },
      call_sockets: { value: call?.socketConnections },
      call_media_worker_cpu: { value: call?.mediaWorkerCpuRatio },
      call_media_rooms: { value: call?.mediaRooms },
    }
  },
}
