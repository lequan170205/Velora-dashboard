import { useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent } from 'react'

import type { ContainerResource } from '../api'
import { formatBytes, formatPercent } from '../formatters'
import { formatMonitoringAge } from '../fresshness'
import { UiIcon } from '../../../shared/components/UiIcon'

type ContainerMetric = 'cpu' | 'memory' | 'disk'

const METRIC_LABELS: Record<ContainerMetric, string> = {
  cpu: 'CPU',
  memory: 'RAM',
  disk: 'Disk',
}

const metricValue = (container: ContainerResource, metric: ContainerMetric) => {
  if (metric === 'cpu') return container.cpuCores
  if (metric === 'memory') return container.memoryWorkingSetBytes
  return container.filesystemUsageBytes
}

const sumMetric = (containers: readonly ContainerResource[], metric: ContainerMetric) => {
  const values = containers
    .map((container) => metricValue(container, metric))
    .filter((value): value is number => value !== null && Number.isFinite(value))
  return values.length > 0 ? values.reduce((total, value) => total + value, 0) : null
}

type ContainerResourcesPanelProps = {
  containers: readonly ContainerResource[]
  generatedAt?: string
  dockerEngineUp?: boolean | null
  error: string | null
  initialLoading: boolean
  refreshing: boolean
  onRefresh: () => void
  onOpenLogs?: (service: string) => void
}

const formatCpu = (cores: number | null) => {
  if (cores === null || !Number.isFinite(cores)) return '—'
  if (cores < 1) return `${(cores * 100).toFixed(1)}%`
  return `${cores.toFixed(2)} cores`
}

const formatMemory = (container: ContainerResource) => {
  const usage = formatBytes(container.memoryWorkingSetBytes ?? Number.NaN)
  const limit = container.memoryLimitBytes
  if (limit === null || !Number.isFinite(limit) || limit <= 0) {
    return { usage, detail: null }
  }

  const ratio = container.memoryWorkingSetBytes === null
    ? null
    : container.memoryWorkingSetBytes / limit
  return {
    usage,
    detail: `${formatPercent(ratio ?? Number.NaN, 0)} of ${formatBytes(limit)}`,
  }
}

const formatTotalMemory = (containers: readonly ContainerResource[]) => {
  const used = sumMetric(containers, 'memory')
  const limit = containers
    .map((container) => container.memoryLimitBytes)
    .filter((value): value is number => value !== null && Number.isFinite(value) && value > 0)
    .reduce<number | null>((total, value) => (total ?? 0) + value, null)

  if (used === null) return '—'
  return limit === null ? formatBytes(used) : `${formatBytes(used)} / ${formatBytes(limit)}`
}

const updatedLabel = (generatedAt?: string, dockerEngineUp?: boolean | null) => {
  if (dockerEngineUp === false) return 'Docker Engine offline'
  if (!generatedAt) return 'Waiting for Docker Engine'
  const timestamp = Date.parse(generatedAt)
  return Number.isFinite(timestamp)
    ? `Updated ${formatMonitoringAge(Date.now(), timestamp)}`
    : 'Update time unavailable'
}

