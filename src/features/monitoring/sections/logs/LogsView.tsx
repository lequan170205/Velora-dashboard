import { useVirtualizer } from '@tanstack/react-virtual'
import { useRef, useState } from 'react'
import { CircleOff, Pause, Play, RefreshCw, ScrollText } from 'lucide-react'

import type { MonitoringLogEntry, MonitoringLogLevel } from '../../logsApi'
import { useLogsQuery, type LogsRangeMinutes } from '../../hooks/useLogsQuery'
import { LOG_SERVICE_OPTIONS } from '../../services'
import { LogDetailDialog } from './LogDetailDialog'
import { Button, EmptyState, Input, Label, NativeSelect, Skeleton } from '@/shared/components/ui'
import { cn } from '@/shared/lib/cn'

const LEVEL_OPTIONS: readonly MonitoringLogLevel[] = ['all', 'error', 'warn', 'info', 'debug']

const RANGE_OPTIONS: ReadonlyArray<{ value: LogsRangeMinutes; label: string }> = [
  { value: 15, label: '15 minutes' },
  { value: 60, label: '1 hour' },
  { value: 360, label: '6 hours' },
  { value: 1440, label: '24 hours' },
]

const formatTimestamp = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  }).format(date)
}

const levelLabel = (level: MonitoringLogEntry['level']) =>
  level === 'warn' ? 'WARN' : level.toUpperCase()

const LEVEL_TONE: Record<MonitoringLogEntry['level'], string> = {
  error: 'bg-bad-soft text-bad',
  warn: 'bg-warn-soft text-warn',
  info: 'bg-blue-soft text-blue',
  debug: 'bg-raised text-ink-3',
}

const ROW_HEIGHT = 40

type LogsViewProps = {
  preset?: { service: string; level: MonitoringLogLevel } | null
}

