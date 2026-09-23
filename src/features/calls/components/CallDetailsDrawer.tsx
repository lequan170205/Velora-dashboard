import * as Dialog from '@radix-ui/react-dialog'
import { useMemo, useState } from 'react'
import { Check, Copy, Minus, X } from 'lucide-react'

import {
  formatTimelineMetrics,
  isValidCallId,
  milliseconds,
  type CallTimelineEvent,
} from '../api'
import { useCallTimelineQuery } from '../useCallsQueries'
import { Button, EmptyState, Skeleton } from '@/shared/components/ui'
import { cn } from '@/shared/lib/cn'

type CallDetailsDrawerProps = {
  callId: string | null
  onClose: () => void
}

type AttemptGroup = {
  attemptId: string
  events: CallTimelineEvent[]
}

const outcomeTone = (outcome: string | null) =>
  outcome === 'succeeded' || outcome === 'success'
    ? 'bg-ok-soft text-ok'
    : outcome === 'failed'
      ? 'bg-bad-soft text-bad'
      : 'bg-raised text-ink-3'

const attemptStatus = (events: readonly CallTimelineEvent[]) => {
  if (events.some((event) => event.outcome === 'failed')) return { label: 'Failed', tone: 'bad' as const }
  if (events.some((event) => event.stage === 'media_ready' && event.outcome === 'succeeded')) return { label: 'Media ready', tone: 'good' as const }
  if (events.some((event) => event.stage === 'control_plane_active' && event.outcome === 'succeeded')) return { label: 'Signaling ready', tone: 'neutral' as const }
  return { label: 'Telemetry', tone: 'neutral' as const }
}

const statusClass = (tone: 'good' | 'bad' | 'neutral') =>
  cn(
    'rounded-full px-2 py-0.5 text-[11px] font-medium',
    tone === 'good' && 'bg-ok-soft text-ok',
    tone === 'bad' && 'bg-bad-soft text-bad',
    tone === 'neutral' && 'bg-raised text-ink-3',
  )

function EventItem({ item, isLast }: { item: CallTimelineEvent; isLast: boolean }) {
  const failed = item.outcome === 'failed'
  const succeeded = item.outcome === 'succeeded' || item.outcome === 'success'

  return (
    <li className="relative pb-3 pl-6 last:pb-0">
      {!isLast && <span aria-hidden="true" className="absolute left-[7px] top-4 h-full w-px bg-line-strong" />}
      <span
        aria-hidden="true"
        className={cn(
          'absolute left-0 top-1.5 size-3.5 rounded-full border-2',
          failed ? 'border-bad bg-bad-soft' : succeeded ? 'border-ok bg-ok-soft' : 'border-line-strong bg-raised',
        )}
      />
      <div className="rounded-card border border-line bg-panel px-3.5 py-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[13px] font-semibold text-ink">{item.stage}</span>
              <span className="rounded-full border border-line px-2 py-0.5 text-[10px] text-ink-3">{item.eventType}</span>
              {item.outcome && <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', outcomeTone(item.outcome))}>{item.outcome}</span>}
              {item.errorCode && <code className="rounded-full bg-bad-soft px-2 py-0.5 text-[10px] text-bad">{item.errorCode}</code>}
            </div>
            <time dateTime={item.occurredAt} className="mt-1 block text-[11px] tabular-nums text-ink-3">
              {new Date(item.occurredAt).toLocaleString()}
            </time>
          </div>
          <span className="shrink-0 font-mono text-xs tabular-nums text-ink-2">+{milliseconds(item.elapsedMs)}</span>
        </div>

        {item.metricsJson && (
          <p className="mt-2 break-words font-mono text-[11px] leading-relaxed text-ink-2">
            {formatTimelineMetrics(item.metricsJson)}
          </p>
        )}
      </div>
    </li>
  )
}

function DrawerSkeleton() {
  return (
    <div className="space-y-3 p-5" aria-label="Loading call details">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="rounded-card border border-line bg-panel p-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="mt-2 h-3 w-64" />
          <Skeleton className="mt-4 h-16 w-full" />
        </div>
      ))}
    </div>
  )
}

