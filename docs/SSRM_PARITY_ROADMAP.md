# SSRM parity roadmap — execution record

**Branch:** `feature/simplify`. **Status: 8 / 11 phases done (Phases 0–7).**
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
  `getValueByPath` (identical body) in favour of the repo's one. *(Closed by
  Phase 2 — the predicate moved to `core/engine/src/filters/filterPredicate.ts`
  and this file's copy was deleted.)*

---

## Phase 2 — one filter predicate ✅

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

### What landed

`packages/core/engine/src/filters/` — `filterPredicate.ts` (the one
implementation), `UnsupportedQueryError.ts` (moved from the query plane),
`filterPredicate.test.ts` (the 65-case operator matrix, moved from
`host-data`, +28). `filtersToolbarLogic.ts` lost its predicate and kept
everything else. Adapters: `CsrmDataAdapter`, `SsrmDataAdapter`,
`portContract.test.ts` (117 → 139, dates and refusals added, the stale
"date models are deliberately absent" note deleted). Query plane:
`filter.ts` and `UnsupportedQueryError.ts` DELETED, `QueryEngine.ts`,
`statusBar.ts`, `aggregations.ts` and both barrels now import from core.
Grid: `filterPillCounts.ts` + test (new), `useFilterModel.ts`,
`bindSsrmTicks.ts`, `MarketsGrid.tsx`; `ssrmFilterCounts.ts`,
`ssrmFilterCounts.test.ts` and `SsrmFilterCountsContext.tsx` DELETED.

`npx turbo typecheck build test` green (`TURBO_EXIT=0`, 21 tasks, 5884 passing
/ 1 skipped). `node scripts/check-package-cycles.mjs` reports the same single
pre-existing cycle (WORKLOG 18) and no new one — the query plane's
`data → core` edge already existed. ESLint: 0 errors across the touched
directories; the `max-lines-per-function` warnings in `useFilterModel.ts` went
from four (104/96/90/82) to one (82, pre-existing and untouched).

`npm run bench:ssrm` — no regression; the predicate is on the per-row hot path,
so this was measured against a same-session baseline rather than Phase 1's
recorded numbers (that machine was quieter). Stash → rebuild → bench gives HEAD
cold sorted block **154.3 ms**, grouped **52.6**, filtered+sorted **53.1**,
20-block scroll **161**, 2000-row tick **23.0**; Phase 2 over two runs gives
**145.6 / 146.8**, **52.2 / 50.7**, **55.8 / 51.5**, **149 / 149**, **22.9 /
22.9**. Every path is within noise or slightly ahead. The worker bundle also
shrank, 753,082 → 750,730 bytes: the plane's own copy is gone and the predicate
arrives once through the core barrel it already imported.

**Placement.** `core/engine`, not `types/shared-types` as the phase text
guessed. `shared-types` is in `FOUNDATION_GLOBS` (`eslint.config.mjs:20-24`)
and may import only design-system/types, but the predicate needs
`getPathAccessor` from `types/types/src/rowPath.ts` — a real
shared-types → types#types edge, i.e. the member cycle WORKLOG 18 tolerates
only because it is test-only. `ENGINE_GLOBS` restricts framework adapters and
`@openfin/*` only, `packages/data/**` sits in the default zone, `data` already
declares `@wellsfargo-starui/core` as a dependency, and the worker's own
`ssrm/QueryEngine.ts` already imported `ExpressionEngine` from it — so the
edge this needs is one that already exists and already bundles.

Six decisions the later phases inherit:

1. **One name, not two.** `rowPassesFilter` and `doesRowMatchFilterModel` were
   the same function under two names; the public core name won and
   `@wellsfargo-starui/data/ssrm-engine` re-exports it. A re-export is not a
   second implementation; an alias would have been a second name for one
   thing, which is what constraint 2 forbids. `compareValues` moved with the
   predicate rather than staying behind — it shares `asNum`/`asDateMs`, and a
   sort that typed `'20'` differently from the filter that admitted the row
   would put it outside its own range.
2. **The seven divergences, resolved.** Worker reading kept for five: empty set
   filter matches no rows; dates evaluate; Advanced Filter trees walk; unknown
   operators are refused; `''` is blank on a number column. CSRM reading kept
   for one: `blank`/`notBlank` TRIM, because AG Grid's own `isBlank` trims and
   AG Grid is the reference. The seventh — multi-filter joins — was a
   non-difference in practice (AG Grid's multi model carries no `operator`, so
   both ANDed); honouring an explicit `operator` is kept as the superset.
3. **A refusal is decided per call site, never blanket-caught.** The port
   adapters report it as `complete: false` — the channel Phase 0 built to
   separate "found nothing" from "could not look" — and raise it BEFORE the
   walk, so the verdict reads the request and an empty grid refuses what a full
   one does. The two hot paths that must not drop work over-include and warn
   once: `bindSsrmTicks`'s tick fan-out (unchanged, it set the precedent) and
   the pill badges. Under-including would silently hide rows; the query path
   raises the refusal for real, where it reaches the user.
4. **Badge semantics: the CSRM meaning, both models.** A badge counts rows in
   the whole dataset matching that pill's own model — `scope: 'all'`, so
   neither the applied filter nor the quick-filter text narrows it. SSRM folded
   the quick filter in and CSRM did not; constraint 1 makes CSRM the reference,
   and it is also the only reading where two pills' badges are comparable to
   each other. Documented in `docs/current-features.md` §361 and §383.
5. **Counts route through the port, and the CSRM delta path survives — by
   CAPABILITY, not by row model.** `canAddressUnloadedRows` is exactly the
   question "is a set of row ids spanning the dataset meaningful here". Where
   it holds, ONE `platform.data.scan({ scope: 'all' })` builds every pill's
   count and match set together — the same single walk the hook always made,
   so CSRM pays what it paid. Where it does not, one `count` per pill and no
   match sets, because a scan there would page the whole dataset across
   `postMessage` on every recompute. Routing counts through `count()` for both
   would have cost CSRM a full N-pill recompute per streaming tick; that is
   what "must not silently delete the CSRM delta path" was guarding.
6. **The recompute is async now, and stale answers are dropped.** Every port
   method crosses a possible worker boundary, so a badge is microtasks behind
   the render that asked for it. `useFilterCounts` stamps each recompute with a
   generation and discards a late answer to a superseded question — including
   a full recompute that would otherwise land on top of a newer delta.

### Not closed here, deliberately

- **The SSRM pill-count RPC storm is still one call per pill per emit.** With
  no match sets, every `RowChange` falls through to a full recompute. Phase 5
  owns it and its exit criterion already names it; this phase moved the path
  onto the port so Phase 5 has one place to change. `filterPillCounts.ts`'s
  header comment is the hand-off in writing.
- **`platform.data` still cannot carry an Advanced Filter tree** (Phase 1
  decision 1, unchanged). The predicate walks one; `planFor` still merges by
  column id. Phase 6 owns it.
- **`useFilterCounts` reads `capabilities`, which is a capability branch, not a
  row-model branch.** It is in `grid/src/widget/`, outside the
  `customizer/modules/**` scope constraint 3 governs and Phase 10's ESLint rule
  will police. Flagged here so Phase 10 decides deliberately rather than
  discovering it.

---

## Phase 3 — expression and enrichment unification ✅

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

### What landed

Core: `platform/computedFields.ts` (the stamp's key + reader, shared with the
query plane), `platform/index.ts`, `index.ts`, `customizer/index.ts`,
`expression/evalOps.ts` (`evaluateCall`), `expression/evaluator.ts`,
`expression/compileToFunction.ts`, `expression/types.ts`,
`customizer/modules/calculated-columns/virtualColumn.ts` + test. Query plane:
`ssrm/expressionRules.ts` (`AggregateScope`, `usesAggregates`, the stamp),
`ssrm/QueryEngine.ts` (`aggregateScope`), `ssrm/types.ts`,
`expressionRules.test.ts` +14, `engineContract.test.ts` +4. Grid:
`ssrm/expressionBindings.ts` (`withSsrmExpressionBindings`,
`withSsrmDefaultColDef`, `ssrmEditable` fixed) + new test (15),
`widget/MarketsGridSsrmSurface.tsx`, `widget/useSsrmExpressionBridge.ts`,
`customizer/modules/calculated-columns/index.ts` + test,
`customizer/modules/alerts/runtime/activate.ts` + test +4, both barrels.
Apps: the lab's live profile seeds an `AVG([midPrice])` column and
`ssrm-viewport-ticks.spec.ts` asserts scroll invariance on it. Bench: a
`Calculated columns` section, which had none.

`npx turbo typecheck build test` green (`TURBO_EXIT=0`, 21 tasks, 5929 passing
/ 1 skipped, up from 5884). ESLint: 0 errors across the touched directories.
`node scripts/check-package-cycles.mjs`: the same single pre-existing cycle
(WORKLOG 18), no new one. E2E: `ssrm-viewport-ticks` 4/4,
`star-demo-ssrm-smoke` 1 passed + 2 self-skipped (:8081 down).

