import {
  formatCount,
  formatPercent,
  formatRate,
  formatSeconds,
  toneForThreshold,
} from '../../formatters'
import type { InfraViewConfig, StatCardGroupVm } from '../types'

const formatTokenRate = (value: number) =>
  Number.isFinite(value) ? `${value.toFixed(value >= 100 ? 0 : 1)} tok/s` : '—'

const formatTokens = (value: number) =>
  Number.isFinite(value) ? `${formatCount(value)} tokens` : '—'

const formatAverage = (value: number) =>
  Number.isFinite(value) ? value.toFixed(value >= 10 ? 1 : 2) : '—'

export const ragConfig: InfraViewConfig = {
  id: 'rag',
  errorTitle: 'RAG metrics are temporarily unavailable.',
  errorMessage: 'Unable to load RAG monitoring metrics',
  toolbar: {
    eyebrow: 'AI service · RAG',
    title: 'RAG performance and token usage',
    titleId: 'rag-observability-title',
    description: 'End-to-end request outcomes, retrieval and verification signals, retries, and provider-reported structured LLM token usage.',
    rangeLabel: 'RAG history range',
    placement: 'top',
  },
  health: (overview, hasData) => {
    const rag = overview?.rag
    if (!hasData) {
      return { tone: 'neutral', label: 'Quick read', title: 'Waiting for RAG telemetry', detail: 'Monitoring data has not loaded yet.' }
    }

    const requestRate = rag?.requestsPerSecond ?? null
    const failureRate = rag?.failureRate ?? null
    if (requestRate === null || requestRate === 0) {
      return { tone: 'neutral', label: 'Quick read', title: 'No recent RAG traffic', detail: 'Telemetry is available; rate-based quality metrics appear when requests arrive.' }
    }

    const tone = toneForThreshold(failureRate, 0.05, 0.1)
    return {
      tone,
      label: 'Quick read',
      title: tone === 'good' ? 'RAG requests are completing reliably' : 'RAG failures need attention',
      detail: 'Rates use rolling five-minute Prometheus windows. Token values come from provider diagnostics, not text-length estimates.',
    }
  },
  cardGroups: ({ overview, hasData }) => {
    const rag = overview?.rag
    const detail = hasData ? 'Rolling 5 min' : 'Waiting for data'
    const groups: readonly StatCardGroupVm[] = [
      {
        id: 'traffic',
        heading: 'Traffic and latency',
        hint: 'Rolling 5 min',
        gridClassName: 'sm:grid-cols-2 xl:grid-cols-4',
        cards: [
          { label: 'Request rate', value: formatRate(rag?.requestsPerSecond ?? Number.NaN), detail, helper: 'RAG workflow requests per second.', badge: 'Traffic', tone: 'neutral' },
          { label: 'Failure rate', value: formatPercent(rag?.failureRate ?? Number.NaN), detail, helper: 'Share of RAG workflows ending in FAILED.', badge: rag?.failureRate == null ? 'Waiting' : rag.failureRate < 0.05 ? 'Healthy' : 'Watch', tone: toneForThreshold(rag?.failureRate ?? null, 0.05, 0.1) },
          { label: 'p95 latency', value: formatSeconds(rag?.p95LatencySeconds ?? Number.NaN), detail, helper: 'End-to-end RAG workflow p95 latency.', badge: rag?.p95LatencySeconds == null ? 'Waiting' : rag.p95LatencySeconds < 10 ? 'Healthy' : 'Watch', tone: toneForThreshold(rag?.p95LatencySeconds ?? null, 10, 20) },
          { label: 'Avg retrieved chunks', value: formatAverage(rag?.avgRetrievedChunks ?? Number.NaN), detail, helper: 'Average retrieved chunks per request.', badge: 'Retrieval', tone: 'neutral' },
        ],
      },
      {
        id: 'quality',
        heading: 'Quality proxies',
        hint: 'Rolling 5 min',
        gridClassName: 'sm:grid-cols-2 xl:grid-cols-4',
        cards: [
          { label: 'Context insufficient', value: formatPercent(rag?.contextInsufficientRate ?? Number.NaN), detail, helper: 'Requests rejected by the context sufficiency gate.', badge: 'Context', tone: toneForThreshold(rag?.contextInsufficientRate ?? null, 0.1, 0.25) },
          { label: 'Verifier failures', value: formatPercent(rag?.verifierFailureRate ?? Number.NaN), detail, helper: 'Requests whose answer verifier did not pass.', badge: 'Verifier', tone: toneForThreshold(rag?.verifierFailureRate ?? null, 0.1, 0.25) },
          { label: 'Fallback rate', value: formatPercent(rag?.fallbackRate ?? Number.NaN), detail, helper: 'Requests using a routing or answer fallback.', badge: 'Fallback', tone: toneForThreshold(rag?.fallbackRate ?? null, 0.1, 0.25) },
          { label: 'Retries / request', value: formatAverage(rag?.retriesPerRequest ?? Number.NaN), detail, helper: 'Answer, retrieval, and citation retries per request.', badge: 'Retries', tone: toneForThreshold(rag?.retriesPerRequest ?? null, 0.5, 1) },
        ],
      },
      {
        id: 'tokens',
        heading: 'Token usage',
        hint: 'Provider reported',
        gridClassName: 'sm:grid-cols-2 xl:grid-cols-5',
        cards: [
          { label: 'Input tokens', value: formatTokenRate(rag?.inputTokensPerSecond ?? Number.NaN), detail, helper: 'Provider-reported structured LLM input tokens per second.', badge: 'Input', tone: 'neutral' },
          { label: 'Output tokens', value: formatTokenRate(rag?.outputTokensPerSecond ?? Number.NaN), detail, helper: 'Provider-reported structured LLM output tokens per second.', badge: 'Output', tone: 'neutral' },
          { label: 'Total tokens', value: formatTokenRate(rag?.totalTokensPerSecond ?? Number.NaN), detail, helper: 'Combined structured LLM tokens per second.', badge: 'Total', tone: 'neutral' },
          { label: 'Avg tokens / request', value: formatTokens(rag?.avgTokensPerRequest ?? Number.NaN), detail, helper: 'Average structured LLM tokens consumed by one RAG request.', badge: 'Average', tone: 'neutral' },
          { label: 'p95 tokens / request', value: formatTokens(rag?.p95TokensPerRequest ?? Number.NaN), detail, helper: 'p95 structured LLM tokens consumed by one RAG request.', badge: 'p95', tone: 'neutral' },
        ],
      },
    ]
    return groups
  },
  historyHeading: { title: 'History', hint: 'Five-minute rolling rates and quantiles' },
  historyEnabled: (overview) => overview?.rag !== undefined,
  series: [
    { metric: 'rag_request_rate', title: 'RAG requests / second', question: 'How much RAG traffic is arriving?', description: 'Observed RAG workflow request rate.', formatter: formatRate, axisFormatter: formatRate, accentToken: 'blue', emptyTitle: 'No RAG traffic yet', emptyDescription: 'This chart appears after RAG telemetry is observed.', emptyStateKind: 'no-traffic' },
    { metric: 'rag_failure_rate', title: 'Failure rate', question: 'What share of RAG requests fail?', description: 'FAILED outcomes divided by all observed RAG requests.', formatter: formatPercent, axisFormatter: formatPercent, accentToken: 'rose', emptyTitle: 'No failure-rate samples yet', emptyDescription: 'A rate is available when RAG traffic is present.', emptyStateKind: 'no-traffic' },
    { metric: 'rag_p95_latency', title: 'p95 latency', question: 'How long do slow RAG requests take?', description: 'End-to-end RAG workflow p95 latency.', formatter: formatSeconds, axisFormatter: formatSeconds, accentToken: 'amber', emptyTitle: 'No latency samples yet', emptyDescription: 'Latency appears after RAG requests complete.' },
    { metric: 'rag_total_token_rate', title: 'Total tokens / second', question: 'How quickly is RAG consuming model tokens?', description: 'Provider-reported structured LLM token throughput.', formatter: formatTokenRate, axisFormatter: formatTokenRate, accentToken: 'indigo', emptyTitle: 'No token samples yet', emptyDescription: 'Token usage appears when provider diagnostics include usage.' },
    { metric: 'rag_avg_tokens_per_request', title: 'Average tokens / request', question: 'How token-heavy is a typical RAG request?', description: 'Total structured LLM token rate divided by request rate.', formatter: formatTokens, axisFormatter: formatCount, accentToken: 'teal', emptyTitle: 'No per-request token samples yet', emptyDescription: 'This chart requires both request and token telemetry.' },
    { metric: 'rag_context_insufficient_rate', title: 'Context-insufficient rate', question: 'How often is retrieved evidence insufficient?', description: 'Share of requests rejected by the context sufficiency gate.', formatter: formatPercent, axisFormatter: formatPercent, accentToken: 'amber', emptyTitle: 'No context-gate samples yet', emptyDescription: 'This chart appears with RAG traffic.' },
    { metric: 'rag_verifier_failure_rate', title: 'Verifier-failure rate', question: 'How often does answer verification fail?', description: 'Share of observed requests whose verifier did not pass.', formatter: formatPercent, axisFormatter: formatPercent, accentToken: 'rose', emptyTitle: 'No verifier samples yet', emptyDescription: 'This chart appears with RAG traffic.' },
    { metric: 'rag_fallback_rate', title: 'Fallback rate', question: 'How often does RAG use a fallback?', description: 'Share of requests using an answer or routing fallback.', formatter: formatPercent, axisFormatter: formatPercent, accentToken: 'blue', emptyTitle: 'No fallback samples yet', emptyDescription: 'This chart appears with RAG traffic.' },
  ],
  currentValues: (overview) => ({
    rag_request_rate: { value: overview?.rag?.requestsPerSecond },
    rag_failure_rate: { value: overview?.rag?.failureRate },
    rag_p95_latency: { value: overview?.rag?.p95LatencySeconds },
    rag_total_token_rate: { value: overview?.rag?.totalTokensPerSecond },
    rag_avg_tokens_per_request: { value: overview?.rag?.avgTokensPerRequest },
    rag_context_insufficient_rate: { value: overview?.rag?.contextInsufficientRate },
    rag_verifier_failure_rate: { value: overview?.rag?.verifierFailureRate },
    rag_fallback_rate: { value: overview?.rag?.fallbackRate },
  }),
}
