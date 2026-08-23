# Out-of-process SSRM engine (Rust + Perspective) for MarketsGrid

**Target: AG Grid 36+.** The repo is currently installed at 35.1.0; the upgrade is a
prerequisite phase of this work (§2).

## Context

Six blotters share one OpenFin renderer main thread. The hub is healthy (~38%); the
renderer saturates around 20k rows because every window runs a full **client-side row
model**. `docs/blotter-performance-roadmap.md` states it plainly: *"Remaining bottleneck
… is NOT the hub. It is per-window main-thread CPU and per-renderer-process memory."*

The fix is AG Grid's **server-side row model**: each grid materialises ~100 rows per block
instead of 20k. The engine behind it is a native **Rust process hosting Perspective**,
deployed as an **OpenFin app asset**, launched once by the platform provider.

Native is chosen over the already-measured WASM path for **parallelism**, **memory beyond
the wasm32 4 GB cap**, and **process lifetime**. The WASM/SharedWorker engine is
**retained as a fallback** behind the same contract. Two of those three motivations are
unproven assumptions — see the Phase 0 gates (§3).

### Prior art: two unmerged branches hold most of this

Neither is on `main`. Landing strategy is deferred (user's call), but the plan is built to
reuse them rather than re-derive them.

| Branch | What it holds |
| --- | --- |
| `origin/feature/ssrm` (73 commits) | `ISsrmDataProvider`, `SsrmServer`, `QueryEngine`, `expressionRules`, `statusBar`, customizer SSRM wiring, `markets-grid-ssrm-lab` (~90 lab-profile fixtures = the parity matrix, already written), e2e specs |
| `origin/feature/perspective-grid` (24 commits) | Perspective 4.5.2 Table in the SharedWorker, `perspectiveDatasource.ts`, `viewManager.ts` (LRU one View per open group level), `safeView.ts`, `filterTranslate.ts` (377 L). Measured: **a 100-row window read is ~2-6 ms, flat with scroll depth.** |

`docs/latest/ssrm-engine.md` already documents the engine as deliberately host-agnostic —
*"can run in any host: a SharedWorker, a web page, Node.js, or any other runtime"* — driven
through `ICacheIngest`. The native engine's `attach`/`upsert`/`remove` frames **are
`ICacheIngest` over a wire**. Cite that: this is a second host of a documented-as-portable
engine, not a rewrite.

---

## 1. Two corrections that reshape the design

### 1.1 The row model is fixed for the life of a `GridPlatform` — CRITICAL

Both existing design docs prescribe remounting **the surface** with
`key={`ssrm:${provider.id}`}` inside `MarketsGridHost`. **That silently destroys the
profile.**

Unmounting a surface fires `onGridPreDestroyed` (`useGridHost.ts:227-230`) →
`platform.destroy()`, which is **permanent**: `GridPlatform.ts:112-113` sets
`this.destroyed = true` and every entry point early-returns. On the next render
`useGridHost`'s `if (!platformRef.current)` builds a *fresh* `GridPlatform` re-seeded from
`getInitialState()`. The grid then looks healthy — AG's own sort, grouping and context menu
never talked to the platform — while every customizer module has reverted to defaults.

**Rule for the whole plan:** the surface branch resolves **once, at mount**, and never
changes. Switching CSRM↔SSRM changes the `key` on `<MarketsGrid>` — new platform, new
store, fresh profile hydration — exactly the path a provider switch already takes at
`MarketsGridContainer.tsx:919`:

```
key={`${activeId}::${rowIdFieldKey}`}  →  key={`${activeId}::${rowIdFieldKey}::${rowModel}`}
```

This also decides where the mode is stored (§4.1) on correctness grounds rather than taste.

### 1.2 Conditional styling is classes, not inline styles

`feature/ssrm`'s `EnrichedRow.__ssrmStyle` is a flat `{cssProp: value}` bag. The CSRM
mechanism is not: `conditional-styling/transforms.ts:887-936` writes
`cellClassRules['ds-rule-<id>']` and `index.ts:106-122` writes matching `rowClassRules`;
appearance comes from a generated stylesheet carrying light/dark variants, flash
animations, indicator icons and per-rule priority, plus per-rule `valueFormatter`
overrides. A flat CSS bag **loses all of that** — it would look wrong, not just different.

**Keep the classes and the stylesheet untouched; replace only the predicate body with a
lookup.** Extend `EnrichedRow` with `__ssrmRowRules?: string[]` and
`__ssrmCellRules?: Record<string, string[]>` (retire `__ssrmStyle`), then branch at the
predicate factory on `ctx.rowModel`:

```ts
cellClassRules[`ds-rule-${cssEscapeColId(rule.id)}`] =
  ctx.rowModel === 'server'
    ? (p) => (p.data as EnrichedRow)?.__ssrmCellRules?.[colId]?.includes(rule.id) === true
    : buildCellClassPredicate(engine, rule, diffCacheByApi, timedRuleStateByApi);
```

Priority, indicators, flash CSS and light/dark all survive because the class names and
stylesheet are unchanged.

---

## 2. The AG Grid 36 upgrade is already written — port it, don't redo it

**Verified:** `origin/feature/ssrm` (HEAD `e018017`, 13 Aug 2026) pins **`^36.1.0` across
all three packages, peer *and* dev**, plus the apps and the e2e suite. `main` and
`origin/feature/perspective-grid` are on `^35.1.0`.

```
main                            react-grid / core / design-system → ^35.1.0 peer, 35.1.0 dev
origin/feature/ssrm             same three                         → ^36.1.0 peer AND dev
origin/feature/perspective-grid same three                         → ^35.1.0
```

So the upgrade is a **port of completed work**, not greenfield, and the reconciliation runs
the *other* way: the 2026-08-07 design docs assuming 36.x are correct on version, and it is
the `feature/perspective-grid` artifacts (`GridSurfaceSlot`, `makeGetRowId`,
`usePerspectiveCalcColumns`, `perspectiveAlertsBridge`, `withPerspectiveSetFilterValues`)
that are 35.1 artifacts needing **forward**-verification to 36.

### What the branch already solved

- **`ensureAgGridModules.ts`** — `ValidationModule` left the `All*` bundles at 36, so it
  calls `enableDevValidations()` in non-production, citing the official upgrade guide.
  Turn this on in the lab app for the whole build-out: AG warn 205 (duplicate row id) and
  warn 22 (initial property) are the two failures this design is most likely to produce,
  and both are console-only.
- **DOM class renames**, the only material cost. `.ag-body-viewport` → `.ag-grid-viewport`
  (31 e2e sites), `.ag-center-cols-container` → `.ag-grid-scrolling-*` (11),
  `.ag-header-container` → `.ag-header`, `.ag-body-horizontal-scroll-viewport` removed.
  ~44 selector sites across 40 spec files. **The substitutions already exist in the branch
  diff — `git diff <merge-base> origin/feature/ssrm -- apps/e2e packages/` is the codemod.**
  Do not re-derive it by trial and error.
- Reassuringly, the two `.ag-*` CSS sources show **zero** diff across the major, and
  `GridPlatform.ts`, `useGridHost.ts`, `MarketsGridSurface.tsx` and `gridSurfaceOptions.ts`
  are **byte-identical**. The 36 upgrade required no change to any of them — which is a
  concrete, evidenced answer to "no major disruption to CSRM".
- Zero files use any v32/v33-deprecated grid option; the repo is already on the modern API
  surface. The 47 `api.*` calls and 9 `setGridOption` keys are statically typed, so
  removals surface as compile errors.

### Still blocking, still required

- **Pin sign-off.** `general-settings/index.ts:337-338` says verbatim *"Pinning to 35.1.0
  exact (corporate requirement)"* — the only written record of the constraint. It needs a
  named owner's approval, and the comment must be **rewritten to record who approved 36 and
  when**, not merely deleted, or the next engineer reinstates 35.1 on a stale comment.
- **15 manifests** to bump: 3 packages (peer + dev) and 12 app manifests under
  `apps/source/*` and `apps/tarball/*`. `packages/{openfin,data,types,react-core}` have no
  ag-grid dependency — leave them.
- **Do not treat the branch as a clean reference.** Verified: `GridPlatform.getRowId` is
  *still* `composeRowId(params.data, this.rowIdField) ?? ''` on the 36.1 branch — the
  group-row-id defect (§4.4) is unfixed there, and `agGridSetFilterValidateGuard` is still
  installed unaudited.

### Claims to re-verify at 36 — three of them can delete plan

Everything below was read off the installed **35.1** bundle. Each is a starting point, and
the first three are worth an hour before writing any tick code, because each one deletes
work if it confirms.

| # | 35.1 observation | If 36 differs |
| --- | --- | --- |
| **V1** | `LoadSuccessParams` = `rowData / rowCount / groupLevelInfo / pivotResultFields`; no `groupData` (`iServerSideRowModel.d.ts:39-56`) | **Highest value.** `groupData` is a 36 spelling, so `feature/ssrm`'s `createSsrmDatasource` lifts verbatim and the grand-total-via-transaction workaround (§5.2) drops out entirely — ~80 lines and one class of ordering hazard |
| **V2** | Only `applyServerSideTransactionAsync` dispatches `asyncTransactionsFlushed` (`:60607`) | If 36 dispatches from the sync path too, `bindSsrmTicks` lifts unmodified. **Use the async form regardless** — harmless either way |
| **V3** | `serverSideEnableClientSideSort` re-sorts only when `isStoreFullyLoaded()` | If 36 re-sorts partial stores, §5.1's "sorted → patch then throttled soft-refresh" branch — the most delicate logic in `bindSsrmTicks` — becomes unnecessary |
| V4 | `setServerSideSelectionState` / `getServerSideSelectionState` present | If `headerCheckbox: true` works natively under SSRM at 36, §5.8's select-all interception collapses to "no code" |
| V5 | `GetRowIdParams` carries `level` / `parentKeys` (`iCallbackParams.d.ts:191-200`) | Premise of §4.4 |
| V6 | LazyStore accepts transactions; `StoreWrongType` vestigial; requires `getRowId` | Premise of §5.1 |
| V7 | `groupHideColumnsUntilExpanded` absent — the Options toggle at `gridOptionsSchema.tsx:97` is **a live UI lie**, tracked but never emitted (`general-settings/index.ts:224-229`) | If recognised at 36: emit it, drop the `as unknown as Partial<GridOptions>` double-cast at `:336-341` (which currently disables excess-property checking for the whole returned object). If not: remove or disable the toggle. Either way a user-visible fix that rides along |

### Workaround audit — retire together or re-tag together

Four artifacts exist solely because 35.1's `SetFilterHandler.validateModel` iterates
`model.values` unguarded: `agGridSetFilterValidateGuard.ts`, the `sanitizeFilterModel`
helpers in `useFilterModel.ts:45-95`, the filter-slice sanitiser in
`grid-state/helpers.ts:139-147`, and `COL_DEF_MEMO` in
`column-customization/transforms.ts:565-580`. The 36.1 branch kept all four — but nobody
looked, so that is not evidence.

This matters directly: §5.5 rewrites `filterParams.values` on every set-filter column,
which is exactly the surface that trips the bug. If 36 guards it, retire the first three
but **keep `COL_DEF_MEMO`** — its performance rationale is independent. If not, update every
comment to say "35.1 *and* 36.1", because a stale version tag on a live workaround is how it
gets deleted by whoever runs this audit next year.

---

## 3. Phase 0 — gates before committing

| Gate | Question | If it fails |
| --- | --- | --- |
| **Build** | Does `perspective-server` 4.5.2 link on `x86_64-pc-windows-msvc` with `-C target-feature=+crt-static`? Its vendored C++ core must also be `/MT`. | Drop `crt-static`, ship the VC runtime DLLs in the zip (~2 MB, still self-contained). |
| **Parallelism** | Two concurrent `View::to_arrow()` on one `Table` from two tasks — do they *overlap*, or serialize on an internal lock? `Clone + Send + Sync` plus an OMP pool is necessary, not sufficient. | The headline motivation weakens. Remaining real wins: one `Server` per book, serialization/IO off the engine thread, memory ceiling. **Say so rather than re-pitching.** |
| **Memory** | Load 10M rows natively; confirm the wasm32 4 GB ceiling is gone. | The memory motivation goes away; only lifetime/reliability remains. |

**Start code-signing and EDR allow-listing on day one, in parallel.** An unsigned exe,
downloaded by a browser-class runtime into a user-writable cache and executed, is the
canonical EDR detection pattern. Longest lead time in the project and the top schedule risk.

**Resolved:** the Rust crates exist at version parity — `perspective-client` and
`perspective-server` both publish **4.5.2**, matching the pinned JS
`@perspective-dev/client` 4.5.2, so both hosts can be held on one engine version.
`View::to_arrow(ViewWindow) -> Bytes` emits Arrow IPC natively; `Table`, `View` and
`Server` are all `Clone + Send + Sync`.

---

## 4. Client integration

### 4.1 Mode lives in `gridLevelData`

**It is the only store loaded before the grid mounts.** `useGridLevelPersistence` loads the
blob and flips `loaded`; `MarketsGridContainer.tsx:885-894` renders "Loading…" and mounts
nothing until then — so the mode is known in time to feed the `<MarketsGrid key>` at first
mount. Module state is only known *after* the platform hydrates the profile, i.e. after the
grid already mounted in the wrong row model, forcing the fatal in-place remount from §1.1.
It also survives profile switches, and `ProviderSelection.mode` is the exact precedent.

```ts
export interface GridLevelStateV1 {
  v: 1;
  provider: ProviderSelection;
  caption?: string;
  eventBindings?: Record<string, string[]>;
  rowModel?: 'client' | 'server';   // NEW — absent/unknown → 'client'
}
```

`normalizeGridLevelData` defaults safely; `serializeGridLevelData` emits it only when
`'server'` so CSRM blobs stay byte-identical; `gridLevelEqual` must gain the field or the
change never persists.

### 4.2 The Options-tab control

Band **01 ESSENTIALS** of `gridOptionsSchema.tsx` gets one `custom` field — ROW ENGINE —
rendering a `RowEngineControl` that stages its value and applies on Save, mirroring
`ToolbarDateSettingsPanel`'s `useStaged` (lift that generic hook out to
`customizer/hooks/useStaged.ts`). `ProviderGridHostApi` gains `rowModel`,
`rowModelServerAvailable` and `onRowModelChange`. Disabled with explanatory copy when the
host is unavailable or the provider lacks the server-side capability.

