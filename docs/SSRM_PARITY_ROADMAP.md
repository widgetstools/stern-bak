# SSRM parity roadmap — execution record

**Branch:** `feature/simplify`. **Status: 2 / 11 phases done (Phases 0–1).**
Phases are written to be picked up cold, one per session.

The originating audit found that SSRM and CSRM grids are at parity in
*chrome* and not in *behaviour*. Only five `ssrm` guards exist in the whole
of `packages/react-grid/grid/src/widget/`, and **nothing in the customizer is
row-model aware at all** — `PlatformHandle` has no row-model field
(`packages/core/engine/src/platform/types.ts:263-278`) and the one place that
anticipated one is still a TODO
(`packages/react-grid/grid/src/widget/useSsrmExpressionBridge.ts:61-62`). So
sixteen customizer modules run their CSRM implementations unchanged against a
~2,000-row block cache (`maxBlocksInCache 20` × `cacheBlockSize`,
`MarketsGridSsrmSurface.tsx:373`) of what may be a 100,000-row dataset.

36 divergences were catalogued: **10 that produce confidently wrong output**,
**11 silent no-ops**, and **15 container wiring gaps**. 9 capabilities were
confirmed at parity and must not regress. The finding index at the bottom maps
every one to the phase that closes it.

## The root cause, stated once

SSRM parity was **built at the data layer and never connected at the module
layer**. The worker plane already computes calculated columns, style rules,
alerts and editable gating correctly across the full dataset. Ready-made
consumers for two of those — `ssrmCellStyle` and `ssrmEditable` — are exported
from the grid barrel (`packages/react-grid/grid/src/index.ts:79`) and
referenced nowhere. Because no module consults the row model, the client's
partial-window implementation always wins.

Four Tier 1 and Tier 2 findings collapse into that single missing connection.
The spine of this roadmap is making the connection properly rather than
branching on a flag at each of the ~40 call sites that would need it.

## The spine — `platform.data`

Modules stop touching the AG Grid row model directly. They call a port:

```ts
export interface PlatformHandle<S> {
  readonly api: ApiHub;
  readonly rows: RowChangeSignal;
  readonly data: GridDataPort;      // ← added in Phase 0
  // …
}
```

This is **not a new pattern**. `rows: RowChangeSignal` already exists for
exactly this reason, and says so in its own doc comment: *"Subscribe here
instead of wiring a private `modelUpdated` listener that walks every row per
tick."* `GridDataPort` is the same idea extended from change-notification to
read and write. Two adapters implement it — CSRM over `forEachNode` /
`applyTransactionAsync`, SSRM over the worker RPCs — and **no module contains
an `if (rowModel === …)` branch when the roadmap is done.**

Where a capability genuinely cannot exist under SSRM (range edits addressing
unloaded rows; a `comparator` closure crossing `postMessage`), the port's
`capabilities` object drives the UI: the control renders disabled with a
tooltip naming the reason. Silent no-ops are never an acceptable end state —
they are the defect this roadmap exists to remove.

---

## Binding constraints (they override phase text)

1. **No loss of features, functionality, or behavior.** Persisted user state
   always keeps loading — normalize-on-read over migrations, migrations over
   breakage. A CSRM grid's behaviour is the reference; SSRM rises to meet it,
   CSRM is never lowered to match SSRM.
2. **No shortcuts, no parallel implementations.** A fix that adds a second way
   to do something the framework already does is wrong even when it passes.
   Superseded code is deleted in the same change as its replacement — never
   `v1/`, `v2/`, `legacy/` in paths or phasing (CLAUDE.md pre-implementation
   rule 7).
3. **No module may branch on the row model.** If a phase's fix needs
   `if (ssrm)` inside `packages/core/engine/src/customizer/modules/**`, the
   port contract is wrong — fix the port, not the module. Phase 10 lands the
   ESLint rule that makes this mechanical.
4. **The 9 confirmed-parity capabilities are regression targets, not
   untouchable code.** They may be refactored; they may not change behaviour.
   Each phase that touches one names it in its exit criteria.
5. **Complexity ceilings hold** — 800 LOC / file, 80 LOC / function.
   (`QueryEngine.ts` was over at 834; Phase 1 took the documented tree-data
   split — `treeIndex.ts` — and it is 744.)
6. OpenFin flows cannot be e2e'd headlessly here. Changes near `contextLink`
   and `onWorkspaceSave` ship with a manual-validation note.

## Working method (proven on the simplification effort; keep using it)

- **Survey first.** Re-verify with file:line evidence before designing. The
  original audit's claims were spot-checked but not exhaustively; treat a
  phase's cited lines as a starting point, not gospel — the tree moves.
- **Baseline before blame.** Any failure gets stash → rebuild → re-run before
  being attributed to the change at hand.
- **Chunk into independently shippable commits.** Per chunk:

  ```bash
  npx turbo typecheck build test; echo "TURBO_EXIT=$?"
  ```

  Capture the exit code directly — piping turbo through `grep` has masked
  failures on this repo before.
- **E2E battery** (`apps/e2e`, self-skips when stomp-view-server :8081 is
  down): `star-demo-ssrm-smoke.spec.ts`, `ssrm-viewport-ticks.spec.ts`,
  `hello-blotter.spec.ts`. Apps consume built `dist` — run
  `npm run build:packages` before browser verification.
- **Coverage gate** is separate and per-file at 70%:
  `npm run test:coverage && npm run check:coverage`.
