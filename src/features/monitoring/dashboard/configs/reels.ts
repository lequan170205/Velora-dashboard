import {
  formatCount,
  formatPercent,
  formatRate,
  formatSeconds,
  toneForThreshold,
} from '../../formatters'
import type { InfraViewConfig, StatCardGroupVm } from '../types'

export const reelsConfig: InfraViewConfig = {
  id: 'reels',
  errorTitle: 'Reel pipeline metrics are temporarily unavailable.',
  errorMessage: 'Unable to load Reel pipeline metrics',
  toolbar: {
    eyebrow: 'Content · Media processing · Reel indexing',
    title: 'Reel pipeline observability',
    titleId: 'reel-pipeline-observability-title',
    description: 'End-to-end Reel state, media and indexing worker telemetry, retry behavior, index output, and RabbitMQ queue health.',
    rangeLabel: 'Reel history range',
    placement: 'top',
  },
  health: (overview, hasData) => {
    const reels = overview?.reels
    if (!hasData || reels?.snapshotUp == null) {
      return { tone: 'neutral', label: 'Quick read', title: 'Waiting for Reel telemetry', detail: 'Monitoring has not received a usable Reel pipeline snapshot yet.' }
    }
    if (!reels.snapshotUp || reels.rabbitmqUp === false) {
      return { tone: 'bad', label: 'Quick read', title: 'Reel monitoring has a dependency outage', detail: 'The Content snapshot or RabbitMQ Reel metrics endpoint is unavailable.' }
    }

    const media = reels.media
    const index = reels.index
    const mediaBacklogWithoutConsumers = (media?.queueReady ?? 0) > 0 && media?.consumers === 0
    const indexBacklogWithoutConsumers = (index?.queueReady ?? 0) > 0 && index?.consumers === 0
    if ((media?.dlqDepth ?? 0) > 0 || (index?.dlqDepth ?? 0) > 0 || mediaBacklogWithoutConsumers || indexBacklogWithoutConsumers) {
      return { tone: 'bad', label: 'Quick read', title: 'Reel queues need immediate attention', detail: 'A dead-letter queue has work, or a primary queue has backlog without consumers.' }
    }

    if (
      (reels.stalled ?? 0) > 0 ||
      (reels.recentFailed ?? 0) > 0 ||
      (media?.failureRate ?? 0) > 0.2 ||
      (index?.failureRate ?? 0) > 0.2 ||
      (media?.queueWaitP95Seconds ?? 0) > 120 ||
      (index?.queueWaitP95Seconds ?? 0) > 120
    ) {
      return { tone: 'warn', label: 'Quick read', title: 'Reel pipeline needs attention', detail: 'Recent failures, stalled work, elevated worker failures, or queue wait are visible.' }
    }

    return { tone: 'good', label: 'Quick read', title: 'Reel pipeline is healthy', detail: 'No stalled work, recent failures, queue outages, or dead-letter backlog are visible.' }
  },
  cardGroups: ({ overview, hasData }) => {
    const reels = overview?.reels
    const media = reels?.media
    const index = reels?.index
    const detail = hasData ? 'Latest / rolling 5 min' : 'Waiting for data'
    const groups: readonly StatCardGroupVm[] = [
      {
        id: 'end-to-end',
        heading: 'End-to-end',
        hint: 'Content state + create-to-ready',
        gridClassName: 'sm:grid-cols-2 xl:grid-cols-3',
        cards: [
          { label: 'Content snapshot', value: reels?.snapshotUp === true ? 'Online' : reels?.snapshotUp === false ? 'Unavailable' : '—', detail, helper: 'Whether monitoring-service can read the Content Reel snapshot.', badge: reels?.snapshotUp === true ? 'Healthy' : reels?.snapshotUp === false ? 'Down' : 'Waiting', tone: reels?.snapshotUp === true ? 'good' : reels?.snapshotUp === false ? 'bad' : 'neutral' },
          { label: 'RabbitMQ metrics', value: reels?.rabbitmqUp === true ? 'Online' : reels?.rabbitmqUp === false ? 'Unavailable' : '—', detail, helper: 'Whether Prometheus can scrape the RabbitMQ Reel queue metrics endpoint.', badge: reels?.rabbitmqUp === true ? 'Healthy' : reels?.rabbitmqUp === false ? 'Down' : 'Waiting', tone: reels?.rabbitmqUp === true ? 'good' : reels?.rabbitmqUp === false ? 'bad' : 'neutral' },
          { label: 'Queued Reels', value: formatCount(reels?.queued ?? Number.NaN), detail, helper: 'Reels waiting for media processing or indexing.', badge: 'Backlog', tone: toneForThreshold(reels?.queued ?? null, 10, 50) },
          { label: 'Recent failures', value: formatCount(reels?.recentFailed ?? Number.NaN), detail: hasData ? 'Last 15 min' : detail, helper: 'Reels whose processingFailedAt occurred during the last fifteen minutes.', badge: (reels?.recentFailed ?? 0) > 0 ? 'Watch' : 'Clear', tone: toneForThreshold(reels?.recentFailed ?? null, 1, 3) },
          { label: 'Stalled', value: formatCount(reels?.stalled ?? Number.NaN), detail: hasData ? '>10 min unchanged' : detail, helper: 'Queued or processing Reels unchanged for more than ten minutes.', badge: (reels?.stalled ?? 0) > 0 ? 'Watch' : 'Clear', tone: toneForThreshold(reels?.stalled ?? null, 1, 3) },
          { label: 'p95 create-to-ready', value: formatSeconds(reels?.readyLatencyP95Seconds ?? Number.NaN), detail: hasData ? 'Ready Reels · last 24h' : detail, helper: 'p95 elapsed time from Reel creation until READY.', badge: '24h', tone: 'neutral' },
        ],
      },
      {
        id: 'media',
        heading: 'Media processing',
        hint: 'Worker telemetry · rolling 5 min',
        gridClassName: 'sm:grid-cols-2 xl:grid-cols-3',
        cards: [
          { label: 'Throughput', value: formatRate(media?.throughputPerSecond ?? Number.NaN), detail, helper: 'Successful media pipelines completed per second.', badge: 'Success', tone: 'neutral' },
          { label: 'Failure rate', value: formatPercent(media?.failureRate ?? Number.NaN), detail, helper: 'Failed media pipeline attempts divided by all recent attempts.', badge: 'Failures', tone: toneForThreshold(media?.failureRate ?? null, 0.1, 0.2) },
          { label: 'Retry ratio', value: formatPercent(media?.retryRate ?? Number.NaN), detail, helper: 'Scheduled media retries relative to recent media pipeline attempts.', badge: 'Retries', tone: toneForThreshold(media?.retryRate ?? null, 0.2, 0.5) },
          { label: 'p95 processing', value: formatSeconds(media?.p95LatencySeconds ?? Number.NaN), detail, helper: 'p95 end-to-end media worker duration.', badge: 'Latency', tone: toneForThreshold(media?.p95LatencySeconds ?? null, 120, 300) },
          { label: 'p95 queue wait', value: formatSeconds(media?.queueWaitP95Seconds ?? Number.NaN), detail, helper: 'p95 time between enqueue and media worker pickup.', badge: 'Queue', tone: toneForThreshold(media?.queueWaitP95Seconds ?? null, 60, 120) },
          { label: 'Exhausted retries', value: formatRate(media?.exhaustedRetriesPerSecond ?? Number.NaN), detail, helper: 'Media jobs exhausting the configured retry budget per second.', badge: 'Retry budget', tone: toneForThreshold(media?.exhaustedRetriesPerSecond ?? null, 0.000001, 0.01) },
        ],
      },
      {
        id: 'indexing',
        heading: 'Reel indexing',
        hint: 'Worker + index output · rolling 5 min',
        gridClassName: 'sm:grid-cols-2 xl:grid-cols-4',
        cards: [
          { label: 'Throughput', value: formatRate(index?.throughputPerSecond ?? Number.NaN), detail, helper: 'Successful indexing pipelines completed per second.', badge: 'Success', tone: 'neutral' },
          { label: 'Failure rate', value: formatPercent(index?.failureRate ?? Number.NaN), detail, helper: 'Failed indexing attempts divided by all recent attempts.', badge: 'Failures', tone: toneForThreshold(index?.failureRate ?? null, 0.1, 0.2) },
          { label: 'Retry ratio', value: formatPercent(index?.retryRate ?? Number.NaN), detail, helper: 'Scheduled indexing retries relative to recent indexing attempts.', badge: 'Retries', tone: toneForThreshold(index?.retryRate ?? null, 0.2, 0.5) },
          { label: 'p95 indexing', value: formatSeconds(index?.p95LatencySeconds ?? Number.NaN), detail, helper: 'p95 end-to-end indexing worker duration.', badge: 'Latency', tone: toneForThreshold(index?.p95LatencySeconds ?? null, 60, 180) },
          { label: 'p95 queue wait', value: formatSeconds(index?.queueWaitP95Seconds ?? Number.NaN), detail, helper: 'p95 time between enqueue and index worker pickup.', badge: 'Queue', tone: toneForThreshold(index?.queueWaitP95Seconds ?? null, 60, 120) },
          { label: 'Chunks / second', value: formatRate(index?.chunksPerSecond ?? Number.NaN), detail, helper: 'Semantic chunks produced by completed index jobs per second.', badge: 'Output', tone: 'neutral' },
          { label: 'Zero-chunk rate', value: formatPercent(index?.zeroChunkRate ?? Number.NaN), detail, helper: 'Share of successful index jobs that produced zero semantic chunks.', badge: 'Quality', tone: toneForThreshold(index?.zeroChunkRate ?? null, 0.01, 0.05) },
          { label: 'Exhausted retries', value: formatRate(index?.exhaustedRetriesPerSecond ?? Number.NaN), detail, helper: 'Index jobs exhausting the configured retry budget per second.', badge: 'Retry budget', tone: toneForThreshold(index?.exhaustedRetriesPerSecond ?? null, 0.000001, 0.01) },
        ],
      },
      {
        id: 'queues',
        heading: 'Queue health',
        hint: 'RabbitMQ SHORT + LONG lanes',
        gridClassName: 'sm:grid-cols-2 xl:grid-cols-4',
        cards: [
          { label: 'Media ready', value: formatCount(media?.queueReady ?? Number.NaN), detail, helper: 'Ready messages in primary SHORT and LONG media queues.', badge: 'Primary', tone: toneForThreshold(media?.queueReady ?? null, 10, 50) },
          { label: 'Media unacked', value: formatCount(media?.queueUnacked ?? Number.NaN), detail, helper: 'Media messages delivered but not yet acknowledged.', badge: 'In flight', tone: 'neutral' },
          { label: 'Media consumers', value: formatCount(media?.consumers ?? Number.NaN), detail, helper: 'Consumers attached to primary media queues.', badge: 'Workers', tone: (media?.queueReady ?? 0) > 0 && media?.consumers === 0 ? 'bad' : 'neutral' },
          { label: 'Media retry depth', value: formatCount(media?.retryQueueDepth ?? Number.NaN), detail, helper: 'Ready messages waiting in media retry queues.', badge: 'Retry', tone: toneForThreshold(media?.retryQueueDepth ?? null, 1, 10) },
          { label: 'Media DLQ', value: formatCount(media?.dlqDepth ?? Number.NaN), detail, helper: 'Ready messages in media dead-letter queues.', badge: 'DLQ', tone: toneForThreshold(media?.dlqDepth ?? null, 1, 1) },
          { label: 'Media publish / delivery', value: `${formatRate(media?.publishRate ?? Number.NaN)} / ${formatRate(media?.deliveryRate ?? Number.NaN)}`, detail, helper: 'RabbitMQ media queue publish and delivery rates.', badge: 'Flow', tone: 'neutral' },
          { label: 'Index ready', value: formatCount(index?.queueReady ?? Number.NaN), detail, helper: 'Ready messages in primary SHORT and LONG indexing queues.', badge: 'Primary', tone: toneForThreshold(index?.queueReady ?? null, 10, 50) },
          { label: 'Index unacked', value: formatCount(index?.queueUnacked ?? Number.NaN), detail, helper: 'Index messages delivered but not yet acknowledged.', badge: 'In flight', tone: 'neutral' },
          { label: 'Index consumers', value: formatCount(index?.consumers ?? Number.NaN), detail, helper: 'Consumers attached to primary indexing queues.', badge: 'Workers', tone: (index?.queueReady ?? 0) > 0 && index?.consumers === 0 ? 'bad' : 'neutral' },
          { label: 'Index retry depth', value: formatCount(index?.retryQueueDepth ?? Number.NaN), detail, helper: 'Ready messages waiting in indexing retry queues.', badge: 'Retry', tone: toneForThreshold(index?.retryQueueDepth ?? null, 1, 10) },
          { label: 'Index DLQ', value: formatCount(index?.dlqDepth ?? Number.NaN), detail, helper: 'Ready messages in indexing dead-letter queues.', badge: 'DLQ', tone: toneForThreshold(index?.dlqDepth ?? null, 1, 1) },
          { label: 'Index publish / delivery', value: `${formatRate(index?.publishRate ?? Number.NaN)} / ${formatRate(index?.deliveryRate ?? Number.NaN)}`, detail, helper: 'RabbitMQ indexing queue publish and delivery rates.', badge: 'Flow', tone: 'neutral' },
        ],
      },
    ]
    return groups
  },
  historyHeading: { title: 'History', hint: 'Five-minute worker rates, quantiles, and queue depth' },
  historyEnabled: (overview) => overview?.reels !== undefined,
  series: [
    { metric: 'reel_queued', title: 'Queued Reels', question: 'Is end-to-end Reel backlog building up?', description: 'Current Reels waiting for media processing or indexing.', formatter: formatCount, axisFormatter: formatCount, accentToken: 'blue', emptyTitle: 'No queue samples yet', emptyDescription: 'Samples appear after the first successful Content snapshot.' },
    { metric: 'reel_ready_latency_p95', title: 'p95 create-to-ready latency', question: 'How long does Reel readiness take?', description: 'p95 create-to-READY latency among READY Reels created during the last 24 hours.', formatter: formatSeconds, axisFormatter: formatSeconds, accentToken: 'teal', emptyTitle: 'No readiness samples yet', emptyDescription: 'This metric requires at least one recent READY Reel.' },
    { metric: 'reel_media_throughput', title: 'Media throughput', question: 'How quickly is media processing completing?', description: 'Successful media pipelines completed per second.', formatter: formatRate, axisFormatter: formatRate, accentToken: 'blue', emptyTitle: 'No media throughput yet', emptyDescription: 'Samples appear after media jobs complete.' },
    { metric: 'reel_media_failure_rate', title: 'Media failure rate', question: 'What share of media attempts fail?', description: 'Failed media pipeline attempts divided by all recent attempts.', formatter: formatPercent, axisFormatter: formatPercent, accentToken: 'rose', emptyTitle: 'No media failure-rate samples yet', emptyDescription: 'A rate appears when media traffic is present.' },
    { metric: 'reel_media_queue_wait_p95', title: 'Media p95 queue wait', question: 'How long do media jobs wait before pickup?', description: 'p95 enqueue-to-worker-pickup time for media jobs.', formatter: formatSeconds, axisFormatter: formatSeconds, accentToken: 'amber', emptyTitle: 'No media queue-wait samples yet', emptyDescription: 'Queue wait appears after workers receive jobs.' },
    { metric: 'reel_media_queue_ready', title: 'Media primary backlog', question: 'How many media jobs are ready for delivery?', description: 'Ready messages across primary SHORT and LONG media queues.', formatter: formatCount, axisFormatter: formatCount, accentToken: 'indigo', emptyTitle: 'No media queue samples yet', emptyDescription: 'RabbitMQ detailed metrics populate this chart.' },
    { metric: 'reel_index_throughput', title: 'Index throughput', question: 'How quickly is Reel indexing completing?', description: 'Successful indexing pipelines completed per second.', formatter: formatRate, axisFormatter: formatRate, accentToken: 'blue', emptyTitle: 'No index throughput yet', emptyDescription: 'Samples appear after index jobs complete.' },
    { metric: 'reel_index_failure_rate', title: 'Index failure rate', question: 'What share of index attempts fail?', description: 'Failed indexing attempts divided by all recent attempts.', formatter: formatPercent, axisFormatter: formatPercent, accentToken: 'rose', emptyTitle: 'No index failure-rate samples yet', emptyDescription: 'A rate appears when indexing traffic is present.' },
    { metric: 'reel_index_queue_wait_p95', title: 'Index p95 queue wait', question: 'How long do index jobs wait before pickup?', description: 'p95 enqueue-to-worker-pickup time for indexing jobs.', formatter: formatSeconds, axisFormatter: formatSeconds, accentToken: 'amber', emptyTitle: 'No index queue-wait samples yet', emptyDescription: 'Queue wait appears after workers receive jobs.' },
    { metric: 'reel_index_chunk_rate', title: 'Index chunk output', question: 'How quickly is the semantic index producing chunks?', description: 'Semantic chunks emitted by successful indexing jobs per second.', formatter: formatRate, axisFormatter: formatRate, accentToken: 'teal', emptyTitle: 'No chunk output yet', emptyDescription: 'Chunk output appears after successful index jobs.' },
    { metric: 'reel_index_zero_chunk_rate', title: 'Zero-chunk rate', question: 'Are successful index jobs producing usable chunks?', description: 'Share of successful indexing attempts that emitted zero semantic chunks.', formatter: formatPercent, axisFormatter: formatPercent, accentToken: 'rose', emptyTitle: 'No zero-chunk samples yet', emptyDescription: 'This rate appears when successful indexing jobs are observed.' },
    { metric: 'reel_index_queue_ready', title: 'Index primary backlog', question: 'How many index jobs are ready for delivery?', description: 'Ready messages across primary SHORT and LONG indexing queues.', formatter: formatCount, axisFormatter: formatCount, accentToken: 'indigo', emptyTitle: 'No index queue samples yet', emptyDescription: 'RabbitMQ detailed metrics populate this chart.' },
  ],
  currentValues: (overview) => ({
    reel_queued: { value: overview?.reels?.queued },
    reel_ready_latency_p95: { value: overview?.reels?.readyLatencyP95Seconds },
    reel_media_throughput: { value: overview?.reels?.media?.throughputPerSecond },
    reel_media_failure_rate: { value: overview?.reels?.media?.failureRate },
    reel_media_queue_wait_p95: { value: overview?.reels?.media?.queueWaitP95Seconds },
    reel_media_queue_ready: { value: overview?.reels?.media?.queueReady },
    reel_index_throughput: { value: overview?.reels?.index?.throughputPerSecond },
    reel_index_failure_rate: { value: overview?.reels?.index?.failureRate },
    reel_index_queue_wait_p95: { value: overview?.reels?.index?.queueWaitP95Seconds },
    reel_index_chunk_rate: { value: overview?.reels?.index?.chunksPerSecond },
    reel_index_zero_chunk_rate: { value: overview?.reels?.index?.zeroChunkRate },
    reel_index_queue_ready: { value: overview?.reels?.index?.queueReady },
  }),
}