export function LogsView({ preset = null }: LogsViewProps) {
  const {
    filters,
    appliedFilters,
    updateFilter,
    response,
    entries,
    error,
    initialLoading,
    refreshing,
    hasUsableData,
    isStale,
    live,
    setLive,
    refreshNow,
  } = useLogsQuery(preset)

  const [selectedEntry, setSelectedEntry] = useState<MonitoringLogEntry | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  })

  return (
    <section className="flex flex-col gap-4" aria-labelledby="logs-view-title" aria-busy={initialLoading}>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">
            Loki · Docker stdout/stderr
          </p>
          <h2 className="sr-only" id="logs-view-title">Service logs</h2>
          <p className="mt-0.5 max-w-prose text-[13px] leading-relaxed text-ink-2">
            Search recent backend logs without exposing Loki or arbitrary LogQL to the browser.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
              live ? 'bg-ok-soft text-ok' : 'bg-raised text-ink-3',
            )}
          >
            <span aria-hidden="true" className={cn('size-1.5 rounded-full bg-current', live && 'animate-pulse')} />
            {live ? 'Live · 10s' : 'Paused'}
          </span>
          <Button variant="ghost" size="sm" onClick={() => setLive(!live)}>
            {live ? <><Pause size={13} aria-hidden="true" /> Pause</> : <><Play size={13} aria-hidden="true" /> Resume</>}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={refreshing}
            aria-busy={refreshing}
            onClick={refreshNow}
          >
            <RefreshCw size={13} aria-hidden="true" className={refreshing ? 'animate-spin' : undefined} />
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </Button>
        </div>
      </div>

      <div className="rounded-card border border-line bg-panel px-3 py-3 sm:sticky sm:top-14 sm:z-20 sm:backdrop-blur-md sm:bg-panel/95">
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="logs-service">Service</Label>
            <NativeSelect
              id="logs-service"
              value={filters.service}
              onChange={(event) => updateFilter('service', event.target.value)}
            >
              {LOG_SERVICE_OPTIONS.map((service) => (
                <option key={service} value={service}>
                  {service === 'all' ? 'All services' : service}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="logs-level">Level</Label>
            <NativeSelect
              id="logs-level"
              value={filters.level}
              onChange={(event) => updateFilter('level', event.target.value as MonitoringLogLevel)}
            >
              {LEVEL_OPTIONS.map((level) => (
                <option key={level} value={level}>
                  {level === 'all' ? 'All levels' : level.toUpperCase()}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="logs-range">Time range</Label>
            <NativeSelect
              id="logs-range"
              value={filters.rangeMinutes}
              onChange={(event) => updateFilter('rangeMinutes', Number(event.target.value) as LogsRangeMinutes)}
            >
              {RANGE_OPTIONS.map((range) => (
                <option key={range.value} value={range.value}>{range.label}</option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="logs-search">Contains text</Label>
            <Input
              id="logs-search"
              type="search"
              value={filters.search}
              maxLength={200}
              onChange={(event) => updateFilter('search', event.target.value)}
              placeholder="callId, exception, timeout…"
            />
          </div>
        </div>
      </div>

      {error && (
        <div
          role={isStale ? 'status' : 'alert'}
          className={cn(
            'flex items-start gap-2.5 rounded-card border px-4 py-3 text-[13px]',
            isStale ? 'border-warn-soft bg-warn-soft/50' : 'border-bad-soft bg-bad-soft/50',
          )}
        >
          <CircleOff size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-warn" />
          <p className="leading-relaxed text-ink">
            <strong className="font-semibold">
              {isStale ? 'Refresh failed. Showing previously loaded logs.' : 'Logs are temporarily unavailable.'}
            </strong>{' '}
            {error}
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs tabular-nums text-ink-3">
        <div className="flex items-center gap-1.5">
          {hasUsableData && (
            <span className="font-mono font-semibold text-ink-2">{entries.length}</span>
          )}
          <span>log lines</span>
          <span>·</span>
          <span>{appliedFilters.service === 'all' ? 'all services' : appliedFilters.service}</span>
          <span>·</span>
          <span>{appliedFilters.level === 'all' ? 'all levels' : appliedFilters.level}</span>
        </div>
        <span>
          {refreshing
            ? 'Updating…'
            : response?.generatedAt
              ? `${isStale ? 'Stale · ' : ''}Updated ${formatTimestamp(response.generatedAt)}`
              : error
                ? 'Unavailable'
                : 'Waiting for Loki'}
        </span>
      </div>

      <div className="overflow-hidden rounded-card border border-line bg-panel">
        {initialLoading ? (
          <div className="flex flex-col divide-y divide-line" aria-label="Loading service logs">
            {Array.from({ length: 10 }, (_, index) => (
              <div key={index} className="flex items-center gap-2 px-4 sm:gap-3" style={{ height: ROW_HEIGHT }}>
                <Skeleton className="h-3 w-[76px] shrink-0" />
                <Skeleton className="h-[18px] w-12 shrink-0 rounded-full" />
                <Skeleton className="hidden h-3 w-44 shrink-0 sm:block" />
                <Skeleton className="h-3 min-w-0 flex-1" />
              </div>
            ))}
          </div>
        ) : !hasUsableData && error ? (
          <EmptyState
            icon={CircleOff}
            role="alert"
            title="Logs are temporarily unavailable."
            description="Try refreshing after monitoring-service or Loki is reachable again."
          />
        ) : hasUsableData && isStale && entries.length === 0 ? (
          <EmptyState
            icon={CircleOff}
            title="No logs matched the last successful refresh."
            description="Current result is unavailable. Refresh to try again."
          />
        ) : hasUsableData && entries.length === 0 ? (
          <EmptyState
            icon={ScrollText}
            title="No matching logs"
            description="Try a wider time range, another service, or clear the text and level filters."
          />
        ) : (
          <div
            ref={listRef}
            role="log"
            aria-live="off"
            className="h-[560px] overflow-y-auto"
          >
            <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const entry = entries[virtualRow.index]
                return (
                  <button
                    key={`${entry.timestampNs}-${entry.service}-${entry.message}`}
                    type="button"
                    onClick={() => setSelectedEntry(entry)}
                    aria-label={`Inspect ${entry.level} log from ${entry.service} at ${new Date(entry.timestamp).toLocaleString()}`}
                    className={cn(
                      'absolute inset-x-0 flex items-center gap-2 border-b border-line px-4 text-left last:border-b-0 sm:gap-3',
                      'transition-colors hover:bg-raised/70 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-brand',
                      entry.level === 'error' && 'bg-bad-soft/30 hover:bg-bad-soft/50',
                    )}
                    style={{ height: virtualRow.size, transform: `translateY(${virtualRow.start}px)` }}
                  >
                    <time
                      className="shrink-0 whitespace-nowrap font-mono text-[11px] tabular-nums text-ink-3"
                      dateTime={entry.timestamp}
                      title={new Date(entry.timestamp).toLocaleString()}
                    >
                      {formatTimestamp(entry.timestamp)}
                    </time>
                    <span
                      className={cn(
                        'w-12 shrink-0 rounded-full px-1.5 py-px text-center text-[10px] font-semibold tracking-wide',
                        LEVEL_TONE[entry.level],
                      )}
                    >
                      {levelLabel(entry.level)}
                    </span>
                    <span
                      className={cn(
                        'hidden w-44 shrink-0 truncate text-xs text-ink-2 sm:inline',
                      )}
                      title={entry.container ?? entry.service}
                    >
                      {entry.service}
                    </span>
                    <pre className="min-w-0 flex-1 truncate font-mono text-xs leading-[38px] text-ink" title={entry.message}>
                      {entry.message}
                    </pre>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-0.5 text-xs leading-relaxed text-ink-3">
        <span>
          {hasUsableData
            ? response?.mayHaveMore
              ? 'Showing the newest 200 matching lines; narrow the filters to inspect more precisely.'
              : 'Showing all matching lines returned for this bounded query.'
            : 'A successful log result is required to report matching lines.'}
        </span>
        <span>Filters apply automatically; text search waits briefly while typing to avoid unnecessary Loki queries.</span>
        <span>Select a log line to inspect its full message, labels, and logs from ±30 seconds around it.</span>
      </div>

      <LogDetailDialog entry={selectedEntry} onClose={() => setSelectedEntry(null)} />
    </section>
  )
}
