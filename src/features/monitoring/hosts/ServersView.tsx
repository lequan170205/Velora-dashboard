import { useQueries, useQueryClient } from '@tanstack/react-query'
import { Server } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'

import { Badge, ChartsSkeleton, EmptyState, Skeleton, ToolbarControlsSkeleton } from '@/shared/components/ui'
import { useNow } from '@/shared/lib/useNow'
import type { MonitoringMetric, MonitoringPoint } from '../api'
import { fetchMonitoringTimeseries } from '../api'
import { BreakdownDialog } from '../dashboard/components/BreakdownDialog'
import { ErrorBanner } from '../dashboard/components/ErrorBanner'
import { HistoryChart } from '../dashboard/components/HistoryChart'
import { HostStrip } from '../dashboard/components/HostStrip'
import { InfraToolbar } from '../dashboard/components/InfraToolbar'
import type { ServerMetric } from '../dashboard/types'
import {
  getMonitoringOverviewHealth,
  HISTORY_REFRESH_INTERVAL_MS,
  MONITORING_REFRESH_INTERVAL_MS,
} from '../freshness'
import { useAlertsQuery } from '../hooks/useAlertsQuery'
import { useContainerResourcesQuery } from '../hooks/useContainerResourcesQuery'
import { useHostsHistoryQuery } from '../hooks/useHostsHistoryQuery'
import { useHostsQuery } from '../hooks/useHostsQuery'
import { RANGE_OPTIONS, type RangeHours } from '../model'
import { HostFleet } from './HostFleet'
import { hostCards, hostCurrentValues, hostFacts, hostSnapshots, HOST_SERIES, seriesForHost } from './hostView'
import { hostHealth, hostPlace, resolveSelectedHostId } from './model'

const ERROR_TITLE = 'Server metrics are temporarily unavailable.'

type ServersViewProps = {
  /** Open the log viewer for a service on one host. */
  onOpenLogs?: (service: string, host: string) => void
}

/* Initial-load placeholder mirroring the real page: fleet tiles, host panel and
   one chart card per configured series. */
function ServersSkeleton() {
  return (
    <section className="flex flex-col gap-4" aria-busy="true" aria-label="Servers loading">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {[0, 1].map((tile) => (
          <div key={tile} className="flex flex-col gap-3 rounded-card border border-line bg-panel p-4">
            <Skeleton className="h-4 w-40" />
            <div className="grid grid-cols-3 gap-3">
              {[0, 1, 2].map((gauge) => (
                <div key={gauge} className="flex flex-col gap-2">
                  <Skeleton className="h-3 w-10" />
                  <Skeleton className="h-1.5 w-full" />
                </div>
              ))}
            </div>
            <Skeleton className="h-8 w-full" />
          </div>
        ))}
      </div>
      <div className="rounded-card border border-line bg-panel">
        <div className="flex items-center justify-between border-b border-line px-4 py-3 sm:px-5">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-3 w-20" />
        </div>
        <div className="grid grid-cols-1 gap-2 p-2 sm:grid-cols-3 sm:p-3">
          {[0, 1, 2].map((block) => (
            <div key={block} className="flex flex-col gap-3 rounded-control p-3">
              <Skeleton className="h-2.5 w-10" />
              <Skeleton className="h-7 w-20" />
              <Skeleton className="h-1.5 w-full" />
              <Skeleton className="h-3 w-32" />
            </div>
          ))}
        </div>
      </div>
      <div className="flex justify-end">
        <ToolbarControlsSkeleton />
      </div>
      <ChartsSkeleton count={HOST_SERIES.length} />
    </section>
  )
}

