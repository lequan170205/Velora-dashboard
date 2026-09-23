import * as Dialog from '@radix-ui/react-dialog'
import { useMemo } from 'react'
import { RefreshCw } from 'lucide-react'

import type { ContainerResource, MonitoringContainers, MonitoringOverview } from '../../api'
import { formatBytes, formatPercent } from '../../formatters'
import { formatMonitoringAge } from '../../freshness'
import type { ServerMetric } from '../types'
import { cn } from '@/shared/lib/cn'

const METRIC_LABELS: Record<ServerMetric, string> = {
  cpu: 'CPU',
  memory: 'RAM',
  disk: 'Disk',
}

type BreakdownRow = {
  key: string
  label: string
  detail: string
  value: number | null
  display: string
  secondary?: string
  group?: boolean
  service?: string
}

type BreakdownDialogProps = {
  metric: ServerMetric | null
  overallValue: string
  host: MonitoringOverview['host'] | null | undefined
  response: MonitoringContainers | null
  containers: readonly ContainerResource[]
  error: string | null
  refreshing: boolean
  onRefresh: () => void
  onClose: () => void
  onOpenLogs?: (service: string) => void
}

const finite = (value: number | null | undefined): value is number =>
  value != null && Number.isFinite(value)

const bytesLabel = (value: number | null) =>
  finite(value) ? formatBytes(value) : '—'

const sumValues = (rows: readonly BreakdownRow[]) =>
  rows.reduce((total, row) => (finite(row.value) ? total + row.value : total), 0)

const hostOtherValue = (total: number | null, attributed: number) => {
  if (!finite(total)) return null
  const remainder = total - attributed
  return remainder >= 0 ? remainder : null
}

const sortLargestFirst = (left: BreakdownRow, right: BreakdownRow) => {
  if (!finite(left.value) && !finite(right.value)) return 0
  if (!finite(left.value)) return 1
  if (!finite(right.value)) return -1
  return right.value - left.value
}

const updatedLabel = (generatedAt?: string) => {
  if (!generatedAt) return 'Waiting for Docker'
  const timestamp = Date.parse(generatedAt)
  return Number.isFinite(timestamp)
    ? `Updated ${formatMonitoringAge(Date.now(), timestamp)}`
    : 'Update time unavailable'
}

const containerCountLabel = (
  response: MonitoringContainers | null,
  containers: readonly ContainerResource[],
) => {
  const running = response?.runningContainers
  const sampled = response?.sampledContainers
  if (finite(running) && finite(sampled)) {
    return running === sampled ? `${running} containers` : `${sampled} of ${running} sampled`
  }
  return `${containers.length} containers`
}

