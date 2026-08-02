# Bond Blotter (`basic`) — the minimal MarketsGrid tutorial

The smallest complete **MarketsGrid** host: one grid, 180 deterministic mock
bonds, 34 fixed-income columns, and the full **local-storage profile
persistence** path. Start here if you are new to StarUI.

```bash
npm run dev        # http://localhost:5194
npm run typecheck  # tsc --noEmit
npm test           # vitest (70% per-file coverage gate)
```

## What it demonstrates

- **The essential mount** — `MarketsGrid` + `createMarketsGridLocalStorageStorage()`
  + a stable `gridId` ([`src/App.tsx`](./src/App.tsx)); columns, filters and
  formats survive reload with no further wiring.
- **One key, one JSON document** — every layout persists under the single
  key from `marketsGridLocalStorageBundleKey(GRID_ID)`
  ([`src/gridId.ts`](./src/gridId.ts)); `activeProfileKey(GRID_ID)` holds the
  active-profile pointer.
- **Event-driven UI, not polling** — the header's profile pulse subscribes to
  the grid's `profile:loaded` / `profile:saved` events in `onReady` (with
  disposers released on unmount) instead of polling localStorage.
- **Theming** — `applyTheme(getTheme())` before first render; `Ctrl+.` and a
  header toggle flip `data-theme` for the whole app, grid included.
- **Config inspector** ([`src/components/ConfigInspector.tsx`](./src/components/ConfigInspector.tsx)) —
  a live localStorage viewer (layouts + raw JSON tabs, byte sizes,
  copy-to-clipboard).
- **Export / import round-trip** — `Ctrl+E` downloads the bundle;
  `Ctrl+I` restores it through the hidden-file-picker carve-out.
- **Deterministic data** — `mulberry32(seed=42)` keeps row ids stable across
  reloads, which is what makes profile snapshots meaningful.

## Keymap

`Ctrl+E` export · `Ctrl+I` import · `Ctrl+J` inspector · `Ctrl+/` help ·
`Ctrl+.` theme · `Ctrl+Shift+R` reset.

## Ready-made layouts

Three importable fixtures live in [`layouts/`](./layouts/) —
`trader-console`, `risk-and-pnl`, `relative-value` — each validated against
the `Bond` shape with balanced light/dark style pairs.

## StarUI surfaces consumed

`@wellsfargo-starui/grid` (`MarketsGrid`, storage helper, `/styles.css`) ·
`@wellsfargo-starui/core` (storage-key helpers) ·
`@wellsfargo-starui/react` (Menubar, Sheet, Tabs, Tooltip, Button, …) ·
`@wellsfargo-starui/design-system` (`applyTheme`, `getTheme`, `/css`).

> Framework docs: [`docs/latest/`](../../../docs/latest/README.md) — the
> getting-started guide walks through exactly this app.
