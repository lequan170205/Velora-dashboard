// Explicit allow-list: candidate addresses, URLs and credentials never leave the browser.
export function summarizeRtcStats(stats) {
  const result = {
    localCandidates: {},
    pairs: {},
    outboundBytes: 0,
    outboundPackets: 0,
  };
  for (const r of stats.values()) {
    if (
      r.type === "local-candidate" &&
      ["host", "srflx", "prflx", "relay"].includes(r.candidateType)
    ) {
      result.localCandidates[r.candidateType] =
        (result.localCandidates[r.candidateType] ?? 0) + 1;
    }
    if (
      r.type === "candidate-pair" &&
      ["frozen", "waiting", "in-progress", "failed", "succeeded"].includes(
        r.state,
      )
    ) {
      result.pairs[r.state] = (result.pairs[r.state] ?? 0) + 1;
    }
    if (r.type === "outbound-rtp") {
      result.outboundBytes += r.bytesSent ?? 0;
      result.outboundPackets += r.packetsSent ?? 0;
    }
  }
  return result;
}
