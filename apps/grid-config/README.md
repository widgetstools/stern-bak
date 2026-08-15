# grid-config — importable cell-renderer profiles

A library of ready-to-import MarketsGrid profiles that exercise every
configurable cell renderer added in
`feat/grid-configurable-cell-renderers`. Use these to demo the new
renderers without authoring rules by hand, and as a known-good baseline
when working on the editors.

## Quick start

1. Boot a demo app that mounts a MarketsGrid (e.g. `npm run app -- star-demo`
   from the repo root).
2. Open the **Profile selector** in the primary toolbar.
3. Click the **Import** button.
4. Pick any `*.profile.json` file from this folder.
5. The new profile appears in the dropdown — select it to apply.

Every profile is additive on import — your existing profiles are not
touched. Imports always create a fresh entry (the id is regenerated)
so you can re-import the same file repeatedly to compare iterations.

## What's in here

Each file is an `ExportedProfilePayload` (`schemaVersion: 1, kind:
'gc-profile'`) targeting `gridId: 'demo-blotter-v2'`. Only the
`column-customization` module state is set — every other module
inherits its default. Imports work in any app that uses the
`demo-blotter-v2` grid id; on other grids, the assignments still
import but only the matching column ids (`side`, `status`, `notional`,
…) will paint.

| # | File | Renderer | Demo data fits? | Visible columns |
|---|------|----------|-----------------|------------------|
| 01 | `01-pill-side-and-status.profile.json` | `pill` | ✅ Yes | `side`, `status` |
| 02 | `02-heatmap-notional-and-yield.profile.json` | `heatmap` | ✅ Yes | `notional`, `yield`, `spread` |
| 03 | `03-percent-bar-fill-rate.profile.json` | `percent-bar` | ✅ Yes (uses `quantity` as max) | `filled`, `quantity` |
| 04 | `04-trend-arrow-spread-and-yield.profile.json` | `trend-arrow` | ✅ Yes | `spread`, `yield` |
| 05 | `05-multi-line-id-and-security.profile.json` | `multi-line` | ✅ Yes | `id`, `counterparty`, `trader` |
| 06 | `06-icon-text-desk-and-venue.profile.json` | `icon-text` | ✅ Yes | `desk`, `venue`, `trader` |
| 07 | `07-country-flag-currency.profile.json` | `country-flag` | ✅ Yes — the renderer recognises ISO-4217 currency codes (USD→🇺🇸, EUR→🇪🇺, GBP→🇬🇧, JPY→🇯🇵, CHF→🇨🇭, …) in addition to ISO-3166-alpha-2 country codes. | `currency` |
| 08 | `08-rating-delta.profile.json` | `rating-delta` | ⚠️ No `prevStatus` field on demo rows — the arrow won't show. The current rating still renders. | `status` |
| 09 | `09-time-since.profile.json` | `time-since` | ⚠️ Demo `time` is `HH:MM:SS` (no date) — `Date.parse` returns `NaN`, cell is blank. `settlementDate` (ISO date) does work. | `settlementDate`, `time` |
| 10 | `10-sparkline.profile.json` | `sparkline` | ❌ Demo rows have scalar `spread/yield/filled`, not arrays. Profile imports cleanly and the **Cell Renderer band** in column-settings shows the editor for tweaking config — but the cells render empty. Wire array data in your blotter to see the chart. | `spread`, `yield`, `filled` |
| 11 | `11-allocation-bar.profile.json` | `allocation-bar` | ❌ Demo `notional` is a scalar number, not a `{ key: weight }` object. Same as sparkline — useful for surfacing the editor, no visible bar. | `notional` |
| 12 | `12-kitchen-sink.profile.json` | All "✅ Yes" renderers above in one profile | ✅ Yes (skips the data-shape mismatches) | id, side, status, notional, yield, filled, spread, desk, trader |

> **Note on partial-fit profiles (07–11):** they're shipped because
> the **point** of the profile selector + the cell-renderer band is
> "configure once, apply per column" — even when the demo's row data
> doesn't naturally feed a given renderer, importing the profile is
> the quickest path to inspecting the editor UI for that renderer in
> the **Settings sheet → Column Settings → band 10 (CELL RENDERER)**.

## Editing a profile by hand

Each file is plain JSON. The shape is:

```jsonc
{
  "schemaVersion": 1,
  "kind": "gc-profile",
  "exportedAt": "ISO timestamp",
  "profile": {
    "name": "🎨 Display name shown in the Profile dropdown",
    "gridId": "demo-blotter-v2",     // must match host gridId
    "state": {
      "column-customization": {
        "v": 10,                      // current schemaVersion of this module
        "data": {
          "assignments": {
            "<colId>": {
              "colId": "<colId>",
              "cellRendererId": "<id from the registry>",
              "cellRendererConfig": {
                "kind": "<same id>",
                "config": { /* per-renderer fields */ }
              }
              // …other ColumnAssignment fields can ride along here too:
              // headerName, initialWidth, cellStyleOverrides (themed),
              // valueFormatterTemplate, filter, rowGrouping, cellEditor.
            }
          }
        }
      }
    }
  }
}
```

The renderer ids and their `config` shapes are exported from
`@wellsfargo-starui/design-system` — see `cellRendererRegistry.ts` for the
authoritative types
(`PillRendererConfig`, `HeatmapRendererConfig`, etc.).

## Theme-aware colours

Every colour field uses the `ThemeAwareColor` shape:

```json
{ "dark": "#16a34a", "light": "#bbf7d0" }
```

Either slot may be omitted — the renderer falls back to whichever slot
is present. The renderers watch `<html data-theme>` and re-paint on
theme flip, so the same profile looks correct in both modes.

## Updating the schemaVersion

The configs pin `v: 10` because that's the current schemaVersion of
the `column-customization` module (after the cell-renderer band ship).
When the module's `schemaVersion` is bumped again, **profiles with an
older `v` still load** — the module's `migrate(...)` lifts them
forward — but it's good hygiene to re-export a fresh copy after a
schema bump so the file shows current-shape data.

## Authoring new profiles

The fastest path:

1. Open the demo, switch to the Settings sheet → Column Settings.
2. Author the band 10 (CELL RENDERER) configuration interactively.
3. Save the profile, then **Export** it from the Profile dropdown.
4. Drop the downloaded JSON into this folder with a new
   `NN-name.profile.json` filename, and add a row to the table above.
