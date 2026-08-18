# SSRM parity completion — the four findings the roadmap left open

**Branch:** `feature/simplify`. **Status: 4 / 4 phases done — COMPLETE** (Phases 11 ✅, 12 ✅, 13 ✅, 14 ✅).

[`SSRM_PARITY_ROADMAP.md`](./SSRM_PARITY_ROADMAP.md) closed 32 of 36 audit
findings across 11 phases and recorded four as needing their own sessions. This
document is those four, sequenced. Phases continue that roadmap's numbering
(it ran Phase 0 → Phase 10) and are written to be picked up cold, one per
session.

**The roadmap's [binding constraints](./SSRM_PARITY_ROADMAP.md#binding-constraints-they-override-phase-text)
govern every phase here and are not restated.** The two that bite hardest in
this stretch:

- **No module may branch on the row model.** Everything below goes through
  `platform.data` or the worker plane, never an `if (ssrm)` in
  `customizer/modules/**` — `no-restricted-properties` over both halves of
  that tree makes `lint:all` fail if one is added (Phase 10).
- **800 LOC / file, 80 LOC / function.** Phase 12 opens by paying a debt
  against this, described there.

## What changed since the roadmap was written

Two commits moved the ground under these findings and are the reason the
sequencing below differs from the roadmap's own note:

- **`293e2d2` built `SessionOverlay`** — the per-session query layer three of
  the four findings were all waiting on
  (`packages/data/host-data/src/runtime/ssrm/SessionOverlay.ts`, 15 cases in
  `SessionOverlay.test.ts`). `QueryEngine` already exposes
  `setSessionPatches` (`:269`), `clearSessionPatches` (`:277`) and
  `setSessionExclude` (`:288`). **No client can call any of them** — that gap
  is Phase 12 and it is now plumbing, not design.
- **`76489fe` built the edit write-back path** — `EditWriteBack.onFailure`
  reports `{ error, rolledBack, stuck }` on a refused write. **Nothing
  listens**, so a refused edit reverts silently. That is why the smallest
  phase is scheduled first rather than last.

---

## Phase 11 — a refused write is visible, and two panels stop lying ✅

**Goal:** every failure this platform already detects reaches the user.

**Entry:** none. Runnable immediately, and independent of Phases 12–14.

**Why first, despite being the smallest.** `76489fe` shipped a revert path
whose whole purpose is telling someone. Until a surface exists, a rejected
edit silently reverts, which is a worse user experience than the silent no-op
the parity effort set out to remove.

**Scope**

- **Mount a toast surface.** `sonner` is a declared dependency
  (`packages/react-core/package.json:101`) and `SonnerToaster` is exported
  (`packages/react-core/ui/src/index.ts:83`), but **nothing under `packages/`
  mounts it** — the only `<Toaster />` in the tree is
  `apps/source/design-system/src/App.tsx:148` and its showcase. Decide the
  mount point (the grid shell vs. the containers), and mind that an OpenFin
  view is its own window: a toast portalled to `document.body` is correct
  here, but confirm it against the view's stacking rather than assuming.
- **Wire `EditWriteBack.onFailure` to it.** Two distinct messages, because
  they are two distinct situations: `rolledBack` non-empty means "your edit
  was rejected and has been undone"; `stuck` non-empty means "your edit was
  rejected and the grid could not undo it" — the second is the one that
  matters, and under SSRM it is reachable whenever the row's block has been
  evicted. Do not collapse them into one string.
- **CSRM drops the host's `onSavingChange`.** `MarketsGridContainer.tsx:748`
  passes `onSavingChange={setIsSavingProfile}`, overwriting whatever the host
  supplied. The SSRM container already does this correctly — it chains, via
  `hostOnSavingChange` / `handleSavingChange`
  (`SsrmMarketsGridContainer.tsx:490-493`). Adopt that pattern; do not invent
  a second one.
- **The SSRM row-count panels never consult pagination.**
  `createSsrmStatusBar.tsx` contains no reference to pagination at all, and
  its three worker-backed replacements
  (`NATIVE_COUNT_TO_SSRM`, `:188-192`) always render whole-dataset counts
  (`:153-172`). Establish what the native components they replace render when
  `pagination` is on **before** changing anything — the fix is only a fix if
  it matches what CSRM shows.

**Exit**

- A rejected edit raises a toast naming what happened, distinguishing reverted
  from stuck.
- A host passing `onSavingChange` to `MarketsGridContainer` receives it.
- The row-count panels agree between row models with pagination on and off,
  with a test pinning both.

**Closes:** post-write edit rejection surface; two bugs found during Phases
7–10 and recorded rather than fixed.

