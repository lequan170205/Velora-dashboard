import { CallFilterPanel } from '../components/CallFilterPanel'
import type { CallTelemetryFilters, RecentCallLeg } from '../api'
import { UiIcon } from '../../../shared/components/UiIcon'

type Props = {
  recentCallLegs: RecentCallLeg[]
  filters: CallTelemetryFilters
  error: string | null
  onFilterChange: <Key extends keyof CallTelemetryFilters>(
    key: Key,
    value: CallTelemetryFilters[Key],
  ) => void
  onApplyFilters: () => void
  onInspect: (callId: string) => void
}

export function RecentCallsSection({
  recentCallLegs,
  filters,
  error,
  onFilterChange,
  onApplyFilters,
  onInspect,
}: Props) {
  return (
    <section className="dashboard-view">
      <div className="section-header-row view-heading">
        <div>
          <p className="eyebrow">Call explorer</p>
          <h2>Recent calls</h2>
          <p className="section-description">Inspect individual call legs and jump directly into their telemetry timeline.</p>
        </div>
        <span className="section-meta">{recentCallLegs.length} call legs</span>
      </div>

      <CallFilterPanel filters={filters} onChange={onFilterChange} onApply={onApplyFilters} />
      {error && <div className="dashboard-alert"><strong>Something needs attention.</strong><span>{error}</span></div>}

      <section className="panel data-panel">
        {recentCallLegs.length === 0 ? (
          <div className="empty-panel-state large"><span className="empty-state-icon"><UiIcon name="minus" size={18} /></span><strong>No calls in this range</strong><p>Adjust the filters or wait for new call telemetry.</p></div>
        ) : (
          <div className="table-shell">
            <table>
              <caption className="sr-only">Recent call legs matching the selected filters</caption>
              <thead><tr><th scope="col">Started</th><th scope="col">Call ID</th><th scope="col">Client</th><th scope="col">Role / direction</th><th scope="col">Control-plane</th><th scope="col">Media</th><th scope="col">Failure</th><th scope="col" aria-label="Actions" /></tr></thead>
              <tbody>
                {recentCallLegs.map((leg) => (
                  <tr key={`${leg.callId}:${leg.attemptId}`}>
                    <td>{new Date(leg.startedAt).toLocaleString()}</td>
                    <td><code className="call-id">{leg.callId}</code></td>
                    <td>{`${leg.platform} ${leg.appVersion}`}</td>
                    <td>{`${leg.role ?? '—'} / ${leg.direction ?? '—'}`}</td>
                    <td><span className={leg.controlPlaneActive ? 'state-pill good' : 'state-pill muted'}>{leg.controlPlaneActive ? 'Ready' : 'Not ready'}</span></td>
                    <td><span className={leg.mediaReady ? 'state-pill good' : 'state-pill muted'}>{leg.mediaReady ? 'Ready' : 'Not ready'}</span></td>
                    <td>{leg.failure ? <span className="state-pill bad">{leg.failure.stage}:{leg.failure.errorCode ?? 'unknown'}</span> : <span className="state-pill good">None</span>}</td>
                    <td><button className="table-action" type="button" onClick={() => onInspect(leg.callId)}>Inspect</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  )
}
