import type { FactVm } from '../types'

export function FactsRow({ facts }: { facts: readonly FactVm[] }) {
  return (
    <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label="Additional metrics">
      {facts.map((fact) => (
        <div key={fact.label} className="rounded-card border border-line bg-panel px-4 py-3">
          <dt className="text-xs font-medium uppercase tracking-wide text-ink-3">{fact.label}</dt>
          <dd className="mt-1 font-mono text-sm tabular-nums text-ink">{fact.value}</dd>
        </div>
      ))}
    </dl>
  )
}
