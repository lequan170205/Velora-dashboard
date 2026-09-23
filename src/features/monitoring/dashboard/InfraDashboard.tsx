import { useQueries, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import type { MonitoringMetric, MonitoringPoint } from '../api'
import { fetchMonitoringTimeseries } from '../api'
import { HISTORY_REFRESH_INTERVAL_MS } from '../freshness'
import { RANGE_OPTIONS, type RangeHours } from '../model'
import { useOverviewQuery } from '../hooks/useOverviewQuery'
import { useContainerResourcesQuery } from '../hooks/useContainerResourcesQuery'
import type { InfraViewConfig, ServerMetric } from './types'
import { BreakdownDialog } from './components/BreakdownDialog'
import { ErrorBanner } from './components/ErrorBanner'
import { FactsRow } from './components/FactsRow'
import { HealthBanner } from './components/HealthBanner'
import { HistoryChart } from './components/HistoryChart'
import { InfraToolbar } from './components/InfraToolbar'
import { StatCardGrid, StatCardGroups } from './components/StatCard'
import { TechnicalDetails } from './components/TechnicalDetails'
import { Skeleton, StatCardsSkeleton, ChartsSkeleton, ToolbarControlsSkeleton } from '@/shared/components/ui'
import { useNow } from '@/shared/lib/useNow'

const OVERVIEW_REFRESH_INTERVAL_MS = 15_000

type InfraDashboardProps = {
  config: InfraViewConfig
  onOpenLogs?: (service: string) => void
}

/* Initial-load placeholder mirroring the real page: toolbar, stat cards with
   the exact per-config count, and one chart card per configured series. */
function InfraDashboardSkeleton({ config }: { config: InfraViewConfig }) {
  const cardCount =
    config.cards?.({ overview: null, hasData: false }).length
    ?? config
      .cardGroups?.({ overview: null, hasData: false })
      .reduce((total, group) => total + group.cards.length, 0)
    ?? 6

  const toolbar = (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <Skeleton className="h-3 w-44" />
        <Skeleton className="mt-2 h-4 w-64 sm:w-[520px]" />
      </div>
      <ToolbarControlsSkeleton />
    </div>
  )

  return (
    <section className="flex flex-col gap-4" aria-busy="true" aria-label={`${config.toolbar.title} loading`}>
      {config.toolbar.placement === 'top' && toolbar}
      <StatCardsSkeleton count={cardCount} gridClassName={config.cardsGridClassName} />
      {config.toolbar.placement === 'history' && toolbar}
      {config.historyHeading && (
        <div className="flex items-baseline gap-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-24" />
        </div>
      )}
      <ChartsSkeleton count={config.series.length} />
    </section>
  )
}

export function InfraDashboard({ config, onOpenLogs }: InfraDashboardProps) {
  const queryClient = useQueryClient()
  const [rangeHours, setRangeHours] = useState<RangeHours>(1)
  const [activeMetric, setActiveMetric] = useState<ServerMetric | null>(null)
  const now = useNow(15_000)

  const overviewQuery = useOverviewQuery(config.errorMessage)
  const overview = overviewQuery.data ?? null
  const hasData = overviewQuery.data !== undefined
  const historyEnabled = config.historyEnabled?.(overview) ?? true

  const rangeOption = RANGE_OPTIONS.find((option) => option.hours === rangeHours) ?? RANGE_OPTIONS[0]
  const seriesQueries = useQueries({
    queries: config.series.map((item) => ({
      queryKey: ['monitoring', 'timeseries', item.metric, rangeHours] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => {
        const to = new Date()
        const from = new Date(to.getTime() - rangeOption.hours * 60 * 60 * 1000)
        return fetchMonitoringTimeseries({
          metric: item.metric,
          from: from.toISOString(),
          to: to.toISOString(),
          stepSeconds: rangeOption.stepSeconds,
          signal,
        })
      },
      refetchInterval: HISTORY_REFRESH_INTERVAL_MS,
      refetchIntervalInBackground: false,
      placeholderData: (previous: unknown) => previous,
      gcTime: 5 * 60_000,
      staleTime: 30_000,
      enabled: historyEnabled,
    })),
  })

  const historyByMetric: Partial<Record<MonitoringMetric, MonitoringPoint[]>> = {}
  const historyErrors: Partial<Record<MonitoringMetric, string>> = {}
  config.series.forEach((item, index) => {
    const query = seriesQueries[index]
    if (query?.data) historyByMetric[item.metric] = query.data.points
    if (query?.error) historyErrors[item.metric] = query.error.message
  })
  const historyRefreshing = seriesQueries.some((query) => query.isFetching)

  const initialLoading = overviewQuery.isPending
  const refreshing = overviewQuery.isFetching && hasData
  const error = overviewQuery.isError ? config.errorMessage : null

  const refreshNow = () => {
    void overviewQuery.refetch()
    void queryClient.invalidateQueries({ queryKey: ['monitoring', 'timeseries'] })
  }

  const health = config.health(overview, hasData)
  const cards = config.cards?.({ overview, hasData })
  const cardGroups = config.cardGroups?.({ overview, hasData })
  const facts = config.facts?.(overview)
  const currentValues = config.currentValues(overview)
  const snapshots = config.snapshots?.(overview)
  const technicalDetails = config.technicalDetails?.(overview) ?? null

  const containerResources = useContainerResourcesQuery(config.breakdown === true)

  if (initialLoading) return <InfraDashboardSkeleton config={config} />

  const host = overview?.host ?? null
  const overallValue = activeMetric === 'cpu'
    ? cards?.find((card) => card.dialog === 'cpu')?.value ?? '—'
    : activeMetric === 'memory'
      ? cards?.find((card) => card.dialog === 'memory')?.value ?? '—'
      : cards?.find((card) => card.dialog === 'disk')?.value ?? '—'

  const toolbar = (
    <InfraToolbar
      title={config.toolbar.title}
      titleId={config.toolbar.titleId}
      eyebrow={config.toolbar.eyebrow}
      description={config.toolbar.description}
      rangeLabel={config.toolbar.rangeLabel}
      rangeHours={rangeHours}
      onRangeChange={setRangeHours}
      refreshing={refreshing || historyRefreshing}
      onRefresh={refreshNow}
    />
  )

  const charts = (
    <section aria-label="History charts" className="flex flex-col gap-3">
      {config.historyHeading && (
        <div className="flex items-baseline gap-2">
          <h3 className="text-sm font-semibold text-ink">{config.historyHeading.title}</h3>
          <span className="text-xs text-ink-3">{config.historyHeading.hint}</span>
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {config.series.map((item) => (
          <HistoryChart
            key={item.metric}
            points={historyByMetric[item.metric] ?? []}
            metric={item.metric}
            title={item.title}
            question={item.question}
            description={item.description}
            valueFormatter={item.formatter}
            axisFormatter={item.axisFormatter}
            accentToken={item.accentToken}
            emptyTitle={item.emptyTitle}
            emptyDescription={item.emptyDescription}
            emptyStateKind={item.emptyStateKind}
            yAxis={item.yAxis}
            currentValue={currentValues[item.metric]}
            currentSnapshot={snapshots?.[item.metric]}
            tooltipDetails={item.tooltipDetails ? (value) => item.tooltipDetails?.(overview, value) ?? [] : undefined}
            historyError={historyErrors[item.metric] ?? null}
            now={now}
            loading={initialLoading || historyRefreshing}
          />
        ))}
      </div>
    </section>
  )

  return (
    <section className="flex flex-col gap-4" aria-busy={initialLoading}>
      {config.toolbar.placement === 'top' && toolbar}

      <ErrorBanner error={error} title={config.errorTitle} hasData={hasData} />
      <HealthBanner
        tone={health.tone}
        label={health.label}
        title={health.title}
        detail={health.detail}
        generatedAt={overview?.generatedAt}
        refreshing={refreshing}
      />

      {cardGroups ? (
        <StatCardGroups
          groups={cardGroups}
          refreshing={refreshing}
          onDialog={config.breakdown ? (metric) => setActiveMetric(metric ?? null) : undefined}
        />
      ) : (
        cards && (
          <StatCardGrid
            cards={cards}
            gridClassName={config.cardsGridClassName}
            refreshing={refreshing}
            onDialog={config.breakdown ? (metric) => setActiveMetric(metric ?? null) : undefined}
          />
        )
      )}

      {facts && facts.length > 0 && <FactsRow facts={facts} />}

      {config.toolbar.placement === 'history' && (
        <section aria-label="History" className="mt-2 flex flex-col gap-3">
          {toolbar}
          {charts}
        </section>
      )}

      {config.toolbar.placement === 'top' && charts}

      {technicalDetails && <TechnicalDetails details={technicalDetails} />}

      {config.breakdown && (
        <BreakdownDialog
          metric={activeMetric}
          overallValue={overallValue}
          host={host}
          response={containerResources.data ?? null}
          containers={containerResources.data?.containers ?? []}
          error={containerResources.error?.message ?? null}
          refreshing={containerResources.isFetching}
          onRefresh={() => void containerResources.refetch()}
          onClose={() => setActiveMetric(null)}
          onOpenLogs={onOpenLogs}
        />
      )}
    </section>
  )
}
