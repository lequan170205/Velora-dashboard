// Fixture-only host-local diagnosis. Server configuration is never changed.
export function privateIpv4(address) {
  if (typeof address !== "string" || !/^\d+\.\d+\.\d+\.\d+$/.test(address))
    return false;
  const n = address.split(".").map(Number);
  if (n.some((x) => x > 255)) return false;
  return (
    n[0] === 10 ||
    (n[0] === 172 && n[1] >= 16 && n[1] <= 31) ||
    (n[0] === 192 && n[1] === 168)
  );
}
export function normalizeTransport(options, address) {
  const normalized = { ...options, id: options.transportId };
  if (!address) return normalized;
  if (
    !privateIpv4(address) ||
    !Array.isArray(options.iceCandidates) ||
    !options.iceCandidates.length ||
    options.iceCandidates.some(
      (c) =>
        c.protocol !== "udp" ||
        c.port !== 40000 ||
        (typeof c.ip !== "string" && typeof c.address !== "string"),
    )
  )
    throw new Error("unexpected host-local candidate");
  return {
    ...normalized,
    iceServers: [],
    iceCandidates: options.iceCandidates.map((c) => ({
      ...c,
      ...(c.ip !== undefined ? { ip: address } : {}),
      ...(c.address !== undefined ? { address } : {}),
    })),
  };
}
