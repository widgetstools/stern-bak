# Current Features — `starui` MarketsUI Platform

> **Living inventory** of every implemented capability across `packages/`,
> grouped by architecture bucket and then by functional area. Update this file
> in the same change that adds, modifies, or removes a feature — same rule as
> `docs/IMPLEMENTED_FEATURES.md`. Treat omissions as a code-review blocker.
>
> Last reconciled: 2026-06-09 (sourced directly from `packages/` source.)

## Naming vocabulary (binding)

- **StarGrid** is the consumer-facing name: the one component apps mount
  (`<StarGrid>`), the one bootstrap (`createStarui()`), the workspace
  bridge (`useHostedStarui`). New public API uses the StarGrid family.
- **MarketsGrid** is the internal surface StarGrid composes (engine,
  containers, customizer). It stays MarketsGrid — a repo-wide rename was
  deliberately rejected (thousands of occurrences across components,
  files, CSS classes and tests for zero consumer-facing gain; consumers
  never type the word).
- **"profile"** is the only word for a saved grid arrangement. "layout",
  "viewState" and "gridLevelData" name OTHER things (workspace layouts,
  nothing, the per-grid provider-selection row respectively) — never use
  them for profiles.
- **DataHub** is the data subsystem's name going forward
  (`DataHubProvider`); `DataServicesProvider` is the legacy wrapper it
  still mounts.
- **"blotter"** survives only in demo copy and app names.

## Document conventions

- **Granular bullets** — one bullet per distinct capability (component, hook,
  manager, util, IPC topic, transport, schema, etc.). If a class exposes
  several public APIs that callers consume independently, list them
  individually.
- **Sub-headings** group features inside a package by functional area.
- **Public subpath exports** (`package.json` `exports`) are called out per
  package so consumers can find the public surface at a glance.
- **Status tags** (`scaffold`, `deprecated`) appear inline where applicable.
- **Skip tests/fixtures**. Skip private implementation details that aren't
  importable.

### Public vs internal

A capability belongs in this inventory when a consumer **can import it** without
reaching into package internals. Visibility is determined in this order:

1. **`package.json` `"exports"`** — the authoritative public surface. If a
   subpath isn't listed, it isn't public (even if source files exist).
2. **Package root / subpath barrel** (`src/index.ts`, `customizer/index.ts`, …)
   — symbols re-exported here are public for that subpath. Source files that
   exist but aren't re-exported are **internal**.
3. **Cross-package re-exports** — only list a symbol under the package that
   actually exports it. If `@wellsfargo-starui/core` owns `StorageAdapter`, don't imply
   it ships from `@wellsfargo-starui/grid` unless the grid barrel re-exports it.

**How to tag visibility in bullets:**