`npm run bench:ssrm`, same-session baseline → after (this machine):
replaceSnapshot **1805 → 1787 ms**, sorted block cold **142.7 → 141.3**,
filtered+sorted **51.1 → 48.0**, grouped **48.5 → 47.8**, quick filter
**48.9 → 48.2**, 20-block scroll **138 → 137**, 2000-row tick **23.6 → 23.2**,
plane heap 108 MB unchanged. Every path within noise. The new section:
`none configured` **0.0 ms**, `row-local, warm` **1.6**, `aggregate, cold`
**160.5** (the once-per-revision store pass, on top of the sorted-block
rebuild the `cold` harness forces), `aggregate, warm` **1.7** — i.e. an
aggregate column costs the same per block as a row-local one once its
revision is warm.

Six decisions the later phases inherit:

1. **The premise this phase was written on is false, and the fix changed
   shape because of it.** The brief said the worker already had the right
   answer and the client was overwriting it. It did not: `enrich` built its
   context with no `allRows`, so the evaluator's aggregate path
   (`evalOps.buildCallArgs`, gated on `ctx.allRows`) never engaged and
   `SUM([px])` returned *that row's* px. Both sides were wrong — the client
   per block, the plane per row — and on a one-row dataset the plane's answer
   is indistinguishable from a correct one, which is why it survived. So the
   fix is not subtraction: the plane had to be *made* authoritative
   (`AggregateScope`, bound to the store revision) before the client could
   stop competing. `expressionRules.test.ts` pins the old behaviour as a
   named divergence so it cannot come back quietly.
2. **The client stops competing via a STAMP, not a flag.** Enriched rows
   carry `__ssrmCalculated` — the fields the source computed — and the
   `valueGetter` returns those verbatim. A stamped LIST beats "the field is
   present": an expression may legitimately evaluate to `undefined`, a
   calculated column's id may collide with a real field, and rules reach the
   plane on a 25 ms debounce so early blocks carry nothing and must fall
   back. `COMPUTED_FIELDS_KEY` lives in core beside `SsrmDataSource`, for the
   same reason that does — `data` depends on `core`, so the plane imports the
   key rather than core importing the plane's row type. One definition, both
   ends, and no module asks which row model it is running under.
3. **`platform.data.aggregate()` is the WRONG route for this, and the phase
   text's instruction to use it was not followed.** See the deviations ledger:
   the port's fold and the expression language's aggregate functions have
   deliberately different numeric semantics, so substituting one for the other
   would have changed every CLIENT-side grid's `AVG` / `COUNT` / `MIN` / `MAX`
   calculated column. The port is still the route for the client's cross-row
   snapshot — `scan`, whose semantics match exactly — but the fold itself
   stays in the expression engine, on both sides.
4. **Memoising a fold's INPUT is not memoising the fold.** `allRowsColumnCache`
   already existed and was not enough: `SUM` runs `flat().map().reduce()` —
   three passes and two 100k allocations — once per row it is evaluated for.
   Tolerable for the ~40 rows a viewport paints, ruinous for a 100-row block
   (**223 ms**, measured, before `allRowsAggregateCache`; **1.7 ms** after).
   The memo lives in `evalOps.evaluateCall`, the one call path the interpreter
   and the compiled closure share, so it cannot apply to one and not the
   other, and it keys only calls whose arguments are ALL column refs — those
   are row-independent by construction. Both row models supply the cache.
5. **`ssrmEditable` had no caller because binding it would have broken every
   grid.** It answered `false` for any row carrying no verdict — which is
   every row of every grid that has never pushed an `editable` rule. An
   `editable` rule GATES editing, so "no opinion" is now `true` and
   `withSsrmDefaultColDef` ANDs it with the column's own verdict. The split
   between `withSsrmExpressionBindings` (columns) and `withSsrmDefaultColDef`
   (defaults) is not cosmetic: a property declared on a column def shadows
   `defaultColDef` entirely, and `general-settings` writes editability to the
   DEFAULTS — so wrapping every column unconditionally would have replaced
   `defaultColDef.editable: true` with a wrapper whose base is `undefined`,
   i.e. made every such grid read-only. Columns are wrapped only where they
   declare the property; the defaults are wrapped always.
6. **Phantom row-change alerts close on a capability, not a row model.**
   `runFullPass` diffed `snapshotRowIds(api)` against `knownRowIds` — cache
   membership read as dataset membership, so every scroll fired ROW_ADDED /
   ROW_REMOVED. The question "is a set of row ids spanning the dataset
   meaningful here" is exactly `canAddressUnloadedRows`, which is what Phase 2
   decision 5 used for the same question. Where it does not hold the pass
   skips the id walk entirely (a saving, not just a guard). It also stops
   deleting the previous-value baselines of rows that merely scrolled out —
   the brief asked whether re-entry produces a phantom *value* change and the
   answer is no, but the opposite defect was there: the baseline was dropped,
   so a genuine change across the gap re-seeded silently instead of firing.
   Under SSRM `knownRowIds` is now maintained only from real transaction
   deltas, which Phase 5 makes non-empty.

### Not closed here, deliberately

