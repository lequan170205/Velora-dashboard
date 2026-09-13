import type { MonitoringMetric } from '../api'
import {
  formatBytes,
  formatCount,
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

const CONVERSATION_WINDOW = 'rolling 5 min'

const formatConversationRate = (value: number) => {
  if (!Number.isFinite(value)) return '—'
  if (value === 0) return '0/s'
  if (value < 0.01) return '<0.01/s'
  return formatRate(value)
}

const SERIES: readonly MonitoringSeriesDefinition[] = [
  {
    metric: 'conversation_message_rate',
    title: 'New messages / second',
    question: 'How much real chat throughput is being created?',
    description: 'New user messages persisted per second. Idempotent retries are excluded.',
    formatter: formatConversationRate,
    axisFormatter: formatConversationRate,
    accent: '#45c9b8',
    fill: 'rgba(69, 201, 184, .10)',
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
    accent: '#7f8dff',
    fill: 'rgba(127, 141, 255, .12)',
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
    accent: '#f59a62',
    fill: 'rgba(245, 154, 98, .10)',
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
    accent: '#64c7ff',
    fill: 'rgba(100, 199, 255, .10)',
    emptyTitle: 'No socket samples yet',
    emptyDescription: 'Prometheus will populate this chart after collecting conversation-service samples.',
  },
]

export function ConversationSection() {
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
    errorMessage: 'Unable to load conversation-service metrics',
  })

  const conversation = overview?.conversation
  const serviceUp = conversation?.up ?? null
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
  const measuredFailureRate = errorRate === null
    ? null
    : errorRate + (rejectRate ?? 0)
  const chartCurrentValues: Partial<Record<MonitoringMetric, MonitoringCurrentValue>> = {
    conversation_message_rate: { value: conversation?.messagesPerSecond, context: CONVERSATION_WINDOW },
    conversation_send_rate: { value: conversation?.sendRequestsPerSecond, context: CONVERSATION_WINDOW },
    conversation_p95_send_latency: { value: conversation?.p95SendLatencySeconds, context: CONVERSATION_WINDOW },
    conversation_sockets: { value: conversation?.socketConnections, context: 'connected now' },
  }

  const reliabilityTone: Tone = serviceUp !== true
    ? serviceUp === false ? 'bad' : 'neutral'
    : !hasTraffic || measuredFailureRate === null
      ? 'neutral'
      : toneForThreshold(measuredFailureRate, 0.01, 0.05)

  const cards: readonly MetricCardDefinition[] = [
    {
      label: 'Service status',
      value: serviceUp === true ? 'Online' : serviceUp === false ? 'Offline' : '—',
      detail: hasData ? 'Prometheus scrape' : 'Waiting for data',
      helper: 'Can Prometheus scrape conversation-service?',
      badge: serviceUp === true ? 'Reachable' : serviceUp === false ? 'Unreachable' : 'Waiting',
      tone: serviceUp === true ? 'good' : serviceUp === false ? 'bad' : 'neutral',
    },
    {
      label: 'Active sockets',
      value: formatCount(conversation?.socketConnections ?? Number.NaN),
      detail: hasData ? 'Connected now' : 'Waiting for data',
      helper: 'Realtime Socket.IO clients currently connected.',
      badge: hasData ? 'Live' : 'Waiting',
      tone: 'neutral',
    },
    {
      label: 'New messages',
      value: formatConversationRate(conversation?.messagesPerSecond ?? Number.NaN),
      detail: rateDetail(conversation?.messagesPerSecond, 'messages'),
      helper: 'Persisted user messages, excluding idempotent retries.',
      badge: !hasData ? 'Waiting' : hasTraffic ? 'Active' : 'Idle',
      tone: 'neutral',
    },
    {
      label: 'Send attempts',
      value: formatConversationRate(sendRequestsPerSecond ?? Number.NaN),
      detail: rateDetail(sendRequestsPerSecond, 'send attempts'),
      helper: 'All send_message attempts, including successful, rejected, and failed outcomes.',
      badge: !hasData ? 'Waiting' : hasTraffic ? 'Active' : 'Idle',
      tone: 'neutral',
    },
    {
      label: 'Successful persistence',
      value: !hasData || !hasTraffic
        ? '—'
        : successRate === null
          ? '—'
          : formatPercent(successRate),
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
      value: !hasData || !hasTraffic
        ? '—'
        : rejectRate === null
          ? '—'
          : formatPercent(rejectRate),
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
      value: !hasData || !hasTraffic
        ? '—'
        : errorRate === null
          ? '—'
          : formatPercent(errorRate),
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
      value: !hasData || !hasTraffic
        ? '—'
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

  const healthTitle = serviceUp === false
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

  const healthDetail = serviceUp === true
    ? !hasTraffic
      ? 'Connections and scrape status are live. Send rates and outcomes will appear when traffic resumes.'
      : 'Send rates include successful, rejected, and failed attempts. Persistence p95 covers successful sends.'
    : 'Prometheus must be able to scrape conversation-service before throughput and latency can be trusted.'

  return (
    <section className="system-observability" aria-labelledby="conversation-observability-title" aria-busy={initialLoading}>
      <MonitoringToolbar
        eyebrow="Conversation service · realtime"
        title="Chat service performance"
        titleId="conversation-observability-title"
        description="Validated message persistence throughput, measured reliability, latency, socket connections, and runtime health from conversation-service."
        rangeLabel="Conversation history range"
        rangeHours={rangeHours}
        onRangeChange={setRangeHours}
        refreshing={refreshing}
        onRefresh={() => void refreshNow()}
      />

      <MonitoringError error={error} title="Conversation metrics are temporarily unavailable." hasData={hasData} />
      <HealthSummary tone={reliabilityTone} label="Quick read" title={healthTitle} detail={healthDetail} generatedAt={overview?.generatedAt} refreshing={refreshing} />
      <div className="conversation-window-note" role="note">
        <strong>Window</strong>
        <span>Connections: now</span>
        <span>Traffic & outcomes: rolling 5 min</span>
      </div>
      <div className="conversation-metric-groups">
        <section className="conversation-metric-group" aria-labelledby="conversation-live-title">
          <div className="conversation-metric-group-heading">
            <h3 id="conversation-live-title">Live</h3>
            <span>Now</span>
          </div>
          <MetricCardGrid cards={cards.slice(0, 2)} className="conversation-live-grid" refreshing={refreshing} />
        </section>
        <section className="conversation-metric-group" aria-labelledby="conversation-traffic-title">
          <div className="conversation-metric-group-heading">
            <h3 id="conversation-traffic-title">Traffic</h3>
            <span>Rolling 5 min</span>
          </div>
          <MetricCardGrid cards={cards.slice(2, 4)} className="conversation-traffic-grid" refreshing={refreshing} />
        </section>
        <section className="conversation-metric-group" aria-labelledby="conversation-outcomes-title">
          <div className="conversation-metric-group-heading">
            <h3 id="conversation-outcomes-title">Outcomes</h3>
            <span>Rolling 5 min</span>
          </div>
          <MetricCardGrid cards={cards.slice(4)} className="conversation-outcomes-grid" refreshing={refreshing} />
        </section>
      </div>
      <div className="conversation-history-heading">
        <h3>History</h3>
        <span>Rates are rolling 5-minute averages</span>
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
        <summary>Conversation-service runtime details</summary>
        <div><span>Process memory</span><strong>{formatBytes(conversation?.residentMemoryBytes ?? Number.NaN)}</strong></div>
        <div><span>Process CPU</span><strong>{formatCpu(conversation?.cpuSecondsPerSecond ?? Number.NaN)}</strong></div>
        <div><span>Event-loop p99</span><strong>{formatSeconds(conversation?.eventLoopP99Seconds ?? Number.NaN)}</strong></div>
        <p>These runtime values are aggregated across the currently scraped conversation-service instances. They become especially useful once k3s starts scaling replicas.</p>
      </details>
    </section>
  )
}
