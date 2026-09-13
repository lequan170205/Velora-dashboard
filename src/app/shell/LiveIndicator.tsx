import { cn } from '@/shared/lib/cn'
import type { MonitoringConnectionState } from '@/features/monitoring/fresshness'

const LABELS: Record<MonitoringConnectionState, string> = {
  live: 'Live',
  refreshing: 'Refreshing',
  stale: 'Stale',
  disconnected: 'Offline',
}

const TONES: Record<MonitoringConnectionState, string> = {
  live: 'bg-ok-soft text-ok',
  refreshing: 'bg-blue-soft text-blue',
  stale: 'bg-warn-soft text-warn',
  disconnected: 'bg-bad-soft text-bad',
}

const DOT_TONES: Record<MonitoringConnectionState, string> = {
  live: 'bg-ok',
  refreshing: 'bg-blue',
  stale: 'bg-warn',
  disconnected: 'bg-bad',
}

export function LiveIndicator({ state }: { state: MonitoringConnectionState }) {
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium',
        TONES[state],
      )}
    >
      <span
        aria-hidden="true"
        className={cn('size-1.5 rounded-full bg-current', DOT_TONES[state], state === 'refreshing' && 'animate-pulse')}
      />
      {LABELS[state]}
    </span>
  )
}
