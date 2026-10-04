# Velora Dashboard

Standalone operations dashboard for Velora. This repository contains the admin-facing React/Vite application for monitoring system health, Prometheus metrics, alerts, Loki logs, call telemetry, and service health.

This project was extracted from `Velora-Mobile/apps/call-ops-dashboard` with its Git history preserved. It no longer depends on the Velora-Mobile pnpm workspace or Expo environment configuration.

## Requirements

- Node.js 20
- pnpm 9.15.0

The required pnpm version is pinned in `package.json` through the `packageManager` field.

## Local development

Install dependencies:

```bash
pnpm install --frozen-lockfile
```

Create your local environment file:

```bash
cp .env.example .env.local
```

Set the Velora API Gateway base URL in `.env.local`:

```env
VITE_API_URL=https://your-api-gateway.example.com
```

If the dashboard is served from the same origin as the API Gateway, `VITE_API_URL` may be left empty. Do not commit real environment files or credentials.

Start the development server:

```bash
pnpm dev
```

Production build:

```bash
pnpm build
```

Preview the production build locally:

```bash
pnpm preview
```

## Architecture

The browser does not talk directly to Prometheus or Loki. Monitoring traffic goes through the authenticated Velora backend:

```text
Velora Dashboard
  -> API Gateway /monitoring/*
  -> monitoring-service
  -> Prometheus / Loki
```

The dashboard also uses the API Gateway for ADMIN authentication and call operations telemetry.

Langfuse Cloud has its own authenticated UI. The generic Logs page keeps scoped filters for the Langfuse web/worker and backing containers, plus the local RAG embedding/reranker/vision services.

Key monitoring endpoints currently include:

```text
GET /monitoring/overview
GET /monitoring/status
GET /monitoring/containers
GET /monitoring/timeseries?metric=...&from=...&to=...&stepSeconds=...
GET /monitoring/alerts
GET /monitoring/logs?...filters
```

The dashboard uses the same ADMIN session cookie flow as the backend. Requests are sent with credentials enabled, and the client attempts `/auth/refresh` once when an authenticated request returns `401`.

## Monitoring cadence

One default applies to every monitoring view: overview, status and alerts refresh every 5 seconds; history every 10 seconds. History opens at 15 minutes with 10-second points, while 1h/6h/24h ranges remain available at coarser resolution. Polling pauses in hidden tabs. Container resources refresh every 5 seconds only while the breakdown dialog is open.

The backend uses 5-second Prometheus scrapes and rolling 1-minute rate/CPU/p95 windows. CPU alerting requires a 1-minute average above 70% for 60 seconds; other alert windows remain unchanged. These are sampled, rolling measurements, so brief spikes may be smoothed. The chat p95 measures successful send handler execution, not database-only latency or client delivery time.

## Production origin and cookie configuration

The API Gateway must allow the deployed dashboard origin because authenticated requests use cookies with CORS credentials.

Add the dashboard URL to the backend `CALL_OPS_DASHBOARD_ORIGINS` setting, for example:

```env
CALL_OPS_DASHBOARD_ORIGINS=https://dashboard.example.com
```

The gateway already supports multiple comma-separated origins. Local development on `http://localhost:5173` is allowed by the backend outside production.

Cookie `SameSite` requirements depend on how the dashboard and API are deployed:

- If they are same-site (for example, subdomains under the same registrable domain), the backend default may be sufficient.
- If they are truly cross-site, configure `AUTH_COOKIE_SAME_SITE=none` and serve both sides over HTTPS. Browsers require `Secure` cookies when `SameSite=None` is used.

Do not use a wildcard CORS origin with credentialed requests.

## Stress-test demo

Open **Demo tools → Stress test** (`#/stress-test`) after signing in as an admin.

1. Create a dedicated non-bot test conversation in the mobile app and add the dashboard account as a member. Use test recipients without real push tokens; test messages are stored and invoke the normal notification hooks.
2. Select that conversation and run **Smoke** first. Preflight requires sender sync and receiver fan-out before starting load. It also probes a retry with the same message identity; a retry failure is shown separately and does not block load with fresh message IDs.
3. Choose **Demo**, adjust the stage sockets/rate/duration if needed, and start. Defaults: 5/15/30 sender sockets at 2/10/25 total messages/s for 60s each, 30s cooldown, then 15s recovery.
4. Watch client latency/outcomes and server CPU/RAM, send throughput and handler p95 on the same page. Stop ends scheduling, disconnects the load sockets and keeps partial results.
5. Export JSON/CSV. The last five completed or stopped reports and the last successful run configuration are retained locally in this browser.

The page reuses `fetchApi` and `/auth/socket-token`, including the existing 401 refresh flow. It obtains a fresh token before preflight and every stage, checks the session every minute during load, and keeps the token only in the run closure. No manual JWT entry, service secret or backend changes are needed. Session failure stops the run; it does not bypass authentication or conversation membership.

This browser generator uses **one signed-in user**, multiple sender sockets and one observer. Socket count is not a distinct-user count. Sender latency ends at `message_synced`, earlier than the full handler metric on the server; the two p95 values measure different intervals. A timeout does not prove the message was not stored. The retry probe does not prove exactly-once dispatch. A run with successful load but failed retry is labeled **Load passed / retry failed**, never **Passed**. JSON/CSV retain the retry result; load delivery counters exclude probe/setup events. Missing database uniqueness still needs a database repair; continuing a fresh-ID load test does not fix that defect.

Keep the tab visible. Hiding it, leaving the route or going offline stops the run because browser timer throttling would distort the requested rate. Missed scheduling slots and in-flight saturation are recorded as skipped work, so the requested rate is not falsely reported as achieved. Per-run limits are 100 sender sockets, 100 messages/s, 10,000 planned messages and 20 minutes. CPU alert firing is not required for a successful load test.

This scenario measures synthetic chat persistence/fan-out; it does not test mobile encryption, native push UI or WebRTC/SFU media capacity. Backend monitoring remains the source of server metrics. Node fixture tests and browser verification are local checks, not production capacity measurements.

## CI

GitHub Actions runs on pushes and pull requests targeting `main`. CI installs the standalone lockfile and runs the tests and TypeScript + Vite production build from the repository root.
