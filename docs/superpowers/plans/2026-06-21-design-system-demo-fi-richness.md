# Design System Demo — FI-Realism + Dock-Manager — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Raise the `apps/demos/design-system` trading side to fi-trading-terminal richness — an FI trade ticket, a dealer-depth order book with product context, an RFQ workbench, and chart-heavy Analytics/Risk/Research — laid out with `@widgetstools/react-dock-manager`. Design System tab unchanged.

**Architecture:** `App.tsx` becomes a dock host: a widget registry maps `widgetType` → panel components; each tab is a `DockManagerState` layout built from small helpers; layout persists per tab to localStorage. Trade Ticket and RFQ Workbench are app-level draggable floating overlays (not dockview floating groups — simpler, fully token-styled). A `DemoStateProvider` context shares selected-instrument/clicked-price/RFQ across panels. The data model expands to full FI fields + dealers + curve/scenario/book-risk/indices/research datasets; the ticking reducer stays pure/deterministic.

**Tech Stack:** React 19, Vite 7, TS 5.9, `@wellsfargo-starui/design-system` + `@wellsfargo-starui/ui`, `@widgetstools/react-dock-manager` + `@widgetstools/dock-manager-core` ^1.0.0, `ag-grid-*` 35.1.0, recharts (hoisted), Vitest 4, Playwright 1.59.

## Global Constraints

- **Design-system tokens only** (`--ds-*`; no hardcoded hex). shadcn/recharts primitives only; no native `<input>/<select>/<textarea>`. Works dark + light.
- **AG Grid** via `staruiGridTheme`/`blotterTheme` inheriting `<html data-ag-theme-mode>` (set by `applyTheme`) — do NOT add per-panel `data-ag-theme-mode` wrappers.
- **No `@wellsfargo-starui/*` in package.json**; recharts/react-hook-form/react-resizable-panels stay OUT of app deps (hoisted from `@wellsfargo-starui/ui` at repo root — a separate copy causes duplicate-instance type collisions).
- **Determinism:** data seeds + `applyTick` + `rfqReducer` must not call `Date.now()`/`Math.random()` — inject a seeded rng / pass `now`. Components own wall-clock/timers.
- File/symbol naming camelCase/PascalCase. **Ceilings: 800 LOC/file, 80 LOC/function.**
- Verify: `npx tsc --noEmit -p apps/demos/design-system/tsconfig.json`; `npm --prefix apps run build -w @wellsfargo-starui/design-system-demo`; unit `npx vitest run apps/demos/design-system/src/...`; e2e `npx playwright test e2e/design-system-demo.spec.ts --project=chromium` (boots :5310).
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Branch `feat/design-system-demo-app` (deps already added to package.json + installed; commit them in Task 1).

## Dock-manager API reference (verified against installed v1.0.0)

```ts
import { DockManagerCore, type WidgetProps, type DockManagerCoreHandle } from '@widgetstools/react-dock-manager';
import {
  type DockManagerState, type PanelConfig, type LayoutNode, type TabGroupNode, type SplitNode,
  serialize, deserialize, saveToLocalStorage, loadFromLocalStorage, clearLocalStorage,
  findTabGroupForPanel, collectAllPanelsOrdered, createDefaultState,
} from '@widgetstools/dock-manager-core';

// WidgetProps: { panelId: string; panel: PanelConfig; api: PanelApi }
// PanelConfig: { id; title; widgetType?; closable?; floatable?; dockable?; widgetProps?; ... }
// TabGroupNode: { type:'tabgroup'; id; panels: string[]; activePanel: string }
// SplitNode:    { type:'split'; id; direction: 'horizontal'|'vertical'; children: LayoutNode[]; sizes: number[] } // sizes sum 100
// LayoutNode = TabGroupNode | SplitNode
// Placement (docked): { type:'docked'; groupId: string }
// DockManagerState: { layout: LayoutNode; panels: Map<string,PanelConfig>; placements: Map<string,Placement>; activePaneId: string; nextZIndex: number; maximizedPanelId? }
// <DockManagerCore initialState={state} widgets={WIDGETS} theme={mode} onStateChange={fn} />
```
Floating Trade Ticket / RFQ are **app overlays**, not dock floating groups (see Task 6/7).

---

## Phase 1 — Foundation

### Task 1: Dock foundation — deps, helpers, persistence, registry, one live tab

