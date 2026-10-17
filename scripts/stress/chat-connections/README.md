# Chat connection capacity test

Measures how many authenticated chat sockets the gateway can hold and how it behaves when they all reconnect. Message throughput is covered by the main chat runner; this test is about connection count.

```sh
node scripts/stress/chat-connections/cli.mjs --config /abs/private-manifest.json --plan --sockets 2000 --ramp 100 --hold 60 --storms 1
node scripts/stress/chat-connections/cli.mjs --config /abs/private-manifest.json --run  --sockets 2000 --ramp 100 --hold 60 --storms 1 --output /abs/report.json
```

Phases:

1. **Ramp** - opens `--sockets` websockets at `--ramp` per second, no retries. A socket counts as ready only after a `check_presence` round trip is answered (the connect event fires before the server has verified the token). Reports connect and ready latency percentiles and failures by cause. Stops early above 20% failures.
2. **Hold** - keeps all sockets for `--hold` seconds and sends `--probes` real messages per second. Each probe is acked to the sender and must arrive on every socket of the other room members (multi-device fan-out); missing deliveries and unexpected disconnects are counted.
3. **Storm** (`--storms` 0..3) - drops every socket at once, then reconnects them with a random delay up to `--jitter-ms` (0 = everything at once). Each socket retries up to 6 times with exponential backoff and a fresh token. Reports time-to-restore percentiles, attempts, lost sockets and a post-storm delivery check.

Limits: sockets 1..6000, ramp 1..200/s, hold 0..1800 s, probes 0..5/s, jitter 0..60000 ms. Fixture accounts only; the sockets are spread over the manifest accounts, so each account stands for several devices. Presence fan-out to friends is exercised only for the accounts in the manifest (the first socket of an account), not per socket. Raise the open-file limit (`ulimit -n`) above the socket count before running from a shell.

`PASS` means at most 0.1% connect failures, no unexpected disconnects, every probe acked and fully delivered, and every storm restored all sockets. Reports contain counts and latency percentiles only. Test with `pnpm test:chat-connections`.
