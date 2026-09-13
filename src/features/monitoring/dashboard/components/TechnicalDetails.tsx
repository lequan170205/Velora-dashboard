import { ChevronDown } from 'lucide-react'

import type { TechnicalDetailsVm } from '../types'

export function TechnicalDetails({ details }: { details: TechnicalDetailsVm }) {
  return (
    <details className="group rounded-card border border-line bg-panel">
      <summary className="flex list-none cursor-pointer select-none items-center justify-between px-4 py-3 text-[13px] font-medium text-ink-2 transition-colors hover:text-ink [&::-webkit-details-marker]:hidden">
        {details.summary}
        <ChevronDown
          size={15}
          aria-hidden="true"
          className="shrink-0 transition-transform duration-200 group-open:rotate-180"
        />
      </summary>
      <div className="border-t border-line px-4 py-3">
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
          {details.rows.map((row) => (
            <div key={row.label}>
              <dt className="text-xs text-ink-3">{row.label}</dt>
              <dd className="mt-0.5 font-mono text-sm tabular-nums text-ink">{row.value}</dd>
            </div>
          ))}
        </dl>
        {details.note && <p className="mt-3 text-xs leading-relaxed text-ink-3">{details.note}</p>}
      </div>
    </details>
  )
}