### Record (2026-08-17)

**Survey answers, none of them assumed.**

1. **Which toast system — sonner.** Both are exported and both are already
   used: `SonnerToaster` (`ui/src/index.ts:83`) has **zero** consumers, and
   shadcn's `Toaster` + `toast` is what `apps/source/design-system/src/App.tsx:148`
   mounts. Sonner wins on one disqualifying fact rather than taste:
   `use-toast.tsx` sets `TOAST_LIMIT = 1`, so its reducer's `ADD_TOAST` slices
   the queue to one and the stuck message would **evict** the reverted one —
   the exact collapse this phase forbids, arrived at by a different route.
   (Its `TOAST_REMOVE_DELAY = 1000000` is a second problem: ~17 minutes.) No
   third pattern was introduced: sonner's `toast` is re-exported from the same
   barrel as its toaster, as `sonnerToast`, because `use-toast` already owns
   the plain name. The duplication is untouched, not deepened.
2. **Mount point — the grid shell, `MarketsGrid` *and* `MarketsGridCore`,**
   both of which already call `useEditWriteBack`. Not the containers (two
   containers, two decisions) and not the app (leaving it to the app is what
   produced a revert path with nothing on the other end). **Two toasters were
   checked for, before and after**: sonner keeps its queue in module state and
   every mounted toaster renders all of it, so `GridToastSurface` orders its
   instances and only `live[0]` renders — pinned by a three-grid case and an
   owner-unmount handover case. On the portal: an OpenFin view is created with
   `platform.createView({ url })` (`openfin-platform/src/launch.ts:117,350`) —
   its own webcontents, its own document. One toaster per document is therefore
   one per view, which is the wanted behaviour and confirmed rather than
   assumed.
3. **What the natives render with pagination on — whole-dataset counts, and
   the finding as written is NOT A DEFECT.** In ag-grid-enterprise 36.1.0 the
   word "pagination" does not appear anywhere in the statusBar module:
   `_getTotalRowCount` walks `rowModel.forEachNode` and `_getFilteredRowCount`
   walks `forEachNodeAfterFilter`, both whole-model traversals;
   `forEachDisplayedNode`/`rowsToDisplay` — the paginated view — is never
   consulted. Verified by mounting a real CSRM grid at
   `pagination: true, paginationPageSize: 10` over 25 rows and reading the DOM:
   "Rows : 25", "Total Rows : 25". **Making the SSRM panels page-aware would
   have been the divergence.** The exit criterion is met by a test that pins
   agreement both ways rather than by a change.
   Establishing that surfaced **two divergences that are real**, and those are
   fixed: the filtered panel's label is AG Grid's own default **"Filtered"**,
   not "Filtered Rows"; and `FilteredRowsComp` calls
   `setDisplayed(total !== filtered)`, i.e. AG Grid **hides** that panel while
   nothing is narrowing — so an unfiltered SSRM grid was showing
   "Filtered Rows: 20,000" beside "Total Rows: 20,000", asserting a filter that
   was not there. The panels also now reproduce the native template's
   surrounding whitespace (` Rows : 25 `), because
   `MarketsGridSsrmSurface:192-194` merges them into one strip **with** native
   panels — the same reason `formatCommas` defers to the runtime locale.
4. **Is the `onSavingChange` drop reachable — no, and the record says so.**
   Nothing in `packages/` or `apps/` passes `onSavingChange` to
   `MarketsGridContainer`; the only host-side passer in the tree is a test, and
   it targets the SSRM container. The bug is real (the prop is public,
   `MarketsGridContainerProps extends Omit<MarketsGridProps, …>`, and the
   explicit prop after the spread silently overwrote it) but was latent. Fixed
   by adopting `SsrmMarketsGridContainer`'s existing chain, not a second
   pattern, and pinned by a test **verified to fail against the old line**.

**Deliberate decisions worth contesting later.**

- **The toast fires for every failure, whether or not the app supplied
  `onFailure`,** and the app's handler still runs (`try/finally`, so a throwing
  surface cannot take the consumer's telemetry with it). The alternative —
  toast only when the app supplied nothing — would make "does the user find
  out" depend on whether the app wanted telemetry. `EditWriteBack.onFailure`'s
  doc comment in core said "the grid has no opinion about how to surface this",
  which is now false; it was corrected in the same change.
- **The stuck toast never expires** (`duration: Infinity`, with `closeButton`
  on the toaster so it can be dismissed). It means the grid is showing a value
  the server refused and could not take back; letting that scroll away on an
  8-second timer would be a quieter version of the bug being fixed.

