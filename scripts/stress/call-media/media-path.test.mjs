import { test } from "node:test";
import assert from "node:assert/strict";
import { privateIpv4, normalizeTransport } from "./media-path.mjs";
test("diagnostic address must be a private IPv4", () => {
  for (const x of ["192.168.2.5", "10.0.0.1", "172.16.0.1", "172.31.255.1"])
    assert.equal(privateIpv4(x), true);
  for (const x of [
    "127.0.0.1",
    "8.8.8.8",
    "172.32.0.1",
    "192.168.999.1",
    "::1",
    "example.com",
  ])
    assert.equal(privateIpv4(x), false);
});
test("only fixture candidates change; ICE credentials, DTLS and original remain intact", () => {
  const source = {
    transportId: "t",
    iceCandidates: [{ ip: "203.0.113.1", port: 40000, protocol: "udp" }],
    iceParameters: { usernameFragment: "u", password: "p" },
    dtlsParameters: { fingerprints: [{ value: "f" }] },
    iceServers: [{ urls: "turn:example.test" }],
  };
  const copy = normalizeTransport(source, "192.168.2.5");
  assert.equal(copy.iceCandidates[0].ip, "192.168.2.5");
  assert.equal(source.iceCandidates[0].ip, "203.0.113.1");
  assert.equal(copy.iceParameters, source.iceParameters);
  assert.equal(copy.dtlsParameters, source.dtlsParameters);
  assert.deepEqual(copy.iceServers, []);
  assert.equal(copy.id, "t");
  assert.deepEqual(
    normalizeTransport(source).iceCandidates,
    source.iceCandidates,
  );
  assert.throws(() =>
    normalizeTransport(
      { ...source, iceCandidates: [{ protocol: "tcp", port: 40000 }] },
      "192.168.2.5",
    ),
  );
  assert.throws(() => normalizeTransport(source, "8.8.8.8"));
  assert.throws(() =>
    normalizeTransport(
      { ...source, iceCandidates: [{ protocol: "udp", port: 40000 }] },
      "192.168.2.5",
    ),
  );
});
