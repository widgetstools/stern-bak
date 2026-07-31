# Design System Demo App — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `apps/demos/design-system` — a fixed-income trading terminal plus a live component/token reference, both styled entirely by `@wellsfargo-starui/design-system` + `@wellsfargo-starui/ui`, proving the design system dresses a real client app.

**Architecture:** A Vite/React consumer app (resolves `@wellsfargo-starui/*` from source via the shared consumer Vite config). A self-contained ticking mock-data layer feeds five trading tabs (Market/Orders/Analytics/Risk/Research); a sixth "Design System" tab documents palette/typography/foundations and a data-driven gallery of all public `@wellsfargo-starui/ui` components. AG Grid is themed with the prebuilt `staruiGridTheme`; charts use recharts via `@wellsfargo-starui/ui`'s chart primitive and the design-system color ramp.

**Tech Stack:** React 19.2.x, Vite 7, TypeScript 5.9, Tailwind 3.4 (starui preset), `@wellsfargo-starui/design-system`, `@wellsfargo-starui/ui` (shadcn), `ag-grid-*` 35.1.0, recharts ^3.6.0, react-hook-form ^7.72.1, react-resizable-panels ^4.9.0, lucide-react, Vitest 4, Playwright 1.59.

## Global Constraints

- **Consume our packages, copy nothing from fi-trading-terminal.** `@wellsfargo-starui/design-system` + `@wellsfargo-starui/ui` only; fi is inspiration. No `@wellsfargo-starui/*` entries in `package.json` (resolved by `scripts/staruiConsumerVite.mjs` aliases).
- **Design-system tokens only.** All styling via `--ds-*` CSS variables or `@wellsfargo-starui/ui` components; **no hardcoded hex**. Every surface renders under `[data-theme="dark"]` AND `[data-theme="light"]`.
- **shadcn/recharts primitives only** — no native `<input>/<select>/<textarea>`; charts via `@wellsfargo-starui/ui` chart + recharts.
- **AG Grid theming** via `staruiGridTheme` from `@wellsfargo-starui/design-system/adapters/ag-grid` (Theming API; set `data-ag-theme-mode` to match the active theme). No legacy ag-grid CSS imports.
- **File/symbol naming:** camelCase/PascalCase only (React bucket). Component files `PascalCase.tsx`, hooks `useX.ts`, plain modules `camelCase.ts`, types in `types.ts`.
- **Complexity ceilings:** 800 LOC/file, 80 LOC/function.
- **Workspace name** `@wellsfargo-starui/design-system-demo` (folder `apps/demos/design-system`); **dev port 5310**.
- **Lab unit tests** run from repo root: `npx vitest run apps/demos/design-system/src/...`. **Typecheck:** `npx tsc --noEmit -p apps/demos/design-system/tsconfig.json`. **Build:** `npm --prefix apps run build -w @wellsfargo-starui/design-system-demo` (after the app is in `apps/package.json`).
- **Commit trailer** on every commit: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

All work happens on branch `feat/design-system-demo-app` (already created; spec committed at `2e414805`).

---

## File Structure

```
apps/demos/design-system/
  index.html · vite.config.ts · tsconfig.json · tailwind.config.js · postcss.config.js · package.json
  src/
    main.tsx · App.tsx · globals.css · vite-env.d.ts
    components/  TopBar.tsx  ThemeToggle.tsx  CodeBlock.tsx
    lib/         agGridTheme.ts  useThemeMode.ts
    data/        types.ts  seeds.ts  formatters.ts  applyTick.ts  applyTick.test.ts  useTickingStore.ts
    tabs/        MarketTab.tsx  OrdersTab.tsx  AnalyticsTab.tsx  RiskTab.tsx  ResearchTab.tsx  DesignSystemTab.tsx
    panels/      BondBlotter.tsx  Watchlist.tsx  OrderBook.tsx  PriceChart.tsx  TradeTicket.tsx
                 OrdersBlotter.tsx  OrderEntryForm.tsx  RfqSimulator.tsx
                 YieldCurveChart.tsx  AnalyticsCards.tsx  RiskPanels.tsx  ResearchPanels.tsx
    showcase/    types.ts  ComponentDemo.tsx  registry.ts  registry.test.ts  palette.ts
                 sections/  OverviewSection.tsx  PaletteSection.tsx  TypographySection.tsx  FoundationsSection.tsx
                 components/ buttons.tsx inputs.tsx selection.tsx overlays.tsx navigation.tsx dataDisplay.tsx feedback.tsx layout.tsx charts.tsx
e2e/design-system-demo.spec.ts
```

Registration touch-points (Task 1): `apps/package.json` workspaces (add `demos/design-system`); `playwright.config.ts` webServer (add :5310). Root `package.json` is NOT edited (apps are a nested workspace). `scripts/build-app-track.mjs` auto-discovers.

---

### Task 1: Scaffold the app and register it

**Files:**
- Create: `apps/demos/design-system/package.json`, `vite.config.ts`, `tsconfig.json`, `tailwind.config.js`, `postcss.config.js`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/globals.css`, `src/vite-env.d.ts`
- Modify: `apps/package.json` (workspaces), `playwright.config.ts` (webServer)

**Interfaces:**
- Produces: a runnable app at port 5310 exporting `App` from `src/App.tsx`.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "@wellsfargo-starui/design-system-demo",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "ag-grid-community": "35.1.0",
    "ag-grid-enterprise": "35.1.0",
    "ag-grid-react": "35.1.0",
    "lucide-react": "^0.554.0",
    "react": "~19.2.5",
    "react-dom": "~19.2.5",
    "react-hook-form": "^7.72.1",
    "react-resizable-panels": "^4.9.0",
    "recharts": "^3.6.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "~4.5.2",
    "autoprefixer": "^10.4.27",
    "postcss": "^8.5.9",
    "tailwindcss": "3.4.1",
    "tailwindcss-animate": "^1.0.7",
    "typescript": "~5.9.3",
    "vite": "~7.3.2"
  }
}
```

- [ ] **Step 2: Create `vite.config.ts`**

```ts
import { defineConfig, mergeConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { staruiConsumerViteConfig, appDirFromConfig } from '../../../scripts/staruiConsumerVite.mjs';

export default defineConfig(
  mergeConfig(staruiConsumerViteConfig(appDirFromConfig(import.meta.url)), {
    plugins: [react()],
    server: { port: 5310, open: true },
  }),
);
```

