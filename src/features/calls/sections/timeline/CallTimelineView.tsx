import { useEffect, useState, type FormEvent } from 'react'
import { Search } from 'lucide-react'

import { formatTimelineMetrics, milliseconds, type CallTimelineEvent } from '../../api'
import { useCallTimelineQuery } from '../../useCallsQueries'
import { Button, EmptyState, Input, Label } from '@/shared/components/ui'
import { cn } from '@/shared/lib/cn'

type CallTimelineViewProps = {
  /** Deep-link value from #/timeline?callId=… — auto-loaded on arrival. */
  initialCallId?: string
}

const outcomeTone = (outcome: string | null) =>
  outcome === 'success'
    ? 'bg-ok-soft text-ok'
    : outcome
      ? 'bg-bad-soft text-bad'
      : 'bg-raised text-ink-3'

function TimelineItem({ item, isLast }: { item: CallTimelineEvent; isLast: boolean }) {
  const success = item.outcome === 'success'
  const failed = Boolean(item.outcome) && !success

  return (
    <li className="relative flex gap-3 pb-3 pl-6 last:pb-0">
      {!isLast && (
        <span aria-hidden="true" className="absolute left-[7px] top-4 h-full w-px bg-line-strong" />
      )}
      <span
        aria-hidden="true"
        className={cn(
          'absolute left-0 top-1.5 size-3.5 rounded-full border-2',
          failed ? 'border-bad bg-bad-soft' : success ? 'border-ok bg-ok-soft' : 'border-line-strong bg-raised',
        )}
      />
      <div className="min-w-0 flex-1 rounded-card border border-line bg-panel px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="text-[13px] font-semibold text-ink">{item.eventType}</span>
            <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-ink-3">{item.stage}</span>
            <span className="rounded-full bg-raised px-2 py-0.5 text-[11px] text-ink-3">{item.role ?? 'pre-call'}</span>
          </div>
          <span className="shrink-0 font-mono text-xs tabular-nums text-ink-2">
            +{milliseconds(item.elapsedMs)}
          </span>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
          <time dateTime={item.occurredAt} className="tabular-nums">
            {new Date(item.occurredAt).toLocaleString()}
          </time>
          {item.outcome && (
            <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', outcomeTone(item.outcome))}>
              {item.outcome}
            </span>
          )}
          {item.errorCode && (
            <span className="rounded-full bg-bad-soft px-2 py-0.5 font-mono text-[11px] text-bad">
              {item.errorCode}
            </span>
          )}
          <span className="text-ink-3">{`${item.platform} ${item.appVersion}`}</span>
        </div>
        {item.metricsJson && (
          <p className="mt-1.5 truncate font-mono text-[11px] text-ink-2" title={formatTimelineMetrics(item.metricsJson)}>
            {formatTimelineMetrics(item.metricsJson)}
          </p>
        )}
      </div>
    </li>
  )
}

export function CallTimelineView({ initialCallId = '' }: CallTimelineViewProps) {
  const [input, setInput] = useState(initialCallId)
  const [submittedId, setSubmittedId] = useState(initialCallId.trim())

  useEffect(() => {
    if (!initialCallId) return
    setInput(initialCallId)
    setSubmittedId(initialCallId.trim())
  }, [initialCallId])

  const { data: timeline = [], error, isFetching } = useCallTimelineQuery(submittedId)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setSubmittedId(input.trim())
  }

  return (
    <section className="flex flex-col gap-4" aria-labelledby="call-timeline-title">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">Deep inspection</p>
        <h2 className="sr-only" id="call-timeline-title">Call timeline</h2>
        <p className="mt-0.5 max-w-prose text-[13px] leading-relaxed text-ink-2">
          Trace one call from setup through media readiness, failures, and client-reported metrics.
        </p>
      </div>

      <form
        onSubmit={submit}
        aria-label="Timeline lookup"
        className="flex flex-col gap-2.5 rounded-card border border-line bg-panel px-4 py-3.5 sm:flex-row sm:items-end"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Label htmlFor="timeline-call-id">Call ID</Label>
          <Input
            id="timeline-call-id"
            name="callId"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Paste a call ID"
            className="font-mono"
          />
        </div>
        <Button type="submit" disabled={isFetching} aria-busy={isFetching}>
          {isFetching ? 'Loading…' : 'Load timeline'}
        </Button>
      </form>

      {error && (
        <div role="alert" className="flex items-start gap-2.5 rounded-card border border-bad-soft bg-bad-soft/50 px-4 py-3 text-[13px]">
          <p className="leading-relaxed text-ink">
            <strong className="font-semibold">Unable to load timeline.</strong> {error.message}
          </p>
        </div>
      )}

      {timeline.length === 0 ? (
        <EmptyState
          icon={Search}
          title="Select a call to inspect"
          description="Open a recent call or paste a call ID above."
        />
      ) : (
        <div className="rounded-card border border-line bg-raised/40 p-4">
          <ol className="relative flex flex-col" aria-label="Timeline events for the selected call">
            {timeline.map((item, index) => (
              <TimelineItem key={item.eventId} item={item} isLast={index === timeline.length - 1} />
            ))}
          </ol>
        </div>
      )}
    </section>
  )
}