- Every commit that changes a capability updates `docs/current-features.md` in
  the same change. Note §366–390 currently overstates SSRM parity — each phase
  corrects the bullets it invalidates.

## Cold-start preamble (every session)

Read, in order: this file's constraints + the phase you are running ·
[`CLAUDE.md`](../CLAUDE.md) · [`docs/latest/architecture.md`](./latest/architecture.md)
for the layer/import rules · [`docs/WORKLOG.md`](./WORKLOG.md) for open items
that overlap. Then re-verify the phase's cited file:line before editing.

---

## Phase 0 — the data port ✅

**Goal:** `platform.data` exists, both adapters pass one shared contract suite,
and no module has changed. Pure addition; behaviour identical before and after.

**Entry:** none — this is the root of the tree.

**Scope**

- Define `GridDataPort` and `DataCapabilities` in
  `packages/core/engine/src/platform/types.ts`, beside `RowChangeSignal`.
  The read surface must cover every access pattern the audit found modules
  using: full scan, distinct values for a column, aggregate over a column,
  count under a filter model, and addressed reads (by row id, by range).
  The write surface covers row updates. Every method is async — the SSRM
  adapter crosses a worker boundary and the signature cannot pretend otherwise.
- `capabilities` is a value, not a method: what this grid can do *right now*,
  including scope limits (`canAddressUnloadedRows`, `exportCoversFullDataset`,
  `supportsCustomComparator`) so Phase 6 can drive UI from it.
- Implement `CsrmDataAdapter` — wraps today's `forEachNode` /
  `applyTransactionAsync` behaviour **exactly**, including its current quirks.
  Phase 0 changes nothing.
- Implement `SsrmDataAdapter` over the existing worker RPCs
  (`ssrm-get-rows`, `ssrm-set-filter-values`, `ssrm-status-bar`). Where no RPC
  exists for a port method, the adapter reports the gap through `capabilities`
  rather than faking it. Adding the missing RPCs is later-phase work; do not
  invent them here.
- Write `portContract.test.ts` — **one suite, both adapters**. This is the
  artefact that prevents the semantic drift the audit found (three
  disagreeing filter implementations). Model it on the existing
  `engineContract.test.ts`, which already proves this pattern works in this
  repo.
- Construct the right adapter in `GridPlatform` and expose it on
  `PlatformHandle`.

**Out of scope:** any change under
`packages/core/engine/src/customizer/modules/**`. Any new worker RPC.

**Exit**

- `platform.data` available to every module; zero consumers yet.
- Contract suite green against both adapters.
- `npx turbo typecheck build test` green; e2e battery unchanged.
- The port's shape is reviewed against Phases 1–6 scope before landing — a
  port that needs redesigning at Phase 4 costs more than one that was drafted
  against all six.

**Closes:** none (enabler for 21 findings).

### What landed

`packages/core/engine/src/platform/` — `types.ts` (port + capability + IO
types), `CsrmDataAdapter.ts`, `SsrmDataAdapter.ts`, `GridDataHub.ts`,
`gridApiRows.ts`, `portContract.test.ts` (76 cases, every one run against both
adapters), `GridDataHub.test.ts`. Grid side:
`widget/useSsrmDataBinding.ts` + test, two one-line call sites in
`useGridHost.ts` and `MarketsGrid.tsx`. Zero changes under
`customizer/modules/**`. `npx turbo typecheck build test` green
(`TURBO_EXIT=0`).

Four decisions the later phases inherit:

1. **`DataQuery`'s shape is whatever a CSRM grid can express.** A scope plus
   an extra `filterModel` ANDed on top, in either scope, with no restriction
   on which columns the extra model may name — because that is what
   `forEachNodeAfterFilter` + a per-row predicate does, and CSRM is the
   reference. The port was briefly drafted as a union forbidding
   `{ scope: 'filtered', filterModel }` because the worker's RPCs cannot carry
   it (filter models merge by column id, so an overlapping entry REPLACES the
   applied one instead of intersecting it). That was shaping the port to the
   weaker side and was reverted. `SsrmDataAdapter.planFor` now splits a query
   into the request the worker can honour and a **residual** predicate it
   applies per row while paging — the same fallback `distinct` already used.
   One-round-trip stays the path for every query without an overlap.
2. **`complete` per call, not a `scanCoversFullDataset` capability.** It
   separates "the answer is empty" from "the port could not look" (grid
   unmounted, source detached, limit hit), which a static flag cannot. The
   capability set is 5 keys, each traceable to a phase; nothing speculative.
3. **`capabilities` values are `CapabilityVerdict`s, not booleans** — each
   carries the user-facing reason Phase 6 renders. A `false` with no copy is
   just a politer silent no-op.
4. **`mutate` takes patches, not assembled rows,** and settles on AG Grid's
   flush callback. The adapter owns row assembly because that is the
   row-model-specific part; `applied` / `rejected` is what Phase 4's journal
   records from.

### Divergences the contract suite now pins (not closed here)

Each has a `divergence:` case in `portContract.test.ts` naming its phase, so
it fails loudly the day it changes rather than drifting again:

- **`distinct` is string-projected server-side.** `getSetFilterValues` returns
  `string[]` and collapses null to `''`. `DistinctResult.stringProjected`
  reports it; Phase 6 coerces when writing a chosen value into a typed field.
