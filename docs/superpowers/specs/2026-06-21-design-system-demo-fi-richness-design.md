# Design System Demo — FI-Realism + Dock-Manager Enhancement

**Date:** 2026-06-21
**App:** `apps/demos/design-system` (`@wellsfargo-starui/design-system-demo`)
**Status:** Approved design, ready for implementation planning
**Builds on:** the v1 app (spec `2026-06-21-design-system-demo-app-design.md`); branch `feat/design-system-demo-app`.

## Goal

Raise the trading side of the demo to the realism and richness of
`/Users/develop/wfh/fi-trading-terminal` (inspiration only — our design system + components):
a genuinely fixed-income trade ticket, a dealer-depth order book with product context,
an innovative RFQ workbench, and chart-heavy Analytics/Risk/Research — all laid out with
`@widgetstools/react-dock-manager`. The Design System tab is unchanged.

## Decisions (locked during brainstorming)

| Decision | Choice |
|---|---|
| Tabs | **Enrich the existing 6** (Market, Orders, Analytics, Risk, Research, Design System) — no new tabs. The rich order book + Trade Ticket + RFQ fold into **Market**. |
| Layout engine | **`@widgetstools/react-dock-manager`** (`^1.0.0`, public npm — clean install, NO local tarball) replaces `react-resizable-panels` for tab layouts. |
| Execution | One spec, **phased plan**. |
| FI realism | All instruments are **bonds** (coupon/maturity/yield); no equity semantics. Ticket/depth/RFQ use notional-in-MM, yields, dealers, settlement. |
| Charts | `@wellsfargo-starui/ui` chart wrapper + recharts, colored from `--ds-chart-1..5` + accent tokens. |

## Non-Goals (YAGNI)

- No real execution/backend, no OpenFin, no Angular. Deterministic mock data only.
- Charts limited to the sets listed below. Design System tab content unchanged.
- The gallery's `resizable` component demo stays (it documents the `@wellsfargo-starui/ui` primitive); only the *tab layouts* move to dock-manager.

## Architecture

### A. Dock-manager shell + FI data model

**Dependencies:** add `@widgetstools/react-dock-manager` and `@widgetstools/dock-manager-core`
(`^1.0.0`) to `apps/demos/design-system/package.json`; `npm run install:apps`. (Exact export
names — `DockManagerCore`, `WidgetProps`, `DockManagerCoreHandle`, `PanelConfig`, `LayoutNode`,
`DockManagerState`, `serialize`/`deserialize`, and the imperative `getApi()` surface
`addPanel`/`floatPanel`/`hasPanel`/`getGroupForPanel`/`setActivePanel`/`bringToFront` — are
verified against the installed v1.0.0 in plan Task 1 before use; adapt if the public API differs.)

**`App.tsx` becomes a dock host:**
- A **widget registry** `WIDGETS: Record<string, ComponentType<WidgetProps>>` maps widget ids → panel components.
- `lib/dock/helpers.ts` — small builders `p(id,title,widgetType,closable?)`, `tg(id,panels,active?)`,
  `sp(id,dir,sizes,children)`, and a `base(layout,panels,active)` that assembles a `DockManagerState`.
- `lib/dock/layouts.ts` — one **dock layout per tab** (Market/Orders/Analytics/Risk/Research) + a single-panel
  layout for Design System.
- `lib/dock/persistence.ts` — `saveLayout(tab,state)` / `getSavedLayout(tab)` to `localStorage` key `ds-dock-<tab>`.
- **Floating panels:** Trade Ticket (`~280×520`) and RFQ Workbench (`~820×540`) opened from new TopBar
  buttons (`+ New Order`, `RFQ`); draggable + closable. Save / Reset layout icon buttons in the TopBar.
- **Shared cross-panel state** (selected instrument id, clicked price, RFQ requests) lifted to App via a
  React context (`DemoStateProvider`) so blotter → order book → ticket stay in sync. (Context, not the fi
  global-closure pattern — cleaner and testable.)
- **Design System tab** renders as one full-area panel; content unchanged.

**FI data model** (`data/types.ts`, `data/seeds.ts`, `data/applyTick.ts`): extend `Instrument` with
`ytw`, `gSpd`, `cvx`, `seniority`, `axes`, `ratingClass: 'aaa'|'aa'|'a'|'bbb'|'hy'` (keep existing
`oas`, `dur`/`dv01` already on Quote/derived). Add: `DEALERS` (GS, MS, JPM, BAML, CITI, DB, BARC, UBS);
`CURVE_SERIES` (today/week/month, ~11 tenors); `RATE_SCENARIOS` (-100bp…+100bp); `BOOK_RISK` rows
(CREDIT-IG, CREDIT-HY, RATES-UST, RATES-TIPS, MUNI); `MARKET_INDICES`; `RESEARCH_NOTES`
(rating, oasTarget, oasCurrent, author, sector, summary, risks). `applyTick` extends to nudge `ytm`/`oas`
within bounds alongside prices; still pure + deterministic (injected rng, no `Date.now`/`Math.random`).

### B. Trading panels (Market tab)

Market dock layout: blotter + price chart (top); dealer order book + recent prints (bottom). Ticket & RFQ float.

- **`TradeTicket`** (`panels/TradeTicket.tsx`): security header (ticker·coupon·maturity·mid); clickable Bid/Ask
  strip; Buy/Sell `ToggleGroup`; order-type tabs **Limit/Market/Stop-Limit** (Stop price conditional; price
  hidden for Market); **Notional (MM)** `Input` + **25/50/75/100%** quick-fill `Button`s; **TIF** GTC/IOC/FOK/DAY
  `ToggleGroup`; **Est. Total**; order-summary box; Buy/Sell CTA → toast. Shows yield next to price.
