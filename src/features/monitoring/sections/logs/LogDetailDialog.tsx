import * as Dialog from '@radix-ui/react-dialog'
import { useEffect, useMemo, useState } from 'react'
import { Check, Copy, X } from 'lucide-react'

import type { MonitoringLogEntry } from '../../logsApi'
import { Button } from '@/shared/components/ui'
import { cn } from '@/shared/lib/cn'

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
  const [copyState, setCopyState] = useState<CopyState>('idle')

  useEffect(() => {
    setCopyState('idle')
  }, [entry?.timestampNs])

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
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[88dvh] w-[min(760px,calc(100vw-1.5rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-dialog border border-line bg-panel p-5 shadow-modal focus:outline-none">
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
                    Inspect the full log payload and metadata for this line.
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
                <pre className="mt-2 max-h-[420px] overflow-auto whitespace-pre-wrap break-words rounded-control border border-line bg-inset p-3 font-mono text-xs leading-relaxed text-ink">
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
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