- **An empty fold is `null` client-side, `0` server-side.**
  `computeStatusBar` ends with `Number(aggRow[field] ?? 0)`, undoing the
  worker's own deliberate `null` ("a 0 price reads as data"). Belongs to
  Phase 1, which owns `ssrm/aggregations.ts`.
- **`getSetFilterValues` deletes the requested column's own filter entry** —
  correct for a set-filter panel, wrong for "values among the displayed
  rows". The SSRM adapter detects the overlap and falls back to a paged
  `getRows` scan. Both RPCs already existed; nothing was invented. Phase 6
  may want a scoped RPC to make the cheap path always available.

### One mirrored implementation, deliberately

`foldColumn.ts` mirrors `ssrm/aggregations.ts`. Core cannot import
`@wellsfargo-starui/data` (data depends on core), and AG Grid has no "fold
this column over every row" API, so a client-side fold is unavoidable. Both
adapters share the one copy — CSRM always, SSRM on the residual path. The
contract suite is what keeps the mirror honest: it asserts both adapters
return the same number for the same dataset.

### Direction of parity, restated

CSRM behaviour is the reference at every level, including the port's own
shape. Where the two adapters differ today, CSRM holds the better answer and
SSRM is the one that has to rise: `aggregate` returns `null` for an empty fold
client-side and `0` server-side (Phase 1); `distinct` returns typed values
client-side and string projections server-side (Phase 6). Nothing was levelled
down to make the suite green.

---

## Phase 1 — query engine correctness ✅

**Goal:** the SSRM query engine stops returning wrong answers for filter
models, sorts and aggregations it accepts.

**Entry:** Phase 0 (for the contract suite as the regression home; the engine
fixes themselves are independent).

**Scope**

- **Nested paths.** `matchSimple` (`ssrm/filter.ts:156`), `sortRows`
  (`ssrm/QueryEngine.ts:809`) and `getSetFilterValues`
  (`ssrm/QueryEngine.ts:308`) read `row[colId]` flat while the projector
  preserves real sub-objects (`providers/fieldProjection.ts:80-108`). Adopt
  the repo's existing `getValueByPath` (`shared-types/src/dataProvider.ts:642`)
  at all three sites. Do not write a fourth accessor.
- **Advanced Filter.** `rowPassesFilter` iterates `Object.entries(filterModel)`
  (`ssrm/filter.ts:231`) and an `AdvancedFilterModel` tree falls to the
  catch-all `return true`. Either evaluate the tree or reject it explicitly —
  but the current silent pass must go. If rejecting, the customizer toggle
  (`gridOptionsSchema.tsx:186`) must reflect it via Phase 6 capabilities.
- **Fallthrough semantics.** `matchSimple`'s trailing `return true`
  (`ssrm/filter.ts:193`) and the three operator `default:` arms
  (`filter.ts:35-37`, `:73-75`, `:150-151`) silently substitute or drop. Make
  unsupported input an explicit, surfaced signal — never a different filter.
- **`aggFunc` handling.** `normalizeAgg` coerces anything unrecognised to
  `"sum"` (`ssrm/aggregations.ts:34-40`). Reject instead. Separately, the
  client must stop sending a compiled closure: `column-customization`'s
  `buildCustomAggFn` (`transforms.ts:465-492`) produces a function that
  reaches `postMessage` unstripped via `createSsrmDatasource.ts:65-72`.
- **Group-row ordering.** Group rows are sorted with the leaf `sortModel`
  (`QueryEngine.ts:271`), yielding `undefined` on both sides and `Map`
  first-seen order. Sort group rows by group key unless the sort names a
  column the group row actually carries.
- **Quick-filter column scope.** `SsrmServer` never passes
  `quickFilterColumns` (`SsrmServer.ts:171-174`), so `RowStore` defaults to
  all fields including hidden ones (`RowStore.ts:119-124`). Plumb the visible
  column set through, honouring `includeHiddenColumnsInQuickFilter`.
- Take the documented tree-data-block-builder split (WORKLOG item 15) rather
  than pushing `QueryEngine.ts` further past 800 LOC.

**Exit**

- Contract suite extended with the AG Grid filter-model surface: every
  operator the UI can emit either evaluates correctly or is explicitly
  rejected. No input reaches a silent catch-all.
- Set-filter distinct values still scan the full filtered set (parity item —
  must not regress).
- `npm run bench:ssrm` shows no regression outside noise.

**Closes:** T1-1, T1-2, T1-5, T1-7, T1-8, T1-9, T1-10.

### What landed

`packages/data/host-data/src/runtime/ssrm/` — `filter.ts` rewritten (advanced
tree + explicit refusals + path accessors), `UnsupportedQueryError.ts`,
`treeIndex.ts` (the WORKLOG-15 split: `QueryEngine.ts` 834 → 744),
`aggregations.ts`, `quickFilter.ts`, `statusBar.ts`, `QueryEngine.ts`,
`types.ts`, barrels. New `filter.test.ts` (65 cases — the operator matrix),
`engineContract.test.ts` +18. Core: `platform/quickFilterColumns.ts` + test,
`SsrmDataAdapter`, `platform/types.ts`, `portContract.test.ts` (117).
Grid: `createSsrmDatasource.ts` + 6 tests, `createSsrmStatusBar.tsx`,
`bindSsrmTicks.ts`. `npx turbo typecheck build test` green (`TURBO_EXIT=0`,
21 tasks). `npm run bench:ssrm` within noise, two paths faster (cold sorted
block 148.5 → 131.8 ms, grouped 54.5 → 46.3 ms — sort accessors resolve once
per entry instead of per comparison); a quick-filter section was added to the
bench, which had none.