- **`OrderBook`** (`panels/OrderBook.tsx`): instrument **context header** (ticker·coupon·maturity·issuer·CUSIP·
  rating·OAS·DUR·"30 levels ● LIVE"); ladder columns **Dealer·Price·Yield·Face(MM)·DV01·Type**
  (STREAM/IND/RFQ `Badge`); OFFERS(ASK) above + BIDS below (~12–15 levels each) with cumulative fill bars
  (token `--ds-trade-bid-fill`/`ask-fill`); center **Mid/Spread/Mid-Yield/Z-Spread** row; footer **Bid DV01 /
  Ask DV01 / Min size / Firm / Settle T+1**. Level click → ticket price. Synthesized deterministically from the
  selected quote.
- **`RecentPrints`** (`panels/RecentPrints.tsx`): side·cpty·price·yield·face·time, ticking.
- **`RfqWorkbench`** (`panels/RfqWorkbench.tsx`): left New-RFQ form (searchable instrument, Buy/Sell, size
  2/5/10/15 MM, dealer multi-select, Send) + history list with **countdown rings** (SVG arc) + status badges;
  right quote ladder (best banner; table Dealer·Bid·BidSize·Ask·AskSize·Spread¢·Status·Action with ▲BEST/▼BEST
  + **HIT/LIFT**; execution → green confirm). Backed by a pure **`rfqReducer`** state machine
  (`data/rfq.ts`): `pending → quoted → done | cancelled`, quotes stream stochastically (injected rng), 30s
  expiry modeled by a tick count (no wall-clock in the reducer; the component drives ticks).

### C. Chart-heavy Analytics / Risk / Research

- **Analytics** (6 panels): OAS-vs-Duration scatter (bubble=DV01, color by `ratingClass`); Duration-Buckets
  dual-axis bar; Sector-Allocation donut; CDX IG/HY historical dual-axis area (gradient fills); OAS-Distribution
  horizontal bar; P&L-Attribution waterfall bar + Net P&L MTD footer.
- **Risk**: KPI strip (Portfolio DV01, Total MV, VaR 95% 1D, OAS Duration, Spread PnL MTD, Credit Delta);
  Book-Risk table + OAS heatmap grid; DV01-by-Book bar; Rate-Scenarios bar (pos/neg colored); VaR-Trend line;
  Risk-Limits gauges (`Progress`, green/amber/red by utilization).
- **Research**: sector-filtered note list (left) + rich note detail (right): ticker+rating, meta grid, **OAS
  Target (12M) vs Current OAS** cards, summary, **Key Risks** box.

All chart series derive from the expanded data; recharts via `@wellsfargo-starui/ui/chart`; colors from tokens only.

### D. File structure (new/changed under `apps/demos/design-system/src/`)

```
lib/dock/  helpers.ts  layouts.ts  persistence.ts  registry.tsx
state/     DemoStateProvider.tsx     (selected instrument, clicked price, rfq requests)
data/      types.ts*  seeds.ts*  applyTick.ts*(+test)  rfq.ts(+test)  useTickingStore.ts*
panels/    TradeTicket.tsx  OrderBook.tsx  RecentPrints.tsx  RfqWorkbench.tsx  BondBlotter.tsx*
           PriceChart.tsx*  Watchlist.tsx*  OrdersBlotter.tsx*  OrderEntryForm.tsx*
           analytics/ OasDurationScatter.tsx  DurationBuckets.tsx  SectorDonut.tsx
                      HistoricalOas.tsx  OasDistribution.tsx  PnlAttribution.tsx
           risk/ RiskKpiStrip.tsx  BookRisk.tsx  Dv01ByBook.tsx  RateScenarios.tsx
                 VarTrend.tsx  RiskLimits.tsx
           research/ ResearchList.tsx  NoteDetail.tsx
App.tsx*   dock host + TopBar buttons (New Order / RFQ / Save / Reset)
tabs/*     replaced by lib/dock layouts (old resizable tab files removed)
```
(`*` = modified existing file.) Each panel is a focused unit under the LOC ceilings.

## Testing

- **Unit (Vitest, repo-root `npx vitest run apps/demos/design-system/src/...`):** extend `applyTick.test.ts`
  for new fields/bounds; new `rfq.test.ts` (state transitions: pending→quoted on quote arrival, done on
  hit/lift, cancelled on expiry; immutability); `lib/dock/layouts.test.ts` (every layout references only
  registered widget ids; panel ids unique). Showcase completeness gate untouched.
- **Playwright smoke** (`e2e/design-system-demo.spec.ts`, extend): Market boots with the order book; `+ New
  Order` floats the Trade Ticket; `RFQ` opens the workbench; an Analytics chart renders; theme toggle still
  flips `data-theme`. Keep the Design-System gallery assertions.
- **Docs:** update `docs/current-features.md` (trading enrichment + dock-manager).

## Global constraints (unchanged from v1)

Design-system tokens only (`--ds-*`; no hardcoded hex); shadcn/recharts primitives only; AG Grid via
`staruiGridTheme`/`blotterTheme` inheriting `<html data-ag-theme-mode>`; dark+light; camelCase/PascalCase;
800 LOC/file, 80 LOC/function; commit trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

## Success criteria

The Market tab reads as a real FI desk: a dealer-depth order book with full product context, an FI trade
ticket (notional MM, yields, TIF, order types), and an RFQ workbench with HIT/LIFT and countdowns — all in a
dock-manager workspace with save/reset and floating ticket/RFQ. Analytics/Risk/Research are chart-rich and
FI-specific. Everything is styled only by `@wellsfargo-starui/design-system` + `@wellsfargo-starui/ui`, dark and light, deterministic.
