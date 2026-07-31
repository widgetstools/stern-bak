# Design System Demo App (`apps/demos/design-system`)

**Date:** 2026-06-21
**Status:** Approved design, ready for implementation planning

## Goal

A new React demo app that proves `@wellsfargo-starui/design-system` + `@wellsfargo-starui/ui` can dress
a real client application. It has two faces:

1. **A fixed-income trading terminal** (fi-trading-terminal-inspired) — Market,
   Orders, Analytics, Risk, Research tabs — entirely styled by our design system,
   with AG Grid token-themed and recharts charts using the design-system color ramp.
2. **A Design System reference tab** — palette, typography, foundations, and a
   live, copy-ready gallery of **all 52 `@wellsfargo-starui/ui` components**.

The fi-trading-terminal at `/Users/develop/wfh/fi-trading-terminal` is **inspiration
only** (our design system was extracted from it). The app consumes **our** packages
from this monorepo — no code is copied from fi.

## Decisions (locked during brainstorming)

| Decision | Choice |
|---|---|
| Trading breadth | Full fi-style multi-tab terminal: Market · Orders · Analytics · Risk · Research |
| Charts | Yes — yield-curve + price chart (recharts via `@wellsfargo-starui/ui` chart + design-system 5-color ramp) |
| Design System tab depth | Live example **+ code + import** per component, all 52, grouped by category |
| Data | Mock seed + **live ticking** (in-app interval reducer; no backend) |
| App name / folder | folder `apps/demos/design-system`; workspace `@wellsfargo-starui/design-system-demo` (bare name is the real package) |
| Dev port | 5310 (confirmed free) |

## Non-Goals (YAGNI)

- No backend / real market data; no OpenFin; no Angular twin; no auth; no layout persistence.
- Charts limited to yield-curve + price; no candlestick/depth-chart engine.
- RFQ simulator is a light mock; the terminal is illustrative, not a functional OMS.
- No SharedWorker / DataHub — data is a self-contained in-app mock.

## Architecture

### A. Identity, stack, theming

- **Folder:** `apps/demos/design-system`. **Workspace name:** `@wellsfargo-starui/design-system-demo`. **Port:** 5310.
- **Stack:** React 19.2.x, Vite 7 via `scripts/staruiConsumerVite.mjs`, Tailwind 3.4
  with `scripts/staruiTailwindPreset.cjs` + `scripts/tailwindContentGlobs.mjs`,
  `lucide-react`, `ag-grid-community`/`-enterprise`/`-react` 35.1.0, `recharts` ^3.6.0,
  `tailwindcss-animate`. (Mirror `markets-grid-lab/package.json` + recharts.)
- **Consumes our packages from source** — `@wellsfargo-starui/*` is resolved by the consumer Vite
  aliases, so **no `@wellsfargo-starui/*` deps** in `package.json`. Used:
  `@wellsfargo-starui/design-system` (`/css`, `applyTheme`/`getTheme`, tokens, `/adapters/ag-grid`),
  `@wellsfargo-starui/ui` (all 52 components).
- **Theming:** `globals.css` imports `@wellsfargo-starui/design-system/css`; `main.tsx` calls
  `applyTheme(getTheme())` at module scope before render (no FOUC). A reused
  **ThemeToggle** (pattern from `markets-grid-lab/src/components/ThemeToggle.tsx`)
  flips `data-theme` dark↔light via `applyTheme({ theme })`. Every surface uses
  `--ds-*` tokens; no hardcoded hex.
- **AG Grid theming:** import the prebuilt **`staruiGridTheme`** from
  `@wellsfargo-starui/design-system/adapters/ag-grid` (it reads live OKLCH `--*` token vars and
  switches by the `data-ag-theme-mode` attribute). The grid wrapper sets
  `data-ag-theme-mode="dark"|"light"` to match the current theme. A density variant
  (`agGridBlotterDarkTheme`/`…Light` or `applyGridDensityToTheme`) may be used for the
  dense blotter. `lib/agGridTheme.ts` centralizes this.
- **main.tsx:** plain `applyTheme(getTheme())` + `createRoot(<App/>)` — no DataHubProvider.

### B. Shell, navigation, trading tabs, data

**Shell** (`App.tsx`): a `TopBar` (brand, a ticking market-status strip, a `Command`
global search, `ThemeToggle`) over a top tab nav — **Market · Orders · Analytics ·
Risk · Research · Design System** — driving Radix `Tabs`/`TabsContent`. Multi-panel
trading views use `react-resizable-panels` (the shadcn `resizable` primitive).

**Trading tabs** (composed from `@wellsfargo-starui/ui` + AG Grid + tokens):
- **Market** — `BondBlotter` (AG Grid, ticking, design-system cell renderers for
  price/yield/Δ), `Watchlist`, `OrderBook` (depth), `PriceChart`, and a `TradeTicket`
  (`Sheet`/`Dialog` + `Form`: side toggle, qty, price, settlement `Select`).
- **Orders** — `OrdersBlotter` (status `Badge`s), `OrderEntryForm` (react-hook-form via
  `@wellsfargo-starui/ui` `Form`), `RfqSimulator` (light mock).
- **Analytics** — `YieldCurveChart` (recharts + chart ramp), `AnalyticsCards` (KPIs), a table.
- **Risk** — exposure/limit tables with token-driven heat coloring, `Progress` limit bars, VaR KPI cards.
- **Research** — `Card`s, `Accordion`s, `HoverCard`s, nested `Tabs` (non-grid composition).