**Verification.** `npx turbo typecheck build` exit 0. Package tests serially at
`--maxWorkers=2`, all measured before the change as well as after — **no
environmental failures occurred this session, so none are being written off as
such**:

| Package | Before | After |
|---|---|---|
| `core` | 1316 / 122 files | 1316 |
| `react-grid` | 2602 + 1 skipped / 329 files | **2631** + 1 skipped / 334 files |
| `data` | 718 | 718 |
| `react-core` | 523 | 523 |
| `design-system` | 355 | 355 |
| `openfin` | 483 | 483 |
| `types` | 171 | 171 |

The +29 in `react-grid` is exactly the five new files (11 + 6 + 6 + 4 + 2);
nothing else moved. ESLint compared per file against `HEAD` via
`git show HEAD:<path> | npx eslint --stdin --stdin-filename <path>`: every
touched file 0 → 0, every new file 0. `check-package-cycles` and `check:rtl`
pass. The diff was grepped for `#[0-9a-f]{3,8}` — no new hex, in CSS or
anywhere else.

**Not done, and why.**

- **No e2e spec.** `grep -rn editWriteBack apps/` returns nothing: no demo app
  registers a write-back, so there is no browser path that can produce a
  refused write to drive. Adding one means building a demo write service that
  refuses — real work, and not this phase's. Recorded rather than skipped
  silently.
- **`MarketsGridContainer.tsx` is 825 lines, over the 800 ceiling.** It was
  **already 815 at `df48fdf`**, and is one of 28 files in `packages/` currently
  over. This phase added 10 lines to it and trimmed them back to 8; it did not
  open a container split, which would be a refactor of the file this phase is
  fixing a bug in. Phase 12 already opens by paying the same debt down on
  `QueryEngine.ts` — the container belongs in that queue, not in this one.

---

## Phase 12 — the session query layer reaches the client ✅

**Goal:** a window can tell the plane about state that is private to it, so
the query answers for *that* window.

**Entry:** none in code — `SessionOverlay` is built and tested. Read
`SessionOverlay.ts`'s header first; it states the invariant the whole layer
rests on.

**Open by paying a debt.** `QueryEngine.ts` is **895 lines against the 800
ceiling** — it was 777 at `24dfdc2` and `293e2d2` added 118. The roadmap
anticipated this session starting with a split; it is now overdue rather than
anticipated. Visible seams, all cohesive and none of them load-bearing for the
session work: the **pivot cluster** (`pivotKey:714`,
`collectPivotResultFields:722`, `pivotAggregate:744`, `valueAgg:772`), the
**sort cluster** (`sortGroupRows:800`, `sortRows:822`), and the **tree path**
(`treeBlock:506`). Split first, land it, then build on a file under the
ceiling — not the other way round.

**Scope**

The RPC is **mechanical, and it has an exact template**:
`configureExpressions` is already a per-session call and already traverses
every hop this one needs. Follow it rather than inventing a shape.

| Hop | File | Template site |
|---|---|---|
| 1 | `runtime/protocol.ts` | `SsrmConfigureExpressionsRequest:417`, union member `:443` |
| 2 | `runtime/worker/SharedWorkerDataServicesHub.ts` | dispatch branch `:618-622` |
| 3 | `runtime/client/SharedWorkerDataServicesClient.ts` | `ssrmConfigureExpressions` |
| 4 | `runtime/ssrm/SsrmPlane.ts` | `:157` |
| 5 | `runtime/ssrm/SsrmServer.ts` | `:222` |
| 6 | `provider/ISsrmDataProvider.ts` | `:37` |
| 7 | `provider/SsrmProviderClientAdapter.ts` | `:166` |

Then the client-side seam, which is the only part needing a decision:

- **`SsrmDataSource` is where core reaches the plane**
  (`packages/core/engine/src/platform/types.ts:478`). It is a *structural*
  interface — core declares the shape, the data package supplies an
  implementation — so adding optional `setSessionPatches` /
  `setSessionExclude` members there crosses no import boundary. Optional
  because a transport need not implement them, exactly as the existing members
  handle that.
- **`SsrmDataAdapter.mutate()` calls it** after `applyServerSideTransaction`,
  so an edit survives a block refetch. This is the point of the whole phase:
  today the value lives only in AG Grid's block cache, and under an active
  sort `bindSsrmTicks` schedules a purge-refresh 50 ms after every tick.
- **Row exclusion installs a predicate** rather than filtering after paging.
  The client-side external filter it replaces leaves `rowCount` wrong, which
  is what the scrollbar is built from — `SessionOverlay.test.ts` already pins
  that exclusion must affect `rowCount` and `grandTotal`, so those cases
  become reachable rather than new.