### 4.3 The surface branch

Lift `feature/perspective-grid`'s `grid/src/engine/{GridSurfaceSlot,resolveGridSurface}`
and retarget `'perspective'` → `'server'`. It already encodes the invariant that *asking
for the server engine can never yield a client grid, not even for the length of an async
attach* — a `'pending'` state that renders a sized empty box, never `null` and never a
stand-in grid.

`MarketsGridHost.tsx:357` swaps its direct `<MarketsGridSurface>` for `<GridSurfaceSlot>`.
**That is the only edit to the host** — the entire chrome is untouched, which discharges
"no major disruption" structurally rather than by discipline.

### 4.4 `getRowId` — fix in `GridPlatform`, not the surface

`GridPlatform.ts:74-76` is `composeRowId(params.data, this.rowIdField) ?? ''`, ignoring
`level`/`parentKeys`. Under SSRM every group row lacks the key field, so **every group row
at every level collapses to `''`** — duplicate ids turn successful blocks into failed ones
(AG warn 205), console-only. Branch at call time on `this.rowModel`, composing
`[...parentKeys, groupValue]` for group levels and `[...parentKeys, composeRowId(...)]` for
leaves. Read the mode at call time, not via closure — AG captures only the function.

`feature/ssrm`'s `ssrmGetRowId.ts` omits `parentKeys` and lets sibling groups under
different parents collide. **Do not lift it**; use `feature/perspective-grid`'s
`makeGetRowId` retargeted onto `composeRowId` so composite `rowIdField` arrays keep working.

