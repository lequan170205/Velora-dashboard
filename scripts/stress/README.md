# Multi-user chat diagnostics

Run `npm run stress:plan -- --config /absolute/private-manifest.json` before an authorized load run. Use `npm run stress:run -- --config /absolute/private-manifest.json --output /absolute/report.json` to retain JSON and CSV results. Manifests must be private (mode 0600); use isolated fixture users and rooms without push recipients.

The Node runner keeps the existing 8-second message deadline and 100-pending cap. A late ACK remains a failed attempt even when the message was stored and delivered. Diagnostics do not change pacing, retries, deadlines or the PASS verdict.

`diagnostics.messages` contains at most 500 records, selected after the run: failures first, then the slowest observed ACKs. `omitted` counts records outside this selection. More than 500 failures still require sampling; aggregate counters cover the complete run.

Each retained record contains identity and timing metadata only:

- `ackMs`: timely ACK latency, or null when no ACK met the deadline.
- `observedAckMs` and `ackReceivedAt`: the first valid ACK, including a late one.
- `firstDeliveryMs` / `lastDeliveryMs`: first / last distinct recipient receipt, including late arrivals.
- `serverCreatedAt`: the existing server DTO timestamp, assigned inside the final MongoDB transaction attempt. It is **not** the commit time or an independent queue-wait measurement.

ACK and delivery durations use a monotonic client clock. Comparing client wall timestamps with `serverCreatedAt` requires synchronized clocks; even then, the interval includes transport, preparation, write-queue wait and transaction acquisition. Use per-message timestamps with the existing server phase histograms, without subtracting unrelated percentiles to claim a causal latency share. Bodies, passwords and tokens are excluded from diagnostics.

## Pacing

The offered load is paced in ticks (5 ms), not with one timer per message: every wake-up offers all slots that are due, so rates above a few hundred per second keep their planned rate. A slot more than 20 ms late (or more than a quarter of the interval, whichever is larger) is counted as `skipped` and is never replayed. Skipped slots still fail the stage; at high rates messages therefore leave in small bursts of up to roughly `rps × 0.02`. The settled-error-ratio stop (30%) uses counters kept by the ledger, so its cost does not grow with the number of messages.

## Multi-user chat runner (moved from the top-level README)

The private fixture manifest is intentionally kept outside Git (for example, in `~/Downloads/velora-stress.json`). It contains fixture passwords and must be mode `0600`. Validate without contacting the API with:

```bash
node scripts/stress/cli.mjs --config /absolute/path/manifest.json --plan
node scripts/stress/cli.mjs --config /absolute/path/manifest.json --run --output /absolute/path/results.json
```

The runner logs only aggregate identity/timing counters; it never prints passwords, tokens, raw payloads, transport errors, or message bodies. It uses one Socket.IO connection per configured fixture account, real mobile login/rotating refresh/logout, and the normal `join_conversation`/`send_message` protocol. Results are synthetic plain-text chat persistence/fan-out measurements—not mobile encryption, native push, WebRTC, or long-term capacity validation.

The initial scenario uses 50 distinct fixture users, 20 rooms, 5 total messages/s
for 180 seconds (900 load messages). Every account passes JWT identity, actual
membership and sender/recipient preflight before load. Setup writes are reported
separately. A replay must return the same stored identity without another event
to any recipient. Fixtures are prepared using the backend operator scripts in
`scripts/ops/CHAT-STRESS-FIXTURES.md`; their passwords stay outside both repos.

Each run uses a fixed online cohort. To compare 50, 100 and 150 users, prepare
separate manifests and runs; a 50-user stage cannot silently keep 150 sockets
online. Within one cohort, rates may ramp across stages. A missed ACK, missing
recipient, duplicate, disconnect or skipped slot fails the stage and prevents
escalation. The 30% settled error threshold stops a run early; it is not the pass
threshold. ACK and delivery deadlines remain 8 seconds. Latency percentiles use
timely successful observations; late events retain separate failure counts.

Traffic pacing does not wait for ACKs. Pending work is capped at 100; missed
schedule slots are skipped without catch-up bursts. Login/HTTP setup uses at
most two concurrent requests, and does not change application database pools.
Tokens rotate per user, with one refresh in flight and a stable request ID if
the rotation response is lost. HTTP requests and WebSocket handshakes identify the
Node runner as `VeloraStressDemo/1.0`; the runner does not impersonate a browser
or require weakening edge protection. Ctrl+C disconnects owned sockets and attempts
logout of owned sessions with two concurrent requests, a 5-second request
timeout, and a cohort-sized overall budget (up to 130 seconds for 50 sessions).
Cleanup is separate from the 8-second message deadline. Check cleanup failures
in the result, too.

JSON and a sibling CSV are saved automatically. Without `--output`, they go in
ignored `stress-private/results/`. JSON includes per-room/per-sender counts and
up to 500 diagnostic traces; it contains no credentials or message bodies.
Delivery percentiles use a bounded sample only above 10,000 observations and
explicitly mark that case. Keep Dashboard open separately to observe the server;
the Node runner continues without needing a visible browser tab.

#### Distributed chat demo (20 rooms)

1. Enter the exact email of an existing test account to create rooms with that account and the signed-in admin, or choose a dedicated source conversation whose members are test accounts without bots. Test devices may receive push notifications. A group needs at least two existing users; the creator is injected by the API.
2. Acknowledge the fixture choice, then use **Prepare / reuse 20 test groups**. This uses the chosen test email or copies the source member set into named groups through the normal authenticated API, preserves the source, and selects all 20 groups. It does not delete anything or create user accounts. Repeating preparation reloads and reuses matching groups; ambiguous POST failures stop rather than retry blindly. Same-browser tabs share a preparation lock.
3. Verify the **Multiple conversations** selection and run a low-rate Smoke first. Every selected room must pass sender-sync and observer-delivery checks before load starts; replay correctness is recorded separately for each room.
4. Select **Distributed — 20 rooms, up to 50/s**: 20/50/100 sender sockets at 10/25/50 total messages/s for 60s each, 30s cooldown, then 20 sockets at 5/s for 30s. This offers 5,250 load messages, excluding fixture/preflight/setup writes. Rates are targets, not measured capacity.
5. Watch emitted/s, synced/s, latency, failures, skipped work and server observation. The 100 in-flight cap remains; generator saturation records skipped slots. Sender warmup is bounded to five concurrent setup operations. CSV includes actual emitted rate, synced rate over the stage including response draining, and conversation count. JSON also contains per-room results. Export before leaving the page.

One account with 100 sender sockets is **one authenticated user**, not 100 users. This workload spreads writes across rooms; it does not demonstrate 50 messages/s in one hot conversation. Keep the single-room workload for that separate question. Stop/error criteria and the 8-second sender-sync deadline are unchanged.

