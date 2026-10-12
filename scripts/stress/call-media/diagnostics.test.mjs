import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeRtcStats } from "./diagnostics.mjs";
test("counts connectivity and RTP without exporting candidate details", () => {
  const stats = new Map([
    [
      "a",
      {
        type: "local-candidate",
        candidateType: "relay",
        address: "secret-address",
        url: "secret-url",
      },
    ],
    ["b", { type: "candidate-pair", state: "failed", localCandidateId: "a" }],
    [
      "c",
      {
        type: "outbound-rtp",
        bytesSent: 100,
        packetsSent: 5,
        ssrc: "secret-ssrc",
      },
    ],
  ]);
  assert.deepEqual(summarizeRtcStats(stats), {
    localCandidates: { relay: 1 },
    pairs: { failed: 1 },
    outboundBytes: 100,
    outboundPackets: 5,
  });
  assert.equal(
    JSON.stringify(summarizeRtcStats(stats)).includes("secret"),
    false,
  );
});