### 4.5 `TransformContext.rowModel`

Every parity item needs modules to know which engine they feed. Add it once:
`TransformContext` gains `readonly rowModel: 'client' | 'server'`, supplied by
`GridPlatform.transformContext()`. One source, available to every `transformColumnDefs` /
`transformGridOptions` / `activate`. No prop drilling, no per-module flag.

---

## 5. Feature parity

Most grid features are **per-row closures over `params.data`** — they work in SSRM
unchanged and get cheaper, running over loaded blocks instead of 20k rows. Only a small,
enumerable set needs whole-book knowledge, and that set *is* the engine's API surface.

### 5.1 Live ticks — use the async transaction

`bindSsrmTicks` (lift) handles four cases correctly, each load-bearing: unsorted+visible →
in-place patch; sorted → patch then throttled soft-refresh; filtered-to-zero → never churn
`refreshServerSide` unless a tick row actually passes; snapshot/ready → purge + refresh set
filters.

**Change it from the sync to the async transaction.** Only `applyServerSideTransactionAsync`
dispatches `asyncTransactionsFlushed`, and that event is what `RowChangeBus` listens to.
With the sync variant, alerts and timed styling degrade to a whole-viewport rescan on every
block load — four times a second while scrolling — and `RowChangeBus` never sees a delta.

`RowChangeBus` itself needs only a payload normaliser (SSRM results carry `status`; skip
non-`Applied`) plus `storeUpdated`/`storeRefreshed` replacing the CSRM-only
`rowDataUpdated`. **This is a seam adjustment, not a rewrite.**

Also port from `feature/perspective-grid`: `onBodyScroll` + `SCROLL_RESUME_MS = 150` scroll
pause (measured there as by far the largest scroll cost — live re-reads invalidate every
loaded block while scrolling needs the same engine for the blocks it is moving onto), and
restore `flash: true` with `event.columns` so only ticked cells flash.

### 5.2 The expression DSL is NOT ported to Rust

`packages/core/engine/src/expression/` is a real tokenizer → Pratt parser → AST evaluator
with 44 functions and a 582-line spec. Porting it creates two implementations of one
language. Instead the engine answers *primitives* and the existing client engine composes
them.

| Translates to a Perspective expression | Needs another path |
| --- | --- |
| Operators `+ - * / %`, comparisons, `AND`/`OR`/`NOT`, ternary, `IN`, `BETWEEN`, `CASE WHEN` | **agg forms** `SUM/AVG/COUNT/MIN/MAX/MEDIAN/STDEV/VARIANCE/DISTINCT_COUNT([col])` → engine **aggregate queries** |
| Math `ABS ROUND FLOOR CEIL SQRT POW MOD LOG EXP`, scalar `MIN`/`MAX` | `STDEV`, `VARIANCE` (sample, n-1) — no direct Perspective aggregate |
| String `CONCAT UPPER LOWER TRIM LEN SUBSTRING CONTAINS STARTS_WITH ENDS_WITH REPLACE` | `REGEX_MATCH` — Perspective regex support is version-dependent |
| Logical `IF IFS SWITCH CASE ISNULL ISNOTNULL ISEMPTY`; date parts `YEAR MONTH DAY NOW TODAY IS_WEEKDAY` | `DATE_DIFF`/`DATE_ADD` with arbitrary units; **diff refs `[col.old]`/`[col.new]`** |

**Diff refs are the sharp edge.** Perspective holds current state only, so the engine needs
a previous-value shadow at the ingest boundary — **scoped to the fields some rule names**,
because shadowing whole rows doubles memory for the book to serve a handful of rules.
Until it lands, diff-ref rules stay client-side over loaded rows: correct for what is on
screen, which is all conditional styling needs. Only an *alert* on a diff ref genuinely
misses off-screen rows.

**Alerts and header "any row matches"** become **Perspective Views filtered by the rule
predicate** — a row entering the view is a fired alert; `num_rows() > 0` answers the header
question. Perspective's own expression engine does the work, incrementally. Hits route
through the **same** `createAlertDispatcher` — nothing re-implements a rule.
`rowChange` (ROW_ADDED/REMOVED) stays client-side deliberately: a row entering the *book*
is not something a filtered view reports.

### 5.3 Calculated columns — three tiers, and say which

A client `valueGetter` under SSRM is a *silent correctness gap*, not a slow path: sorting by
that column sorts the book by a value the book does not have. Lift the three-tier planner
from `usePerspectiveCalcColumns.ts`:

1. **compiled** — pushed via `configureExpressions`; a real engine column, so sort/filter/
   group/aggregate all work. Drop the `valueGetter` entirely.
