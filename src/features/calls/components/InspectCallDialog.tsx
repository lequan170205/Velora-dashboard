import * as Dialog from '@radix-ui/react-dialog'
import { useEffect, useState, type FormEvent } from 'react'
import { Search, X } from 'lucide-react'

import { isValidCallId } from '../api'
import { Button, Input, Label } from '@/shared/components/ui'

type InspectCallDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onInspect: (callId: string) => void
}

export function InspectCallDialog({ open, onOpenChange, onInspect }: InspectCallDialogProps) {
  const [input, setInput] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const valid = isValidCallId(input)

  useEffect(() => {
    if (!open) return
    setInput('')
    setSubmitted(false)
  }, [open])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setSubmitted(true)
    if (!valid) return
    onInspect(input.trim())
    onOpenChange(false)
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[var(--au-overlay)] backdrop-blur-[4px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(520px,calc(100vw-1.5rem))] -translate-x-1/2 -translate-y-1/2 rounded-dialog border border-line bg-panel p-5 shadow-modal focus:outline-none">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-base font-semibold text-ink">Inspect call</Dialog.Title>
              <Dialog.Description className="mt-1 text-[13px] text-ink-2">
                Open telemetry for a call ID you already have.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close"
                className="inline-flex size-8 items-center justify-center rounded-control text-ink-2 hover:bg-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </Dialog.Close>
          </div>

          <form onSubmit={submit} className="mt-4">
            <Label htmlFor="inspect-call-id">Call ID</Label>
            <Input
              id="inspect-call-id"
              autoFocus
              value={input}
              onChange={(event) => {
                setInput(event.target.value)
                setSubmitted(false)
              }}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              className="mt-1 font-mono"
              aria-invalid={submitted && !valid}
            />
            {submitted && !valid && (
              <p role="alert" className="mt-1.5 text-xs text-bad">
                Enter a valid UUID call ID.
              </p>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <Dialog.Close asChild>
                <Button variant="secondary">Cancel</Button>
              </Dialog.Close>
              <Button type="submit">
                <Search size={14} aria-hidden="true" />
                Inspect
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
