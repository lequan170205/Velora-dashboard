import { useMemo, useState, type FormEvent } from 'react'
import { SlidersHorizontal, X } from 'lucide-react'

import {
  hasValidCustomRange,
  type CallRangePreset,
  type CallTelemetryFilters,
} from '../api'
import { Button, Input, Label, NativeSelect } from '@/shared/components/ui'
import { cn } from '@/shared/lib/cn'

const RANGE_OPTIONS: readonly { value: CallRangePreset; label: string }[] = [
  { value: '15m', label: '15m' },
  { value: '1h', label: '1h' },
  { value: '6h', label: '6h' },
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
  { value: 'custom', label: 'Custom' },
]

type FilterBarProps = {
  filters: CallTelemetryFilters
  appliedFilters: CallTelemetryFilters
  onChange: <Key extends keyof CallTelemetryFilters>(key: Key, value: CallTelemetryFilters[Key]) => void
  onApply: () => void
}

export function FilterBar({ filters, appliedFilters, onChange, onApply }: FilterBarProps) {
  const [showAdvanced, setShowAdvanced] = useState(false)

  const advancedCount = [filters.osVersion, filters.appVersion, filters.direction].filter(Boolean).length
  const dirty = useMemo(
    () => JSON.stringify(filters) !== JSON.stringify(appliedFilters),
    [filters, appliedFilters],
  )
  const valid = hasValidCustomRange(filters)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (dirty && valid) onApply()
  }

  const clearAdvanced = () => {
    onChange('osVersion', '')
    onChange('appVersion', '')
    onChange('direction', '')
  }

  return (
    <form onSubmit={submit} aria-label="Call telemetry filters" className="rounded-card border border-line bg-panel p-3">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end">
        <div className="min-w-0 flex-1">
          <Label>Range</Label>
          <div className="mt-1 flex flex-wrap gap-1" role="group" aria-label="Call telemetry range">
            {RANGE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={filters.range === option.value}
                onClick={() => onChange('range', option.value)}
                className={cn(
                  'h-8 rounded-control border px-3 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
                  filters.range === option.value
                    ? 'border-brand bg-brand-soft text-brand'
                    : 'border-line bg-raised text-ink-2 hover:border-line-strong hover:text-ink',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="w-full xl:w-44">
          <Label htmlFor="call-platform">Platform</Label>
          <NativeSelect
            id="call-platform"
            value={filters.platform}
            onChange={(event) => onChange('platform', event.target.value)}
            className="mt-1"
          >
            <option value="">All platforms</option>
            <option value="ios">iOS</option>
            <option value="android">Android</option>
            <option value="web">Web</option>
          </NativeSelect>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowAdvanced((value) => !value)}
            aria-expanded={showAdvanced}
          >
            <SlidersHorizontal size={14} aria-hidden="true" />
            More filters{advancedCount > 0 ? ` · ${advancedCount}` : ''}
          </Button>
          <Button type="submit" size="sm" disabled={!dirty || !valid}>
            Apply
          </Button>
        </div>
      </div>

      {filters.range === 'custom' && (
        <div className="mt-3 grid grid-cols-1 gap-2.5 border-t border-line pt-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="call-from">From</Label>
            <Input
              id="call-from"
              type="datetime-local"
              value={filters.customFrom}
              onChange={(event) => onChange('customFrom', event.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="call-to">To</Label>
            <Input
              id="call-to"
              type="datetime-local"
              value={filters.customTo}
              onChange={(event) => onChange('customTo', event.target.value)}
              className="mt-1"
            />
          </div>
          {!valid && (
            <p role="alert" className="text-xs text-bad sm:col-span-2">
              Custom range needs valid start and end times, with From before To.
            </p>
          )}
        </div>
      )}

      {showAdvanced && (
        <div className="mt-3 border-t border-line pt-3">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            <div>
              <Label htmlFor="call-os">OS version</Label>
              <Input
                id="call-os"
                value={filters.osVersion}
                onChange={(event) => onChange('osVersion', event.target.value)}
                placeholder="All versions"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="call-app">App version</Label>
              <Input
                id="call-app"
                value={filters.appVersion}
                onChange={(event) => onChange('appVersion', event.target.value)}
                placeholder="All versions"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="call-direction">Direction</Label>
              <NativeSelect
                id="call-direction"
                value={filters.direction}
                onChange={(event) => onChange('direction', event.target.value)}
                className="mt-1"
              >
                <option value="">All directions</option>
                <option value="incoming">Incoming</option>
                <option value="outgoing">Outgoing</option>
              </NativeSelect>
            </div>
          </div>

          {advancedCount > 0 && (
            <div className="mt-2 flex justify-end">
              <Button variant="ghost" size="sm" onClick={clearAdvanced}>
                <X size={13} aria-hidden="true" />
                Clear advanced filters
              </Button>
            </div>
          )}
        </div>
      )}
    </form>
  )
}