**Files:**
- Modify: `apps/demos/design-system/package.json` (deps already added — commit), `src/App.tsx`
- Create: `src/lib/dock/helpers.ts`, `src/lib/dock/persistence.ts`, `src/lib/dock/registry.tsx`, `src/lib/dock/layouts.ts`, `src/lib/dock/layouts.test.ts`

**Interfaces:**
- Produces: `p()/tg()/sp()/base()` builders; `WIDGETS` registry + `WidgetId` union; `saveLayout()/loadLayout()/resetLayout()`; `TAB_LAYOUTS: Record<string, () => DockManagerState>`.

- [ ] **Step 1: Commit the deps** — `package.json` already has `@widgetstools/dock-manager-core`/`react-dock-manager` `^1.0.0` and `npm run install:apps` ran. Verify resolution:

Run: `node -e "console.log(require('./apps/node_modules/@widgetstools/react-dock-manager/package.json').version)"`
Expected: `1.0.0`.

- [ ] **Step 2: Create `src/lib/dock/helpers.ts`**

```ts
import {
  type DockManagerState, type LayoutNode, type PanelConfig, type Placement,
  findTabGroupForPanel, collectAllPanelsOrdered,
} from '@widgetstools/dock-manager-core';

export function p(id: string, title: string, widgetType: string, closable = false): PanelConfig {
  return { id, title, widgetType, closable };
}
export function tg(id: string, panels: string[], active?: string): LayoutNode {
  return { type: 'tabgroup', id, panels, activePanel: active ?? panels[0] };
}
export function sp(id: string, direction: 'horizontal' | 'vertical', sizes: number[], children: LayoutNode[]): LayoutNode {
  return { type: 'split', id, direction, children, sizes };
}

/** Assemble a DockManagerState: docked placement for every panel in the layout. */
export function base(layout: LayoutNode, panels: Record<string, PanelConfig>, active: string): DockManagerState {
  const placements = new Map<string, Placement>();
  for (const panelId of collectAllPanelsOrdered(layout)) {
    const groupId = findTabGroupForPanel(layout, panelId);
    if (groupId) placements.set(panelId, { type: 'docked', groupId });
  }
  return { layout, panels: new Map(Object.entries(panels)), placements, activePaneId: active, nextZIndex: 100 };
}
```

- [ ] **Step 3: Create `src/lib/dock/persistence.ts`**

```ts
import { type DockManagerState, serialize, deserialize } from '@widgetstools/dock-manager-core';

const PREFIX = 'ds-dock-';

export function saveLayout(tab: string, state: DockManagerState): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(PREFIX + tab, serialize(state)); } catch { /* ignore quota */ }
}
export function loadLayout(tab: string): DockManagerState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PREFIX + tab);
    if (!raw) return null;
    return deserialize(JSON.parse(raw)).state;
  } catch { return null; }
}
export function resetLayout(tab: string): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.removeItem(PREFIX + tab); } catch { /* ignore */ }
}
```

- [ ] **Step 4: Create `src/lib/dock/registry.tsx`** — the widget registry. For Task 1 it maps to lightweight placeholder widgets so the dock renders; later tasks replace each with the real panel. Define the full `WidgetId` union now so layouts typecheck.

```tsx
import type { WidgetProps } from '@widgetstools/react-dock-manager';
import type { ComponentType } from 'react';

export type WidgetId =
  | 'blotter' | 'priceChart' | 'orderBook' | 'recentPrints'
  | 'ordersBlotter' | 'orderEntry'
  | 'oasDuration' | 'durationBuckets' | 'sectorDonut' | 'historicalOas' | 'oasDistribution' | 'pnlAttribution'
  | 'riskKpi' | 'bookRisk' | 'dv01ByBook' | 'rateScenarios' | 'varTrend' | 'riskLimits'
  | 'researchList' | 'noteDetail'
  | 'designSystem';

function Placeholder({ panel }: WidgetProps) {
  return (
    <div className="flex h-full w-full items-center justify-center text-[12px] text-[color:var(--ds-text-secondary)]">
      {panel.title}
    </div>
  );
}

export const WIDGETS: Record<WidgetId, ComponentType<WidgetProps>> = {
  blotter: Placeholder, priceChart: Placeholder, orderBook: Placeholder, recentPrints: Placeholder,
  ordersBlotter: Placeholder, orderEntry: Placeholder,
  oasDuration: Placeholder, durationBuckets: Placeholder, sectorDonut: Placeholder,
  historicalOas: Placeholder, oasDistribution: Placeholder, pnlAttribution: Placeholder,
  riskKpi: Placeholder, bookRisk: Placeholder, dv01ByBook: Placeholder, rateScenarios: Placeholder,
  varTrend: Placeholder, riskLimits: Placeholder,
  researchList: Placeholder, noteDetail: Placeholder,
  designSystem: Placeholder,
};
```

