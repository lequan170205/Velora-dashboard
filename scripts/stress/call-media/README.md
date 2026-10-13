# Call stress test from Velora Operations

The dashboard controls a temporary companion on the Mac Docker host. It exercises real Socket.IO signaling, real mediasoup transports/producers/consumers, and synthetic voice between dedicated fixture accounts. No microphone or mobile device is required.

## Before the demo

From Velora-dashboard, with SSH access to the existing Mac server:

```sh
pnpm install --frozen-lockfile
pnpm stress:call:build
pnpm stress:call:launch --manifest /absolute/path/to/private-fixtures.json
```

Use the existing multi-user fixture manifest, mode `0600`, with at least five group rooms and ten distinct accounts. Passwords are sent through SSH stdin into companion memory. They are never placed in repository files, server fixture files, browser state or exports. The launcher refuses to replace a busy companion or an unowned listener.

Open `https://dashboard.velora-app.me/#/stress-test/calls` with an admin session. Run **Smoke** first, then **Ramp: 1 → 3 → 5 calls**. Setup, cleanup and first-run browser download add time beyond the 20/30/30-second measurement windows.

## What PASS means

Every endpoint receives increasing inbound audio packets and bytes in every five-second sample. Each call produces a normal `call_left` receipt. Every fixture login is logged out, owned active sessions are checked, fixture call state is settled, and the deployment remains unchanged throughout the run. Failed or cancelled runs remain visible. Stop waits for cleanup rather than reporting a success.

This is **host-local SFU voice testing**. Only test clients override the announced ICE candidate with the host's private LAN address and disable their TURN entries; server configuration is unchanged. It does not validate public UDP/TURN reachability, native push UI, video, real microphones, speech quality or a production user-capacity limit. CPU rates use a one-minute window. The native generator shares the Mac's hardware and can contend for resources; node-exporter host metrics describe the Docker host/VM, not total macOS CPU.

## Runtime and results

- The companion binds to `127.0.0.1:18944`; the Docker gateway reaches it through `host.docker.internal`. ADMIN authentication is checked by both gateway and companion. Cookie Start/Stop require the dashboard origin.
- One call run at a time; presets and target are fixed. Browser tab switching does not stop a server run. Chat starts check for an active call run, and dashboard Web Locks prevent racing starts across tabs.
- The companion expires after eight hours. Restart it with the same launch command before a later demo. Its temporary official Chrome for Testing cache is removed on graceful shutdown; abrupt host/power failure may leave the scoped cache on disk.
- JSON/CSV exports contain measurements only. Last five runs stay in memory during companion lifetime. Full private reports are saved mode `0600` under its scoped `~/Downloads/velora-call-agent-*/runs/` folder. Export before ending the companion.
- Transient database audits use one connection at a time and disconnect. Existing application connection pools, database schemas, deployment secrets and router settings are unchanged.
- If cleanup is incomplete, do not run another test. Inspect the failed run and fixture state first. The next Start also enforces settled fixture and pipeline checks.
- Audit failures identify the failed check (fixture state, push tokens, pipeline/resource metrics, deployment runtime, LAN address or session audit). Raw exceptions are withheld. Checks execute once; this does not add retries or database connections.

## Checks

```sh
pnpm test:call
pnpm test
pnpm build
pnpm stress:call:build
```
