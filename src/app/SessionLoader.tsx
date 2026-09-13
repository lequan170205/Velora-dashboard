import { Loader2 } from 'lucide-react'

import { BrandMark } from './BrandMark'

export function SessionLoader() {
  return (
    <main className="grid min-h-dvh place-items-center bg-canvas font-sans text-ink">
      <div className="flex items-center gap-3">
        <BrandMark className="size-9" />
        <Loader2 size={16} className="animate-spin text-ink-3" aria-hidden="true" />
        <span className="text-sm text-ink-2">Loading…</span>
      </div>
    </main>
  )
}
