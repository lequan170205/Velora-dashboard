export function choosePairs(config, count) {
  if (!Number.isInteger(count) || count < 1 || count > 5)
    throw new Error("1..5 concurrent calls allowed in this pilot");
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
    if (pairs.length === count) return pairs;
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
