// Bounds and socket assignment for the chat connection capacity test.
export const CONNECTION_LIMITS = Object.freeze({ sockets: 6000, ramp: 200, hold: 1800, probes: 5, jitterMs: 60000, storms: 3 })

export function validateConnectionPlan(input) {
  const plan = {
    sockets: Number(input.sockets ?? 500),
    rampPerSecond: Number(input.rampPerSecond ?? 50),
    holdSeconds: Number(input.holdSeconds ?? 30),
    probesPerSecond: Number(input.probesPerSecond ?? 1),
    storms: Number(input.storms ?? 0),
    stormJitterMs: Number(input.stormJitterMs ?? 5000),
  }
  const within = (value, min, max) => Number.isFinite(value) && value >= min && value <= max
  if (!Number.isInteger(plan.sockets) || !within(plan.sockets, 1, CONNECTION_LIMITS.sockets)) throw new Error(`sockets must be 1..${CONNECTION_LIMITS.sockets}`)
  if (!within(plan.rampPerSecond, 1, CONNECTION_LIMITS.ramp)) throw new Error(`rampPerSecond must be 1..${CONNECTION_LIMITS.ramp}`)
  if (!Number.isInteger(plan.holdSeconds) || !within(plan.holdSeconds, 0, CONNECTION_LIMITS.hold)) throw new Error(`holdSeconds must be 0..${CONNECTION_LIMITS.hold}`)
  if (!within(plan.probesPerSecond, 0, CONNECTION_LIMITS.probes)) throw new Error(`probesPerSecond must be 0..${CONNECTION_LIMITS.probes}`)
  if (!Number.isInteger(plan.storms) || !within(plan.storms, 0, CONNECTION_LIMITS.storms)) throw new Error(`storms must be 0..${CONNECTION_LIMITS.storms}`)
  if (!Number.isInteger(plan.stormJitterMs) || !within(plan.stormJitterMs, 0, CONNECTION_LIMITS.jitterMs)) throw new Error(`stormJitterMs must be 0..${CONNECTION_LIMITS.jitterMs}`)
  return plan
}

// Spreads sockets over the fixture accounts evenly (extra sockets go to the first accounts).
export function assignSockets(accounts, total) {
  return Array.from({ length: total }, (_, index) => ({ index, account: accounts[index % accounts.length], device: Math.floor(index / accounts.length) }))
}

export function summarize(values, round = value => Math.round(value * 10) / 10) {
  const sorted = [...values].sort((a, b) => a - b)
  const at = q => (sorted.length ? round(sorted[Math.max(0, Math.ceil(q * sorted.length) - 1)]) : null)
  return { count: sorted.length, p50: at(0.5), p95: at(0.95), p99: at(0.99), max: sorted.length ? round(sorted.at(-1)) : null }
}

export const FAILURE_LABELS = ['connect timeout', 'connect error', 'socket disconnected', 'ready timeout', 'operator stop']
export function safeFailure(error) {
  const text = String(error?.message ?? error)
  return FAILURE_LABELS.find(label => text.includes(label)) ?? 'unexpected failure (details withheld)'
}
