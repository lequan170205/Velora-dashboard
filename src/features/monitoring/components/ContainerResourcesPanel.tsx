import type { ContainerResource } from '../api'
import { formatBytes, formatPercent } from '../formatters'
import { formatMonitoringAge } from '../fresshness'

type ContainerResourcesPanelProps = {
  containers: readonly ContainerResource[]
  generatedAt?: string
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

const updatedLabel = (generatedAt?: string) => {
  if (!generatedAt) return 'Waiting for cAdvisor'
  const timestamp = Date.parse(generatedAt)
  return Number.isFinite(timestamp)
    ? `Updated ${formatMonitoringAge(Date.now(), timestamp)}`
    : 'Update time unavailable'
}

export function ContainerResourcesPanel({
  containers,
  generatedAt,
  error,
  initialLoading,
  refreshing,
  onRefresh,
  onOpenLogs,
}: ContainerResourcesPanelProps) {
  return (
    <section className="dashboard-panel container-resources-panel" aria-labelledby="container-resources-title" aria-busy={initialLoading}>
      <div className="panel-heading container-resources-heading">
        <div>
          <span>cAdvisor · live container snapshot</span>
          <h3 id="container-resources-title">Container resources</h3>
          <p>Find which Docker service is consuming CPU, RAM, or filesystem space. CPU is shown against one core; Root disk above remains the host-level total.</p>
        </div>
        <div className="container-resources-actions">
          <span className="container-resources-updated">{updatedLabel(generatedAt)}</span>
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
          <i aria-hidden="true">…</i>
          <strong>Loading container resources</strong>
          <p>Waiting for Prometheus to return the latest cAdvisor samples.</p>
        </div>
      ) : containers.length === 0 ? (
        <div className="empty-state container-resources-empty">
          <i aria-hidden="true">—</i>
          <strong>No labeled containers yet</strong>
          <p>Check that cAdvisor is UP and that Prometheus has collected Docker Compose labels.</p>
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
