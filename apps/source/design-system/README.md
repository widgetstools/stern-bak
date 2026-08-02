# StarUI Design System — FI Terminal (`design-system` demo)

A fixed-income trading terminal that doubles as the **live reference for the
StarUI token system**: every pixel resolves through `--ds-*` design-system
variables (the source contains zero hardcoded colors), and a built-in
**Design System** tab documents the tokens and all component primitives with
live previews and copyable code.

```bash
npm run dev        # http://localhost:5310
npm run typecheck  # tsc --noEmit
npm test           # vitest
```

## What it demonstrates

- **The complete token pipeline** — `@wellsfargo-starui/design-system/css`
  (tokens + base layer), `applyTheme`/`getTheme` for dark/light switching with
  no flash-of-wrong-theme, the Tailwind preset, and the AG Grid theme adapter
  (`staruiGridTheme` + `applyGridDensityToTheme` for dense blotters).
- **~45 shadcn primitives from `@wellsfargo-starui/react`** in production-like
  compositions — forms (`Form` + `react-hook-form`), tables, dialogs, drawers,
  command palette, toasts, toggle groups — plus `@wellsfargo-starui/react/chart`
  wrapping recharts with token-driven series colors in 11 analytics panels.
- **Dock-managed workspace** — six tabs, each hosting its own dock-manager
  instance with 23 registered panels.

## Layout

| Tab | Panels |
|---|---|
| Market | Order Book (depth ladder), Bond Blotter (AG Grid), Recent Prints (ticking tape), Price chart |
| Orders | Orders Summary KPIs, Order Blotter, Order Detail, Order Entry (`Form` reference demo) |
| Analytics | OAS vs Duration scatter, Duration Buckets, Sector Allocation, CDX IG/HY, OAS Distribution, P&L Attribution |
| Risk | Risk KPIs, Book Risk heatmap, DV01 by Book, Rate Scenarios, VaR Trend, Risk Limits gauges |
| Research | Research Notes list, Note Detail |
| Design System | Foundations (palette, typography, radius/elevation) + 46 component demos with copyable imports & usage |

Floating (not docked): **Trade Ticket** and **RFQ Workbench**, both in a
draggable window.

## Patterns worth copying

- **Theme** — `applyTheme(getTheme())` runs before first render
  ([main.tsx](./src/main.tsx)); a single `ThemeModeProvider` shares toggle
  state; the dock remounts keyed on mode while layout state carries through.
- **Dock persistence** — [`lib/dock/persistence.ts`](./src/lib/dock/persistence.ts)
  saves per-tab layouts to `localStorage` (SSR-guarded, quota-safe);
  [`lib/dock/helpers.ts`](./src/lib/dock/helpers.ts) provides four combinators
  that keep each tab's layout a single readable expression.
- **Deterministic data** — a seeded PRNG makes every chart, ladder and quote
  reproducible (and snapshot-testable).

## StarUI surfaces consumed

`@wellsfargo-starui/react` (+`/chart`) · `@wellsfargo-starui/design-system`
(+`/css`, `/tailwind`, `/adapters/ag-grid`) · platform consumer glue
(`staruiConsumerVite.mjs`, `tsconfig.consumer.json`).

Third-party: dock manager (`@widgetstools/*`), `ag-grid-community`/`react`,
`recharts`, `react-hook-form`, `lucide-react`.

> Framework docs: [`docs/latest/`](../../../docs/latest/README.md) — start
> with the overview, then the architecture reference.