export function BreakdownDialog({
  metric,
  overallValue,
  host,
  response,
  containers,
  error,
  refreshing,
  onRefresh,
  onClose,
  onOpenLogs,
}: BreakdownDialogProps) {
  const rows = useMemo(() => {
    if (!metric) return []

    const hostCpuCount = response?.hostCpuCount
    const containerRows: BreakdownRow[] = containers.map((container) => {
      if (metric === 'cpu') {
        const ratio = finite(container.cpuCores) && finite(hostCpuCount) && hostCpuCount > 0
          ? container.cpuCores / hostCpuCount
          : null
        return {
          key: `${metric}:${container.service}:${container.container}`,
          label: container.service,
          detail: container.container,
          value: ratio,
          display: formatPercent(ratio ?? Number.NaN),
          service: container.service,
        }
      }

      const value = metric === 'memory'
        ? container.memoryWorkingSetBytes
        : container.filesystemUsageBytes

      return {
        key: `${metric}:${container.service}:${container.container}`,
        label: container.service,
        detail: container.container,
        value,
        display: bytesLabel(value),
        secondary: metric === 'memory' ? 'working set' : 'writable layer',
        service: container.service,
      }
    })

    const storage = response?.storage
    const storageRows: BreakdownRow[] = metric === 'disk' && storage
      ? [
        {
          key: 'disk:images',
          label: 'Docker images',
          detail: 'shared layers',
          value: storage.imagesBytes,
          display: bytesLabel(storage.imagesBytes),
          group: true,
        },
        {
          key: 'disk:volumes',
          label: 'Docker volumes',
          detail: 'persistent data',
          value: storage.volumesBytes,
          display: bytesLabel(storage.volumesBytes),
          group: true,
        },
        {
          key: 'disk:build-cache',
          label: 'Build cache',
          detail: 'Docker cache',
          value: storage.buildCacheBytes,
          display: bytesLabel(storage.buildCacheBytes),
          group: true,
        },
      ].filter((row) => finite(row.value))
      : []

    const attributedRows = [...containerRows, ...storageRows]
    const total = metric === 'cpu'
      ? host?.cpuUsageRatio ?? null
      : metric === 'memory'
        ? host?.memoryUsedBytes ?? null
        : host?.diskUsedBytes ?? null
    const hasAttributedData = attributedRows.some((row) => finite(row.value))

    if (!finite(total) && !hasAttributedData) return []

    const remainder = hostOtherValue(total, sumValues(attributedRows))
    const mismatch = finite(total) && remainder === null && sumValues(attributedRows) > total

    return [
      ...attributedRows,
      {
        key: `${metric}:host-other`,
        label: 'Host / other',
        detail: metric === 'cpu'
          ? 'not attributed to containers'
          : metric === 'memory'
            ? 'system · kernel · cache · other'
            : 'OS files · runtime metadata · other',
        value: remainder,
        display: metric === 'cpu'
          ? formatPercent(remainder ?? Number.NaN)
          : bytesLabel(remainder),
        secondary: mismatch ? 'sample mismatch' : undefined,
        group: true,
      },
    ].sort(sortLargestFirst)
  }, [containers, host, metric, response])

  return (
    <Dialog.Root open={metric !== null} onOpenChange={(open) => { if (!open) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[var(--au-overlay)] backdrop-blur-[4px]" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 max-h-[85dvh] w-[min(600px,calc(100vw-1.5rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-dialog border border-line bg-panel p-5 shadow-modal focus:outline-none"
          aria-describedby={undefined}
        >
          {metric && (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Dialog.Title asChild>
                    <h2 className="mt-1 truncate font-mono text-2xl font-semibold tabular-nums text-ink">
                      {overallValue}
                    </h2>
                  </Dialog.Title>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">
                    {METRIC_LABELS[metric]} breakdown
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={onRefresh}
                    disabled={refreshing}
                    aria-busy={refreshing}
                    className={cn(
                      'inline-flex h-8 items-center gap-1.5 rounded-control border border-line bg-raised px-3 text-[13px] font-medium text-ink',
                      'transition-colors duration-150 hover:border-line-strong hover:bg-inset',
                      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
                      'disabled:pointer-events-none disabled:opacity-50',
                    )}
                  >
                    <RefreshCw size={13} aria-hidden="true" className={refreshing ? 'animate-spin' : undefined} />
                    {refreshing ? 'Refreshing…' : 'Refresh'}
                  </button>
                  <Dialog.Close asChild>
                    <button
                      type="button"
                      autoFocus
                      className={cn(
                        'inline-flex h-8 items-center rounded-control px-3 text-[13px] font-medium text-ink-2',
                        'transition-colors duration-150 hover:bg-raised hover:text-ink',
                        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
                      )}
                    >
                      Close
                    </button>
                  </Dialog.Close>
                </div>
              </div>

              <div className="mt-4">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-3">
                  <span className="font-medium text-ink-2">{containerCountLabel(response, containers)}</span>
                  <span className="tabular-nums">{updatedLabel(response?.generatedAt)}</span>
                </div>
                {error && (
                  <div role="alert" className="mt-3 rounded-control border border-bad-soft bg-bad-soft/50 px-3 py-2 text-[13px] text-ink">
                    <strong className="font-semibold">Container snapshot unavailable.</strong> {error}
                  </div>
                )}

                {response?.dockerEngineUp === false ? (
                  <div role="status" className="mt-3 flex flex-col items-center gap-1 rounded-control border border-dashed border-line px-4 py-8 text-center">
                    <strong className="text-sm font-semibold text-ink">Docker Engine unavailable</strong>
                    <span className="text-[13px] text-ink-2">Container rows will appear when the Docker socket is reachable.</span>
                  </div>
                ) : rows.length === 0 ? (
                  <div role="status" className="mt-3 flex flex-col items-center gap-1 rounded-control border border-dashed border-line px-4 py-8 text-center">
                    <strong className="text-sm font-semibold text-ink">No breakdown data yet</strong>
                    <span className="text-[13px] text-ink-2">Waiting for the next Docker Engine snapshot.</span>
                  </div>
                ) : (
                  <div className="au-table-shell mt-3 max-h-80 overflow-y-auto rounded-control border border-line">
                    <table className="au-table">
                      <caption className="sr-only">{METRIC_LABELS[metric]} breakdown, largest values first</caption>
                      <thead>
                        <tr>
                          <th scope="col">Source</th>
                          <th scope="col">{metric === 'cpu' ? 'Value (% host)' : 'Value'}</th>
                          {onOpenLogs && <th scope="col" aria-label="Actions" />}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row) => (
                          <tr key={row.key} className={row.group ? 'au-table-group-row' : undefined}>
                            <td>
                              <strong className="block text-[13px] font-medium text-ink">{row.label}</strong>
                              <small className="text-[11px] text-ink-3">{row.detail}</small>
                            </td>
                            <td>
                              <strong className="block font-mono text-[13px] tabular-nums text-ink">{row.display}</strong>
                              {row.secondary && <small className="text-[11px] text-ink-3">{row.secondary}</small>}
                            </td>
                            {onOpenLogs && (
                              <td className="w-px text-right">
                                {row.service && !row.group && (
                                  <button
                                    type="button"
                                    className={cn(
                                      'inline-flex h-7 items-center rounded-control border border-line bg-raised px-2.5 text-xs font-medium text-ink-2',
                                      'transition-colors duration-150 hover:border-line-strong hover:text-ink',
                                      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
                                    )}
                                    onClick={() => {
                                      onClose()
                                      onOpenLogs(row.service as string)
                                    }}
                                  >
                                    Logs
                                  </button>
                                )}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