- [ ] **Step 5: Create `src/lib/dock/layouts.ts`** — one builder per tab. Each returns `base(...)`. Market example (others follow same shape; full set authored here):

```ts
import type { DockManagerState } from '@widgetstools/dock-manager-core';
import { p, tg, sp, base } from './helpers';
import type { WidgetId } from './registry';

const P = (id: WidgetId, title: string) => p(id, title, id);

export const TAB_LAYOUTS: Record<string, () => DockManagerState> = {
  market: () => base(
    sp('mkt', 'vertical', [60, 40], [
      sp('mkt-top', 'horizontal', [62, 38], [tg('g-blotter', ['blotter']), tg('g-chart', ['priceChart'])]),
      sp('mkt-bot', 'horizontal', [68, 32], [tg('g-book', ['orderBook']), tg('g-prints', ['recentPrints'])]),
    ]),
    { blotter: P('blotter', 'Bond Blotter'), priceChart: P('priceChart', 'Price'), orderBook: P('orderBook', 'Order Book'), recentPrints: P('recentPrints', 'Recent Prints') },
    'blotter',
  ),
  orders: () => base(
    sp('ord', 'horizontal', [66, 34], [tg('g-ord', ['ordersBlotter']), tg('g-entry', ['orderEntry'])]),
    { ordersBlotter: P('ordersBlotter', 'Order Blotter'), orderEntry: P('orderEntry', 'New Order') },
    'ordersBlotter',
  ),
  analytics: () => base(
    sp('an', 'vertical', [50, 50], [
      sp('an-top', 'horizontal', [34, 33, 33], [tg('g-oasdur', ['oasDuration']), tg('g-durb', ['durationBuckets']), tg('g-sect', ['sectorDonut'])]),
      sp('an-bot', 'horizontal', [34, 33, 33], [tg('g-hist', ['historicalOas']), tg('g-oasd', ['oasDistribution']), tg('g-pnl', ['pnlAttribution'])]),
    ]),
    { oasDuration: P('oasDuration', 'OAS vs Duration'), durationBuckets: P('durationBuckets', 'Duration Buckets'), sectorDonut: P('sectorDonut', 'Sector Allocation'), historicalOas: P('historicalOas', 'CDX IG/HY'), oasDistribution: P('oasDistribution', 'OAS Distribution'), pnlAttribution: P('pnlAttribution', 'P&L Attribution') },
    'oasDuration',
  ),
  risk: () => base(
    sp('rsk', 'vertical', [14, 86], [
      tg('g-kpi', ['riskKpi']),
      sp('rsk-bot', 'horizontal', [26, 48, 26], [
        tg('g-bookrisk', ['bookRisk']),
        sp('rsk-mid', 'vertical', [55, 45], [sp('rsk-mid-top', 'horizontal', [50, 50], [tg('g-dv01', ['dv01ByBook']), tg('g-scen', ['rateScenarios'])]), tg('g-var', ['varTrend'])]),
        tg('g-limits', ['riskLimits']),
      ]),
    ]),
    { riskKpi: P('riskKpi', 'Risk KPIs'), bookRisk: P('bookRisk', 'Book Risk'), dv01ByBook: P('dv01ByBook', 'DV01 by Book'), rateScenarios: P('rateScenarios', 'Rate Scenarios'), varTrend: P('varTrend', 'VaR Trend'), riskLimits: P('riskLimits', 'Risk Limits') },
    'riskKpi',
  ),
  research: () => base(
    sp('res', 'horizontal', [32, 68], [tg('g-list', ['researchList']), tg('g-note', ['noteDetail'])]),
    { researchList: P('researchList', 'Research Notes'), noteDetail: P('noteDetail', 'Note Detail') },
    'researchList',
  ),
  'design-system': () => base(tg('g-ds', ['designSystem']), { designSystem: P('designSystem', 'Design System') }, 'designSystem'),
};
```