- [ ] **Step 3: Create `tsconfig.json`** (identical pattern to `apps/demos/markets-grid-lab/tsconfig.json`)

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "resolveJsonModule": true,
    "paths": {
      "react": ["../../../node_modules/@types/react"],
      "react/*": ["../../../node_modules/@types/react/*"],
      "react-dom": ["../../../node_modules/@types/react-dom"],
      "react-dom/*": ["../../../node_modules/@types/react-dom/*"]
    }
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 4: Create `tailwind.config.js` and `postcss.config.js`** (copy from markets-grid-lab verbatim)

`tailwind.config.js`:
```js
/** @type {import('tailwindcss').Config} */
import { tailwindPreset } from '../../../scripts/staruiTailwindPreset.cjs';
import { demoAppTailwindContent } from '../../../scripts/tailwindContentGlobs.mjs';

export default {
  presets: [tailwindPreset],
  content: ['./index.html', './src/**/*.{ts,tsx}', ...demoAppTailwindContent],
};
```

`postcss.config.js`:
```js
export default {
  plugins: { 'tailwindcss/nesting': {}, tailwindcss: {}, autoprefixer: {} },
};
```

- [ ] **Step 5: Create `index.html`** (fonts match markets-grid-lab)

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>StarUI Design System — FI Terminal</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@300;400;500;600;700&family=JetBrains+Mono:wght@300;400;500;600&display=swap"
      rel="stylesheet"
    />
  </head>
  <body class="overflow-hidden">
    <div id="root"></div>
    <script type="module" src="./src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Create `src/vite-env.d.ts`**

```ts
/// <reference types="vite/client" />
```

- [ ] **Step 7: Create `src/globals.css`**

```css
@import '@wellsfargo-starui/design-system/css';

@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  *, *::before, *::after { box-sizing: border-box; }
  * { @apply border-border; }
  html, body, #root { height: 100%; width: 100%; margin: 0; padding: 0; }
  html { overflow: hidden; }
  body {
    overflow: hidden;
    background: var(--ds-surface-ground);
    color: var(--ds-text-primary);
    font-family: var(--ds-font-sans), -apple-system, sans-serif;
    font-size: var(--ds-font-size-body);
    -webkit-font-smoothing: antialiased;
  }
}
```

- [ ] **Step 8: Create `src/main.tsx`**

```tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { applyTheme, getTheme } from '@wellsfargo-starui/design-system';
import { App } from './App';
import './globals.css';

applyTheme(getTheme());

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Step 9: Create a minimal `src/App.tsx`** (replaced in Task 6; just proves boot)

```tsx
export function App() {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-[color:var(--ds-surface-ground)] text-[color:var(--ds-text-primary)]">
      <span className="text-[15px] font-semibold">StarUI Design System Demo — scaffolding…</span>
    </div>
  );
}
```

- [ ] **Step 10: Register the workspace** — edit `apps/package.json`, add `"demos/design-system"` to the `workspaces` array (keep alphabetical: after `"demos/demo-stomp-markets-grid"`).

- [ ] **Step 11: Add the Playwright webServer** — in `playwright.config.ts`, add an entry to the `webServer` array:

```ts
    {
      command: 'npm --prefix apps run dev -w @wellsfargo-starui/design-system-demo -- --no-open --force',
      port: 5310,
      reuseExistingServer: true,
      timeout: 120_000,
    },
```

- [ ] **Step 12: Install and verify build**

Run: `npm run install:apps`
Run: `npm --prefix apps run build -w @wellsfargo-starui/design-system-demo`
Expected: install succeeds; Vite build completes (the placeholder App bundles). If the design-system CSS/assets are missing, the consumer Vite plugin auto-runs `build:packages` — allow it.

- [ ] **Step 13: Commit**

```bash
git add apps/demos/design-system apps/package.json playwright.config.ts
git commit -m "feat(design-system-demo): scaffold app + register workspace (port 5310)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Data types, seeds, formatters

**Files:**
- Create: `src/data/types.ts`, `src/data/seeds.ts`, `src/data/formatters.ts`

**Interfaces:**
- Produces: `Instrument`, `Quote`, `Order`, `Position`, `OrderSide`, `OrderStatus`, `TerminalState` (types); `seedState(): TerminalState`, `SEED_INSTRUMENTS: Instrument[]`; `fmtPrice`, `fmtYield`, `fmtBps`, `fmtQty`, `fmtSignedPct`, `fmtMoney` (formatters).

- [ ] **Step 1: Create `src/data/types.ts`**

```ts
export type OrderSide = 'buy' | 'sell';
export type OrderStatus = 'working' | 'filled' | 'cancelled';
export type Direction = 'up' | 'down' | 'flat';

export interface Instrument {
  id: string;          // stable row id
  cusip: string;
  ticker: string;
  description: string;
  coupon: number;      // %
  maturity: string;    // ISO date
  rating: string;      // e.g. 'AA', 'BBB+'
  sector: string;
  currency: string;    // 'USD'
}

export interface Quote {
  id: string;          // === Instrument.id
  bid: number;
  mid: number;
  ask: number;
  last: number;
  ytm: number;         // yield to maturity, %
  oas: number;         // bps
  dv01: number;
  changePct: number;   // session % change
  dir: Direction;      // last tick direction (drives flash)
}

export interface Order {
  id: string;
  instrumentId: string;
  ticker: string;
  side: OrderSide;
  qty: number;
  price: number;
  status: OrderStatus;
  ts: number;          // epoch ms (passed in, never Date.now() in reducers)
}

export interface Position {
  instrumentId: string;
  ticker: string;
  qty: number;
  avgCost: number;
  marketValue: number;
  unrealizedPnl: number;
  dv01: number;
}

export interface TerminalState {
  instruments: Instrument[];
  quotes: Record<string, Quote>;   // keyed by id
  orders: Order[];
  positions: Position[];
  /** Yield-curve points {tenorYears, yield%} for the Analytics chart. */
  curve: { tenor: number; yield: number }[];
  /** Rolling price history per instrument id (last N mids) for PriceChart. */
  history: Record<string, number[]>;
}
```

- [ ] **Step 2: Create `src/data/seeds.ts`**

Author a deterministic seed (no `Math.random()` at module scope; use a small seeded PRNG so tests are stable). Provide ~16 instruments across sectors/ratings, an initial `Quote` per instrument, ~8 orders (mixed statuses), positions for ~8, a 8-point yield curve (tenors 1,2,3,5,7,10,20,30), and `history` seeded with 40 points per instrument around `mid`. Export:

```ts
import type { Instrument, TerminalState } from './types';

export const SEED_INSTRUMENTS: Instrument[] = [ /* ~16 entries, realistic FI fields */ ];

/** Deterministic initial state. `now` is passed in (epoch ms) — never call Date.now() here. */
export function seedState(now: number): TerminalState { /* build quotes/orders/positions/curve/history */ }
```

