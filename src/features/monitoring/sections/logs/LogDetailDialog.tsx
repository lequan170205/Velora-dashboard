import * as Dialog from '@radix-ui/react-dialog'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { Check, Copy, RefreshCw, X } from 'lucide-react'

import { fetchMonitoringLogs, type MonitoringLogEntry } from '../../logsApi'
import { Button, Skeleton } from '@/shared/components/ui'
import { cn } from '@/shared/lib/cn'

const SURROUNDING_WINDOW_MS = 30_000
const SURROUNDING_LOG_LIMIT = 100

type CopyState = 'idle' | 'copied' | 'failed'

type LogDetailDialogProps = {
  entry: MonitoringLogEntry | null
  onClose: () => void
}

const formatTimestamp = (value: string) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

const levelTone = (level: MonitoringLogEntry['level']) =>
  level === 'error'
    ? 'bg-bad-soft text-bad'
    : level === 'warn'
      ? 'bg-warn-soft text-warn'
      : level === 'info'
        ? 'bg-blue-soft text-blue'
        : 'bg-raised text-ink-3'

const copyText = async (value: string) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()

  const copied = document.execCommand('copy')
  textarea.remove()
  if (!copied) throw new Error('Copy command was rejected')
}

export function LogDetailDialog({ entry, onClose }: LogDetailDialogProps) {
  const [showContext, setShowContext] = useState(false)
  const [copyState, setCopyState] = useState<CopyState>('idle')

  useEffect(() => {
    setShowContext(false)
    setCopyState('idle')
  }, [entry?.timestampNs])

  const contextWindow = useMemo(() => {
    if (!entry) return null
    const timestamp = Date.parse(entry.timestamp)
    if (!Number.isFinite(timestamp)) return null

    return {
      from: new Date(timestamp - SURROUNDING_WINDOW_MS).toISOString(),
      to: new Date(timestamp + SURROUNDING_WINDOW_MS).toISOString(),
    }
  }, [entry])

  const surroundingQuery = useQuery({
    queryKey: ['monitoring', 'logs', 'surrounding', entry?.timestampNs, entry?.service],
    queryFn: ({ signal }) => {
      if (!entry || !contextWindow) throw new Error('This log has an invalid timestamp')

      return fetchMonitoringLogs({
        service: entry.service,
        level: 'all',
        search: '',
        from: contextWindow.from,
        to: contextWindow.to,
        limit: SURROUNDING_LOG_LIMIT,
        signal,
      })
    },
    enabled: Boolean(entry && showContext),
    gcTime: 0,
  })

  const labels = useMemo(
    () => Object.entries(entry?.labels ?? {}).sort(([left], [right]) => left.localeCompare(right)),
    [entry],
  )

  const handleCopy = async () => {
    if (!entry) return
    try {
      await copyText(entry.message)
      setCopyState('copied')
      window.setTimeout(() => setCopyState('idle'), 2_000)
    } catch {
      setCopyState('failed')
    }
  }

  return (
    <Dialog.Root
      open={entry !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[var(--au-overlay)] backdrop-blur-[4px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[88dvh] w-[min(920px,calc(100vw-1.5rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-dialog border border-line bg-panel p-5 shadow-modal focus:outline-none">
          {entry && (
            <>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">
                    Loki log detail
                  </p>
                  <Dialog.Title className="mt-1 text-base font-semibold text-ink">
                    {entry.service}
                  </Dialog.Title>
                  <Dialog.Description className="mt-1 text-[13px] text-ink-2">
                    Full log payload and nearby lines from the same service.
                  </Dialog.Description>
                </div>
                <Dialog.Close asChild>
                  <button
                    type="button"
                    aria-label="Close log details"
                    className="inline-flex size-8 shrink-0 items-center justify-center rounded-control text-ink-2 transition-colors hover:bg-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  >
                    <X size={16} aria-hidden="true" />
                  </button>
                </Dialog.Close>
              </div>

              <dl className="mt-4 grid gap-2 rounded-control border border-line bg-raised/40 p-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <dt className="text-ink-3">Timestamp</dt>
                  <dd className="mt-0.5 font-mono tabular-nums text-ink" title={entry.timestamp}>
                    {formatTimestamp(entry.timestamp)}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-3">Level</dt>
                  <dd className="mt-0.5">
                    <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase', levelTone(entry.level))}>
                      {entry.level}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-3">Container</dt>
                  <dd className="mt-0.5 break-all font-mono text-ink">{entry.container ?? 'Unavailable'}</dd>
                </div>
                <div>
                  <dt className="text-ink-3">Stream</dt>
                  <dd className="mt-0.5 font-mono text-ink">{entry.stream ?? 'Unavailable'}</dd>
                </div>
              </dl>

              <section className="mt-4" aria-labelledby="log-message-heading">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 id="log-message-heading" className="text-sm font-semibold text-ink">Full message</h3>
                  <Button variant="secondary" size="sm" onClick={handleCopy}>
                    {copyState === 'copied' ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
                    {copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Copy failed' : 'Copy message'}
                  </Button>
                </div>
                <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-control border border-line bg-inset p-3 font-mono text-xs leading-relaxed text-ink">
                  {entry.message}
                </pre>
              </section>

              <details className="mt-4 rounded-control border border-line bg-raised/30">
                <summary className="cursor-pointer select-none px-3 py-2 text-xs font-semibold text-ink">
                  Labels · {labels.length}
                </summary>
                <dl className="grid gap-x-5 gap-y-2 border-t border-line px-3 py-3 text-xs sm:grid-cols-2">
                  {labels.length === 0 ? (
                    <div className="text-ink-3">No Loki labels were returned for this line.</div>
                  ) : (
                    labels.map(([key, value]) => (
                      <div key={key} className="min-w-0">
                        <dt className="font-mono text-ink-3">{key}</dt>
                        <dd className="mt-0.5 break-all font-mono text-ink">{value}</dd>
                      </div>
                    ))
                  )}
                </dl>
              </details>

              <section className="mt-4" aria-labelledby="surrounding-logs-heading">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 id="surrounding-logs-heading" className="text-sm font-semibold text-ink">Surrounding logs</h3>
                    <p className="mt-0.5 text-xs text-ink-3">
                      Same service · 30 seconds before and after this line · up to {SURROUNDING_LOG_LIMIT} lines
                    </p>
                  </div>
                  <Button
                    variant={showContext ? 'ghost' : 'secondary'}
                    size="sm"
                    onClick={() => setShowContext((current) => !current)}
                    disabled={!contextWindow}
                  >
                    {showContext && surroundingQuery.isFetching && <RefreshCw size={13} aria-hidden="true" className="animate-spin" />}
                    {showContext ? 'Hide surrounding logs' : 'Show surrounding logs'}
                  </Button>
                </div>

                {showContext && (
                  <div className="mt-3 overflow-hidden rounded-control border border-line">
                    {surroundingQuery.isPending ? (
                      <div className="flex flex-col gap-2 p-3" aria-label="Loading surrounding logs">
                        {Array.from({ length: 5 }, (_, index) => (
                          <Skeleton key={index} className="h-8 w-full" />
                        ))}
                      </div>
                    ) : surroundingQuery.isError ? (
                      <div role="alert" className="p-4 text-[13px] text-bad">
                        <strong className="font-semibold">Unable to load surrounding logs.</strong>{' '}
                        {surroundingQuery.error.message}
                      </div>
                    ) : surroundingQuery.data?.entries.length ? (
                      <div className="max-h-80 overflow-y-auto divide-y divide-line">
                        {surroundingQuery.data.entries.map((item) => {
                          const selected =
                            item.timestampNs === entry.timestampNs &&
                            item.service === entry.service &&
                            item.message === entry.message

                          return (
                            <article
                              key={\`\${item.timestampNs}-\${item.service}-\${item.message}\`}
                              className={cn(
                                'grid gap-1 px-3 py-2.5 text-xs sm:grid-cols-[100px_52px_1fr]',
                                selected && 'bg-brand-soft/60',
                              )}
                            >
                              <time
                                className="font-mono tabular-nums text-ink-3"
                                dateTime={item.timestamp}
                                title={formatTimestamp(item.timestamp)}
                              >
                                {new Date(item.timestamp).toLocaleTimeString()}
                              </time>
                              <span className={cn('w-fit rounded-full px-1.5 py-px text-[10px] font-semibold uppercase', levelTone(item.level))}>
                                {item.level}
                              </span>
                              <pre className="min-w-0 whitespace-pre-wrap break-words font-mono leading-relaxed text-ink">
                                {item.message}
                              </pre>
                            </article>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="p-4 text-[13px] text-ink-3">
                        No other log lines were returned in this ±30 second window.
                      </div>
                    )}

                    {surroundingQuery.data?.mayHaveMore && (
                      <p className="border-t border-line px-3 py-2 text-xs text-warn">
                        More than {SURROUNDING_LOG_LIMIT} lines matched this window. Narrow the main log filters if you need a smaller incident slice.
                      </p>
                    )}
                  </div>
                )}
              </section>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