export function ContainerResourcesPanel({
  containers,
  generatedAt,
  dockerEngineUp,
  error,
  initialLoading,
  refreshing,
  onRefresh,
  onOpenLogs,
}: ContainerResourcesPanelProps) {
  const [activeMetric, setActiveMetric] = useState<ContainerMetric | null>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const lastTriggerRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (activeMetric && !dialog.open) {
      dialog.showModal()
    } else if (!activeMetric && dialog.open) {
      dialog.close()
    }
  }, [activeMetric])

  const totals = useMemo(() => ({
    cpu: sumMetric(containers, 'cpu'),
    memory: formatTotalMemory(containers),
    disk: sumMetric(containers, 'disk'),
  }), [containers])

  const rankedContainers = useMemo(
    () => activeMetric
      ? [...containers].sort((left, right) => (metricValue(right, activeMetric) ?? -1) - (metricValue(left, activeMetric) ?? -1))
      : [],
    [activeMetric, containers],
  )

  const openMetric = (metric: ContainerMetric, event: MouseEvent<HTMLButtonElement>) => {
    lastTriggerRef.current = event.currentTarget
    setActiveMetric(metric)
  }

  const closeMetricDialog = () => {
    if (dialogRef.current?.open) dialogRef.current.close()
    setActiveMetric(null)
    window.requestAnimationFrame(() => lastTriggerRef.current?.focus())
  }

  const emptyState = dockerEngineUp === false
    ? {
      title: 'Docker Engine unavailable',
      description: 'Monitoring service cannot read the Docker Engine socket.',
    }
    : dockerEngineUp === true
      ? {
        title: 'No running containers',
        description: 'Docker Engine returned no running containers.',
      }
      : {
        title: 'No container metrics yet',
        description: 'Waiting for Docker Engine container stats.',
      }

  return (
    <section className="dashboard-panel container-resources-panel" aria-labelledby="container-resources-title" aria-busy={initialLoading}>
      <div className="panel-heading container-resources-heading">
        <div>
          <h3 id="container-resources-title">Containers</h3>
        </div>
        <div className="container-resources-actions">
          <span className="container-resources-updated">{updatedLabel(generatedAt, dockerEngineUp)}</span>
          <button className="secondary-button" type="button" disabled={refreshing} onClick={onRefresh}>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div className="container-resources-error" role="alert">
          <strong>Container metrics are temporarily unavailable.</strong>
          <span>{containers.length > 0 ? `${error} Showing the last successful snapshot while the dashboard retries.` : error}</span>
        </div>
      )}

      {initialLoading && containers.length === 0 ? (
        <div className="empty-state container-resources-empty">
          <span className="empty-state-icon"><UiIcon name="loader" size={18} /></span>
          <strong>Loading container resources</strong>
          <p>Waiting for the latest Docker Engine stats.</p>
        </div>
      ) : containers.length === 0 ? (
        <div className="empty-state container-resources-empty">
          <span className="empty-state-icon"><UiIcon name="minus" size={18} /></span>
          <strong>{emptyState.title}</strong>
          <p>{emptyState.description}</p>
        </div>
      ) : (
        <div className="container-metric-grid" aria-label="Container resource totals">
          {(['cpu', 'memory', 'disk'] as const).map((metric) => {
            const total = metric === 'cpu'
              ? formatCpu(totals.cpu)
              : metric === 'memory'
                ? totals.memory
                : formatBytes(totals.disk ?? Number.NaN)

            return (
              <button
                className="container-metric-card"
                key={metric}
                type="button"
                aria-haspopup="dialog"
                aria-label={`View ${METRIC_LABELS[metric]} usage for all ${containers.length} containers`}
                title={`View ${METRIC_LABELS[metric]} usage by container`}
                onClick={(event) => openMetric(metric, event)}
              >
                <div className="container-metric-card-topline">
                  <span>{METRIC_LABELS[metric]}</span>
                  <small>{containers.length} containers</small>
                </div>
                <strong>{total}</strong>
              </button>
            )
          })}
        </div>
      )}

      <details className="container-resources-note">
        <summary>About metrics</summary>
        <p>RAM is working set after cache. Writable layer is container disk growth.</p>
      </details>

      <dialog
        ref={dialogRef}
        className="container-metric-dialog"
        aria-labelledby="container-metric-dialog-title"
        onCancel={(event) => {
          event.preventDefault()
          closeMetricDialog()
        }}
        onClose={() => {
          setActiveMetric(null)
          window.requestAnimationFrame(() => lastTriggerRef.current?.focus())
        }}
      >
        {activeMetric && (
          <>
            <div className="container-metric-dialog-header">
              <div>
                <span className="eyebrow">Containers</span>
                <h2 id="container-metric-dialog-title">{METRIC_LABELS[activeMetric]} by container</h2>
              </div>
              <button className="ghost-button container-metric-dialog-close" type="button" onClick={closeMetricDialog} autoFocus>
                Close
              </button>
            </div>
            <div className="container-metric-dialog-body">
              <div className="table-shell container-metric-dialog-table-shell">
                <table>
                  <caption className="sr-only">{METRIC_LABELS[activeMetric]} usage for all running containers, highest first</caption>
                  <thead>
                    <tr>
                      <th scope="col">Container</th>
                      <th scope="col">{METRIC_LABELS[activeMetric]}</th>
                      {activeMetric === 'memory' && <th scope="col">Limit</th>}
                      {onOpenLogs && <th scope="col" aria-label="Actions" />}
                    </tr>
                  </thead>
                  <tbody>
                    {rankedContainers.map((container) => {
                      const memory = activeMetric === 'memory' ? formatMemory(container) : null

                      return (
                        <tr key={`${activeMetric}:${container.service}:${container.container}`}>
                          <td className="container-identity">
                            <strong className="container-service-name">{container.service}</strong>
                            <code className="container-name" title={container.container}>{container.container}</code>
                          </td>
                          <td className="container-number container-dialog-value">
                            {activeMetric === 'cpu'
                              ? formatCpu(container.cpuCores)
                              : activeMetric === 'memory'
                                ? memory?.usage
                                : formatBytes(container.filesystemUsageBytes ?? Number.NaN)}
                            {memory?.detail && <small>{memory.detail}</small>}
                          </td>
                          {activeMetric === 'memory' && (
                            <td className="container-number">{formatBytes(container.memoryLimitBytes ?? Number.NaN)}</td>
                          )}
                          {onOpenLogs && (
                            <td>
                              <button className="table-action" type="button" onClick={() => {
                                closeMetricDialog()
                                onOpenLogs(container.service)
                              }}>
                                Logs
                              </button>
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </dialog>
    </section>
  )
}