Five decisions the later phases inherit:

1. **Advanced Filter is EVALUATED, not rejected.** The roadmap offered both;
   constraint 1 decides it — CSRM is the reference and SSRM rises to meet it.
   The tree is walkable with the operator matchers already present, and
   rejecting would have blanked the grid for a feature the toggle in
   `gridOptionsSchema.tsx:186` still offers. **Phase 6 must not disable that
   toggle**: `capabilities.supportsAdvancedFilter` stays `false` because the
   PORT cannot scope its own figures by a tree (`getFilterModel()` returns
   only column filters), not because the feature is broken. Its reason string
   and the capability's doc comment were rewritten to say exactly that.
2. **Validation and evaluation are one walk.** `evaluateModel(row | null, …)`
   validates when `row` is `null`, so the two can never drift; the combinators
   are non-short-circuiting so a bad condition beside a satisfied one is still
   reached. `assertFilterModelSupported` runs once per query before any scan —
   the verdict reads the request, never the rows.
3. **Relative-date presets are the one family refused.** `today`, `last7Days`,
   `thisQuarter` and the other 19 are not in `DEFAULT_DATE_FILTER_OPTIONS` (a
   column opts in), and evaluating them means re-deriving the grid's own
   week/quarter boundaries. They previously returned ZERO rows silently. A
   worker-side implementation with a defined week start is the follow-up.
4. **The quick-filter column scope travels with the query.** One plane serves
   grids with different column sets, so `RowStore`'s cached per-row aggregate
   stays one all-fields string and acts as a PREFILTER (a search word never
   spans two columns, so a row the cache rejects cannot match a narrower set);
   only admitted rows pay for a scoped build. That is why the cache builder now
   walks nested leaves — the superset property is what makes the prefilter
   sound.
5. **A custom `aggFunc` closure is dropped from the request, not rejected.**
   It cannot cross `postMessage` at all (`DataCloneError` failed EVERY block,
   not just the aggregated column), so the datasource strips those value
   columns and warns once per column. The user-facing half is Phase 6's:
   `supportsCustomComparator` already carries the copy.

### Not closed here, deliberately

- **`platform.data` still cannot carry an Advanced Filter tree** (decision 1).
  `planFor` merges by column id; a tree needs a different composition, and
  `distinct`'s "is this column filtered" check has no meaning against one.
  Phase 6 owns it — the worker can already evaluate what the port would send.
- **Filter-pill counts send no column scope.** `ssrmFilterCounts` gets its deps
  from a context with no `GridApi` (`SsrmFilterCountsContext.tsx`), and Phase 2
  routes that path through `platform.data.count()` — which has the `ApiHub` and
  the scope with it. Adding a second wire here would be the parallel
  implementation constraint 2 forbids.
- **`filtersToolbarLogic.doesValueMatchFilter` still has no date arm** and
  still treats an empty set filter as no restriction. Phase 2 collapses it onto
  this engine's predicate; Phase 1 only deleted its private third copy of
  `getValueByPath` (identical body) in favour of the repo's one.

---

## Phase 2 — one filter predicate ⬜

**Goal:** delete the three-sources-of-truth problem. One implementation of
"does this row match this filter model", consumed by the worker engine and the
client counter alike.

**Entry:** Phases 0–1.

**Scope**

- Three implementations exist today and disagree: the worker's
  `rowPassesFilter` (`ssrm/filter.ts`), the client's `doesValueMatchFilter`
  (`core/engine/src/filters/filtersToolbarLogic.ts` — differs on empty set
  filters and on `blank` whitespace trimming), and AG Grid's own. Collapse the
  first two onto one module and delete the loser in the same commit.
- **Placement is an entry decision, not an assumption.** The shared predicate
  must satisfy `eslint.config.mjs` boundary zones — `core` must not import
  from framework adapters, and foundation packages may only import each other.
  Verify where a module importable by both `core/engine` and
  `data/host-data` can legally live before writing it; `types/shared-types` is
  the likely home but confirm against the config rather than trusting this
  sentence.
- Route filter-pill counts through `platform.data.count(filterModel)` so both
  adapters answer from one path. This also closes the badge-semantics
  divergence: CSRM's `forEachNode` ignores quick-filter text
  (`useFilterModel.ts:302-312`) while SSRM folds it in
  (`ssrmFilterCounts.ts:35`), so the same badge means two different things
  today. Pick one meaning, document it, apply it to both.

**Exit**

- One filter predicate in the tree; a repo-wide grep finds no second
  implementation.
- Pill badges mean the same thing in both modes, and the contract suite
  asserts it.

**Closes:** T2-10, and the root divergence behind T1-9.

---

## Phase 3 — expression and enrichment unification ⬜

**Goal:** the worker's full-dataset evaluation becomes authoritative for
calculated columns, conditional styling, alerts and editability. Duplicate
client evaluation stops.

**Entry:** Phases 0–2.

**Scope**

- **Aggregate calculated columns** — the worst finding. The client
  `valueGetter` walks `forEachNode` over loaded blocks
  (`calculated-columns/virtualColumn.ts:59`) and wins over the worker's
  correct value, so `SUM([price])` renders a wrong total that revises itself
  as the user scrolls. Route aggregate resolution through
  `platform.data.aggregate()`.
