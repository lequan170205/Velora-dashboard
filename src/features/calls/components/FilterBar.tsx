import type { FormEvent } from 'react'

import type { CallTelemetryFilters } from '../api'
import { Button, Input, Label, NativeSelect } from '@/shared/components/ui'

type FilterBarProps = {
  filters: CallTelemetryFilters
  onChange: <Key extends keyof CallTelemetryFilters>(key: Key, value: CallTelemetryFilters[Key]) => void
  onApply: () => void
}

export function FilterBar({ filters, onChange, onApply }: FilterBarProps) {
  const submit = (event: FormEvent) => {
    event.preventDefault()
    onApply()
  }

  return (
    <form
      onSubmit={submit}
      aria-label="Call telemetry filters"
      className="rounded-card border border-line bg-panel px-3 py-3"
    >
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        <div className="flex flex-col gap-1">
          <Label htmlFor="call-from">From</Label>
          <Input
            id="call-from"
            type="date"
            value={filters.from}
            onChange={(event) => onChange('from', event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="call-to">To</Label>
          <Input
            id="call-to"
            type="date"
            value={filters.to}
            onChange={(event) => onChange('to', event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="call-platform">Platform</Label>
          <NativeSelect
            id="call-platform"
            value={filters.platform}
            onChange={(event) => onChange('platform', event.target.value)}
          >
            <option value="">All</option>
            <option value="ios">iOS</option>
            <option value="android">Android</option>
            <option value="web">Web</option>
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="call-os">OS version</Label>
          <Input
            id="call-os"
            value={filters.osVersion}
            onChange={(event) => onChange('osVersion', event.target.value)}
            placeholder="All versions"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="call-app">App version</Label>
          <Input
            id="call-app"
            value={filters.appVersion}
            onChange={(event) => onChange('appVersion', event.target.value)}
            placeholder="All versions"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="call-direction">Direction</Label>
          <NativeSelect
            id="call-direction"
            value={filters.direction}
            onChange={(event) => onChange('direction', event.target.value)}
          >
            <option value="">All</option>
            <option value="incoming">Incoming</option>
            <option value="outgoing">Outgoing</option>
          </NativeSelect>
        </div>
      </div>
      <div className="mt-3 flex justify-end">
        <Button type="submit" size="sm">
          Apply filters
        </Button>
      </div>
    </form>
  )
}