| Tag | When to use | Example phrasing |
|-----|-------------|------------------|
| *(none)* | On a public barrel or documented subpath export | `- useDataProvider()` — hub-backed …` |
| **Internal** | Implemented and user-visible at runtime, but not importable | `- applyProviderToGrid` — … **Internal** — not on public barrel` |
| **Deprecated.** | Still exported; callers should migrate | `- useProviderStream` — … **Deprecated.** use `useDataProvider`` |

**Common internal patterns** (list the behavior, tag if not importable):

- **Composition internals** — toolbar shells, profile dialogs, and editor tabs
  composed inside a parent (`MarketsGrid`, `DataProviderEditor`, `WorkspaceSetup`)
  without their own barrel export.
- **Runtime-only wiring** — scope migration, GC, and workspace init helpers that
  run inside `initWorkspace()` but aren't on any public barrel.
- **Type-only exposure** — interfaces used in public prop types but defined in
  another package (document under the owning package; cross-reference elsewhere).

**Review rule:** before adding a bullet, grep the package's `index.ts` (and
`package.json` `exports`). If the symbol isn't there, either mark it **Internal**
or omit it. Never document a symbol as a public export when only an internal
module or a different package provides it.

---

## Bucket index

1. [UI Design System](#1-ui-design-system) — `packages/design-system/`
2. [React UI Controls](#2-react-ui-controls) — `packages/react-core/ui/` (part of `@wellsfargo-starui/react`)
3. [React Grid](#3-react-grid) — `packages/react-grid/`
4. [React Core](#4-react-core) — `packages/react-core/`
5. [Types / Core](#5-shared--core) — `packages/types/`, `packages/core/`
6. [Data Utilities](#6-data-utilities) — `packages/data/`
7. [OpenFin Utils](#7-openfin-utils) — `packages/openfin/`

---

## 1. UI Design System

### 1.1 `@wellsfargo-starui/design-system`

**Path:** `packages/design-system/design-system`
**Purpose:** Design tokens, theme runtime, CSS variable generation, and framework adapters for the MarketsUI platform.

**Upgrade guide:** [`docs/guides/design-system-upgrade-and-openfin-palette.md`](guides/design-system-upgrade-and-openfin-palette.md) — StarUI v1 OKLCH tokens, shadcn/AG Grid alignment, OpenFin palette bridge.

**Public exports:**

- `.` — root (tokens, adapters, `applyTheme`, cell renderers)
- `./css` — bundled theme stylesheet (tokens + base + ag-grid skin; pair with the `./tailwind` preset when the consumer runs its own Tailwind build)
- `./styles.css` — **zero-config stylesheet for external consumers**: theme tokens + self-hosted `@font-face` rules + every shipped component's compiled utilities (built at package-build time by scanning ui / grid / widgets-react / config-browser / workspace-setup-react / host-data-react sources) + the grid's chrome CSS, in one file. Importing it is the ONLY styling step an external app needs — no `tailwind.config`, no PostCSS, no `content` globs, no `@apply border-border` base rule. Ships **no global document reset** (MUI `CssBaseline` / Chakra `resetCSS` convention) — a consumer's own `h1`/`ul`/`img` are left untouched, browser-verified. Carries only the rules the utilities are mechanically useless without, inside `@layer wf-base` so any unlayered consumer rule wins: `box-sizing` + `border-width: 0` + `border-style: solid` on `*` (Tailwind `border-*` sets width only), and typography inheritance on `button`/`input`/`select`/`textarea` (form controls otherwise fall back to a system font)
- `./reset.css` — **opt-in** global normalisation (Tailwind preflight alone). Import only when the app has no reset of its own; restyles the consumer's own markup by design
- `./fonts/*.woff2` — self-hosted Inter + JetBrains Mono variable fonts (latin + latin-ext, subsetted with Fontsource's own `unicode-range` values) plus their OFL-1.1 licence texts, copied into `dist/` at build time. No CDN request — browser-verified as zero external requests, so corporate CSP/egress policy can't silently degrade the app to system fonts
- `./tailwind` — Tailwind preset
- `./primeng` — PrimeNG theme preset
- `./shadcn` — shadcn token generator
- `./adapters/ag-grid` — AG Grid Quartz theme params + baked `Theme` objects (`agGridDarkTheme`, `agGridLightTheme`, comfort/blotter variants); `GridDensity` presets (`gridDensityStructuralParams`, `applyGridDensityToTheme`, `resolveGridDensity`) for ultra/compact/comfortable `spacing`, row/header heights, cell/header `fontSize`, and `iconSize` per AG Grid compactness theming (cached `withParams` per base theme)
- `./tokens`, `./tokens/primitives`, `./tokens/semantic`, `./tokens/components`, `./tokens/controls`
- `./cell-renderers` — bundled AG Grid cell renderer classes
- `./cell-renderers-registry` — `cellRendererCatalogue`, `cellRendererComponents`, `getCellRendererEntry`, `CONFIGURABLE_RENDERER_IDS`, `CellRendererConfig` discriminated union

#### Primitive tokens

- Color palettes: paper, ink, graphite, teal, rose, amber, brand, cyan, purple, CVD-safe variants
- Typography: font families, sizes, weights, letter-spacing, line-heights
- Spacing scale, border radius, opacity scale, transition tokens, elevation/shadow scale
- **StarUI v1 OKLCH tokens** (`tokens/starui-tokens.css`) — Azure accent, teal/rose buy/sell, FT paper light + blue-graphite dark; bare OKLCH components for alpha-friendly `oklch(var(--primary) / 0.12)` usage
- **Compat bridge** (`adapters/compatCss.ts`) — `--ds-*`, `--bn-*`, `--p-*`, and surface scale aliases mapped from OKLCH source tokens for grid chrome and legacy consumers
- **PrimeNG preset** — `definePreset(Aura, …)` Azure ramp + FI buy/sell semantics (`primeng/starui-primeng-preset` parity)
- **AG Grid theme** — Quartz `staruiGridTheme` with light/dark `withParams` modes; OKLCH CSS vars; `data-ag-theme-mode` on `<html>` synced by `applyTheme` and runtime theme writers; density presets retained
- **Tailwind preset** — OKLCH colors use `oklch(var(--token) / <alpha-value>)`; `fontSize` maps to `--text-*`; `h-control` / `size-control` map to `--control-h*` density tokens; shadcn opacity utilities resolve correctly in dark mode
- **Theme-aware scrollbar baseline** (`styles/scrollbar.css`) — global zero-specificity (`:where()`) thin themed scrollbars on every scrollable surface + opt-in `.ds-scrollbar` utility; **AG Grid subtrees (`.ag-root-wrapper`, `.ag-popup`) are exempt via `:not()` guards so grids keep NATIVE composited scrollbars** — any matching `::-webkit-scrollbar` rule forces Chromium's main-thread custom-scrollbar path, making thumb drags compete with streaming grid transactions (and the match can't be undone by overriding properties). Paired with `measureNativeScrollbarWidth()` in `@wellsfargo-starui/grid` (`MarketsGridSurface` passes AG `scrollbarWidth`): AG sizes its scroll gutters from a `document.body` probe that gets the STYLED scrollbar, so without the exempt-probe measurement the native thumb rendered clipped in a too-narrow gutter
- **@wellsfargo-starui/react shadcn primitives** — aligned to StarUI v1 density (30px controls, 2px radius, semibold tracking-tight chrome, `shadow-card`/`shadow-overlay`, `bg-background` form surfaces, buy/sell badge variants)

#### Semantic tokens

- `ColorScheme` interface — primary, surface, text, border, accent, trade, action, state, overlay, chart, sidebar, CVD groups
- `dark`, `light` (clinical), `lightPaper` (warm cream) schemes
- Component tokens — per-component theming overrides
- Control tokens — `ControlSize` and `ControlTier` for form-control variants

#### Theme runtime

- `applyTheme()` — **the ONE theme writer**: stamps `data-theme` / `data-ag-theme-mode` / `body.dataset.agThemeMode` / `data-variant` / `data-cvd` and persists the canonical `starui:theme` + sibling `starui:cvd` / `starui:variant` keys. Every other writer routes here — `BrowserRuntime.setTheme`, `OpenFinRuntime.setTheme` (incl. their inbound broadcast handlers), the dock toggle, and `initWorkspace`'s boot re-stamp — so a runtime/dock toggle can no longer leave `data-variant`/cvd stale (closed WORKLOG item 17). Callers preserve cvd/variant with `applyTheme({ ...getTheme(), theme })`
- `getTheme()` — read persisted theme with legacy key migration
- `./apply-theme` subpath — narrow entry exporting only `applyTheme`/`getTheme` (+ theme types); what the vanilla runtimes import so they don't drag the root barrel's ag-grid/primeuix adapter imports into non-bundled contexts
- `ThemeOptions` — `{ theme, cvd?, variant? }` shape; `variant`: `'clinical' | 'paper'` (light only; default `clinical`)
- DOM: `data-theme="dark|light"`, optional `data-variant="clinical|paper"`, optional `data-cvd="on"`
- Storage keys: `starui:theme` (canonical), `starui:cvd`, `starui:variant`, with `@wellsfargo-starui/theme` legacy migration

#### CSS generation

- `generateUnifiedCSS()` — emit CSS custom properties from semantic tokens (dark + clinical + paper blocks); also on `./shadcn` as `generateShadcnCSS` / `getShadcnTokens`
- Theme switching is DOM-attribute driven (`applyTheme()` sets `data-theme` / `data-variant` / `data-cvd`); WCAG contrast helpers live in `src/internal/wcag.ts` (not exported)

#### Framework adapters

- Tailwind preset — `darkMode: ['selector', '[data-theme="dark"]']`, HSL channel variables, surface scale 50–950, radius, font families
- shadcn adapter — Radix/shadcn color-name unification + `--st-*` STARUI bridge
- PrimeNG adapter — PrimeUI-compatible color mapping via `var(--ds-*)`
- AG Grid adapters — `dark`, `light`, `comfort`, `blotter` variants; STARUI token colors (JetBrains Mono headers/cells, Inter chrome, 2px radii, 12px cell padding)

#### AG Grid cell renderers

Vanilla TS classes implementing `ICellRendererComp` — framework-agnostic
(React + Angular), CSS-variable themed. Registered by string id in
`cellRendererRegistry.ts` and wired into AG Grid via
`gridOptions.components` (see `cellRendererComponents` map). The
column-customization band 10 ("Cell Renderer") in the React grid lets
end users pick any of these per column and author the config for the
configurable ones.

Zero-config built-ins:

- `SideCellRenderer` (id `side`) — Buy/Sell badges
- `StatusBadgeRenderer` (id `status-badge`) — Filled / Partial / Pending / Cancelled
- `ColoredValueRenderer` (id `colored-value`) — sign-coloured numbers
- `OasValueRenderer` (id `oas-value`) — threshold-driven (>80 = warning)
- `SignedValueRenderer` (id `signed-value`) — always-show `+/-` prefix
- `TickerCellRenderer` (id `ticker`) — bold cyan ticker symbols
- `RatingBadgeRenderer` (id `rating-badge`) — credit/risk rating badges
- `PnlValueRenderer` (id `pnl-value`) — P&L colouring + formatting
- `FilledAmountRenderer` (id `filled-amount`) — fill qty / % rendering
- `BookNameRenderer` (id `book-name`) — order-book identity
- `ChangeValueRenderer` (id `change-value`) — price/rate delta
- `YtdValueRenderer` (id `ytd-value`) — year-to-date performance
- `RfqStatusRenderer` (id `rfq-status`) — RFQ state

Configurable renderers (read `cellRendererParams` for user-authored
config; theme-aware via `ThemeAwareColor = { dark?, light? }` slots
with auto re-paint on `data-theme` change via `MutationObserver`):

- `PillCellRenderer` (id `pill`) — exact-string-match rules
  (value → bg / fg / border) with fallback style + pill/square shape
- `HeatmapCellRenderer` (id `heatmap`) — numeric value → 2- or 3-stop
  colour gradient, optional explicit domain
- `PercentBarCellRenderer` (id `percent-bar`) — proportional horizontal
  bar; `max` may be a literal or a sibling-field reference; optional
  percent/value overlay
- `TrendArrowCellRenderer` (id `trend-arrow`) — up/down/flat arrow with
  delta value, configurable threshold dead-band and decimals
- `SparklineCellRenderer` (id `sparkline`) — inline SVG line / area /
  bar chart from an array-of-numbers cell value
- `MultiLineCellRenderer` (id `multi-line`) — primary value + secondary
  text from a sibling field (configurable size + colour)
- `IconTextCellRenderer` (id `icon-text`) — leading or trailing icon
  (full SVG markup resolved at write time from
  `@wellsfargo-starui/design-system/icons/all-icons`) + cell text
- `CountryFlagCellRenderer` (id `country-flag`) — 2-letter ISO code →
  regional-indicator emoji flag + optional label
- `RatingDeltaCellRenderer` (id `rating-delta`) — credit-rating cell
  with up/down arrow vs. a previous-rating sibling field; configurable
  ordered scale (defaults to S&P)
- `TimeSinceCellRenderer` (id `time-since`) — auto-refreshing relative
  time ("5m ago"); refresh cadence + future-colour override
- `AllocationBarCellRenderer` (id `allocation-bar`) — stacked
  horizontal bar with key→colour map and optional legend

Per-renderer config types (`PillRendererConfig`,
`HeatmapRendererConfig`, …) plus the discriminated-union
`CellRendererConfig` envelope (`{ kind, config }`) live in
`cellRendererRegistry.ts` and are exported from the package root.

---

### 1.2 Icons (`@wellsfargo-starui/design-system/icons`)

**Path:** `packages/design-system/icons-svg`
**Purpose:** Framework-agnostic SVG icon catalogue (113 icons) for trading UIs.

**Public exports:**

- `./icons` — `ICON_PATHS`, `ICON_META`, helpers
- `./icons/react` — curated `lucide-react` re-exports + `DynamicIcon` (id → Lucide component)
- `./icons/angular` — `@lucide/angular` bindings: `LucideComponent`, `provideLucideIcons`, `provideLucideConfig`, `LUCIDE_ICONS`, `LUCIDE_CONFIG`, and per-icon standalone components (aliased to friendly names, e.g. `FileText`, `Home`)
- `./icons/all-icons` — `MARKET_ICON_SVGS`, `svgToDataUrl`, `marketIconToDataUrl`, named SVG constants, plus full icon-id enumeration
- `./icons/svg/*` — direct SVG file access

#### Catalogue (grouped by domain)

- **Trading (21):** bond, candlestick, coupon, credit-rating, duration, execute-trade, interest-rate, IPO, live-feed, market-depth, maturity, order-book, portfolio, position, price-alert, spread, stock, ticker, trade-ticket, watchlist, yield-curve
- **Blotters (18):** allocation-blotter, audit-blotter, block-trade-blotter, cash-blotter, commodities-blotter, derivatives-blotter, equity-blotter, execution-blotter, fi-blotter, fx-blotter, order-blotter, pending-blotter, pnl-blotter, position-blotter, rejected-blotter, risk-blotter, settlement-blotter, trade-blotter
- **Charts (6):** area-chart, bar-chart, blotter, heatmap, line-chart, waterfall
- **Risk (11):** compliance, counterparty, drawdown, exposure-map, hedging, limits, risk, risk-gauge, scenarios, stress-test, volatility
- **General (16):** alert, analytics, bank, calculator, clock, currency, dashboard, globe, market-data, notifications, percentage, P&L, reports, settings, trending-down, trending-up
- **System (8):** code, download, eye, moon, refresh, sun, upload, wrench
- **Trading actions (14):** buy, sell, execute, new-order, cancel-order, fill-report, options, futures, FX, crypto, equity, commodity, settlement, trades, algo
- **Extended risk (9):** exposure, VaR, loss, profit, take-profit, stop-loss, liquidity, greeks, positions
- **Extended general (6):** audit, export, filter, search, news, connectivity
- **Extended charts (3):** depth-chart, indicator, volume

#### Metadata APIs

- `ICON_PATHS` — id → SVG path map
- `ICON_META` — id → `{ name, category }`
- `ICON_NAMES` — ordered id list (`MarketIconName` keys)
- `ICON_CATEGORIES` — grouped by category
- `getIconsByCategory()` — category filter

#### SVG conventions

- 24×24 viewBox, `currentColor` strokes/fills, no hardcoded colour, framework-neutral.

---

## 2. React UI Controls

### 2.1 `@wellsfargo-starui/react`

**Path:** `packages/react-core/ui`
**Purpose:** shadcn/Radix React primitives themed via `@wellsfargo-starui/design-system`. Mandatory for any React UI in the monorepo (`<input>`/`<select>`/`<textarea>` forbidden — use these instead).

**Public exports:**

- `.` — all components except `Chart`
- `./chart` — lazy-loaded Recharts wrapper
- `./tailwind-config` — Tailwind preset to consume in app `tailwind.config`

#### Layout & containers

- `Accordion`, `AspectRatio`, `Card`, `Collapsible`, `ResizablePanelGroup`, `ResizablePanel`, `ResizableHandle`, `ScrollArea`, `Separator`, `Sheet`, `Tabs`

#### Navigation

- `Breadcrumb`, `DropdownMenu`, `Menubar`, `NavigationMenu`, `Pagination`, `ContextMenu`, `Command` (palette/combobox)

#### Forms & inputs

- `Button` (variants: default, outline, ghost, link, destructive)
- `ButtonGroup` — styled cluster wrapper (no built-in toggle API; use `ToggleGroup` for toggles)
- `Checkbox`, `Form` (`Form` aliases `FormProvider` from react-hook-form; exports `useFormField`, `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormDescription`, `FormMessage` — import `useForm` from `react-hook-form` directly)
- `Input`, `InputOTP`, `Label`, `RadioGroup`, `Select`, `Slider`, `Switch`, `Textarea`
- `Toggle`, `ToggleGroup`

#### Data display

- `Avatar`, `Badge`, `Calendar` (react-day-picker)
- `Carousel` (Embla)
- `Progress`, `Skeleton`, `Table` (semantic HTML rows/cells/headers/footers)
- `Chart` primitives (`ChartContainer`, `ChartTooltip`, `ChartLegend`, …) — import via `@wellsfargo-starui/react/chart` subpath (not re-exported from root, to avoid pulling recharts into every consumer)

#### Feedback & overlays

- `Alert`, `AlertDialog`, `Dialog`, `Drawer` (vaul), `HoverCard`, `Popover`, `Tooltip` (`TooltipProvider`, `TooltipTrigger`, `TooltipContent`)
- `Toast`, `Toaster`, `useToast` (Radix/sonner)
- `SonnerToaster` — sonner provider

#### Trading-specific composites

- `CollapsibleToolbar` — sectioned toolbar with collapse
- `ToolbarContainer` — toolbar layout wrapper
- `VirtualizedList` — virtualised scroller

#### Utilities & providers

- `cn()` — clsx + tailwind-merge classname helper
- `ThemeProvider` + `useTheme` — `next-themes` integration
- `PortalContainerProvider`, `usePortalContainer`, `useResolvedPortalContainer` — popout/OpenFin portal targeting

---

## 3. React Grid

### 3.1 `@wellsfargo-starui/grid`

**Path:** `packages/react-grid/grid`
**Purpose:** Merged MarketsGrid product surface — AG Grid-backed React grid with the full customizer (formatters, conditional styles, calculated columns, saved filters, templates) and profile management.

**Public exports:**

- `.` — `MarketsGrid` component, toolbars, storage helpers, types
- `./customizer` — the CURATED cross-package surface (was ~320 symbols at a 95.6%-internal ratio; now 14): `ExpressionEditor` (+ props/handle types), `isHistoricalToolbarDate`, and the 10 module STATE types demo seeds author against (`GeneralSettingsState`, `ColumnAssignment`, `ColumnCustomizationState`, `ConditionalRule`, `ConditionalStylingState`, `CalculatedColumnsState`, `VirtualColumnDef`, `ColumnGroupsState`, `ColumnGroupNode` from core; `SavedFiltersState` grid-local). The full former surface lives in `customizer/internal.ts` for in-package imports only — not reachable via any exports subpath
- `./styles.css` — widget stylesheet (barrel: `@import` of core + chrome splits)
- `./styles/core.css` — filter-pill tokens + toolbar button theme layer
- `./styles/chrome.css` — primary toolbar, filters row, banners, density pill layout
- `./runtime/openfin` — OpenFin popout helpers

#### Core grid

- `MarketsGrid` — main grid component (host integration, column defs, real-time rows)
- `MarketsGridCore` — grid platform + memo'd AG Grid surface only (no toolbar/settings/profile chrome); same pipeline as `MarketsGrid`
- `MarketsGridHandle` — imperative ref (grid API + platform methods, `exportVisualExcel`)
- `MarketsGridProps` — host context, storage factory, module overrides, callbacks;
  perf props: `sizeColumnsToFitOnReady` (default `false`), `includeAllStreamSafeFilters` (default `true`),
  `agGridModules` (optional subset registration; default full enterprise);
  streaming: keep `rowData` referentially stable and push live deltas via `applyTransactionAsync`;
  editing chrome: `showEditingToolbar` (tri-state — `true`/`false` are host
  verdicts, `undefined` defers to module switches), `showVisualExcelExport`,
  `headerExtras`, `toolbarDate` / `onToolbarDateChange`,
  `toolbarDateHistoryEnabled` (when `false`, only today is selectable)
- `DEFAULT_MODULES` — ordered customizer-module pipeline (full feature set)
- `gridSurfaceOptions` — AG Grid defaults, DOM options, row styling, cell renderers
- `GridDensityPill` — center-top primary-toolbar chip; Ultra / Compact / Comfortable presets (persists `gridDensity` + matching `rowHeight`/`headerHeight` in general-settings; `applyGridDensityLive` pushes heights immediately with row animation suppressed)
- `MarketsGridSurface` — memo'd AgGridReact boundary; `buildStreamSafeComponents` optionally omits date floating filter when unused; folds the effective `rowHeight`/`headerHeight` (host
  override or general-settings pipeline) into the theme via `theme.withParams`,
  keeping `--ag-row-height` in sync with the live row height so cell text stays
  vertically centered at any height (parameter-based; no CSS overrides)
- `LazySettingsSheet` — code-split settings drawer (loads `SettingsSheet` + `grid-chrome.css` on first open); public-barrel `SettingsSheet` export aliases this wrapper (same props/ref contract) so the inner sheet never lands in a consumer's main chunk
- `preloadSettingsSheet()` — warms the sheet chunk ahead of first open; `MarketsGridHost` calls it on idle, the ⋯ overflow menu on open, the inline settings button on pointer-enter
- `GeneralSettingsProvider` / `useGeneralSettingsFromContext` — single subscription for density/header-case reads
- `GridChromeProvider` / `useGridChromeState` — isolates frequently-changing toolbar UI state
- `buildGridContextMenuItems` — cell right-click menu builder; prepends **Settings** (opens the customizer on Column Settings with the right-clicked column pre-selected, via the controller's `openColumnSettings` + the settings sheet's `focusRequest` nonce) and **Remove from Grid** (hides the column via native `api.setColumnsVisible`, re-showable from the side bar's Columns panel and persisted on Save like any grid-state visibility change) ahead of AG Grid's stock items (Copy / Export / Auto-size …). Pure builder (params + handlers) wired through `MarketsGridHost` → `MarketsGridSurface` `getContextMenuItems`
- `useRestoreCellFocusOnWindowFocus` — alt-tab paste fix wired into `MarketsGridSurface`: re-asserts real browser focus on the cell AG Grid still reports as focused (`api.setFocusedCell`) when window refocus left DOM focus on `<body>`, so Ctrl+V/typing works without re-clicking. Triggers on BOTH the DOM window `focus` event and the parent OpenFin window's `focused` event (`subscribeParentWindowFocused` — covers the runtime never re-focusing the view, calling `focusCurrentOpenFinHost()` to reclaim web-contents focus first); retries at 0/150/400 ms (OpenFin can drop focus after the focus event); guarded by surface focusin/focusout ownership (multi-grid safe), a shared-localStorage last-focused-document stamp (multi-view fleet safe), never steals focus restored outside the grid, skips open cell editors
- `mergeDefaultColDef`, `gridOptionCompare`, `buildStreamSafeComponents` — reference-stable pipeline → surface wiring
- `useGridHost`, `useMarketsGridController` — imperative grid control hooks (internal to `MarketsGrid`; not on package `.` barrel)
- `useFilterModel` — filter-model persistence + mutation; per-pill counts use incremental `RowChangeBus` deltas on streaming ticks (full-grid recompute only on structural changes / cold mount)
- `useGridTheme` — resolves AG Grid theme from `data-theme`
- `ensureAgGridModules(modules?)` — one-shot AG Grid module registration (full `AllEnterpriseModule` by default, optional subset) + dev validations + the set-filter validate guard; on the package `.` barrel so embedded grids (provider editor Columns/AppData tables) share it instead of forking their own registrar
- `grid-chrome.css` — container/toolbar layout

#### Server-side row model (SSRM)

- `MarketsGrid` `ssrm` prop (`{ provider, keyColumn?, cacheBlockSize? }`) — switches the inner surface to `rowModelType: 'serverSide'` while the host chrome (customizer, toolbars, profiles, settings) stays CSRM-identical. The AG Grid instance is created **once per provider** (surface keyed on `ssrm:${provider.id}` only): `keyColumn` is late-bound — it resolves after provider ready, `getRowId` is a stable function reading a ref (only the function is init-only), and a keyColumn change rebinds the datasource + tick binding in place with a full block purge instead of remounting the grid (no throwaway instance, one license-manager validation per load; React StrictMode still double-mounts in dev). Safe because no row can exist under the stale key: rows only load once the provider is ready, which is also what triggers the resolve and the purge. When `ssrm` is set, `rowData` is ignored. Its `MarketsGridSsrmProps` interface is **not** on the public barrel — consumers must inline the shape
- `MarketsGridSsrmSurface` — SSRM inner surface; composes datasource, tick binding and status bar. **Internal** — mounted by `MarketsGrid`, not on the public barrel
- `createSsrmDatasource()` — AG Grid `IServerSideDatasource` over an `ISsrmDataProvider` (`CreateSsrmDatasourceOptions`). Reports each loaded block to the worker as `{ blockKey, queryId, hasFilter }` so viewport interest accumulates per query instead of being replaced per block
- `bindSsrmTicks()` — routes provider tick events to `applyServerSideTransaction` (`BindSsrmTicksOptions`); also subscribes provider status and **purges all blocks on every transition into `ready`** — a broker restart/reconnect or a provider restart/refresh re-snapshots upstream, and since status fans to every session, every subscribed grid repopulates automatically with no page reload (the snapshot flush alone fires on the first streamed chunk and later chunks are interest-gated, so ready is the only complete-cache signal)
- SSRM wires CSRM's stale-data busy indicator: provider `error` after first `ready` sets `dataStale` on MarketsGrid (flashing `StaleDataBanner`, editing disabled), any recovery to `ready` clears it; cold-connect retries before first ready stay silent — tracked via a direct `provider.onStatus` subscription keyed on the provider (the wiring hook's `onStatus` receives display text, and its identity must stay stable or the wiring effect restarts the provider every render)
- SSRM grids get CSRM's full customizer DATA PROVIDER card (`SsrmMarketsGridContainer` supplies `ProviderGridHostApi` via `providerGridHost`): pick the LIVE and HISTORICAL providers from the catalog, toggle Live/Hist mode, set the historical as-of date, and run Refresh view / Reload from source / Edit provider — selection persists per gridId through the same `useGridLevelPersistence` grid-level row as CSRM (save-before-switch flushes customizer edits via `saveAll()`), the container rebinds `useSsrmDataProvider` to the chosen id (prop `providerId` is the default live provider, `defaultHistoricalProviderId` seeds the HISTORICAL slot), and historical reloads forward `{ asOfDate }` through `provider.restart`
- SSRM admin menu carries CSRM's refresh pair ahead of the data-infra actions — `refresh-view` ("Refresh view": `refreshServerSide({purge})` against the worker plane, no upstream I/O) and `reload-from-source` ("Reload from source": `provider.restart({__refresh})`, which refreshes every subscribed grid via the ready transition)
- `createSsrmStatusBar()` / `SsrmRowsStatusPanel` / `SsrmTotalRowsStatusPanel` / `SsrmFilteredRowsStatusPanel` / `SSRM_STATUS_CONTEXT_KEY` — AG Grid default-status-bar parity under SSRM (`SsrmStatusBarConfig`, `SsrmStatusBarContext`): total-and-filtered (left), total / filtered / native selected (center), native `agAggregationComponent` range aggregations (right). The three count panels call `provider.getStatusBar` (full worker-cache scan) with AG Grid's own markup/classes/labels, because the native count components only see the client row model; the aggregation panel is the built-in — the selected cell range is always loaded client-side. Refresh is tick-driven: after the initial load, each `provider.onSsrmTick` fires a load throttled to `refreshThrottleMs` (leading edge + at most one trailing per window, default 150 ms — a burst of ticks yields at most 2 loads), with a slow 2 s `setInterval` fallback for providers without ticks or a missed edge, replacing the old free-running `setInterval(load, refreshThrottleMs)` poll
- The customizer's Grid Options → STATUS BAR card fully applies to SSRM grids: `mapNativeStatusBarToSsrm()` maps the card's native panel selection onto the worker-backed SSRM panels (the three count components are replaced — same markup/labels, whole-cache numbers — while selected count, aggregation, and custom panels pass through with their align/order), SHOW STATUS BAR toggles work live in BOTH directions without a grid remount — the surface always gives AG Grid a status-bar container (empty panel list when off, since AG Grid only creates the container at init and keeps it when cleared at runtime) and drives the strip's visibility explicitly, so off truly hides the strip and re-enabling on a grid that booted with the bar off still works, and live card edits re-apply via the surface's own `setGridOption('statusBar', …)` push — a value is recorded as applied only when it actually reached a live grid api, with a catch-up push at gridReady, so selections that land while the grid is still initialising (profile hydration routinely beats grid init) are never silently dropped. `statusBar` joins `hostOverrideKeys` for every SSRM grid so `useGridHost`'s generic option sync can never overwrite the worker-backed panels with native ones; a `statusBar` passed as a host prop keeps its historical prepend-onto-the-pack behaviour
- `toSsrmExpressionRules()` — maps customizer calculated-column / conditional-style / alert expressions to worker rule payloads
- `useSsrmExpressionBridge()` — pushes those rules to the worker plane. Two lifecycle guarantees: it **never announces an empty rule set it has not first populated** (the plane is keyed per `providerId`, so a second grid mounting with no rules would otherwise wipe the first grid's calculated columns, styling and alerts), and it **re-pushes on provider recovery** — a restart disposes the plane and its rules while nothing in the hook's deps changes, so it subscribes to `onStatus` and re-sends on `loading`/`error` → `ready`
- `ssrmGetChildCount`, `ssrmCellStyle`, `ssrmAlertRowClass`, `ssrmEditable` — grid-option bindings backed by worker-evaluated expressions
- Quick filter routes into SSRM query state rather than AG Grid's client-side filter; the toolbar push triggers `refreshServerSide({ purge: true })`
- **Set-filter panels list the column's whole domain** — `withSsrmSetFilterValues` (applied by `MarketsGridSsrmSurface` to every filterable leaf column, header groups included) wires async `filterParams.values` to `provider.getSetFilterValues({ column })`, so the panel shows all distinct values in the worker cache rather than the loaded blocks; `refreshValuesOnOpen` re-fetches per open, and a failed worker call reports `[]` instead of breaking the panel
- **Filter-pill badges count the whole cache** — `computeSsrmFilterCounts` asks the worker for a zero-row block per pill (`startRow: 0, endRow: 0` → `rowCount` with nothing materialised), carrying the active quick filter; provided to `useFilterCounts` via `SsrmFilterCountsProvider` whenever `ssrm` is active, replacing the CSRM `forEachNode` scan that only sees loaded blocks. Applied pill filters and the quick filter already evaluated worker-side via `setFilterModel` / SSRM query state
- `SsrmMarketsGridContainer` host-shell props — `gridId` (defaults to `providerId`; keys stored grid state), `defaultColDef`, `onReady`, `onEditProvider` (routes the "Data Provider Editor" entry to a host popout instead of the inline dialog), `onOpenConfigBrowser`, `onRowIdFieldChange` (resolved key column), `onProviderReady` (live `ISsrmDataProvider`). Its data-infra menu is byte-for-byte `MarketsGridContainer`'s: the `data-provider-editor` admin action plus `config-browser` when wired — same ids, labels, icons, order. The "Edit provider" strip and status/row-count strip are opt-in (`showProviderEditor` / `showStatusStrip`, both default **false**) so hosted layouts match star-demo exactly; the inline editor dialog stays reachable from the admin action with the strip hidden. `historicalDateAppDataRef` is deliberately absent — CSRM's historical-date subsystem (AppData `asOfDate` + provider restart) has no SSRM counterpart yet
- **SSRM column inference** — when the provider config declares no `columnDefinitions` (createStarui drafts, hand-seeded rows), `SsrmMarketsGridContainer` samples one block (`provider.getRows({ startRow: 0, endRow: 50 })`) after ready and infers `ColDef`s via `@wellsfargo-starui/data` `inferFields`: `__`-prefixed internals and `object`/`array` fields are skipped, `cellDataType` maps from the inferred type, headers humanize the field name (`positionId` → `Position Id`). A declared list always wins (no sample fetch); inference resets on provider rebind. Previously an undeclared column list rendered a headerless, cell-less grid
- `useSsrmProviderDataWiring` coalesces the rows-received burst — the worker streams a large snapshot as hundreds of `onRowsReceived` batches; the hook now folds them into at most one `setLoadRowCount` per 100 ms window (trailing edge, timer cleared on unmount). One setState per batch used to trip React's nested-update ceiling ("Maximum update depth exceeded"), which could kill the app's React root and freeze every cell while ticks kept arriving

#### SSRM colour-link parity

- `GridLinkSelectionBuilder` may return a Promise — the publish path awaits it behind a monotonic sequence guard (a build resolving after a newer selection fired is discarded, never broadcast; a rejected build publishes nothing and the next selection retries). **Sync builders keep the exact pre-awaitable synchronous publish path**, so CSRM behaviour is unchanged
- `createSsrmSelectionContextBuilder({ provider, keyColumn, getQuickFilterText? })` — SSRM publish builder: leaf selections read loaded row data (CSRM-identical); a selected **group** resolves its leaf keys through the worker (`getSetFilterValues` with `groupKeys` = `node.getRoute()`, `rowGroupCols`, current filter + quick filter) since `allLeafChildren` is empty for unloaded descendants; **select-all** (`getServerSideSelectionState()` → `{ selectAll, toggledNodes }`, where `selectedNodes` is null under SSRM) fetches the whole current query's keys minus toggled-off rows. Broadcast wire shape is identical to CSRM's `criteria` map, uncapped by design
- `createRowIdSetFilterResolver(keyColumn)` — receives `mode: 'rowId'` broadcasts as a key-column set-filter model via `applyGridLinkContext` (merging with manual filters like `'fields'` mode) because SSRM never invokes `doesExternalFilterPass`; with no custom resolver the external-filter default is byte-for-byte the pre-existing CSRM behaviour
- `SetFilterValuesRequest` gains `groupKeys` / `rowGroupCols` (empty `groupKeys` with `rowGroupCols` = whole current query); `QueryEngine.getSetFilterValues` scopes by group path AND filter/quick-filter, reusing the per-query memoised filtered set

#### Storage & persistence

- `createMarketsGridLocalStorageStorage()` — browser localStorage adapter factory
- `isMarketsGridLocalStorageStorageFactory()` — type guard
- `StorageAdapter` — load/save profile + grid-level data contract (type from `@wellsfargo-starui/core`)
- `StorageAdapterFactory` / `StorageAdapterFactoryOpts` — runtime-injectable factory pattern (exported from `@wellsfargo-starui/grid` types)

#### Grid event system (public on `.` barrel)

- `MARKETS_GRID_EVENT_CATALOG`, `isMarketsGridEventId`, `marketsGridEventCatalogByCategory` — typed event-id catalogue for provider/toolbar lifecycle hooks
- `createMarketsGridContainerEventBus`, `useMarketsGridEventBridge` — wire container events (`providerSwitched`, `toolbarDateChanged`, `providerDataStale`, …) to handler registries staged in Custom Settings

#### Toolbars

Most toolbar shells (`PrimaryToolbar`, `EditingToolbar`, `QuickSearch`, …) are composed inside `MarketsGrid` and are **not** on the package `.` barrel. Public toolbar exports: `FiltersToolbar`, `FormattingToolbar`, `DraggableFloat`, `SettingsSheet`, `ProfileSelector`, `HelpPanel`.

- `PrimaryToolbar` — actions, admin, export/import, Visual Excel spreadsheet export; center-top `GridDensityPill` (Ultra / Compact / Comfortable spacing presets via AG Grid `theme.withParams` + general-settings persistence)
  settings sheet toggle, always-visible inline editable caption (bound two-way to the OpenFin tab name via `useViewTabTitle`); the four view tools (Columns, Auto Format, Formatting toolbar, Editing toolbar) are consolidated into a single `ViewMenu` (`SlidersHorizontal` trigger) in the right cluster to keep the toolbar uncluttered;
  secondary actions in ⋯ overflow menu by default (`toolbarActionsLayout`: `overflow` | `inline`); shadcn `ToolbarDatePicker` on the right edge (always rendered; defaults to today; `historyEnabled` gates past dates)
- `ViewMenu` — single primary-toolbar dropdown (`toolbar-view-menu-trigger`) consolidating the grid's view tools so the toolbar stays calm: **Columns…** (opens `ColumnSelectorDialog`), **Auto Format** (action), then **Formatting toolbar** / **Editing toolbar** checkbox toggles reflecting their open state. **Columns…** is always available; the other items are gated by their feature flags (`showAutoFormat` / `showFormattingToolbar` / `showEditingToolbar`). Test-ids match the former standalone buttons (`column-selector-open`, `auto-format-btn`, `style-toolbar-toggle`, `editing-toolbar-toggle`) so they stay addressable inside the menu. shadcn `DropdownMenu` + tokens (light/dark safe)
- `ColumnSelectorDialog` — opened from the `ViewMenu` **Columns…** item (always available); a shadcn `Dialog` with two searchable lists — **Available** (hidden columns) and **Visible** (shown columns). Transfer buttons (add/remove selected + add-all/remove-all, honouring the active search) and double-click move columns between lists; multi-select via click / Cmd-Ctrl-toggle / Shift-range; the Visible list is dnd-kit sortable (single or multi-selected rows drag together; reorder disabled while a search filter narrows the list). **Apply** reorders the live grid via `api.applyColumnState({ applyOrder: true })` to `[...visible, ...available]` with available columns hidden — so the customizer's Column Settings list reflects the same order (it reads `api.getColumns()`); persistence rides the normal Save (grid-state). Pure logic in `columnSelectorModel` (unit-tested); AG-Grid glue isolated in `gridColumnAdapter`; 100% shadcn primitives + design-system tokens (light/dark safe). `colDef.lockVisible` columns stay visible and can't be removed
- `QuickSearch` — primary-toolbar search icon that expands into a compact field on hover/focus (or click-to-pin via `data-open`) and drives AG-Grid's quick filter across all columns (`setGridOption('quickFilterText')`); self-contained (reaches `GridApi` via `useGridApi`, like `AlertsBadge`); Escape clears + collapses, an inline ✕ clears, and an active term keeps the field open and lights the icon (`data-has-text`)
- `AutoFormatButton` / `useAutoFormatAction` — "Auto Format" lives in the `ViewMenu` (gated via `PrimaryToolbar.showAutoFormat`, defaulted to `showFormattingToolbar`); the action is the reusable `useAutoFormatAction()` hook (`{ run, confirmed, available }`), with `AutoFormatButton` a thin standalone wrapper around it. Reads every grid column, resolves a plan from `FIELD_FORMAT_CATALOG` via `buildAutoFormatPlan`, and applies **native formatting only** — number/date value formatters, sign-coloured P&L/change via `excelFormat` `[Green]`/`[Red]` tags, right-alignment for numerics, localised dates, centred categoricals, and bold tickers — in one profile-persisted update via `applyAutoFormatPlanReducer`. No opaque cell renderers, so every auto-applied aspect is fully editable from the formatter toolbar and round-trips through profile persistence. **Overwrite mode** (`onlyUnstyled: false`): re-applies the catalog to every matched column, replacing prior formatting and clearing any prior `cellRendererId`/`cellRendererConfig`; the user then overrides individual columns afterward in the formatter toolbar (manual edits win until Auto Format is clicked again). The reducer leaves catalog-unowned fields (colours/borders/header rename, and any typography the catalog doesn't set) intact. `applyFormatterReducer` (the formatter toolbar's format picker) also clears any `cellRendererId`/`cellRendererConfig` when it writes a per-column template, so a manual format applied over a renderer column shows instead of being painted over. Self-contained (optional platform + module store); flashes a check on apply
- `FiltersToolbar` — quick filter, saved filter recall, server-side expression
  (shadcn `ChromeButton` / `Input` / `Textarea` controls)
- `FormattingToolbar` — cell/header styling, conditional formats, value formatters (with popout); horizontal strip is a **compact single row** — fixed lead (target/scope toggles + column caption), caption-free formatting segments (font/emphasis · number · align · Borders ⌄ · Column ⌄) separated by hairlines, then Templates ⌄, undo/redo, and clear pinned right as the row's last buttons, and a fixed trail (⋯ · popout · ✕); section labels and the scope readout render only where they don't cost row width (the ⋯ menu and the popped-out panel respectively). The **Column ⌄** dropdown batches per-column config (cell editor + values source, filter kind, floating-filter toggle, editable lock); Borders ⌄ opens the per-edge border editor; Templates ⌄ opens the template manager. Segments that don't fit the current width collapse — the tail (Templates, undo/redo, clear) first so the formatting sections keep the toolbar, then Column ← Borders ← ALIGN ← NUMBER ← FONT (`toolbarOverflow.ts` `computeHiddenSegments` + ResizeObserver hook) — into a sleek fixed-width **⋯ overflow menu** (right-aligned, ~282px) that renders the same segment components stacked under their labels (never wraps, never clips). The trailing **✕** (`formatting-close`, rendered when the host passes `FormattingToolbarProps.onClose`) hides the toolbar via the same toggle as the View menu. Toolbar and popped-out vertical panel compose the same exported clusters (`TypeEmphasisCluster`, `AlignCluster`, `FontSizeSelect`, `ColorCluster`, `BordersControl`, `FormatCluster`, `EditorFilterCluster`, `TemplatesControl`, `TargetScopeCluster`, `ColumnCaptionCluster`, `EditableToggle`, `GridTogglesCluster`, `HistoryCluster`) so behaviour cannot drift between surfaces
  formatter pills use shadcn `Button` via `Pill` / `PillButton`; enum pickers use shadcn `Select` via `ToolbarSelect`; groups stay flat (no enclosing boxes around control clusters)
- `EditingToolbar` — unified editing row (history undo/redo, Smart Edit ops, Bulk Update apply, keyboard hints dropdown); primary-row pencil toggle (`editing-toolbar-toggle`); row visibility via `useEditingToolbarVisible` (host `showEditingToolbar` tri-state; `undefined` auto-shows when any toolbar-bearing module switch is on), segments gated by module `settings.enabled`; `editingToolbar.css` + shadcn ghost pills aligned with formatter toolbar (labeled clusters, hairline separators, no boxed button groups)
- `EditingToolbarKeyboardMenu` — read-only dropdown listing active plus/minus nudges and letter shortcuts (keys handled by module runtime, not the menu)
- `SmartEditToolbarBody` — operand input, op buttons (× ÷ + −), **Set…** dialog, preview confirm/cancel
- `BulkUpdateToolbarBody` — text input for custom values, optional distinct-value picker (fills input), check-icon apply control
- `EditHistoryToolbarBody` — global undo/redo + stack entry count
- `SmartEditToolbar` — legacy standalone toolbar export (superseded by `EditingToolbar` segment)
- `providerGridHost` prop — optional runtime API for data-provider controls in the grid customizer → Custom Settings panel (`MarketsGridContainer` wires live/historical pickers, refresh, reload, edit)
- `AdminActionButtons` — admin grid operations (shadcn `ChromeButton`)
- `GridInfoButton` — grid identity popover trigger (`ChromeButton`)
- `PrimaryToolbarOverflowMenu` / `PrimaryToolbarInlineActions` — secondary toolbar actions (`ChromeButton` triggers); overflow ⋯ menu includes dark/light theme toggle (`applyTheme` + `useActiveThemeMode`) and grid info

#### Profile management UI

- `ProfileSelector` — switch/create/rename/delete profiles
- `TemplateManager` — column-template library (save/apply/manage). Compact (toolbar popover) variant is a scrolling row list; **panel (popped-out) variant is a shadcn `Select`** (pick = apply) + an action cluster (update / rename / delete) for the chosen template, so the Templates section stays a fixed-height control as templates accumulate instead of growing
- `UnsavedSwitchDialog` — guard for dirty profile switch
- `SettingsSheet` — shadcn right-rail `Drawer` host for all customizer modules;
  opens on **Grid Options** (`general-settings`) by default; module navigation
  is a grouped shadcn **Menubar** (`SettingsModuleMenubar`): five stable
  categories (Options / Columns / Styling / Editing / Data) each opening a
  menu of module items — membership is each module's own `Module.category`
  field — plus a trailing More menu for modules with no/unknown category
  (host-registered custom modules) and an active-module breadcrumb
  (`GROUP ▸ MODULE`) on the bar's right edge — the bar never overflows
  regardless of module count; menus portal above the drawer
  via `.ds-settings-module-popover` / `.ds-sheet-v2` z-index in `grid-chrome.css`;
  flat `SettingsPanel` modules (Grid Options) fill the editor pane without an
  outer `ds-editor-scroll` so the band sidebar stays fixed while only the
  right-hand fields scroll; two-phase open — chrome + structural wrappers
  commit first so the drawer slide-in starts immediately, the active module
  panel mounts one deferred render behind (`useDeferredValue(open, false)`;
  popped OS-window mode bypasses the gate); the vaul `Drawer` root stays
  mounted with controlled `open` so closes play the slide-out animation and
  sheet-local state (active module, per-module selection) survives reopen
- Grid Options bands mount progressively — first commit mounts only the
  first 3 bands (≈ one viewport), the rest fill in one-per-`requestIdleCallback`
  slice (200ms timeout cap) so the heavy ~93-control mount never lands inside
  the drawer slide-in animation; sidebar nav clicks force-mount their target
  band, an active search filter mounts all matching bands, and environments
  without `requestIdleCallback` (jsdom) mount everything up front; unmounted
  bands hold a fixed-height placeholder and mounted off-screen bands still
  use `content-visibility: auto` to skip paint work
- `DEFAULT AGG` select (Pivot · Totals · Aggregation band) maps to AG-Grid's
  `defaultColDef.defaultAggFunc` — the agg function pre-selected when a column
  is dragged into the values panel (built-ins `sum`/`avg`/`min`/`max`/`count`/
  `first`/`last`); unlike `aggFunc` it does **not** force columns to aggregate
- Default profile (`INITIAL_GENERAL_SETTINGS`) ships aggregation-ready: pivot
  panel `always`, grand-total `pinnedBottom`, group-total `bottom`,
  `suppressAggFuncInHeader`, `enablePivot`/`enableValue` on, `defaultAggFunc`
  `sum`, plus `floatingFilter` + `autoHeaderHeight` on the default ColDef and
  cell-change-flash on in `emerald`
- `MAX UPDATES / SEC` (Performance band, `maxGridUpdatesPerSecond`, schemaVersion 6)
  — caps grid refresh flushes per second by mapping to AG-Grid
  `asyncTransactionWaitMillis` (default **5/sec** → 200 ms batching window;
  `0` = uncapped/flush-ASAP). Streaming ticks accumulate between flushes and
  land with final values, so cell-change flash fires once per flush; the
  option is pipeline-owned (no longer fixed at the `MarketsGridSurface` level)
  and live-editable — the bound on per-window grid work for multi-blotter
  fleets on one machine

#### Help, status & overlays

- `HelpPanel` — sections for Overview, Expressions, Excel, Trading, Traffic-light, Emoji
- `GridInfoButton` — contextual help popover trigger
- `DraggableFloat` — draggable/resizable popout (used by FormattingToolbar)
- `EditableCaption` — inline-editable grid title
- `StaleDataBanner` — data-staleness indicator (real-time disconnect / asOfDate)

#### Floating filters (toolbar)

- `StreamSafeTextFloatingFilter` — base floating-filter bridge (`streamSafeFloatingFilter.ts`)
- `StreamSafeNumberFloatingFilter` — number variant
- `StreamSafeDateFloatingFilter` — date-range variant with calendar; smart parsing of ISO/slash/dot/month-name/quarter/epoch dates, comparator + relative keyword (`>= today`, `< yesterday`), and relative trailing windows (`last 10 minutes`, `last six months`, `last year`). `parseDateExpression(input, locale, now)` exported for testing.
- `filtersToolbarLogic` — filter parsing + AG Grid model translation
- `installAgGridSetFilterValidateGuard()` — set-filter dataset-size guard

#### Formatting pipeline

- `FormatterToolbar` / `FormatterPanel` — formatting orchestrator (toolbar or panel orientation; composed by `FormattingToolbar`)
- `ModuleType` — data-type picker (number, date, duration, currency, percentage, …)
- `ModuleFormat` — quick number-format controls: currency select (full-opacity tinted `$` affordance), %, thousands, **decimals ± with a live precision readout** (`fmt-decimals-readout` shows the current decimal count via `templateDecimals`), tick select (`1/32` glyph + "Tick" label), and the `FormatterPicker`
- `FormatterPicker` — value-format selector. Compact (toolbar) presentation is a **vertical shadcn `Tabs` rail** grouping presets by category, showing only the categories that fit the column's data type (`categoriesForDataType`) plus an always-on **Custom** tab; each preset row renders a **live sample** from the real cell value, and the Custom tab folds the Excel-format input + full reference examples inline (no nested popover). A **search box** (`filterPresets`) flattens the tabs into a matching result list across label / hint / format code. Inline (editor) presentation unchanged. Picking a preset / swatch dismisses the popover (discrete-commit close)
- `formatCategories` — `FormatCategory` union, `CATEGORY_LABELS`, `categoriesForDataType()` (data-type → ordered rail categories; `custom` appended by the UI)
- `presetsForDataType` exports — `ALL_PRESETS` (master catalog, each preset tagged with a `category`), `presetsForCategory()`, `presetsForDataType()`, `findMatchingPreset()`, `defaultSampleValue()`. Catalog now includes promoted formats (no-thousands, red-only, directional ▲▼ conditional, thresholds, prefix text) and an expanded **Text** category (UPPERCASE / lowercase / Title Case / camelCase / Capitalize / Trim / prefix / suffix)
- `ModulePaint` — cell background/text colour editor
- `ModuleLibrary` — preset library, add-to-library, delete
- `ModuleEditorFilter` — column-target picker
- `ModuleContext` — applied-column summary + copy-to-all; hosts the `FormatReadout` (`scopeSummary`) — a plain-language status line stating target + scope ("Cells · 3 columns") with a live value sample, doubling as the empty-state invitation ("Select a column to format"). Renders in both toolbar and popout
- `FormatReadout` / `scopeSummary` — turns `(target, scope, selection)` into words + a live sample; empty-state guidance when nothing is selected
- `ModuleClear` — clear selected / clear-all formatting; fires immediately (no confirm dialog), flashes a check on success, reversible via undo/redo. **Clear ALL also wipes the four grid-wide `global*` style/formatter fields** the toolbar's scope=All writes (previously they survived, so a scope=All paint was unclearable once the session's undo stack was gone)
- `formatterPresets` — built-in numeric, date, currency, % presets; traffic-light / emoji patterns documented in `HelpPanel` and authored via Excel value-format strings in conditional styling
- `formattingToolbarHooks` — `useFormatter` state + actions; `resolveToolbarPickerDataType()` maps `dateString` / `dateTimeString` (and `date` columns whose sample values include time) to datetime FormatterPicker presets so **Date + time** tiles (ISO with time, US short) appear in the toolbar

#### Column-styling ownership matrix (the ONE write-surface reference)

Every styling writer lands in the SAME `column-customization` module state
(`ColumnCustomizationState.assignments[colId]` + four `global*` root fields)
— there is no parallel copy. **Column Settings is the authority; the
formatting toolbar is a shortcut writing identical state.** Who writes what:

| Writer | Mechanism | Fields written |
|---|---|---|
| **Column Settings panel** (`ColumnSettingsPanel`, authority) | draft + explicit Save (`useModuleDraft`, DirtyBus) | `assignments[colId].*` — headerName, tooltip, layout (width/pin/hide/sort/resize), `templateIds` (appends), `cellStyleOverrides` / `headerStyleOverrides` (per active theme), `valueFormatterTemplate`, filter, rowGrouping, cellEditor, cellRenderer |
| **Formatting toolbar** (`useFormatterActions`) | immediate write + its own undo/redo stack, via the pure reducer bank (`formattingActions.ts`) | same assignment fields via `apply*Reducer`s, plus the four toolbar-only `global*` root fields (scope = All; cleared again by Clear ALL); `templateIds` (replaces), `doFormat` clears `cellRendererId`/`cellRendererConfig`, `setCellEditorKind` force-sets `editable: true`; also sole writer of `general-settings.headerCaseUppercase` / `showCellTooltips` |
| **Auto Format** (`useAutoFormatAction`) | one-shot `setModuleState` (`applyAutoFormatPlanReducer`) — bypasses both histories | `valueFormatterTemplate`, `headerName`, both-theme alignment/typography; clears `cellRendererId`/`cellRendererConfig` on matched columns |
| **Provider editor ColumnsTab** | `TransportConfig.columnDefinitions` (base colDefs — a lower-precedence LAYER, not module state) | UI: field names / `headerName` / `cellDataType` / `valueGetter` / order only. JSON-import additionally accepts width / valueFormatter / cellRenderer / filter / sortable / resizable / hide — kept for existing exported configs; the column-customization transform overrides all of it |
| **Templates** (`column-templates`) | authored ONLY from the formatting toolbar (`useFormatterTemplates`); no panel | own `templates` map (same styling field names, layered in via `assignments[colId].templateIds`). `typeDefaults` has a tested resolve path but no UI writer today |
| **Conditional styling** | own rules (`cellClassRules`, per-cell wins on match) | `ConditionalRule.style` / `flash` / `indicator` + a per-rule `valueFormatterTemplate` (same union as the assignment's — the one deliberate second formatter authority, scoped to matching cells) |
| **Calculated columns** | own `virtualColumns` defs | per-virtual-column `valueFormatterTemplate` + initial layout; the transform layers `assignments[virtualColId]` on top, assignment formatter wins |
| **grid-state** | explicit Save capture of live AG state | column width / order / pinned / visibility (replayed after all structure modules) |

Known semantic divergences between the two primary writers (documented,
deliberate): toolbar `templateIds` **replaces** while the panel **appends**;
toolbar `doFormat` clears an existing cell renderer while the panel's
ValueFormatBand leaves it; toolbar `setCellEditorKind` force-enables
`editable`; the toolbar has target (cell/header) + scope (selected/all)
tri-states the panel lacks — the four `global*` fields are toolbar-only.

#### Customizer modules (under `./customizer`)

- **General settings** — grid behaviour toggles; defaults `animateRows: false` and
  `debounceVerticalScrollbar: true` for streaming-friendly grids; row selection maps to AG Grid 35
  `RowSelectionOptions` (`singleRow` / `multiRow`; checkbox column optional — when
  off, click-to-select with no selection column); **Default ColDef** band includes
  flash-on-change with theme-aware colour swatches (shown when enabled)
- **Column templates** — reusable column-state bundles
- **Column customization** — 10 bands per column: Header, Layout,
  Templates, Cell Style, Header Style, Value Format, Filter,
  Row Grouping, Cell Editor, **Cell Renderer** (band 10 — picks any
  registered renderer from `@wellsfargo-starui/design-system/cell-renderers-registry`
  and authors its per-renderer config)
- **Conditional styling** — themed style rules (dark/light); per-rule bands for cell/row style, **flash on match** (`FlashConfig` — colour/mode/duration), **indicator** badge (`RuleIndicator`), value formatter, and **animate value** (`AnimationConfig` — `spin` / `spin-reverse` / `pulse`, cell-scope only). Animate spins the matching cell's value glyph via CSS keyframes scoped to `.ag-cell-value` (shipped once as `ds-anim-*`), e.g. an Excel value format maps `1 → 🔄` and a `value = 1` rule spins it — the no-code "in progress" spinner. Header flash/indicator painting (`headerPainter`, `hasHeaderPaintRules`) skips row scans when no header-targeted rules are enabled and is not invoked on live ticks unless header paint rules exist
- **Visual Excel** — WYSIWYG `.xlsx` export preserving display formatters and
  conditional style-rule colours. Engine: `buildVisualExcelStyles`,
  `applyFormatExcelClasses`, `exportVisualExcel` (via `api.exportDataAsExcel` +
  `processCellCallback`). Primary toolbar spreadsheet icon when enabled.
  Settings panel: **Visual Excel**. Lab: **Visual Excel** tab (`lab-visual-excel-v1`).
- **Editing family (overview)** — ONE merged **`editing`** module (id
  `editing`, `EditingState` slices `smartEdit` / `bulkUpdate` / `plusMinus` /
  `shortcuts`) plus the separate `data-change-history` module, sharing a
  cell-patch journal (`EditJournal` in `@wellsfargo-starui/core`). One keyboard
  runtime (`activateEditing`) arbitrates `+`/`-` (plus-minus owns the keys when
  enabled, smart-edit's global step otherwise) and letter shortcuts. One
  settings entry: the **Editing** panel with Smart Edit / Bulk Update /
  Plus / Minus / Shortcuts section tabs. React slice hook: `useEditingSlice`.
  Persistence: one `editing` envelope; profiles saved before the merge (four
  envelopes under the legacy ids `smart-edit` / `bulk-update` / `plus-minus` /
  `shortcuts`) keep loading via the module's `legacyIds` + `migrateLegacy`
  seam on `GridPlatform.deserializeAll` — version-tolerant, so lab profiles
  stamped `v: 1` for smart-edit (previously dropped at load) now load too.
  React wiring: `recordEdit.ts` (`resolveEditRecording`), `useEditJournal`,
  `journalUndoRedo`, `journalApplyGuard`, `editJournalScope`. Unified
  **`EditingToolbar`** row composes edit-history, smart-edit, and bulk-update
  segments plus `EditingToolbarKeyboardMenu` hints; plus/minus and shortcuts
  are keyboard-only (no toolbar segment). Host opt-in: `showEditingToolbar`.
  Default module pipeline order in `DEFAULT_MODULES`: … → editing →
  data-change-history → alerts → … → grid-state (last). E2e: Playwright
  specs (`e2e/v2-editing-family.spec.ts`, `v2-editing`, `v2-smart-edit`,
  `v2-bulk-update`, `v2-edit-history`, `v2-plus-minus`, `v2-shortcuts`);
  shared helpers in `e2e/helpers/labEditing.ts` and `e2e/helpers/editingToolbar.ts`.
- **Smart Edit** — bulk update, arithmetic across cell selections (× ÷ + −),
  toolbar **Set…** dialog, +/- keyboard increment, and K/M/B magnitude shortcuts
  via `valueParser` on editable numeric columns. Single-column guard, optional
  preview-before-apply, and cell-patch journal recording for undo (via shared
  `EditJournal`). Framework-agnostic ops in `@wellsfargo-starui/core`; React slice +
  `SmartEditToolbarBody` in `@wellsfargo-starui/grid`. Settings: **Editing**
  panel, Smart Edit section.
  Lab: unified **Editing** tab (`lab-editing`, 12 profiles); focused Smart Edit
  profiles under `public/lab-profiles/smart-edit/`.
- **Edit History** — session-scoped undo/redo journal consumed by all editing
  modules. Monitor panel lists entries (time, source, label, cell count) with
  per-entry undo in a fixed-height virtualized scroll rail pinned to the bottom
  of the settings sheet (cascade-undoes that entry and all newer edits; Undo
  disabled for entries already reversed via toolbar); `EditHistoryToolbarBody`
  exposes global Undo/Redo and an undo-stack entry count (decrements on toolbar
  or monitor undo, increments on redo).
  Settings: suspend recording, max stack depth, unify undo (disables AG Grid
  `undoRedoCellEditing`), per-source record toggles (cell editor on by default).
  In-cell edits are journaled via wrapped `valueSetter` on editable columns (AG Grid
  35 may omit `cellValueChanged` on inline commit); `cellValueChanged` remains a
  fallback listener when the event fires.
  Settings panel: **Edit History**. Lab: **Editing** tab (`lab-editing`);
  Smart Edit–only history demo in `public/lab-profiles/smart-edit/se-04-history.json`.
- **Bulk Update** — replace all selected cells in one column with the same
  value (text, number, date). Distinct-value dropdown, confirm threshold,
  single-column guard, journal integration. Settings: **Editing** panel,
  Bulk Update section.
  Lab: **Bulk Update** tab (`lab-bulk-update`) and unified **Editing** tab.
- **Plus / Minus** — keyboard +/- nudge rules with per-column increment/decrement
  steps and optional expression gates. Takes over +/- keys from Smart Edit when
  enabled; `suppressKeyboardEvent` on editable numeric columns prevents inline
  edit from consuming +/- keys. Keyboard only — no toolbar segment. Journal
  integration via `recordHistory`. Settings: **Editing** panel,
  Plus / Minus section.
  Lab: **Plus / Minus** tab (`lab-plus-minus`).
- **Shortcuts** — letter-key arithmetic (× ÷ + −) with per-shortcut operand and
  column scope. Distinct from Smart Edit K/M/B magnitude parsing in the cell editor.
  Keyboard only — no toolbar segment. Journal integration via `recordHistory`.
  Settings: **Editing** panel, Shortcuts section. Lab: **Shortcuts** tab
  (`lab-shortcuts`).
- **Alerts** — expression-driven notifications (dataChange / relativeChange /
  rowChange triggers) with toast, toolbar bell badge, and OpenFin Notification
  Centre channels. Runtime evaluates on `cellValueChanged` and on
  `modelUpdated` / `rowDataUpdated` cell diffs (host `rowData` streams).
  Customizer editor: collapsible **Global settings** band in a two-column
  layout (Alerts + Frequency | Channels + History) plus per-rule editor with
  fixed RESET/SAVE header (`ds-editor-header`) and scrollable rule body.
  Per-rule editor uses `useModuleDraft` and reuses the shared `ExpressionBand`
  / Monaco editor for `dataChange` triggers. OpenFin channel auto-detects
  `window.fin` and dynamic-imports `@openfin/workspace/notifications` so
  non-OpenFin apps pay zero runtime cost. `AlertsBadge` mounts in
  `PrimaryToolbar` (shadcn `Popover` + `ScrollArea`; history list scrolls
  with theme-aware dividers/scrollbar via `ds-sheet-v2`); `useAlertsToastBridge` + `useAlertsOpenFinBridge`
  auto-wire when the badge is present. Demo: `the apps repo `source/markets-grid-lab``
  (`npm run dev:markets-grid-lab`) — Overview, Conditional Styling, Calculated Columns,
  Formatting, Column Groups, Quick Filters (saved filter pills + `FiltersToolbar`),
  Live Updates, Alerts, **Visual Excel** (styled `.xlsx` export), **Editing** (Smart Edit + Bulk Update + Plus/Minus + Shortcuts +
  History), Bulk Update, Plus / Minus, Shortcuts, Cell Renderers, and Formatter Toolbar tabs. Each feature tab ships multiple toolbar profiles (catalogs in
  `the apps repo `source/markets-grid-lab`/src/profiles/catalogs/`, importable JSON under
  `the apps repo `source/markets-grid-lab`/public/lab-profiles/`). **Demo console** right rail
  (`LabScenarioRail`, `LabDemoProvider`, `useLabRows`) injects scenario patches
  (bid spike, P&L loss, mid ticks, OAS heat, etc.) and shared stream controls
  (pause/play, tick interval) across all grid tabs;   mock ticks use
  `applyTransactionAsync` after the initial snapshot (not per-tick `rowData`
  swaps) via `useMockStream` / `applyLabStreamDelta`; scenario overlays apply
  sparse field patches per tick and `clearScenario` forces a provider refresh;
  feature tabs share `LabFeatureTab` + `labFeatureConfigs` with lazy-loaded tab
  chunks in `App.tsx`; parity doc:
  `docs/MARKETSGRID_VS_ADAPTABLE_GAP_ANALYSIS.md` §2.
- **Column groups** — nested column-group headers with border/style overlays (`composeGroups`, `groupHeaderBorderOverlayCSS`)
- **Toolbar date settings** (`toolbar-date-settings`) — Custom Settings panel for toolbar date, data-provider pickers, event-callback bindings, and row-exclusion expression (wired via `providerGridHost` / `gridEventBindingsHost` from `MarketsGridContainer`)
- **Calculated columns** — virtual cols from expressions
- **Saved filters** — named filter-model presets
- **Toolbar visibility** — show/hide toolbar items
- **Grid state** — serialise/restore AG Grid state

---

## 4. React Core

### 4.1 `@wellsfargo-starui/grid/widgets`

**Path:** `packages/react-grid/widgets-react`
**Purpose:** MarketsUI React widgets — v2 blotter framework, hosted grid containers, data-provider editor. Collapsed into `@wellsfargo-starui/grid` (package-collapse sub-phase 4).

**Public exports:**

- `./widgets` — `StarGrid` (the one front-door grid), `MarketsGridContainer` + `DatePicker` (+ `ProviderSelection`/`ProviderMode` types; the dedicated subpath was removed), the SSRM container, hooks, provider, theme. Note: the `{ theme }`-wrapper `useAgGridTheme` left this barrel — the PUBLIC `useAgGridTheme` is the hosted variant (`./widgets/hosted`, mode → `Theme`); two same-name exports with incompatible signatures in one package was a documented footgun
- `./widgets/provider-editor` — `DataProviderEditor`, `EditorForm`, `useProviderProbe`, `cloneProviderConfig`, `exportProviderConfig`, `parseProviderConfigImport`
- `./widgets/hosted` — `useHostedStarui` + the à-la-carte hosted hooks (identity, theme, linking, lifecycle)

#### StarGrid (one front door)

- `StarGrid` / `StarGridProps` — the single grid component for `createStarui()` apps: `{ gridId, providerId?, rowData?, columnDefs?, title?, fullBleed?, documentTitle?, contextLink?, onReady?, fallback?, advanced? }`. Identity (`appId`/`userId`/storage factory) comes from `useStaruiIdentity()` context (`createStarui()`'s provider or a `StaruiIdentityProvider`) — mounting outside one throws. **Mode is inferred, never chosen**: catalog row whose `providerType` ends in `-ssrm` → `SsrmMarketsGridContainer`; any other provider → `MarketsGridContainer`; no `providerId` + `rowData` → static `MarketsGrid`; neither → the CSRM container alone, provider picked at runtime through the customizer's DATA PROVIDER card (persisted per gridId — star-demo's blotter). While a named catalog row loads it renders `fallback`; a missing row renders a plain not-found message (catalogs hydrate asynchronously on cold starts). `fullBleed` pins the grid to the viewport (hosted-view style); `advanced` is the typed escape hatch for every other `MarketsGridProps` member. North-star proof: `apps/source/hello-blotter` (one `createStarui` call + one `<StarGrid>`, live SSRM in ~27 lines), e2e-guarded by `apps/e2e/hello-blotter.spec.ts`
- **Hosting is built into StarGrid** (absorbed from the hosted wrappers): `documentTitle` sets/restores the browser-tab title; grid state flushes via the toolbar-Save `saveAll()` path on `workspace-saving`, `beforeunload`/`pagehide`, OpenFin view `destroyed`, and unmount; the AG Grid theme defaults to the `[data-theme]`-reactive `useAgGridTheme('auto')` unless `advanced.theme` pins one; `fullBleed` also injects the hosted page reset (html/body margin 0 + overflow hidden) so the viewport can't collapse in OpenFin views; `contextLink` wires OpenFin colour-based grid linking with the SSRM defaults injected (worker-resolved group / select-all publishes, `mode: 'rowId'` received as key-column set-filter, interop transport preferred over FDC3; link identity prefers `advanced.instanceId` so two restored views of one grid don't self-filter) — the CSRM flavour lands with the star-demo migration. `contextLink` is **mode-aware**: the SSRM path injects the worker-backed defaults above; the CSRM path (HostedMarketsGrid parity) only fills `rowIdField` from the container's resolved key column(s) and lets `useGridContextLink`'s generic builder/resolver apply. CSRM grids also get the caption ↔ OpenFin tab-name binding (`useViewTabTitle`: seeds from `customData.savedTitle`, caption edits write back; plain local value outside OpenFin) and `tabsHidden`; `advanced.onCaptionChange` chains. `advanced.onReady` / `onRowIdFieldChange` / `onProviderReady` are chained, never clobbered. All three demo blotters mount StarGrid — star-demo (`/blotters/marketsgrid`, CSRM customizer-driven), star-demo-ssrm, stomp-marketsgrid-minimal (both modes); **`HostedSsrmMarketsGrid` is deleted** — its link/workspace-save behaviors and tests live on StarGrid (`StarGrid.link.test.tsx`). **both hosted wrappers are deleted** — dataprovider-editor's `HostedGridPanel` was the last consumer and now mounts StarGrid in its default fill frame (no fixed positioning, so the panel's old `translateZ` containing-block hack died with it)

#### Blotter framework (v2)

- `BlotterDependencies` — actions/data/state contract
- `useBlotterDI` — access injected dependencies
- `BlotterSlots` — extension points (header, toolbar, footer, etc.)

#### Data-provider container & editor

- `MarketsGridContainer` — grid + two-provider picker + mode toggle (`Alt+Shift+P` /
  grid-level provider persistence; provider pickers live in grid customizer → Custom Settings (`providerGridHost`)
- `MarketsGridContainer` — hub data via `useDataProvider` + `applyProviderToGrid` (no direct `client.subscribe` / cfg pass-through); optional `defaultLiveProviderId` for single-provider demos; live mode cold-starts STOMP immediately (hub attach dedupes concurrent windows); historical restore late-joins a running hub provider via `isProviderRunning` / `waitForProviderRunning` (≤2s) + `provider.start()` instead of `restartProvider` (avoids peer grid refresh and duplicate STOMP when several windows open at once)
- `useProviderDataWiring` — provider→grid hot path inside `MarketsGridContainer`; live ticks apply regardless of `document.hidden` — hidden/minimized blotters stay fully current (trading policy: window-local alerting + instant correctness on restore; the old hidden-pause + refresh-on-visible dormancy was removed; Chromium's own background timer throttling is left at platform defaults); on STOMP auto-reconnect (`error` → `ready`) clears the stale banner and triggers `provider.refresh()` so every blotter replays the hub cache without a manual Reload
- `MarketsGridContainer` — when an active provider id is chosen but `useDataProviderConfig` is still loading, renders a lightweight placeholder (no throwaway `MarketsGrid` / AG Grid shell); the `__no_provider__` shell path is unchanged when no provider is selected or cfg is loaded but missing key/columns
- `buildColumnDefs` — maps a provider's persisted `ColumnDefinition[]` to AG Grid `ColDef[]` for `MarketsGridContainer`. Per column: a `valueGetter` DSL expression compiles once (bounded FIFO cache) to a CSP-safe `@wellsfargo-starui/core` **compiled closure** (not per-cell AST walk); dotted `field` uses cached `getPathAccessor`; flat field stays on AG Grid's native path. Every column with no explicit `filter` defaults to the **Multi Filter** (`agMultiColumnFilter`): tab 1 is the `cellDataType`-appropriate filter (`number`→`agNumberColumnFilter`, `date`/`dateString`→`agDateColumnFilter`, else `agTextColumnFilter`), tab 2 is always `agSetColumnFilter`; a column that already declares its own `filter` is left untouched (FilterEditor / host choice wins). Expression getters never throw — parse errors fall back to the field binding, runtime errors to the field value (warn once per expression); reusable per-getter `EvaluationContext` avoids per-cell allocations under high-frequency updates. Soak: `npm run soak:value-getter` (`valueGetter.soak.test.ts`, `SOAK=1`) — sustained eval load + heap-delta guard. **Internal** — not on public barrel
- Custom Settings panel (`toolbar-date-settings` module) — four sections: Toolbar Date (historical date → AppData config), Data Provider (live/historical pickers, mode, as-of date) when `providerGridHost` is wired, Event Callbacks (event→handler bindings) when `gridEventBindingsHost` is wired, and Row Filter (row-exclusion expression). All settings are staged and applied only on the panel's explicit Save (Reset reverts); imperative actions (refresh/reload/edit) stay immediate
- Row exclusion — implemented in `@wellsfargo-starui/grid` `toolbar-date-settings` module (not widgets-react): multiline Monaco `ExpressionEditor` authors an EXCLUDE-when-true DSL predicate (column refs `[field]`, nested optional-chaining paths `[a.b.c]`, e.g. `[ccy] == "INR"`, `[active] == false`); keystrokes stage into the panel draft (applied on Save). `transformGridOptions` installs it as AG Grid's external filter (`isExternalFilterPresent` / `doesExternalFilterPass`) and the module's `activate` calls `api.onFilterChanged()` on cell edits, expression edits, and first ready. Rows are hidden, not removed — they reappear when the offending value changes; parse/eval failure excludes nothing (`rowExclusionFilter.ts`, fails open)
- `ProviderEditorDialog` — modal hosting `DataProviderEditor`
- `DataProviderEditor` — connection + tabs (Connections, Fields, Columns, Diagnostics). Sidebar **Import** button creates a brand-new persisted provider from an exported JSON config (`configStore.save` mints a fresh `providerId`, owned by the current user — or `system` when the config is public), then selects and opens it for editing; footer **Export** button downloads the current working config — including unsaved edits — as JSON. **Clone** (sidebar row or form footer) deep-clones the provider config into an unsaved draft that appears immediately in the sidebar list (tagged **Unsaved**) until the user saves — then `configStore.save` mints a real `providerId` and the row becomes persisted
- `providerConfigIo` — `exportProviderConfig` (downloads a `{ kind, version, exportedAt, provider }` envelope with `providerId`/`userId`/`isDefault` stripped so bundles are portable), `parseProviderConfigImport` (accepts the wrapped envelope or a bare provider object; validates `providerType`/`config`, defaults a missing name, re-strips identity), `toPortableProviderConfig`
- `columnDefsIo` — column-definitions JSON IO for the Columns tab. `serializeColumnDefs` / `exportColumnDefs` write a plain `ColumnDefinition[]` array at full fidelity (every field preserved, including each column's `valueGetter` DSL expression) and trigger a `starui-column-defs.json` download; `parseColumnDefsImport` accepts a bare array, `{ columns }`, or the `{ kind, columns }` envelope, sanitizes each entry to known keys (requires a non-empty `field`, defaults `headerName`→`field`, validates `cellDataType`, keeps `valueGetter`), and throws user-readable errors
- `useChordHotkey` — chord keybinding helper (internal to markets-grid-container; also in `@wellsfargo-starui/react/data` for hub inspector); `PROVIDER_TOOLBAR_TOGGLE_CHORDS` (`Alt+Shift+P`, `Meta+Shift+P`); capture-phase listener so AG-Grid cells cannot swallow the chord

#### Provider editor tabs (internal to `DataProviderEditor`; not separately importable)

Embedded AG Grid tables (Columns tab, AppData fields) register modules via the shared `ensureAgGridModules` from `@wellsfargo-starui/grid` (the tool's private registrar fork is deleted — the shared one additionally installs the set-filter validate guard) and already themed via `useAgGridTheme` → `staruiGridTheme`.

- `ConnectionTab` — connection string, auth, transport selection; "Test Connection" button (STOMP/REST) drives `useProviderProbe.test()`. STOMP runs a pure socket connect (`connectStomp` — handshake only, no subscribe/trigger/rows) and shows "Connected"; row-fetching transports (REST/mock) show "Connected — received N rows"
- `FieldsTab` — discover provider fields, map to columns, infer types; `buildColumns` maps each inferred `FieldNode.type` to a `cellDataType` (number/boolean/object pass through, everything else → `text`), and **inferred date fields → `dateString`** (not `date`) because `inferFields` detects ISO date *strings*, which AG-Grid's `date` type — expecting native `Date` objects — would mis-sort/filter
- `ColumnsTab` — derive AG Grid column defs from schema; collapsible Key Column + Add Custom Column panels and a scrollable body keep the columns table at a usable minimum height in short containers. **Export JSON / Import JSON** buttons (header cluster, plus an Import button in the empty state) round-trip the full `ColumnDefinition[]` via `columnDefsIo` — export preserves `valueGetter`; import replaces the columns and prunes the key column to surviving fields, surfacing parse errors inline. A "Clear all columns" button (confirm dialog) wipes the column list and the now-stale key column in one action. Per-row ƒx button opens a Monaco `ExpressionEditor` (from `@wellsfargo-starui/grid/customizer`) to author a column `valueGetter` DSL expression (column refs `[field]`, nested optional-chaining paths `[a.b.c]`, live-validated); persists onto `ColumnDefinition.valueGetter`, applied at runtime by `buildColumnDefs`
- `DiagnosticsTab` — probe, request/response logging, debug; Snapshot card shows "Cache size (serialized)" (`stats.cacheBytes`, the worker-cache footprint that `projectFields` shrinks) alongside fetch time and row count; Connection latency card shows "Restart → request sent" (`stats.restartRequestMs`, click-to-upstream-request including dial + handshake) and "Request → first message" (`stats.firstMessageMs`, request-sent to first upstream frame); Throughput card's byte stat is labelled "Bytes received" (upstream wire traffic, unaffected by projection)

#### Transport-specific editors

- `RestFields` — URL, headers, auth, body template
- `StompFields` — broker URL, login, subscribe topics, parsing
- `MockFields` — seed data, latency, mutation playback
- `AppDataFields` — read from `@wellsfargo-starui/data` AppData
- `BehaviourFields` — per-transport behaviour knobs; STOMP: reconnect initial delay, realtime throttle (on/off switch + ms) + conflation (on/off switch + conflate-by-key), "Thin field-level deltas" switch (`thinDeltas`), snapshot chunk size, "Wire format" select (`wireFormat`: JSON / Columnar), "Keep only column fields" projection switch (`projectFields`) (all written to `cfg`, also settable in code)

#### SSRM container & hosted

- `SsrmMarketsGridContainer` — full `MarketsGrid` chrome wired to an SSRM provider (`SsrmMarketsGridContainerProps`); the SSRM counterpart of `MarketsGridContainer`
- `useSsrmProviderDataWiring` — provider start/ready wiring behind `SsrmMarketsGridContainer` (`UseSsrmProviderDataWiringParams`)
- `StompSsrmFields` — provider-editor connection fields for `stomp-ssrm`. **Internal** to `DataProviderEditor`

#### Hosted integration (legacy)

- `useHostedStarui({ defaultGridId, configManager?, componentName?, devDefaults? })` — the workspace-host bridge to the StarGrid front door: runs `useHostedIdentity`'s resolution (per-view id from OpenFin customData / URL, ConfigService storage with registered-component metadata) and shapes the result as `{ gridId, identity, ready }` for `<StaruiIdentityProvider>` + `<StarGrid>`. `ready` folds the three hosted gates (id, storage, ConfigManager) into one flag. **Dev identity is gated**: unless `devDefaults: true`, an appId / userId that would fall back to the shared dev constants (`'TestApp'` / `'dev1'`) — i.e. neither the platform bootstrap context nor the ConfigManager yielded a real value — keeps the hook not-ready and logs one error, so dev identity can never silently key production config rows. Also owns the one-shot legacy `marketsgrid-view-state::*` cleanup (sentinel `hosted-mg.legacy-cleanup`, carried over from the deleted HostedMarketsGrid). All demo blotters + dataprovider-editor's grid panels consume it (per-view id passes as `advanced.instanceId` so profiles stay view-keyed while the grid-level row keeps the logical grid key)
- `useHostedIdentity` — resolve current view identity. URL `?instanceId=` / `?id=` wins synchronously; bare OpenFin views start `instanceId: null` and `ready: false` until `fin.me.getOptions().customData` settles (3s hard timeout → `defaultInstanceId`). Browser paths seed `defaultInstanceId` on first paint. Host ConfigManager resolution is peek-first (`peekConfigManager()`) then a slow-warned (8s) `getConfigManager()` fallback. Gate grid mount on `ready` plus `identity.configManager` / `identity.storage`
- `useFdc3Channel` — FDC3 channel subscription
- `useColorLinking` — workspace colour-linking membership (`{ color, linked }`); flat peer group, no parent/child
- `useGridContextLink` — grid-to-grid context linking over colored "Link" groups: publishes the selection and filters rows on peer selections. Echo suppression keys on a **per-window** source id (`makeSourceId` → OpenFin `uuid/name`), so two instances of the same view don't drop each other's broadcasts. Two modes: `'rowId'` (default) broadcasts AG-Grid `getRowId` values (`node.id` = `composeRowId` over the provider key fields) and applies them as an external filter; `'fields'` broadcasts **key columns + values** (the fields that compose `getRowId`) and applies a per-column set-filter — a selected **group expands to its `allLeafChildren`** so any mix of groups/sub-groups/rows resolves to precise leaf-row keys. Receivers apply only the columns they own (`api.getColumn`), merged with the user's manual filters. `onPublish`/`onReceive` callbacks drive notifications. `GridContextLinkConfig` is `{ enabled, mode, advanced? }` — the whole consumer surface is `{ enabled, mode }`; the typed `advanced` block (`GridContextLinkAdvanced`) carries the expert knobs: `publish`, `receive`, `rowIdField` (auto-filled by `StarGrid` from the provider `keyColumn`), `resolve`, `buildContext`, `contextType`, `notify`, `debug`. The hook consumes any `GridLinkTransport` (`{ current, addContextListener, broadcast }` — the single adapter interface both shipped transports satisfy). Exported helpers: `buildSelectionContext`, `defaultGridLinkResolver`, `applyGridLinkContext`, `GRID_LINK_CONTEXT_TYPE`, `normalizeRowIdField`. See [`docs/OPENFIN_GRID_LINKING.md`](./OPENFIN_GRID_LINKING.md)
- `useInteropChannel` (+ `isInteropAvailable`) — **primary** link transport: OpenFin interop facade (`fin.me.interop.setContext` / `addContextHandler` via the `openfin/host` interop seam), satisfying `GridLinkTransport`. Used because the dock "Link" joins **interop context groups** that `window.fdc3`'s channel tracking doesn't reliably reflect; `StarGrid` prefers it and falls back to `useFdc3Channel` only when interop is absent — and logs a **loud console error at link init** when linking is enabled inside OpenFin but NEITHER transport is reachable (interop needs no manifest flag; `fdc3InteropApi` only enables the FDC3 fallback)
- `useGridLinkNotifications` + `gridLinkNotifications` helpers (`buildSelectionNotification`, `buildAckNotification`, `summarizeCriteria`, `summarizeLinkContext`) — post OpenFin Notification Center messages for link traffic (a "sent" on broadcast, an "acknowledged" on receive) via `@wellsfargo-starui/openfin/host`; gated by `contextLink.advanced.notify`, no-op outside OpenFin
- `useTabsHidden` — tab visibility detection
- `useViewTabTitle` (+ `ViewTabTitle` type) — two-way binding between the grid caption and the host OpenFin view's tab name: seeds from `customData.savedTitle`, picks up external "Save Tab As…" renames via the view's `options-changed` event (1 s `getOptions` poll only as fallback for runtimes without the event API), and `setTitle` writes back `document.title` + `savedTitle`. No-op (local-only) outside OpenFin
- `useWorkspaceSaveEvent` — workspace save callback
- Window options — hosted hooks use `subscribeWindowOptions` from `@wellsfargo-starui/openfin/host` internally (not re-exported from `./hosted`)
- `useAgGridTheme` — AG Grid theme resolution

#### Shared hooks

- `IBlotterDataProvider` — deprecated alias of `IDataProvider`
- `useGridStateManager` — load/save grid state (cols, filter model, sort)

---

### 4.2 `@wellsfargo-starui/grid/config-browser`

**Path:** `packages/react-grid/config-browser`
**Purpose:** Configuration-browser dev tool — view/search/import/export configs. Collapsed into `@wellsfargo-starui/grid` (package-collapse sub-phase 4).

**Public exports:**

- `./config-browser` — `ConfigBrowserPanel`, `useConfigBrowser`, types
  (chrome icons come from `@wellsfargo-starui/design-system/icons/react`
  `DynamicIcon` — the tool's private Lucide fork was deleted and its nine
  unique keys merged into the design-system map)

#### Panels & dialogs

- `ConfigBrowserPanel` — master table UI with sidebar (AppConfig, UserProfile, Role, Blotter); sole public export (internal `ConfigBrowser.tsx` composes toolbar, search, drawer, import/export)
- `Toolbar` — search bar, import, delete-all, reset-to-seed, export
- `DataGrid` — AG Grid table with inline editing; object cells render via `previewJson` (budget-bounded serializer, O(budget) not O(payload size) — multi-hundred-KB config payloads never fully stringify per cell) and quick filtering matches on the same preview; plain header-menu text filters (no per-column multi/set/floating filter mounts)
- `TableSidebar` — table selector, CRUD buttons, row counts
- `RowDrawer` — JSON/form editor with validation
- `DeleteAllDialog` — destructive-action confirmation
- `ResetToSeedDialog` — wipe ALL config tables and re-seed from `ConfigManager.seedConfigUrl`; backup-only gate (Reset disabled until a full-database backup is downloaded). Toolbar button is disabled when no seed is configured
- `ImportPreviewDialog` — pre-apply import bundle preview

#### State, helpers, theming

- `useConfigBrowser` — table state, filters, mutations; `exportDeploy()` full deploy seed bundle (unfiltered `appConfig`) + validation via `@wellsfargo-starui/core/host/config` `buildDeployExport()`; `resetToSeed()` (delegates to `ConfigManager.resetToSeed()`, refreshes the view) and `seedConfigUrl` (gates the Reset button)
- `DeployExportPreviewDialog` — pre-download validation summary; rocket download saves as `seed.json` (errors and warnings require acknowledge checkbox)
- `buildDeployExport()`, `validateDeployExport()`, `parseSeedJson()`, `resolveActiveIdentityFromSeedUrl()` (`@wellsfargo-starui/core/host/config`) — deploy export includes every `appConfig` row plus `activeAppId` / `activeUserId`; normalize scope drift against those fields; reject wrong `seed.json` shapes (e.g. `kind: starui.dataProvider`); emit `DeployExportWarning` codes (`MISSING_INSTANCE_ROW`, `EMPTY_PROFILE_STATE`, `UNREFERENCED_ROWS`, …); `resolveActiveIdentityFromSeedUrl()` cross-window-caches identity (single-flight + `localStorage`) so OpenFin child views do not re-fetch the full deploy bundle; manifest `customSettings.appId` / `userId` skip the seed fetch when both are pinned
- `ConfigManager.onConfigChanged()` / `ChangeNotifier.subscribeAll()` — global write/delete subscription (same-tab + cross-tab) for worker catalog sync
- `readProfileSetPayload()` (`@wellsfargo-starui/core/host/config`) — storage adapter reads profile-set bytes even when row `appId` drifted, so `gridLevelData` / profile saves do not wipe `profiles: []`; re-stamps correct scope on write
- Platform scope realignment — `initWorkspace` reads manifest / `app-config.json` `appId` instead of hard-coded `TestApp`; `migrateRegistryAppIdDrift()` runs inside workspace init (not a public `@wellsfargo-starui/openfin` export); `readHostEnv()` uses the same bootstrap before dev fallback
- `TABLES` — table enumeration
- `createConfigBrowserAction` — wire config browser as OpenFin context-menu action
- `configBrowserGridTheme` — the canonical design-system `staruiGridTheme` plus the tool's chrome overrides (input chrome, resize handle, structural borders via `--ds-*` vars); ONE theme object, mode-switched by the `data-ag-theme-mode` attribute ConfigBrowser already writes (internal helper; not on package barrel). Replaced the tool's two hand-baked `themeQuartz` objects
- `editorStyles` — inline styles for editors
- Format conversion, validation, clipboard helpers

---

### 4.3 `@wellsfargo-starui/react/workspace-setup`

**Path:** `packages/react-core/workspace-setup-react`
**Purpose:** OpenFin workspace setup UI — dock config, registry, component picker.

**Public exports:**

- `./workspace-setup` — everything below (single barrel; no deeper subpaths)

#### Workspace shell

- `WorkspaceSetup` — 3-pane editor (Dock / Inspector / Components+Registry); embeds `ComponentsPane`, `DockPane`, `InspectorPane`, `IconPicker` internally (not separately importable)
- `ComponentsPane` — browse registered components, drag to dock; per-row hover actions: configure (test-launch), **clone**, delete. Clone (`WorkspaceSetup.handleClone`) duplicates a registry entry into a fresh draft — deep-copies all definition fields, gives it a de-duplicated `(copy)` display name and a unique `componentSubType` (`<sub>-copy`) so its derived `${type}-${subtype}` id can't collide with the source on save, resets `id`/`configId` (re-derived at save), and selects it for immediate editing in the inspector. **`cloneRegistryTemplateConfig`** (`@wellsfargo-starui/openfin`) deep-clones the source template **AppConfigRow** (profiles, grid options, styling, theme via `structuredClone` on `payload`) onto the clone's derived template id immediately on clone (retried at save if the first attempt failed)
- `DEFAULT_ICON` — fallback icon id for dock/registry entries
- `DockPane` — dock toolbar editor (buttons, folders, menus, icons, actions)
- `InspectorPane` — selected dock-item property editor
- `IconPicker` — themed icon selector with search

#### Dock editor state & icons

- `useDockEditor` — dock-config state manager
- `iconIdToSvgUrl` — icon id → data URL
- `parseIconUrl` — parse SVG/PNG/asset-library URLs
- `iconIdToThemedUrls` — dark/light icon URLs
- `ICON_OPTIONS`, `findIconByName`, `IconOption` — icon library + lookup

#### Registry editor

- `useRegistryEditor` — component-registry state manager
- Registry browser + property editor + config validation
- `RegistryEntry` — registered component instance metadata

---

## 5. Shared / Core

### 5.1 `@wellsfargo-starui/types/shared` & `@wellsfargo-starui/types`

**Paths:** `packages/types/shared-types`, `packages/types/types`
**Purpose:** Shared type contracts for StarGrid host ports and runtime.
`@wellsfargo-starui/types/shared` is the **single source of truth** for the
`dataProvider`, `configuration`, and `fieldSelector` modules — exposed as
subpath exports (`@wellsfargo-starui/types/shared/dataProvider`, `/configuration`,
`/fieldSelector`) and re-exported by `@wellsfargo-starui/types` so existing
`@wellsfargo-starui/types` consumers keep their import paths while definitions stay
unified. `@wellsfargo-starui/types/shared` additionally exports `configuration`
(`COMPONENT_TYPES`, `COMPONENT_SUBTYPES`, …), `dockConfig`, `dockTreeUtils`,
`simpleBlotter`, and `widget` modules. `@wellsfargo-starui/types` remains the slim
runtime subset (and depends on `@wellsfargo-starui/types/shared` for the unified
modules).

#### Runtime constants

- `LOGGED_IN_USER_ID` (`'dev1'`)
- `THEME_STORAGE_KEY`, `THEME_BROADCAST_CHANNEL`
- `Theme` (`'light' | 'dark'`)
- `Unsubscribe` — cleanup function type

#### Identity

- `IdentitySnapshot` — `instanceId, appId, userId, componentType, componentSubType, isTemplate, singleton, roles, permissions, customData`
- `SurfaceKind` — `'popout' | 'modal' | 'inpage'`
- `SurfaceSpec` — window-creation spec
- `SurfaceHandle` — runtime window handle (close/focus/onClosed)

#### Persistence

- `ProfileSnapshot` — `id, gridId, name, state, createdAt, updatedAt`
- `AppDataLookup` — `(name, key) => unknown`
- `AppDataSnapshot` — revision counter + lookup

#### Row-path utilities

- `COMPOSITE_KEY_SEPARATOR`
- `composeRowId()` — join composite-key values
- `getPathAccessor()` / `getPathSetter()` — nested-field access
- `getValueByPath()` — extract value by dotted path
- `normalizeKeyColumns()` — standardise key column defs
- `__resetPathAccessorCaches()` — test reset

#### SSRM provider types

- `PROVIDER_TYPES.STOMP_SSRM` (`'stomp-ssrm'`) + `StompSsrmProviderConfig` — STOMP feed with a SharedWorker SSRM query plane
- `PROVIDER_TYPES.MOCK_SSRM` (`'mock-ssrm'`) + `MockSsrmProviderConfig` — in-worker mock feed with an SSRM query plane (lab / offline); optional persisted `columns` schema for SSRM grids and editors
- Both carry `keyColumn` and participate in the `TransportConfig` union (renamed from `ProviderConfig` — it is the transport-config union nested inside `DataProviderConfig.config`; a deprecated `ProviderConfig` alias survives one release) and the per-type config defaults. The dead componentSubType maps are deleted; `isSsrmProviderType` (now declared in `@wellsfargo-starui/types`) is THE CSRM/SSRM discriminator — never test the type string inline
- `STOMP_TUNING_DEFAULTS` — the effective runtime defaults for the STOMP hub/wire knobs (throttle 25ms, chunk 500, reconnect 5000ms, heartbeat 4000ms, columnar wire format, publish window 0), single-sourced so the transport and the provider editor's controls can never disagree. Six dead Stomp fields deleted (snapshotTimeoutMs, manualTopics, stomp's dataType, messageRate, batchSize, autoStart); the interface carries connection / row-identity / tuning group banners
- `validateProviderConfig` — validation with teeth: hard errors mirror what the transports require at attach (stomp: `websocketUrl` + `listenerTopic`; rest: `baseUrl` + `endpoint`), scheme/interval checks remain warnings. Wired into the provider editor's save (existing error pill) and JSON-import (alert) paths
- `IDataProvider.getConfigOrNull?()` / `ISsrmDataProvider.getConfigOrNull?()` — null-safe config accessor (null pre-start); `getColumnDefs()` no longer inherits `getConfig()`'s pre-start throw. Consumers read config with plain null checks instead of try/catch probes
- `SSRM_COMPOSITE_KEY_FIELD` — the `'__ssrmRowId'` composite-key sentinel, exported so client `getRowId` and the worker cache key can never drift

#### Re-exports

- DataProvider type contracts
- FieldSelector types
- Configuration types

---

### 5.2 `@wellsfargo-starui/core`

**Path:** `packages/core/engine`
**Purpose:** Framework-agnostic vanilla TS grid runtime engine — store, event bus, expression engine, customizer logic.

#### Platform runtime

- `GridPlatform` — per-grid singleton (store, api, events, rows, resources, pipeline)
- `defineModule()` — module-authoring helper: defaults `schemaVersion` (1), `priority` (100), `getInitialState` (clone of `initialState`), `serialize` (identity), `deserialize` **and** `migrate` (spread-over-initial — additive, never drops persisted state on a version bump); every default overridable. With `Module.category` (settings-nav group, replaces the deleted display-only `code` field), a minimal toggle module is `defineModule({ id, name, category, initialState, SettingsPanel })`
- `GridPlatformOptions` — `gridId, modules, rowIdField, appData`
- Internal machinery reachable through a `GridPlatform` instance (no longer
  exported from the barrel — the Phase-6 curation removed every root-barrel
  name with zero importers outside the engine): `EventBus` (`platform.events`,
  typed pub-sub), `ApiHub` (`platform.api`, reactive `GridApi`),
  `RowChangeBus` (`platform.rows` — shared, timer-coalesced row-change
  emitter reading exact changed nodes from AG `asyncTransactionsFlushed`;
  one `RowChange` per frame with `added`/`updated`/`removed` deltas or
  `full` for sort/filter/`setRowData`, so data-reactive modules evaluate
  only changed rows; filter pill counts adjust incrementally on deltas),
  `ResourceScope` (`platform.resources` — `CssInjector` + `ExpressionEngine`
  + WeakMap caches), `PipelineRunner` (cached transform pipeline with
  per-module memo + output structural sharing), `topoSortModules`,
  `CssInjector` (microtask-coalesced rule upserts), the Zustand store
  factory `createGridStore` (`Store` type stays public as `GridStore`),
  and `startAutoSave` (debounced persistence, wired by the React layer)

#### Persistence adapters

- `StorageAdapter` — profile CRUD interface
- `MemoryAdapter` — in-memory ephemeral storage
- `LocalStorageBundleAdapter` — localStorage JSON blobs (in-memory bundle
  cache keyed on the raw stored string: reads skip re-parsing unless the
  blob changed, so a profile save no longer re-parses the whole bundle twice)
- `createMarketsGridLocalStorageStorage()` — MarketsGrid-specific factory
- `RESERVED_DEFAULT_PROFILE_ID`
- `activeProfileKey()` — localStorage key generator

#### Profile manager

- `ProfileManager` — framework-agnostic profile orchestration
- `ProfileManagerState` — `activeId, profiles, isLoading, isDirty`
- `ProfileManagerOptions` — `platform, adapter, autoSave, activeIdSource`
- `ActiveIdSource` — pluggable active-profile pointer
- `ProfileMeta` — metadata
- `ExportedProfilePayload` — JSON export format; `schemaVersion: 2` bundles
  the grid-level data blob (provider selection, caption, event bindings)
  alongside the profile so an export/import is a complete grid-view
  snapshot. `import()` re-applies it via the adapter's `saveGridLevelData`
  and emits a `gridLevelData:imported` platform event; v1 files (no
  grid-level data) still import unchanged.

#### Security policy

- `configureExpressionPolicy()` / `getExpressionPolicy()` + the
  `ExpressionPolicy*` types — CSP mode gate. Internal since the Phase-6
  barrel curation (zero external importers); reachable in-package only
- `sanitizeExpressionFormatters()` — drop unsafe expression formatters (used internally by `ProfileManager`; not on engine `.` barrel)
- `migrateExpressionsInObject()` / `migrateExpressionSyntax()` — expression-syntax migration (internal; off the `.` barrel since Phase 6)

#### History (undo/redo)

- `HistoryStack` — vanilla undo/redo (module state snapshots)
- `HistoryStackOptions` — `maxSize`
- **Editing core** — `EditJournal`, `CellPatch`, `EditSource`, `buildPatchesFromTargets`,
  `applyForwardPatches`, `previewPatches`, `assertSingleColumnSelection`,
  `BuildNudgePatchesOptions` — cell-patch journal for row data edits (one user
  action = one undo step)
- **Smart edit** — `applyNumericOp`, `collectTargetCells`,
  `applySmartEditColDefTransforms`, `INITIAL_SMART_EDIT` (internal since
  Phase 6: `parseMagnitudeSuffix`, `deserializeSmartEditState`)
- **Data change history** — `DataChangeHistorySettings`, `recordSourceKey`,
  `deserializeDataChangeHistoryState`, `INITIAL_DATA_CHANGE_HISTORY` — profile
  settings for the edit-history module (session-only stacks; settings-only persistence)
- **Bulk update** — `BulkUpdateSettings`, `collectBulkUpdateTargets`,
  `resolveColumnDistinctValues`, `INITIAL_BULK_UPDATE` — replace-all-selected
  with one value (internal since Phase 6: `buildBulkUpdatePatches`,
  `parseBulkUpdateValue`, `deserializeBulkUpdateState`)
- **Plus / minus** — `buildNudgePatches`,
  `applyPlusMinusColDefTransforms`, `INITIAL_PLUS_MINUS` (internal since
  Phase 6: `resolveNudgeForCell`, `deserializePlusMinusState`)
- **Shortcuts** — `buildShortcutPatches`,
  `applyShortcutsColDefTransforms`, `INITIAL_SHORTCUTS` (internal since
  Phase 6: `matchShortcutForCell`, `collectShortcutKeys`,
  `deserializeShortcutsState`)
- **Visual Excel** — `buildVisualExcelStyles`, `applyFormatExcelClasses`,
  `defaultVisualExcelFileName`, `deserializeVisualExcelState`,
  `INITIAL_VISUAL_EXCEL` (internal since Phase 6: `formatExcelClassId`,
  `cssToExcelColor`, `cellStyleToExcelStyle`)

#### Expression engine

- `ExpressionEngine` — CSP-safe parser/evaluator. `parse()` memoizes the AST by
  source string (immutable ASTs shared across calls), so the per-cell/per-tick
  `parseAndEvaluate` hot path is a Map lookup, not a re-tokenize+re-parse
  (benchmarked ~7x faster for a conditional-styling-heavy frame: ~23ms → ~3ms)
- `tokenize()`, `parse()`, `Evaluator` — internal since Phase 6 (use `ExpressionEngine`)
- `compile()` — compile an AST once into a reusable `(ctx) => value` closure
  (cached by source; `compileToFunction` exists in `expression/index.ts` but is
  not re-exported from the engine `.` barrel); `evalOps` holds the shared
  operator/resolution semantics both the interpreter and the compiler call, so
  the two paths are behaviourally identical (parity-tested). Prefer `compile()`
  at rule/column setup on hot paths (conditional-styling cell/row predicates and
  provider column `valueGetter` expressions via `buildColumnDefs` use it)
- `validate()` — parse-time syntax check plus `validateCallSites()` (unknown
  functions and arity mismatches rejected before save/runtime)
- `REGEX_MATCH` — invalid patterns return `false` (never throw)
- `tryCompileToAgString()` — transpile to AG Grid `valueFormatter` string
  (still the FIRST choice — zero per-cell JS; the closure is the fallback; internal since Phase 6)
- `ExpressionNode` (public); `EvaluationContext` / `ValidationResult` / `FunctionDefinition` internal since Phase 6
- Conditional sugar (both desugar to short-circuiting ternaries at parse time, so
  they compose with everything and the `IF`/`IFS`/`SWITCH`/`CASE(...)` functions
  still work): SQL-style `CASE WHEN cond THEN result [WHEN …] [ELSE e] END` and
  JS-style `if (cond) { [return] expr } [else if (…) {…}] [else {…}]` (single-value
  blocks, optional `return`/`;`). Contextual keywords (`WHEN`/`THEN`/`ELSE`/`END`/
  `RETURN`) are case-insensitive and only reserved inside these forms; legacy
  `{col}` refs and column names like `[end]` are unaffected

#### Column-def helpers

- `valueFormatterFromTemplate()` — conditional formatting from template; the
  `date` / `datetime` presets are locale-aware via `Intl.DateTimeFormat`
  (honour `options.locale` / `options.dateStyle` / `options.timeStyle`; default
  locale from `navigator.language`), pinned to `timeZone: 'UTC'` for
  deterministic output
- `isValidExcelFormat()` — Excel format-string validation
- Internal since Phase 6 (in-package helpers behind `valueFormatterFromTemplate`): `excelFormatter()`, `excelFormatColorResolver()`, `tickFormatter()`, `presetToExcelFormat()`, `cellStyleToAgStyle()`
- `getActiveTheme()`, `migrateThemedStyle()` (`mergeThemedStyle()` internal since Phase 6)
- `patchActiveStyle()`, `resolveActiveStyle()` (own-slot read, divergence-only)
- `resolveEffectiveStyle()` (internal since Phase 6) — render-time fold: dark renders its own slot;
  light inherits the dark slot and overrides it per-leaf
- `mergeCellStyleOverrides()` (internal since Phase 6) — per-leaf `CellStyleOverrides` merge (top wins;
  borders per-side), shared by template resolution + dark→light inheritance
- `nestedField()` — nested-field accessor
- `defaultNullSafeComparator()` — null-safe sort comparator
- `ColumnAssignment`, `CellStyleOverrides`, `ThemedCellStyleOverrides`
- `ValueFormatterTemplate`, `PresetId` (`currency`/`percent`/`number`/`date`/`datetime`/`duration`), `TickToken`

#### Field-format catalog (Auto Format)

- `FIELD_FORMAT_CATALOG` (internal since Phase 6) — curated repository of FI/equity blotter field names
  (sourced from `docs/blotter-field-catalog.md`) mapped to **native
  formatting-system state only**: value formatters (incl. `excelFormat`
  `[Green]`/`[Red]` colour tags for P&L / change / signed numerics, which resolve
  to `--ds-accent-positive`/`--ds-accent-negative` design-system tokens),
  alignment and typography. No opaque cell renderers — so every auto-applied
  aspect stays editable from the formatter toolbar and saves to the active
  profile. Categorical fields (side/status/rating) are centred only; tickers
  get bold + left-align. High-magnitude fields are scaled via Excel trailing
  commas: P&L → `"K"` (÷1,000, sign-coloured), quantities/sizes → `"K"`,
  notional / market value → `"M"` (÷1,000,000); small money (fees, commission,
  accrued interest) stays on plain decimals so it isn't squashed to `0.0M`
- `matchFieldToCatalog(field, headerName?, cellDataType?)` (internal since Phase 6) — resolve a column's
  `AutoFormatAssignment`. Nested paths match on their **last segment only**
  (`position.marketValue` → `marketValue`). Resolution order: exact alias →
  last-element suffix (e.g. `bidPrice` → `price`) → phonetic Soundex
  (catches misspellings/variants, e.g. `yeild` → `yield`) → generic fallback by
  data type (number → right-aligned grouped 2dp; date → localised; boolean →
  centred; else none)
- `buildAutoFormatPlan(columns)` — map columns → `Record<colId, AutoFormatAssignment>` (public, with `AutoFormatColumn`)
- Internal since Phase 6: `normalizeToken()`, `soundex()` (Russell Soundex powering the phonetic match tier), and the `FieldFormatEntry` / `AutoFormatAssignment` / `AutoFormatAlignment` / `AutoFormatTypography` types — reachable in-package behind `buildAutoFormatPlan`

#### Style editor model

- `StyleEditorValue`, `StyleEditorSection`, `StyleEditorVariant`
- `StyleEditorDataType` — data-type-aware styling
- `TextAlign`, `FontWeight`

#### Customizer module logic

- **Calculated columns:** `buildVirtualColDef`, `getAllRowsSnapshot`, `invalidateAllRowsCache`
- **Column customization:** `applyAssignments`, `reinjectCSS`, `cssEscapeColId`, `applyFilterConfigToColDef`, `applyRowGroupingConfigToColDef`
- **Column groups:** `composeGroups`, `collectGroupIds`, `collectAssignedColIds`, `groupHeaderBorderOverlayCSS`, `groupHeaderStyleToCSS`
- **Column templates:** `resolveTemplates`, snapshot/restore
- **Conditional styling:** `toStyleEditorValue`, `fromStyleEditorValue`, `INDICATOR_ICONS`
- **General settings, grid state:** serialize/deserialize helpers

#### Filter toolbar logic

- `makeId()` — filter-id generator
- `generateLabel()` — humanise filter condition
- `formatFilterModel()` — AG Grid filter-model formatter
- `doesValueMatchFilter()`, `doesRowMatchFilterModel()` — predicate testing
- `filterModelsEqual()` — comparison
- `mergeFilterModels()`, `subtractFilterModel()` — set operations
- `isNewFilter()` — new-filter detection
- `SavedFilterShape` — persistence format

#### Shared CSS/column types

- `CellStyleProperties` — CSS property whitelist
- `ThemeAwareStyle` — dark/light variants
- `injectEditorStyles()` — editor CSS injection

---

### 5.3 `@wellsfargo-starui/core/host`

**Path:** `packages/core/host`
**Purpose:** Host port interfaces and `GridHostContext` factory.

- `RuntimePort` — theme, surface management, identity broadcast
- `StoragePort`, `StoragePortFactory` — profile persistence backend
- `DataPort` — data provider integration
- `ConfigPort` — app configuration service
- `createGridHostContext()` — factory
- `buildGridHostContext()` — compose from ports
- `GridHostContext` — unified host API
- `GridHostScope` — per-grid scope
- `GridHostContextOptions` — init options
- `storageFactoryForPersistence()` — adapt `StoragePort` to `ProfileManager`
- `defineStarGridPlugin()` — declare a host plugin
- `StarGridPlugin` — `{ id, register?({ appId }) }` optional one-shot registration hook
- `openProviderEditorSurface(runtime, { providerId?, route? })` / `openConfigBrowserSurface(runtime, { route? })` (+ opts types) — the ONE definition of the platform tool windows' name/route/dimensions for app views, over `RuntimePort.openSurface` (works in browser and OpenFin; the port owns named-window dedup and focus-on-reopen). `providerId` rides the hash (`#/dataproviders?id=…`) and is mirrored into `customData` for the OpenFin path. Replaces the per-app `dataProvidersPopout.ts` copies and inline `openSurface` blocks

---

### 5.4 `@wellsfargo-starui/core/host/browser`

**Path:** `packages/core/host-browser`
**Purpose:** Browser `RuntimePort` implementation.

- `BrowserRuntime` — browser-based `RuntimePort` (theme, surface, identity)
- `BrowserRuntimeOptions` — `window` target, broadcast channel
- `resolveBrowserIdentity()` — read identity from URL/attributes
- `IdentityOverrides` — override identity values

---

## 6. Data Utilities

### 6.1 `@wellsfargo-starui/core/host/config`

**Path:** `packages/core/host-config`
**Purpose:** Dual-mode configuration service — Dexie/IndexedDB local store with optional REST backend sync. Backs all profile, role, permission, and app-config persistence.

#### ConfigManager — the single config-service API

- `createConfigManager(options)` / `ConfigManager` — one class for fetch/update/save of every config row. Local Dexie by default; pass `configServiceRestUrl` to sync writes to a REST backend with Dexie as a local cache. (The former `ConfigClient` / `LocalConfigClient` / `RestConfigClient` facade has been removed — ConfigManager is the sole surface.)
- CRUD for 6 tables: `appConfig`, `appRegistry`, `userProfile`, `roles`, `permissions`, `pendingSync`
- Single-row read cache keyed by `configId`: `getConfig` memoizes Dexie reads (negative hits too), write-through on `saveConfig`, evicted on `deleteConfig` and on every change-notifier event — same-tab and cross-tab — so a hit is never staler than the shared IndexedDB row. Collapses the former "read the whole profile bundle 3-4× per save" into one Dexie hit. Bounded by the config keyspace with a 1000-entry backstop; cleared on `dispose()` and after bulk seed/clear.
- Single-row CRUD: `getConfig`, `saveConfig` (with `expectedUpdatedTime` OCC), `deleteConfig`, `createConfig` (stamps timestamps), `updateConfig` (read-modify-write + OCC), `configExists`
- Reads: `getConfigsByApp` / `getConfigsByUser` / `getAllConfigs` (visibility-filtered) + `…Unfiltered` admin variants, `findByComponentType`, `getTemplates`
- `getConfigsByComponentTypesUnfiltered(types)` — fetch only the given `componentType`s via the `[componentType+componentSubType]` index (O(matching) not O(all rows)). Used by the data-provider / AppData stores so listing providers reads only provider rows instead of materialising every grid profile in `appConfig`
- Auth-table methods: app-registry / user-profile / role / permission CRUD + `getUserPermissions` / `userHasPermission`
- `resetToSeed()` — hard reset: fetch + parse the seed at `seedConfigUrl` FIRST (a fetch/parse failure throws before any wipe, so the DB is never stranded empty), then clear all config tables and bulkPut the seed in one transaction; updates the seed digest, flushes the row cache, returns per-table counts. `getSeedConfigUrl()` exposes the configured seed URL (drives the Config Browser "Reset to seed" button)
- REST mode — writes sync to backend with Dexie as local cache
- Failed REST writes → `PENDING_SYNC` table, auto-retry every 10 s (max 10 retries)
- Impersonation via `setImpersonatedUser()` for admin previews
- `ApplicationContext` tracking signed-in vs impersonated user
- `getEffectiveUser()` — single source of truth for effective identity

#### Auth tables

- App registry — registered apps (`getAppRegistry` / `getAllApps` / `saveAppRegistry` / `deleteAppRegistry`)
- User profiles — user ↔ app ↔ role mappings (`getUserProfile` / `getUsersByApp` / `getAllUserProfiles` / `saveUserProfile` / `deleteUserProfile`)
- Roles — role definitions (`getRole` / `getAllRoles` / `saveRole` / `deleteRole`)
- Permissions — fine-grained permissions (`getPermission` / `getAllPermissions` / `getPermissionsByCategory` / `savePermission` / `deletePermission`) + derived `getUserPermissions` / `userHasPermission`

#### Visibility & access control

- `isVisible()` — pure predicate for visibility rules
- `VisibilityContext` — evaluation context (roles, permissions, impersonation)
- `getEffectiveUser()` — impersonation-aware identity resolver

#### MarketsGrid profile storage

- The one profile surface lives in `profileBundle.ts`: the `StorageAdapter` factory over the `loadProfileSet` / `saveProfileSet` RMW helpers. (The `ConfigManager.profiles` namespace and `createConfigPort` were deleted in the persistence consolidation — the namespace's only live member was `subscribe`, now `ConfigManager.onRowChanged(configId, fn)`; the port was a subscribe-only façade nothing consumed.)
- `createConfigServiceStorage()` — `StorageAdapter` factory for `MarketsGrid` profile sync
  (thin per-scope row cache layered over ConfigManager's own single-row cache; invalidated on
  every local write and on `subscribeToChanges` notifications so cross-tab writes never serve
  a stale row). Writes (`saveProfile` / `deleteProfile` / `saveGridLevelData`) read the
  **authoritative** row version for the OCC check (not the possibly-stale local cache) and
  **retry on `ProfileSetVersionConflictError`** — so when two adapter instances target the
  same bundled row (MarketsGridContainer's `gridLevelData` adapter vs the grid's profile
  adapter), a profile save that bumps the version can't silently drop the provider-selection
  write. Previously `gridLevelData.provider.liveProviderId` was lost on registered/OpenFin
  (ConfigService) components, leaving the grid empty on next launch.
- `migrateProfilesToConfigService()` — one-shot legacy migration
- Bundling: one `AppConfigRow` per `(appId, userId, instanceId)` with all profiles in payload
- `loadProfileSet()` / `saveProfileSet()` accept an optional pre-fetched-row box so a
  caller holding the row (the adapter cache) can skip a redundant `getConfig`
- `MARKETS_GRID_PROFILE_SET_COMPONENT_TYPE`
- `CONFIG_SERVICE_ADAPTER_BRAND` + `getConfigServiceAdapterBrand()` — adapter detection
- `ProfileStorageFactory`, `ProfileStorageFactoryOpts`
- `RegisteredComponentIdentity`

#### Profile-state consolidation

- `ProfileSetVersionConflictError` — version-conflict detection
- `ConfigManager.onRowChanged(configId, fn)` — per-row change subscription (same-tab + cross-tab via `BroadcastChannel`); the per-row analogue of `onConfigChanged`

#### Data layer

- `SeedData` — first-run seed shape with required `activeAppId` /
  `activeUserId` (deployment identity — the only source of truth for scope;
  not duplicated in app-config.json or manifest `customSettings`). Optional
  `appConfig[]` lets a Config Browser deploy export serve as a full-restore
  `seed.json`. `normalizeSeedData()` / `resolveActiveIdentityFromSeedUrl()`
  re-stamp mismatched `appConfig[].appId` / `userId` (and
  `userProfiles[].appId`) to match `activeAppId` / `activeUserId` before
  `seedIfEmpty()` writes. `normalizeImportedAppConfigRow()` re-stamps
  imported `appConfig` rows (Config Browser per-table import, OpenFin
  `importConfigBundle`, and every `saveConfig()`) to the same
  `activeAppId` / `activeUserId`; bundle file values are ignored.
  Global catalogue rows keep `userId: system`. `seedIfEmpty()` default (`seedConfigReload:
  'empty-only'`) runs only on an empty DB (gated on appRegistry **or** appConfig count).
  Optional `seedConfigReload: 'when-changed'` re-seeds when `seed.json` content changes (local dev;
  digest via `computeSeedDigest`, fetch uses `cache: 'no-store'`). Shipped apps use default `empty-only`.
  Cold-start dedup: `seedIfEmpty()` serializes the fetch+seed across all same-origin contexts (every
  OpenFin window **and** the SharedWorker) with an exclusive Web Lock keyed `starui:seed-lock:<url>`
  (`runWithSeedLock`); the emptiness check runs *inside* the lock (`seedIfEmptyLocked`) so late
  acquirers skip the fetch — a multi-window cold start fetches + writes the bundle exactly once. The
  lock auto-releases on holder crash; absent `navigator.locks` it falls back to running directly
  (idempotent `bulkPut`).
  `parseSeedJson()` + `coerceDeploySeedBundle()` accept the rocket export shape (`buildDeployExport`
  bundle); `normalizeSeedData()` re-stamps `appRegistry`, `userProfiles`, and `appConfig` to
  `activeAppId` / `activeUserId` before write.
- `ConfigDatabase` — Dexie wrapper with schema versioning
- Compound indexes: `[componentType+componentSubType]`, `[userId+appId]`
- v1→v2 unified schema migration (`config→payload`, `createdAt→creationTime`, `updatedAt→updatedTime`)
- Cross-window sync via Dexie's IndexedDB locking
- `ChangeNotifier` — cross-tab BroadcastChannel event bus

#### Error & concurrency

- `ConfigNotFoundError`, `OptimisticLockError`
- Optimistic concurrency control (`If-Match` / `expectedUpdatedTime`)
- `PendingSyncRow` — failed-write retry tracking

#### Adapters & utilities

- `CONFIG_BROWSER_TABLES`, `TABLES` — config-browser metadata
- `ConfigBrowserTableKey`, `ConfigBrowserTableMeta`

---

### 6.2 `@wellsfargo-starui/data`

**Path:** `packages/data/host-data`
**Purpose:** SharedWorker-backed data services — real-time provider orchestration, connection management, stream subscriptions, AppData.

**Public exports:**

- `.` — runtime types + probes
- `./runtime` — protocol types + main-thread helpers
- `./runtime/client` — `SharedWorkerDataServicesClient`
- `./runtime/sharedWorker` — `installSharedWorkerHub`, `SharedWorkerDataServicesHub`
- `./runtime/worker/defaultEntry` — default worker entry; accepts ports itself, waits for the `worker-bootstrap` handshake, then builds the ConfigManager, runs `ConfigManager.init()` and hands the ports to `installSharedWorkerHub` (`adoptPorts`) for catalog/AppData hydrate before port traffic
- `./assets/data-services-worker.mjs` — pre-built, self-contained esbuild worker bundle (stompjs inlined, **zero** static or dynamic imports). Also the **default** target of the zero-config path below: it must be a single non-splitting chunk because Vite's default `worker.format` is `iife`, which rejects any code-splitting worker build
- **Zero-config worker resolution** — `workerScriptUrl` is optional on every public signature (`createDataServicesWorker`, `createDataServicesClient`, `bootstrapDataServicesWithWorkerAsset`, `EnsurePlatformReadyOpts`, `EnsureHubOpts`, `WarmHubConnectionOpts`, `CreateAppDataServicesOpts`, `DataHubProvider`). Omitted, the library resolves its own worker via an inline `new SharedWorker(new URL('../../assets/data-services-worker.mjs', import.meta.url), { type: 'module' })` — the form Vite / webpack 5 / Next / Rollup / Parcel all statically detect, so a consumer emits the worker with no build config (browser-verified: chunk emitted, fetched, and constructed). An explicitly passed URL still wins, for CDN / OpenFin-manifest / `<script>` hosting. Vite **dev** additionally needs `optimizeDeps: { exclude: ['@wellsfargo-starui/data'] }`, because prebundling into `.vite/deps/` relocates the module and breaks the relative resolution
- SSR/Node guard — `createDataServicesWorker` throws a named, actionable error when `SharedWorker` is undefined instead of a bare `ReferenceError`
- **Single source for the SharedWorker name** — `dataServicesWorkerName(appName)` / `HUB_PROTOCOL_TAG` (`runtime/bootstrap/workerName.ts`). The name is the browser's identity for the hub, so `createDataServicesWorker` and `createDataServicesClient` must agree exactly; when each carried its own literal they drifted (`:ssrm2` vs `:ssrm3`), which would give an app mixing both paths two independent hubs — two caches, two upstream connections. Bump `HUB_PROTOCOL_TAG` (not a literal) when the hub protocol changes

#### Runtime architecture

- `SharedWorkerDataServicesClient` — main-thread client routing events to listeners; catalog RPC (`waitForCatalogReady`, `getProviderConfig`, `listProviderConfigs`, `invalidateConfig`, `getHubIntrospect`, `isProviderRunning`, `waitForProviderRunning`, `onCatalogChange(detail)`); scoped `catalog-ready` broadcasts carry `providerId` (single row) or `full` (whole catalog); **Deprecated.** passing `cfg` on `attach` / `subscribe` for catalogued providers — use cfg-free attach
- `wireWorkerCatalogSync()` / `isCatalogConfigRow()` — `ensurePlatformReady` wires `ConfigManager.onConfigChanged` → `client.invalidateConfig` only for `data-provider` / `appdata` rows (grid profile saves do not fan out `catalog-ready`)
- `ensurePlatformReady` attach bootstrap — when cached seed identity (localStorage, cross-window) + `isPlatformWarm(appId)` (a prior window completed full bootstrap) hold, child views skip `seedConfigUrl` and run `ConfigManager.init({ mode: 'attach' })`; no worker round-trip — seeding lives in IndexedDB, which outlives windows and worker; every completed full bootstrap sets `markPlatformWarm(appId)` in localStorage
- `ensureConfigReady()` — config-only bootstrap (attach resolution + ConfigManager init, no hub connect / AppData snapshot / catalog preload); idempotent per `appId`; `ensurePlatformReady` builds on it, so a window upgrades from config-only to full reusing the same ConfigManager
- one SharedWorker connection per window — `ensureDataServicesHub` owns a per-`appId` `HubConnection` (worker + `SharedWorkerDataServicesClient`); `warmHubConnection()` opens it early (never throws) so the worker spawns while ConfigManager init runs, and the hub bundle adopts the same port (`bootstrapDataServices({ client })`)
- `sendWorkerBootstrap(port, input)` + `worker-bootstrap` protocol message — main thread posts the deployment bootstrap (`appId`, `userId`, seed URL, REST URL) on the worker port immediately after `new SharedWorker()`; sent by both `createDataServicesWorker` and `createDataServicesClient`. The port is the only channel that reaches a SharedWorker: the previous localStorage transport could never work (a worker global has no Storage API, so every field arrived `undefined` and `configServiceRestUrl` was silently ignored). A blank `userId` is an explicit "boot anonymous" answer; if no handshake arrives within 5 s the worker warns and boots local/anonymous
- `AdoptedPort` / `installSharedWorkerHub({ adoptPorts })` — port handover for entries that must accept connections before the hub exists. `defaultEntry` cannot build its ConfigManager until the handshake arrives, so it buffers each port's messages and replays them through the hub, in arrival order, on adoption — no early `appdata-attach` is lost
- `isCatalogReady()`, `platformWarmSession` (`markPlatformWarm` / `isPlatformWarm`)
- `ConfigManager.init({ mode: 'attach' })` — attach-only init for warm worker sessions
- `SharedWorkerDataServicesHub` — worker state machine (providers, cache, fan-out); attach with matching `extra` overlay (e.g. same historical `asOfDate`) late-joins without a second upstream `restart`; **`hydrateCatalog()`** preloads `ConfigCatalogCache` after ConfigManager init; **`get-config`** resolves the requested provider on demand (`ConfigCatalogCache.ensure`) so a grid attaches without waiting on the full preload; **`buildIntrospectSnapshot()`** / `hub-introspect` RPC for live provider + AppData diagnostics; **`provider-running`** RPC — O(1) scalar "is this provider running?" probe for the window-open path (never serializes hub state); all fan-out is inline from the hub thread (encode once, flat byte copy per port; the per-subId fan-out worker pool was removed 2026-07 — see `docs/hub-fanout-optimizations.md` §12); frames encode + broadcast only when the provider has data listeners (stats-only subscribers keep the cache warm without encode work); **`subscription-lost`** event + client auto re-attach when hub evicts stale subscribers; extended ping grace (`SUBSCRIBER_PING_TIMEOUT_HIDDEN_MS`) when client reports `meta.hidden`; subsystems live in sibling modules — `SubscriberRegistry` (listener membership, O(1) `subId` index for ping/detach/evict), `HubAppDataService` (AppData store + RPC; mirror-attach IndexedDB resync throttled to `APPDATA_RESYNC_MIN_INTERVAL_MS`, editor saves still resync eagerly via `config-invalidate`), `providerEmit.ts` (upstream event application + encode), `replayCache.ts` (bucketed late-join replay: live ticks dirty only touched ≤500-row buckets, attach re-encodes dirty buckets and reuses clean buffers), `hubCatalogRpc.ts`, `hubIntrospect.ts`, `hubStats.ts`
- `ConfigCatalogCache` — worker-side in-memory data-provider catalog (`loadAll`, `get`, `getProviderConfig`, `list`, `invalidate`, `upsert`); `ensure(providerId)` resolves one provider on demand (cached row, else a single `ConfigManager` read with no full `loadAll`) and caches it so the synchronous attach lookup finds it; used by hub before cfg-free attach
- `DataProviderConfigStore` / `AppDataConfigStore` — persist provider rows with `ConfigManager.getAppId()` (no hard-coded `TestApp`); re-stamps `appId` on every save so drifted rows realign to the deployment scope
- `AppDataMirror` — synchronous main-thread view of AppData
- `WorkerAppDataStore` — worker-side IndexedDB persistence

#### Provider primitives

- `IDataProvider` — uniform client contract (`start` / `stop` / `refresh` / `restart`, sync getters, event registrars); types + `ProviderClientAdapter` hub adapter (Phase 3)
- `IDataProviderFactory` — `getProvider(providerId)` factory surface
- `ProviderClientAdapter` — client-side `IDataProvider`; cfg-free subscribe, `SnapshotReassembler` snapshot assembly, `getProvider()` on hub bundle. `getData()` returns the last snapshot commit by reference (not copied, not updated on live ticks). `onReset` deliveries update snapshot subscribers (mid-stream STOMP reconnect). `start()` resolves its one provider via the worker's on-demand `get-config` (single-row read, no full-catalog gate) so attach is race-safe even mid-preload
- `resolveProviderCapabilities()` — transport capability flags for STOMP / REST / mock / appdata
- `DataServicesHubBundle` / `ResolvedDataServicesHubBundle` — hub bundle from `ensurePlatformReady` / `ensureDataServicesHub`. Hydration is split into parallel signals: `appDataReady` (AppData mirror snapshot) + `catalogReady` (worker catalog preload), with `ready = Promise.all([appDataReady, catalogReady])` for full-hydration callers. Plus `stopProvider`, `dispose`, legacy client handles
- `ProviderCapabilities` — streaming / realtime / refresh / restart flags per transport
- `ProviderHandle` — `stop()` + `restart()` lifecycle
- `ProviderEmit` — callback for rows / status / byte-size / rowsReceived / timing events
- `ProviderEmitEvent` — structured event union (`rows`, `status`, `byteSize`, `rowsReceived`, `timing`)
- `ProviderTimingSample` — connection-latency sample (`requestSentMs`, `firstMessageMs`) emitted by streaming transports on lifecycle transitions for the Diagnostics pane
- `registerProvider()` — runtime/test factory registration

#### Transports

- **STOMP** (`startStomp()`)
  - WebSocket via `@stomp/stompjs`
  - Worker-side `{{name.key}}` resolution on every connect/restart via `appDataLookup` (SharedWorker AppData mirror); `restart({ asOfDate })` overlay **wins** for historical date keys (`asOfDate`, `position-asofdate`) so toolbar reload is deterministic
  - Fail-closed gates before broker wire: `assertAppDataResolved()` on full resolved cfg; `validateStompWireReady()` on subscribe/publish destinations + `requestBody` (no `{{...}}` downstream); `validateStompPathContract()` rejects historical listeners paired with live-style `/rate/batch` triggers
  - Unresolved `{{...}}` or invalid wire paths → `status: error` (no subscribe/publish; no silent infinite loading)
  - Snapshot phase → `snapshotEndToken` → buffered `{ rowsReceived }` progress, then chunked cache replace
  - Live phase → keyed deltas via `applyTransactionAsync`
  - Snapshot flush chunking (`cfg.snapshotChunkSize`, default `SNAPSHOT_CHUNK_SIZE = 500`) to stay under 50 ms long-task budget — configurable in code or the provider editor
  - Live conflation + trailing-edge throttle (`cfg.throttleMs` window; `cfg.conflateByKey` upsert key, defaults to `keyColumn`) via `bufferedDispatch()` — coalesces same-key ticks in the worker before fanout; `throttleMs` unset defaults to a 25 ms window (explicit `0` or `throttleEnabled: false` = immediate passthrough); conflation-map batches emit with `uniqueKeys: true` so the hub skips its per-batch duplicate-key Set; probe path bypasses it. Two explicit master switches (default ON): `cfg.throttleEnabled: false` fans out every delta immediately while keeping the `throttleMs` value; `cfg.conflateEnabled: false` disables conflation even when `keyColumn` could supply a key (the off-switch the `?? keyColumn` fallback otherwise prevented)
  - Field projection (`cfg.projectFields`, default off): each incoming row is pruned at frame-parse time to the `columnDefinitions[].field` paths + `keyColumn` (`createFieldProjector` / `collectProjectionPaths` in `fieldProjection.ts`) — wide upstream objects (e.g. 2000 fields when the blotter shows 200) never reach the snapshot buffer, hub cache, or any window; nested `a.b.c` paths copy just the needed subtree, prefix paths win over longer ones; changing visible fields requires a provider Restart; `probeStomp` (Infer Fields) always sees raw rows
  - Thin field-level deltas (`cfg.thinDeltas`, default off) and columnar wire format (`cfg.wireFormat: 'json' | 'columnar'`, default json) — hub fan-out knobs honoured by `SharedWorkerDataServicesHub` for any keyed provider (see "SharedWorker data services" below); both require a provider Restart to change
  - Restart overlay (`extra`) for historical `asOfDate`; internal `__`-prefixed overlay keys (e.g. the Restart button's `__refresh` cache-buster) are stripped before the trigger body reaches the broker
  - `restart()` arriving while the initial connect is still pre-dial (the Hub's CREATE+RESTART / RESTART+RECONFIG paths call it synchronously after `startStomp()`) adopts its overlay into the in-flight start — one dial, no torn-down-then-redialed duplicate session
  - `restart()` tears the previous session down **off the critical path** — the synchronous cleanup (unsubscribe + null old callbacks + `reconnectDelay=0`) runs immediately and `connectGeneration` fences stale frames, but the stompjs `deactivate()` WebSocket close is fire-and-forget so the new dial doesn't wait on it (previously the awaited graceful close could add a full heartbeat interval (~4s) to "Restart → request sent" when a broker was slow to ack `DISCONNECT`)
  - Lifecycle timing trace (`[v2/stomp][trace]` / `[v2/hub][trace]`, SharedWorker console): restart → teardown → dial → handshake → trigger publish → end-token, each line stamped with elapsed-since-Restart-click (`extra.__refresh` epoch) plus the effective stompjs `reconnectDelay` on socket error/disconnect — pinpoints whether a slow restart is teardown, reconnect backoff, or server snapshot time
  - `connectStomp()` — pure socket connection test for the editor's "Test Connection" button: opens the WebSocket + STOMP session and resolves on the broker handshake (`onConnect`) without subscribing, publishing a trigger, or waiting for rows (`reconnectDelay: 0` so a failed test fails fast)
  - `probeStomp()` — one-shot data probe (subscribe + trigger + collect up to `maxRows`); backs the editor's Infer Fields flow, which needs real rows to sample
- **REST** (`startRest()`)
  - One-shot HTTP (GET/POST), snapshot-only — no live tail after `ready` (IDataProvider: no `onTick`)
  - Restart overlay merged into POST body
  - `probeRest()` — one-shot probe for editor flows
- **Mock** (`startMock()`)
  - Synthetic data with tunable row count + emit rate
  - `probeMock()` — one-shot probe

#### SSRM query plane

- `ISsrmDataProvider` — client contract for server-side row model grids (`getRows`, `configureExpressions`, tick subscription, lifecycle); `SsrmTickPayload` for live fan-out
- `@wellsfargo-starui/data/ssrm-engine` subpath export (`packages/data/package.json` `exports["./ssrm-engine"]` → `host-data/dist/runtime/ssrm/index.{js,d.ts}`) — the transport-agnostic engine (`SsrmServer`, `RowStore`, `QueryEngine`, `SsrmFlushEvent`/`SsrmStats` types, `ICacheIngest`) importable standalone, with no SharedWorker/hub/RPC dependency; `engineContract.test.ts` and `scripts/bench-ssrm.mjs` both consume it this way
- `SsrmProviderClientAdapter` — client-side `ISsrmDataProvider` over the SharedWorker SSRM RPCs (`SsrmProviderClientAdapterOpts`)
- `SsrmPlane` — per-provider query plane attached in the hub for `stomp-ssrm` / `mock-ssrm`; owns filter, sort, group, aggregation, quick-filter, set-filter-value and status-bar evaluation so the client ships only block requests
- **Per-query memo cache** (`QueryEngineOptions.orderCacheSize`, default 24, `0` disables) — the filtered set, the sorted leaf/group order, the grand total and pivot result fields are memoised per query shape and bound to `RowStore.getRevision()`, so any ingest invalidates them rather than serving stale rows. `startRow`/`endRow` are deliberately absent from every key: paging a query reuses one order instead of re-scanning and re-sorting the whole store per 100-row block. At 100k x 130 a warm block drops from ~120 ms to ~0 ms and a 20-block scroll from ~2.5 s to ~118 ms; memoising the aggregates matters as much as the order, since a configured `valueCols` otherwise re-aggregates the full set per block (~59 ms). Entries are LRU-evicted and hold row references, not copies
- **`QueryEngine.setOrderCacheSize(n)`** — resizes the memo at runtime; shrinking evicts the oldest entries down to the new size immediately. `SsrmServer` calls it after every `setViewportInterest`/`clearViewportInterest` mutation with `max(24, liveSessions × 8)`, so one worker-side plane serving 10+ blotters (each with its own sort/group/filter shape) scales the memo with live session count instead of thrashing a static 24-entry LRU — the filtered-set scan for a shared filter is already keyed independently of `sortModel`/`groupKeys`, so it's shared across sort variants of one filter regardless of memo size
- `RowStore` no longer maintains a `column → value → Set<key>` inverted index. Nothing read it — `getUniqueValues` had no callers and set-filter values come from `getUniqueValuesFiltered`, which scans the live row map. Removing it cut the 100k x 130 plane from ~1.84 GB to ~108 MB, snapshot ingest from ~6.4 s to ~1.65 s, and a 500-row tick from ~56 ms to ~13 ms. `getUniqueValues` is retained and now scans (returning `[]` for an unknown column, as the index did)
- `npm run bench:ssrm` (`scripts/bench-ssrm.mjs`, `ROWS`/`COLS`/`BLOCK` env overrides) — measures ingest, cold/warm blocks, a 20-block scroll and tick cost against the built runtime, so these characteristics can't silently regress. **Windowed publish** section: two `SsrmServer`s built from the same `./ssrm-engine` dist entry, `publishWindowMs: 0` (passthrough) vs. `200` (fake-timer-driven), pump 25 frames of an 800-row tick through each and report `getStats()` flush/`updatesAccumulated`/`keysFlushed` side by side — quantifies the flush and key-conflation ratio a windowed provider buys over passthrough
- `isSsrmProviderType()` — whether a `providerType` gets a plane; `resolveSsrmKeyColumn()` — key column → stable row id field
- `SsrmGetRowsRequest` / `SsrmGetRowsResult` — block request/result types
- RPC kinds: `ssrm-get-rows`, `ssrm-set-viewport`, `ssrm-configure-expressions`, `ssrm-status-bar`, `ssrm-set-filter-values`; live ticks fan out as `ssrm-tick` events keyed by viewport interest
- **Block-scoped viewport interest** — `ssrm-set-viewport` carries an optional `scope { blockKey, queryId, hasFilter }` (`ViewportInterestScope`). Interest **accumulates** across the blocks of one query and resets when `queryId` changes (filter / sort / group / pivot / quick-filter), so every block AG Grid still holds cached keeps ticking rather than only the most recently loaded one; retention is bounded per session by `SsrmServerOptions.maxInterestBlocks` (default 20, mirroring the grid's `maxBlocksInCache`) with least-recently-loaded eviction. Omitting `scope` keeps the previous replace-wholesale behaviour
- Session viewport keys are released on every teardown path — `detach`, `port-close` (via `SubscriberRegistry.removeByPort().released`) and stale-heartbeat eviction — so a plane shared by several grids doesn't retain (and re-walk on each tick) the keys of sessions that are gone
- **Off-viewport tick fan-out is filter-gated** (`SsrmServer.wantsUnmatchedRows`) — when a tick touches nothing in a session's viewport, the full changed set is forwarded only to a session reporting `hasFilter`, which needs it to spot rows *entering* its filter (`bindSsrmTicks` re-tests them). An unfiltered session receives no rows instead of paying to enrich and post rows it discards
- SSRM aggregations return **blank (`null`) rather than `0`** for `min` / `max` / `avg` over a group where no row has a value (`aggregations.ts`); `count` still counts to 0 and `sum` keeps its additive identity. A 0 price or 0 spread is real data, so 0 could not mean "no values"
- SSRM RPCs carry a deadline — `SharedWorkerDataServicesClientOpts.ssrmRpcTimeoutMs` (default `DEFAULT_SSRM_RPC_TIMEOUT_MS` = 30 s, `0` disables). A lost hub reply now rejects, so the datasource reaches `params.fail()` instead of leaving the AG Grid block on "Loading…" forever (AG Grid never re-requests a block it believes is in flight); the timer is cleared on reply and on `close()`
- `SsrmProviderClientAdapter.setViewport` resolves silently once the provider has stopped (it is fired-and-forgotten by the datasource, so a rejection would surface as an unhandled rejection); `getRows` is `async` so a not-started provider **rejects** rather than throwing synchronously past the datasource's `.catch`
- **Windowed tick fan-out** — the hub fans `ssrm-tick` from `SsrmServer.onFlush` (a revision-stamped, trailing-edge-windowed, key-conflated notice) instead of the raw per-tick stream. `SsrmPlaneOpts.publishWindowMs` (read from `ProviderConfig.publishWindowMs`, default `0` = passthrough, one flush per store tick — today's per-frame behaviour) accumulates and dedupes changed keys across a window; `SsrmPlane.rowsForKeys()` reads rows fresh from the store at flush time, so conflation is "free" — a key touched N times in one window ships once, with the last value. The hub threads its own injectable `setTimer`/`clearTimer` into the plane so fake-timer tests control the flush window; `SsrmPlane.dispose()` (called from `disposeSsrmPlane` and hub `dispose()`) unsubscribes from the store and clears any pending window timer. Cache ingest (`upsert`/`replaceSnapshot`) is never gated by the window — only the tick notification is. **Consistency guarantee**: `SsrmFlushEvent.revision` is stamped at flush time (not accumulation start), and every session reads the same `RowStore` — so a spike that retreats within one window (e.g. `upsert` to a huge value then back down before the window fires) is never observed by any grid, only the settled final value, and two sessions issuing the identical query at the same revision get bit-identical results (`grandTotalData` is the same memoised object — see `engineContract.test.ts`'s `cross-grid consistency acceptance` suite). Star-demo-ssrm opts into a 200 ms window via `seed.json`'s `publishWindowMs` on the `stomp-ssrm` provider payload
- **Observability counters** (`SsrmServer.getStats(): SsrmStats`, additive over `CacheStats`) — `sessions` (live viewport-interest sessions), `memoHits`/`memoMisses` (cumulative `QueryEngine` order-memo, see {@link QueryEngine.getMemoStats}), and flush-conflation counters `flushes` (cumulative flush events, passthrough + windowed + snapshot), `updatesAccumulated` (cumulative pre-dedup key updates) and `keysFlushed` (cumulative post-dedup keys shipped) — `updatesAccumulated / keysFlushed` is the conflation ratio; `scripts/bench-ssrm.mjs`'s "Windowed publish" section reports it for a passthrough vs. 200 ms-windowed engine side by side
- **Per-session expression rules** (`ExpressionRuleStore` in `expressionRules.ts`) — `configureExpressions`/`getRows`/`enrichRows`/`calculatedFields` all take an optional `sessionId` end to end (`QueryEngine` → `SsrmServer`/`SsrmPlane` → `ssrm-configure-expressions`/`ssrm-get-rows` RPCs → `SharedWorkerDataServicesClient` → `SsrmProviderClientAdapter`, which threads its own attach `subId`). A session with its own configured rules (even an empty set) resolves to exactly those; every other session — including a sessionless `configureExpressions` call — resolves to the rules configured under the internal `''` global bucket, so two blotters on the same provider with different calculated columns no longer clobber each other. `SsrmServer.clearViewportInterest` drops the session's own rules (`QueryEngine.clearSessionExpressions`) on every teardown path. Memoised query-order cache entries hold raw, pre-enrichment rows — enrichment always runs on the sliced page after cache retrieval — so sharing one order-cache entry across sessions with different rules is safe without keying the cache by session. The grid-side `useSsrmExpressionBridge` stays a single-arg, sessionless caller; the adapter supplies the session automatically

#### Stream subscription

- Two-phase: snapshot promise + `onUpdate`/`onReset`/`onStatus`/`onRowsReceived`/`onSnapshotCommit`
- `SnapshotReassembler` — client-side chunk assembly (head `replace: true` + tail `replace: false` → full snapshot on loading→ready; `onRowsReceived` progress; post-settle `onReset` / live `onTick`; accepts `replace:true` during `error` phase for STOMP reconnect ordering; commits buffered rows on `ready` after `error` when `loading` was missed)
- Late-joiner: immediate cache replay + current status on attach
- Restart attach (`attach.extra`): posts `loading` only — skips stale cache replay so reload/restart waits for the fresh upstream snapshot
- `onSnapshotCommit` — fires on every loading→ready assembly (initial + hub restarts on an existing subId)
- `LATE_JOIN_CHUNK_SIZE = 500` chunking for popouts
- Pre-encoded replay (`delta-bin`): cache replay chunks are UTF-8 JSON `Uint8Array`s built **once per cache generation** (lazy, invalidated O(1) on any cache mutation) and the same buffers are posted to every attaching port — N simultaneous window attaches cost one serialization plus N flat byte copies instead of N object-graph structured clones; client decodes back into the normal `onDelta` path
- Binary snapshot broadcast: **pre-ready** row broadcasts (initial load AND restarts — `snapshotReady` clears on every `loading`) also fan out as `delta-bin`, sliced to ≤`LATE_JOIN_CHUNK_SIZE` rows and encoded once for all attached ports — a 10-window restart costs one serialization per chunk instead of 10 structured clones; the broadcast encoding **seeds the replay snapshot** (replace chunk → chunk 0; clean key-appending chunks extend it) so the next late joiner replays with zero re-encoding. **Post-ready live ticks ≥ `LIVE_BIN_MIN_ROWS` (64) rows also fan out as `delta-bin`** — large sweep frames (all-distinct keys, immune to conflation) otherwise cost one object-graph structured clone per window per frame, saturating the worker at 3+ windows and stalling late-joiner replays behind the backlog; smaller conflated ticks stay plain object `delta`s (straight into `applyTransactionAsync`)
- Fan-out allocation discipline: data-provider `broadcastData` posts a **shallow copy per listener** (`{ ...event, subId }`) because OpenFin multi-window can defer structured-clone — reusing one envelope and rewriting `subId` mis-delivered ticks; AppData fan-out still reuses one event object (mutating `subId` between posts); a clean live batch (keyed, no intra-batch duplicates) is broadcast **by reference** inside the copied envelope — the dedup `Map`/`Set` and copied arrays are built only when a batch actually carries drops or duplicate keys; **dead-port resilience** — if `postMessage` throws on a zombie listener (window closed without `detach`, HMR, etc.) the hub prunes that `subId` and continues fan-out so other windows keep receiving ticks; `SharedWorkerDataServicesClient.close()` sends `detach` for every subscription before closing the port
- Thin field-level deltas (`cfg.thinDeltas`, default off, requires `keyColumn`): post-ready live frames broadcast as `delta-patch` events carrying only the **changed top-level fields** per row (`RowPatch { k, s?, d?, f? }`, `diffTopLevel` in `wire/rowDiff.ts`) — touch updates that change a few fields of a wide row shrink the hub→window wire by the touch ratio; inserts / non-diffable rows ship full under `f`, observably-unchanged rows are skipped entirely (free conflation); the hub cache keeps full rows so replace frames + late-join replay are unaffected; patch batches ≥ `LIVE_BIN_MIN_ROWS` encode to UTF-8 JSON once and byte-copy per port; the client mirrors full rows per thin subscription (`sub-init` handshake carries `keyColumn`) and merges each patch into a **new** full-row object — the rows-are-immutable-values contract holds, the merge contract lives only in `SharedWorkerDataServicesClient`
- Columnar wire format (`cfg.wireFormat: 'columnar'`, default `'json'`): all binary frames (cache replay, pre-ready snapshot fan-out, large live ticks) encode via the typed-array columnar codec (`wire/columnarCodec.ts`, `COL1` frames) — numbers travel as raw little-endian Float64, booleans as bitmaps, strings/nested objects as one `JSON.parse` per **column**, presence/null bitmaps preserve ragged rows and null-vs-absent — cutting each window's main-thread decode several-fold on number-heavy feeds; frames that don't qualify (non-plain-object rows) fall back to JSON per chunk (`DeltaBinEvent.enc` discriminates per event); `tryEncodeColumnar` / `decodeColumnar` exported from `@wellsfargo-starui/data/runtime`
- Buffering between snapshot-resolve and update registration
- Lazy provider create on first attach, reuse on subsequent attaches
- **Idle auto-teardown** — when the last data *and* stats subscriber leaves (`detach`, `onPortClosed`, dead-port prune, or missed heartbeats), `SharedWorkerDataServicesHub` calls `stopProvider` (upstream STOMP/REST/mock stops, cache cleared); re-attach cold-starts
- **Subscriber heartbeats** — clients send `{ kind: 'ping', subId, meta? }` every 15s; hub sweeps every 10s and evicts subs silent for >45s; `buildIntrospectSnapshot()` exposes per-subscriber `attachedAt`, `lastPingAt`, `stale`, and optional `meta.label` on each running provider row
- `SharedWorkerDataServicesClient` registers `pagehide` (non-bfcache) → `close()` so blotter window teardown sends `detach` for every subscription before the port dies
- `refresh-provider` RPC — replay hub cache to one subscriber in chunked `delta-bin` frames with `status: loading` → chunks → `status: ready` (no upstream I/O); `SubscribeHandle.refresh()` / `IDataProvider.refresh()`; drives the **Refresh view** busy overlay in `MarketsGridContainer`
- `attach.extra` → `restart(extra)` on running provider; when the attach also carries `cfg` (editor Restart button), the slot is **rebuilt from the new cfg** (`recreateProvider`) so the reconnect picks up edited connection/column/behaviour settings instead of the stale config the slot was created with
- Slots register in the provider map **before** their transport factory runs, so the synchronous `status: loading` every transport emits on start broadcasts to all attached windows — peer blotters show the refresh overlay the moment any window restarts the shared provider (previously that first emission was dropped by the unregistered-slot guard and peers erratically missed the restart signal)
- `stop` request — explicit upstream teardown; stats listeners receive one zeroed snapshot (subscription stays registered for the diagnostics pane until the client detaches)

#### Wire protocol (v2)

- Client→worker requests: `AttachRequest`, `DetachRequest`, `StopRequest`, `HubReadyRequest`, `GetConfigRequest`, `ListConfigsRequest`, `ConfigInvalidateRequest`, `RefreshProviderRequest`, `HubIntrospectRequest`, `AppDataRequest` (attach/detach/set/upsert/remove); `AttachRequest.cfg` optional when `providerId` is in worker catalog
- Worker→client catalog events: `catalog-ready`, `config-snapshot` (responses for hub-ready/get/list/invalidate/hub-introspect)
- Worker→client events: deltas (`{ rows, replace? }`), `delta-bin` (pre-encoded chunk `{ buf, enc?, replace? }` — `enc: 'json' | 'col'` selects UTF-8 JSON vs typed-array columnar; used for cache replay, pre-ready snapshot fan-out, AND post-ready live ticks ≥ 64 rows), `delta-patch` (thin field-level deltas `{ patches? | buf? }` of `RowPatch { k, s?, d?, f? }`), `sub-init` (thin-delta handshake carrying `keyColumn`), status, `rows-received` (upstream snapshot buffer progress), byte-size, stats, AppData (snapshot/delta/ack)

#### Statistics

- `ProviderStats` — `rowCount, byteCount, cacheBytes, msgCount, msgPerSec, publishPerSec, publishPerMin, snapshotFetchMs, restartRequestMs, firstMessageMs, subscriberCount, startedAt, lastMessageAt, errorCount, lastError`; `cacheBytes` is the serialized worker-cache footprint (exact from the memoized replay-snapshot chunks when present, else one-sampled-row × rowCount estimate) — the number `projectFields` shrinks, surfaced in the Diagnostics tab as "Cache size (serialized)"; `restartRequestMs` / `firstMessageMs` are provider-reported connection-latency samples (Restart click → upstream request sent; request sent → first upstream message), `null` until reported and reset on each (re)start
- 1 Hz sampler with 5 s upstream + 60 s publish windows
- Self-disabling when no stats listeners
- Per-provider cache (`Map<rowKey, row>` keyed by `cfg.keyColumn`)
- keyColumn-mismatch diagnostics: rows whose `composeRowId(row, cfg.keyColumn)` resolves null (name/case mismatch, e.g. `POSITIONID` vs `positionId`) are dropped from the cache + fan-out; the hub now warns once per (re)start cycle in the SharedWorker console (naming the key + sample row fields) and exposes `keyDropCount` on the `hub-introspect` row so "provider fetched data but the grid is empty" is no longer silent

#### AppData system


- `AppDataRow` — `configId, name, description, isPublic, values, userId`
- `AppDataMirror`:
  - Synchronous `get(name, key)`
  - Async `set`, `upsertConfig`, `remove` (post to hub)
  - Two-index tracking (`byConfigId`, `byName`)
  - Pending-ack handler for durability
  - `ready()` promise + `subscribe()` reactivity
- Worker is sole IndexedDB writer
- `SharedWorkerDataServicesHub.resyncAppDataFromStore()` — reload AppData provider rows from IndexedDB on mirror re-attach and after catalog `config-invalidate` (AppData editor saves)

#### Template resolution

- `{{name.key}}` — AppData token substitution (React `useResolvedCfg` for column defs; worker `startProvider({ appDataLookup })` + STOMP `onConnect` for wire destinations)
- `findUnresolvedAppDataTokens()` / `assertAppDataResolved()` — scan cfg for remaining `{{name.key}}` tokens; non-STOMP providers throw at `startProvider` when lookup is wired; STOMP fails on connect before wire
- `validateStompWireReady()` / `validateStompPathContract()` — STOMP subscribe/publish + historical vs live path contract (mirrors `stomp-view-server` wire rules)
- `[identifier]` — session-unique bracket tokens (worker-side)
- `resolveBracketCfg()` — per-attach cache so same token reuses same value
- `traceStompProviderCfg()` / `traceStompWireDestinations()` — opt-in console audit (`globalThis.__STARUI_TEMPLATE_TRACE__ = true`)

#### Platform bootstrap (Phase 0.5)

- `PlatformBootstrapConfig` — unified `appId`, `userId`, REST/seed URLs from manifest or `app-config.json`
- `validatePlatformBootstrapConfig()` — require non-empty identity; warn when `useRest` without REST URL
- `DEV_PLATFORM_BOOTSTRAP` — shared test/dev fallback (`TestApp` / `dev1`)
- `resolvePlatformBootstrapFromJson()` — fetch `/app-config.json` for web apps
- `resolvePlatformBootstrapFromObject()` — parse inline/test bootstrap objects
- `PlatformBootstrapConfigError` — validation / fetch failures
- `ensureConfigReady()` — config-only bootstrap (ConfigManager init, no hub; singleton per `appId`)
- `ensurePlatformReady()` — ConfigManager init + SharedWorker hub bootstrap (singleton per `appId`; reuses `ensureConfigReady`'s ConfigManager). Returns once config + hub connection are established; full hydration (`bundle.ready`), `markPlatformReady`/`markPlatformWarm`, and AppData-bootstrap hooks (off `bundle.appDataReady`) all settle in the background so the window paints without waiting on catalog/AppData
- `ensureDataServicesHub()` — lazy per-`appId` hub singleton; shared per-window `HubConnection` + `bootstrapDataServices`; resolves at hub-connect and surfaces `appDataReady` + `catalogReady` (kicked off in parallel) plus combined `ready`; returns `ResolvedDataServicesHubBundle`
- `ResolvedDataServicesHubBundle` — hub bundle + legacy `client` / `appData` / `configManager` handles
- load-timing marks (`loadMarks.ts`) — `markConfigReady` / `markHubConnected` / `markAppDataReady` / `markCatalogReady` / `markPlatformReady` stamp `performance.mark` milestones (name `starui:<milestone>`, `startTime` = ms-from-`timeOrigin`) along the bootstrap chain; `readLoadMilestone()` / `readLoadTimings()` read them back; `markLoadMilestone()` is the generic form. Idempotent per realm, no-op without `performance.mark`. Measurement only — e2e time-to-interactive budgets read `starui:platform-ready`

#### Bootstrap

- `bootstrapDataServices()` — coordinate client + worker
- `createDataServicesClient()`, `createDataServicesWorker()`
- `bootstrapDataServicesWithWorkerAsset()` — load bundled worker asset (`bootstrapWithWorkerAsset.ts`)
- `createDataPort()` — `DataPort` factory for app startup

#### DataProvider configuration service

- `DataProviderConfigService` — CRUD wrapper for DataProvider configs
- REST mode (default) — UnifiedConfig REST API
- Local mode — routes through injected `DataProviderLocalBackend` (e.g., `ConfigManager`)
- `DataProviderLocalBackend` — `upsert`, `delete`, `getById`, `listByUser`
- Mapping: `DataProviderConfig` ↔ `UnifiedConfig` with `componentType='data-provider'`
- `configure(apiBase)`, `configureLocal(backend)`, `expectLocalBackend()`

#### Inference

- `inferFields()` — schema inference from row sample
- `InferOptions` — inference behaviour controls
- Used by editor Test-Connection / Infer-Fields flows

#### AppData bootstrap hooks

- `runAppDataBootstrap()`, `createAppDataBootstrapContext()` — register and run named AppData seed hooks at platform init
- `AppDataBootstrapHook`, `AppDataBootstrapHookRegistry`, `AppDataUpsertInput` — hook contract + upsert shape

#### Mock provider presets

- `createFiPositionsLargeConfig()`, `createFiPositionsSmallConfig()` — canned FI positions provider configs for demos/tests

---

### 6.3 `@wellsfargo-starui/react/data/runtime`

**Path:** `packages/react-core/host-data-react` (the bare `./data` subpath was
cut in the Phase-4 barrel diet — `./data/runtime` is the public entry)
**Purpose:** React bindings for `@wellsfargo-starui/data` — provider + focused hooks for data subscriptions.

- `DataHubProvider` / `PlatformProvider` (alias) — hub-first provider; `platform` from `ensurePlatformReady()` or self-bootstrap via `bootstrapConfig` + `workerScriptUrl`; optional `hubInspector` mounts **Alt+Shift+S** dev drawer (default on in development)
- `DataServicesProvider` — legacy wrapper over `DataServices` bootstrap result; exposes `appId` + `userId` React context
- `usePlatformIdentityOrNull()` — read bootstrap `appId`/`userId` from `DataHubProvider` / `DataServicesProvider`

- `DataServicesProvider` — `configStore` calls `client.invalidateConfig()` after editor `save`/`remove`

**Public exports:** `./data/runtime` (the `./data` duplicate subpath was removed — zero importers; everything goes through `./data/runtime`)

#### One-call bootstrap (`createStarui`)

- `createStarui({ appId, userId, providers?, storage?, seedConfigUrl?, configServiceRestUrl?, workerScriptUrl?, fallback? })` — the single front door for a starui app: boots the platform via `ensurePlatformReady`, seeds catalog provider rows **create-if-missing** (each draft MUST carry a deterministic `providerId`; existing rows — e.g. later editor edits — are never overwritten), builds the profile-storage factory (`'localStorage'` default with one memoized `LocalStorageBundleAdapter` per gridId, or `'config'` → `createConfigServiceStorage` over the booted `configManager`), and returns `{ Provider, appId, userId, storage }`. `Provider` renders `fallback` until boot resolves, then `DataHubProvider` + identity context — identity is declared exactly once, no per-grid identity props
- `useStaruiIdentity()` — `{ appId, userId, storage }` from the nearest `<starui.Provider>`; `null` outside one (how `<StarGrid>` enforces its mount-inside-Provider contract)
- `StaruiIdentityProvider` — identity adapter for apps with their own platform bootstrap (tiered bootstraps, workspace hosts): mounts the same identity context `createStarui()`'s Provider would, so `<StarGrid>` works under a custom boot. Pair with `useHostedStarui` (grid widgets `./widgets/hosted`) in OpenFin workspace views
- Types: `CreateStaruiOptions`, `Starui`, `StaruiIdentity`

#### Provider

- `DataServicesProvider` — context wrapper
- Lazy mode (default) — children render with `loaded:false` first
- Eager mode — suspend until `services.ready` resolves
- `userId` override for AppData ownership

#### AppData hooks

- `useAppDataStore()` — reactive snapshot + version counter
- `useAppData(providerName)` — scoped per-provider view, `get/set/setMany`

#### DataProvider config hooks

- Catalog RPC bounded replies — every async catalog handler (`get-config`, `config-invalidate`) answers **exactly once** (result, error, or 10s deadline error via `replyBounded`); late completions are never re-sent but keep side effects (row cached, `catalog-ready` broadcast), so a stalled worker-side read becomes a visible, retryable error instead of client-side silence
- `useDataProviderConfig(providerId)` — single provider row from worker catalog cache (`getProviderConfig` RPC); stale-while-revalidate on scoped `catalog-ready` (same `providerId` or `full` only); switching `providerId` drops the previous provider's cfg immediately (`cfg: null, loading: true`) instead of exposing it during the new fetch; each fetch is time-bounded (2.5s × 3 attempts, silent re-issue on no-response only — a worker boot-window loss becomes a sub-3s blip instead of a permanent spinner; explicit rejections surface immediately, keeping the stale cfg)
- `useDataProvidersList(opts?)` — list platform provider rows from worker catalog cache (`listProviderConfigs` RPC); auto-refreshes on scoped `catalog-ready`; `refresh()` for manual re-pull

#### DataProvider hook (preferred)

- `useDataProvider(providerId, opts?)` — hub-backed `IDataProvider` wrapper (`ProviderClientAdapter`); preferred over `useProviderStream` for production grids
  - `UseDataProviderOpts`: `inlineCfg` (unsaved editor draft), `autoStart` (default `true`), `trackStatus` (default `true`; `false` skips status/error state mirroring for callers that consume provider events directly)
  - `UseDataProviderResult`: `provider`, `status`, `error`, `start()`, `refresh()`, `restart(extra?)`
  - Subscribes to `onStatus` and `onError` from the adapter
- `useSsrmDataProvider(providerId, opts?)` — hub-backed `ISsrmDataProvider` (`SsrmProviderClientAdapter`) for `stomp-ssrm` / `mock-ssrm` grids (`UseSsrmDataProviderOpts`, `UseSsrmDataProviderResult`); feed the result to `MarketsGrid`'s `ssrm` prop

#### Stream & template hooks

- `useResolvedCfg(cfg)` — apply `{{name.key}}` templates; resolved identity swaps ONLY when an AppData key the cfg references changes (template-free cfgs keep their own identity), so unrelated AppData writes never cascade provider re-attaches
- `useProviderStream(providerId, cfg, listener, opts?)` — auto-detaching subscription **Deprecated.** use `useDataProvider` for catalogued providers; keep cfg only for unsaved editor drafts
  - Listener: `onDelta(rows, replace)`, `onStatus(status, error)`
  - `refresh(extra)` re-attaches with overlay
- `useUserIdFromContext()` — read effective `userId` from `DataHubProvider` / `DataServicesProvider`

#### Statistics hook

- `useProviderStats(providerId, listener)` — 1 Hz stats with auto-detach

#### Hub inspector (dev)

- `HubInspectorDrawer` / `HubInspectorHost` — shadcn drawer listing running + idle catalog providers (display name + id, status, subscribers, cache row counts, expandable worker-loaded `cfg` JSON) and AppData rows (expandable `values`); polls `getHubIntrospect()` while open
- `useChordHotkey` — minimal chord listener for Alt+Shift+S toggle

#### Escape hatch

- `useDataServices()` — raw access to `client`, `appData`, `configStore`

#### Types & re-exports

- `AppDataView`, `AppDataHandle`, `DataProviderConfigView`, `DataProvidersListView`, `ProviderStreamHandle`
- Re-exports of `DataListener`, `StatsListener`, `AttachOpts`, `SubId`, client, stats, status, `HubIntrospectSnapshot`

#### Bootstrap helper

- `createAppDataServices()` — simplified factory
- `CreateAppDataServicesOpts`

---

## 7. OpenFin Utils

### 7.1 Host runtime (`@wellsfargo-starui/openfin/host`)

**Path:** `packages/openfin/host-openfin`
**Purpose:** OpenFin `RuntimePort` plugin (Seam #1) — only this package may import `@openfin/core`.

#### Runtime integration

- `OpenFinRuntime` — `RuntimePort` wrapping `fin.*` APIs (window, view, app identity, messaging)
- `OpenFinRuntimeOptions` — parent window name, container name, custom settings
- `resolveOpenFinIdentity()` — current window/view identity (name, uuid, instance id)
- `isOpenFin()` — **the** canonical runtime predicate (bare `fin`-global presence check); every framework package answers "are we in OpenFin?" through this one function — `declare const fin` is allowed only inside `packages/openfin`
- `getCurrentView()` — current view reference (null in window contexts / outside OpenFin)
- `getFinMe()` (+ `FinEntityLike`) — narrow structural `fin.me` handle (getOptions / updateOptions / on / removeListener / getCurrentWindow / interop), null outside OpenFin; the seam behind view-options readers (`useViewTabTitle`, `useHostedIdentity`, the grid's per-view active-profile source)
- `getOpenFinWindowIdentity()` — `fin.me.identity` `{ uuid, name }` strings or null; per-view unique (echo-suppression source ids, notification platformUuid)
- `OpenFinIdentitySources` — identity priority (localStorage → URL → window name → defaults)

#### InterApplicationBus seam

- `publishIabTopic(topic, payload)` — IAB publish; resolves as a noop outside OpenFin, rejections propagate inside
- `subscribeIabTopic(topic, handler)` — wildcard-uuid (`{ uuid: '*' }`) IAB subscription returning a disposer; noop outside OpenFin. Consumers: dock/registry editors, import dialog
- `connectIabChannel(name)` (+ `IabChannelClient`) — IAB Channel client connect; resolves null outside OpenFin / without the Channel API. Consumer: `useWorkspaceSaveEvent`

#### Interop seam

- `getInteropClient()` (+ `InteropClientLike`) — `fin.me.interop` structural handle, undefined outside OpenFin
- `isInteropAvailable()` — true when the interop client is reachable (a platform view/window); drives the link-transport choice in `StarGrid`

#### Platform/window control seam

- `createPlatformView({ url, customData })` — `fin.Platform.getCurrentSync().createView`; false-noop outside OpenFin. Consumer: registry editor test-launch
- `closeCurrentWindow()` — `fin.Window.getCurrentSync().close()`; noop outside OpenFin. Consumer: import dialog

#### Popout lifecycle

- `openFinWindowOpener` — popout factory (formatting toolbar, providers editor, help); self-disables (returns undefined) without the `fin.Window.create` capability
- `debugOpenFin` — opt-in OpenFin environment diagnostics
- `openOpenFinPopout(kind, opts)` (+ `OpenFinPopoutOpts`) — **the** OpenFin URL-window opener: wrap-existing → foreground → navigate-when-url-differs, else `platform.createWindow` (workspace-aware: snapshot-saveable, dockable); optional `windowOptions` spread extends/overrides the creation defaults (e.g. `contextMenuSettings`). Backs `OpenFinRuntime.openSurface` AND the platform's `openChildToolWindow` — one implementation, no duplicated helpers

#### Window options subscription

- `subscribeWindowOptions` — listen for `fin.me.getWindowOptions()` changes

#### Window focus subscription

- `subscribeParentWindowFocused(cb)` — fan-out subscription to the parent
  OpenFin window's `focused` event (one runtime listener shared by all
  subscribers, mirroring `subscribeWindowOptions`); the alt-tab signal that
  fires even when the runtime never hands web-contents focus back to a view.
  Noop dispose outside OpenFin
- `focusCurrentOpenFinHost()` — `fin.me.focus()`: hand web-contents (keyboard)
  focus back to the current view/window; noop outside OpenFin

#### Cross-window theme sync

- `subscribeThemeBroadcast(onTheme)` — subscribe a window to the dock theme
  toggle on BOTH transports the dock fans out on: IAB `theme-changed` with a
  wildcard sender uuid (`{ uuid: '*' }`) **and** same-origin `storage` events on
  `THEME_STORAGE_KEY`. Returns a disposer. Used by tool windows that mount
  outside the `StarGridApp` / `OpenFinRuntime` shell (config browser,
  data-provider editor, workspace setup) so they flip with the rest of the
  platform; `OpenFinRuntime` itself reuses the shared `readThemePayload` parser.
- `readThemePayload(msg)` — parse a `theme-changed` payload, accepting both the
  `{ theme }` and legacy `{ isDark }` shapes.

#### Notifications seam

The single place that touches `@openfin/workspace/notifications`, so framework
adapters (e.g. `@wellsfargo-starui/grid` alerts) dispatch via this injected seam instead
of importing `@openfin/*` directly (architecture boundary).

- `loadOpenFinNotificationsApi()` — dynamic, runtime-only loader; resolves
  `null` in non-OpenFin apps
- `dispatchOpenFinNotification(api, input)` — register + create a notification
- `OpenFinNotificationsApi`, `OpenFinNotificationInput` — seam types

---

### 7.2 `@wellsfargo-starui/openfin`

**Path:** `packages/openfin/openfin-platform`
**Purpose:** OpenFin workspace shell — dock, home, notifications, child windows, config import/export.

**Chrome theming:** [`docs/guides/design-system-upgrade-and-openfin-palette.md`](guides/design-system-upgrade-and-openfin-palette.md) § OpenFin palette integration.

**Public exports:**

- `.` — main platform API (workspace init, config, dock, launch)
- `./config` — config-only entry (no runtime deps, browser-safe)
- `./test-bridge` — test utilities
- `./dock-editor` — icon helpers only (`ICON_OPTIONS`, `iconIdToSvgUrl`, `iconIdToThemedUrls`, `parseIconUrl`); dock editor React UI lives in `@wellsfargo-starui/react/workspace-setup`

#### Workspace initialization

- `resolveSeedConfigUrl(seedUrl, providerUrl?)` — resolve relative `seedConfigUrl` (e.g. `/seed.json`) against manifest `platform.providerUrl` origin for dev and production hosts
- `initWorkspace()` — bootstrap dock + home + context menu + notifications, split into independently callable pieces: **`ensureConfigService(customSettings, providerUrl, { mode })`** (prewired-manager adoption or construct+seed; `mode: 'require-prewired'` throws loudly instead of silently constructing) and **`runPlatformScopeMigrations(log)`** (the four idempotent persisted-state sweeps; skippable per-boot via `WorkspaceConfig.migrations: false` — default ON, existing installs depend on them). `WorkspaceConfig.customActions` is genuinely merged into the platform's action map (app handler wins on id collision). `WorkspaceConfig.devTools?: boolean` gates the devtools Tools-menu entries (Developer Tools / Inspect Shared Worker / Show-Hide Provider) — default: visible in a dev bundle (`import.meta.env.DEV`), hidden otherwise; handlers stay registered either way. `WorkspaceConfig.dock.excludeTools?: string[]` hides built-in Tools-menu items by action ID (e.g. `[ACTION_EXPORT_CONFIG]`); applies to both dock2 and dock3, default shows all. Workspace chrome palettes (`CustomPaletteSet` dark/light) are resolved at init from loaded `@wellsfargo-starui/design-system/css` OKLCH tokens (`buildOpenFinPalettesFromDesignSystem` in `openfinPalette.ts`) by flipping `<html data-theme>` while sampling each scheme — dock, browser tab bar, home/store, and modals follow StarUI light/dark ramps; `defaultWindowOptions.backgroundColor` matches the active scheme backfill. Dark-chrome-only finishing (`finalizeDarkChromePalette`): `borderNeutral` is forced to a light grey and the window header surfaces (`backgroundPrimary` + `background2`) are lifted ~10% toward the foreground so the title bar / tab strip is perceptible against a dark desktop (the design-system `--card`/`--background` tokens are untouched). The `color-mix(...)` token expressions behind `brandPrimaryHover` / `brandPrimaryActive` / `brandSecondaryHover` / `brandSecondaryActive` resolve through `mixHex`, which clamps a non-finite percentage instead of emitting an invalid colour string; a palette sweep test asserts every key in both schemes matches `#RRGGBB`.
- Colour-scheme reconciliation at boot — the app owns `[data-theme]` + the canonical `THEME_STORAGE_KEY` (`starui:theme`); OpenFin separately owns and persists the dock/browser-chrome scheme, and `init({ theme: [{ default }] })` only seeds that store on first run. `initWorkspace` now asserts the app theme onto the platform inside `platform-api-ready`, before the dock registers, so chrome scheme and dock icon variants agree from first paint instead of drifting apart across relaunches. Fired without `await` (the `__of_workspace_protocol__` dispatch can hang), matching the toggle handlers.
- `WorkspacePlatformOverrideCallback` — workspace lifecycle hooks
- `workspace.options` — platform settings (name, icon, theme, notifications, dock)
- `workspacePersistence` — save/load workspace (pinned windows, dock, layouts);
  restore paths (`createView` / `createWindow`) strip legacy `view-iso-*`
  `processAffinity` values persisted by the reverted per-view isolation
  experiment back to the shared per-app renderer group
  (`stripLegacyViewIsolationAffinity.ts`) — contaminated saved pages/workspaces
  otherwise keep restoring solo renderers that Chromium freezes when the tab is
  inactive (blank blotters)
- Renderer process grouping is left to OpenFin/Chromium defaults — the platform
  override does **not** stamp `processAffinity`. Per-view isolation was tried and
  reverted: a view alone in its renderer is throttled and then frozen by Chromium
  once hidden, occluded, or inactive for a while, so blotters returned blank or
  with content lost. See [`openfin-process-isolation.md`](archive/openfin-process-isolation.md)
  for the measurements and why the perf win did not survive contact with the
  background lifecycle

#### Launch

- `launchApp()` — launch registered app by id (config overrides supported)
- `launchRegisteredComponent()` — create registered-component instance in new view; stamps `?instanceId=` and `?id=` on the launch URL (`appendLaunchIdentityParams`) so reloads and workspace GC resolve the per-instance id from the query string; the template→instance config clone runs concurrently with `createWindow` / `createView` (window appears immediately; clone lands before the view's first config read)
- `LaunchRegisteredComponentOptions` — instance config (layout, properties, parent)

#### Dock management

- `updateDockButtons()` — add/remove/reorder dock items
- `getDefaultEditorConfig()` — default dock editor config
- `recolorDockIcons()` — theme-aware icon recolour. Icon variants are flattened against `readDockTheme()`, which reads `[data-theme]` then falls back to `THEME_STORAGE_KEY` (`starui:theme`) — the key the toggle handlers actually write.
- `shutdownDock()` — graceful dock teardown
- `setExcludedDockTools(actionIds?)` — hide built-in Tools-menu items by action ID (normally driven via `initWorkspace({ dock: { excludeTools } })`)
- `ACTION_EXPORT_CONFIG` — Tools-menu action ID (pass to `dock.excludeTools` to hide Export Config)
- Dock button types: action, dropdown, folder
- `DockEditorConfig`, `DockButtonConfig`, `DockActionButtonConfig`, `DockDropdownButtonConfig`, `DockMenuItemConfig`
- Top-level dropdowns render on the dock bar as icon-bearing folders (dock3 path) — `toDock3Favorites` emits each `DropdownButton` (and the system "Tools" group) as a `DockEntry` folder with its icon, linked by id to the matching content-menu folder that owns the children. Works around OpenFin's `ContentMenuEntry` folder shape having no icon field; the dock-bar `DockEntry` folder does.
- Dock implementation toggle — `customSettings.dockVersion: "dock2" | "dock3"` (default `"dock2"`). `"dock2"` uses the classic `Dock.register` API: top-level DropdownButtons render directly on the dock bar as icon dropdowns whose options carry icons, with a normal flyout (no two-column content menu). `"dock3"` uses `Dock.init` with the content-menu/favorites model. Both read the same dock config; only the registration + rendering differ. Classic button clicks dispatch through the same `buildCustomActions` platform actions (including the theme toggle).
- `toDock2Buttons` / `toDock2Option` — convert `DockEditorConfig` to classic `Dock2Button[]` (internal to `dock.ts`; not on public barrel)

#### Inter-App Bus topics

- `IAB_DOCK_CONFIG_UPDATE`
- `IAB_RELOAD_AFTER_IMPORT`
- `IAB_THEME_CHANGED`
- `IAB_REGISTRY_CONFIG_UPDATE`
- `ACTION_LAUNCH_APP`, `ACTION_TOGGLE_THEME`, `ACTION_RELOAD_DOCK`, `ACTION_SHOW_DEVTOOLS`, `ACTION_INSPECT_SHARED_WORKER`
- `ACTION_EXPORT_CONFIG`, `ACTION_TOGGLE_PROVIDER`
- `ACTION_OPEN_CONFIG_BROWSER`, `ACTION_OPEN_WORKSPACE_SETUP`, `ACTION_OPEN_DATA_PROVIDERS`
- `ACTION_LAUNCH_COMPONENT`, `ACTION_RENAME_VIEW_TAB`

#### Persistence (config service backed)

- `saveDockConfig` / `loadDockConfig` / `clearDockConfig`
- `saveRegistryConfig` / `loadRegistryConfig` / `clearRegistryConfig`
- `getConfigManager` — resolve `ConfigManager` for current scope
- `setConfigManager` — override `ConfigManager`
- `setPlatformDefaultScope` — set default `(appId, userId)` scope
- `migrateLegacyPlatformScope` — v1 → v2 scope migration
- `realignAllConfigsToPlatformScope` — batch-realign configs

#### Config import/export

- `importConfigBundle()` — multi-table bundle import (AppConfig, UserProfile, Role, Blotter, Dock)
- `ImportBundle` — bundle shape
- `ImportMode` — `'overwrite' | 'skip-existing'`
- Validation, conflict detection, batch commit

#### Registry

- `RegistryEditorConfig` — registered-component list with instance configs
- `RegistryEntry` — `id, componentId, name, properties`
- `deriveTemplateConfigId`, `mintRegisteredInstanceId` — id generators
- `cloneRegistryTemplateConfig` — deep-clone a registered component's template AppConfigRow (profiles, customizer state, styling) onto a new `${type}-${subtype}` template id when Workspace Setup clones an entry
- `validateEntry` — runtime config validation
- `validateSingletonUniqueness` — duplicate detection
- `ValidationError` — reporting

#### Migration

- `migrateRegistryToV2` — v1 → v2 schema migration
- `RegistryEntryV1`, `RegistryEditorConfigV1`
- `readHostEnv` — read host env (`USER_ID`, `APP_ID`, `ROLE`, …)
- `isHostEnvMissing`
- `DEFAULT_USER_ID`

#### Configuration types

- `AppConfigRow` — `id, name, icon, url, launch settings`
- `UserProfileRow` — `id, theme, layout, toolbar visibility`
- `RoleRow` — `id, name, permissions`
- `WorkspaceConfig` — workspace metadata
- `PlatformSettings` — dock position, home visibility, notifications
- `CustomSettings` — per-app key/value

#### Manifest / host URL

- `manifestConfig` — OpenFin manifest (app, runtime, preload)
- `resolveRestUrl()` / `getConfigServiceRestUrlFromManifest()` — REST mode gate from `customSettings`
- `resolvePlatformBootstrapFromManifest()` — full `PlatformBootstrapConfig` from manifest (`./config` export)
- `resolvePlatformBootstrapFromCustomSettings()` — pure mapper for tests
- `CustomSettings.appId` / `CustomSettings.userId` — deployment identity fields
- `resolveHostUrl()` — environment-aware host URL (dev/staging/prod)
- `appendLaunchIdentityParams()` — stamp `?instanceId=` + `?id=` on registered-component launch URLs

#### Home (launcher)

- `home.ts` — Home integration (search, favourites, recent apps; `mapAppEntriesToSearchEntries` internal)

#### Notifications

- OpenFin notifications API integration (toast + notification center)

#### Child windows

- `openChildToolWindow` — config-browser / workspace-setup in child; a thin wrapper over `openOpenFinPopout` (`@wellsfargo-starui/openfin/host`) adding manifest-derived origin resolution (cached after the first successful lookup; failures are not cached) and the inspectable context menu (`contextMenuSettings: { enable, devtools, reload }` → right-click Inspect / Reload). The dock handler and the `open-config-browser` customAction now share this one open path
- `openDataProvidersToolWindow` — provider selector child window

#### Context menu / custom actions

- `injectRenameMenuItem` — inject "Save Tab As…" into context menu
- `createRenameViewTabAction` — tab-rename handler
- `ACTION_RENAME_VIEW_TAB`
- `RENAME_VIEW_TAB_WINDOW_NAME`

#### Dock editor UI (subpath `./dock-editor`)

- `dockEditor/iconUtils` — SVG → data URL, theming
- `dockEditor/icons` — icon library (SVG, metadata, categories)
- `dockEditor/index` — editor component + hooks

#### Icon library

- `MARKET_ICON_SVGS` — SVG sprite (markets, tools, actions)
- `svgToDataUrl`, `marketIconToDataUrl`
- `ICON_META`, `ICON_NAMES`, `ICON_CATEGORIES`
- `getIconsByCategory`
- `MarketIconName`, `IconCategory`, `IconMeta`

#### Plugin system

- `./plugin` export — workspace lifecycle wiring; app-level `StarGridPlugin` contract is in `@wellsfargo-starui/core/host`

---

## Repo tooling

### Apps and e2e — moved out

The consumer/demo apps and the Playwright suite live in a sibling repository
(`@wellsfargo-starui/apps`); this repo ships libraries only. Both consumption
tracks — source and tarball — are described in
[`APPS_REPO.md`](./APPS_REPO.md).

`@wellsfargo-starui/mcp-scaffold` (`tools/mcp-scaffold`) was **deleted**;
recover from git history if it is ever revived.

### Consumer documentation

- `docs/SIMPLIFICATION_ROADMAP.md` — the simplification effort's in-repo execution record: per-phase status + commits, the binding constraints and working method, the deviations ledger, and the remaining phases' scope
- `docs/STORAGE_KEYS.md` — browser-storage key registry: every localStorage/sessionStorage key written under `packages/`, its owning file (the only place the literal lives), durability class, and the rename-requires-migration rule
- `docs/EXPRESSION_DSL.md` — authoritative reference for the `@wellsfargo-starui/core` expression DSL (grammar, operator semantics, the full 44-function catalog, coercion/null rules, conditional sugar) plus an explicit JavaScript→DSL conversion guide written for an AI agent to translate JS expressions into DSL correctly
- `docs/OPENFIN_GRID_LINKING.md` — OpenFin grid-to-grid color linking: how to enable (`StarGrid` `contextLink`), prerequisites, manifest notes (interop needs none; optional `fdc3InteropApi` fallback), the file map, wire format, group→leaf expansion, receiver column matching, notifications, and diagnostics

## Cross-cutting architecture notes

These aren't a single feature, but they are platform invariants worth remembering when reading the inventory:

- **Seam #1 — RuntimePort** (`@wellsfargo-starui/openfin/host` vs `@wellsfargo-starui/core/host/browser`). Only OpenFin packages may import `@openfin/core`.
- **Seam #2 — React host bridge** (`@wellsfargo-starui/react/host`). All React features consume the host via `useHost()`.
- **Customizer pipeline** — `DEFAULT_MODULES` runs general-settings →
  column-templates → column-customization → calculated-columns → column-groups →
  conditional-styling → visual-excel → smart-edit → bulk-update → plus-minus → shortcuts →
  data-change-history → alerts → saved-filters → toolbar-visibility → toolbar-date-settings →
  grid-state (grid-state last so replay sees the finalized column set).
- **Storage adapter pattern** — `StorageAdapter` is the single contract. localStorage, IndexedDB, ConfigService (REST + Dexie), and in-memory all implement it.
- **Provider selection** — `MarketsGridContainer` exposes live/historical provider pickers in grid customizer → Custom Settings with grid-level persistence (`gridLevelData`). Primary toolbar still offers refresh/reload admin actions. Bare `MarketsGrid` hosts use parent-controlled `rowData`.
  - **Save-and-switch** — a provider/mode change alters `activeId`, part of the `<MarketsGrid>` key, so the grid remounts and re-hydrates the customizer from disk. The container flushes the working set via `gridHandle.saveAll()` BEFORE applying the selection, so other tabs' in-memory per-card "Save"s (e.g. a Grid Options status-bar edit) survive the remount instead of being discarded.
  - **Co-save on profile save** — `useGridLevelPersistence` subscribes to the grid's `profile:saved` event and flushes the current grid-level data (provider selection + caption + event-bindings) on every profile save (toolbar Save, customizer card Save, save-on-switch, external `saveAll`). Guarantees `gridLevelData.provider.liveProviderId` is always written alongside the profile — together with the storage adapter's OCC-retry RMW, this is what prevents a registered/ConfigService component from persisting a profile without its provider link (which booted the grid empty next launch).
- **Expression engine** — CSP-safe parser/evaluator drives calculated columns, conditional rules, and filter expressions; `tryCompileToAgString()` transpiles to AG Grid `valueFormatter` strings.
- **Theme integration** — reactive dark/light switching via `RuntimePort` + `data-theme` attribute; AG Grid theme + StarUI tokens stay in lockstep.
- **External-consumption contract** — every package is publishable standalone to teams with no repo access, and a consumer edits **no** build config. See [`docs/latest/getting-started.md`](./latest/getting-started.md) §1 for the consumer story and [`docs/PACKAGING_CHANGELOG.md`](archive/PACKAGING_CHANGELOG.md) for the history behind it. The invariants:
  - **Peers only for genuine singletons** the consumer also owns — `react`/`react-dom`, `ag-grid-*` (ModuleRegistry singleton + consumer-held enterprise licence), `@tanstack/react-query` (consumer's QueryClient), `lucide-react`. Everything else is a normal dependency so nothing extra must be installed. `@stomp/stompjs` is a dependency, not a peer.
  - **`@openfin/*` are OPTIONAL peers** on `@wellsfargo-starui/openfin` — a browser-only consumer installs **zero** OpenFin packages (verified: `node_modules/@openfin` absent). `config-browser` / `host-wrapper-react` reach OpenFin only through the `@wellsfargo-starui/openfin/config` subpath, whose graph holds `import type` references alone. OpenFin apps declare the three packages themselves, as the in-repo demos already do.
  - **Every package ships compiled `dist/`** with fully-qualified relative specifiers (`./x` → `./x.js`) and co-located `.d.ts`, plus `sideEffects: ["*.css"]` and a `files` allowlist so tarballs carry no `src/`, tests, or tsconfigs.
  - **No runtime module cycles** between or within packages.
  - `npm run pack:npm` (`scripts/pack-npm.mjs`) packs each package individually under its real name, drops `private: true`, and rewrites workspace `"*"` ranges to concrete `^version` — distinct from `npm run propagate`, which packs per-bucket tarballs for the in-repo demos only.

---

## How to maintain this file

1. Treat every PR that **adds, modifies, or removes a feature** as also having to update this file. Same commit, or an immediate `docs:` follow-up.
2. Add bullets at the **right granularity** — one bullet per importable capability, not per file.
3. Preserve the **bucket → package → functional-area** structure. New buckets go in the index at top.
4. Mark scaffolds and deprecations inline with **bold tags** (`**Scaffold.**`, `**Deprecated.**`).
5. Mark non-exported runtime behavior with **Internal** (see [Public vs internal](#public-vs-internal)). Do not list internal helpers unless they explain how a public feature works.
6. If a feature is removed, delete its bullet — do not strike it through, do not leave "removed" notes. The git history is the audit trail.
7. Keep wording short and factual. Wire-protocol details, constants, and identifier names belong in the bullets; rationale belongs in `docs/ARCHITECTURE.md`.
8. On reconciliation passes, verify bullets against `package.json` `exports` + barrel `index.ts` — not against a repo-wide symbol search alone.
