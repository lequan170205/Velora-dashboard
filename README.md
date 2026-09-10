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

Key monitoring endpoints currently include:

```text
GET /monitoring/overview
GET /monitoring/timeseries?metric=...&from=...&to=...&stepSeconds=...
GET /monitoring/alerts
GET /monitoring/logs?...filters
```

The dashboard uses the same ADMIN session cookie flow as the backend. Requests are sent with credentials enabled, and the client attempts `/auth/refresh` once when an authenticated request returns `401`.

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