Use a seeded PRNG helper local to this file:
```ts
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 0xffffffff);
}
```

- [ ] **Step 3: Create `src/data/formatters.ts`**

```ts
export const fmtPrice = (n: number) => n.toFixed(3);
export const fmtYield = (n: number) => `${n.toFixed(3)}%`;
export const fmtBps = (n: number) => `${Math.round(n)} bp`;
export const fmtQty = (n: number) => n.toLocaleString('en-US');
export const fmtSignedPct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
export const fmtMoney = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p apps/demos/design-system/tsconfig.json`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add apps/demos/design-system/src/data/types.ts apps/demos/design-system/src/data/seeds.ts apps/demos/design-system/src/data/formatters.ts
git commit -m "feat(design-system-demo): FI data types, deterministic seeds, formatters

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `applyTick` reducer (TDD)

**Files:**
- Create: `src/data/applyTick.ts`, `src/data/applyTick.test.ts`

**Interfaces:**
- Consumes: `TerminalState`, `Quote`, `Direction` (Task 2 types).
- Produces: `applyTick(state: TerminalState, rng: () => number): TerminalState` — returns a new state with nudged quotes (bounded), updated `dir` per quote, appended price history (capped length), and recomputed position `marketValue`/`unrealizedPnl`. Pure: no `Date.now`/`Math.random` inside (rng injected).