- **Row-local calculated columns** are currently computed twice — client
  `valueGetter` and worker rule — producing the same answer by luck. Keep one.
- **Conditional styling.** The worker computes `__ssrmStyle` from pushed
  `kind:'style'` rules and `ssrmCellStyle` (`ssrm/expressionBindings.ts:16-21`)
  is never wired — the surface binds only `getChildCount` and `getRowClass`
  (`MarketsGridSsrmSurface.tsx:370-371`). Wire it; drop the duplicate client
  pass under SSRM.
- **Editability.** `kind:'editable'` is supported end-to-end in the worker
  (`ssrm/expressionRules.ts:90-102`) but `buildExpressionSnapshot` never
  populates `editableRules` (`useSsrmExpressionBridge.ts:27-54`) and
  `ssrmEditable` has no caller. Complete the circuit.
- **Alerts.** Data-change and relative-change rules see only cached blocks
  (`alerts/runtime/activate.ts:220`); worker-detected alerts reach only a row
  class, never the badge or history. Route through the port. Separately,
  `ROW_ADDED` / `ROW_REMOVED` diff the *cache* contents
  (`activate.ts:205-211`), so scrolling fires phantom alerts — key the diff on
  query identity, not cache membership.
- Resolve the TODO at `useSsrmExpressionBridge.ts:61-62` by deleting it: the
  port is the answer it was waiting for.

**Exit**

- An aggregate calculated column reports the same value at any scroll position,
  asserted by test.
- Scrolling an SSRM grid fires no row-change alerts.
- `ssrmCellStyle` and `ssrmEditable` have callers; a grep for exported-but-unused
  SSRM bindings comes back empty.

**Closes:** T1-3, T1-4, T1-6, T2-6, T2-7.

---

## Phase 4 — editing writes through the port ⬜

**Goal:** an edit either lands or is refused. It is never recorded as
successful without landing.

**Entry:** Phases 0–3.

**Scope**

- All five write funnels — `smart-edit/runtime/applyEdits.ts:51`,
  `plus-minus/runtime/applyPlusMinusNudge.ts:33`,
  `shortcuts/runtime/applyShortcutEdit.ts:30`,
  `bulk-update/runtime/applyBulkUpdateEdits.ts:35`,
  `editing-core/EditJournal.ts:119/131/150` — reach one line:
  `api.applyTransactionAsync` (`editing-core/applyPatches.ts:14`), a
  ClientSideRowModel-only API. Route through `platform.data.mutate()`.
- The CSRM adapter keeps `applyTransactionAsync`. The SSRM adapter uses
  `applyServerSideTransaction`, which `bindSsrmTicks.ts:243` already
  demonstrates working.
- **`EditJournal` must record only what the port confirms.** Today the history
  panel shows edits that never happened; the journal writes before the
  transaction resolves. Make the write conditional on the port's result.
- Range-scoped edits addressing unloaded rows cannot work under SSRM. Do not
  silently partially apply (`collectBulkUpdateTargets.ts:59` currently
  `continue`s past undefined rows) — surface it through `capabilities` for
  Phase 6 and return an explicit partial result the caller can act on.

**Exit**

- An edit applied on an SSRM grid is visible in the grid and in the worker
  cache; an edit that cannot apply is refused with a reason and absent from
  the journal.
- Undo/redo round-trips correctly in both modes.

**Closes:** T2-1.

---

## Phase 5 — the row-change delta path ⬜

**Goal:** `RowChangeSignal` carries real deltas under SSRM instead of
degrading every tick to a full pass over the wrong scope.

**Entry:** Phase 0 (independent of 1–4; may run in parallel if sessions allow).

**Scope**

- `RowChangeBus` sources deltas from `asyncTransactionsFlushed`
  (`RowChangeBus.ts:57`). `applyServerSideTransaction` never emits that event,
  so `sawFlush` is permanently false and `RowChangeBus.ts:132` classifies
  **every** emit as `full` with empty add/update/remove arrays.
- Give the SSRM path a real delta source. `bindSsrmTicks` already knows exactly
  which keys changed (`bindSsrmTicks.ts:243`) — that information is discarded
  today. Feed it to the bus.
- Consequences that close with it: timed and flash activations degrade to a
  `forEachNode` full pass per tick (`timedActivations.ts:255`), and filter-pill
  counts route one worker RPC per pill per emit (`useFilterModel.ts:288`
  deliberately leaves match-sets empty because the delta path is dead).

**Exit**

- Under SSRM ticks, `RowChangeSignal` emits populated update sets.
- Pill counts use the delta path; the per-pill-per-emit RPC storm is gone,
  demonstrated by a counted assertion rather than a claim.
- `npm run bench:ssrm` records the improvement.

**Closes:** T2-9.

---

## Phase 6 — capability-driven UI ⬜

**Goal:** every control that cannot work in the current row model says so.
Zero silent no-ops remain.

**Entry:** Phases 0–5 (needs `capabilities` populated by real adapters).

**Scope**

- Drive disabled state + reason tooltip from `platform.data.capabilities`.
  The reason string is user-facing copy — name what the user can do instead,
  per CLAUDE.md's UI rules and the repo's shadcn-only primitive rule.
- **Excel export** (`visual-excel/exportVisualExcel.ts:24`) serialises only
  loaded rows under SSRM with no indication. Either scope-warn or route
  through the port; `useMarketsGridController.ts:521` currently gates on
  nothing.
