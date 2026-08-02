# MarketsGrid vs AdapTable — Gap Analysis

**Who this is for:** product owners, desk leads, and engineers evaluating how
close MarketsGrid is to an [AdapTable for AG Grid](https://www.adaptabletools.com/docs)
deployment — and where to invest next.

**How to read it**

| Section | What you get |
| --- | --- |
| [§1 Executive summary](#1-executive-summary) | One-screen verdict + strengths/gaps |
| [§2 Try it in the lab](#2-try-it-in-the-lab) | Interactive demos — change grid values per tab |
| [§3 Methodology](#3-methodology) | Scoring scale (0–100) and weights |
| [§4 Matrix](#4-feature-by-feature-matrix) | Granular row-by-row comparison (appendix depth) |
| [§5 Category roll-up](#5-category-roll-up) | Weighted % per AdapTable doc area |
| [§6 Significant gaps](#6-significant-gaps-deep-dive) | Narrative on what still hurts traders |
| [§7 Differentiators](#7-areas-where-marketsgrid-is-at-or-above-parity) | Where we match or beat AdapTable |
| [§8 Roadmap](#8-recommendations) | ROI-ranked backlog |
| [§9 Headline score](#9-how-close-is-marketsgrid-to-adaptable) | Parity % and “what if we ship P0/P1” |

**Sources:** MarketsGrid — [`docs/current-features.md`](../current-features.md) +
`packages/` tree. AdapTable — doc crawl 2026-05-23. Lab parity UI — `apps/demos/markets-grid-lab`
(last updated 2026-05-26).

---

## 1. Executive summary

| | |
| --- | --- |
| **Headline parity** | **≈ 48%** (weighted for capital-markets grids) |
| **Best in class** | Cell rendering (~80%), developer guides (~72%), theming (100%) |
| **Recently closed** | Alerts (P0 triggers + toast/bell/OpenFin), styled columns (2026-Q2) |
| **Still thin** | Pivot/aggregations, scheduled reports, annotations, AdaptableQL extensions |

MarketsGrid already covers the **platform spine** — profiles, expression engine,
conditional styling, formatters, OpenFin shell, real-time ingest — that AdapTable
assumes you will wire yourself. The visible gap is now concentrated in **desk
workflows** (pivot layouts, bulk edit, WYSIWYG export, team annotations) rather
than “no alerts / no styled columns.”

**At or near parity (≥75%):** conditional styling, display formatters, profiles,
AG Grid integration, OpenFin runtime, styled columns (heatmap / percent bar / pill /
sparkline), and **alerts** for data-change, relative-change, and row-change triggers
with toast + toolbar badge + OpenFin Notification Centre.

**Still dramatically behind (≤25%):** aggregation/observable/validation alert
families, Smart-Edit-class editing, Visual Excel + scheduled reports, Notes/Comments,
Row Forms, AdaptableQL aggregation/cumulative/quantile. **Flashing:** rich per-rule
flash via conditional styling; a standalone UP/DOWN/Neutral module remains open.

---

## 2. Try it in the lab

The fastest way to understand parity is to **drive the grid** — not only read this doc.

```bash
npm run dev:markets-grid-lab
```

Open **MarketsGrid Feature Lab** (`apps/demos/markets-grid-lab`):

1. **Gap guide** tab — short parity map (mirrors §1–§2 of this doc).
2. Any **feature tab** — grid on the left; **Demo console** rail on the right.
3. Pick a **scenario card** (e.g. *Bid spike*, *P&L loss*, *Mid tick up*) — patches live
   row values so alerts, conditional styles, formatters, and renderers react immediately.
4. Use **stream controls** — pause/play mock ticks, adjust tick interval, reset baseline rows.

| Lab tab | Scenarios to try | AdapTable topic |
| --- | --- | --- |
| Overview | Kitchen-sink profiles + P&L / yield | Layouts + core modules |
| Formatting | High yield, wide spread | Display formats |
| Cell Renderers | OAS heat, junk row, winner P&L | Styled columns |
| Formatter Toolbar | Losers strip, winner P&L, pricing ladder | Column customization |
| Column Groups | Pricing ladder, risk + yields, KRD curve | Column groups |
| Calculated | Ultra duration, spread to benchmark, liquidity surge | Calculated columns |
| Conditional Style | Mid ticks, junk row, high yield | Conditional styling + flash |
| Quick Filters | Filter pills, losers strip, HY book | Saved filter pills (FiltersToolbar) |
| Live Updates | Mid ticks + rail tick slider | Change flash / tick UX |
| Alerts | Bid spike, P&L loss, mid tick | Alert triggers + channels |
| Profiles | Preset lenses | Table layouts |

Full matrix and roadmap detail stay in **§4 onward** below.

---

## 3. Methodology

Each AdapTable feature category was scored against MarketsGrid on a
**0 / 25 / 50 / 75 / 100** coverage scale:

- **0** — Not implemented (no surface, no engine support).
- **25** — Token / partial primitive exists but no UI module or wiring.
- **50** — Half-built — primitive plus some UI, missing major sub-features.
- **75** — Mostly there — primary use cases covered, edge cases missing.
- **100** — Full or stronger equivalent.

Each category is weighted **1–10** by importance for a capital-markets grid
(10 = critical, 1 = niche). Overall parity is the weighted average.

The matrix below is **granular** — one row per AdapTable doc section that
maps to a distinct capability. Where MarketsGrid has the same capability
under a different name, that's called out in the **MarketsGrid equivalent**
column.

---

## 4. Feature-by-feature matrix

### 4.1 Framework versions

| AdapTable feature | MarketsGrid equivalent | Coverage | Weight | Notes |
|---|---|---:|---:|---|
| React integration | `@wellsfargo-starui/grid` + `@wellsfargo-starui/widgets-react` | 100 | 5 | Full React stack |
| Angular integration | `@wellsfargo-starui/grid-angular` (scaffold) | 25 | 4 | Marker export only |
| Vue integration | — | 0 | 2 | Not in roadmap |
| Custom Toolbar / Tool Panel / Settings Panel / Popups slots | Slot system in `@wellsfargo-starui/widget-sdk` + customizer SettingsSheet | 50 | 5 | SDK exists; AdapTable-style per-surface slot API not exposed |

### 4.2 Layouts

| AdapTable feature | MarketsGrid equivalent | Coverage | Weight | Notes |
|---|---|---:|---:|---|
| Table Layouts (cols, order, sizing, pinning, sort, group, filter, selection, headers, filtering, row selection) | Profiles (full AG Grid state serialised by `ProfileManager`) | 90 | 10 | Profile == Table Layout for the table case |
| Layout Wizard UI | — | 25 | 5 | Customizer panels exist, but no step-by-step wizard flow |
| Pivot Layouts (pivot cols, groups, totals, result cols, formatting, sizing, sorting) | — (raw AG Grid pivot, no customizer module) | 20 | 7 | Major gap |
| Row Groups — expand/collapse, formatting, filtering, sorting, grouped rows | AG Grid native + col customizer `applyRowGroupingConfigToColDef` | 65 | 7 | Engine support; richer UI module missing |
| Aggregations — Grand Total Rows, Weighted Averages, Only Aggregation, Formatting | — | 20 | 8 | Critical for P&L / risk views |
| Column Groups — expand/collapse, formatting | Customizer column-groups module (`composeGroups`, `groupHeaderStyleToCSS`) | 75 | 6 | Strong support |
| Master-Detail | — | 10 | 6 | Not surfaced |
| Tree Data | — | 5 | 3 | Not surfaced |
| Default Layouts / Saving / Updating / Extending / Synchronising / Monitoring | `ProfileManager` covers save/update/active/dirty/auto-save | 80 | 7 | Strong; no cross-layout extension mechanism |

### 4.3 AdapTable UI

| AdapTable feature | MarketsGrid equivalent | Coverage | Weight | Notes |
|---|---|---:|---:|---|
| Settings Panel (configurable + custom) | `SettingsSheet` + customizer modules | 75 | 8 | Strong; less pluggable than AdapTable's panel slots |
| Dashboard with tabs / toolbars / buttons / modes (Default / Inline / Collapsed / Floating / Hidden) | `PrimaryToolbar` + `FiltersToolbar` + `FormattingToolbar` (with popout) | 45 | 7 | Multiple toolbars exist; no "dashboard mode" abstraction or floating mode |
| Tool Panel (module + custom) | — (no AG Grid Tool Panel registration) | 20 | 5 | AG Grid sidebar not wired up |
| Status Bar (configurable + custom) | — (no status bar customizer; `StaleDataBanner` covers staleness only) | 25 | 5 | Sparse coverage |
| Column Menu (configurable + custom items) | AG Grid native column menu | 40 | 6 | No custom-item registration API |
| Context Menu (configurable + custom + default structure) | OpenFin rename-tab context action; no in-grid context-menu customizer | 30 | 6 | OpenFin-side only |
| Theming — custom themes, CSS variables, AG Grid themes | `@wellsfargo-starui/design-system` tokens + AG Grid adapters + dark/light/CVD | 100 | 9 | Stronger than AdapTable: token-driven, three-axis (mode + CVD) |
| UI guides — toasts, wizards, popups, custom palette, loading screen, progress, hiding, american english | `Toast` / `Toaster` / `useToast` / `Drawer` / `Dialog` / `Sheet` / portal provider | 70 | 5 | Most primitives present via `@wellsfargo-starui/ui` |

### 4.4 Core features

| AdapTable feature | MarketsGrid equivalent | Coverage | Weight | Notes |
|---|---|---:|---:|---|
| Calculated Columns — Standard | Customizer calculated-columns module + `ExpressionEngine` + `buildVirtualColDef` | 80 | 9 | Strong |
| Calculated Columns — Aggregated | — | 15 | 7 | Major gap |
| Calculated Columns — Cumulative | — | 10 | 5 | — |
| Calculated Columns — Quantile (bucketing) | — | 10 | 5 | — |
| Calculated Columns — Referencing other calc cols | Partial via expression engine | 50 | 5 | — |
| Alerts — Data Change | Customizer alerts module + `dataChange` + Monaco expression | 75 | 10 | Shipped 2026-Q2; lab: *Bid spike* / *P&L loss* |
| Alerts — Relative Change (PERCENT_CHANGE, ABSOLUTE_CHANGE, ANY_CHANGE) | `relativeChange` trigger + threshold fields | 70 | 10 | Shipped; aggregation limits still open |
| Alerts — Row Change (ROW_ADDED / ROW_REMOVED) | `rowChange` on `modelUpdated` / `rowDataUpdated` | 65 | 8 | Shipped for stream add/remove |
| Alerts — Aggregation (multi-row limits) | — | 15 | 9 | Limit monitoring — not yet |
| Alerts — Observable (reactive) | — | 15 | 7 | — |
| Alerts — Validation (rollback on bad edit) | — | 15 | 8 | — |
| Alert notifications — toast, toolbar, dashboard highlight, auto-jump, log, custom, event | Toast + `AlertsBadge` + OpenFin NC bridges; no auto-jump/custom container | 70 | 8 | Dashboard highlight / event bus hooks partial |
| Action Columns — dynamic per-row buttons, conditional visibility | — | 10 | 6 | — |
| Charting — AG Grid Charts, persistent, multi-window, external chart libs | `Chart` wrapper in `@wellsfargo-starui/ui` (Recharts) — not wired into grid | 15 | 7 | Primitive only |

### 4.5 Searching & filtering

| AdapTable feature | MarketsGrid equivalent | Coverage | Weight | Notes |
|---|---|---:|---:|---|
| Quick Search — text search, highlight matches, optional as-filter | Quick filter via `FiltersToolbar` | 40 | 6 | Missing highlighting + "search as filter" toggle |
| Column Filters — Filter Form + Filter Bar + In Filter + System Filters + Custom Filters | Floating filters + filters toolbar + `filtersToolbarLogic` + saved filters | 65 | 9 | Strong; lacks unified In-filter UI showing display values |
| Grid Filter (expression-based across grid) | — | 20 | 7 | Engine supports it via `ExpressionEngine` but no UI module |
| Data Sets — switch between named collections + optional forms | `MarketsGridContainer` two-provider picker + Alt+Shift+P hotkey | 60 | 7 | Provider switching done; "form-on-select" parameter prompts missing |
| Named Queries — saved queries reusable in expressions via QUERY() | — | 10 | 5 | Saved filters exist for filter model, not for expression reuse |

### 4.6 Cell rendering

| AdapTable feature | MarketsGrid equivalent | Coverage | Weight | Notes |
|---|---|---:|---:|---|
| Display Formats — Numeric | `excelFormatter` + formatter presets | 90 | 10 | Strong |
| Display Formats — String | Format presets + custom templates | 85 | 8 | — |
| Display Formats — Date | `excelFormatter` for dates + presets | 85 | 9 | — |
| Display Formats — Template (e.g. `"{value} units"`) | `valueFormatterFromTemplate` | 90 | 8 | — |
| Display Formats — Custom (developer function) | Custom value formatter via column def | 90 | 8 | — |
| Conditional Styling — Predicate + Expression | Customizer conditional-styling module + `ExpressionEngine` | 85 | 10 | Strong (dark/light themed styles) |
| Styled Columns — Gradient | `HeatmapCellRenderer` + `HeatmapEditor` (column-customization module) | 80 | 7 | Renderer + per-column editor shipped 2026-Q2 |
| Styled Columns — Percent Bar | `PercentBarCellRenderer` + `PercentBarEditor` | 80 | 7 | Renderer + per-column editor shipped 2026-Q2 |
| Styled Columns — Badge (text + icon, conditional) | `PillCellRenderer` + `PillEditor` (configurable); legacy zero-config `RatingBadge`/`StatusBadge`/`Side` remain | 75 | 7 | Configurable Pill renderer shipped; legacy badges still hard-coded |
| Styled Columns — Sparkline | `SparklineCellRenderer` (inline SVG line/area/bar) + `SparklineEditor` | 80 | 6 | Renderer + per-column editor shipped 2026-Q2 |
| Flashing Cells (UP / DOWN / Neutral, duration, scope, rule) | Per-rule `flash` config on conditional-styling rules (palette, keyframes, oneShot/pulse, cells/row/header targets) — direction-aware (UP/DOWN/Neutral) module still pending | 55 | 8 | Rich flash visuals already shipped via conditional-styling; standalone direction-aware module is the remaining gap |
| Flashing Rows | Conditional-styling `flash.target: 'row'` | 50 | 6 | Same rule-driven flash supports row target |
| Column Header formatting | Customizer column-customization (label, alignment, style) | 80 | 7 | Strong |

### 4.7 Editing

| AdapTable feature | MarketsGrid equivalent | Coverage | Weight | Notes |
|---|---|---:|---:|---|
| Smart Edit (multiply / divide / +/- across many cells) | `@wellsfargo-starui/engine` smart-edit + unified `EditingToolbar` segment; preview-before-apply, journal, single-column guard | 85 | 7 | × ÷ + − Set, confirm threshold, `EditJournal` undo |
| Bulk Update (set N cells to same value) | Dedicated `bulk-update` module (`07`) + toolbar segment; distinct-value dropdown, date/text/number | 82 | 7 | Separate from Smart Edit Set… |
| Plus / Minus increment via +/- keys | `plus-minus` module (`08`) — nudge rules with scope, step, optional expression gate | 78 | 5 | Takes +/- from smart-edit when enabled |
| Shortcuts (M=million, K=thousand, etc.) | **Two layers:** K/M/B via `parseMagnitudeSuffix` + colDef transform; letter keys via `shortcuts` module (`09`) | 78 | 6 | K/M/B ≠ letter shortcuts (documented in panel) |
| Styling Editable / ReadOnly Cells | Customizer style editor with data-type variants | 70 | 5 | — |
| Custom Edit Values (cell-level allowed values) | AG Grid native | 60 | 5 | — |
| Data Validation — Pre-Edit | Preview table stub; alerts PreventEdit wiring deferred | 20 | 7 | `previewPatches` + injectable validator port |
| Data Validation — Client-side rule | Preview status badges only | 25 | 7 | Full alert-rule validator follow-on PR |
| Data Validation — Server-side | DataProvider has REST/STOMP but no validation hook | 20 | 6 | — |
| Data Change History — tracking, monitor panel, undo, suspend | `data-change-history` module (`10`): `EditJournal`, toolbar Undo/Redo, monitor panel, suspend, per-source toggles | 82 | 6 | Session stacks; settings-only profile persistence |
| Cell Editors — Select / Numeric / Percentage / Date | AG Grid + `Calendar` (react-day-picker) | 65 | 6 | — |

> **Editing family subset** (Smart Edit + Bulk Update + Plus/Minus + Shortcuts + Change History): **~85%** weighted. Full §4.7 remains lower until validation UI and custom edit values mature.

### 4.8 Annotating

| AdapTable feature | MarketsGrid equivalent | Coverage | Weight | Notes |
|---|---|---:|---:|---|
| Notes — per-cell personal annotations | — | 0 | 4 | — |
| Comments — team-shared cell-level dialogue | — | 0 | 5 | — |
| Free Text Columns — runtime-created user data columns | — | 0 | 4 | — |

### 4.9 Working with grid data

| AdapTable feature | MarketsGrid equivalent | Coverage | Weight | Notes |
|---|---|---:|---:|---|
| Exporting — Excel | AG Grid native | 70 | 8 | — |
| Exporting — Visual Excel (with styling/formatting) | `visualExcelModule` + toolbar export | 55 | 7 | Format strings + conditional cell colours; row-scoped rules not yet exported |
| Exporting — CSV | AG Grid native | 80 | 6 | — |
| Exporting — JSON | AG Grid native (with adapter) | 60 | 5 | — |
| Reports — system + custom Boolean reports | — | 15 | 6 | No report definition layer |
| Report Destinations — file / clipboard / custom (email, REST, PDF) | File only | 25 | 6 | — |
| Scheduling exports / reports | — | 5 | 6 | — |
| Importing — JSON / CSV / Text into grid (update / add / populate) | Config import only (not row-data import wizard) | 15 | 5 | — |
| Custom Sorting (comparators) | `defaultNullSafeComparator` + AG Grid native | 75 | 7 | — |
| Selecting — API + Selection Changed events + Checkbox column | AG Grid native + grid-state persistence | 65 | 6 | — |
| Summarising — Cell Summaries (count / sum / avg / min / max for selection) | — | 15 | 7 | Status bar work needed |
| Summarising — Row Summaries | — | 15 | 6 | — |
| Transposing rows ↔ columns | — | 0 | 2 | Niche |
| Highlighting & Jumping (navigate to result) | — | 0 | 4 | — |

### 4.10 Advanced features

| AdapTable feature | MarketsGrid equivalent | Coverage | Weight | Notes |
|---|---|---:|---:|---|
| Team Sharing — Active (live-synced) | ConfigService REST backend can sync, but no "share with team" UI | 25 | 6 | Foundation exists |
| Team Sharing — Snapshot (one-off) | — | 20 | 5 | — |
| Team Sharing — Referenced (deps follow) | — | 15 | 5 | — |
| Row Forms — popup form for entire row edit | — | 5 | 5 | — |
| Schedules — calendar-based (DaysOfWeek / OneOffDate) | — | 5 | 5 | — |
| Reminders — scheduled alerts | — | 5 | 4 | — |
| AdapTable No Code (build instance from JSON/Excel via wizard) | — | 0 | 2 | Out of scope for our model |
| FDC3 — Intents, Contexts, gridDataContextMapping, FDC3 Action Columns, Context Menu items, Custom, OpenFin/interop.io/Connectifi plug-in | `useFdc3Channel` hook + OpenFin runtime; no mapping config UI or action-column FDC3 type | 30 | 8 | Hooks present; declarative mapping & UI missing |
| System Status Messages | `StaleDataBanner` (real-time stale + reconnect) | 30 | 4 | Limited scope |

### 4.11 Developer guides

| AdapTable feature | MarketsGrid equivalent | Coverage | Weight | Notes |
|---|---|---:|---:|---|
| AdapTable State — initial state, persistence (local + remote), management, custom, suspend, events, migrations | `ProfileManager` + `StorageAdapter` + `LocalStorageBundleAdapter` + `createConfigServiceStorage` + `ChangeNotifier` + migration helpers | 80 | 9 | Strong; lacks AdapTable's "suspend state" semantics and explicit migration API |
| Permissions — Module + Object level, Full / ReadOnly / Hidden | `ConfigManager` roles + permissions + `isVisible()` predicate | 55 | 7 | Backend modelled; UI gating per-module not wired |
| Handling Grid Data — loading, transaction add/update/delete, cell updates, events | STOMP/REST provider with `applyTransactionAsync` + delta/snapshot events | 80 | 9 | Strong |
| Server-Side Row Model — filtering, sorting, pivoting, grouping, calc cols, formatting, searching, viewport | Client-side row model only; data services do snapshot+tail | 30 | 5 | Major gap if SSRM required |
| Managing Columns — column types, AG Grid cellDataTypes, runtime ColDef, design-time, array columns, scope, info, headers, hiding | Customizer + `applyAssignments` + `getValueByPath` + AG Grid integration | 80 | 8 | Strong |
| Configuring AG Grid — GridOptions, ColDefs, cell rendering, pagination | Pass-through + `gridSurfaceOptions` | 90 | 8 | — |
| Developer Tutorials — cell editability, holiday calendars, context, containers, hotkeys, american english | `useChordHotkey`, portal provider, host context, theming | 55 | 5 | Most present; holiday calendars and en-US toggles missing |
| Supporting — logging, profiling, testing, monitoring, performance | Vitest + Playwright + propagate; less formal perf monitoring | 55 | 6 | Could be deeper |

### 4.12 AdapTable Query Language (AdaptableQL)

| AdapTable feature | MarketsGrid equivalent | Coverage | Weight | Notes |
|---|---|---:|---:|---|
| Standard Expressions | `ExpressionEngine` (tokenize / parse / evaluate) | 75 | 8 | Strong |
| Aggregation Expressions (SUM, AVG, COUNT, GROUP) | — | 15 | 7 | — |
| Cumulative Expressions (running totals) | — | 10 | 5 | — |
| Quantile Expressions (bucketing) | — | 10 | 5 | — |
| Observable / reactive Expressions | — | 5 | 5 | — |
| Advanced — QUERY function (refer Named Query) | — | 5 | 5 | — |
| Advanced — VAR function (developer-supplied values) | Partial via custom function registry | 30 | 5 | — |
| Advanced — IF / CASE logic | Custom function via engine; not first-class | 40 | 6 | — |
| Advanced — FIELD function (dynamic row data) | `nestedField` + `getPathAccessor` | 65 | 6 | — |
| Relative Change Expressions | — | 5 | 6 | — |
| Expression Editor UI (autocomplete, type-checking) | Simple textarea / preset selector in customizer | 35 | 7 | Need richer editor (Monaco-class) |
| Query Builder UI (graphical predicate composer) | Filter toolbar covers simple cases | 30 | 6 | — |
| Custom Expression Functions (standard + aggregated + scope) | `FunctionDefinition` in engine | 60 | 6 | — |
| Predicates — System | AG Grid predicates + filter-toolbar logic | 65 | 6 | — |
| Predicates — Custom | `doesValueMatchFilter`, `doesRowMatchFilterModel` | 65 | 6 | — |
| Server Evaluation of AdaptableQL | — | 0 | 4 | Requires backend |

### 4.13 Partner integrations

| AdapTable feature | MarketsGrid equivalent | Coverage | Weight | Notes |
|---|---|---:|---:|---|
| OpenFin (workspace, dock, home, notifications, FDC3 channels) | `@wellsfargo-starui/host-openfin` + `@wellsfargo-starui/openfin-platform` — full workspace shell, dock, home, IAB, notifications | 90 | 8 | Stronger in some areas (config browser, workspace-setup), thinner on home search providers |
| interop.io (Glue42-style) | — | 0 | 3 | Not supported |
| ipushpull | — | 0 | 2 | Not supported |

---

## 5. Category roll-up

Weighted average per AdapTable section group:

| Category | Weighted score | Max | % |
|---|---:|---:|---:|
| Framework Versions | 9.0 | 16 | **56%** |
| Layouts | 31.0 | 59 | **53%** |
| AdapTable UI | 27.5 | 51 | **54%** |
| Core Features (Calculated cols, Alerts, Action cols, Charting) | 38.5 | 92 | **42%** |
| Searching & Filtering | 17.7 | 34 | **52%** |
| Cell Rendering | 80.6 | 101 | **80%** |
| Editing | 40.0 | 65 | **62%** |
| Annotating | 0.0 | 13 | **0%** |
| Working with Grid Data | 33.6 | 76 | **44%** |
| Advanced (Team Sharing, Row Forms, Schedules, No Code, FDC3, Status) | 7.4 | 36 | **21%** |
| Developer Guides (State, Permissions, Data, SSRM, Columns, AG Grid, Tutorials, Support) | 41.2 | 57 | **72%** |
| AdaptableQL | 19.8 | 81 | **24%** |
| Partner Integrations | 7.2 | 13 | **55%** |
| **Overall weighted parity** | **353.5** | **694** | **≈ 51%** |

> Numbers are coverage × weight summed within each category. Read the table
> as "MarketsGrid covers X% of the weighted AdapTable scope in that
> category."

The shape of the gap is clear:

- **Foundations (Developer Guides) at ~72%** — the platform plumbing
  (state, persistence, data ingest, AG Grid integration) is in good shape.
- **UI surfaces at ~50%** — toolbars and settings panel exist, but the
  dashboard mode model, tool panel, status bar, and column/context menu
  extension points are thin.
- **Trader-facing analytics (Annotating, AdaptableQL extensions) still at 0–24%** — alerts and styled columns moved up; **editing family now ~85%** on core modules; pivot, validation UI, and annotations remain visible gaps.

---

## 6. Significant gaps (deep dive)

These are the gaps that most affect a buy-side / sell-side trader's
day-to-day experience. They're ordered by **impact × feasibility**.

### 6.1 Alerts — mostly shipped; extensions remain

**Status (2026-Q2):** The customizer **alerts module** covers the three
highest-visibility trigger families — **data change** (Monaco expression),
**relative change** (percent/absolute/any), and **row change** (add/remove on
stream updates) — with per-rule RESET/SAVE, module-level throttle/settings, and
notification channels (**toast**, toolbar **bell badge**, **OpenFin Notification
Centre** when `window.fin` is present).

**Still missing vs AdapTable:** aggregation limits, observable/reactive triggers,
validation rollback alerts, dashboard cell highlight, auto-jump, custom alert
containers, and a first-class `AlertFired` event surface for host apps.

**Try it:** `npm run dev:markets-grid-lab` → **Alerts** tab → Demo console →
*Bid spike* / *P&L loss* / *Mid tick* scenarios.

**Impact:** *medium* for net-new evaluations (P0 trigger families are demoable);
*medium-high* for desks that need limit monitoring and validation alerts.

### 6.2 Flashing cells & rows — partial via conditional styling

AG Grid exposes `enableCellChangeFlash` natively; AdapTable adds direction-aware
UP/DOWN/Neutral rules with duration and cell vs row scope.

MarketsGrid ships **per-rule `flash`** on conditional-styling rules (palette,
keyframes, oneShot/pulse, cells/row/header targets). A **standalone**
direction-aware flashing module (AdapTable's dedicated UX) is still open.

**Try it:** lab **Conditional Style** or **Live Updates** tabs + *Mid tick up/down*
scenarios.

**Impact:** *medium* — most desks can flash today via style rules; power users
want a dedicated flashing panel.

### 6.3 Styled columns — SHIPPED 2026-Q2

> **Status: resolved.** AdapTable's four built-in styled column types
> (Gradient / Percent Bar / Badge / Sparkline) all ship as configurable
> renderers + per-column editors:
>
> - **Gradient** — `HeatmapCellRenderer` (`packages/design-system/design-system/src/cellRenderers.ts:432-498`) + `HeatmapEditor`
> - **Percent Bar** — `PercentBarCellRenderer` (`:501-576`) + `PercentBarEditor`
> - **Badge** — `PillCellRenderer` (`:354-429`) + `PillEditor`. Legacy zero-config badges (`SideCellRenderer`, `StatusBadgeRenderer`, `RatingBadgeRenderer`) coexist.
> - **Sparkline** — `SparklineCellRenderer` (inline SVG, `:654-742`) + `SparklineEditor`
>
> Registry: `cellRendererRegistry.ts:280-321`. Per-column UI:
> `packages/react-grid/grid/src/customizer/modules/column-customization/CellRendererEditors/`.
>
> Theme-aware (light/dark via `ThemeAwareColor`), no external chart library
> required. Section 3.6 coverage reflects the shipped state.

### 6.4 Smart Edit / Bulk Update / Plus-Minus / Shortcuts / Change History

AdapTable's four data-entry modules plus change history give traders
10×-faster cell-edit ergonomics: arithmetic across many cells, bulk-set,
+/- nudge rules, letter-key shortcuts, and undo through a tracked panel.

MarketsGrid ships the **full editing family** in `@wellsfargo-starui/engine` +
`@wellsfargo-starui/grid`:

| Module | Code | Shipped |
|--------|------|---------|
| Smart Edit | `06` | × ÷ + − Set, K/M/B parser, preview, journal |
| Bulk Update | `07` | Text/number/date bulk set, distinct-value dropdown |
| Plus / Minus | `08` | Nudge rules, expression gates |
| Shortcuts | `09` | Letter keys → op + operand |
| Data Change History | `10` | Undo/redo toolbar, monitor panel, suspend |

Unified **Editing** toolbar row (`showEditingToolbar`, primary-row pencil
toggle) composes history, smart edit, and bulk-update segments plus a
keyboard-hints menu. Demoable in `apps/demos/markets-grid-lab` → **Editing** tab
(`lab-editing`, 12 profiles) plus focused tabs per module.

E2E: `e2e/v2-smart-edit.spec.ts`, `v2-bulk-update.spec.ts`,
`v2-edit-history.spec.ts`, `v2-plus-minus.spec.ts`, `v2-shortcuts.spec.ts`,
`v2-editing.spec.ts`.

**Impact:** *medium-low* for core family — remaining gaps are validation UI
(wire alerts PreventEdit as validator), custom ops registry, and AdapTable
expression-gated nudge extras.

### 6.5 Pivot layouts & aggregations (Grand Total / Weighted Avg)

AdapTable's Pivot Layouts and aggregation extras (grand total rows,
weighted averages, only-aggregation) are essential for P&L,
risk-by-bucket, and book breakdown views.

MarketsGrid leans on AG Grid's pivot but has no customizer module to
configure pivot dimensions, totals, or weighted averages from the UI.

**Impact:** *high* — these are table-stakes for any trading dashboard
that does desk-level rollups.

### 6.6 Visual Excel + scheduled / custom-destination reports

Visual Excel preserves column formatting on export. Reports can be
scheduled (DaysOfWeek + Hour + Minute) and routed to custom destinations
(email, REST, PDF).

MarketsGrid ships **Visual Excel** (`visualExcelModule`) — toolbar `.xlsx`
export with display formatters and conditional cell colours via AG Grid
`excelStyles`. Scheduled reports and custom destinations remain unimplemented.

**Impact:** *medium* — WYSIWYG export is covered; scheduling and routing still gap.

### 6.7 Notes, Comments, Free Text Columns

AdapTable separates personal annotations (Notes), team annotations
(Comments), and runtime-created data columns (Free Text Columns).

MarketsGrid has none of these.

**Impact:** *medium* — common ask in collab-heavy desks.

### 6.8 Data Change History + undo UI

AdapTable monitors every cell change and offers undo through a tracked
panel.

MarketsGrid ships **`data-change-history`** (module `10`): session-scoped
`EditJournal`, toolbar Undo/Redo, settings monitor with virtualized entry
list, suspend toggle, and per-source record toggles. Smart Edit, Bulk
Update, Plus/Minus, Shortcuts, and wrapped cell editors all record into
the shared journal.

**Impact:** *low* — core history surface shipped; follow-on is validation
rollback and alert-rule integration on preview.

### 6.9 Charting

AdapTable wires AG Grid Charts into the dashboard with persistent state
and multiple windows. External libraries plug in via a custom provider.

MarketsGrid ships `Chart` (Recharts wrapper) in `@wellsfargo-starui/ui` but doesn't
launch charts from the grid.

**Impact:** *medium-high* — common power-user feature.

### 6.10 Action columns

Dynamic per-row buttons with conditional visibility/disabled state. Used
for "cancel order", "view details", FDC3 broadcasts.

MarketsGrid has no first-class action-column concept (AG Grid
`cellRenderer` works but isn't configurable from the UI).

**Impact:** *medium-high* — common in execution / order-book grids.

### 6.11 AdaptableQL — aggregation, observable, cumulative, quantile

MarketsGrid's expression engine covers per-row evaluation well, but lacks
the aggregation / cumulative / quantile / observable families that
AdaptableQL puts under one syntax.

**Impact:** *medium* — only relevant once aggregated calculated columns
and alerts ship.

### 6.12 Team Sharing UI

ConfigService can be REST-backed so shared rows are technically possible,
but there's no Active / Snapshot / Referenced sharing UI.

**Impact:** *medium* — important for buy-side analyst teams.

---

## 7. Areas where MarketsGrid is at or above parity

Worth calling out — these are differentiators or near-equivalents that
**don't** need to be on the roadmap:

- **Theming** — token-driven dark/light + CVD; richer than AdapTable's
  CSS-variable model.
- **OpenFin workspace shell** — full dock editor, registry editor,
  config browser, import/export bundle, child tool windows.
- **Profile persistence** — `ProfileManager` + `ConfigService` adapter +
  cross-tab sync via `BroadcastChannel` matches AdapTable State.
- **Provider switching** — Alt+Shift+P chord hotkey and
  `MarketsGridContainer` two-provider selector matches AdapTable Data
  Sets for the most common runtime-switch case.
- **Display formatters** — `excelFormatter` + presets cover AdapTable's
  number/date/template/custom formats at near-parity.
- **Conditional styling** — themed style editor (dark/light variants) is
  arguably ahead of AdapTable's CSS-variables-only approach. Also bundles
  per-rule flash (palette, keyframes, oneShot/pulse modes, cells/row/header
  targets) — covers most of AdapTable's flashing surface without a separate
  module.
- **Styled columns** — Gradient (`HeatmapCellRenderer`), Percent Bar
  (`PercentBarCellRenderer`), Badge (`PillCellRenderer`), and Sparkline
  (inline SVG) all ship as configurable renderers + per-column editors
  with theme-aware colours. No external chart library required for
  sparklines.
- **AG Grid integration depth** — both pass-through `colDef` /
  `gridOptions` and customize them; equivalent.
- **Real-time data ingest** — SharedWorker-backed STOMP / REST / Mock
  with snapshot+tail, chunking, late-joiner support, byte-size events,
  and per-provider stats sampler is *richer* than what AdapTable
  documents in its data-loading guide.
- **Alerts (P0 triggers)** — data/relative/row-change rules with toast,
  toolbar badge, and OpenFin Notification Centre; demoable in markets-grid-lab.

---

## 8. Recommendations

Ranked by **ROI** (trader-visible value × implementation cost). Each item
is sized into a rough effort band (S < 1 week, M 1–4 weeks, L > 4 weeks).

### 8.1 P0 — Ship next quarter

| # | Feature | Effort | Why |
|---|---|---|---|
| 1 | **Direction-aware flashing module** (UP/DOWN/Neutral, per-column, duration) | M | Per-rule flash already shipped via conditional-styling — standalone module closes the last flashing gap |
| 2 | **Alert extensions** (aggregation limits, validation rollback, auto-jump, `AlertFired` event) | M | P0 triggers shipped; closes evaluation gaps for risk desks |

> **~~Visual Excel export~~** — **shipped 2026-Q2.** `visualExcelModule` +
> toolbar export; lab tab `lab-visual-excel-v1`. Row-scoped rules and
> scheduled destinations remain follow-ups.

> **~~Alerts (P0 triggers)~~** — **shipped 2026-Q2.** Customizer module + lab
> scenarios. See §4.4, §6.1, and `apps/demos/markets-grid-lab`.
>
> **~~Smart Edit family~~** — **shipped 2026-Q2.** Full editing family
> (Smart Edit, Bulk Update, Plus/Minus, Shortcuts, Change History) +
> unified Editing toolbar + lab **Editing** tab. See §4.7, §6.4, and
> `e2e/v2-editing.spec.ts` + module e2es.
>
> **~~Styled Columns~~** — **shipped 2026-Q2.** See §4.6 and §7.

### 8.2 P1 — 2-quarter horizon

| # | Feature | Effort | Why |
|---|---|---|---|
| 6 | **Pivot Layout customizer module** (pivot rows / columns / values / totals) | L | Table-stakes for risk + P&L users |
| 7 | **Aggregations** — Grand Total Rows + Weighted Averages | M | Common ask in fixed income desks |
| 8 | **Action Columns** (configurable per-row buttons with conditional visibility) | M | Order-book + RFQ workflows |
| 9 | **Charting from selection** — wire `Chart` (Recharts) to grid selection + persist chart state in profile | M | Power-user analytics |
| 10 | **Data Validation UI** — wire alerts PreventEdit as edit validator + preview rollback | M | Editing family shipped; validation hooks stubbed |
| 11 | **Quick Search** — text-match highlight + optional as-filter mode | S | Universal expectation |
| 12 | **Grid Filter (expression-based)** — UI for the existing expression engine to filter the whole grid | M | Power-user filtering |
| 13 | **Status Bar customizer** — Cell Summaries + Row Summaries when range selected | M | Common ask |

### 8.3 P2 — 3+ quarter horizon

| # | Feature | Effort | Why |
|---|---|---|---|
| 14 | **AdaptableQL-class aggregation / cumulative / quantile / observable expressions** in `ExpressionEngine` | L | Foundation for Aggregated Calculated Columns and aggregation alerts |
| 15 | **Aggregated Calculated Columns** | M | Depends on #14 |
| 16 | **Master-Detail support** with detail-grid plugin | M | Common in trade-blotter → fills view |
| 17 | **Reports + Custom Destinations + Scheduling** | L | Requires a report-definition layer; high-value for ops |
| 18 | **Data Validation UI** — pre-edit + client + server validation hooks | M | Compliance-driven asks |
| 19 | **Importing rows** — JSON / CSV / paste wizard with column-match + validation | M | Bulk position-load workflow |
| 20 | **Team Sharing UI** — wrap ConfigService with "share with team" + active/snapshot modes | M | Leverages existing REST backend |
| 21 | **FDC3 mapping config UI** — declarative `gridDataContextMapping` + FDC3 action-column type | M | Hooks exist, mapping declaration is missing |
| 22 | **Expression Editor (Monaco-class)** — autocomplete, type-checking, function-doc tooltips | M | Quality-of-life for any expression-driven feature |
| 23 | **Tool Panel + Column Menu + Context Menu extension points** | M | Currently only OpenFin context-menu is wired |

### 8.4 P3 — Lower priority

| # | Feature | Effort | Why |
|---|---|---|---|
| 24 | Notes (per-cell) | M | Annotation feature; depends on cell-key persistence |
| 25 | Comments (team-shared annotations) | L | Depends on Team Sharing |
| 26 | Free Text Columns | M | — |
| 27 | Row Forms (popup full-row editor) | M | — |
| 28 | Schedules + Reminders | M | Depends on a scheduler service |
| 29 | Named Queries (saved-query reference via QUERY()) | S | Cheap once expression engine has QUERY() |
| 30 | Layout Wizard | S | Customizer panels can be rebranded as a wizard |
| 31 | Permissions UI gating per customizer module | S | Plumbing already in ConfigService |

### 8.5 Recommend NOT implementing

These are AdapTable features that don't earn their keep in our context:

- **AdapTable No Code** wizard — we're a code-first platform with a
  developer audience; not a target user.
- **Transposing** — niche; not a common trader workflow.
- **Tree Data** — niche unless we have specific hierarchical-data use
  cases.
- **AdaptableQL Server Evaluation** — requires significant backend infra
  and isn't a core MarketsUI requirement.
- **ipushpull / interop.io partner integrations** — single-partner
  bindings; only if a customer specifically requires them.
- **Vue support** — no current consumer; sustaining cost is high.

---

## 9. How close is MarketsGrid to AdapTable?

**~48% weighted parity** today (alerts P0 triggers + styled columns bump
Core Features from ~14% → ~42%).

If the **remaining P0 set** (standalone flashing, Visual
Excel, alert extensions) ships, parity moves to **~58%** — trader-visible
gaps concentrate on pivot/aggregations and collaboration surfaces.

If remaining P0 + P1 ships, parity reaches **~78%**, at which point MarketsGrid
is functionally competitive with AdapTable for the typical buy-side /
sell-side capital-markets workflow.

P2 + P3 round out the long tail (annotations, reports, sharing, niche
features) to bring parity above 90%.

---

## 10. Maintenance

Update this document when any of the following happen:

- A new top-level area appears in AdapTable's docs (re-crawl).
- A feature listed at 0–25% coverage ships in MarketsGrid → bump
  coverage and recompute the weighted score.
- The product strategy changes which categories matter (re-weight).
- A feature listed at 75–100% loses parity (downgrade).

Keep the matrix granular: one bullet per AdapTable doc section. The
roll-up is mechanical from the per-row coverage × weight, so updating
individual rows automatically updates the headline.