2. **materialized** — row-local but untranslatable. Keep the client `valueGetter`, but
   clamp `sortable: false, filter: false` and label it, so the UI says so.
3. **unsupported** — cross-row aggregates (`astUsesAggregateFunctions` already detects
   them). Report in the panel; do not silently blank.

Tier 3 is a deliberate gap. Every alternative computes the aggregate over ~2,000 loaded
rows and presents it as an aggregate over the book.

### 5.4 Status bar — five stock panels, three replaced

There is no custom status bar today; `general-settings/index.ts:158-178` emits five stock
panels. `mapNativeStatusBarToSsrm` (lift) maps the customizer's selection onto worker-backed
equivalents, preserving each panel's `align`, order and `key`.

| Panel | SSRM |
| --- | --- |
| total-and-filtered / total / filtered | Custom panels fed by `provider.getStatusBar()`. `table.size()` and `view.num_rows()` are both O(1); aggregates come from one incremental 1-row view per session. Same `ag-status-*` classes. |
| selected count | **Native, unchanged** — selection is genuinely client-side |
| aggregation | **Native, unchanged** — computed over the selected cell *range*, always loaded |

Two traps: assert that filtered count returns **leaf** counts, not the root group count
(`"Rows: 9 of 50,000"` over a book grouped into nine asset classes is the plausible-looking
failure); and render "counting…" rather than a confidently-wrong `0` before the first
summary arrives.

### 5.4b Saved-filter pill counts

`useFilterCounts` (`useFilterModel.ts:258+`) builds per-pill match sets by walking client
rows; under SSRM that counts the loaded blocks and presents the result as a count over the
book — another confidently-wrong number. `feature/ssrm` already fixed this (a +18/−1 hunk
in `useFilterModel.ts` plus `ssrmFilterCounts.ts` and `SsrmFilterCountsContext.tsx`),
routing counts to the engine and deliberately leaving the client match-sets empty so
incremental ticks re-query rather than patching stale sets. Lift all three, along with
`resolveSsrmWithQuickFilter.ts`, which pairs with the `onModelUpdated` listener in §5.8.

### 5.5 Set-filter values