**Exit**

- An SSRM edit survives a block refetch, and is visible only to the window
  that made it.
- Row exclusion removes rows from the session's own counts and aggregates, at
  the source.
- `npm run bench:ssrm` shows the **shared** path unchanged — a grid that is
  neither editing nor excluding must still share one cache entry. This is the
  invariant that makes the plane worth having; treat a regression here as a
  failed phase, not a tuning problem.
- `QueryEngine.ts` under 800 lines.

**Closes:** T2-4's real fix; an SSRM edit surviving a block refetch (Phase 4
decision 1).

### Record (2026-08-17)

**Landed in two commits, in the order the phase text demanded.**

**1 — the split (`dae3b7d`), on its own.** `QueryEngine.ts` **895 → 765**, now
778 after the phase's own additions. Two of the three named seams moved
wholesale: `queryAggregation.ts` (`valueAgg`, renamed `aggregateValueCols` and
taking `valueCols` rather than a `Pick<>` of the request; `pivotKey`,
`collectPivotResultFields`, `pivotAggregate`) and `querySort.ts` (`sortRows`,
`sortGroupRows`, `SortEntry`, `AUTO_GROUP_COLUMN_ID`). Neither reads engine
state — that is what made them the seams. **`treeBlock` deliberately stayed**:
it needs `collectFilteredCached`, the store, the tree config and `enrich`, so
extracting it means inventing a deps object for no gain, and the two pure
clusters were margin enough. Also took `getRows` from 96 lines to 33 by
extracting `groupBlock` beside the existing `leafBlock`/`treeBlock` — a real
`max-lines-per-function` warning present at HEAD, same ceiling, fixed while the
file was open rather than banked.

**2 — the layer.** The seven hops were mechanical, as promised. The parts that
needed a decision:

- **The exclusion rule crosses as an EXPRESSION, not a predicate.** A function
  does not survive a structured clone. The plane already holds an expression
  engine, so it compiles there — and `evaluateRowExclusion` **moved into
  `@wellsfargo-starui/core`** (`filters/rowExclusion.ts`, beside the filter
  predicate) so the worker and the client-side external filter share one
  meaning rather than the worker growing a second copy. `compileRowExclusion`
  answers `null` for an unusable rule rather than an always-false predicate:
  `null` drops the session's overlay, which is what returns it to the plane's
  shared cache instead of holding a private key for a rule that can never
  exclude anything.
- **`QueryEngine.setSessionExclude` now TAKES the expression** rather than
  keeping its predicate signature and adding a second method beside it.
  Shipped unused in `293e2d2`, so nothing external broke, and constraint 2
  says superseded code goes in the same change. Its six test call sites moved
  to expressions and now exercise the reachable path; the predicate primitive
  keeps direct coverage against `SessionOverlay` itself.
- **The module does not branch, and it no longer calls the grid api.**
  `activateRowExclusion` used to call `api.onFilterChanged()`, which is the
  client-side row model's answer and was silently nothing under the other —
  the exact branch-on-row-model constraint 3 exists to remove, hiding in a
  module that looked innocent because it never wrote `if (ssrm)`. It now calls
  `platform.data.setRowExclusion(expression)`. **`GridDataPort` gained that
  method**: the CSRM adapter re-runs the external filter the transform
  installs (which reads the rule live, so the argument is already in its
  hands); the SSRM adapter hands the expression to the plane and then purges,
  because every loaded block was built by a query that did not carry the rule.
  The ready-time nudge is now UNGATED — the plane holds this per session, so a
  grid whose profile carries no rule still has to say so.
- **`mutate` records the EDITED FIELDS, never the assembled row.**
  `assemblePatchRows` produces whole rows because both AG Grid transaction
  APIs take whole rows; sending one as a session patch would shadow every
  column at its value-as-of-the-edit until the source happened to tick that
  exact column. The caller's own `RowPatch.fields` is the honest answer, and it
  is what lets the plane's source-wins rule work per field. Restricted to the
  rows that actually landed, and fire-and-forget: the edit is already on screen
  and already reported to `rows`, so a failed round trip means it reverts on
  the next refetch — the behaviour that existed before the call, not a reason
  to fail a write that landed.
- **`mutationsReachSource`'s copy was now false** and was corrected. The edit
  survives a block refetch; it still reaches no other window and persists
  nowhere.

**The shared-path gate — and it had to be built before it could be a gate.**
`bench:ssrm` never passed a `sessionId`, so "the shared path is unchanged"
was only ever "the numbers didn't move". A **Per-session query layer** section
now measures the sharing directly, as memo hits/misses, with three rows that
must read 0:

