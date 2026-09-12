import type { ContainerResource } from '../api'
import { formatBytes, formatPercent } from '../formatters'
import { formatMonitoringAge } from '../fresshness'
import { UiIcon } from '../../../shared/components/UiIcon'

type ContainerResourcesPanelProps = {
  containers: readonly ContainerResource[]
  generatedAt?: string
  cadvisorUp?: boolean | null
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
  if (limit === null || !Number.isFinite(limit) || limit <= 0) return usage

  const ratio = container.memoryWorkingSetBytes === null
    ? null
    : container.memoryWorkingSetBytes / limit
  return `${usage} · ${formatPercent(ratio ?? Number.NaN, 0)}`
}

const updatedLabel = (generatedAt?: string, cadvisorUp?: boolean | null) => {
  if (cadvisorUp === false) return 'cAdvisor offline'
  if (!generatedAt) return 'Waiting for cAdvisor'
  const timestamp = Date.parse(generatedAt)
  return Number.isFinite(timestamp)
    ? `Updated ${formatMonitoringAge(Date.now(), timestamp)}`
    : 'Update time unavailable'
}

export function ContainerResourcesPanel({
  containers,
  generatedAt,
  cadvisorUp,
  error,
  initialLoading,
  refreshing,
  onRefresh,
  onOpenLogs,
}: ContainerResourcesPanelProps) {
  const emptyState = cadvisorUp === false
    ? {
      title: 'cAdvisor is offline',
      description: 'Prometheus cannot reach cAdvisor. Start it or set CADVISOR_ENABLED=true on a compatible Linux Docker host.',
    }
    : cadvisorUp === true
      ? {
        title: 'No container samples yet',
        description: 'cAdvisor is reachable, but Prometheus has not collected container samples yet. Check the cAdvisor target and wait for the next scrape.',
      }
      : {
        title: 'No container metrics yet',
        description: 'Check that cAdvisor is UP and that Prometheus has collected Docker container samples.',
      }

  return (
    <section className="dashboard-panel container-resources-panel" aria-labelledby="container-resources-title" aria-busy={initialLoading}>
      <div className="panel-heading container-resources-heading">
        <div>
          <span>cAdvisor · live container snapshot</span>
          <h3 id="container-resources-title">Container resources</h3>
          <p>Find which Docker service is consuming CPU, RAM, or filesystem space. CPU is shown against one core; Root disk above remains the host-level total.</p>
        </div>
        <div className="container-resources-actions">
          <span className="container-resources-updated">{updatedLabel(generatedAt, cadvisorUp)}</span>
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
          <p>Waiting for Prometheus to return the latest cAdvisor samples.</p>
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
            <caption className="sr-only">Current cAdvisor container resource snapshot</caption>
            <thead>
              <tr>
                <th scope="col">Service</th>
                <th scope="col">Container</th>
                <th scope="col">CPU</th>
                <th scope="col">RAM working set</th>
                <th scope="col">RAM limit</th>
                <th scope="col">Filesystem usage</th>
                {onOpenLogs && <th scope="col" aria-label="Actions" />}
              </tr>
            </thead>
            <tbody>
              {containers.map((container) => (
                <tr key={`${container.service}:${container.container}`}>
                  <td><strong className="container-service-name">{container.service}</strong></td>
                  <td><code className="container-name">{container.container}</code></td>
                  <td className="container-number">{formatCpu(container.cpuCores)}</td>
                  <td className="container-number">{formatMemory(container)}</td>
                  <td className="container-number">{formatBytes(container.memoryLimitBytes ?? Number.NaN)}</td>
                  <td className="container-number">{formatBytes(container.filesystemUsageBytes ?? Number.NaN)}</td>
                  {onOpenLogs && (
                    <td>
                      <button className="table-action" type="button" onClick={() => onOpenLogs(container.service)}>
                        Logs
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="container-resources-footnote">RAM is the current working set. Filesystem usage is the largest cAdvisor filesystem sample for each container and is not a replacement for host Root disk usage.</p>
    </section>
  )
}