- **Bulk-update distinct dropdown** (`resolveColumnDistinctValues.ts:23-33`)
  iterates `getDisplayedRowCount()` — the *server* total — against stub nodes.
  Route to `platform.data.distinct()`; the SSRM adapter already has
  `getSetFilterValues` behind it.
- **Conditional-styling header indicators** — `forEachNodeAfterFilter`
  (`headerPainter.ts:127`) is CSRM-only, a hard no-op. Route through the port
  or disable with reason.
- **Row-exclusion DSL** (`toolbar-date-settings/rowExclusionFilter.ts:96-116`)
  installs an AG Grid external filter, never consulted for server blocks. The
  right fix is forwarding the predicate to the worker's `filterModel` — it is
  the same expression language the worker already evaluates. Disabling is the
  fallback, not the goal.
- **Row-model-specific grid options** (`general-settings/index.ts:197-227`)
  emit unconditionally to both surfaces. The panel already *labels* two of
  them "CSRM only" / "Server-side row model" (`gridOptionsSchema.tsx:97`,
  `:127`) — make the label load-bearing.

**Exit**

- A pass over every customizer panel in SSRM mode finds no control that
  accepts input and does nothing.
- Each disabled control names its reason.

**Closes:** T2-2, T2-3, T2-4, T2-8, T2-11.

---

## Phase 7 — container prop and host surface parity ⬜

**Goal:** `SsrmMarketsGridContainer` accepts the host surface
`MarketsGridContainer` accepts.

**Entry:** none on Phases 0–6 — this is container-layer and may run any time
after Phase 0. Sequenced here because correctness outranks surface area.

**Scope**

- **The rest spread.** CSRM extends `MarketsGridProps` and spreads it onto the
  grid (`MarketsGridContainer.tsx:918`); SSRM hardcodes a 14-name forward list
  (`SsrmMarketsGridContainer.tsx:29-49`, `:514-544`), dropping ~20 props
  including `modules`, `sideBar`, `statusBar`, `rowHeight`, `adminActions`,
  `appData`, `onGridReady`, `headerExtras`. Adopt the same
  `extends Omit<MarketsGridProps, …>` shape. This single change closes several
  items below; do it first and re-measure what remains.
- `StarGrid`'s `advanced` escape hatch (`StarGrid.tsx:121`, `:397`) is
  documented as the typed override seam and is inert for SSRM as a direct
  consequence. Verify it works after the spread lands.
- **`adminActions`** — SSRM's Tools menu is a fixed array
  (`:431-461`); adopt CSRM's `mergeAdminActions` dedupe.
- **`appData`** — CSRM adapts `useAppDataStore()` into an `AppDataLookup`
  (`MarketsGridContainer.tsx:171-182`); SSRM never imports it, so cell-editor
  `valuesSource` bindings resolve to nothing.
- **`onError`** — no prop, though `useSsrmProviderDataWiring` accepts one
  (`:233-240`). Errors collapse into `statusText`, invisible when the status
  strip is off.
- **The grid-event subsystem** — no container event bus, no
  `useMarketsGridEventBridge`, no `gridEventHandlers` / `handlerMeta`, and
  persisted `eventBindings` are discarded at `:168`.
- **Caption persistence** — the toolbar renders `EditableCaption`
  unconditionally (`PrimaryToolbar.tsx:131-134`) but SSRM passes a static
  caption and drops `persistedCaption`, so edits die on remount. OpenFin
  tab-rename adoption is absent for the same reason.
- **Config Browser routing** — CSRM always renders the inline dialog and
  routes to a popout only under `isOpenFin()`; SSRM exposes the action only
  when the host supplies `onOpenConfigBrowser` (`:456-458`) and routes the
  provider editor by callback presence rather than runtime (`:385-392`).
- **`modules` prop** — `MarketsGridSsrmSurface.tsx:45`, `:385` hardcodes
  `[AllEnterpriseModule]`, so a reduced `agGridModules` is silently ignored.

**Exit**

- A prop-by-prop diff of the two containers' accepted surfaces is empty except
  for members that are architecturally mode-specific, and those are named in
  `docs/current-features.md`.

**Closes:** T3-2, T3-3, T3-8, T3-9, T3-10, T3-11, T3-13.

---

## Phase 8 — container lifecycle and historical mode ⬜

**Goal:** an SSRM grid tells the user what it is doing, recovers from provider
failure, and supports the historical-date subsystem.

**Entry:** Phase 7.

**Scope**

- **Loading feedback.** CSRM overlays the grid with provider name and
  streaming row count (`MarketsGridContainer.tsx:939-961`). SSRM imports no
  overlay and feeds its counts to a status strip that defaults to **off**
  (`:115`, `:493-507`); its pre-mount gate is a bare `<p>Connecting…</p>`
  (`:549`). Adopt the CSRM overlay.
- **Provider-failure recovery.** CSRM mounts the grid with a sentinel row-id
  and infra-only admin actions so the user can repair the provider from Custom
  Settings (`:968-991`). SSRM dead-ends at the `Connecting…` branch
  (`:546-550`) — customizer, DATA PROVIDER card and Data Provider Editor all
  unreachable.
- **Reconnect resync.** CSRM re-issues `provider.refresh()` on `ready` after an
  error (`useProviderDataWiring.ts:262-274`). SSRM clears the stale flag
  (`:250-256`) but never purges, so loaded blocks keep pre-disconnect values.
