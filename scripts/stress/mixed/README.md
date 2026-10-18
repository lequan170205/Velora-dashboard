# Mixed realistic workload

Runs the existing stress tools **at the same time**, the way a busy messaging app is used: thousands of idle sockets, steady chat, short calls starting and ending all the time, and a few long audio calls.

| Workload | Tool | What it adds |
|---|---|---|
| Connections | `chat-connections` | N authenticated sockets for the whole run, plus 1 delivery probe per second that must reach every socket of the other room members |
| Chat | `stress/cli.mjs` (main runner) | steady messages at a fixed rate across 20 rooms, ack and delivery latency |
| Call churn | `call-signaling` | calls that start, ring, are answered and end (signaling only) |
| Long calls | `call-media` (Chrome) | real WebRTC audio through the SFU, held for the window |

```sh
node scripts/stress/mixed/cli.mjs --config /abs/private-manifest.json --bins-dir /abs/bins --plan
node scripts/stress/mixed/cli.mjs --config /abs/private-manifest.json --bins-dir /abs/bins --run --base-url http://127.0.0.1 \
  --chrome "/abs/Google Chrome for Testing" --lan-address 192.168.2.60 --output /abs/mixed.json
```

`--bins-dir` holds bundled copies of the tools (`chat.mjs`, `connections.mjs`, `churn.mjs`, `media.mjs`, `browser.js`; esbuild `--platform=node --format=esm` for the first four, `--platform=browser` for `browser.js`). `--base-url` points the chat, connection and signaling tools at a local gateway; the media tool always uses the manifest's public URL. Without Chrome use `--media-calls 0`.

## Default profile: `campus10k`

10,000 registered users, 20% online at peak, one message per online user per minute, about 2% of online users in a call:

- 2,000 sockets (ramp 25/s), held for the whole run
- 33 messages/s for 300 s (2,000 x 1 / 60)
- 10 long audio calls (20 users) with real media, and 10 fixture pairs starting a short call about once a second
- starts after the sockets are up; total about 7.5 minutes

Every number can be overridden (`--sockets --ramp --window --chat-rps --media-calls --churn-pairs --churn-cps --churn-hold-ms`); the profile `smoke` is a 2-minute functional check. Limits come from the fixtures: media calls + churn pairs <= 20 (a user can be in one call at a time) and at most 10,000 chat messages per run.

## Verdict

Reported per criterion: connect failures <= 0.1% and all sockets connected, no unexpected disconnects, every probe delivered with last-delivery p95 <= 1 s, no failed or missing chat messages, chat ack p95 <= 1 s and delivery p95 <= 2 s, no failed or stuck calls, call setup p95 <= 1 s, media run passed with packet loss <= 0.5%. A child that produces no report fails the run. The report also contains container CPU/memory (mean and peak, from `docker stats` when run on the server host) and every child's full report.

## Caveats

The load generator runs on the same host as the services, so its CPU competes with them (Chrome alone uses about one core for 20 calls). Several sockets per fixture account stand in for several devices. Media goes straight to the SFU over the LAN (no Internet UDP, no TURN). Test with `pnpm test:mixed`.