export function ServersView({ onOpenLogs }: ServersViewProps) {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [rangeHours, setRangeHours] = useState<RangeHours>(RANGE_OPTIONS[0].hours)
  const [activeMetric, setActiveMetric] = useState<ServerMetric | null>(null)
  const now = useNow(MONITORING_REFRESH_INTERVAL_MS)

  const hostsQuery = useHostsQuery()
  const fleet = hostsQuery.data ?? null
  const hasData = fleet !== null
  const hosts = useMemo(() => fleet?.hosts ?? [], [fleet])

  const selectedId = resolveSelectedHostId(hosts, searchParams.get('host'), fleet?.defaultHostId)
  const selected = hosts.find((host) => host.id === selectedId) ?? null
  const showFleet = hosts.length > 1

  const selectHost = useCallback(
    (id: string) => {
      setActiveMetric(null)
      // Replace: flipping between tiles should not fill the back button.
      setSearchParams({ host: id }, { replace: true })
    },
    [setSearchParams],
  )

  const { byHost: cpuHistory } = useHostsHistoryQuery('host_cpu', showFleet)
  const alerts = useAlertsQuery(showFleet)
  const alertCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const alert of alerts.alerts) {
      if (alert.host) counts.set(alert.host, (counts.get(alert.host) ?? 0) + 1)
    }
    return counts
  }, [alerts.alerts])

  const series = useMemo(() => seriesForHost(selected, fleet?.legacy), [selected, fleet?.legacy])

  const rangeOption = RANGE_OPTIONS.find((option) => option.hours === rangeHours) ?? RANGE_OPTIONS[0]
  const seriesQueries = useQueries({
    queries: series.map((item) => ({
      queryKey: ['monitoring', 'timeseries', item.metric, rangeHours, selectedId] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => {
        const to = new Date()
        const from = new Date(to.getTime() - rangeOption.hours * 60 * 60 * 1000)
        return fetchMonitoringTimeseries({
          metric: item.metric,
          host: selectedId ?? undefined,
          from: from.toISOString(),
          to: to.toISOString(),
          stepSeconds: rangeOption.stepSeconds,
          signal,
        })
      },
      refetchInterval: HISTORY_REFRESH_INTERVAL_MS,
      refetchIntervalInBackground: false,
      // Keep the previous range on screen while a new one loads, but never show
      // another host's history under this host's name.
      placeholderData: (previous: unknown, previousQuery?: { queryKey: readonly unknown[] }) =>
        previousQuery?.queryKey[4] === selectedId ? previous : undefined,
      gcTime: 5 * 60_000,
      staleTime: HISTORY_REFRESH_INTERVAL_MS,
      enabled: selectedId !== null,
    })),
  })

  const historyByMetric: Partial<Record<MonitoringMetric, MonitoringPoint[]>> = {}
  const historyErrors: Partial<Record<MonitoringMetric, string>> = {}
  series.forEach((item, index) => {
    const query = seriesQueries[index]
    if (query?.data) historyByMetric[item.metric] = query.data.points
    if (query?.error) historyErrors[item.metric] = query.error.message
  })
  const historyRefreshing = seriesQueries.some((query) => query.isFetching)

  const containerResources = useContainerResourcesQuery(selectedId, activeMetric !== null)

  if (hostsQuery.isPending) return <ServersSkeleton />

  const refreshing = hostsQuery.isFetching && hasData
  const error = hostsQuery.isError ? ERROR_TITLE : null

  const refreshNow = () => {
    void hostsQuery.refetch()
    void queryClient.invalidateQueries({ queryKey: ['monitoring', 'timeseries'] })
    void queryClient.invalidateQueries({ queryKey: ['monitoring', 'hosts', 'history'] })
  }

  if (!selected) {
    return (
      <section className="flex flex-col gap-4">
        <ErrorBanner error={error} title={ERROR_TITLE} hasData={hasData} />
        {!error && (
          <EmptyState
            icon={Server}
            title="No servers are monitored yet"
            description="Servers appear here once Prometheus scrapes a node-exporter target that carries a host label."
          />
        )}
      </section>
    )
  }

  const health = getMonitoringOverviewHealth({
    health: hostHealth(selected),
    now,
    generatedAt: fleet?.generatedAt,
    lastSuccessfulAt: hostsQuery.dataUpdatedAt,
    hasError: hostsQuery.isError,
  })

  const currentValues = hostCurrentValues(selected)
  const snapshots = hostSnapshots(selected)
  const overallValue = hostCards(selected).find((card) => card.dialog === activeMetric)?.value ?? '—'

  return (
    <section className="flex flex-col gap-4" aria-busy={refreshing}>
      <ErrorBanner error={error} title={ERROR_TITLE} hasData={hasData} />

      {showFleet && (
        <HostFleet
          hosts={hosts}
          selectedId={selectedId}
          onSelect={selectHost}
          cpuHistory={cpuHistory}
          alertCounts={alertCounts}
        />
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1">
        <h2 className="text-[15px] font-semibold text-ink">{selected.name}</h2>
        <Badge tone={selected.role === 'primary' ? 'info' : 'neutral'}>
          {selected.role === 'primary' ? 'Primary' : 'Worker'}
        </Badge>
        {hostPlace(selected) && <span className="text-xs text-ink-3">{hostPlace(selected)}</span>}
        <span className="font-mono text-xs text-ink-3">{selected.instance}</span>
      </div>

      <HostStrip
        health={health}
        cards={hostCards(selected)}
        facts={hostFacts(selected)}
        sparkPoints={historyByMetric.host_cpu}
        generatedAt={fleet?.generatedAt}
        refreshing={refreshing}
        onDialog={(metric) => setActiveMetric(metric ?? null)}
      />

      <section aria-label="History" className="flex flex-col gap-3">
        <InfraToolbar
          title="History"
          titleId="server-history-title"
          eyebrow="Host history"
          rangeLabel="Server history range"
          rangeHours={rangeHours}
          onRangeChange={setRangeHours}
          refreshing={refreshing || historyRefreshing}
          onRefresh={refreshNow}
        />
        <section aria-label="History charts" className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {series.map((item) => (
              <div key={`${selected.id}:${item.metric}`} className={item.variant === 'hero' ? 'md:col-span-2' : undefined}>
                <HistoryChart
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
                  currentSnapshot={snapshots[item.metric]}
                  tooltipDetails={item.tooltipDetails ? (value) => item.tooltipDetails?.(selected, value) ?? [] : undefined}
                  historyError={historyErrors[item.metric] ?? null}
                  now={now}
                  loading={historyRefreshing}
                  variant={item.variant}
                />
              </div>
            ))}
          </div>
        </section>
      </section>

      <BreakdownDialog
        metric={activeMetric}
        overallValue={overallValue}
        host={selected}
        response={containerResources.data ?? null}
        containers={containerResources.data?.containers ?? []}
        error={containerResources.error?.message ?? null}
        refreshing={containerResources.isFetching}
        onRefresh={() => void containerResources.refetch()}
        onClose={() => setActiveMetric(null)}
        onOpenLogs={onOpenLogs ? (service) => onOpenLogs(service, selected.id) : undefined}
      />
    </section>
  )
}