| | |
|---|---|
| 2nd clean session: memo misses | **0** |
| clean session after a neighbour forked: misses | **0** |
| session after clearing its rule: misses | **0** |
| editing session: memo misses (forks, by design) | 2 |

Writing it caught its own artefact first: the rejoin row read 2 because the
`cold` helper upserts to force a miss, which bumps the store revision and
strands every entry including the clean ones. Re-warming the shared entry
first is what makes the row mean what it claims.

**Timings, measured properly.** The first post-change runs looked ~15% worse
on cold blocks, which would have been a failed phase. Stashing to `dae3b7d`
and re-running back-to-back — the roadmap's baseline-before-blame rule — showed
it was machine drift:

| | `dae3b7d` | Phase 12 |
|---|---|---|
| sorted block, cold | 130.4 ms | 134.8 ms |
| filtered + sorted, cold | 48.9 ms | 47.1 ms |
| grouped by book, cold | 51.9 ms | 51.5 ms |
| quick filter, cold | 45.7 ms | 48.9 ms |
| 20 sorted blocks | 135 ms | 131 ms |
| **every warm number** | **0.0 ms** | **0.0 ms** |

Mixed signs within a few percent. The gate passes.

**Verification.** `npx turbo typecheck build` exit 0. Tests serially at
`--maxWorkers=2`; no environmental failures this session:

| Package | Phase 11 | Phase 12 |
|---|---|---|
| `core` | 1343 (was 1316 before Phase 11) | **1343** |
| `data` | 718 | **724** |
| `react-grid` | 2631 + 1 skipped | **2621** + 1 skipped |
| `react-core` / `design-system` / `openfin` / `types` | 523 / 355 / 483 / 171 | unchanged |

Every delta accounts exactly: core +27 (15 into `filters/rowExclusion.test.ts`
— 12 moved from grid, 3 new for `compileRowExclusion` — plus 12 in
`platform/sessionLayer.test.ts`); data +6 (3 overlay, 3 hub round-trip);
react-grid −10 (−12 moved out, +2 in `activate.test.ts`). ESLint compared per
file against `HEAD`: every file same-or-better, and **the two warnings this
phase introduced were fixed, not banked** — `handleSsrmRequest` crossed 80
lines (the three ack-only SSRM arms now dispatch through one
`applySsrmSessionState`), and a `no-console` disable that core does not need
came along with the moved evaluator. `check-package-cycles` and `check:rtl`
pass.

**Open, recorded not banked.** `protocol.ts` is 831 lines and
`SharedWorkerDataServicesClient.ts` 1289, both against the 800 ceiling and
both already over before this phase (801 and 1249). They are declaration and
RPC-surface files; splitting either is its own piece of work, and this phase
kept the file it was told to — `QueryEngine.ts` — under.

---

## Phase 13 — filter, sort and group on calculated columns ✅

**Goal:** a calculated column behaves like a real one under both row models.

**Entry:** Phase 12. Not startable before it — this phase is an addition to
the layer Phase 12 makes reachable.

**Scope**

The roadmap's own statement of why this was deferred is still the accurate
one: the plane's memoised order-cache entries hold **raw** rows by design and
every call site enriches the sliced page *after* paging (`QueryEngine.enrich`,
`:862`). That is exactly what makes one memo entry safe to share between
sessions running different rules. So filtering or sorting on a calculated
field needs an enriched view that is **per-session and incremental**:

- a per-query enrich is O(rows × rules) on every distinct filter;
- materialising into `RowStore` is wrong, because rules are per-session and
  the store is shared.

`SessionOverlay.stateFor().view(row)` is precisely that hook — it is already
the per-session row view the filter and sort consult, and it already returns
the **same reference** for an unpatched row so a session with one edit does
not copy the store. Computed fields materialise there, alongside patches.

Two properties to hold, both already pinned for patches and needing the
equivalent for computed fields:

- a session with no rules still shares the cache (`SessionOverlay.test.ts`,
  "the sharing model is preserved");
- the identity that keys the cache changes when the rules change, or a stale
  order is served.

**Exit**

- Filtering, sorting and grouping on a calculated column returns the same rows
  in the same order under both row models.
- A clean session's memo behaviour is unchanged, proven by the existing
  hit/miss assertions rather than by inspection.

**Closes:** T1-4.

### Record (2026-08-17)

**The gap was total, and measured before anything was designed.** One rule
(`total = [px] * [qty]`) over three rows, put through the plane:

