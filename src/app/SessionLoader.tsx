import { Loader2 } from 'lucide-react'

export function SessionLoader() {
  return (
    <main className="grid min-h-dvh place-items-center bg-canvas font-sans text-ink">
      <div className="flex items-center gap-3">
        <div
          aria-hidden="true"
          className="grid size-9 place-items-center rounded-[10px] bg-gradient-to-br from-brand to-violet text-sm font-semibold text-white"
        >
          V
        </div>
        <Loader2 size={16} className="animate-spin text-ink-3" aria-hidden="true" />
        <span className="text-sm text-ink-2">Loading…</span>
      </div>
    </main>
  )
}
