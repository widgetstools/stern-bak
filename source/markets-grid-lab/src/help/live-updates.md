# Live Updates — flash, signal, repeat

**Four toolbar profiles** (`lab-live-v6`): flash storm (all rules), price
tick only, P&L sign flash, big mid diff moves. Import
[`public/lab-profiles/live-updates/`](../../public/lab-profiles/live-updates/).

Tuned for **maximum visible motion** — default profile seeds four CS rules
plus fast native cell flash (`STORM_FLASH`).

## Stream configuration

```ts
{ providerType: 'mock', dataType: 'positions',
  rowCount: 500, updateIntervalMs: 200,   // 5× per second (default)
  enableUpdates: true, keyColumn: 'id' }
```

The **Tick** slider on this tab's toolbar overrides `updateIntervalMs`
between 100 ms and 1 s. At each tick, 1–4% of rows are mutated — so at
200 ms with 500 rows you see roughly 5–20 row updates every 200 ms.

## Seeded rules

| Rule | Effect | Why |
| --- | --- | --- |
| **Tick flash · prices** | Every `bidPrice` / `midPrice` / `askPrice` / `lastPrice` tick gets a 400 ms `sky` one-shot flash; `activeDurationMs: 400` matches | Shows the "value just changed" UX without judging the sign |
| **Winners** | `[value] > 0` on P&L columns: emerald flash 600 ms + emerald bold text + `arrow-up` top-right indicator | Combines flash + indicator + persistent style |
| **Losers** | `[value] < 0` on same columns: rose flash 600 ms + rose bold text + `arrow-down` top-right indicator | Mirror image |

## General settings

`enableCellChangeFlash: true` · `cellChangeFlashColor: sky` · `cellFlashDuration: 350` ms ·
`cellFadeDuration: 800` ms — seeded via `STORM_FLASH` in
[`src/seeds/generalSettings.ts`](../../src/seeds/generalSettings.ts). Native AG-Grid flash
uses the **sky** swatch; Style Rules use their own palette overlays.

To change the native flash colour in the UI: **Grid Options → DEFAULT COLDEF → CELL CONTENT**
→ enable **FLASH ON CHANGE** → pick a **FLASH COLOR** swatch.

## How the data lands

`startMock(cfg, emit)` is called once on mount. The first snapshot
sets `rowData` once. Each tick emits a delta of changed rows; the lab
pipes those through `gridApi.applyTransactionAsync({ add, update })`
keyed on `id`, so AG Grid only repaints dirty cells. AG-Grid's built-in
cell-flash AND our conditional-styling rule flashes both fire on every
changed cell.

Demo-console scenarios still overlay via transactions on top of the
same stream.

## Try this

1. **Slide Tick down to 100 ms** — the flash storm is the system's
   ceiling. Notice the GPU-driven CSS flashes don't drop frames.
2. **Switch to light mode** — flashes adapt to the light-mode palette.
3. Open **Style Rules** in the toolbar and toggle "Tick flash · prices"
   off — the sign-coloured flashes still fire because they're separate
   rules.
4. Save the profile → reload → everything restores including the
   3 seeded rules.

## Where the seed lives

[src/seeds/conditionalStyling.ts](src/seeds/conditionalStyling.ts) —
`LIVE_TAB_CS_RULES` array.
[src/seeds/generalSettings.ts](src/seeds/generalSettings.ts) —
`STORM_FLASH`.