| | before | CSRM |
|---|---|---|
| `sort desc by total` | A,B,C — insertion order | C,A,B |
| `filter total > 25` | **0 rows, an empty grid** | A,C |
| `group by total` | one `""` bucket | 30 / 20 / 60 |
| `sum(total)` | **0** | 110 |

Enrichment on the returned page was already correct, which is exactly why this
was invisible until someone sorted.

**The design, and the one line that decides whether it is affordable.**
Materialising happens in `SessionOverlay`'s per-session `view(row)`, as the
phase text called for, and only the **calculated** half of `enrich` — not
style, alert and editability, which a filter needs none of. Three things make
it hold:

- **Opt in per QUERY, not per session.** `requestReadsAnyField` inspects the
  request's `filterModel` / `sortModel` / `rowGroupCols` / `valueCols` /
  `pivotCols` / quick-filter scope. A grid that HAS a calculated column but is
  not querying one asks the same question a clean session asks and keeps
  sharing the cache. Forking for every grid that merely declares a calculated
  column would be most grids in the building — that is the difference between
  this being a feature and being a regression.
- **The rules are in the cache key.** `ExpressionRuleStore.rulesRevision`, so
  two sessions on different expressions never share an order, and changing a
  rule re-answers.
- **Memoised per row**, in a `WeakMap` keyed on the row reference. Sound
  because `RowStore.upsert` builds `{ ...prev }` and replaces the entry rather
  than mutating in place, so a ticked row is a new object and simply misses.

**Two things the tests found that the design did not.**

1. **A session's row-EXCLUSION rule can read a calculated column**, and unlike
   the query's own column references there is nothing in the request to
   discover that from. `SessionOverlay.excludes()` now counts as a read of
   everything — which costs nothing in sharing terms, because a session that
   excludes has already forked, and the alternative is re-parsing the rule to
   see which identifiers it names.
2. **`enrich` would have evaluated every rule a second time** on the sliced
   page, and not merely wastefully: the rules would have seen their own
   previous output as `x`/`value` rather than the row's original, so
   `[total] + 1` would answer differently depending on whether the query
   happened to sort on it. `enrich` now recognises its own frozen field stamp
   by reference and skips the calculated rules — pinned by a self-referencing
   expression asserted equal on both the viewed and un-viewed paths.

**Parity proven against a real grid, not against arithmetic.**
`calculatedColumnParity.test.tsx` mounts a real `AgGridReact` with the real
`buildVirtualColDef` valueGetter and compares its displayed row order to the
real `QueryEngine`'s, over the same rows and the same expression — sort
(both directions, ties included) and filter. It also guards against both sides
answering insertion order, which would make the test pass for the wrong reason.

**Cost, measured.** New `bench:ssrm` lines: sorting BY a calculated column over
100k x 130 costs **187.9 ms cold** (one whole-store pass, against ~135 ms for a
plain sorted block) and **1.5 ms per warm block** — the per-block cost the
roadmap deferred this for is what the memo removes. A fourth MUST-be-0 gate was
added and holds: *calculated session, query that does not read it: misses = 0*.

**On the shared-path timings: inconclusive today, and said so rather than
claimed.** The general sections read a few percent higher than Phase 12, but a
second run of the SAME build moved `20 sorted blocks` from 145 ms to 188 ms —
a within-build spread larger than the between-build delta. The mechanism is
what settles it: `sessionStateFor` short-circuits on
`computedFields(sessionId) === null` for every session with no calculated
rules, and it replaced FOUR `overlay.stateFor` calls per query with one. The
gates that are exact — the memo-miss counters — all read 0.

**`QueryEngine.ts` went back over the ceiling and was brought back under, in
this phase rather than the next.** 778 → 894 with the new decision logic, then
→ **772** by extracting `queryFilter.ts` (`collectFiltered`, which reads the
store and the request and nothing else about the engine) and
`queryColumnRefs.ts`. Phase 12 paid this debt for the phase that follows it;
paying it forward again seemed the wrong lesson to take from that.

**A correction to Phase 11's record.** Its ESLint check counted matches with a
pattern that never matched the default formatter's output, so its "every
touched file 0 → 0" was vacuous. Re-audited here with a correct pattern against
`df48fdf` and `cb7d223`: **the conclusion holds** — no file's warning count rose
in either phase, and every new file is 0 — but the detail was wrong.
`createSsrmStatusBar.tsx` was 1 → 1, not 0 → 0, and Phase 11 grew that
pre-existing `max-lines-per-function` warning from 102 to 105 lines. Fixed here
by lifting the polling effect into `useStatusBarSummary`, taking the file to 0.

