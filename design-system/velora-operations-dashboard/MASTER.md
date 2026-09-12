# Velora Operations Dashboard

## Direction

- Style: minimal, flat, dark, data-first
- Variance: 2/10
- Motion: 2/10
- Density: 7/10
- Goal: show status and values first; reveal explanations only when needed

## Visual rules

- Use one neutral page background and one flat card surface.
- Avoid gradients, glass effects, decorative grids, glow, and card shadows.
- Use green, amber, and red only for operational state.
- Keep borders subtle and radii between 6–10px.
- Prefer native sans-serif UI text; reserve monospace for values, IDs, logs, and timestamps.
- Keep one visible page title. Do not repeat the same heading in the content.
- Hide helper copy when the label and value already explain the metric.
- Put technical explanations inside a details disclosure.

## Tokens

| Role | Value |
| --- | --- |
| Background | `#0C0D0F` |
| Sidebar | `#101114` |
| Card | `#141518` |
| Raised | `#1A1C20` |
| Border | `#27292D` |
| Strong border | `#3A3D43` |
| Text | `#F4F4F5` |
| Muted text | `#A1A1AA` |
| Dim text | `#85858E` |
| Healthy | `#4ADE80` |
| Warning | `#F59E0B` |
| Critical | `#EF4444` |

## Interaction

- Interactive targets are at least 44×44px where space allows.
- Hover changes surface or border only; it never moves layout.
- Keyboard focus is always visible.
- Animation is limited to short state transitions and loading indicators.
- Respect `prefers-reduced-motion`.

## Responsive behavior

- Desktop: persistent 220px sidebar, compact sticky topbar.
- Tablet/mobile: horizontal scroll navigation with group labels removed.
- Metrics collapse from three columns to two, then one.
- Tables and logs scroll horizontally instead of compressing data.

## Content rules

- Prefer short labels: “Alerts”, “Logs”, “Quality”, “Recent”.
- Keep status text to one phrase and freshness to one timestamp.
- Empty and error states may include one short recovery sentence.
- Do not remove information required to diagnose an incident; move secondary context to tooltips, accessible labels, or disclosures.

## Pre-delivery checks

- Contrast is at least 4.5:1 for normal text.
- Status is never communicated by color alone.
- Icons come from the shared SVG icon set.
- Focus states remain visible.
- Verify at 375px, 768px, 1024px, and 1440px.
- No horizontal page scroll; data tables may scroll inside their container.