- [ ] **Step 1: Write the failing test** (`src/data/applyTick.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import { applyTick } from './applyTick';
import { seedState } from './seeds';

const rngUp = () => 0.9;    // deterministic high → upward nudge
const rngDown = () => 0.1;  // deterministic low → downward nudge

describe('applyTick', () => {
  it('returns a new state object (immutability)', () => {
    const s0 = seedState(0);
    const s1 = applyTick(s0, rngUp);
    expect(s1).not.toBe(s0);
    expect(s1.quotes).not.toBe(s0.quotes);
  });

  it('nudges mids and sets a direction flag', () => {
    const s0 = seedState(0);
    const id = s0.instruments[0].id;
    const s1 = applyTick(s0, rngUp);
    expect(s1.quotes[id].mid).not.toBe(s0.quotes[id].mid);
    expect(['up', 'down', 'flat']).toContain(s1.quotes[id].dir);
  });

  it('keeps row ids stable and bid <= mid <= ask', () => {
    const s0 = seedState(0);
    const s1 = applyTick(s0, rngDown);
    expect(Object.keys(s1.quotes).sort()).toEqual(Object.keys(s0.quotes).sort());
    for (const q of Object.values(s1.quotes)) {
      expect(q.bid).toBeLessThanOrEqual(q.mid + 1e-9);
      expect(q.mid).toBeLessThanOrEqual(q.ask + 1e-9);
    }
  });

  it('caps price history length', () => {
    const id = seedState(0).instruments[0].id;
    let s = seedState(0);
    for (let i = 0; i < 100; i++) s = applyTick(s, rngUp);
    expect(s.history[id].length).toBeLessThanOrEqual(60);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run apps/demos/design-system/src/data/applyTick.test.ts`
Expected: FAIL — cannot find module `./applyTick`.

- [ ] **Step 3: Implement `src/data/applyTick.ts`**

Pure reducer: for each quote, compute delta `= (rng() - 0.5) * tickSize`, update `mid`, derive `bid`/`ask` from a spread, set `dir` (`up`/`down`/`flat`) from sign of delta, recompute `changePct`, append `mid` to `history[id]` capped at 60, and recompute each position's `marketValue = qty*mid/100`-style and `unrealizedPnl`. Keep the function under 80 lines; extract a `tickQuote(q, rng)` helper if needed.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run apps/demos/design-system/src/data/applyTick.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/demos/design-system/src/data/applyTick.ts apps/demos/design-system/src/data/applyTick.test.ts
git commit -m "feat(design-system-demo): pure applyTick ticking reducer + tests

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `useTickingStore` hook

**Files:**
- Create: `src/data/useTickingStore.ts`

**Interfaces:**
- Consumes: `seedState` (Task 2), `applyTick` (Task 3), `TerminalState` (Task 2).
- Produces: `useTickingStore(opts?: { intervalMs?: number; live?: boolean }): { state: TerminalState; live: boolean; setLive: (b: boolean) => void; intervalMs: number; setIntervalMs: (n: number) => void }`. Drives `applyTick` on an interval with a module-local RNG; pauses when `live` is false. Uses `performance.now()`-free seeding (seed with a fixed constant passed to `seedState`).

- [ ] **Step 1: Implement the hook**

Use `useState(() => seedState(0))`, a `useRef` RNG (`makeRng` re-exported from seeds or inline), and a `useEffect` that sets `setInterval` when `live`, calling `setState(s => applyTick(s, rng))`. Clean up on unmount/derp changes. Default `intervalMs: 1200`, `live: true`. Guard `typeof window`.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p apps/demos/design-system/tsconfig.json`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/demos/design-system/src/data/useTickingStore.ts
git commit -m "feat(design-system-demo): useTickingStore interval hook

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Theme plumbing — AG Grid theme, theme-mode hook, ThemeToggle, CodeBlock

**Files:**
- Create: `src/lib/agGridTheme.ts`, `src/lib/useThemeMode.ts`, `src/components/ThemeToggle.tsx`, `src/components/CodeBlock.tsx`

**Interfaces:**
- Consumes: `@wellsfargo-starui/design-system` (`applyTheme`, `getTheme`), `@wellsfargo-starui/design-system/adapters/ag-grid` (`staruiGridTheme`, `agGridBlotterDarkTheme`), `@wellsfargo-starui/ui` (`Button`).
- Produces: `staruiTheme` (re-export of `staruiGridTheme`), `blotterTheme`; `useThemeMode(): { mode: 'dark'|'light'; toggle: () => void }`; `ThemeToggle`; `CodeBlock({ code, lang? })`.

- [ ] **Step 1: Create `src/lib/agGridTheme.ts`**

```ts
import { staruiGridTheme, agGridBlotterDarkTheme } from '@wellsfargo-starui/design-system/adapters/ag-grid';

/** Standard density grid theme (token-driven, switches via data-ag-theme-mode). */
export const gridTheme = staruiGridTheme;
/** Dense blotter density for the Market/Orders blotters. */
export const blotterTheme = agGridBlotterDarkTheme;
```

- [ ] **Step 2: Create `src/lib/useThemeMode.ts`**

A hook that tracks `'dark'|'light'` from `getTheme().theme`, exposes `toggle()` calling `applyTheme({ theme: next })` and updating state. Mirror `markets-grid-lab/src/components/ThemeToggle.tsx`'s logic but as a reusable hook so grids can read `mode` to set `data-ag-theme-mode`.

```ts
import { useCallback, useState } from 'react';
import { applyTheme, getTheme } from '@wellsfargo-starui/design-system';

export function useThemeMode() {
  const [mode, setMode] = useState<'dark' | 'light'>(() => getTheme().theme as 'dark' | 'light');
  const toggle = useCallback(() => {
    const next: 'dark' | 'light' = mode === 'dark' ? 'light' : 'dark';
    applyTheme({ theme: next });
    setMode(next);
  }, [mode]);
  return { mode, toggle };
}
```

- [ ] **Step 3: Create `src/components/ThemeToggle.tsx`** (uses the hook; pattern + tokens from markets-grid-lab ThemeToggle, `data-testid="theme-toggle"`, Sun/Moon icons).

- [ ] **Step 4: Create `src/components/CodeBlock.tsx`** — a token-styled `<pre><code>` with a copy button (reuse the copy pattern from `apps/demos/markets-grid-lab/src/components/InspectorDrawer.tsx`'s `ConfigBlock`: `Copy`/`Check` lucide icons, `navigator.clipboard.writeText`, `data-testid="code-copy"`). Props `{ code: string; label?: string }`. Tokens only.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit -p apps/demos/design-system/tsconfig.json`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/demos/design-system/src/lib apps/demos/design-system/src/components/ThemeToggle.tsx apps/demos/design-system/src/components/CodeBlock.tsx
git commit -m "feat(design-system-demo): grid theme, theme-mode hook, ThemeToggle, CodeBlock

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: App shell — TopBar + tab navigation

**Files:**
- Create: `src/components/TopBar.tsx`
- Modify: `src/App.tsx` (replace placeholder)

**Interfaces:**
- Consumes: `@wellsfargo-starui/ui` (`Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`, `TooltipProvider`, `Badge`), `ThemeToggle` (Task 5), the six tab components (Tasks 8–16). Until those exist, render placeholder panels for each tab id so the shell builds standalone.
- Produces: `App` with tabs `market · orders · analytics · risk · design-system` driven by Radix Tabs; `TopBar`.

> Wiring note: this task builds the shell with **placeholder tab bodies** (`<div data-testid="tab-<id>" />`). Tasks 8–16 replace each placeholder with the real tab component. Tab ids: `market`, `orders`, `analytics`, `risk`, `research`, `design-system`. Default active tab: `market`. Each `TabsTrigger` carries `data-testid="ds-tab-<id>"`.

- [ ] **Step 1: Create `src/components/TopBar.tsx`** — brand mark + app title, a row of ticking status chips (accept `state` prop; render 3–4 KPI `Badge`s from `state.quotes`), a `ThemeToggle` on the right. Tokens only; `data-testid="ds-topbar"`.

- [ ] **Step 2: Replace `src/App.tsx`** — `useTickingStore` at the top; `TooltipProvider`; `TopBar` with `state`; a `Tabs` shell (vertical-free, horizontal `TabsList`) with the six triggers and six `TabsContent` placeholders (`data-testid="tab-<id>"`). Active default `market`.

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit -p apps/demos/design-system/tsconfig.json`
Run: `npm --prefix apps run build -w @wellsfargo-starui/design-system-demo`
Expected: both clean (shell renders with placeholders).

- [ ] **Step 4: Commit**

```bash
git add apps/demos/design-system/src/components/TopBar.tsx apps/demos/design-system/src/App.tsx
git commit -m "feat(design-system-demo): app shell — TopBar + tab navigation

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Showcase framework — types, ComponentDemo, registry + completeness test (TDD)

**Files:**
- Create: `src/showcase/types.ts`, `src/showcase/ComponentDemo.tsx`, `src/showcase/registry.ts`, `src/showcase/registry.test.ts`

**Interfaces:**
- Consumes: `@wellsfargo-starui/ui` (`Tabs`/`TabsList`/`TabsTrigger`/`TabsContent`, `Button`), `CodeBlock` (Task 5).
- Produces: `ShowcaseCategory` (union), `ShowcaseEntry` (`{ id: string; name: string; category: ShowcaseCategory; importLine: string; code: string; Demo: () => ReactNode }`), `SHOWCASE_CATEGORIES` (ordered list); `ComponentDemo({ entry })`; `SHOWCASE_ENTRIES: ShowcaseEntry[]`, `entriesByCategory(): Record<ShowcaseCategory, ShowcaseEntry[]>`.
- The registry barrel composes per-category arrays from `showcase/components/*` (Tasks 9–11). For THIS task, `SHOWCASE_ENTRIES` starts as `[]` and the per-category modules are imported and spread (they export empty arrays until their task fills them).

- [ ] **Step 1: Create `src/showcase/types.ts`**

```ts
import type { ReactNode } from 'react';

export type ShowcaseCategory =
  | 'buttons' | 'inputs' | 'selection' | 'overlays'
  | 'navigation' | 'data-display' | 'feedback' | 'layout' | 'charts';

export const SHOWCASE_CATEGORIES: { id: ShowcaseCategory; label: string }[] = [
  { id: 'buttons', label: 'Buttons & Actions' },
  { id: 'inputs', label: 'Inputs & Forms' },
  { id: 'selection', label: 'Selection' },
  { id: 'overlays', label: 'Overlays & Dialogs' },
  { id: 'navigation', label: 'Navigation' },
  { id: 'data-display', label: 'Data Display' },
  { id: 'feedback', label: 'Feedback & Status' },
  { id: 'layout', label: 'Layout & Disclosure' },
  { id: 'charts', label: 'Charts' },
];

export interface ShowcaseEntry {
  /** Matches the `@wellsfargo-starui/ui` component file basename, e.g. 'alert-dialog', 'button'. */
  id: string;
  name: string;
  category: ShowcaseCategory;
  importLine: string;
  code: string;
  Demo: () => ReactNode;
}
```

- [ ] **Step 2: Write the failing completeness test** (`src/showcase/registry.test.ts`)

```ts
import { fileURLToPath } from 'node:url';
import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SHOWCASE_ENTRIES, SHOWCASE_CATEGORIES } from './registry';

// Non-visual / utility modules that are not standalone showcase entries.
const ALLOWLIST = new Set([
  'use-toast', 'toaster', 'sonner',
  'CollapsibleToolbar', 'ToolbarContainer', 'VirtualizedList',
]);

const componentsDir = fileURLToPath(
  new URL('../../../../../packages/react-ui/ui/src/components', import.meta.url),
);

function publicComponentIds(): string[] {
  return readdirSync(componentsDir)
    .filter((f) => f.endsWith('.tsx'))
    .map((f) => f.replace(/\.tsx$/, ''))
    .filter((id) => !ALLOWLIST.has(id));
}

describe('showcase registry completeness', () => {
  it('has an entry for every public @wellsfargo-starui/ui component', () => {
    const ids = new Set(SHOWCASE_ENTRIES.map((e) => e.id));
    const missing = publicComponentIds().filter((id) => !ids.has(id));
    expect(missing, `missing showcase entries: ${missing.join(', ')}`).toEqual([]);
  });

  it('every entry has import line, code, a Demo, and a valid category', () => {
    const cats = new Set(SHOWCASE_CATEGORIES.map((c) => c.id));
    for (const e of SHOWCASE_ENTRIES) {
      expect(e.importLine.length, `${e.id}.importLine`).toBeGreaterThan(0);
      expect(e.code.length, `${e.id}.code`).toBeGreaterThan(0);
      expect(typeof e.Demo, `${e.id}.Demo`).toBe('function');
      expect(cats.has(e.category), `${e.id}.category`).toBe(true);
    }
  });

  it('entry ids are unique', () => {
    const ids = SHOWCASE_ENTRIES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
```

> This test FAILS until every component has an entry (Tasks 9–11). That is intentional — it is the coverage gate. It first goes green at the end of Task 11. Until then, expect the first `it` to fail listing missing ids; Tasks 9–11 each shrink that list.

- [ ] **Step 3: Create `src/showcase/registry.ts`** — import the nine per-category arrays and concatenate. Create the nine `showcase/components/*.tsx` files now, each exporting an empty typed array (`export const buttonsEntries: ShowcaseEntry[] = [];`), so the barrel compiles.

```ts
import type { ShowcaseEntry } from './types';
export { SHOWCASE_CATEGORIES } from './types';
import { buttonsEntries } from './components/buttons';
import { inputsEntries } from './components/inputs';
import { selectionEntries } from './components/selection';
import { overlaysEntries } from './components/overlays';
import { navigationEntries } from './components/navigation';
import { dataDisplayEntries } from './components/dataDisplay';
import { feedbackEntries } from './components/feedback';
import { layoutEntries } from './components/layout';
import { chartsEntries } from './components/charts';

export const SHOWCASE_ENTRIES: ShowcaseEntry[] = [
  ...buttonsEntries, ...inputsEntries, ...selectionEntries, ...overlaysEntries,
  ...navigationEntries, ...dataDisplayEntries, ...feedbackEntries, ...layoutEntries,
  ...chartsEntries,
];

export function entriesByCategory() {
  const out = {} as Record<string, ShowcaseEntry[]>;
  for (const e of SHOWCASE_ENTRIES) (out[e.category] ??= []).push(e);
  return out;
}
```

- [ ] **Step 4: Create `src/showcase/ComponentDemo.tsx`** — renders one `ShowcaseEntry`: a header (name + `id` badge), a Preview/Code toggle (`Tabs` with two triggers), the live `<entry.Demo />` in a bordered token canvas, the `importLine` and `code` via `CodeBlock`. `data-testid="ds-demo-<id>"`. Tokens only; under 80 lines.

- [ ] **Step 5: Run the completeness test (expect partial failure)**

Run: `npx vitest run apps/demos/design-system/src/showcase/registry.test.ts`
Expected: the 2nd and 3rd `it` PASS (no entries yet → vacuously true); the 1st `it` FAILS listing all ~46 missing ids. This confirms the gate works. Typecheck must be clean:
Run: `npx tsc --noEmit -p apps/demos/design-system/tsconfig.json` → clean.

- [ ] **Step 6: Commit**

```bash
git add apps/demos/design-system/src/showcase
git commit -m "feat(design-system-demo): showcase framework — types, ComponentDemo, registry + completeness gate

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Design System sections — palette, typography, foundations, overview

**Files:**
- Create: `src/showcase/palette.ts`, `src/showcase/sections/PaletteSection.tsx`, `TypographySection.tsx`, `FoundationsSection.tsx`, `OverviewSection.tsx`

**Interfaces:**
- Consumes: `@wellsfargo-starui/ui` (`Card`, `Separator`), `CodeBlock` (Task 5).
- Produces: `PALETTE_GROUPS` (data); `PaletteSection`, `TypographySection`, `FoundationsSection`, `OverviewSection` React components.

- [ ] **Step 1: Create `src/showcase/palette.ts`** — a data structure of token groups, each listing the **CSS variable names** (so swatches render the live value). Cover the groups from the spec. Example shape (fill all groups; variable names must match the emitted `--ds-*` tokens — confirm against `@wellsfargo-starui/design-system/css` output / `tokens/staruiHex.ts`):

```ts
export interface PaletteSwatch { varName: string; label: string; role: string }
export interface PaletteGroup { id: string; label: string; swatches: PaletteSwatch[] }

export const PALETTE_GROUPS: PaletteGroup[] = [
  { id: 'surface', label: 'Surface', swatches: [
    { varName: '--ds-surface-ground', label: 'Ground', role: 'App background' },
    { varName: '--ds-surface-primary', label: 'Primary', role: 'Cards / panels' },
    { varName: '--ds-surface-secondary', label: 'Secondary', role: 'Hover / inset' },
    /* tertiary, quaternary, muted, popover, sunken */
  ]},
  /* text, border, accent (positive/negative/warning/info/highlight/purple),
     trade (flat/positiveStrip/negativeStrip/bidFill/askFill),
     action (buyBg/sellBg), overlay (*Soft/*Ring), chart ([1..5]), elevation */
];
```

> The implementer must verify each `varName` exists in the emitted theme CSS (grep the built `packages/design-system/design-system/dist/css/theme.css` or `src/themes/fi-dark.css`) so swatches render a real color. Unknown vars render transparent — not acceptable.

- [ ] **Step 2: Create `PaletteSection.tsx`** — render each group as a labeled grid of swatch chips; each chip is a square with `style={{ background: 'var(<varName>)' }}` (the one allowed inline style — it references a token, not a hardcoded color), plus the var name (mono) and role. `data-testid="ds-palette"`.

- [ ] **Step 3: Create `TypographySection.tsx`** — show the type scale tiers (font-size tokens), sans vs mono families, weights, sample rows (KPI number in mono, table cell, label, heading). Reads `var(--ds-font-*)`.

- [ ] **Step 4: Create `FoundationsSection.tsx`** — radius, spacing, elevation/shadow (`var(--ds-elevation-card|overlay|glow)`), focus ring — each rendered live from tokens with labels.

- [ ] **Step 5: Create `OverviewSection.tsx`** — prose + `CodeBlock`s for consuming the system: the `@wellsfargo-starui/design-system/css` import, `applyTheme(getTheme())`, the Tailwind preset, and the AG Grid `staruiGridTheme` usage. Config-driven framing.

- [ ] **Step 6: Typecheck + build**

Run: `npx tsc --noEmit -p apps/demos/design-system/tsconfig.json`
Run: `npm --prefix apps run build -w @wellsfargo-starui/design-system-demo`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add apps/demos/design-system/src/showcase/palette.ts apps/demos/design-system/src/showcase/sections
git commit -m "feat(design-system-demo): palette/typography/foundations/overview sections

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Tasks 9–11: Component gallery entries

These three tasks fill the nine per-category entry files. They share one pattern; **the completeness test (`registry.test.ts`) is the gate** and must be fully green at the end of Task 11. Each entry is small and follows the exemplar below exactly.

**Exemplar entry** (the shape every entry uses — this is `button` in `components/buttons.tsx`):

```tsx
import type { ShowcaseEntry } from '../types';
import { Button } from '@wellsfargo-starui/ui';

export const buttonsEntries: ShowcaseEntry[] = [
  {
    id: 'button',
    name: 'Button',
    category: 'buttons',
    importLine: "import { Button } from '@wellsfargo-starui/ui';",
    code: `<div className="flex gap-2">
  <Button>Default</Button>
  <Button variant="secondary">Secondary</Button>
  <Button variant="outline">Outline</Button>
  <Button variant="destructive">Destructive</Button>
  <Button variant="ghost">Ghost</Button>
</div>`,
    Demo: () => (
      <div className="flex flex-wrap gap-2">
        <Button>Default</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="destructive">Destructive</Button>
        <Button variant="ghost">Ghost</Button>
      </div>
    ),
  },
  // … button-group entry, etc.
];
```

**Rules for every entry:**
- `id` = the component file basename in `packages/react-ui/ui/src/components` (e.g. `alert-dialog`, `dropdown-menu`, `scroll-area`).
- Import the real exports from `@wellsfargo-starui/ui` (read the component file to get exact export names).
- `Demo` renders a small, interactive, representative example using tokens only (no hardcoded hex).
- `code` is the JSX of the demo as a copyable string (kept in sync with `Demo`).
- Keep each category file under 800 LOC; if a file approaches it, that's fine — they are data.

**Category → component id assignment** (every non-allowlisted `.tsx` basename appears exactly once):

- **buttons.tsx** (`buttonsEntries`): `button`, `button-group`, `toggle`, `toggle-group`
- **inputs.tsx** (`inputsEntries`): `input`, `textarea`, `label`, `input-otp`, `form`, `slider`, `checkbox`, `switch`, `radio-group`
- **selection.tsx** (`selectionEntries`): `select`, `combobox`→ N/A (no file) → `command`, `calendar`, `dropdown-menu`, `context-menu`, `menubar`
- **overlays.tsx** (`overlaysEntries`): `dialog`, `alert-dialog`, `sheet`, `drawer`, `popover`, `hover-card`, `tooltip`
- **navigation.tsx** (`navigationEntries`): `tabs`, `accordion`, `navigation-menu`, `breadcrumb`, `pagination`
- **dataDisplay.tsx** (`dataDisplayEntries`): `table`, `card`, `badge`, `avatar`, `separator`, `aspect-ratio`, `carousel`
- **feedback.tsx** (`feedbackEntries`): `alert`, `toast`, `progress`, `skeleton`, `tooltip`→(already in overlays; do not duplicate)
- **layout.tsx** (`layoutEntries`): `collapsible`, `scroll-area`, `resizable`
- **charts.tsx** (`chartsEntries`): `chart`

> Reconcile against the live `readdirSync` list at implementation time. Every `.tsx` basename NOT in the test's `ALLOWLIST` must land in exactly one category file. If a basename above doesn't exist or a new one appears, the completeness test will tell you precisely which ids are missing — assign each to the most fitting category. There is no `combobox.tsx`; `command` covers command-palette/combobox.

#### Task 9: buttons, inputs, selection

**Files:** `src/showcase/components/buttons.tsx`, `inputs.tsx`, `selection.tsx`

- [ ] **Step 1:** Fill `buttonsEntries`, `inputsEntries`, `selectionEntries` per the rules/exemplar. For `form`, build a tiny react-hook-form example (no zod) with one `Input` field. For `command`, a small `Command` palette. For `calendar`, a `Calendar` in single-select mode.
- [ ] **Step 2: Typecheck** — `npx tsc --noEmit -p apps/demos/design-system/tsconfig.json` → clean.
- [ ] **Step 3: Run completeness test** — `npx vitest run apps/demos/design-system/src/showcase/registry.test.ts` → the missing list shrinks to only overlays/navigation/dataDisplay/feedback/layout/charts ids. (Still failing overall — expected.)
- [ ] **Step 4: Commit** — `feat(design-system-demo): showcase entries — buttons, inputs, selection` (+ trailer).

#### Task 10: overlays, navigation, data-display

**Files:** `src/showcase/components/overlays.tsx`, `navigation.tsx`, `dataDisplay.tsx`

- [ ] **Step 1:** Fill the three arrays per rules/exemplar. Overlays use trigger+content (e.g. `Dialog`/`DialogTrigger`/`DialogContent`); keep demos self-contained with local `useState` where needed.
- [ ] **Step 2: Typecheck** → clean.
- [ ] **Step 3: Run completeness test** → missing list shrinks to feedback/layout/charts ids.
- [ ] **Step 4: Commit** — `feat(design-system-demo): showcase entries — overlays, navigation, data display` (+ trailer).

#### Task 11: feedback, layout, charts — gallery gate green

**Files:** `src/showcase/components/feedback.tsx`, `layout.tsx`, `charts.tsx`

- [ ] **Step 1:** Fill the three arrays. `toast` demo uses `useToast`/`Toaster` (render a local `<Toaster />` + a trigger Button). `chart` demo uses `@wellsfargo-starui/ui` chart primitives with a tiny recharts series and the design-system chart ramp.
- [ ] **Step 2: Typecheck** → clean.
- [ ] **Step 3: Run completeness test (now fully green)**

Run: `npx vitest run apps/demos/design-system/src/showcase/registry.test.ts`
Expected: all 3 `it` PASS — `missing` is `[]`. If any id is still missing, add it to the correct category file until green. **Do not edit `ALLOWLIST` to force green** unless a module is genuinely non-visual (and note why in the commit).

- [ ] **Step 4: Commit** — `feat(design-system-demo): showcase entries — feedback, layout, charts; gallery complete` (+ trailer).

---

### Task 12: DesignSystemTab — assemble the reference

**Files:**
- Create: `src/tabs/DesignSystemTab.tsx`
- Modify: `src/App.tsx` (swap the `design-system` placeholder for `<DesignSystemTab />`)

**Interfaces:**
- Consumes: the four sections (Task 8), `entriesByCategory`/`SHOWCASE_CATEGORIES`/`ComponentDemo` (Tasks 7–11), `@wellsfargo-starui/ui` (`ScrollArea`, `Separator`).
- Produces: `DesignSystemTab` with a left sub-nav (Overview, Palette, Typography, Foundations, then each component category) and a scrollable content pane rendering the selected section / the category's `ComponentDemo`s.

- [ ] **Step 1: Build `DesignSystemTab.tsx`** — left rail lists the 4 sections + 9 component categories (from `SHOWCASE_CATEGORIES`); selecting one shows the section component or maps `entriesByCategory()[cat]` to `<ComponentDemo entry={e} />`. `data-testid="ds-designsystem"`; sub-nav items `data-testid="ds-section-<id>"`. Reuse the sidebar styling idiom from markets-grid-lab's `LabSidebarNav` (tokens, active highlight) but keep it local/simple.
- [ ] **Step 2: Wire into `App.tsx`** — replace the `design-system` tab placeholder with `<DesignSystemTab />`.
- [ ] **Step 3: Typecheck + build** → both clean.
- [ ] **Step 4: Commit** — `feat(design-system-demo): DesignSystemTab — sections + component gallery` (+ trailer).

---

### Task 13: Market tab — blotter, watchlist, order book, price chart, trade ticket

**Files:**
- Create: `src/panels/BondBlotter.tsx`, `Watchlist.tsx`, `OrderBook.tsx`, `PriceChart.tsx`, `TradeTicket.tsx`, `src/tabs/MarketTab.tsx`
- Modify: `src/App.tsx` (swap the `market` placeholder)

**Interfaces:**
- Consumes: `TerminalState` (Task 2), `gridTheme`/`blotterTheme` (Task 5), `useThemeMode` (Task 5, for `data-ag-theme-mode`), `@wellsfargo-starui/ui` (`Card`, `Sheet`/`Dialog`, `Form` parts, `Select`, `Button`, `ToggleGroup`, `ScrollArea`, `Badge`), recharts via `@wellsfargo-starui/ui` chart, formatters (Task 2). `AgGridReact` from `ag-grid-react`, modules registered (`AllCommunityModule`/enterprise as needed).
- Produces: the five panels + `MarketTab({ state })`.

- [ ] **Step 1: `BondBlotter.tsx`** — `AgGridReact` with `theme={blotterTheme}`, a wrapper `div` setting `data-ag-theme-mode={mode}`, columns for cusip/ticker/coupon/maturity/bid/mid/ask/ytm/oas/changePct with token-aware cell styling (positive/negative via `--ds-accent-*`), `getRowId` by `id`, `rowData` from `state`. Register ag-grid modules once.
- [ ] **Step 2: `Watchlist.tsx`** — compact list/`Card` of instruments with live mid + direction arrow + `fmtSignedPct`, color via tokens.
- [ ] **Step 3: `OrderBook.tsx`** — a depth ladder derived from a selected instrument's bid/ask (synthesize ±levels), bid/ask fills via `--ds-trade-bidFill/askFill`.
- [ ] **Step 4: `PriceChart.tsx`** — recharts line of `state.history[id]` via the `@wellsfargo-starui/ui` chart wrapper + chart ramp token.
- [ ] **Step 5: `TradeTicket.tsx`** — a `Sheet` (or `Dialog`) containing a `Form` (react-hook-form): side `ToggleGroup` (buy/sell), qty `Input`, price `Input`, settlement `Select`; submit logs to console + closes. No real order mutation required.
- [ ] **Step 6: `MarketTab.tsx`** — compose the five panels in a `react-resizable-panels` layout; pass `state`.
- [ ] **Step 7: Wire into `App.tsx`**, typecheck + build → clean.
- [ ] **Step 8: Commit** — `feat(design-system-demo): Market tab (blotter, watchlist, book, chart, ticket)` (+ trailer).

---

### Task 14: Orders tab — orders blotter, order entry form, RFQ simulator

**Files:**
- Create: `src/panels/OrdersBlotter.tsx`, `OrderEntryForm.tsx`, `RfqSimulator.tsx`, `src/tabs/OrdersTab.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `TerminalState`, `gridTheme`, `@wellsfargo-starui/ui` (`Form` parts, `Input`, `Select`, `Button`, `ToggleGroup`, `Badge`, `Card`), formatters.
- Produces: the three panels + `OrdersTab({ state })`.

- [ ] **Step 1: `OrdersBlotter.tsx`** — `AgGridReact` (`theme={gridTheme}`, `data-ag-theme-mode`) over `state.orders`, status as a token-colored `Badge` cell (working/filled/cancelled).
- [ ] **Step 2: `OrderEntryForm.tsx`** — react-hook-form via `@wellsfargo-starui/ui` `Form` (instrument `Select`, side `ToggleGroup`, qty/price `Input`s), client validation (required, qty>0), submit shows a toast.
- [ ] **Step 3: `RfqSimulator.tsx`** — a light panel: pick instrument + size, click "Request quote", show 2–3 simulated dealer quotes (derived from mid ± spread) in a `Card`/table.
- [ ] **Step 4: `OrdersTab.tsx`** — compose in a resizable layout.
- [ ] **Step 5: Wire into `App.tsx`**, typecheck + build → clean.
- [ ] **Step 6: Commit** — `feat(design-system-demo): Orders tab (blotter, order entry, RFQ)` (+ trailer).

---

### Task 15: Analytics + Risk tabs — charts, KPIs, exposure

**Files:**
- Create: `src/panels/YieldCurveChart.tsx`, `AnalyticsCards.tsx`, `RiskPanels.tsx`, `src/tabs/AnalyticsTab.tsx`, `src/tabs/RiskTab.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `TerminalState`, `@wellsfargo-starui/ui` (chart, `Card`, `Progress`, `Table` parts, `Badge`), recharts, formatters.
- Produces: the three panels + `AnalyticsTab({ state })`, `RiskTab({ state })`.

- [ ] **Step 1: `YieldCurveChart.tsx`** — recharts line/area over `state.curve` via the `@wellsfargo-starui/ui` chart wrapper + chart ramp.
- [ ] **Step 2: `AnalyticsCards.tsx`** — KPI `Card`s (avg yield, total DV01, best/worst mover) computed from `state`.
- [ ] **Step 3: `RiskPanels.tsx`** — exposure-by-sector table with token heat coloring, `Progress` bars for limit utilization, a VaR-style KPI card.
- [ ] **Step 4: `AnalyticsTab.tsx` / `RiskTab.tsx`** — compose panels.
- [ ] **Step 5: Wire both into `App.tsx`**, typecheck + build → clean.
- [ ] **Step 6: Commit** — `feat(design-system-demo): Analytics + Risk tabs (charts, KPIs, exposure)` (+ trailer).

---

### Task 16: Research tab

**Files:**
- Create: `src/panels/ResearchPanels.tsx`, `src/tabs/ResearchTab.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `@wellsfargo-starui/ui` (`Card`, `Accordion`, `HoverCard`, `Tabs`, `Separator`, `Badge`, `ScrollArea`).
- Produces: `ResearchTab` + `ResearchPanels`.

- [ ] **Step 1: `ResearchPanels.tsx` / `ResearchTab.tsx`** — a document-style screen: research note `Card`s, an `Accordion` of credit themes, `HoverCard`s on tickers, nested `Tabs` (Summary/Details). Static content is fine (no ticking needed). Tokens only.
- [ ] **Step 2: Wire into `App.tsx`**, typecheck + build → clean.
- [ ] **Step 3: Commit** — `feat(design-system-demo): Research tab` (+ trailer).

---

### Task 17: Smoke e2e, docs, full verification

**Files:**
- Create: `e2e/design-system-demo.spec.ts`
- Modify: `docs/current-features.md`

**Interfaces:**
- Consumes: the running app on `http://localhost:5310` (Playwright `webServer` from Task 1 boots it).

- [ ] **Step 1: Write `e2e/design-system-demo.spec.ts`**

```ts
import { test, expect } from '@playwright/test';

const URL = 'http://localhost:5310/';

test.describe('design-system demo', () => {
  test('boots on the Market tab with the blotter', async ({ page }) => {
    await page.goto(URL);
    await expect(page.getByTestId('ds-topbar')).toBeVisible();
    await expect(page.locator('.ag-root-wrapper').first()).toBeVisible({ timeout: 20_000 });
  });

  test('navigates to the Design System tab and renders the gallery', async ({ page }) => {
    await page.goto(URL);
    await page.getByTestId('ds-tab-design-system').click();
    await expect(page.getByTestId('ds-designsystem')).toBeVisible();
    await page.getByTestId('ds-section-buttons').click();
    await expect(page.getByTestId('ds-demo-button')).toBeVisible();
  });

  test('theme toggle flips data-theme', async ({ page }) => {
    await page.goto(URL);
    const before = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    await page.getByTestId('theme-toggle').click();
    const after = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    expect(after).not.toBe(before);
  });
});
```

- [ ] **Step 2: Run the smoke spec**

Run: `npx playwright test e2e/design-system-demo.spec.ts --project=chromium`
Expected: 3 passed. (First run boots the dev server on :5310; allow ~1–2 min.) If a selector differs, adjust the test (not the assertions' intent) until green.

- [ ] **Step 3: Update `docs/current-features.md`** — add an apps-table row for `design-system` and a sub-section (after the table, like the markets-grid-lab sub-section) describing: FI terminal (Market/Orders/Analytics/Risk/Research) styled by `@wellsfargo-starui/design-system`, AG Grid via `staruiGridTheme`, recharts charts, and the Design System reference tab (palette/typography/foundations + full `@wellsfargo-starui/ui` gallery).

- [ ] **Step 4: Full verification**

Run: `npx vitest run apps/demos/design-system/src/` → all pass (applyTick + registry completeness green).
Run: `npx tsc --noEmit -p apps/demos/design-system/tsconfig.json` → clean.
Run: `npm --prefix apps run build -w @wellsfargo-starui/design-system-demo` → builds.

- [ ] **Step 5: Commit**

```bash
git add e2e/design-system-demo.spec.ts docs/current-features.md
git commit -m "test(design-system-demo): smoke spec; docs: feature inventory

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Identity/stack/theming (spec §A) → Task 1 (scaffold/register), Task 5 (agGrid `staruiGridTheme`, ThemeToggle), Task 8/Overview (consumption docs). ✓
- Shell + nav + 5 trading tabs + data model (spec §B) → Task 2–4 (data), Task 6 (shell), Tasks 13–16 (tabs). ✓
- Design System tab: palette/typography/foundations + all-52 gallery, live+code+import (spec §C) → Task 7 (framework + completeness gate), Task 8 (sections), Tasks 9–11 (entries), Task 12 (assembly). ✓
- Charts (yield-curve + price) → Task 13 (PriceChart), Task 15 (YieldCurveChart), plus `chart` gallery entry (Task 11). ✓
- Live ticking data → Task 3 (`applyTick`) + Task 4 (`useTickingStore`). ✓
- Testing (applyTick unit, registry completeness, smoke e2e, docs) → Tasks 3, 7/11, 17. ✓
- Registration (apps/package.json, playwright, build-app-track auto) → Task 1. ✓
- Non-goals respected (no backend/OpenFin/Angular/persistence; charts limited) — no tasks add them. ✓

**Placeholder scan:** Foundational tasks (1–8, 12, 17) carry complete code. The repetitive surfaces — the 46-entry gallery (Tasks 9–11) and trading panels (Tasks 13–16) — are specified as a precise shared contract (`ShowcaseEntry`, `ComponentDemo`, the worked `button` exemplar, exact per-category id assignment) gated by the `registry.test.ts` completeness test and per-task typecheck+build, rather than 46 inline demos. This is a deliberate, gated choice for highly repetitive UI following one exemplar — not an un-specified "fill in later". Panels likewise have concrete component/data/theme contracts and build gates.

**Type consistency:** `TerminalState`/`Quote`/`Order`/`Position` defined in Task 2 and consumed unchanged in Tasks 3–4, 13–16. `applyTick(state, rng)` signature matches its test (Task 3) and hook use (Task 4). `ShowcaseEntry`/`ShowcaseCategory`/`SHOWCASE_ENTRIES`/`entriesByCategory` defined in Task 7 and consumed in Tasks 8–12. `useThemeMode()` `{ mode, toggle }` defined in Task 5 and used by grids (Tasks 13–15) and ThemeToggle. Tab testids (`ds-tab-<id>`, `ds-section-<id>`, `ds-demo-<id>`, `ds-topbar`, `ds-designsystem`, `theme-toggle`) defined in Tasks 6/12/7/5 and asserted in Task 17.

**Risk note for the implementer:** (1) Confirm exact `@wellsfargo-starui/ui` export names by reading each component file before writing its gallery entry. (2) Verify each palette `varName` exists in the emitted theme CSS (swatches must render a real color). (3) The e2e grid selector `.ag-root-wrapper` and the `data-ag-theme-mode` wiring are the likeliest first-run snags — confirm against a built run.