**Data model** (`src/data/`): typed seeds for `Instrument`/`Quote`/`Order`/`Position`
(FI fields: cusip, coupon, maturity, bid/mid/ask, ytm, oas, dv01, pnl). A pure
`applyTick(state)` reducer nudges prices/yields and flags direction; a `useTickingStore`
hook drives interval updates and exposes selectors. Charts derive from the same seed.
Reducer + selectors are isolated and unit-testable.

### C. Design System tab

Its own left sub-nav (sections), each a focused component:
1. **Overview** — what the system is + how to consume it (`@wellsfargo-starui/design-system/css`
   import, `applyTheme`, Tailwind preset), with copyable setup snippets.
2. **Palette** — swatch grids for every semantic token group (surface, text, border,
   accent, **trade** bid/ask/strips, **action** buy/sell, overlay, **chart ramp**,
   elevation). Each swatch renders the **live `var(--ds-*)`** value (theme-reactive) and
   labels token name + role.
3. **Typography** — the type scale (9/11/13/18px tiers), sans vs mono, weights, sample usages.
4. **Foundations** — radius, spacing, elevation/shadow, focus ring — rendered live from tokens.
5. **Components** — gallery of **all 52 `@wellsfargo-starui/ui` components**, grouped by category
   (Buttons & Actions, Inputs & Forms, Selection, Overlays & Dialogs, Navigation,
   Data Display, Feedback & Status, Layout & Disclosure, Charts).

**Gallery framework** (`src/showcase/`, data-driven, isolated):
- `types.ts` — `ShowcaseEntry { id; name; category: ShowcaseCategory; importLine; code; Demo: ReactNode|() => ReactNode }`.
- `registry.ts` — barrel composing per-category entry files under `showcase/components/`
  (`buttons.tsx`, `inputs.tsx`, `selection.tsx`, `overlays.tsx`, `navigation.tsx`,
  `dataDisplay.tsx`, `feedback.tsx`, `layout.tsx`, `charts.tsx`). Each entry file is
  focused and under the LOC ceiling.
- `ComponentDemo.tsx` — shared renderer: live preview in a bordered canvas + a
  **Code/Preview** toggle + copy button (reuse the code-block/copy pattern from the
  markets-grid-lab Inspector).
- **Completeness:** a unit test asserts every public UI component module in
  `packages/react-ui/ui/src/components` has a gallery entry, with a documented allowlist
  for non-visual utilities (`use-toast`, `toaster`, `sonner`, `CollapsibleToolbar`,
  `ToolbarContainer`, `VirtualizedList`). The gallery cannot silently fall behind the library.

### D. File structure

```
apps/demos/design-system/
  index.html · vite.config.ts · tsconfig.json · tailwind.config.js · postcss.config.js · package.json
  src/
    main.tsx · App.tsx · globals.css
    components/  TopBar.tsx  ThemeToggle.tsx  CodeBlock.tsx  ResizableWorkspace.tsx
    lib/         agGridTheme.ts
    data/        types.ts  seeds.ts  formatters.ts  applyTick.ts  applyTick.test.ts  useTickingStore.ts
    tabs/        MarketTab.tsx  OrdersTab.tsx  AnalyticsTab.tsx  RiskTab.tsx  ResearchTab.tsx  DesignSystemTab.tsx
    panels/      BondBlotter.tsx  Watchlist.tsx  OrderBook.tsx  PriceChart.tsx  TradeTicket.tsx
                 OrdersBlotter.tsx  OrderEntryForm.tsx  RfqSimulator.tsx
                 YieldCurveChart.tsx  AnalyticsCards.tsx  RiskPanels.tsx  ResearchPanels.tsx
    showcase/    types.ts  registry.ts  registry.test.ts  ComponentDemo.tsx
                 sections/  OverviewSection.tsx  PaletteSection.tsx  TypographySection.tsx  FoundationsSection.tsx
                 palette.ts  (token-group data: var names + labels + roles)
                 components/ buttons.tsx inputs.tsx selection.tsx overlays.tsx navigation.tsx dataDisplay.tsx feedback.tsx layout.tsx charts.tsx
```

### Registration

- Add `demos/design-system` to `apps/package.json` `workspaces` (the nested apps
  workspace; the **root** `package.json` does not list apps, so it is not edited).
- `scripts/build-app-track.mjs` auto-discovers apps under `apps/demos/` — no edit needed.
- Add a `webServer` entry on port 5310 to `playwright.config.ts` so the smoke spec runs.
- `npm run install:apps` after adding the workspace.

## Testing

- **Unit (Vitest, run from repo root via `npx vitest run apps/demos/design-system/src/...`):**
  - `applyTick` reducer — prices nudge within bounds, direction flags set, row ids stable.
  - showcase **registry completeness** — every public `@wellsfargo-starui/ui` component has an entry;
    categories valid; each entry has `importLine`, `code`, and a `Demo`.
  - palette token-group data integrity — every listed token name is non-empty/unique.
- **Playwright smoke** (`e2e/design-system-demo.spec.ts`, port 5310): app loads on Market;
  tab switch Market→Design System works; the component gallery renders a known component;
  the ThemeToggle flips `data-theme` and a swatch's computed color changes.
- **Docs:** add the app to `docs/current-features.md` (apps table + a sub-section).

## Success Criteria

Runs on 5310; looks like a cohesive FI terminal fully styled by `@wellsfargo-starui/design-system`
in both dark and light; AG Grid is token-themed and switches with the theme; recharts
charts use the design-system ramp; and the Design System tab is a complete, live,
copy-ready reference for palette, typography, foundations, and all 52 `@wellsfargo-starui/ui`
components.