**Verification.** `npx turbo typecheck build` exit 0. Tests serially at
`--maxWorkers=2`; no environmental failures this session. `data` 724 → **741**
(+17, `calculatedColumns.test.ts`), `react-grid` 2621 → **2625** (+4,
`calculatedColumnParity.test.tsx`), everything else unchanged (`core` 1343,
`react-core` 523, `design-system` 355, `openfin` 483, `types` 171). ESLint per
file against `HEAD`: no count rose anywhere, every new file 0, and
`rowExclusionFilter.ts` and `createSsrmStatusBar.tsx` each went 1 → 0.
`check-package-cycles` and `check:rtl` pass, no new hex.

**Open, recorded not banked.** An aggregate expression that folds a CALCULATED
column (`SUM([total])` where `total` is itself calculated) still folds
undefined: `aggregateScope` is built from `store.iterate()`, which yields raw
rows. Pre-existing and untouched by this phase — the column-wide fold over a
RAW column, which is what the customizer authors today, is unaffected.

---

## Phase 14 — the alerts bell counts what the plane sees ✅

**Goal:** the bell counts alerts across the dataset, not across the loaded
blocks.

**Entry:** none. Independent of Phases 11–13 and nothing gets easier by
ordering it after them — it is scheduled last only because it is the largest
single piece and closes no other finding.

**Scope**

Surveyed in Phase 5 and re-verified: the channel this rides **cannot** be the
tick fan-out. `SharedWorkerDataServicesHub.fanSsrmFlush` sends a session its
*interested* rows, or — only where `wantsUnmatchedRows(subId)` holds, i.e. a
**filtered** session — the full changed set, or nothing. An unfiltered session
therefore never receives a row outside its viewport, and widening that is
exactly the whole-payload-to-every-session cost the windowed flush exists to
avoid.

`__ssrmAlert` is written by `enrich`, which runs only on rows the plane is
**handing over** — so a worker-detected alert is only ever present on a row
the client already has. Wiring it to the dispatcher would not raise the count
by one. That is worth re-confirming before writing code, because it is the
reason a cheaper fix does not exist.

So: a **new worker→client message kind carrying HITS** (row key + rule id),
not rows, evaluated per session in the plane and addressed by `sessionId`
— `configureExpressions(rules, sessionId)` is already session-keyed, and one
grid's alerts must not ring in another's bell. Spans:

- `runtime/ssrm/expressionRules.ts` — a hits-only evaluator beside `enrich`
- `runtime/ssrm/SsrmPlane.ts` / `SsrmServer.ts`
- `runtime/worker/SharedWorkerDataServicesHub.ts` — message kind + fan-out
- `provider/ISsrmDataProvider.ts` + `SsrmProviderClientAdapter.ts` —
  `onSsrmAlert`
- the grid's alerts dispatcher wiring
- **a dedupe against `__ssrmAlert`** on the rows the client does hold, or
  every visible hit fires twice

Phase 0's rule against new RPCs does not apply: a notify channel is a read,
not a write into a shared store. The objection was always scope, not shape.

**Exit**

- The bell counts a hit on a row the client has never loaded.
- A visible hit counts once, not twice.
- Two windows on one provider with different alert rules each count their own.

**Closes:** T2-6.

### Record (2026-08-17)

**The premise was re-confirmed first, as the phase asked.** `fanSsrmFlush`
sends a session its *interested* rows, or — only where
`wantsUnmatchedRows(subId)` holds, i.e. a **filtered** session — the full
changed set, or nothing; and the rows it does send go through `enrichRows`,
which is what writes `__ssrmAlert`. So a worker-detected alert really was only
ever present on a row the client already had, and wiring that stamp to the
dispatcher would not have raised the count by one. There is no cheaper fix.

**One deviation from the phase text, deliberately.** It called for "a new
worker→client message kind carrying HITS". The hits ride the existing
`ssrm-tick` message instead (`SsrmTickEvent.alerts`, omitted entirely for a
session with no alert rules). The phase's objection was to the tick's ROW
PAYLOAD being viewport-scoped — not to the message existing — and that message
already reaches every data subscriber on every flush, addressed by the same
`subId`. A second per-flush message to the same recipients with the same
addressing is what binding constraint 2 calls a parallel implementation. Zero
extra messages; the field is absent when there is nothing to say.

**The hits evaluator is not a call to `enrich`, and that is the whole cost
argument.** `enrich` allocates a copy per row and evaluates style, editability
and every calculated column, to answer a question that is one boolean per rule.
`alertHits` evaluates only `alert` rules, over the flush's changed rows, and
returns `{ key, ruleId }`. Calculated columns still materialise first — through
the memoised `applyCalculated` from Phase 13 — because an alert rule may
perfectly well be written about one, and `enrich` evaluates them in that order
too.

