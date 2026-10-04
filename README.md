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

## CI

GitHub Actions runs on pushes and pull requests targeting `main`. CI installs the standalone lockfile and runs the TypeScript + Vite production build from the repository root.
