import type { NavigateFunction } from 'react-router'

import type { LogsPreset } from '../features/monitoring/hooks/useLogsQuery'

const VALID_LOG_LEVELS = ['all', 'error', 'warn', 'info', 'debug'] as const

export const isLogsLevel = (value: string | null): value is LogsPreset['level'] =>
  value !== null && (VALID_LOG_LEVELS as readonly string[]).includes(value)

/* Cross-view flow: jump to the log viewer scoped to one service (and level). */
export function openLogs(
  navigate: NavigateFunction,
  service: string,
  level: LogsPreset['level'] = 'error',
) {
  const search = new URLSearchParams()
  search.set('service', service)
  if (isLogsLevel(level)) search.set('level', level)
  navigate({ pathname: '/logs', search: search.toString() })
}