- [ ] **Step 6: Write `src/lib/dock/layouts.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { collectAllPanelsOrdered } from '@widgetstools/dock-manager-core';
import { TAB_LAYOUTS } from './layouts';
import { WIDGETS } from './registry';

describe('dock layouts', () => {
  it('every layout references only registered widget ids and has placements for all panels', () => {
    const known = new Set(Object.keys(WIDGETS));
    for (const [tab, build] of Object.entries(TAB_LAYOUTS)) {
      const state = build();
      const ids = collectAllPanelsOrdered(state.layout);
      expect(ids.length, `${tab} has panels`).toBeGreaterThan(0);
      for (const id of ids) {
        expect(state.panels.has(id), `${tab}:${id} in panels`).toBe(true);
        expect(state.placements.has(id), `${tab}:${id} placed`).toBe(true);
        expect(known.has(state.panels.get(id)!.widgetType!), `${tab}:${id} widgetType registered`).toBe(true);
      }
    }
  });

  it('split sizes sum to 100', () => {
    const walk = (n: { type: string; sizes?: number[]; children?: unknown[] }) => {
      if (n.type === 'split') {
        expect(n.sizes!.reduce((a, b) => a + b, 0)).toBe(100);
        (n.children as typeof n[]).forEach(walk);
      }
    };
    for (const build of Object.values(TAB_LAYOUTS)) walk(build().layout as never);
  });
});
```

- [ ] **Step 7: Rewrite `src/App.tsx` as the dock host** — keep `TopBar` + the 6-tab `Tabs` strip, but each `TabsContent` renders a `<DockManagerCore key={tab} initialState={loadLayout(tab) ?? TAB_LAYOUTS[tab]()} widgets={WIDGETS} theme={mode} onStateChange={(s) => (layoutRef.current[tab] = s)} />`. Track `mode` via `useThemeMode()`. Keep `useTickingStore` for later wiring. (Save/Reset TopBar buttons added in Task 6.) **Add `@import '@widgetstools/react-dock-manager/styles.css';` at the top of `src/globals.css`** — the package ships this stylesheet (export subpath `./styles.css`) and the dock won't render without it. Pass `theme={mode}` (`'light'|'dark'`).

- [ ] **Step 8: Run tests + build**

Run: `npx vitest run apps/demos/design-system/src/lib/dock/layouts.test.ts` → PASS.
Run: `npx tsc --noEmit -p apps/demos/design-system/tsconfig.json` → clean.
Run: `npm --prefix apps run build -w @wellsfargo-starui/design-system-demo` → builds.

- [ ] **Step 9: Commit**

