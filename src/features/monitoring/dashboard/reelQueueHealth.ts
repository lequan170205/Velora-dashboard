import type { ReelQueueOverview } from '../api'

export type ReelQueueHealth = 'healthy' | 'degraded' | 'unknown'

export const getReelQueueHealth = (
  queues: readonly ReelQueueOverview[] | undefined,
): ReelQueueHealth => {
  if (!queues?.length) return 'unknown'

  let hasUnknownLane = false
  for (const queue of queues) {
    const ready = queue.ready
    const consumers = queue.consumers
    if (
      ready === null ||
      consumers === null ||
      !Number.isFinite(ready) ||
      !Number.isFinite(consumers) ||
      ready < 0 ||
      consumers < 0
    ) {
      hasUnknownLane = true
      continue
    }
    if (ready > 0 && consumers === 0) return 'degraded'
  }

  return hasUnknownLane ? 'unknown' : 'healthy'
}

export const getReelPipelineQueueHealth = (
  queues: readonly ReelQueueOverview[] | undefined,
  pipeline: 'media' | 'index',
): ReelQueueHealth => {
  const health = getReelQueueHealth(queues)
  if (health !== 'healthy' || !queues) return health

  const expected = new Set([
    `reel_${pipeline}_short_jobs`,
    `reel_${pipeline}_long_jobs`,
  ])
  const lanesByVhost = new Map<string, Set<string>>()

  for (const queue of queues) {
    const name = queue.queue.trim().toLowerCase()
    if (!expected.has(name)) return 'unknown'
    const vhost = queue.vhost.trim()
    if (!vhost || vhost.toLowerCase() === 'unknown') return 'unknown'
    const lanes = lanesByVhost.get(vhost) ?? new Set<string>()
    lanes.add(name)
    lanesByVhost.set(vhost, lanes)
  }

  return [...lanesByVhost.values()].every((lanes) =>
    [...expected].every((name) => lanes.has(name)),
  ) ? 'healthy' : 'unknown'
}

export const getReelQueueLabel = (queue: string, index: number) => {
  const normalized = (queue ?? '').toLowerCase()
  if (normalized.includes('short')) return 'SHORT'
  if (normalized.includes('long')) return 'LONG'
  return queue || `Lane ${index + 1}`
}