`withSsrmSetFilterValues` (lift) routes `filterParams.values` to
`provider.getSetFilterValues({column})` with `refreshValuesOnOpen: true`. Two non-obvious
details in the lifted file are correct: the `agMultiColumnFilter` envelope ignores
top-level `values` (the set *sub*-filter's own params must carry them), and `success` must
be called exactly once — a rejection that never calls it leaves the menu spinning forever.
Cache per `(datasource, column)` and share across sessions whenever the base filter is
empty, which is the common case.

### 5.6 Conditional editing — net-new, both modes

No expression-driven `editable` exists anywhere today; it is a plain boolean at every
authoring site plus a grid-wide stale-data lock. Build it as a real feature mirroring
conditional styling. Consumers already tolerate the function form
(`collectTargetCells.ts:24-37`), so Smart Edit and Bulk Update pick it up for free.

**Writes are a separate, real gap.** The cell-editor path works (listen to
`cellValueChanged` via `api.addEventListener` — never the grid option, which alerts,
styling, history and smart-edit all attach to). But smart edit, bulk update and undo/redo
call `applyTransactionAsync` directly from `editing-core/applyPatches`, which under SSRM is
not a write path at all. **Its own phase.** Until it lands, disable those toolbar segments
under SSRM with a status line rather than letting them fail silently.

### 5.7 Visual Excel — hydrate, then export

`exportVisualExcel` is thin, but its value is entirely in `processCellCallback` plus the
`buildVisualExcelStyles` pipeline, which need **live grid columns and formatters**. A
server-side CSV dump loses the feature. Under SSRM it would export ~2,000 loaded rows and
name the file as if it were the book — the most dangerous break in the list.

`viewManager.readAllRows` already exists for exactly this, draining in
`EXPORT_CHUNK_ROWS = 10_000` chunks. Design: pull all matching rows with a progress
overlay, mount a **detached off-screen `MarketsGridCore`** in client mode with the *same*
`columnDefs` (which already carry every formatter and class rule), run the existing
`exportVisualExcel` against it, unmount. Reuses 100% of the styling pipeline. **Refuse
above a ceiling** (~250k rows) with a "export the current filter" dialog — an unbounded
pull OOMs the tab, and a truncated export presented as complete is the failure to avoid.

### 5.8 Other CSRM-only APIs

`forEachNode` (8 call sites) walks **loaded blocks only** — a plausible wrong answer, never
an error. Per caller: calc aggregates → tier 3; bulk-update distinct values →
`getSetFilterValues`; alerts → engine bridge; headerPainter and timedActivations →
viewport-scoped is *correct* (they paint what is on screen). Select-all →
`setServerSideSelectionState({selectAll: true})`. Range/clipboard → clamp to loaded blocks
and say so; a range copy that silently emits blanks is worse than a refusal.
`quickFilterText` under `serverSide` fires **`modelUpdated` only**, not `filterChanged` —
port the `onModelUpdated` listener with its last-value comparison, which is load-bearing
(the purge fires `modelUpdated` again → loop), not an optimisation.

---

### 5.9 Coverage audit against the AG Grid SSRM contract

Read off the installed 35.1 typings; re-verify at 36 with the rest of §2.
**`IServerSideRowModel` is implemented by AG Grid, not by us** — it is the capability
surface, reached through `gridApi` (`refreshServerSide`, `retryServerSideLoads`,
`setRowCount`, `getServerSideGroupLevelState`). Only `IServerSideDatasource` is ours.

| Member | Status |
| --- | --- |
| `IServerSideDatasource.getRows` | ✅ §4.2, §5 |
| `IServerSideDatasource.destroy?()` | ✅ §5.9.5 — session detach |
| `IServerSideGetRowsParams` — `request`, `success`, `fail`, `api`, `context` | ✅ (incl. the exactly-once and `'superseded'` deadlock rules) |
| `IServerSideGetRowsParams.parentNode` | ✅ §5.9.5 — `getRoute()` is the authoritative route |
| Request: `startRow`/`endRow`, `rowGroupCols`, `valueCols`, `groupKeys`, `sortModel` | ✅ mapping table |
| Request: `pivotCols` / `pivotMode` | ✅ §5.9.2 |
| Request: `filterModel` as `AdvancedFilterModel \| null` | ✅ §5.9.1 — both branches, one compiler |
| `LoadSuccessParams` — `rowData`, `rowCount`, `pivotResultFields` | ✅ |
| `LoadSuccessParams.groupLevelInfo` / `groupData` | ✅ tracked as V1 |
| Options: `serverSideDatasource`, `cacheBlockSize`, `maxBlocksInCache`, `blockLoadDebounceMillis`, `serverSidePivotResultFieldSeparator` | ✅ §4.2 |
| Option: `serverSideEnableClientSideSort` | ✅ as risk + V3 |
| Callback: `getChildCount` | ✅ §5.2 (`__ssrmChildCount`) |
| Callback: `isApplyServerSideTransaction` | ✅ §5.9.5 — vetoes superseded-generation ticks |
| Options: `serverSideInitialRowCount`, `maxConcurrentDatasourceRequests`, `purgeClosedRowNodes`, `serverSideSortAllLevels`, `serverSideOnlyRefreshFilteredGroups` | ✅ §5.9.6 — deliberate values |
| Callbacks: `isServerSideGroupOpenByDefault`, `getServerSideGroupLevelParams` | ✅ §5.9.5 |
| Tree data: `treeData`, `isServerSideGroup`, `getServerSideGroupKey` | ✅ §5.9.3 — phase 13 |
| Master/detail: `masterDetail`, `isRowMaster` | ✅ §5.9.4 — phase 14 |
| `api.setRowCount(count, isLastRowIndexKnown)` | ✅ §5.9.5 |
| `api.retryServerSideLoads()` | ✅ §5.9.5 — wired to the failed-block backoff |

**Nothing is out of scope. Every member above is designed below.**

### 5.9.1 Filtering — one mechanism covers `FilterModel` *and* `AdvancedFilterModel`

Perspective's `filter` array is AND-only, which is why `filterTranslate.ts` gives up on OR.
`AdvancedFilterModel` is an arbitrary AND/OR tree, so it cannot be expressed that way at all.
Both fall out of one design:

- **Fast path** — a flat AND of column conditions compiles to the native `filter` array,
  exactly as `filterTranslate.ts` does today. This is the overwhelmingly common case and
  keeps the engine's own optimiser in play.
- **General path** — anything with OR, negation or nesting (a `filterType: 'join'` tree, or
  a `FilterModel` with `operator: 'OR'`) compiles the **whole tree to one boolean
  Perspective expression column** `__filter_<hash>`, then filters
  `[['__filter_<hash>', '==', true]]`.

That single addition closes the Advanced Filter gap **and** removes the OR limitation from
ordinary filters. Same compiler, two entry points. The expression column is part of the
`viewConfigKey`, so it caches and invalidates like any other view state.

### 5.9.2 Pivot

`split_by: pivotCols.map(c => c.field)`, `columns: valueCols`, `aggregates` per value column.
Perspective can hold `group_by` and `split_by` simultaneously, which matches AG allowing
row grouping and pivoting together. Three things make this harder than it looks:

**`pivotResultFields` is a whole-book question, not a per-block one.** AG regenerates every
secondary column whenever the set changes. Deriving it from the current block would churn
the entire column layout on each scroll. Compute the full distinct pivot-key cross-product
once per `(filter, pivotCols, valueCols)`, cache it in the SharedQuestionPool, and
invalidate on filter change — it is exactly the kind of question that pool exists for.

**Separator collisions are a silent corruption.** AG builds the secondary column *group
tree* by splitting each field on `serverSidePivotResultFieldSeparator`. Perspective joins
split-by columns with `|`; AG wants the configured separator. If any pivot **value**
contains that separator, AG's split produces the wrong group tree with no error. So the
engine validates the distinct pivot values against the separator and, on any collision,
switches that datasource to **synthetic field ids** (`p0`, `p1`, …) plus a lookup the
client restores display names from via `processPivotResultColDef` /
`processPivotResultColGroupDef`. Never emit a colliding field name and hope.

**Cardinality has to be bounded.** The cross-product is
`distinct(pivotCols) × valueCols`; a thousand distinct values against five value columns is
five thousand columns, which melts the browser well before it troubles the engine. Refuse
above a configurable ceiling with a message naming the offending column and its cardinality,
the same posture as the export ceiling in §5.7.

`pivotDefaultExpanded`, `suppressExpandablePivotGroups` and the two `processPivotResult*`
callbacks are client-side shaping and pass through unchanged.

### 5.9.3 Tree data

`treeData: true` leaves `rowGroupCols` empty — the hierarchy lives in the data, and
`groupKeys` carries the expanded path. `feature/ssrm`'s `TreeDataConfig` already defines
both shapes, and Perspective has no native hierarchy, so the engine synthesises one:

- **`parent` mode** (rows linked `parentField` → key) is a plain filter: children of `K` are
  `[[parentField, '==', K]]`, roots are `parentField` null. Expandability comes from a
  child-count map maintained at ingest rather than a per-row count query.
- **`path` mode** (rows carry a path array) needs help, because Perspective cannot filter on
  an array prefix. Derive `__path_0 … __path_n` plus `__path_len` columns at ingest; children
  at `[a,b]` are then `__path_0=='a' AND __path_1=='b' AND __path_len==3`. Bounded by a max
  depth fixed at schema time.

`isServerSideGroup` reads `__ssrmTreeGroup`, `getServerSideGroupKey` reads `__ssrmGroupKey`,
`getChildCount` reads `__ssrmChildCount` — all three fields already exist on `EnrichedRow`.
The §4.4 `getRowId` fix already covers tree nodes, since `parentKeys` *is* the path.

### 5.9.4 Master / detail

`isRowMaster` reads `__ssrmHasDetail`; `getDetailRowData` calls
`provider.getDetailRows({masterKey, detailField?, detailParentField?})` — the
`DetailRowsRequest` already in the contract. Engine-side it is a filtered read, and
`viewManager.readMatchingRows` exists for precisely this ("the children of a master row this
window expanded"). **Detail grids stay client-side row model**: a detail set is small by
nature, so an SSRM detail grid would add a session and a ViewSet per expanded master for no
benefit.

### 5.9.5 The remaining datasource and API members

| Member | Design |
| --- | --- |
| `destroy?()` | Send `detach {sessionId}` so the engine releases the ViewSet, StatusView and viewport interest. Without it sessions leak on every grid teardown and a desk cycling blotters accumulates dead Views that still cost work on every tick. **Smallest fix, highest value.** Assert session count returns to zero after unmount. |
| `params.parentNode` | `parentNode.getRoute()` is the authoritative route for tree data and for addressing transactions; prefer it over reconstructing from `groupKeys`. |
| `api.setRowCount(n, isLastRowIndexKnown)` | The correction path when a tick deletes rows outside the cache. Pairs with `ServerSideTransaction.rowCount`. Perspective always knows the count, so `isLastRowIndexKnown` is `true` — but wire it, because the tick path needs it. |
| `api.retryServerSideLoads()` | Wire the failed-block backoff from §4.2 to this instead of describing it abstractly. Called on reconnect after an engine restart. |
| `isApplyServerSideTransaction` | The veto hook. Use it to drop transactions stamped with a superseded generation, so a late tick cannot patch rows belonging to a query the user has already navigated away from. |
| `isServerSideGroupOpenByDefault` | Client-side; feed it from saved grid state so a restored profile re-expands the same groups. |
| `getServerSideGroupLevelParams` | Per-level block size and cache tuning — a leaf level under a narrow group does not need a 100-row block. |

### 5.9.6 The five options, with deliberate values

| Option | Value | Why |
| --- | --- | --- |
| `maxConcurrentDatasourceRequests` | match the engine's `block_reads` permits (§6.3) | Otherwise one silently bounds the other and the semaphore tuning is fiction |
| `serverSideInitialRowCount` | 1 | Affects first-paint scrollbar length; a large guess makes the scrollbar jump when the real count lands |
| `purgeClosedRowNodes` | `true` | Bounds memory on a deep tree; costs a refetch on re-expand, which is cheap against a local engine |
| `serverSideSortAllLevels` | `true` | The engine sorts every level anyway; leaving it false makes the grid re-request more than it needs |
| `serverSideOnlyRefreshFilteredGroups` | `true` | Directly reduces refetch volume on filter change — the exact cost this project exists to minimise |

Every value above is a starting point to measure, not a settled fact.

## 6. Engine

### 6.1 Object model

```
Registry
 └─ Datasource (per providerId)      Server + Table + ingest task + shadow + revision
    ├─ SharedQuestionPool            whole-book answers, deduped by viewConfigKey
    │                                across every blotter on the desk
    └─ Session (per client)          filter/sort/group/quick/exprs/viewport/generation
       └─ ViewSet                    LRU, one View per open group level, generation-fenced
```

One `Server` **per Datasource**, not one global — Servers do not share Table data, so this
keeps a whole-book scan on book A off the block reads for book B regardless of how the
parallelism gate resolves. State is **derived, not negotiated**: AG puts the full query on
every `getRows` call, so the engine hashes it; a hash change rebuilds the ViewSet.

### 6.2 Three hard-won invariants to port verbatim

- **Generation moves only in `invalidate()`.** If building the View a request asked for
  bumped the generation, that request fences *itself* off and settles empty — the grid
  renders blank on first load and after every sort and filter change, while the log
  cheerfully reports success.
- **Re-measure row count on every `ensure()`.** A blotter that attaches during the snapshot
  otherwise holds a View reporting 0 forever; the status bar reads "0 of 20,000" and no
  refresh helps.
- **Rebuild-on-closed, never settle short.** A read finding its View retired must re-open
  and retry; settling short looks like end-of-book and permanently caps the store.

`safeView` gets *simpler* natively — the JS crash it defends against is a wasm-bindgen
ownership artifact. A `tokio::sync::RwLock<Option<View>>` gives read-drain as the lock's own
semantics: `write()` cannot be acquired until every read guard drops.

### 6.3 Queue discipline

Two independent semaphores per Datasource: `block_reads` (4) and `whole_book` (2). A
whole-book question can never consume a block-read permit, so a block read has a bounded
wait no matter how many status-bar refreshes are in flight. Worth having even if the
parallelism gate resolves badly — it still bounds queue depth and preserves fairness.

### 6.4 Tick classification

The engine knows the group tree and the filter's truth value; a client would need the whole
book to decide. In-place value update (changed cols ∩ group/sort/filter cols = ∅) →
`applyServerSideTransactionAsync`. Sort-key change → throttled `refreshServerSide({route})`,
because an update moves the value but not the position. Group-key change → remove from old
route + refresh new + refresh **both** ancestor chains. Ancestor group rows get aggregate
updates on their *parent's* route. Escalate to a single root refresh if per-window route
count exceeds a threshold — N small refreshes cost more than one.

### 6.5 Wire codec

**Reject `apache-arrow`** (~1 MB+ into every window bundle, against the footprint goal).
Ship the repo's existing `columnarCodec.ts` (`COL1`) first — the JS decoder exists, is
tested, and is already the hub→window format, so the client needs zero new decode code.
Then negotiate up to an `arrow0` layout (Arrow buffers + a tiny JSON field descriptor,
~150 lines of `DataView` slicing, no flatbuffers) for int64 fidelity — `COL1` encodes
numbers as `f64`, so keep id columns as strings until then.

---

## 7. Packaging

```json
"appAssets": [{ "src": "…/stern-engine-win-x64.zip", "alias": "stern-engine",
                "version": "0.1.0+<sha>", "target": "stern-engine.exe" }],
"permissions": { "System": { "launchExternalProcess": true } }
```

Greenfield: one `launchExternalProcess` call site exists repo-wide (`launch.ts:121`), no
`appAssets`, no `terminateExternalProcess`, no supervision.

- **`initWorkspace` owns the launch** — its process-wide `isInitialized` guard
  (`workspace.ts:204-207`) gives single-launch for free. Launch after `platform-api-ready`
  (`:331`) with `lifetime: 'application'`, which is correct given
  `preventQuitOnLastWindowClosed: true`. Not `'persist'` — that orphans across restarts.
- **Handshake.** `launchExternalProcess` returns a process UUID, not a pid, and stdout is
  unreadable. Provider passes `--handshake <path> --nonce <n>`; engine binds `127.0.0.1:0`,
  **generates the token itself** (command lines are world-readable in the process table),
  writes `{nonce, port, token, …}` atomically, provider polls and accepts only a matching
  nonce — which is what rejects a stale file from a crashed run without needing a pid.
  Token travels in the first `hello` frame, not a header (browsers can't set them) and not
  a query string.
- **Version stamping is the cache key.** OpenFin caches on `(alias, version)`; a rebuilt
  same-version zip is silently not re-downloaded. Suffix `+<sha>`.
- **Late joiners** — IAB has no replay. Register a Channel with `wait: true` (template at
  `testBridge/install.ts:61`) so a window opening before the provider is ready simply waits.
  Add `IAB_ENGINE_ENDPOINT_CHANGED` to `iabTopics.ts` for re-handshake after a restart.
- **`revision` must be epoch-qualified** or a post-crash restart silently fails every
  staleness check in the wrong direction.
- **Security posture, stated plainly:** loopback is not an authorization boundary — any
  process running as the user can reach the port. The honest position is that the engine
  grants no authority beyond the user's own session. What *is* genuinely blocked is a web
  page probing `ws://localhost:*`: reject any `Origin` that is not the app origin.
  Browsers set `Origin` and cannot forge it, so that is a real control, not theatre.

### 7.1 Datasource configuration — push, don't pull

Two layers that must not be conflated:

- **The engine endpoint** (host/port/token) is *not* user-facing config. It is discovered
  through the OpenFin handshake and Channel (§7). Nobody authors it.
- **A datasource** is an existing `DataProviderConfig` — a STOMP/REST/mock row already
  authored in the DataProvider editor. **No new provider type is created.** The user takes
  an existing STOMP provider and flips that grid's ROW ENGINE to Server. That is what keeps
  "no major disruption" true at the config layer as well as the UI layer.

Config reaches the engine by **push, mirroring the hub's `AttachRequest.cfg`**:

```
→ attach       { providerId, config, configHash }   // first attach creates the Datasource
→ reconfigure  { providerId, config, configHash }   // explicit, user-initiated
→ probe        { config }                           // "Test connection", once Rust owns ingest
```

`reconfigure` rides the path that already exists: every provider-editor mutation calls
`notifyCatalogInvalidate(providerId)` (`runtime/config/store.ts:148-151`) →
`client.invalidateConfig()`. Extend that fan-out to the engine.

**A later `attach` with a different `configHash` is accepted but reported back as
`configMismatch` in `attached` — never a silent restart.** One window must not yank the
book out from under five others because it holds a stale catalog row; the client surfaces a
staleness banner and the user decides.

*Why push rather than let the engine fetch its own catalog:* pulling would need
ConfigService auth from a native process (Kerberos/SSO on a bank network — a project in
itself) and would duplicate `ConfigManager`'s scope and migration logic in Rust. Pushing
keeps the engine a pure compute process and leaves the config layer where it already works.
The cost is no pre-warm before the first window opens; revisit only if warm start proves
worth the auth story.

**Templates must be resolved client-side.** STOMP configs carry `{{appdata.key}}` templates
and `[bracket]` tokens resolved by `startProvider(cfg, emit, {appDataLookup})` against the
AppData store, which lives in the SharedWorker and IndexedDB. The engine cannot reach
either. The client resolves first and pushes the **resolved** config — same for any
credential material.

**Phasing softens this considerably.** Before Rust owns ingest, the engine needs only
`keyColumn` plus schema: JS keeps parsing STOMP and pushes rows as `upsert` frames. The
full `StompProviderConfig` only matters from the ingest phase onward, which is also when
the editor's "Test connection" should start routing through `probe` so it exercises the
same code path it will use in anger.

### 7.2 Stop and restart

Two scopes, and the contract already provides one of them free.

**Per-datasource** — `ISsrmDataProvider.refresh()` and `restart(extra?)` already exist and
already have UI. They map to `refresh {providerId}` / `restart {providerId}`: rebuild one
book without disturbing any other blotter. This is the common case ("my book looks wrong")
and needs no new lifecycle machinery.

**Whole process** — new. Only the platform provider can call `launchExternalProcess` /
`terminateExternalProcess`, so a window must *request* it and needs an answer back ("did it
come back, on what port?"). That is a **Channel** operation, not IAB pub/sub: the
`stern-engine-broker` Channel gains `status`, `restart`, `stop`, `start` beside
`getEndpoint`.

The restart ordering is the whole difficulty:

1. Broadcast `engine-stopping`; windows quiesce — stop issuing `getRows`, show the existing
   `StaleDataBanner`.
2. Send `shutdown`; wait ~2 s for a clean flush.
3. `terminateExternalProcess({uuid, timeout, killTree: true})` → `"clean" | "terminated" | "failed"`.
4. Relaunch. **New port, new token** — neither is stable across a restart.
5. Publish `IAB_ENGINE_ENDPOINT_CHANGED`.
6. Windows re-handshake, re-`attach`, and **must re-issue `refreshServerSide`** — the book,
   Views, sessions and viewport interest are all gone.
7. `revision` must be epoch-qualified, or every staleness check silently passes in the
   wrong direction after the counter restarts at 0.

**Stop has to be sticky.** The supervisor auto-restarts on crash (3 exits within 5 s → give
up and fall back). An operator "Stop" that the supervisor immediately undoes looks broken,
so it must set an `intentionallyStopped` flag the supervisor honours; a manual restart
clears it and resets the crash counter.

**Do not auto-fall-back to CSRM mid-session.** Falling back means changing the
`<MarketsGrid key>` — new platform, fresh profile hydration (§1.1) — which is far more
disruptive than a banner. Banner and retry while the engine is down; auto-fallback belongs
only at *launch* time, when nothing is mounted yet.

**UI: a dock action only — `ACTION_RESTART_SSRM_ENGINE` (plus Stop/Status).**

Whole-engine lifecycle is an **admin** operation, not a per-grid one, and it deliberately
does **not** go in the grid customizer. When the engine wedges, a settings panel *inside a
blotter* is precisely what you may not be able to reach — so the control must not depend on
a grid rendering. Exact precedent: `ACTION_INSPECT_SHARED_WORKER` already exists in
`iabTopics.ts` for the same reason, to operate on the out-of-band data runtime from the
dock. Same scope and `customData` plumbing as the other admin tools.

**Consequence: `ProviderGridHostApi` is untouched by this.** No `engineStatus`, no
`onEngineRestart`, no `onEngineStop`. The Data Provider card keeps only its existing
*per-datasource* controls (`onRefreshView` / `onReloadFromSource` / `onEditProvider`), which
already map onto `ISsrmDataProvider.refresh()` / `restart()` and are the controls a trader
actually reaches for. The two scopes stay cleanly separated: traders restart a book, admins
restart the process.

**Footprint.** CSRM users pay nothing: lazy surface chunk + a `@wellsfargo-starui/data/ssrm`
subpath behind a dynamic import, with `import type` across the boundary. The one exception
is the ~1 KB of `ctx.rowModel` lookup predicates in `transforms.ts`, which must be
synchronous because transforms run before the surface mounts. Accept it — injecting them at
mount creates an ordering hazard that shows as unstyled cells on first paint.

**Build.** `engines/` as a new top-level Cargo workspace stays out of npm/turbo/lint/Sonar
automatically (root `workspaces` enumerates 7 explicit paths). `buildEngine.mjs` mirrors
`buildWorker.mjs` but **must exit 0 without a Rust toolchain** — most contributors won't
have cargo. No asset → the platform finds no engine → falls back to the SharedWorker path.
Do **not** add the zip to `BUILD_ASSET_SENTINELS`; that would hard-fail every such
contributor. CI needs a new `windows-latest` job — the workflow is ubuntu-only today.

---

## 8. Phasing

| # | Phase | Deliverable |
| --- | --- | --- |
| **−1** | **Port the AG Grid 36.1 upgrade** | Pin sign-off (blocking, non-technical); 15 manifests; port the branch's collateral — `enableDevValidations`, ~44 e2e selector renames, pinned-container selectors; run the V1–V7 table and amend this plan in place; audit the set-filter workaround cluster. **Blocking for everything below.** |
| **0** | Engine gates | Build/parallelism/memory spikes; code-signing request opened |
| **1** | Contract | `ISsrmDataProvider`, `EnrichedRow` with `__ssrmRowRules`/`__ssrmCellRules`, `data/ssrm` subpath, capability. No UI. |
| **2** | **A scrolling SSRM grid on screen** | `GridSurfaceSlot` + lazy SSRM surface + `createSsrmDatasource` (incl. **`destroy()`** → session detach) + WS provider + platform `rowModel`/`getRowId` + the five deliberate option values + the Advanced Filter guard. Driven only by the `ssrm` prop from the lab app. |
| **3** | Mode selection | `gridLevelData.rowModel`, `RowEngineControl`, `<MarketsGrid key>` |
| **4** | Read-only parity | Status bar + set-filter values + **saved-filter pill counts**. First point a user could plausibly work in SSRM. |
| **5** | Live ticks + aggregation | `bindSsrmTicks` async, flash, scroll pause, `getChildCount`, grand total |
| **6** | Calculated columns | Three-tier planner + `configureExpressions` |
| **7** | Conditional styling + alerts | Lookup predicates; engine shadow; alerts bridge |
| **8** | Broken-API replacements | Select-all, range clamp, Visual Excel hydrate-then-export |
| **9** | The Rust engine | Implements the frozen protocol, passes the same conformance suite |
| **10** | App-asset packaging + cutover | Manifest, launch, supervision, `stern-engine-broker` Channel, `ACTION_RESTART_SSRM_ENGINE` dock action, native-preferred with WASM fallback |
| **11** | Conditional editing | Read side, then the `editing-core/applyPatches` write seam |
| **12** | **Pivot** (§5.9.2) | `split_by`; `pivotResultFields` as a cached whole-book question; separator-collision detection with synthetic-id fallback; cardinality ceiling |
| **13** | **Tree data** (§5.9.3) | `parent` mode filter; `path` mode derived `__path_*` columns at ingest; `isServerSideGroup` / `getServerSideGroupKey` / `getChildCount` |
| **14** | **Master/detail** (§5.9.4) | `isRowMaster` from `__ssrmHasDetail`; `getDetailRows`; detail grids stay CSRM |

Phases 12–14 complete the interface. They are sequenced last because nothing in MarketsGrid
uses them today and none is on the path to the performance goal — but all three are in
scope, and the contract fields they need (`TreeDataConfig`, `DetailRowsRequest`,
`__ssrmTreeGroup`, `__ssrmHasDetail`) already exist on `feature/ssrm`, so no protocol change
is required when they land.

All client work lands against the TS/WASM engine before any Rust exists — that is the plan's
main risk control, and it lets the engine be built in parallel.

---

## 9. Verification

- **Shared golden fixtures.** Export the existing `filterTranslate.test.ts` cases to
  `engines/tests/fixtures/*.json`, read by **both** the TS test and the Rust test. This is
  the mechanism that keeps two hosts honest indefinitely — without it the Rust port drifts
  silently and a filter means one thing in the grid and another in the badge above it.
  Same for `composeRowId`, whose composite-key join must be byte-identical.
- **Conformance suite.** Retarget `engineContract.test.ts` / `engineBoundary.test.ts` (already
  transport-agnostic) to run against both engines; the native run spawns the binary and
  **skips cleanly when absent**, so ubuntu CI stays green.
- **Branch coverage is where the tests earn their keep** — 70% per file, RTL enforced by
  `npm run check:rtl`. Priority cases: the generation self-fence *miss* (blank grid), the
  `'superseded'` rejection that must still call `fail()` (deadlock), sibling groups under
  different parents not colliding, and `resolveGridSurface` never returning client when
  server was asked for.
- **Parity harness.** Same provider, same profile, CSRM and SSRM side by side; assert
  identical status-bar numbers, set-filter value sets, calculated values and styling classes
  for the visible viewport. The lab app's ~90 profile fixtures are this matrix already.
- **Console health.** Add SSRM to `grid-console-health.spec.ts` — AG warn 205 (duplicate row
  id) and warn 22 (initial property) must both be absent. Both failures are console-only.
- **Perf gates.** p99 `getRows` < 10 ms per 100-row block; renderer main thread under 10%
  with 6 blotters at 20k rows. The branch's measured 2-6 ms flat window read is the floor to
  beat, not a target.
- `npx turbo typecheck build test` green; `docs/current-features.md` updated in the same
  change.

## 10. Top risks

| Sev | Risk | Mitigation |
| --- | --- | --- |
| **CRITICAL** | Code signing / EDR blocks the exe. Organizational, long lead. | Start day one, parallel to Phase 0 |
| **CRITICAL** | Surface remount destroys `GridPlatform` and silently loses the profile — the existing design docs prescribe exactly this | §1.1; regression test that a mode change rehydrates |
| **CRITICAL** | `perspective-server` may not link MSVC with `crt-static` | Phase 0 gate; fallback ships VC DLLs |
| **HIGH** | Parallelism unproven — the #1 stated motivation | Phase 0 gate; restate the pitch honestly if it serializes |
| **HIGH** | `getRowId` group-row collision → warn 205, console-only | §4.4 + console-health spec |
| **HIGH** | Sync transaction → `RowChangeBus` blind → alerts and styling degrade silently | §5.1 async transaction — may dissolve at 36 (V2), mitigation is harmless either way |
| **MEDIUM** | ~44 e2e selector sites break on the 36 viewport-class renames | High volume, near-zero uncertainty — the substitutions exist in the branch diff. Hours, not days. |
| **MEDIUM** | The 35.1 pin is reinstated mid-flight by a policy owner who was not consulted | Sign-off is step 1 of Phase −1 for exactly this reason. A reversal is not a rebase; it is a redesign of §5.1 and §5.2. |
| **MEDIUM** | `enableDevValidations()` makes diagnostics louder by design → new console warnings read as regressions | Triage before assuming; `grid-console-health.spec.ts` needs a 36 baseline |
| **MEDIUM** | `IServerSideDatasource.destroy()` unimplemented → engine sessions and their Views leak on every grid teardown, still costing work on every tick | §5.9 gap 1; assert session count returns to zero after unmount |
| **MEDIUM** | A pivot **value** containing the separator makes AG build the wrong secondary column group tree, with no error | §5.9.2 — validate distinct values against the separator; fall back to synthetic ids + `processPivotResultColDef` |
| **MEDIUM** | Pivot cross-product explodes the column count and melts the browser before it troubles the engine | §5.9.2 cardinality ceiling, refusing with the offending column named |
| **MEDIUM** | `pivotResultFields` derived per-block instead of whole-book would churn the whole column layout on every scroll | §5.9.2 — cached whole-book question, invalidated on filter change |
| **HIGH** | `__ssrmStyle` loses priority, indicators, flash, formatters | §1.2 class lookup |
| **HIGH** | Visual Excel exports loaded blocks, named as the book | §5.7 hydrate-then-export with a ceiling |
| **HIGH** | Self-fencing generation → blank grid, logs report success | §6.2 |
| **MEDIUM-HIGH** | Editing write paths land on nothing and repaint stale a moment later | Phase 11b; disable segments meanwhile |
| **MEDIUM-HIGH** | Client `valueGetter` calc column sorts the book by a value it doesn't have | §5.3 three tiers, clamp and label tier 2 |

## 11. Open decisions

- **Branch landing strategy** — deferred by the user. Everything above assumes
  `feature/ssrm` and `feature/perspective-grid` land or are cherry-picked first.
- **The corporate AG Grid 35.1 pin** needs an owner's sign-off that it is lifted.
- Commit `Cargo.lock`, diverging from the repo's no-lockfile rule — that rule exists because
  npm lockfiles pin `registry.npmjs.org`, which crates.io does not have; a binary crate
  should pin. Document the divergence.
