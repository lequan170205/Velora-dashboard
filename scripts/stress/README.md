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