export function CallDetailsDrawer({ callId, onClose }: CallDetailsDrawerProps) {
  const [copied, setCopied] = useState(false)
  const validCallId = callId ? isValidCallId(callId) : false
  const query = useCallTimelineQuery(validCallId ? callId ?? '' : '')
  const timeline = query.data ?? []

  const groups = useMemo<AttemptGroup[]>(() => {
    const grouped = new Map<string, CallTimelineEvent[]>()
    timeline.forEach((event) => {
      const events = grouped.get(event.attemptId) ?? []
      events.push(event)
      grouped.set(event.attemptId, events)
    })
    return Array.from(grouped, ([attemptId, events]) => ({ attemptId, events }))
      .sort((left, right) => new Date(left.events[0]?.occurredAt ?? 0).getTime() - new Date(right.events[0]?.occurredAt ?? 0).getTime())
  }, [timeline])

  const copyCallId = async () => {
    if (!callId) return
    try {
      await navigator.clipboard.writeText(callId)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1_500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <Dialog.Root open={callId !== null} onOpenChange={(open) => { if (!open) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[var(--au-overlay)] backdrop-blur-[3px]" />
        <Dialog.Content className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-line bg-canvas shadow-modal focus:outline-none sm:w-[min(760px,92vw)]">
          <header className="flex shrink-0 items-start justify-between gap-4 border-b border-line bg-panel px-4 py-3.5 sm:px-5">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">Call inspection</p>
              <Dialog.Title className="mt-0.5 truncate font-mono text-sm font-semibold text-ink">
                {callId ?? 'Call'}
              </Dialog.Title>
              <Dialog.Description className="sr-only">Telemetry grouped by call attempt.</Dialog.Description>
              {callId && (
                <Button variant="ghost" size="sm" onClick={copyCallId} className="mt-1 -ml-3 h-7">
                  {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
                  {copied ? 'Copied' : 'Copy call ID'}
                </Button>
              )}
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close call inspection"
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-control text-ink-2 hover:bg-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </Dialog.Close>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {!validCallId ? (
              <div className="p-5">
                <EmptyState icon={Minus} title="Invalid call ID" description="The URL does not contain a valid UUID call ID." />
              </div>
            ) : query.isPending ? (
              <DrawerSkeleton />
            ) : query.isError ? (
              <div role="alert" className="m-5 rounded-card border border-bad-soft bg-bad-soft/50 px-4 py-3 text-[13px] text-ink">
                <strong className="font-semibold">Unable to load call telemetry.</strong> {query.error.message}
              </div>
            ) : groups.length === 0 ? (
              <div className="p-5">
                <EmptyState icon={Minus} title="No telemetry for this call" description="The call may be outside retention or telemetry was never received." />
              </div>
            ) : (
              <div className="flex flex-col gap-3 p-4 sm:p-5">
                {groups.map((group, index) => {
                  const first = group.events[0]
                  const status = attemptStatus(group.events)
                  return (
                    <details
                      key={group.attemptId}
                      open={groups.length === 1 ? true : undefined}
                      className="group overflow-hidden rounded-card border border-line bg-raised/30"
                    >
                      <summary className="cursor-pointer list-none px-4 py-3 marker:hidden">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-ink">Attempt {index + 1}</span>
                              <span className={statusClass(status.tone)}>{status.label}</span>
                            </div>
                            <p className="mt-1 truncate text-xs text-ink-3">
                              {first ? `${first.role ?? 'pre-call'} · ${first.direction ?? '—'} · ${first.platform} ${first.osVersion ?? ''} · app ${first.appVersion}` : 'Telemetry'}
                            </p>
                          </div>
                          <code className="shrink-0 text-[11px] text-ink-3" title={group.attemptId}>{group.attemptId.slice(0, 8)}</code>
                        </div>
                      </summary>
                      <div className="border-t border-line bg-canvas/40 px-4 py-4">
                        <ol aria-label={`Events for attempt ${index + 1}`}>
                          {group.events.map((item, eventIndex) => (
                            <EventItem key={item.eventId} item={item} isLast={eventIndex === group.events.length - 1} />
                          ))}
                        </ol>
                      </div>
                    </details>
                  )
                })}
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
