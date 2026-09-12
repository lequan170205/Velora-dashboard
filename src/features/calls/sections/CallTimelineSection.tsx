import type { FormEvent } from 'react'

import { formatTimelineMetrics, milliseconds, type CallTimelineEvent } from '../api'
import { UiIcon } from '../../../shared/components/UiIcon'

type Props = {
  callId: string
  timeline: CallTimelineEvent[]
  error: string | null
  onCallIdChange: (callId: string) => void
  onLoadTimeline: (callId: string) => void
}

export function CallTimelineSection({
  callId,
  timeline,
  error,
  onCallIdChange,
  onLoadTimeline,
}: Props) {
  const submit = (event: FormEvent) => {
    event.preventDefault()
    onLoadTimeline(callId)
  }

  return (
    <section className="dashboard-view">
      <div className="section-header-row view-heading">
        <div>
          <p className="eyebrow">Deep inspection</p>
          <h2>Call timeline</h2>
          <p className="section-description">Trace one call from setup through media readiness, failures, and client-reported metrics.</p>
        </div>
      </div>

      <section className="panel timeline-panel">
        <form className="timeline-search" onSubmit={submit}>
          <label>
            <span className="timeline-search-label">Call ID</span>
            <input id="timeline-call-id" name="callId" value={callId} onChange={(event) => onCallIdChange(event.target.value)} placeholder="Paste a call ID" />
          </label>
          <button className="primary-button" type="submit">Load timeline</button>
        </form>

        {error && <div className="dashboard-alert"><strong>Unable to load timeline.</strong><span>{error}</span></div>}

        {timeline.length === 0 ? (
          <div className="empty-panel-state large"><span className="empty-state-icon"><UiIcon name="search" size={18} /></span><strong>Select a call to inspect</strong><p>Open a recent call or paste a call ID above.</p></div>
        ) : (
          <div className="table-shell timeline-table-shell">
            <table>
              <caption className="sr-only">Timeline events for the selected call</caption>
              <thead><tr><th scope="col">Time</th><th scope="col">Role</th><th scope="col">Stage</th><th scope="col">Outcome</th><th scope="col">Elapsed</th><th scope="col">Error</th><th scope="col">Metrics</th></tr></thead>
              <tbody>
                {timeline.map((item) => (
                  <tr key={item.eventId}>
                    <td>{new Date(item.occurredAt).toLocaleString()}</td>
                    <td>{item.role ?? 'pre-call'}</td>
                    <td>{item.stage}</td>
                    <td><span className={item.outcome === 'success' ? 'state-pill good' : item.outcome ? 'state-pill bad' : 'state-pill muted'}>{item.outcome ?? '—'}</span></td>
                    <td>{milliseconds(item.elapsedMs)}</td>
                    <td>{item.errorCode ? <span className="state-pill bad">{item.errorCode}</span> : '—'}</td>
                    <td className="metrics-cell">{formatTimelineMetrics(item.metricsJson)}</td>
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
