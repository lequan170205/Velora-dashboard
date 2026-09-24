# Velora Operations Dashboard — Aurora Ops design system

This document is the source of truth for the dashboard's look and feel.
The implementation lives in `src/styles/app.css` (tokens) and the Tailwind
components under `src/shared` and `src/app`.

## Direction

- Style: Aurora Ops — deep navy surfaces, Velora orange accents, restrained gradients
- Brand: flat `#F94D0C` straight from the Velora logo (no gradient marks); dark mode
  uses it as-is for marks/series, controls use `#C2410C` for white-text contrast
- Variance: 4/10 — consistent chrome, expressive status colors
- Motion: 2/10 — 150–250 ms state transitions only, no decorative animation
- Density: 5.5/10 — data-first but with breathing room
- Goal: status and values read first; explanations reveal on demand
- Brand orange is never used for status: warning stays yellow-amber, danger stays red

## Theming

- Two modes: dark (default) and light, driven by `data-theme` on `<html>`
- Persisted in `localStorage` as `velora-theme`; falls back to `prefers-color-scheme`
- An inline script in `index.html` applies the theme before first paint (no flash)
- Charts read resolved hex values from `useChartTheme()` (Recharts cannot read CSS variables)

## Tokens

### Dark (default)

| Role | Value |
| --- | --- |
| Background | `#0B0F1A` |
| Sidebar | `#0E1220` |
| Card | `#131725` |
| Raised | `#1A1F35` |
| Inset (fields) | `#1F2440` |
| Border / strong | `rgba(255,255,255,.08)` / `.14` |
| Text / secondary / tertiary | `#EDEEF7` / `#A5ACC8` / `#8B94B1` |
| Accent (Velora orange) | `#F94D0C` |
| Action button | `#C2410C` (hover `#D14812`) |
| Success / warning / danger / info | `#34D399` / `#FBBF24` / `#F87171` / `#7DA2FB` |

### Light

| Role | Value |
| --- | --- |
| Background | `#F6F7FB` |
| Sidebar / card | `#FFFFFF` |
| Raised / inset | `#F0F1F8` / `#EEF0F7` |
| Border / strong | `#E4E6F0` / `#CDD1E0` |
| Text / secondary / tertiary | `#191B2E` / `#5A5F7A` / `#616782` |
| Accent (Velora orange) | `#C2410C` |
| Action button | `#C2410C` (hover `#B03A0B`) |
| Success / warning / danger / info | `#047857` / `#92400E` / `#B91C1C` / `#1D4ED8` |

Chart series palette (dark): orange `#F94D0C`, teal `#2DD4BF`, blue `#60A5FA`,
amber `#FBBF24`, rose `#FB7185` — light mode uses darker status hues
(orange `#EA580C`, teal `#0F766E`, blue `#2563EB`, amber `#B45309`, rose `#E11D48`).
Gradient fills: vertical accent at 26% → 2% opacity. Gradients are
allowed only on chart fills and the login backdrop (subtle orange radials).

## Typography

- Inter Variable for UI (self-hosted via Fontsource); JetBrains Mono Variable for
  logs, IDs, timestamps, metric values, and axis labels
- Scale: 11–12 labels/meta · 13–14 body/controls · 15 page title · 26 stat values
- Weights 400/500/600; every numeral uses `tabular-nums`

## Shape, depth, motion

- Spacing on a 4 px scale; container max-width 1500 px
- Radius: controls 8 · cards 12 · dialogs 16 · pills 999
- Dark mode shadows are effectively none (borders carry structure); light mode
  uses soft rgba(23,26,54,…) shadows
- Healthy states are silent: no badge, no tone bar, no green pill. Tone appears
  only when a threshold is crossed, and warn/bad badges always carry text
- Hover changes surface/border only; `prefers-reduced-motion` disables transitions

## Components

- Primitives in `src/shared/components/ui`: Button (primary/secondary/ghost/danger ×
  sm/md), Badge (good/warn/bad/neutral/info/brand, optional dot), Card, Input,
  NativeSelect, Select (Radix), Label, Skeleton, EmptyState, Tooltip
- Shell: 248 px fixed sidebar (drawer below 1024 px) with an orange inset tick
  on the active nav item; sticky topbar with live indicator, theme toggle,
  account menu
- Server view renders a single HostStrip panel: status line + three metric
  blocks (lead metric with sparkline, capacity metrics with notched meter
  bars) + one quiet mono facts row
- Service views: compact status strip (dot + title + updated time), grouped
  stat cards, one-line info notes
- Toolbars are controls only (range segmented control + icon refresh,
  right-aligned) — the topbar already names the page; no prose headers
- Charts: first series of each view is a full-width hero (taller plot, larger
  current value); the rest are 2-up small multiples. Headers are title left,
  mono value right, stale pill only when data is old; footers are one quiet
  `min · max` mono line
- Infra views are config-driven: `dashboard/configs/*.ts` produce view models,
  `InfraDashboard` renders them
- Tables use the unlayered `.au-table` classes; form fields use `.au-field`,
  labels `.au-label`, sidebar links `.au-nav-link` (these out-specify anything
  and keep legacy element styling from reappearing)

## Interaction

- Interactive targets are at least 36 px tall; 44 px where space allows
- Keyboard focus is always visible (accent ring, offset)
- Data only refetches on Apply in filter forms; live views poll automatically
- Respect `prefers-reduced-motion`

## Responsive behavior

- ≥1024 px: persistent sidebar; below: drawer from the topbar
- Metric grids: 3 → 2 → 1 columns; call table becomes a card stack below 768 px
- Logs list scrolls internally; tables scroll horizontally in their container

## Content rules

- Short labels: "Alerts", "Logs", "Quality", "Recent"
- Numbers, IDs, and timestamps are always mono with `tabular-nums`
- Helper sentences live in tooltips and accessible names — visible chrome
  carries at most one short context line per page section
- Status text is one phrase; freshness is one timestamp
- Empty and error states include one short recovery sentence
- Never remove diagnostic information; move secondary context into tooltips,
  accessible labels, or disclosures

## Pre-delivery checks

- Contrast ≥ 4.5:1 for normal text in both modes
- Status is never communicated by color alone
- Icons come from lucide-react
- Verify at 375, 768, 1024, and 1440 px in dark and light
- No horizontal page scroll; data tables scroll inside their container