- **Historical mode.** Currently half-wired: mode switching rebinds the
  provider, but the toolbar date picker is uncontrolled and drives nothing
  (`:409`), no `historicalViewMode` banner shows, and editing is not locked
  out. `historicalDateAppDataRef` is absent — `docs/current-features.md:383`
  calls this "deliberately absent… no SSRM counterpart yet", but SSRM's own
  `restart` already forwards `{ asOfDate }` (`:379`), so the subsystem is
  reachable. Close it: AppData write-through, restore-on-mount, banner, edit
  lockout, and the reload-on-commit path CSRM has at
  `MarketsGridContainer.tsx:709-732`.
- Note CSRM's peer-window start arbitration (`useProviderDataWiring.ts:294-322`,
  `waitForProviderRunning`) has no SSRM counterpart. The general case is
  architectural — SSRM's plane attach is per-provider — but the historical
  restart-vs-attach half is not. Verify before deciding.

**Exit**

- An SSRM grid shows load progress in its default hosted configuration.
- A provider that fails to create leaves the customizer reachable.
- Historical mode round-trips: pick a date → data reloads → banner shows →
  edits refused → reload restores the same date.

**Closes:** T3-4, T3-5, T3-6, T3-7.

---

## Phase 9 — column definition fidelity ⬜

**Goal:** a provider's declared columns reach the grid intact.

**Entry:** Phase 7.

**Scope**

- `SsrmMarketsGridContainer.tsx:319-328` re-maps `columnDefinitions` to seven
  fields before `buildColumnDefs`, dropping `cellDataType`, `valueGetter`,
  `valueFormatter`, `cellRenderer`, `filter`, `sortable`, `resizable` and
  `type` — all real members per `shared-types/src/dataProvider.ts:58-82`.
  Consequences: DSL `valueGetter` expressions never compile (the string is
  stripped before `buildColumnDefs:211-229` sees it, so the column renders its
  raw field value), and every column falls to `agTextColumnFilter` because
  `dataTypeFilter(undefined)` defaults there (`buildColumnDefs.ts:173`).
- The container has **two internally inconsistent paths**: its *inferred* defs
  set `cellDataType` (`:301-305`) while its *declared* defs do not (`:319-327`)
  — so declaring columns yields worse typing than not declaring them.
  Collapse to one mapping path serving both.
- CSRM passes the persisted `ColumnDefinition[]` straight through
  (`MarketsGridContainer.tsx:444-450`); that is the reference behaviour.

**Exit**

- A provider declaring `cellDataType: 'number'` gets a number filter as its
  first multi-filter tab in both modes.
- A declared `valueGetter` expression evaluates.
- One mapping path in the tree; the inferred/declared divergence is gone.

**Closes:** T3-1.

---

## Phase 10 — hygiene, guardrails, and the reverse gap ⬜

**Goal:** the remaining small defects close, and the architecture becomes
self-enforcing so this class of drift cannot silently return.

**Entry:** Phases 0–9 (the ESLint rule can only land once modules are migrated).

**Scope**

- **The ESLint rule.** Ban direct `forEachNode`, `forEachNodeAfterFilter`,
  `applyTransactionAsync`, `getDisplayedRowAtIndex` and
  `getDisplayedRowCount` inside
  `packages/core/engine/src/customizer/modules/**`. Add it to
  `eslint.config.mjs` as an `error`-level rule beside the existing boundary
  zones. **This is the phase's most valuable artefact** — it is what makes
  constraint 3 mechanical instead of cultural.
- **Contract suite as a CI gate**, not an optional run.
- **Quick-filter restore** misses `refreshServerSide({ purge: true })` at three
  sites — profile restore (`grid-state/helpers.ts:318-324`), profile reset
  (`grid-state/index.ts:57-62`), and the replay-on-api-ready path
  (`QuickSearch.tsx:96-101`). `QuickSearch.tsx:59-62` already shows the fix.
- **`.alert-row` has no CSS rule** anywhere in `packages/` —
  `ssrm/expressionBindings.ts:28` emits a class nothing styles.
- **Design-system violations in SSRM's own chrome**: a native `<button>`
  (`SsrmMarketsGridContainer.tsx:484-489`) and hardcoded `#333` fallbacks
  (`:481`, `:502`) — direct breaches of CLAUDE.md UI rules 1 and 2.
- **Surface key mismatch**: `MarketsGridHost.tsx:366` keys the SSRM surface
  `ssrm:${provider.id}` while `MarketsGrid.tsx:476` appends the key column.
  The Host key is correct — it is what makes the late-bound rebind at
  `MarketsGridSsrmSurface.tsx:277-338` meaningful; `MarketsGridCore` remounts
  the whole grid when `keyColumn` resolves, defeating that design.
- **Status-bar count formatting** hardcodes `'en-US'`
  (`createSsrmStatusBar.tsx:32-34`) and always renders "filtered of total"
  rather than AG Grid's pagination-aware range (`:150-159`).
- **The CSRM reverse gap.** SSRM fixed an AG Grid init-only-container problem
  that CSRM still has: when `statusBar` disappears from the pipeline, no
  `setGridOption` is emitted (`useGridHost.ts:167` iterates
  `Object.entries`), so the CSRM bar stays visible when toggled off. Port
  SSRM's fix (`MarketsGridSsrmSurface.tsx:51-58`, `:211-228`) to CSRM.