**The dedupe lives in `bindSsrmTicks`,** which is the only place holding both
the hits and the grid api. `api.getRowNode(key)` answering `undefined` IS the
question "has this session loaded the row". A hit on a held row is dropped: it
arrives in the same tick as a transaction and the platform's row-change delta
evaluates it against this session's own baselines. What survives is exactly
what the bell was missing.

**The module stays blind to the row model.** Hits reach it as the platform
event `data:alertHits`, which a client-side grid never emits — it holds every
row and finds every hit itself. The alerts module subscribing to an event that,
where it cannot happen, never arrives is not a branch on the row model. Only
`dataChange` rules are dispatched from it: a `relativeChange` rule compares
against a baseline this session recorded and a row nobody has observed has
none, so a source-detected "hit" on one would be a comparison against nothing.
A plane-detected hit carries `column`/`value`/`prevValue` as `null` — the rule
is a row predicate and the row is not loaded, so inventing cell context would
be inventing it.

**Cost, measured.** New `bench:ssrm` lines, over a 2000-row tick:

| | |
|---|---|
| alert hits, no rules configured | **0.0 ms** |
| alert hits, 1 rule | **0.2 ms** |
| alert hits, 3 rules | **0.4 ms** |
| (the `upsert` of the same 2000 rows) | 24.6 ms |

About 1% of the tick it rides on, and free for every grid with no alert rules.

**Verification.** `npx turbo typecheck build` exit 0. Tests serially at
`--maxWorkers=2`; no environmental failures. `data` 741 → **754** (+13: 10 in
`alertHits.test.ts`, 3 hub round-trip), `react-grid` 2625 → **2638** (+13: 6 in
`bindSsrmTicks.alertHits.test.ts`, 7 in `activate.test.ts`), everything else
unchanged. ESLint per file against `HEAD`: no count rose anywhere; both new
files 0. `check-package-cycles` and `check:rtl` pass, no new hex, every touched
file under the 800-line ceiling (`QueryEngine.ts` 793).

**Open, recorded not banked.** `activateAlerts` is **208 lines against the
80-line function ceiling** — it was **already 202** before this phase. The
subscriber added here is 6 lines: its body was hoisted to a module-level
`dispatchSourceAlertHits` on finding that the first draft had grown the
function to 225, which is the same mistake Phase 13 caught in Phase 11. Getting
it under 80 means extracting the delta / full-pass cluster (~110 lines over six
captured variables) — a refactor of the alerts hot path, and not something to
smuggle into the last commit of a phase that changes that module.

Also still open from Phase 13 and unaffected here: an aggregate expression that
folds a CALCULATED column folds undefined, because `aggregateScope` iterates
raw store rows.

---

## Not a defect — recorded and closed

**Two windows on one historical provider fight for its single snapshot.**
Carried by the roadmap as open. It is architectural and **CSRM behaves
identically**, so it is not an SSRM parity finding and closing it is not part
of this effort. Reopen it as a product decision about historical providers if
it ever matters; do not carry it as a parity gap.

---

## Sequencing summary

| Phase | Session | Entry | Closes |
|---|---|---|---|
| 11 — a refused write is visible ✅ | small | none | rejection surface + 2 bugs (the pagination one was not a defect) |
| 12 — session layer reaches the client ✅ | full | none | T2-4 real fix, edit survives refetch |
| 13 — calculated columns ✅ | full | Phase 12 | T1-4 |
| 14 — alerts bell ✅ | full | none | T2-6 |

All four are done. The SSRM/CSRM parity effort — 36 findings across
`SSRM_PARITY_ROADMAP.md`'s 11 phases and these four — is complete.

## Verification, every phase

Inherited from the roadmap and not negotiable per phase:

1. `npx turbo typecheck build` exits 0.
2. Package tests run **serially, `--maxWorkers=2`**. This box produces false
   failures above load ~15 (`[vitest-pool]: Failed to start forks worker`,
   `Worker exited unexpectedly`), always in untouched packages — re-run
   standalone before believing one.
3. ESLint over the touched tree: no new warnings. Fix them in the phase that
   introduces them rather than banking them.
4. `node scripts/check-package-cycles.mjs` and `npm run check:rtl` pass.
5. `npm run bench:ssrm` for any phase touching the plane — Phase 12's shared
   path invariant is a gate, not an observation.
6. `docs/current-features.md` updated in the same commit (CLAUDE.md
   post-implementation rule 1), and the phase's record appended here.
