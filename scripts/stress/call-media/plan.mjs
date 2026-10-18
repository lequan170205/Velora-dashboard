// The dashboard presets stay at 5 calls; the CLI may hold up to 20 (see run.mjs --calls/--seconds).
export const MAX_CONCURRENT_CALLS = 20;
// `offset` skips leading pairs so another tool can use them at the same time.
export function choosePairs(config, count, offset = 0) {
  if (!Number.isInteger(count) || count < 1 || count > MAX_CONCURRENT_CALLS)
    throw new Error(`1..${MAX_CONCURRENT_CALLS} concurrent calls allowed`);
  if (!Number.isInteger(offset) || offset < 0)
    throw new Error("pair offset must be a non-negative integer");
  const used = new Set(),
    pairs = [];
  for (const room of config.rooms) {
    const free = room.participantIds.filter((id) => !used.has(id));
    if (free.length < 2) continue;
    const [caller, callee] = free;
    used.add(caller);
    used.add(callee);
    pairs.push({
      roomId: room.id,
      caller,
      callee,
      participantIds: room.participantIds,
    });
    if (pairs.length === offset + count) return pairs.slice(offset);
  }
  throw new Error("Not enough disjoint fixture pairs");
}
export function safeFailure(error) {
  const text = String(error?.message ?? error);
  for (const kind of [
    "membership mismatch",
    "socket ready timeout",
    "invitation timeout",
    "initiate timeout",
    "accept timeout",
    "accept refused",
    "transport timeout",
    "connect timeout",
    "produce timeout",
    "consume timeout",
    "resume timeout",
    "media stalled",
    "leave timeout",
    "browser timeout",
    "operator stop",
    "socket exception",
    "socket disconnected",
    "HTTP request failed",
  ]) {
    if (text.includes(kind)) return kind;
  }
  return "unexpected failure (details withheld)";
}
