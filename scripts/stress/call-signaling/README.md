# Call signaling load test

Measures the Call Service **control plane** with real Socket.IO signaling and no media: `initiate_call` -> ring -> `accept_incoming_call` -> optional hold -> `leave_call` by both sides. It reports how fast calls can be created and ended and how long each step takes. It does not create WebRTC transports, so it says nothing about SFU/CPU capacity (use `scripts/ops/measure-call-sfu-capacity.cjs` in the backend repo for that).

```sh
node scripts/stress/call-signaling/cli.mjs --config /abs/private-manifest.json --plan --pairs 5 --cps 10 --seconds 20
node scripts/stress/call-signaling/cli.mjs --config /abs/private-manifest.json --run  --pairs 5 --cps 10 --seconds 20 --output /abs/report.json
```

Use the same private (0600) chat fixture manifest. Each pair is two distinct fixture accounts in one fixture room, so `--pairs` calls can be open at once (at most 20 here). Calls are offered at `--cps` (open loop, paced like the chat runner); a slot with no idle pair is counted as `skipped` instead of queued, so skipped slots mean the offered rate exceeded what the pairs could cycle.

Bounds: pairs 1..20, cps 0.1..50, seconds 1..300, hold 0..60000 ms, at most 5000 calls per run. The run stops when more than 30% of calls fail. Every call the runner opens is ended again (failed cycles retry `leave_call` on both sides); logins are logged out at the end.

The report keeps counts, per-phase latency percentiles (`initiateMs`, `ringMs`, `acceptMs`, `setupMs`, `leaveMs`, `guestLeaveMs`, `totalMs`), failures grouped by phase and server exception code, and up to five masked server messages. Tokens and ids are never written. `PASS` means no failed calls, no stop reason, no stuck calls and at most 0.1% skipped slots.

Run it from the server host against `http://127.0.0.1` (set `baseUrl` in a private copy of the manifest) to exclude the public edge. Test with `pnpm test:call`.
