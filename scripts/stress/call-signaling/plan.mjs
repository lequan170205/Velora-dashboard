// Bounds and pair selection for the call signaling load test (no media).
export const CALL_LIMITS = Object.freeze({ pairs: 20, cps: 50, seconds: 300, holdMs: 60000, cycles: 5000 })

export function validateCallPlan(input) {
  const plan = {
    pairs: Number(input.pairs ?? 5),
    cps: Number(input.cps ?? 5),
    seconds: Number(input.seconds ?? 20),
    holdMs: Number(input.holdMs ?? 0),
  }
  const within = (value, min, max) => Number.isFinite(value) && value >= min && value <= max
  if (!Number.isInteger(plan.pairs) || !within(plan.pairs, 1, CALL_LIMITS.pairs)) throw new Error(`pairs must be 1..${CALL_LIMITS.pairs}`)
  if (!within(plan.cps, 0.1, CALL_LIMITS.cps)) throw new Error(`cps must be 0.1..${CALL_LIMITS.cps}`)
  if (!Number.isInteger(plan.seconds) || !within(plan.seconds, 1, CALL_LIMITS.seconds)) throw new Error(`seconds must be 1..${CALL_LIMITS.seconds}`)
  if (!Number.isInteger(plan.holdMs) || !within(plan.holdMs, 0, CALL_LIMITS.holdMs)) throw new Error(`holdMs must be 0..${CALL_LIMITS.holdMs}`)
  plan.planned = Math.floor(plan.cps * plan.seconds)
  if (plan.planned < 1 || plan.planned > CALL_LIMITS.cycles) throw new Error(`plan must contain 1..${CALL_LIMITS.cycles} calls`)
  return plan
}

// Greedy disjoint pairs: a user can be in one call at a time, so concurrent calls
// need distinct accounts even when fixture rooms overlap.
export function selectPairs(config, count) {
  const used = new Set(), pairs = []
  for (const room of config.rooms) {
    const free = room.participantIds.filter(id => !used.has(id))
    if (free.length < 2) continue
    const [caller, callee] = free
    used.add(caller); used.add(callee)
    pairs.push({ roomId: room.id, caller, callee })
    if (pairs.length === count) return pairs
  }
  throw new Error(`only ${pairs.length} disjoint fixture pairs available, ${count} requested`)
}

// Maps an error to a fixed label so reports never carry server messages or tokens.
export const FAILURE_LABELS = [
  'socket ready timeout', 'initiate timeout', 'invitation timeout', 'accept timeout', 'accept refused',
  'leave timeout', 'socket exception', 'socket disconnected', 'operator stop',
]
export function safeFailure(error) {
  const text = String(error?.message ?? error)
  return FAILURE_LABELS.find(label => text.includes(label)) ?? 'unexpected failure (details withheld)'
}
