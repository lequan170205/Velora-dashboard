import type { ContainerResource } from '../api'
import { formatBytes, formatPercent } from '../formatters'
import { formatMonitoringAge } from '../fresshness'
import { UiIcon } from '../../../shared/components/UiIcon'

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
          <h3 id="container-resources-title">Container resources</h3>
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
        <div className="table-shell container-resources-table-shell">
          <table>
            <caption className="sr-only">Current Docker container resource snapshot</caption>
            <thead>
              <tr>
                <th scope="col">Container</th>
                <th scope="col">CPU</th>
                <th scope="col">RAM</th>
                <th scope="col">Disk</th>
                {onOpenLogs && <th scope="col" aria-label="Actions" />}
              </tr>
            </thead>
            <tbody>
              {containers.map((container) => {
                const memory = formatMemory(container)

                return (
                  <tr key={`${container.service}:${container.container}`}>
                    <td className="container-identity">
                      <strong className="container-service-name">{container.service}</strong>
                      <code className="container-name" title={container.container}>{container.container}</code>
                    </td>
                    <td className="container-number">{formatCpu(container.cpuCores)}</td>
                    <td className="container-number container-memory">
                      <span>{memory.usage}</span>
                      {memory.detail && <small>{memory.detail}</small>}
                    </td>
                    <td className="container-number">{formatBytes(container.filesystemUsageBytes ?? Number.NaN)}</td>
                    {onOpenLogs && (
                      <td>
                        <button className="table-action" type="button" onClick={() => onOpenLogs(container.service)}>
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
      )}

      <details className="container-resources-note">
        <summary>About metrics</summary>
        <p>RAM is working set after cache. Writable layer is container disk growth.</p>
      </details>
    </section>
  )
}
