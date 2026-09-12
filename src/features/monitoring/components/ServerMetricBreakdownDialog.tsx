import { useEffect, useMemo, useRef } from 'react'

import type { ContainerResource, MonitoringContainers, MonitoringOverview } from '../api'
import { formatBytes, formatPercent } from '../formatters'
import { formatMonitoringAge } from '../fresshness'

export type ServerMetric = 'cpu' | 'memory' | 'disk'

const METRIC_LABELS: Record<ServerMetric, string> = {
  cpu: 'CPU',
  memory: 'RAM',
  disk: 'Disk',
}

const METRIC_NOTES: Record<ServerMetric, string> = {
  cpu: 'Container CPU is normalized to the host core count. Host / other is the remaining host usage.',
  memory: 'Container values are working set. Host / other includes system, kernel, cache, and unassigned memory.',
  disk: 'Container values are writable layers. Docker images, volumes, build cache, and host / other complete the total.',
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

type ServerMetricBreakdownDialogProps = {
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

const coreLabel = (value: number | null) => {
  if (!finite(value)) return '—'
  const digits = value >= 1 ? 2 : 3
  return `${value.toFixed(digits)} core${value === 1 ? '' : 's'}`
}

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

export function ServerMetricBreakdownDialog({
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
}: ServerMetricBreakdownDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (metric && !dialog.open) {
      dialog.showModal()
    } else if (!metric && dialog.open) {
      dialog.close()
    }
  }, [metric])

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
          secondary: coreLabel(container.cpuCores),
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

  const closeDialog = () => {
    if (dialogRef.current?.open) dialogRef.current.close()
    onClose()
  }

  return (
    <dialog
      ref={dialogRef}
      className="server-metric-breakdown-dialog"
      aria-labelledby="server-metric-breakdown-title"
      onCancel={(event) => {
        event.preventDefault()
        closeDialog()
      }}
      onClose={() => {
        if (metric) onClose()
      }}
    >
      {metric && (
        <>
          <div className="server-metric-dialog-header">
            <div>
              <span className="eyebrow">{METRIC_LABELS[metric]} breakdown</span>
              <h2 id="server-metric-breakdown-title">{overallValue}</h2>
            </div>
            <div className="server-metric-dialog-actions">
              <button className="secondary-button" type="button" onClick={onRefresh} disabled={refreshing}>
                {refreshing ? 'Refreshing…' : 'Refresh'}
              </button>
              <button className="ghost-button server-metric-dialog-close" type="button" onClick={closeDialog} autoFocus>
                Close
              </button>
            </div>
          </div>

          <div className="server-metric-dialog-body">
            <div className="server-metric-dialog-meta">
              <span>{containerCountLabel(response, containers)}</span>
              <span>{updatedLabel(response?.generatedAt)}</span>
            </div>
            <p className="server-metric-dialog-note">{METRIC_NOTES[metric]}</p>

            {error && (
              <div className="server-metric-dialog-error" role="alert">
                <strong>Container snapshot unavailable.</strong> {error}
              </div>
            )}

            {response?.dockerEngineUp === false ? (
              <div className="server-metric-dialog-empty" role="status">
                <strong>Docker Engine unavailable</strong>
                <span>Container rows will appear when the Docker socket is reachable.</span>
              </div>
            ) : rows.length === 0 ? (
              <div className="server-metric-dialog-empty" role="status">
                <strong>No breakdown data yet</strong>
                <span>Waiting for the next Docker Engine snapshot.</span>
              </div>
            ) : (
              <div className="table-shell server-metric-dialog-table-shell">
                <table>
                  <caption className="sr-only">{METRIC_LABELS[metric]} breakdown, largest values first</caption>
                  <thead>
                    <tr>
                      <th scope="col">Source</th>
                      <th scope="col">Value</th>
                      {onOpenLogs && <th scope="col" aria-label="Actions" />}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr className={row.group ? 'server-metric-dialog-group-row' : undefined} key={row.key}>
                        <td className="server-metric-dialog-source">
                          <strong>{row.label}</strong>
                          <small>{row.detail}</small>
                        </td>
                        <td className="server-metric-dialog-value">
                          <strong>{row.display}</strong>
                          {row.secondary && <small>{row.secondary}</small>}
                        </td>
                        {onOpenLogs && (
                          <td>
                            {row.service && !row.group && (
                              <button className="table-action" type="button" onClick={() => {
                                closeDialog()
                                onOpenLogs(row.service as string)
                              }}>
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
    </dialog>
  )
}
