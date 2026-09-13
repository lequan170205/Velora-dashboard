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
import { NoteCard } from './components/NoteCard'
import { StatCardGrid, StatCardGroups } from './components/StatCard'
import { TechnicalDetails } from './components/TechnicalDetails'
import { useNow } from '@/shared/lib/useNow'

const OVERVIEW_REFRESH_INTERVAL_MS = 15_000

type InfraDashboardProps = {
  config: InfraViewConfig
  onOpenLogs?: (service: string) => void
}

export function InfraDashboard({ config, onOpenLogs }: InfraDashboardProps) {
  const queryClient = useQueryClient()
  const [rangeHours, setRangeHours] = useState<RangeHours>(1)
  const [activeMetric, setActiveMetric] = useState<ServerMetric | null>(null)
  const now = useNow(15_000)

  const overviewQuery = useOverviewQuery(config.errorMessage)
  const overview = overviewQuery.data ?? null
  const hasData = overviewQuery.data !== undefined

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

      {config.topNote && <NoteCard note={config.topNote} />}

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

      {config.toolbar.placement === 'top' && config.bottomNote && <NoteCard note={config.bottomNote} />}

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