- **T1-4 — filter / sort / group on calculated columns.** It is in this
  phase's `Closes` line but not in its scope text, and it is not reachable
  from here. The plane's memoised order-cache entries hold RAW rows by
  design and every call site enriches the sliced page *after* paging
  (`QueryEngine.ts`, `enrich`'s doc comment) — which is what makes one memo
  entry safe to share across sessions with different rules. Filtering or
  sorting on a calculated field therefore needs an enriched view that is
  per-session AND incremental (a per-query enrich is O(rows × rules) on
  every distinct filter; materialising into `RowStore` is wrong because
  rules are per-session and the store is shared). That is a data-plane
  change of Phase 1's size, and `QueryEngine.ts` is at **777 / 800** after
  this phase. It needs its own session.
- **T2-6 — the alerts bell undercounts.** Not closable without a new
  worker→client channel. `__ssrmAlert` is written by `enrich`, which runs
  only on rows the plane is HANDING OVER — so a worker-detected alert is
  only ever present on a row the client already has, and wiring it to the
  dispatcher would not raise the count by one. A real fix is the plane
  detecting an alert on any row in its store and notifying, i.e. an RPC that
  does not exist; Phase 0's rule is that adding one is later-phase work.
  Phase 5 owns the delta channel this would ride on.
- **The client conditional-styling pass was NOT dropped**, contrary to the
  phase text. It is not a duplicate: it emits `cellClassRules` carrying flash,
  indicators, glyph animation and timed activations, none of which the plane
  has, and its expressions are row-local against the row in hand so it is
  correct under either row model. It is also the only consumer the customizer
  feeds — `buildExpressionSnapshot` pushes conditional-styling PREDICATES as
  `kind: 'style'` rules, and `ExpressionRuleStore` only records a style when
  the expression returns an object or a colour string, so a boolean predicate
  sets `__ssrmStyle` to nothing at all. `ssrmCellStyle` is therefore wired as
  the *host-composed-snapshot* path (a rule returning a style object now
  reaches the cell, merged over the column's own), not as a replacement for
  the module.
- **`editableRules` has no producer**, and none was invented. Editability is
  a boolean everywhere in the customizer (`general-settings.defaultEditable`,
  `column-templates` `editable`, `column-customization`'s resolved override)
  and a boolean needs no plane. The OUTPUT end of the circuit — which is what
  lived in this repo and was missing — is closed. An editability *expression*
  is a product decision, not a parity gap.

### Corrections to this phase's own text, for the record

- The customizer modules are MIRRORED: `core/engine/src/customizer/modules/**`
  holds state and transforms, `react-grid/grid/src/customizer/modules/**` the
  React + AG Grid runtime. Every `forEachNode` this phase names is in the
  react-grid half; `calculated-columns/virtualColumn.ts` is in core. **Phase
  10's ESLint rule, scoped to the core glob alone, would have caught exactly
  one of them** — and after this phase, zero, because that one is fixed. See
  the Phase 10 note below.
- `expressionBindings.ts` is `react-grid/grid/src/ssrm/`, not under
  `host-data`. The TODO is `useSsrmExpressionBridge.ts:60-61`, not `:61-62`.
  The phantom-alert diff is `activate.ts:204-213`.
- **`getAllRowsSnapshot` is NOT public API** and had no consumer outside its
  own module and test — it is absent from both `customizer/index.ts` and the
  engine barrel, which export only `buildVirtualColDef`,
  `invalidateAllRowsCache` and the `AllRowsEntry` type. It is on the barrel
  now, alongside `fillAllRowsSnapshot`, because the fill and the read are two
  halves of one contract.

### Note for Phase 10 — the ESLint rule's scope

Binding constraint 3 and Phase 10's rule both name only
`packages/core/engine/src/customizer/modules/**`. Three things now sit
outside it and each needs a deliberate answer, not a discovery:

1. `packages/react-grid/grid/src/customizer/modules/**` is the other half of
   every module. It still holds direct `forEachNode` calls, and two of them
   should SURVIVE the rule with a reason rather than be migrated:
   `alerts/runtime/activate.ts`'s value-delta scan and
   `conditional-styling/runtime/timedActivations.ts`'s full pass both compare
   against baselines the session has observed, so a row nobody has seen has
   nothing to compare against and paging the dataset to reach it would cost a
   full transfer to learn nothing. Widen the glob AND allow an annotated
   exemption, or the rule will force a change that is strictly worse.
2. `grid/src/widget/` reads `capabilities` in `useFilterCounts` (Phase 2) and
   now in nothing else. That is a capability branch, not a row-model branch,
   and it is correct.
3. `getDisplayedRowCount` / `getDisplayedRowAtIndex` are named by the rule but
   have their port equivalents in `getRowsInRange`; `bindSsrmTicks` and the
   surfaces legitimately call row-model APIs and are not modules.

---

## Phase 4 — editing writes through the port ✅

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

**Exit** *(the worker-cache half was rewritten — see decision 1 below and the
deviations ledger)*

- An edit applied on an SSRM grid is visible in the grid and confirmed by the
  port; an edit that cannot apply is refused with a reason and absent from the
  journal.
- That the shared plane keeps its own copy and will replace the edit on the
  next refresh is carried by `capabilities.mutationsReachSource`, which Phase 6
  renders. It is not silent.
- Undo/redo round-trips correctly in both modes.

**Closes:** T2-1.

### What landed

Core: `customizer/modules/editing-core/` — `applyPatches.ts` (takes a
`GridDataPort`, returns `EditApplyResult`), `buildRowPatches.ts` (new;
`buildRowUpdates.ts` DELETED), `types.ts` (`EditPlatform`, `EditApplyResult`;
`EditGridWriter` DELETED), `EditJournal.ts`, `index.ts`;
`bulk-update/collectBulkUpdateTargets.ts` (`BulkUpdateSelection`);
`platform/computedFields.ts` (`CLIENT_EDITED_FIELDS_KEY`, `markClientEdited`,
`hasClientEdits`), `platform/gridApiRows.ts`, `platform/CsrmDataAdapter.ts`,
`calculated-columns/virtualColumn.ts`; both barrels. Grid:
`customizer/editing/applyAndRecord.ts` (new — the shared write-and-record
spine), `journalUndoRedo.ts`, the four funnels
(`smart-edit/runtime/applyEdits.ts`, `bulk-update/runtime/applyBulkUpdateEdits.ts`,
`shortcuts/runtime/applyShortcutEdit.ts`, `plus-minus/runtime/applyPlusMinusNudge.ts`),
`editing/runtime/activate.ts`, `SmartEditToolbarBody.tsx`,
`BulkUpdateToolbarBody.tsx`, `useBulkUpdateSelection.ts`,
`EditHistoryToolbarBody.tsx`, `DataChangeHistoryPanel.tsx`. Tests:
`applyPatches.test.ts` rewritten, `applyAndRecord.test.ts` new (13),
`portContract.test.ts` +2, `virtualColumn.test.ts` +2, `bulkUpdate.test.ts` +2,
`editingCore.test.ts` +3, and the five funnel/undo-redo suites re-pointed at
the port.

`npx turbo typecheck build test`: 20 / 21 tasks green, **6011 passing / 1
skipped** (types 171, design-system 355, data 703, core 1287, openfin 483,
react 523, grid 2489). The one failure is environmental, not a regression —
see the note below. ESLint: 0 errors across the touched directories (the
`max-lines-per-function` warnings there are pre-existing and unchanged in
count). `node scripts/check-package-cycles.mjs`: the same single pre-existing
cycle (WORKLOG 18), no new one. E2E: **7 / 7 passed**, none self-skipped
(:8081 was up) — including Phase 3's `SSRM aggregate calculated columns ›
reads the same in every row, at every scroll position`, which is the spec a
mistake in this phase's stamp handling would have broken.

`npm run bench:ssrm`, same-session baseline → after (this machine):
replaceSnapshot **1808 → 1828 ms**, sorted block cold **167.0 → 143.0**,
filtered+sorted **56.4 → 50.9**, grouped **53.2 → 53.6**, quick filter
**49.7 → 49.9**, quick filter scoped **69.1 → 63.7**, row-local warm
**1.7 → 1.6**, aggregate cold **163.9 → 169.1**, aggregate warm **1.7 → 2.0**,
20-block scroll **153 → 144**, 2000-row tick **23.2 → 23.2**, plane heap 108 MB
and total heap 879 MB unchanged. Within noise in both directions, which is what
this phase should show: it changes the WRITE path, and the plane has none.

**A verification hazard worth knowing about.** This machine ran at load average
15–51 (other processes) and turbo's parallel vitest produced failures that are
NOT real: `[vitest-pool]: Failed to start forks worker`, and synchronous tests
reporting 188 s / 534 s / 602 s durations before a 5–15 s timeout. Three
different files flaked this way across runs — `QueryEngine.test.ts`,
`ProviderGridHostSection.test.tsx`, `ValueFormatBand.test.tsx` — none touched
by this phase, and each passed standalone in 2–6 s. Check `uptime` and
`pgrep -f "vitest run"` (for a stale run competing with yours) before
attributing a failure to a change.

Six decisions the later phases inherit:

1. **The exit criterion's "and in the worker cache" was rewritten, not
   implemented, and that was the phase's central call.** There is no write RPC:
   `SsrmDataAdapter` stands on `getRows` / `getSetFilterValues` /
   `getStatusBar`, and `applyServerSideTransaction` reaches the grid's block
   cache only. Adding one is permitted by Phase 0's rule but wrong here for a
   reason bigger than cost: **the plane's `RowStore` is per-provider and shared
   by every grid attached to it** — `ExpressionRuleStore` is session-keyed
   precisely because "one `QueryEngine` serves every grid attached to its
   provider". Writing an edit into that store would make one window's
   uncommitted edit appear in every other window's grid, which a CSRM grid does
   not do (its transaction takes a COPY of the row; the hub cache is untouched)
   and which nobody asked for. Constraint 1 says SSRM rises to meet CSRM, not
   past it. A correct write path is a per-SESSION overlay the plane's filter,
   sort, aggregate and quick-filter all consult — the same machinery T1-4 needs
   and was deferred for, with `QueryEngine.ts` at 777 / 800. So the honest
   statement of today's behaviour is the one Phase 0 already wrote into
   `mutationsReachSource`: the edit changes this grid, and the shared service
   replaces it on the next tick or block refetch for that row.
2. **`EditGridWriter` is gone, and with it the invented row.**
   `buildRowUpdatesFromPatches` merged patches onto a row it read from a
   `GridApi` and, when the grid did not hold that row, synthesised
   `{ [rowIdField]: rowId }` for AG-Grid to drop silently. Row assembly is the
   row-model-specific half and belongs to the adapters (`assemblePatchRows`),
   which REPORT what they cannot address. What is left, `buildRowPatches`, is
   pure grouping and touches no grid — so `rowIdField` disappeared from the
   whole write path along with the behaviour it drove.
3. **The funnels take an `EditPlatform`, not a `GridApi`.** `{ gridId, data }`,
   satisfied structurally by both `PlatformHandle` and `GridPlatform`. That
   removed the `journalApplyGridId` OPTION: every caller already passed it, and
   an optional guard against double-recording is a shape where one caller
   forgets. `applyAndRecord` is the one spine all four share — guard, write,
   record `result.applied` — so "the journal records only what landed" is one
   line in one place rather than four copies of a convention.
4. **Confirmation is per CELL, refusal is per ROW.** The port speaks row ids;
   journal entries, preview tables and undo stacks are keyed on cell patches.
   `applyPatches` maps the port's `applied` row ids back onto the caller's
   patches, so a partly-refused write journals exactly the cells that changed —
   and the entry's LABEL is built from those, because "· 3 cells" over an entry
   holding two is the same lie in miniature. Labels are therefore
   `(applied) => string`, not a string.
5. **The timeline moves only when the write does.** `undo` / `redo` /
   `undoEntry` used to pop the stack and then await a transaction that resolved
   before anything was written — so under SSRM, where nothing was ever written,
   the whole stack could be walked without a value changing. They now apply
   first and move the stack as a consequence; `undoEntry` stops at the first
   entry the grid refuses rather than walking past it, because continuing would
   restore an older value over a newer one that is still applied. CSRM is
   unaffected: there, every addressable row applies.
6. **A client edit voids the source's claim over the row it rewrote — for
   row-local columns only.** Phase 3 made enriched rows carry
   `__ssrmCalculated`, and `assemblePatchRows` spreads the existing row, so the
   stamp SURVIVES a patch: edit a source column and the row keeps a computed
   value derived from a number that is no longer on it. The obvious fix —
   strip the stamped fields on mutate — is **actively harmful for aggregates**,
   which is why it was not taken. `SUM([price])` is the same number on every
   row; one edit moves it for all of them equally, so the edited row is not
   specially wrong. Meanwhile the client's cross-row snapshot is deliberately
   EMPTY under SSRM (`refillSnapshot` returns early on
   `canAddressUnloadedRows`), so falling back would fold nothing and paint that
   one row's total as **0** beside neighbours showing the real total. So the
   port MARKS what the edit wrote (`__ssrmClientEdited`, written only onto a
   row that already carries a stamp, so client-side rows stay free of `__ssrm*`
   bookkeeping) and `buildVirtualColDef` — which is where the expression is —
   decides: `astUsesAggregateFunctions` once at build time, row-local
   re-evaluates, column-wide keeps the source's answer. The marker is
   self-clearing: the plane's next enrichment builds a fresh row from its own
   store copy, which never saw the patch.

### Not closed here, deliberately

- **An SSRM edit still does not survive a block refetch or a tick on its row.**
  Decision 1 explains why the fix is a session-scoped overlay in the plane and
  not a write RPC into a shared store. `mutationsReachSource` carries the copy;
  Phase 6 renders it. This is the honest scope of "editing works under SSRM"
  today and the roadmap should not read as more.
- **Nothing surfaces a REJECTION to the user yet.** `EditApplyResult.rejected`
  carries the port's copy to every call site, and bulk update acts on the one
  refusal it can see before the write (an unreachable row in the selection).
  Turning a post-write refusal into a toast or a strip is Phase 6's job — the
  same split Phase 1 made when it left `supportsCustomComparator`'s copy for
  Phase 6 to render.
- **One window where a client-side write settles neither way.** `mutate` now
  awaits AG-Grid's flush callback, and a grid destroyed inside the ~50 ms
  `asyncTransactionWaitMillis` window after the transaction was accepted never
  fires it — so the promise never settles and `journalApplyGuard` keeps that
  grid id marked, which would suppress cell-editor recording on a remount under
  the SAME id. The reachable half of this — a destroyed grid THROWING on the
  call — is closed here and pinned by a shared contract case (both adapters
  refuse rather than reject; the client-side one had no `try` at all, where the
  server-side one already did). The never-fires half needs a settle-on-teardown
  signal the port does not have; `clearJournalApplyGuardRegistry` exists but is
  wired to nothing outside tests.
- **`collectTargetCells` and `resolveColumnDistinctValues` still read the row
  model directly.** Smart edit's selection reader has the same
  `getDisplayedRowAtIndex` shape bulk update's did; it was left alone because
  its range is the cells the user has selected and a stub there yields no
  target either way — but it reports no count, so a smart edit over a range
  spanning unloaded rows is still quietly narrower than the selection.
  `resolveColumnDistinctValues` is named in Phase 6's scope. Both are in the
  react-grid half of the mirror, which Phase 10's ESLint note already flags.

---

## Phase 5 — the row-change delta path ✅

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
### What landed

Core: `platform/types.ts` (`RowNodeDelta`, `RowChangeSink`), `RowChangeBus.ts`
(`transactionApplied`, `trackDelta`, `sawFlush` → `sawDelta`),
`GridPlatform.ts`, `GridDataHub.ts`, `SsrmDataAdapter.ts`, both barrels. Grid:
`ssrm/bindSsrmTicks.ts` (`BindSsrmTicksOptions.rows`, `onTransactionApplied`),
`widget/MarketsGridSsrmSurface.tsx`, `widget/filterPillCounts.ts`
(`PillMembership`, `PillCountPatch`, `emptyPillMembership`, `carryForward`),
`widget/useFilterModel.ts`. Tests: `RowChangeBus.test.ts` +5,
`GridDataHub.test.ts` +2, `bindSsrmTicks.delta.test.ts` new (5),
`MarketsGridSsrmSurface.test.tsx` +1, `alerts/runtime/activate.test.ts` +2,
`filterPillCounts.test.ts` rewritten onto membership (+4),
`useFilterModel.test.ts` +3 (the counted assertions).

`npx turbo typecheck build test`: **TURBO_EXIT=0**, 21 / 21 tasks, **6034
passing / 1 skipped** (types 171, design-system 355, data 703, core 1294,
openfin 483, react 523, grid 2505). ESLint over every touched directory: **0
errors, 17 warnings — the same 17 the Phase 4 baseline produces there**
(checked by running the same command against `c39f305`); no
`max-lines-per-function` warning gained or lost, and `useFilterCounts` stays
under the 80-line ceiling. `node scripts/check-package-cycles.mjs`: the same
single pre-existing cycle (WORKLOG 18), no new one. E2E: **7 / 7 passed**,
none self-skipped (:8081 was up).

**The RPC storm, counted rather than claimed.** `useFilterModel.test.ts` mounts
the real hook on a real `GridPlatform` with two pills, binds a plane that
counts every round trip, and ticks through `platform.rows`. Ten ticks over one
row: **22 round trips → 4**. Three rows ticked once each, then twelve more
ticks across them: **32 → 8**. Both assertions were run against the previous
commit and both fail there, with the delta source already in place — which is
the point of splitting the two commits: a real delta does not on its own fix
the storm.

`npm run bench:ssrm`, same-session baseline (`c39f305`, rebuilt) → after:
replaceSnapshot **1772 → 1780 ms**, sorted block cold **134.0 → 142.5**,
filtered+sorted **45.9 → 44.5**, grouped **64.5 → 47.9**, quick filter
**52.4 → 50.7**, quick filter scoped **70.5 → 65.5**, quick filter matching
nothing **23.0 → 20.5**, row-local warm **1.9 → 1.7**, aggregate cold
**161.6 → 150.8**, aggregate warm **1.8 → 1.7**, 20-block scroll
**126 → 121**, upsert 100/500/2000-row tick **1.2 → 1.4 / 5.1 → 5.5 /
22.8 → 22.6**, plane heap 108 MB and total heap 879 MB unchanged. Noise in
both directions, and that is the honest reading: **`bench:ssrm` instruments
the worker plane, and this phase changes no plane code at all.** Its cost
removal is client-side — a per-tick `forEachNode` over every loaded row in two
modules, and N `getRows` round trips per emit — none of which the bench
executes. The counted assertion above is this phase's recorded improvement;
the bench is its no-regression gate.

Five decisions the later phases inherit:

1. **The seam is a sink on the bus, not a second bus and not a reach-in.**
   `RowChangeSink.transactionApplied(delta)` is implemented by `RowChangeBus`
   and deliberately absent from `RowChangeSignal`, which is what modules
   receive — a module can read the signal and can never forge one. That is
   the containment `GridDataHub.bindSsrm` already used, and the reason is the
   same one Phase 0 wrote down: the binding moves, the platform does not. The
   grid layer touches no bus internals; it passes `platform.rows` as an
   option.
2. **All THREE transaction sites report, not just the tick binding.** The
   roadmap named `bindSsrmTicks` only, and it predates the third site: Phase 4
   added `applyServerSideTransaction` to `SsrmDataAdapter.mutate`. Wiring only
   the tick binding would have left an SSRM EDIT silent to alerts, timed
   activations and the badges, while the same edit under CSRM produces an
   `asyncTransactionsFlushed` all three hear — a new parity gap opened by the
   fix for an old one. `GridPlatform` passes the bus into `GridDataHub`, which
   passes it to the adapter it constructs; the client-side adapter takes none,
   because its `applyTransactionAsync` already fires the event.
3. **An EMPTY report is not a delta.** A refused server-side transaction
   returns a result with no nodes. Believing it would set `sawDelta` and
   downgrade a `modelUpdated` sharing the coalescing window from a structural
   pass to a delta carrying nothing — precisely the both-ways-wrong emit this
   phase exists to remove, reintroduced from the other end.
   `asyncTransactionsFlushed` is still judged the old way and that asymmetry is
   deliberate: it is AG-Grid stating the async queue drained, which only a
   transaction produces, where a report is a caller's claim.
4. **A delta alone does not fix the pill counts, and the missing piece was
   smaller than a match set.** `patchPillCounts` wanted scan-built match sets,
   which a windowed port cannot produce — so with real deltas every emit still
   fell through to a full recompute, and the counted assertion still failed.
   The only thing a patch needs is the changed row's OWN prior membership: the
   badge counts the whole dataset, a changed row is one row of it, so a flip
   moves the total by exactly one no matter what is unknown about the other
   99,999. `PillMembership.evaluated` carries that — `null` after a scan that
   covered the dataset (absence from a set is then a fact), otherwise the rows
   established so far, FILLING from the deltas. First tick on a row: recorded,
   one recompute, because guessing its prior state would drift the badge a row
   at a time. Every later tick on it: free. A partly-resolved delta publishes
   nothing, and a pill the port could not answer keeps no number rather than
   having one invented from zero — the same `next[f.id] ?? 0` the old code
   would have used.
5. **Phase 3's hazard fired as predicted, and the transaction is what makes it
   safe.** `knownRowIds` was maintained under SSRM only from transaction
   deltas, which were always empty, so `runDelta`'s ROW_ADDED / ROW_REMOVED
   path was unreachable under that row model — and it is the same mechanism
   that produced phantom alerts before Phase 3 constrained the id-set diff.
   It is safe here for a reason the diff never had: the id-set diff INFERS an
   arrival from "an id I cannot see any more", which cache churn satisfies,
   while a transaction STATES what it added. Pinned both ways in
   `activate.test.ts` — five update-only ticks fire nothing, a reported
   arrival fires exactly once and its follow-up updates do not fire again.
   `reconcileRowMembership` still returns early where ids do not span the
   dataset, unchanged, and `activateAlerts` needed no new code, so its
   over-ceiling length did not grow.

### Not closed here, deliberately

- **T2-6 — the alerts bell undercounts. Reassigned to this phase, and it does
  not fit; it needs its own session.** Surveyed rather than assumed. The
  channel it would ride cannot be the tick fan-out:
  `SharedWorkerDataServicesHub.fanSsrmFlush` sends a session its *interested*
  rows, or — only where `wantsUnmatchedRows(subId)` holds, i.e. a FILTERED
  session — the full changed set, or nothing at all. An unfiltered session
  therefore never receives a row outside its viewport, and widening that is
  the whole-payload-to-every-session cost the windowed flush exists to avoid.
  So the fix is a NEW worker→client message kind carrying HITS (row key + rule
  id), not rows, evaluated per session in the plane and addressed by
  `sessionId` — `configureExpressions(rules, sessionId)` is already
  session-keyed and one grid's alerts must not ring in another's bell. That
  spans `expressionRules.ts` (a hits-only evaluator beside `enrich`),
  `SsrmPlane` / `SsrmServer`, `SharedWorkerDataServicesHub` (message kind +
  fan-out), `ISsrmDataProvider` + `SsrmProviderClientAdapter` (`onSsrmAlert`),
  and the grid's dispatcher wiring — plus a dedupe against `__ssrmAlert` on
  the rows the client does hold, or every visible hit fires twice. Three
  packages and a new protocol message: Phase 1's size, not a tail end of this
  one. Phase 4's objection to new RPCs genuinely does not transfer (a notify
  channel is a read, not a write into a shared store) — the objection here is
  only scope.
- **Under an ACTIVE SORT the badges still recompute at the refresh throttle.**
  `bindSsrmTicks`'s sorted path patches in place AND schedules
  `refreshServerSide` 50 ms later so rows reshuffle; that refetch's
  `modelUpdated` carries no delta, is correctly classified `full`, and a full
  emit correctly recomputes. So a sorted live blotter pays up to ~20
  recomputes/sec where an unsorted one pays none. This is not the storm — it
  is the structural-change path behaving as designed — but it is the residue,
  and closing it means telling a block refetch apart from a sort, which the
  bus cannot do from `modelUpdated` alone.
- **The membership set is not pruned except by row removal.** Under SSRM it
  grows with the rows a tick actually changed — the interest-gated set — so a
  long session that scrolls a 100,000-row dataset end to end can accumulate
  ids for rows long evicted from the block cache. Bounded and small per entry,
  and pruning on every structural emit would re-pay the first-tick recompute
  during exactly the scrolling that caused the growth. Flagged rather than
  guessed at; measure before adding an eviction policy.
- **`RowChange` still carries no PREVIOUS row data.** It would have made the
  pill patch trivial and would have saved the alerts module its own
  `previousValues` store — and it was not added, because `asyncTransactionsFlushed`
  does not carry one either, so the client-side row model could not honour it
  and the contract would have meant two different things per row model. The
  membership approach needs no such widening.

---

## Phase 6 — capability-driven UI ✅

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
### What landed

Core: `platform/types.ts` (`PlatformEventMap['data:capabilitiesChanged']`),
`GridDataHub.ts` (`CapabilityChangeSink`, announce on bind/unbind),
`GridPlatform.ts`; `customizer/modules/bulk-update/compareDistinctValues.ts`
(new — `resolveColumnDistinctValues.ts` DELETED), both barrels. Grid:
`customizer/hooks/useCapability.ts` (new — `useCapability`,
`useCapabilityGate`), `hooks/index.ts`;
`modules/bulk-update/useColumnDistinctValues.ts` (new),
`BulkUpdateToolbarBody.tsx`; `widget/ExportScopeDialog.tsx` (new),
`useMarketsGridController.ts`, `MarketsGridHost.tsx`;
`modules/conditional-styling/editor/useHeaderPaintGate.ts` (new),
`FlashBand.tsx`, `ConditionalStylingPanel.tsx`;
`modules/toolbar-date-settings/ToolbarDateSettingsPanel.tsx`;
`modules/general-settings/fieldSchema.tsx` (the `capability` container +
`disabled` threading through all five controls), `gridOptionsSchema.tsx`;
`modules/column-customization/editors/RowGroupingEditor.tsx`. Tests:
`useCapability.test.tsx` new (5), `useHeaderPaintGate.test.tsx` new (3),
`ExportScopeDialog.test.tsx` new (4), `GridDataHub.test.ts` +1,
`useMarketsGridController.test.tsx` +2, `BulkUpdateToolbarBody.test.tsx` +1
and one made async, `bulkUpdate.test.ts` re-pointed at the comparator.

`npx turbo typecheck build test`: **TURBO_EXIT=0**, 21 / 21 tasks, **6050
passing / 1 skipped**. ESLint over every touched directory: **0 errors, 107
warnings — the identical 107 the pre-phase tree produces there** (measured by
stashing and re-running the same command). `node scripts/check-package-cycles.mjs`:
the same single pre-existing cycle (WORKLOG 18), no new one. E2E: **7 / 7
passed**, none self-skipped (:8081 was up). `npm run bench:ssrm` was not
re-run: this phase adds no code to any hot path — the capability read happens
once per render of a settings control, and the one walk it removed
(`resolveColumnDistinctValues`) was never on the streaming path.

Six decisions the later phases inherit:

1. **A getter was never enough, and the roadmap had been claiming it was.**
   Phase 0 wrote that `capabilities` is read through a getter "so a control
   disabled while the server-side source is binding re-enables itself when the
   answer changes". Nothing re-renders on a getter. `GridDataHub` now emits
   `data:capabilitiesChanged` on bind / swap / detach — through a narrowed
   `CapabilityChangeSink` (`{ gridId, emit }`), not the whole `EventBus`,
   because a hub that could emit `profile:loaded` is a hub someone will put
   profile logic in. `useCapability` reads it with `useSyncExternalStore`; both
   adapters hold their capability set as a module constant, so the snapshot
   identity settles instead of re-rendering every commit.
2. **`canAddressUnloadedRows` is the question under four of the five
   findings**, and that is not a stretch of it. Header paint, row exclusion,
   the distinct dropdown and the SSRM expand-all toggle all reduce to "is the
   set of rows this grid holds the same set as the dataset". Phase 3's alerts
   module already reads it exactly that way for its row-membership diff, so
   this extends a settled reading rather than inventing one. No new capability
   was added, and no control asks which row model is mounted.
3. **The verdict's copy is the default, not the law.** `useCapabilityGate`
   takes a `reason` override because a verdict names ONE consequence of its
   limit and different controls hit different ones — "scroll the rows into
   view first" helps someone editing a cell and is no help at all to someone
   wondering why a column header never lights. The override is also the only
   copy available in the inverted direction, where the verdict is *supported*
   and carries an empty reason by contract.
4. **Disabling is not the same as removing, and export proves it.** The Excel
   export was NOT disabled under SSRM: exporting the loaded rows is a
   legitimate thing to want, and taking it away would push SSRM below where it
   already was, which constraint 1 forbids in both directions. What was
   missing was the user knowing which of the two files they were getting, so a
   confirm names the scope with the port's own copy. Header paint went the
   other way — a header lit from the loaded window would switch on and off as
   the user scrolled, describing the viewport while looking like it described
   the data, which is worse than staying dark.
5. **The schema declares its requirement; it does not branch.** General
   settings gained a `capability` container beside its existing `conditional`
   one, so a field names a capability and the platform answers. Fields stay
   VISIBLE and disable, with the verdict copy taking over the hint slot —
   hiding them would lose a setting the user had already saved and would make
   the panel's contents depend on which grid it was opened over. `disabled`
   threads through all five control primitives (`Switch`, `IconInput`,
   `Select` all supported it already), so the container is not restricted to
   the one boolean that needed it first.
6. **Phase 1's hand-off closed on the way past.** `supportsCustomComparator`
   had carried copy since Phase 1 with nothing rendering it; the custom
   aggregation expression in `RowGroupingEditor` is now disabled where a
   closure cannot reach the code that folds the rows, and the option in the
   AGG FUNCTION select is disabled alongside it.

### Corrections to this phase's own text, for the record

- **T2-11 is one control, not two, and the roadmap's citation pointed at the
  wrong half.** `general-settings/index.ts:197-227` lists options the panel
  EMITS, but an emitted option is only a silent no-op where a control exists
  to set it. Checked against AG-Grid's own runtime rather than its docs:
  `rowDragManaged` is read as
  `_isClientSideRowModel(gos) ? gos.get("rowDragManaged") : false` — genuinely
  CSRM-gated — but it has **no field in the panel schema at all**; it is
  emitted from a `rowDragging` state key nothing sets. `groupHideColumnsUntilExpanded`
  has a control and is deliberately not emitted (AG-Grid 35.1 does not
  recognise it), which is a different defect with its own note in the source.
  That leaves `ssrmExpandAllAffectsAllRows`, read only by
  `ag-grid-enterprise`'s server-side module and therefore inert over a
  client-side grid — the one toggle whose label was doing no work.
- **T2-4's "right fix" is not reachable, and the roadmap's reason for it does
  not hold.** The phase text says to forward the predicate to the worker's
  `filterModel` because "it is the same expression language the worker already
  evaluates". It is not: `filterModel` is AG-Grid's column-map/tree structure,
  while the DSL is an `ExpressionEngine` expression. The worker does evaluate
  that language — through `configureExpressions`, whose rules ENRICH rows on
  the way out and never narrow a query. Excluding rows so that counts and
  paging agree needs a per-session predicate `QueryEngine` applies before it
  pages: the same machinery T1-4 was deferred for, with `QueryEngine.ts` at
  777 / 800. Compiling the expression down to a `filterModel` would work for
  the subset that maps onto filter operators and be silently wrong outside
  it — a worse defect than the one being fixed. So the fallback is what
  landed, deliberately. Worth noting the repo already knew half of this in a
  different corner: `createRowIdSetFilterResolver`'s doc says a row-id colour
  link arrives as a set-filter model "because SSRM never invokes
  `doesExternalFilterPass`". That fact had been written down and never
  connected to the module that depends on it — the same
  built-at-the-data-layer-and-never-connected shape this whole roadmap exists
  to close.

### Not closed here, deliberately

- **Nothing surfaces a post-write edit REJECTION yet.** Phase 4 left this to
  Phase 6 and it does not fit: `EditApplyResult.rejected` reaches every call
  site, and bulk update already renders the one refusal it can see BEFORE the
  write, but showing a refusal that happens after the fact needs a
  notification surface the grid does not have. `sonner` is packaged in
  `@wellsfargo-starui/react` and **no `<Toaster />` is mounted anywhere in
  `packages/`** — only in the design-system demo app. Mounting one inside
  `MarketsGridHost` means deciding its portal container, its theming and its
  behaviour inside an OpenFin view, which is a chunk of work with its own
  risks rather than a tail end of this one.
- **`supportsAdvancedFilter` is still unrendered**, and deliberately: its own
  doc comment warns that it is NOT a verdict on the feature, only on whether a
  figure computed through the port is scoped by it. A control that merely
  turns Advanced Filter on must not be disabled from it, and the controls that
  should carry the caveat are the port-computed FIGURES — the filter-pill
  badges and the status bar — which want a footnote, not a disabled state.
  Phase 1 decision 1 and Phase 2's note both still apply.
- **The exit criterion's "a pass over every customizer panel" was not run as a
  literal sweep.** What landed is the five findings the audit catalogued plus
  Phase 1's hand-off, each verified against AG-Grid's runtime rather than
  against its documentation. A panel-by-panel sweep under a live SSRM grid is
  the kind of thing Phase 10's hygiene pass is for, and it will find whatever
  the audit missed; this phase closed what the audit found.

---

## Phase 7 — container prop and host surface parity ✅

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

### What landed

Shared container machinery, `widgets-react/src/container/markets-grid-container/`
(the folder `useGridLevelPersistence` / `buildColumnDefs` / `ProviderEditorDialog`
already established as the cross-consumed home): `mergeAdminActions.ts` (moved,
carrying `DATA_PROVIDER_EDITOR_ACTION_ID`), `useAppDataLookup.ts`,
`useContainerCaption.ts`, `useContainerEventWiring.ts` — all four lifted out of
`MarketsGridContainer.tsx`, which lost 102 lines (**997 → 895**) and gained no
behaviour. SSRM side: `useSsrmColumnResolution.ts` (new — keyColumn, declared /
inferred column defs, block size), `SsrmMarketsGridContainer.tsx` rewritten
(**565 → 629**), `MarketsGridSsrmSurface.tsx` (instance `modules` deleted),
`StarGrid.tsx` (caption trio for the SSRM branch). Tests:
`SsrmMarketsGridContainer.forwarding.test.tsx` +19 and 3 rewritten,
`StarGrid.test.tsx` +1, `MarketsGridSsrmSurface.test.tsx` +1,
`MarketsGrid.core-ssrm.test.tsx` +1, mocks widened in the other three SSRM
container suites.

**The measured surface.** `MarketsGridProps` has **55** members. The container
was `Partial<Pick<…>>` over **16** names and its render forwarded **26**
(`:514-545` at 9e5c223, not the 24 at `:513-544` the brief estimated), so **29**
members were dropped. It is now
`Omit<MarketsGridProps, 'ssrm' | 'rowData' | 'rowIdField' | 'columnDefs' |
'gridLevelData' | 'onGridLevelDataLoad' | 'headerExtras' | 'gridId'>` plus
`gridId?: string` — the CSRM container's own omit list, plus `ssrm`, plus
`gridId`'s optionality. The remaining prop-by-prop diff is 8 members and every
one is named in `docs/current-features.md` §388–390: `ssrm` and
`historicalDateAppDataRef` / `defaultLiveProviderId` on the CSRM side;
`providerId`, `inlineCfg`, `expressionSnapshot`, `showProviderEditor`,
`showStatusStrip`, `onProviderReady` on the SSRM side — plus `gridId`'s
optionality and `onRowIdFieldChange`'s narrower return, both explained there.

**Verification.** `npx turbo typecheck build`: **exit 0.** Tests were run
per package, serially, at `--maxWorkers=2` — see the machine note below for why
the plain parallel command could not be trusted here. Every package green:
types **171**, design-system **355**, data **703**, core **1295** (118 files /
1272 in the serialised run plus the 2 files the fork pool dropped, both of
which pass in 2.0 s standalone), openfin **483**, react **523**, grid **324
files / 2538 passing + 1 skipped**. Total **6068 passing / 1 skipped**, against
Phase 6's recorded 6050 / 1. ESLint over
`container/**`, `stargrid/**`, `grid/src/widget/**`, `grid/src/events/**`:
**0 errors, 106 warnings against a pre-phase 109** — a strict SUBSET, verified
by diffing the two rule-and-message sets, not the totals. The three that went
are `react-hooks/exhaustive-deps` warnings in `MarketsGridContainer.tsx` that
the extracted hooks now declare properly; nothing was added.
`node scripts/check-package-cycles.mjs`: the same single pre-existing cycle
(WORKLOG 18), no new one. `npm run bench:ssrm` **was not run and is not a gate
here** — this phase touches no hot path: it changes a container's type
signature, its render's prop list, and deletes one grid-instance option.

**E2E, with :8081 up: 8 / 8 of the meaningful specs pass.**
`star-demo-ssrm-smoke` **3/3** — including the `.ag-grid-viewport` bounding-box
assertion (> 200 px) that is the only guard on decision 1's `style` merge —
`ssrm-viewport-ticks` **4/4**, and `hello-blotter` **1/1**, which is the
StarGrid + SSRM north-star and the spec most exposed to a container
prop-surface change. The four extra CSRM specs this phase's brief added to the
battery — `v2-profile-lifecycle`, `v2-two-grid-isolation`, `v2-row-exclusion`
— **were already red and cannot pass in this repo**, which is worth stating
plainly because the brief asked for them as a no-regression check. They die in
setup on demo-react selectors: `bootCleanDemo` → `waitForV2Grid` waits for
`[data-grid-id="demo-blotter-v2"]` (`e2e/helpers/settingsSheet.ts:33`), and
`v2-two-grid-isolation` waits for `[data-grid-id="dashboard-rates-v2"]`.
**A repo-wide grep finds neither id in any app under `apps/source`** — this is
exactly the ~34-spec breakage `apps/E2E_STATUS.md` documents as attributable to
the app curation, and the failure happens before the spec reaches any code this
phase touched. The 7-spec battery Phases 4–6 actually ran was
`star-demo-ssrm-smoke` + `ssrm-viewport-ticks`; that is still green, and
`hello-blotter` joins it.

Seven decisions the later phases inherit:

1. **The `Omit<>` is CSRM's list plus two, and each of the seven hardcoded
   values was decided separately.** `ssrm` / `rowData` are architecturally
   mode-specific — omitted. `columnDefs` / `rowIdField` are DERIVED from the
   provider, so a host value must win or be refused; both are omitted, which
   is a type error at the call site rather than a silent loss, and it is what
   CSRM already does for the same reason. `caption` became T3-8's fix instead
   of a drop. `dataStaleMessage` stays the container's, exactly as in CSRM
   (whose derived message also overwrites a host value after its spread) —
   `?? host` would have given SSRM a behaviour CSRM lacks. And `style`
   **merges**: `{ ...GRID_FILL_STYLE, ...style }`, host wins per key. That is
   the precedence `MarketsGrid`'s own root style already uses for its `style`
   prop, so it is not a new shape; letting a host `style` REPLACE the fill
   would have re-opened the collapsed-viewport bug that
   `apps/e2e/star-demo-ssrm-smoke.spec.ts:52-54` is the only guard for. A unit
   test pins both halves of the merge, and the spec ran green.
2. **`className` and `style` changed meaning, and that fixes a mismatch rather
   than causing one.** The container applied both to its own wrapper div while
   `MarketsGridProps` defines them as the grid root — and `StarGrid`'s
   `advanced?: Partial<Omit<MarketsGridProps, …>>` had always typed them as the
   latter. They now reach the grid, as in CSRM. No in-repo consumer passes
   either to this container.
3. **Extracting to shared modules beat copying, and the session brief's "copy
   to SSRM, never refactor CSRM" is about behaviour, not about where a line
   lives.** Four pieces — the admin-action merge, the AppData adapter, the
   caption rule, the event wiring — would otherwise have become second
   implementations, which constraint 2 forbids outright, and the caption rule
   in particular (`lastPropCaptionRef`, adopt-only-post-mount, `isOpenFin`
   gate) is exactly the kind of subtlety two hand-written copies drift on. Each
   moved body is byte-identical modulo the `setEventBindings` /
   `setPersistedCaption` setters becoming declared deps instead of being
   captured from an enclosing `useState` — which is what removed three lint
   warnings. CSRM's own suites (`captionPersistence`,
   `marketsGridContainer.admin`, `providerStaleState`, `toolbarHistoricalMode`,
   `gridLevelSaveOnProfile`) are the regression evidence and are unchanged.
   CSRM shrank; per the brief it must not GROW, and it did not.
4. **The bus is created by the caller, not by `useContainerEventWiring`.** Both
   containers emit onto it from callbacks declared long before the stale /
   selection state the hook reads, so a bus created inside the hook would be in
   TDZ for those callbacks' dependency arrays. The hook keeps the bridge, the
   bindings host and the two state-derived emits (`provider:switched`,
   `provider:dataStale`); `provider:status` stays at each call site because the
   two containers subscribe to different streams — under SSRM it rides the raw
   `provider.onStatus` subscription that already drove the stale banner, and
   the selection mode is read through a ref so a mode change never
   re-subscribes it.
5. **`agGridModules` was one finding, not two, and the brief's first half was
   wrong.** `ensureAgGridModules` latches on `_registered`, so the surface's
   no-arg call at `MarketsGridSsrmSurface.tsx:144` does **not** re-register
   over what the shell registered from the prop — it is a no-op there, and the
   fallback for a standalone surface mount. The real defect was the single
   `modules={[AllEnterpriseModule]}` on the `AgGridReact` instance: instance
   modules are ADDITIVE to the global registry, so every SSRM grid got the full
   enterprise bundle whatever `agGridModules` asked for. Deleting it — rather
   than threading `agGridModules` through `MarketsGridHost` to the surface —
   is what the brief's "decide what the right shape is rather than mirroring
   something that isn't there" resolves to: `MarketsGridSurface` has no
   instance list because the global registry is the single source, and the
   deletion makes SSRM identical instead of giving it a second mechanism.
   Pinned from both ends (`'modules' in props === false` at the surface,
   `ensureAgGridModules` called with the host's list at the shell).
6. **Nothing newly forwarded is inert, so no capability gate was added.** Every
   one of the 29 restored members was checked against the SSRM path before the
   spread landed: `sideBar` / `statusBar` / `rowHeight` / `headerHeight` /
   `animateRows` / `defaultColDef` all arrive through the surface's
   `hostOverrides`; `includeAllStreamSafeFilters` and `sizeColumnsToFitOnReady`
   are already SSRM-aware; `historicalViewMode` / `historicalViewMessage` drive
   MarketsGrid's own banner and edit lock, which are row-model agnostic; the
   rest are chrome or identity. A prop that had turned out inert would have
   wanted Phase 6's `useCapabilityGate`, not a silent no-op — that trade was
   available and not needed.
7. **Three deliberate divergences were PRESERVED, not levelled.** The container
   defaults `showFiltersToolbar` / `showFormattingToolbar` / `showEditingToolbar`
   to `true` where MarketsGrid's own defaults are `false` / `false` /
   `undefined`; a bare `<SsrmMarketsGridContainer providerId>` renders all
   three today and constraint 1 forbids lowering SSRM to match CSRM, so they
   stay as explicit post-spread props a host value overrides. `userId` keeps its
   `LOGGED_IN_USER_ID` default because the storage adapter is keyed from it and
   a changed default would re-key every persisted SSRM profile. `gridId` keeps
   its `providerId` fallback. The first two are new findings — the roadmap
   never mentioned default-value divergence, only membership.

### Line anchors for Phase 8 (its cited set is now stale)

Phase 8 cites `SsrmMarketsGridContainer.tsx:115`, `:250-256`, `:493-507`,
`:546-550`, `:549`. Current equivalents:

| Phase 8's citation | Now |
|---|---|
| `:115` — status strip defaults off | `:176` (`showStatusStrip = false`) |
| `:250-256` — clears the stale flag on recovery, never purges | `:338-347` (the raw-status subscription, which now also emits `provider:status`) |
| `:493-507` — the status strip markup | `:575-590` |
| `:546-550` / `:549` — the bare `Connecting…` gate | `:618-621` |
| the render's `<MarketsGrid>` | `:596` (spread at `:597`) |
| the provider-editor strip | `:556` |
| `refreshView` / `reloadFromSource` | `:396` / `:407` |
| `:379` — historical `{ asOfDate }` through restart | `:409-410` |

Phase 9 cites `:319-328` (declared-def re-mapping) and `:301-305` (the
inferred path setting `cellDataType`). **Both moved out of the container** into
`useSsrmColumnResolution.ts`: the declared mapping is `:91-105` (`asColDefs` at
`:95`), the inferred one `:63-89` (`cellDataType` at `:76`), `keyColumn` `:40`,
`cacheBlockSize` `:107`. The two internally-inconsistent paths Phase 9 has to
collapse are now adjacent in one 115-line file, which is most of why the split
was taken here.

### Phase 6's carried-over wrinkle, decided

The conditional-styling INDICATOR target fell back to `'cells+headers'` when a
rule had never named one, so on a server-side grid a freshly created rule
opened pointed at BOTH — which Phase 6's `useHeaderPaintGate` correctly
disables. Fixed rather than recorded a third time, and fixed at the resolution
of the ABSENT value only: where the gate is closed the fallback is `'cells'`,
the one half of BOTH that can do anything there. A rule that NAMES a target is
untouched, no persisted shape changes, and CSRM is byte-identical (its gate is
open, so the fallback stays BOTH). The runtime had already been resolving the
same absence the same way — `transforms.ts:444` paints the cell half and the
header pass is gated off — so this closes a UI-vs-runtime disagreement, not a
paint bug. `FlashBand`'s equivalent default was already `'cells'` / `'row'` and
needed nothing. Pinned by `ConditionalStylingPanel.test.tsx`.

### Not closed here, deliberately

- **`toolbar:dateChanged` is the one catalog event an SSRM grid still never
  emits.** CSRM emits it from `handleToolbarDateChange`, which is the entry
  point to its historical-date subsystem. The SSRM container forwards
  `toolbarDate` / `onToolbarDateChange` / `toolbarDateHistoryEnabled` to the
  grid — a host can drive the picker — but it has no handler of its own to emit
  from, and inventing one would prejudge Phase 8's design. Phase 8 owns it and
  should add the emit in the same change as the handler.
- **`headerExtras` is absent from BOTH containers, and the phase text is wrong
  to list it as a dropped prop.** CSRM omits it too, so forwarding it under
  SSRM would have opened a divergence in the opposite direction. Named as
  mode-neutral-and-absent in `docs/current-features.md`; adding it is a product
  decision for both containers at once, not a parity fix.
- **A host `appData` is still silently overridden** by the container's own
  lookup, in both containers — CSRM has always done this (its `appData=` sits
  after the spread) and mirroring keeps the diff empty. `appData ?? lookup`
  would have given SSRM a behaviour CSRM lacks, which is the Phase 4 decision-1
  shape. Worth a deliberate answer for both at once; not this phase's call.
- **The three-toolbar default divergence** (decision 7) is recorded rather than
  resolved. Resolving it means either changing what a bare SSRM container
  renders or changing MarketsGrid's own defaults for every consumer; both are
  product calls.

### Corrections to this phase's own text, for the record

- **The numbers were wrong in both directions, and so was one of the line
  ranges.** 55 members (not "~20 dropped"), a 16-name `Pick` (not 14), **26**
  forwarded props at `:514-545` (not 24 at `:513-544`), so **29** dropped.
- **T3-13's `modules` bullet is two props but only ONE defect**, and the
  brief's account of the second site is wrong — see decision 5.
  `MarketsGridSsrmSurface.tsx:144`'s no-arg `ensureAgGridModules()` cannot
  "re-register the default set over whatever `MarketsGrid.tsx:101` already
  registered", because the function returns early on its own `_registered`
  latch. Read the shipped implementation, not the call site.
- **T3-8 and half of T3-9 were unused return values, exactly as the brief
  said** — `useGridLevelPersistence` already loaded and saved both `caption`
  and `eventBindings` for SSRM grids; the container destructured three of the
  hook's eight members. The roadmap's "persisted `eventBindings` are discarded
  at `:168`" is the one accurate clause of that bullet; the other three
  overstate it.
- **`onError` was smaller than it reads, and had one hazard the brief did not
  mention.** `useSsrmProviderDataWiring` already accepted and wired it, so only
  the prop and the pass-through were missing — but `onError` is in that hook's
  effect dependency list beside `onStatus`, so passing a host callback straight
  through would restart the provider on every render. It is held in a ref and
  exposed as a stable callback, with a test pinning the identity, mirroring what
  `onStatus` already needed.
- **`MarketsGridSsrmProps` IS on the public barrel** (`grid/src/index.ts:37`).
  `docs/current-features.md:368` claimed the opposite; corrected in passing,
  doc-only.

### A verification note, and why the numbers above are per-package

This machine ran at load average **9 → 61** throughout (external `ds-bin` at
~170% CPU plus Chrome renderers), and `npx turbo typecheck build test` produced
the documented false failures on **three** separate attempts, each time in a
different package this phase does not touch, each time with the signature
Phase 4 recorded — `[vitest-pool]: Failed to start forks worker`, plus timeouts
in suites whose whole-run duration had inflated 10× or more:

| Attempt | Reported failure | Why it is not real |
|---|---|---|
| parallel | `CellRendererBand.test.tsx` timed out at 15 s | grid suite took 3277 s, **2195 s of it in `setup`**; `FormatColorPicker.test.tsx` never got a worker |
| parallel | `IconPicker.test.tsx` ×2 timed out at 15 s | react-core took 857 s against a normal ~60 s; **standalone it is 76 files / 523 tests, all passing**, and react-core cannot import react-grid |
| `--concurrency=2` | `perfGuard.test.ts` — *"cache-hit evaluation is materially faster than cache-miss"* — timed out at 10 s | a **timing** assertion on a loaded box; 9 core files never got a worker, which is exactly why that run collected 111 files instead of 120 |

The serialised per-package run above is the honest figure. Its one non-zero
exit is core's, and it reconciles exactly: 118 files ran and all passed, 2
never started (`security/expressionPolicy.test.ts`,
`colDef/adapters/valueFormatterFromTemplate.date.test.ts`), and those two plus
`perfGuard.test.ts` pass together in **2.05 s** when run alone. Nothing this
phase touches is in any of it. Anyone re-verifying on a quiet box should get
`TURBO_EXIT=0` from the plain command; **check `uptime` and
`pgrep -f "vitest run"` before believing a failure here.**

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
| T1-4 | Filter / sort / group on calculated columns match everything | ~~3~~ → **open**, see Phase 3 "Not closed here" |
| T1-5 | Quick filter searches hidden columns | 1 |
| T1-6 | Row-change alerts fire phantom adds / removes | 3 |
| T1-7 | Unknown `aggFunc` silently becomes `sum` | 1 |
| T1-8 | Custom agg expression cannot cross `postMessage` | 1 |
| T1-9 | Group rows arbitrary order under non-group sort | 1 |
| T1-10 | Unrecognised operators substitute a different operator | 1 |
| T2-1 | Every editing write path inert; journal records anyway | 4 |
| T2-2 | Excel export silently truncated | 6 ✅ |
| T2-3 | Conditional-styling header indicators never light | 6 ✅ |
| T2-4 | Row-exclusion DSL excludes nothing | 6 ✅ |
| T2-5 | Restored quick-filter text never re-queries (3 sites) | 10 |
| T2-6 | Alerts bell undercounts | ~~3~~ → ~~5~~ → **open**, scoped in Phase 5 "Not closed here" |
| T2-7 | `ssrmCellStyle` / `ssrmEditable` have no caller | 3 |
| T2-8 | Bulk-update dropdown iterates server count against stubs | 6 ✅ |
| T2-9 | Delta hot path dead; every tick a full pass | 5 ✅ |
| T2-10 | Filter-pill badges mean different things per mode | 2 |
| T2-11 | Row-model-specific grid options emit unbranched | 6 ✅ |
| T3-1 | Provider column definitions downgraded | 9 |
| T3-2 | No rest spread — 29 props dropped | 7 ✅ |
| T3-3 | `StarGrid.advanced` inert under SSRM | 7 ✅ |
| T3-4 | No load feedback in default hosted config | 8 |
| T3-5 | Provider failure dead-ends with no recovery | 8 |
| T3-6 | Historical mode half-wired | 8 |
| T3-7 | Reconnect clears banner without resyncing blocks | 8 |
| T3-8 | Caption edits die on remount | 7 ✅ |
| T3-9 | Grid-event subsystem absent | 7 ✅ |
| T3-10 | `appData` never supplied | 7 ✅ |
| T3-11 | Config Browser unreachable outside OpenFin | 7 ✅ |
| T3-12 | No `adminActions`, no `onError` | 7 ✅ |
| T3-13 | `modules` prop ignored | 7 ✅ |
| T3-14 | Surface key mismatch between Host and Core | 10 |
| T3-15 | SSRM chrome violates UI stack rules | 10 |

## Parity regression targets

These 9 are correct today. Each phase that touches one asserts it still holds.

| Capability | Guarded by |
|---|---|
| Set-filter distinct values scan the full filtered set | Phases 1, 6 |
| Simple-filter operator matrix (text 8/8, number 9/9, date 7+) | Phases 1, 2 |
| Grid-state restore retry ladders (cold-mount window) | Phases 7, 8 — held: `grid-state` untouched; the SSRM surface still mounts once per provider and the container still mounts the grid pre-ready |
| Tree data + master-detail server-side | Phase 1 |
| Status-bar show/hide owned by the surface | Phase 10 |
| Worker-backed status-bar and filter-pill counts | Phases 2, 5 — held: badge meaning unchanged (`filterPillCounts.test.ts` parity case green), the delta only removes round trips |
| Quick-filter matching semantics | Phases 1, 2 |
| Server-side grouping / aggregation / pivoting | Phases 1, 3 — held: `engineContract.test.ts` grouped/agg cases green, `grouped by book, cold` 48.5 → 47.8 ms |
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
- **Phase 3 — aggregate resolution does NOT go through `platform.data.aggregate()`.**
  The phase text says "route aggregate resolution through
  `platform.data.aggregate()`". It was not, because the port's fold and the
  expression language's aggregate functions answer differently ON PURPOSE, and
  the port's version is not the one a calculated column has ever used:
  `foldColumn` counts every row and returns `null` for an empty fold, while
  `functions.ts` coerces non-numerics to 0 (`COUNT` counts non-null values,
  `AVG` divides by ALL rows, `MIN`/`MAX` let a non-numeric 0 win, an empty
  fold is 0). On any column containing a null — routine in markets data — the
  two disagree. Substituting the port's fold would therefore have silently
  changed every CLIENT-side grid's `AVG` / `COUNT` / `MIN` / `MAX` calculated
  column, which is binding constraint 1 in the direction it explicitly
  forbids. The port is still the route for the cross-row SNAPSHOT — `scan`,
  whose row set and order match `forEachNode` exactly — and the fold stays in
  the expression engine on both sides, which is also what makes the two row
  models agree. Neither `DataAggFunc` nor `foldColumn` was touched. And the
  port could not have served the whole surface anyway: `MEDIAN`, `STDEV`,
  `VARIANCE` and `DISTINCT_COUNT` have no fold there, and Phase 0's rule is
  that a sixth key must be traceable to a phase rather than added on demand.
  See Phase 3 "What landed", decisions 3 and 4.
- **Phase 3 — the conditional-styling client pass was kept.** The phase text
  says "drop the duplicate client pass under SSRM". Dropping it would have
  lost flash, indicators, glyph animation and timed activations, which the
  plane has no equivalent for — constraint 1. It is also not a duplicate:
  `buildExpressionSnapshot` pushes styling PREDICATES into a rule kind that
  records a style only for an object or colour-string return, so
  `__ssrmStyle` was never populated from the customizer at all. `ssrmCellStyle`
  is wired as the host-composed-snapshot path instead. See Phase 3 "Not
  closed here".
- **Phase 4 — the exit criterion's "and in the worker cache" was rewritten.**
  The phase text required an SSRM edit to be visible in the grid AND in the
  worker cache, which needs a write RPC that does not exist. It was not added,
  and not only for cost: the plane's `RowStore` is per-provider and shared by
  every grid attached to it, so an edit written there would appear in every
  other window's grid — a behaviour a CSRM grid does not have (its transaction
  takes a copy of the row; the hub cache is untouched), i.e. constraint 1 in
  the direction it does not license. The correct version is a per-SESSION edit
  overlay that the plane's filter, sort, aggregate and quick-filter all
  consult, which is the same per-session incremental view T1-4 needs and was
  deferred for, against a `QueryEngine.ts` already at 777 / 800. What landed
  instead is the honest statement Phase 0 had already written:
  `mutationsReachSource: false`, with copy saying the shared service replaces
  the edit on the next refresh — rendered by Phase 6, never silent. See Phase 4
  "What landed", decision 1.
- **Phase 4 — the stamped fields were NOT stripped on mutate.** The session
  brief offered "strip the stamped fields on mutate, or route the edit so the
  plane re-enriches". Routing is decision 1's write RPC, and stripping is worse
  than the defect for column-wide folds: the client's cross-row snapshot is
  empty under SSRM by design, so a stripped `SUM([price])` re-evaluates to 0 on
  the edited row alone while every neighbour shows the real total — a new
  confidently-wrong output in place of a value that is one edit stale on every
  row equally. What landed marks the edited fields and lets
  `buildVirtualColDef` judge per column, because that is where the expression
  is. See Phase 4 "What landed", decision 6.
- **Phase 7 — `headerExtras` was NOT restored, and the `modules` fix is a
  deletion rather than a forward.** The phase text lists `headerExtras` among
  the ~20 dropped props to restore. `MarketsGridContainerProps` omits it too,
  so forwarding it under SSRM would have created a divergence in the opposite
  direction from the one being closed — the goal is an EMPTY diff, not a larger
  SSRM surface. Recorded as mode-neutral-and-absent in
  `docs/current-features.md` instead; adding it is a product decision for both
  containers at once. Separately, the text's `modules` bullet asks to stop
  `MarketsGridSsrmSurface` hardcoding `[AllEnterpriseModule]` "in TWO places".
  One of the two is not a defect (`ensureAgGridModules()` latches, so the
  no-arg call cannot re-register over the prop) and the fix for the other is to
  DELETE the grid-instance `modules` option, not to thread `agGridModules` down
  to it: `MarketsGridSurface` has no instance list because the global registry
  is the single source, and giving SSRM a second mechanism is what constraint 2
  forbids. See Phase 7 "What landed", decision 5 and the corrections list.
- **Phase 1 — two fixes outside the letter.** `computeStatusBar` folded once
  for the whole `valueCols` list into a FIELD-keyed row, so asking for MIN(px)
  and MAX(px) together returned the same number twice; it now folds once per
  distinct aggregation. And `filtersToolbarLogic`'s private `getByPath` (a
  third, byte-identical copy of `getValueByPath`) was deleted in favour of the
  repo's one — the session brief forbade writing a fourth, and leaving a third
  while adding uses of the real one would have been the same defect.
