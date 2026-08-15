# MarketsGrid Feature Lab (`markets-grid-lab`)

A 17-tab developer-onboarding lab for **MarketsGrid**. Its thesis: mount one
component, configure everything through the grid's own UI, and ship behavior
as **profile data** rather than bespoke React. Every feature tab is a single
`LabFeatureConfig` object rendered by one shared shell — 16 of the 17 tab
modules are six-line files.

```bash
npm run dev        # http://localhost:5300
npm run typecheck  # tsc --noEmit
npm test           # vitest (70% per-file coverage gate)
```

## Tabs

| Area | Tabs |
|---|---|
| Orientation | Home (mental model + mount snippet), Overview (kitchen sink: sideBar, 4-panel statusBar) |
| Formatting | Formatting (Excel format strings, ticks), Formatter Toolbar (live cell + header paint), Visual Excel (WYSIWYG `.xlsx` export), Cell Renderers (pill, heatmap, sparkline, percent-bar, trend-arrow, …), Conditional Styling (expression rules + indicators) |
| Columns | Column Groups, Calculated Columns (virtual/derived), Quick Filters (saved-filter pills) |
| Data | Live Updates (high-frequency stream through the SharedWorker hub) |
| Editing | Editing (unified family), Bulk Update, Plus/Minus (keyboard nudge), Shortcuts (letter-key arithmetic), Alerts (triggers, channels, rate-limits) |
| Profiles | Profiles (preset gallery → per-preset grid lens) |

Toolbar flags exercised across tabs: `showFiltersToolbar`,
`showFormattingToolbar`, `showEditingToolbar`, `showVisualExcelExport`,
`showProfileSelector`, `showSaveButton`, `showSettingsButton`.

## How it works

- **Profile seeding** — [`src/profiles/catalogs/`](./src/profiles/catalogs/)
  declares demo profiles per tab; `labProfileKit` serializes a seed into
  per-module state and `useLabDemoProfiles` installs it once via
  `handle.setConfig()` (localStorage-flagged, StrictMode-safe).
- **Streaming** — the SharedWorker data hub boots from
  [`public/app-config.json`](./public/app-config.json); one mock provider per
  tab. Snapshots set React `rowData`; tick deltas flow through
  `applyTransactionAsync` so only changed rows repaint.
- **Demo console rail** — pause ticks, change the tick interval, inject
  market scenarios as sparse per-row overlays.
- **Inspector drawer** — per-tab What/Why · Try this · Config · Props,
  rendered from the markdown in [`src/help/`](./src/help/).
- **Profile export tooling** — `scripts/writeLabProfileJson.ts` /
  `writeAlertProfileJson.ts` emit `gc-profile` JSON into
  `public/lab-profiles/` and `public/alert-profiles/`.

> The seed files under `src/seeds/` carry literal hex **by design**: they are
> profile *data* (always `{dark, light}` pairs, so both themes render), and
> the Visual Excel path writes the colors into `.xlsx` cells where CSS
> variables cannot resolve. They are carved out of `check:ds-tokens`
> accordingly.

## StarUI surfaces consumed

`@wellsfargo-starui/grid` (`MarketsGrid`, storage helpers, `/customizer`
types, `/styles.css`) · `@wellsfargo-starui/react` (+`/data/runtime`) ·
`@wellsfargo-starui/core` (profile/editing types) · `@wellsfargo-starui/data`
(+`/runtime`, worker asset) · `@wellsfargo-starui/design-system` (+`/css`) ·
`@wellsfargo-starui/types`.

E2E specs in [`apps/e2e/`](../../e2e/) drive this app on `:5300`
(`lab-onboarding`, `v2-alerts`, `v2-editing`, `v2-smart-edit`,
`v2-bulk-update`, `v2-plus-minus`, `v2-shortcuts`, `v2-edit-history`).

> Framework docs: [`docs/latest/`](../../../docs/latest/README.md).