- **Bonus, unrelated to SSRM:** `groupHideColumnsUntilExpanded` is dropped at
  `general-settings/index.ts:214-219` justified as *"AG-Grid 35.1.0 doesn't
  recognise it"*. The repo is on ag-grid-community 36.1.0 and the option is
  declared. The toggle is live in the panel and persists to the profile but
  has been a no-op since the v36 bump. Stale comment, one-line fix.
- **Correct `docs/current-features.md` §366–390**, which currently overstates
  SSRM parity, and close the superseded WORKLOG entries.

**Exit**

- `npm run lint:all` fails on a module that touches the row model directly.
- Full e2e battery green in both modes.
- `docs/current-features.md` describes what the code now does.

**Closes:** T2-5, T3-14, T3-15, the CSRM status-bar reverse gap, and the
`groupHideColumnsUntilExpanded` bonus.

---

## Finding index

All 36 audit findings, mapped to the phase that closes each. Tier 1 = wrong
output; Tier 2 = silent no-op; Tier 3 = container wiring.

| # | Finding | Phase |
|---|---------|-------|
| T1-1 | Advanced Filter returns the entire unfiltered dataset | 1 |
| T1-2 | Nested-path columns broken in filter / sort / set-values | 1 |
| T1-3 | Aggregate calculated columns wrong, revise on scroll | 3 |
| T1-4 | Filter / sort / group on calculated columns match everything | 3 |
| T1-5 | Quick filter searches hidden columns | 1 |
| T1-6 | Row-change alerts fire phantom adds / removes | 3 |
| T1-7 | Unknown `aggFunc` silently becomes `sum` | 1 |
| T1-8 | Custom agg expression cannot cross `postMessage` | 1 |
| T1-9 | Group rows arbitrary order under non-group sort | 1 |
| T1-10 | Unrecognised operators substitute a different operator | 1 |
| T2-1 | Every editing write path inert; journal records anyway | 4 |
| T2-2 | Excel export silently truncated | 6 |
| T2-3 | Conditional-styling header indicators never light | 6 |
| T2-4 | Row-exclusion DSL excludes nothing | 6 |
| T2-5 | Restored quick-filter text never re-queries (3 sites) | 10 |
| T2-6 | Alerts bell undercounts | 3 |
| T2-7 | `ssrmCellStyle` / `ssrmEditable` have no caller | 3 |
| T2-8 | Bulk-update dropdown iterates server count against stubs | 6 |
| T2-9 | Delta hot path dead; every tick a full pass | 5 |
| T2-10 | Filter-pill badges mean different things per mode | 2 |
| T2-11 | Row-model-specific grid options emit unbranched | 6 |
| T3-1 | Provider column definitions downgraded | 9 |
| T3-2 | No rest spread — ~20 props dropped | 7 |
| T3-3 | `StarGrid.advanced` inert under SSRM | 7 |
| T3-4 | No load feedback in default hosted config | 8 |
| T3-5 | Provider failure dead-ends with no recovery | 8 |
| T3-6 | Historical mode half-wired | 8 |
| T3-7 | Reconnect clears banner without resyncing blocks | 8 |
| T3-8 | Caption edits die on remount | 7 |
| T3-9 | Grid-event subsystem absent | 7 |
| T3-10 | `appData` never supplied | 7 |
| T3-11 | Config Browser unreachable outside OpenFin | 7 |
| T3-12 | No `adminActions`, no `onError` | 7 |
| T3-13 | `modules` prop ignored | 7 |
| T3-14 | Surface key mismatch between Host and Core | 10 |
| T3-15 | SSRM chrome violates UI stack rules | 10 |

## Parity regression targets

These 9 are correct today. Each phase that touches one asserts it still holds.

| Capability | Guarded by |
|---|---|
| Set-filter distinct values scan the full filtered set | Phases 1, 6 |
| Simple-filter operator matrix (text 8/8, number 9/9, date 7+) | Phases 1, 2 |
| Grid-state restore retry ladders (cold-mount window) | Phases 7, 8 |
| Tree data + master-detail server-side | Phase 1 |
| Status-bar show/hide owned by the surface | Phase 10 |
| Worker-backed status-bar and filter-pill counts | Phases 2, 5 |
| Quick-filter matching semantics | Phases 1, 2 |
| Server-side grouping / aggregation / pivoting | Phases 1, 3 |
| SSRM column inference from sampled rows | Phase 9 |

## Deviations ledger

Record here when a phase's letter conflicts with a binding constraint and the
honest version was implemented instead. Reference the commit.

- **Phase 1 — Advanced Filter.** The phase text allowed "evaluate the tree or
  reject it explicitly", and its own note pointed at rejecting (the Phase 0
  capability already said `supportsAdvancedFilter: false`). Evaluating is what
  landed, because binding constraint 1 says SSRM rises to meet CSRM and a
  rejection would have disabled a feature the customizer still offers. The
  capability stays `false` with rewritten copy — it describes the PORT's own
  figures, not the grid's rows. See Phase 1 "What landed", decision 1.
- **Phase 1 — two fixes outside the letter.** `computeStatusBar` folded once
  for the whole `valueCols` list into a FIELD-keyed row, so asking for MIN(px)
  and MAX(px) together returned the same number twice; it now folds once per
  distinct aggregation. And `filtersToolbarLogic`'s private `getByPath` (a
  third, byte-identical copy of `getValueByPath`) was deleted in favour of the
  repo's one — the session brief forbade writing a fourth, and leaving a third
  while adding uses of the real one would have been the same defect.
