# MarketsGrid Feature Lab (`markets-grid-lab`)

An 18-tab developer-onboarding lab for **MarketsGrid**. Its thesis: mount one
component, configure everything through the grid's own UI, and ship behavior
as **profile data** rather than bespoke React. Every feature tab is a single
`LabFeatureConfig` object rendered by one shared shell — most tab modules are
six-line files.

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
| Performance | Stress Test (1k–200k rows × ~120 columns, second window, both row engines) |

Toolbar flags exercised across tabs: `showFiltersToolbar`,
`showFormattingToolbar`, `showEditingToolbar`, `showSmartEditToolbar`,
`showBulkUpdateToolbar`, `showEditHistoryToolbar`, `showVisualExcelExport`,
`showProfileSelector`, `showSaveButton`, `showSettingsButton`.

## Row engines

Every feature tab carries a **Client row model | Perspective (worker-held
Table)** picker, wired once into the shared `LabFeatureTab` shell. Both mount
the same `gridId`, the same columns and the same profiles, so switching is an
A/B of the row engine and nothing else — whatever changes, the engine changed
it.

- **Client** — this window materializes the whole book. Unchanged from before
  the picker existed; it is the control.
- **Perspective** — the book lives once in the SharedWorker and this window
  reads the blocks its viewport asks for. A second window opens a View onto the
  Table that already exists rather than paying for a second copy.

Two consequences worth knowing before you use it:

- The lab boots the **Perspective** worker asset unconditionally. Which worker
  a window runs is settled at `new SharedWorker()`, and only that asset hosts a
  Table — on the default one every Perspective variant would refuse and the
  picker would be decoration. It costs the engine's inline wasm, which is the
  trade a lab whose purpose is running both engines should make (a product app
  that never opens a blotter still gets the smaller default).
- **Scenarios are unavailable under Perspective**, and the demo console says so
  rather than offering buttons that do nothing. Each one patches rows through
  `gridApi.applyTransactionAsync` — a client-side row model's write path — and
  under Perspective the book is in the worker, so the patch has nowhere to land.

The **Stress Test** tab is where the difference is actually visible: the other
tabs run 500 rows over 20–40 columns, where both engines are comfortable and an
A/B that both sides win tells you nothing.

The `Profiles` preset gallery is the one tab without the picker — it mounts its
own grid per preset rather than going through the shared shell, and its subject
is profile persistence, not the row engine.

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
