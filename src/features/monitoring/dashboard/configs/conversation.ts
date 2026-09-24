import type { MonitoringMetric } from '../../api'
import {
  formatBytes,
  formatCount,
  formatCpu,
  formatPercent,
  formatRate,
  formatSeconds,
  toneForThreshold,
  type Tone,
} from '../../formatters'
import type { InfraViewConfig, StatCardGroupVm, StatCardVm } from '../types'

const CONVERSATION_WINDOW = 'rolling 5 min'

const formatConversationRate = (value: number) => {
  if (!Number.isFinite(value)) return '—'
  if (value === 0) return '0/s'
  if (value < 0.01) return '<0.01/s'
  return formatRate(value)
}

export const conversationConfig: InfraViewConfig = {
  id: 'conversation',
  errorTitle: 'Conversation metrics are temporarily unavailable.',
  errorMessage: 'Unable to load conversation-service metrics',
  toolbar: {
    eyebrow: 'Conversation service · realtime',
    title: 'Chat service performance',
    titleId: 'conversation-observability-title',
    description: 'Validated message persistence throughput, measured reliability, latency, socket connections, and runtime health from conversation-service.',
    rangeLabel: 'Conversation history range',
    placement: 'top',
  },
  health: (overview) => {
    const conversation = overview?.conversation
    const serviceUp = conversation?.up ?? null
    const sendRequestsPerSecond = conversation?.sendRequestsPerSecond ?? null
    const hasTraffic = sendRequestsPerSecond !== null && sendRequestsPerSecond > 0
    const rejectRate = conversation?.rejectRate ?? null
    const errorRate = conversation?.errorRate ?? null
    const measuredFailureRate = errorRate === null ? null : errorRate + (rejectRate ?? 0)

    const reliabilityTone: Tone = serviceUp !== true
      ? serviceUp === false ? 'bad' : 'neutral'
      : !hasTraffic || measuredFailureRate === null
        ? 'neutral'
        : toneForThreshold(measuredFailureRate, 0.01, 0.05)

    const title = serviceUp === false
      ? 'Conversation service is offline'
      : serviceUp === null
        ? 'Conversation-service status is unavailable'
        : !hasTraffic
          ? 'Conversation service online · no sends in 5 min'
          : reliabilityTone === 'good'
            ? 'Measured message persistence is healthy'
            : reliabilityTone === 'warn' || reliabilityTone === 'bad'
              ? 'Measured message persistence needs attention'
              : 'Conversation service is online'

    const detail = serviceUp === true
      ? !hasTraffic
        ? 'Connections and scrape status are live. Send rates and outcomes will appear when traffic resumes.'
        : 'Send rates include successful, rejected, and failed attempts. Persistence p95 covers successful sends.'
      : 'Prometheus must be able to scrape conversation-service before throughput and latency can be trusted.'

    return { tone: reliabilityTone, label: 'Quick read', title, detail }
  },
  cardGroups: ({ overview, hasData }) => {
    const conversation = overview?.conversation
    const successRate = conversation?.successRate ?? null
    const rejectRate = conversation?.rejectRate ?? null
    const errorRate = conversation?.errorRate ?? null
    const p95Latency = conversation?.p95SendLatencySeconds ?? null
    const sendRequestsPerSecond = conversation?.sendRequestsPerSecond ?? null
    const hasTraffic = sendRequestsPerSecond !== null && sendRequestsPerSecond > 0

    const rateDetail = (value: number | null | undefined, noun: string) => {
      if (!hasData) return 'Waiting for data'
      if (value == null || !Number.isFinite(value)) return 'Unavailable'
      return value === 0 ? `No ${noun} · ${CONVERSATION_WINDOW}` : `${CONVERSATION_WINDOW} average`
    }
    const outcomeDetail = (value: number | null, noun: string) => {
      if (!hasData) return 'Waiting for data'
      if (!hasTraffic) return `No ${noun} · ${CONVERSATION_WINDOW}`
      if (value === null) return 'Unavailable'
      return `${CONVERSATION_WINDOW} share`
    }
    const outcomeValue = (value: number | null, noun: string) => {
      if (!hasData) return '—'
      if (!hasTraffic) return `No ${noun}`
      return value === null ? '—' : formatPercent(value)
    }

    const liveCards: readonly StatCardVm[] = [
      {
        label: 'Active sockets',
        value: formatCount(conversation?.socketConnections ?? Number.NaN),
        detail: hasData ? 'Connected now' : 'Waiting for data',
        helper: 'Realtime Socket.IO clients currently connected.',
        badge: hasData ? 'Live' : 'Waiting',
        tone: hasData ? 'good' : 'neutral',
      },
    ]

    const trafficCards: readonly StatCardVm[] = [
      {
        label: 'New messages',
        value: formatConversationRate(conversation?.messagesPerSecond ?? Number.NaN),
        detail: rateDetail(conversation?.messagesPerSecond, 'messages'),
        helper: 'Persisted user messages, excluding idempotent retries.',
        badge: !hasData ? 'Waiting' : hasTraffic ? 'Active' : 'Idle',
        tone: !hasData ? 'neutral' : 'good',
      },
      {
        label: 'Send attempts',
        value: formatConversationRate(sendRequestsPerSecond ?? Number.NaN),
        detail: rateDetail(sendRequestsPerSecond, 'send attempts'),
        helper: 'All send_message attempts, including successful, rejected, and failed outcomes.',
        badge: !hasData ? 'Waiting' : hasTraffic ? 'Active' : 'Idle',
        tone: !hasData ? 'neutral' : 'good',
      },
    ]

    const outcomeCards: readonly StatCardVm[] = [
      {
        label: 'Successful persistence',
        value: outcomeValue(successRate, 'sends'),
        detail: outcomeDetail(successRate, 'sends'),
        helper: 'Share of measured persistence attempts that completed successfully.',
        badge: !hasData
          ? 'Waiting'
          : !hasTraffic
            ? 'Idle'
            : successRate === null
              ? 'Unavailable'
              : successRate >= 0.99
                ? 'Healthy'
                : 'Watch',
        tone: !hasTraffic || successRate === null
          ? 'neutral'
          : successRate >= 0.99
            ? 'good'
            : 'warn',
      },
      {
        label: 'Rejected sends',
        value: outcomeValue(rejectRate, 'rejects'),
        detail: outcomeDetail(rejectRate, 'sends'),
        helper: 'Rejected send_message attempts recorded by the conversation gateway.',
        badge: !hasData
            ? 'Waiting'
            : !hasTraffic
              ? 'Idle'
              : rejectRate === null
                ? 'Unavailable'
              : rejectRate < 0.01
                ? 'Low'
                : 'Watch',
        tone: rejectRate === null || !hasTraffic
          ? 'neutral'
          : toneForThreshold(rejectRate, 0.01, 0.05),
      },
      {
        label: 'Persistence errors',
        value: outcomeValue(errorRate, 'errors'),
        detail: outcomeDetail(errorRate, 'sends'),
        helper: 'Failures raised while persisting a validated message.',
        badge: !hasData
          ? 'Waiting'
          : !hasTraffic
            ? 'Idle'
            : errorRate === null
              ? 'Unavailable'
              : errorRate < 0.01
                ? 'Low'
                : 'Watch',
        tone: !hasTraffic || errorRate === null
          ? 'neutral'
          : toneForThreshold(errorRate, 0.01, 0.05),
      },
      {
        label: 'p95 persistence latency',
        value: !hasData
          ? '—'
          : !hasTraffic
            ? 'No samples'
            : p95Latency === null
              ? '—'
              : formatSeconds(p95Latency),
        detail: !hasData
          ? 'Waiting for data'
          : !hasTraffic
            ? `No samples · ${CONVERSATION_WINDOW}`
            : p95Latency === null
              ? 'Unavailable'
              : `${CONVERSATION_WINDOW} sample`,
        helper: 'Time spent in the measured SendMessageUseCase persistence path.',
        badge: !hasData
          ? 'Waiting'
          : !hasTraffic
            ? 'Idle'
            : p95Latency === null
              ? 'Unavailable'
              : p95Latency < 0.25
                ? 'Fast'
                : 'Watch',
        tone: !hasTraffic || p95Latency === null
          ? 'neutral'
          : toneForThreshold(p95Latency, 0.25, 0.75),
      },
    ]

    const groups: readonly StatCardGroupVm[] = [
      { id: 'live', heading: 'Live', hint: 'Now', gridClassName: 'sm:grid-cols-2', cards: liveCards },
      { id: 'traffic', heading: 'Traffic', hint: 'Rolling 5 min', gridClassName: 'sm:grid-cols-2', cards: trafficCards },
      { id: 'outcomes', heading: 'Outcomes', hint: 'Rolling 5 min', gridClassName: 'sm:grid-cols-2 xl:grid-cols-4', cards: outcomeCards },
    ]
    return groups
  },
  historyHeading: { title: 'History', hint: 'Rates are rolling 5-minute averages' },
  series: [
    {
      metric: 'conversation_message_rate',
      variant: 'hero' as const,
      title: 'New messages / second',
      question: 'How much real chat throughput is being created?',
      description: 'New user messages persisted per second. Idempotent retries are excluded.',
      formatter: formatConversationRate,
      axisFormatter: formatConversationRate,
      accentToken: 'teal',
      emptyTitle: 'No message throughput yet',
      emptyDescription: 'Send a few messages and Prometheus will begin building this history.',
      emptyStateKind: 'no-traffic',
    },
    {
      metric: 'conversation_send_rate',
      title: 'Send attempts / second',
      question: 'How many send_message requests are arriving?',
      description: 'All send_message outcomes: successful, rejected, and failed attempts.',
      formatter: formatConversationRate,
      axisFormatter: formatConversationRate,
      accentToken: 'indigo',
      emptyTitle: 'No send attempts yet',
      emptyDescription: 'This chart appears after the conversation gateway receives a send_message request.',
      emptyStateKind: 'no-traffic',
    },
    {
      metric: 'conversation_p95_send_latency',
      title: 'Message persistence p95 latency',
      question: 'How quickly are validated messages persisted?',
      description: '95% of measured SendMessageUseCase persistence attempts complete within this duration.',
      formatter: formatSeconds,
      axisFormatter: formatSeconds,
      accentToken: 'amber',
      emptyTitle: 'No persistence latency samples yet',
      emptyDescription: 'Latency history requires validated send traffic.',
      emptyStateKind: 'no-traffic',
    },
    {
      metric: 'conversation_sockets',
      title: 'Connected clients',
      question: 'How many realtime clients are connected?',
      description: 'Current Socket.IO clients across the scraped conversation-service instances.',
      formatter: formatCount,
      axisFormatter: formatCount,
      accentToken: 'blue',
      emptyTitle: 'No socket samples yet',
      emptyDescription: 'Prometheus will populate this chart after collecting conversation-service samples.',
    },
  ],
  currentValues: (overview) => {
    const conversation = overview?.conversation
    return {
      conversation_message_rate: { value: conversation?.messagesPerSecond, context: CONVERSATION_WINDOW },
      conversation_send_rate: { value: conversation?.sendRequestsPerSecond, context: CONVERSATION_WINDOW },
      conversation_p95_send_latency: { value: conversation?.p95SendLatencySeconds, context: CONVERSATION_WINDOW },
      conversation_sockets: { value: conversation?.socketConnections, context: 'connected now' },
    } satisfies Partial<Record<MonitoringMetric, { value: number | null | undefined; context?: string | null }>>
  },
  technicalDetails: (overview) => {
    const conversation = overview?.conversation
    return {
      summary: 'Conversation-service runtime details',
      rows: [
        { label: 'Process memory', value: formatBytes(conversation?.residentMemoryBytes ?? Number.NaN) },
        { label: 'Process CPU · host share', value: formatCpu(conversation?.cpuUsageRatio ?? Number.NaN) },
        { label: 'Event-loop p99', value: formatSeconds(conversation?.eventLoopP99Seconds ?? Number.NaN) },
      ],
      note: 'CPU is the process share of the whole host across all cores. Runtime values are aggregated across the currently scraped conversation-service instances.',
    }
  },
}