```bash
git add apps/demos/design-system/package.json apps/demos/design-system/src/lib/dock apps/demos/design-system/src/App.tsx apps/demos/design-system/src/globals.css
git commit -m "feat(design-system-demo): dock-manager foundation (helpers, registry, per-tab layouts)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

> NOTE if the dock CSS or DockManagerCore fails to render under the consumer Vite build (e.g. a missing stylesheet, SSR guard, or ESM interop issue), STOP and report BLOCKED with the exact error — this gates every later task.

---

### Task 2: DemoStateProvider + expanded FI data model

**Files:**
- Create: `src/state/DemoStateProvider.tsx`
- Modify: `src/data/types.ts`, `src/data/seeds.ts`, `src/data/applyTick.ts`, `src/data/applyTick.test.ts`

**Interfaces:**
- Produces: `DemoStateProvider`, `useDemoState()` → `{ store, selectedId, setSelectedId, clickedPrice, setClickedPrice }` (store from `useTickingStore`); expanded `Instrument` (`ytw`, `gSpd`, `cvx`, `seniority`, `axes`, `ratingClass`); `DEALERS`, `CURVE_SERIES`, `RATE_SCENARIOS`, `BOOK_RISK`, `MARKET_INDICES`, `RESEARCH_NOTES`.

- [ ] **Step 1: Extend `data/types.ts`** — add to `Instrument`: `ytw: number; gSpd: number; cvx: number; seniority: string; axes: string; ratingClass: 'aaa'|'aa'|'a'|'bbb'|'hy'`. Add exported interfaces `Dealer`, `BookRisk { book; mv; dv01; oas; pnl }`, `ResearchNote { id; date; author; ticker; title; rating: 'Overweight'|'Underweight'|'Market Weight'; oasTarget: number|null; oasCurrent: number; sector: string; summary: string; risks: string[] }`, `RateScenario { label; pnl }`, `CurvePoint { tenor: number; today: number; week: number; month: number }`, `MarketIndex { name; last; chg; ytd }`.

- [ ] **Step 2: Extend `data/seeds.ts`** — add `ratingClass`/`ytw`/`gSpd`/`cvx`/`seniority`/`axes` to the 16 seed instruments (deterministic, derived from existing fields where possible). Export `DEALERS = ['GS','MS','JPM','BAML','CITI','DB','BARC','UBS']`, `CURVE_SERIES` (8 tenors with today/week/month from the existing curve + small offsets), `RATE_SCENARIOS` (7: -100…+100bp with plausible pnl), `BOOK_RISK` (5 books), `MARKET_INDICES` (8), `RESEARCH_NOTES` (5, with oasTarget/oasCurrent/summary/risks). All deterministic (reuse `makeRng`).

- [ ] **Step 3: Extend `applyTick`** — nudge `quote.ytm` and `quote.oas` slightly each tick (bounded, rng-driven) alongside mid; keep history cap + immutability. Add a test asserting ytm stays within a plausible band (e.g. 0.2–12) and oas ≥ 0 after many ticks. Run RED→GREEN.

- [ ] **Step 4: Create `src/state/DemoStateProvider.tsx`** — a context wrapping `useTickingStore()` plus `selectedId` (default first instrument), `clickedPrice`. `useDemoState()` throws if used outside provider.

- [ ] **Step 5: Tests + typecheck**

Run: `npx vitest run apps/demos/design-system/src/data/applyTick.test.ts` → PASS.
Run: `npx tsc --noEmit -p apps/demos/design-system/tsconfig.json` → clean.

- [ ] **Step 6: Commit** — `feat(design-system-demo): expand FI data model + DemoStateProvider` (+ trailer).

---

## Phase 2 — Market trading

### Task 3: Dealer-depth Order Book + Recent Prints

**Files:** Create `src/panels/OrderBook.tsx`, `src/panels/RecentPrints.tsx`, `src/data/depth.ts`, `src/data/depth.test.ts`. Modify `src/lib/dock/registry.tsx`.

**Interfaces:** Consumes `useDemoState`, expanded `Instrument`/`Quote`, `DEALERS`. Produces `buildDepth(quote, instrument, rng)` → `{ asks: Level[]; bids: Level[]; midRow }` (pure); `OrderBook`/`RecentPrints` widgets.

- [ ] **Step 1 (TDD):** `data/depth.ts` — pure `buildDepth` synthesizing ~12 ask + 12 bid `Level { dealer; price; yield; faceMM; dv01; type: 'STREAM'|'IND'|'RFQ'; cumPct }` deterministically around `quote.bid/ask` with a dealer rotation; compute mid/spread/zSpread. Test: ids/order stable, asks descend to mid, bids descend from mid, cumPct ∈ [0,100]. RED→GREEN.
- [ ] **Step 2:** `OrderBook.tsx` — instrument **context header** (ticker·coupon·maturity·issuer·CUSIP·rating·OAS·DUR + "● LIVE"); OFFERS(ASK) section (red) over BIDS (green), columns Dealer·Price·Yield·Face·DV01·Type (`Badge`), cumulative fill bars via token `--ds-trade-ask-fill`/`bid-fill`; center Mid/Spread/Mid-Yield/Z-Spread row; footer Bid/Ask DV01·Min·Firm·Settle T+1. Clicking a level calls `setClickedPrice`. `data-testid="order-book"`. Reads `useDemoState` for the selected instrument; re-derives depth each render (cheap) or on quote change.
- [ ] **Step 3:** `RecentPrints.tsx` — last ~15 prints (side·cpty·price·yield·face·time) from a local ring updated on an interval; tokens only.
- [ ] **Step 4:** register both in `WIDGETS` (replace placeholders).
- [ ] **Step 5:** typecheck + build + unit. Commit — `feat(design-system-demo): dealer-depth order book + recent prints` (+ trailer).

### Task 4: FI Trade Ticket (floating overlay)

**Files:** Create `src/panels/TradeTicket.tsx`, `src/components/FloatingWindow.tsx`. 

**Interfaces:** `FloatingWindow({ title, onClose, initial, children })` — an absolutely-positioned, header-draggable, token-styled window (no dock dependency). `TradeTicket({ instrument, quote, onClose })`.

- [ ] **Step 1:** `FloatingWindow.tsx` — fixed-position card; drag by header (pointer events, clamp to viewport); close button; `data-testid` passthrough; tokens only; under 80 LOC.
- [ ] **Step 2:** `TradeTicket.tsx` per spec §B — security header; clickable Bid/Ask strip; Buy/Sell `ToggleGroup`; order-type tabs Limit/Market/Stop-Limit (Stop conditional, price hidden for Market); Notional MM `Input` + 25/50/75/100% `Button`s; TIF GTC/IOC/FOK/DAY `ToggleGroup`; Est. Total; order-summary box; CTA → toast (`useToast` + a single app-level `<Toaster/>` added in App in Task 6). Shows yield next to price. `data-testid="trade-ticket"`.
- [ ] **Step 3:** typecheck + build. Commit — `feat(design-system-demo): FI trade ticket + floating window` (+ trailer).

### Task 5: RFQ Workbench + state machine

**Files:** Create `src/data/rfq.ts`, `src/data/rfq.test.ts`, `src/panels/RfqWorkbench.tsx`.

**Interfaces:** Pure `rfqReducer(state, action, rng)` with actions `send`/`tick`/`hit`/`lift`/`cancel`/`clear`; `RfqRequest { id; instrumentId; side; sizeMM; status:'pending'|'quoted'|'done'|'cancelled'; quotes: RfqQuote[]; ticks: number; exec? }`. `RfqWorkbench` component.

- [ ] **Step 1 (TDD):** `data/rfq.ts` — reducer: `send` creates a pending request; `tick` (with rng) streams dealer quotes (pending→quoted once ≥1 quote) and auto-cancels at a tick threshold (≈30s of ticks); `hit`/`lift` set `done` + `exec`; `clear` drops done/cancelled. No wall-clock. Test transitions + immutability + expiry. RED→GREEN.
- [ ] **Step 2:** `RfqWorkbench.tsx` per spec §B — left New-RFQ form (searchable instrument via `Command`, Buy/Sell, size 2/5/10/15 `Button`s, dealer multi-select `ToggleGroup`/checkboxes, Send) + history list with SVG **countdown rings** (driven by `ticks`) + status `Badge`s; right quote ladder (best banner; `Table` Dealer·Bid·BidSize·Ask·AskSize·Spread¢·Status·Action with ▲BEST/▼BEST + HIT/LIFT `Button`s; exec → green confirm). A `useEffect` interval dispatches `tick`. `data-testid="rfq-workbench"`. Tokens only; split helper sub-components to stay under 80 LOC each.
- [ ] **Step 3:** unit + typecheck + build. Commit — `feat(design-system-demo): RFQ workbench + state machine` (+ trailer).

### Task 6: Market dock wiring + floating ticket/RFQ + Save/Reset

**Files:** Modify `src/App.tsx`, `src/lib/dock/registry.tsx`. Create `src/panels/MarketWidgets.tsx` (thin widget adapters binding `useDemoState` to BondBlotter/PriceChart/OrderBook/RecentPrints).

- [ ] **Step 1:** Wrap the app in `DemoStateProvider`; add a single `<Toaster/>`. Register real widgets for `blotter`/`priceChart`/`orderBook`/`recentPrints` (adapters reading `useDemoState`; blotter row-click → `setSelectedId`). BondBlotter/PriceChart already exist — adapt them to read the selected instrument.
- [ ] **Step 2:** TopBar: add `+ New Order`, `RFQ`, `Save`, `Reset` buttons (icons + tokens). New Order / RFQ toggle app-level state that renders `<FloatingWindow><TradeTicket/></FloatingWindow>` / `<RfqWorkbench/>` over the dock. Save calls `saveLayout(activeTab, layoutRef.current[activeTab])`; Reset calls `resetLayout(activeTab)` + bumps a `key` to remount the dock with the default layout.
- [ ] **Step 3:** typecheck + build + e2e (Market boots, order book visible, New Order floats the ticket). Commit — `feat(design-system-demo): wire Market dock + floating ticket/RFQ + save/reset` (+ trailer).

---

## Phase 3 — Analytics / Risk / Research

> Shared pattern for all chart panels: a small widget component reading `useDemoState`, rendering a recharts chart via `@wellsfargo-starui/ui/chart` (`ChartContainer`/`ChartTooltip`/`ChartTooltipContent`, `type ChartConfig` from `@wellsfargo-starui/ui/chart`) with colors from `--ds-chart-1..5` + accent tokens. Each panel `data-testid="panel-<id>"`, tokens only, under 80 LOC (extract config/data helpers if needed). Register each in `WIDGETS` replacing its placeholder.

### Task 7: Analytics — 6 chart panels

**Files:** Create `src/panels/analytics/{OasDurationScatter,DurationBuckets,SectorDonut,HistoricalOas,OasDistribution,PnlAttribution}.tsx`. Modify `registry.tsx`.

- [ ] **Step 1:** `OasDurationScatter` (recharts `ScatterChart`, bubble `ZAxis` by dv01, color by `ratingClass`, rating legend).
- [ ] **Step 2:** `DurationBuckets` (`BarChart` dual `YAxis`: bond count + DV01 by bucket) + footer (Total DV01/Avg Dur/Bonds/Wt-Avg-OAS).
- [ ] **Step 3:** `SectorDonut` (`PieChart` donut, 6 sectors, legend).
- [ ] **Step 4:** `HistoricalOas` (`AreaChart` dual-axis IG/HY with gradient fills; derive a 60-pt series deterministically).
- [ ] **Step 5:** `OasDistribution` (horizontal `BarChart`, per-issuer OAS, ramp colors).
- [ ] **Step 6:** `PnlAttribution` (waterfall-style `BarChart`: Carry/Spread/Rates/FX/Costs/Total, pos/neg colored) + Net P&L MTD footer.
- [ ] **Step 7:** register all six; typecheck + build. Commit — `feat(design-system-demo): Analytics chart panels` (+ trailer).

### Task 8: Risk — KPI strip + dashboard

**Files:** Create `src/panels/risk/{RiskKpiStrip,BookRisk,Dv01ByBook,RateScenarios,VarTrend,RiskLimits}.tsx`. Modify `registry.tsx`.

- [ ] **Step 1:** `RiskKpiStrip` (6 KPI `Card`s computed from `BOOK_RISK`/positions: Portfolio DV01, Total MV, VaR 95% 1D, OAS Duration, Spread PnL MTD, Credit Delta).
- [ ] **Step 2:** `BookRisk` (`Table` of the 5 books MV/DV01/OAS/P&L) + an OAS heatmap grid (token alpha by level).
- [ ] **Step 3:** `Dv01ByBook` (`BarChart`), `RateScenarios` (`BarChart`, pos/neg colored from `RATE_SCENARIOS`), `VarTrend` (`LineChart`, 30 deterministic points).
- [ ] **Step 4:** `RiskLimits` (5 `Progress` gauges colored green/amber/red by utilization).
- [ ] **Step 5:** register all; typecheck + build. Commit — `feat(design-system-demo): Risk dashboard panels` (+ trailer).

### Task 9: Research — list + rich detail

**Files:** Create `src/panels/research/{ResearchList,NoteDetail}.tsx` + a small `ResearchContext` (selected note id) or reuse `useDemoState` with a local `useState` lifted to a tiny provider in `registry.tsx`. Modify `registry.tsx`.

- [ ] **Step 1:** `ResearchList` — sector-filter chips (`ToggleGroup`/`Button`s) + note cards (ticker·date·rating `Badge`·title·author/sector); selected highlight; sets selected note id.
- [ ] **Step 2:** `NoteDetail` — ticker+rating, meta grid (author/sector/published), **OAS Target (12M)** vs **Current OAS** `Card`s, summary, **Key Risks** box. Rating→token color map (Overweight→positive, Underweight→negative, Market Weight→warning overlays).
- [ ] **Step 3:** a minimal research-selection context shared by both widgets (since dock widgets are siblings). register; typecheck + build. Commit — `feat(design-system-demo): Research list + detail` (+ trailer).

### Task 10: Orders dock + Design System panel + cleanup

**Files:** Modify `registry.tsx` (real `ordersBlotter`/`orderEntry`/`designSystem` widgets adapting existing `OrdersBlotter`/`OrderEntryForm`/`DesignSystemTab`). Delete obsolete `src/tabs/{MarketTab,OrdersTab,AnalyticsTab,RiskTab,ResearchTab}.tsx` and `src/panels/{Watchlist,OrderBook(old),TradeTicket(old),RfqSimulator,YieldCurveChart,AnalyticsCards,RiskPanels,ResearchPanels}.tsx` superseded by the new panels/dock.

- [ ] **Step 1:** Adapter widgets for `ordersBlotter` (existing `OrdersBlotter`), `orderEntry` (existing `OrderEntryForm`), `designSystem` (existing `DesignSystemTab`, full-area).
- [ ] **Step 2:** Delete superseded tab/panel files; `grep -rn` to confirm no dangling imports.

Run: `grep -rn "tabs/MarketTab\|tabs/OrdersTab\|tabs/AnalyticsTab\|tabs/RiskTab\|tabs/ResearchTab\|RfqSimulator\|YieldCurveChart\|AnalyticsCards\|panels/RiskPanels\|ResearchPanels\|Watchlist" apps/demos/design-system/src || echo "no dangling refs"`
Expected: `no dangling refs`.

- [ ] **Step 3:** typecheck + build. Commit — `feat(design-system-demo): Orders + Design System dock widgets; remove superseded tabs/panels` (+ trailer).

---

## Phase 4 — Verify

### Task 11: e2e smoke, docs, full verification

**Files:** Modify `e2e/design-system-demo.spec.ts`, `docs/current-features.md`.

- [ ] **Step 1:** Extend the smoke spec: Market boots and `order-book` is visible; clicking `+ New Order` (`getByTestId('topbar-new-order')`) shows `trade-ticket`; clicking `RFQ` shows `rfq-workbench`; navigate to Analytics and a `panel-oasDuration` chart is visible; Design System gallery still renders; theme toggle still flips `data-theme`. (Keep selectors robust; adjust to real testids.)
- [ ] **Step 2:** Run e2e: `npx playwright test e2e/design-system-demo.spec.ts --project=chromium` → all pass. Fix selectors/timing (not assertions) until green.
- [ ] **Step 3:** Update `docs/current-features.md` — revise the `design-system` sub-section: dock-manager layout, FI trade ticket, dealer-depth order book, RFQ workbench, chart-heavy Analytics/Risk/Research.
- [ ] **Step 4:** Full verification: `npx vitest run apps/demos/design-system/src/` (all pass), `npx tsc --noEmit -p apps/demos/design-system/tsconfig.json`, `npm --prefix apps run build -w @wellsfargo-starui/design-system-demo`.
- [ ] **Step 5:** Commit — `test(design-system-demo): FI/dock smoke; docs: trading enrichment` (+ trailer).

---

## Self-Review

**Spec coverage:** dock shell + data model → Tasks 1–2; trade ticket + dealer depth + RFQ (spec §B) → Tasks 3–6; Analytics/Risk/Research charts (spec §C) → Tasks 7–9; Orders/Design-System + cleanup → Task 10; testing/docs → Task 11. Floating ticket/RFQ as app overlays (spec §A) → Tasks 4/6. Determinism, tokens, AG-Grid `<html>` inheritance, hoisted-dep rule → Global Constraints, applied per task. ✓

**Placeholder scan:** Foundation tasks carry complete code (helpers/persistence/registry/layouts/tests). The numerous chart/risk panels are specified as a precise shared pattern (recharts via `@wellsfargo-starui/ui/chart`, token colors, per-panel testids, data sources named) + the exact chart type per panel — gated by typecheck/build and the e2e, rather than 20 inline chart bodies. The dock API is verified against the installed package (reference block), not guessed. This delegation is deliberate and flagged.

**Type consistency:** `WidgetId` union (Task 1) is the single source for registry keys + layout widget types + the completeness test. `DockManagerState`/`PanelConfig`/`LayoutNode` come from the package. `buildDepth`/`rfqReducer`/`applyTick` signatures match their tests. `useDemoState()` shape (Task 2) consumed by all panels. Floating overlays use `FloatingWindow` (Task 4) consistently.

**Risk notes:** (1) The dock CSS/SSR/ESM-interop under the consumer Vite build is the top risk — Task 1 Step 9 gates it explicitly (STOP/BLOCKED if it won't render). (2) Confirm whether `@widgetstools/react-dock-manager` ships a required stylesheet and import it. (3) `deserialize(...).state` shape — verify the return field name against the installed `.d.ts` (loadLayout). (4) Keep recharts/rhf/resizable OUT of app deps (hoisted) to avoid the duplicate-instance collision fixed in v1.
