import { Badge } from '@/shared/components/ui'
import { cn } from '@/shared/lib/cn'
import type { MonitoringPoint } from '../api'
import { Meter } from '../dashboard/components/Meter'
import { Sparkline } from '../dashboard/components/Sparkline'
import { formatLoad, formatPercent, formatUptime, type Tone } from '../formatters'
import type { MonitoringHost } from './api'
import {
  cpuTone,
  diskTone,
  hostState,
  hostSubtitle,
  hostTone,
  HOST_THRESHOLDS,
  memoryTone,
  summarizeFleet,
} from './model'

/* The fleet at a glance: one selectable tile per VPS. A tile is quiet while the
   host is healthy; tone appears only when a threshold is crossed or the host is
   offline, so a problem is what catches the eye. */

const DOT_CLASS: Record<Tone, string> = {
  good: 'bg-ok',
  warn: 'bg-warn',
  bad: 'bg-bad',
  neutral: 'bg-ink-3/50',
}

const STATE_LABEL = {
  online: 'Online',
  offline: 'Offline',
  unknown: 'Unknown',
} as const

type GaugeRowProps = {
  label: string
  ratio: number | null
  tone: Tone
  warnAt: number
  badAt: number
}

function GaugeRow({ label, ratio, tone, warnAt, badAt }: GaugeRowProps) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-ink-3">{label}</span>
        <span
          className={cn(
            'font-mono text-[13px] font-semibold tabular-nums',
            tone === 'bad' ? 'text-bad' : tone === 'warn' ? 'text-warn' : 'text-ink',
          )}
        >
          {formatPercent(ratio ?? Number.NaN)}
        </span>
      </div>
      <Meter ratio={ratio ?? Number.NaN} tone={tone} warnAt={warnAt} badAt={badAt} />
    </div>
  )
}

type HostTileProps = {
  host: MonitoringHost
  selected: boolean
  onSelect: (id: string) => void
  cpuHistory?: readonly MonitoringPoint[]
  alertCount: number
}

function HostTile({ host, selected, onSelect, cpuHistory, alertCount }: HostTileProps) {
  const state = hostState(host)
  const tone = hostTone(host)
  const offline = state === 'offline'

  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={`${host.name}, ${STATE_LABEL[state]}${alertCount > 0 ? `, ${alertCount} active alert${alertCount === 1 ? '' : 's'}` : ''}`}
      onClick={() => onSelect(host.id)}
      className={cn(
        'flex min-w-0 flex-col gap-3 rounded-card border bg-panel p-4 text-left transition-colors duration-150',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
        selected ? 'border-brand' : 'border-line hover:border-line-strong',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="flex min-w-0 items-center gap-2">
            <span aria-hidden="true" className={cn('size-2 shrink-0 rounded-full', DOT_CLASS[tone])} />
            <strong className="truncate text-[13px] font-semibold text-ink">{host.name}</strong>
          </span>
          <span className="truncate pl-4 text-xs text-ink-3">{hostSubtitle(host)}</span>
        </div>
        <span className="flex shrink-0 flex-wrap justify-end gap-1">
          {alertCount > 0 && (
            <Badge tone="bad">{alertCount} {alertCount === 1 ? 'alert' : 'alerts'}</Badge>
          )}
          {state !== 'online' && <Badge tone={offline ? 'bad' : 'neutral'} dot>{STATE_LABEL[state]}</Badge>}
        </span>
      </div>

      {offline ? (
        <p className="rounded-control border border-dashed border-line px-3 py-6 text-center text-[13px] text-ink-2">
          node-exporter is not reachable
        </p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <GaugeRow label="CPU" ratio={host.cpuUsageRatio} tone={cpuTone(host)} warnAt={HOST_THRESHOLDS.cpu.warn} badAt={HOST_THRESHOLDS.cpu.bad} />
            <GaugeRow label="RAM" ratio={host.memoryUsageRatio} tone={memoryTone(host)} warnAt={HOST_THRESHOLDS.memory.warn} badAt={HOST_THRESHOLDS.memory.bad} />
            <GaugeRow label="Disk" ratio={host.diskUsageRatio} tone={diskTone(host)} warnAt={HOST_THRESHOLDS.disk.warn} badAt={HOST_THRESHOLDS.disk.bad} />
          </div>
          {cpuHistory && cpuHistory.length > 1 ? (
            <Sparkline points={cpuHistory} className="h-8" />
          ) : (
            <div className="h-8" aria-hidden="true" />
          )}
        </>
      )}

      <dl className="flex flex-wrap gap-x-4 gap-y-0.5 border-t border-line pt-2.5">
        <div className="flex items-baseline gap-1.5">
          <dt className="text-xs text-ink-3">load</dt>
          <dd className="font-mono text-xs tabular-nums text-ink-2">{formatLoad(host.load1 ?? Number.NaN)}</dd>
        </div>
        <div className="flex items-baseline gap-1.5">
          <dt className="text-xs text-ink-3">uptime</dt>
          <dd className="font-mono text-xs tabular-nums text-ink-2">{formatUptime(host.uptimeSeconds ?? Number.NaN)}</dd>
        </div>
      </dl>
    </button>
  )
}

type HostFleetProps = {
  hosts: readonly MonitoringHost[]
  selectedId: string | null
  onSelect: (id: string) => void
  /** CPU history per host id, for the tile sparklines. */
  cpuHistory: ReadonlyMap<string, readonly MonitoringPoint[]>
  /** Active alerts per host id. */
  alertCounts: ReadonlyMap<string, number>
}

export function HostFleet({ hosts, selectedId, onSelect, cpuHistory, alertCounts }: HostFleetProps) {
  const summary = summarizeFleet(hosts)

  return (
    <section aria-label="Servers" className="flex flex-col gap-3">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-xs text-ink-3" role="status">
        <span className="font-mono font-semibold text-ink-2">{summary.total}</span>
        <span>{summary.total === 1 ? 'server' : 'servers'}</span>
        <span aria-hidden="true">·</span>
        <span>
          <span className="font-mono font-semibold text-ink-2">{summary.online}</span> online
        </span>
        {summary.offline > 0 && (
          <>
            <span aria-hidden="true">·</span>
            <span className="text-bad">
              <span className="font-mono font-semibold">{summary.offline}</span> offline
            </span>
          </>
        )}
        {summary.attention > 0 && (
          <>
            <span aria-hidden="true">·</span>
            <span className="text-warn">
              <span className="font-mono font-semibold">{summary.attention}</span> need attention
            </span>
          </>
        )}
      </p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {hosts.map((host) => (
          <HostTile
            key={host.id}
            host={host}
            selected={host.id === selectedId}
            onSelect={onSelect}
            cpuHistory={cpuHistory.get(host.id)}
            alertCount={alertCounts.get(host.id) ?? 0}
          />
        ))}
      </div>
    </section>
  )
}
