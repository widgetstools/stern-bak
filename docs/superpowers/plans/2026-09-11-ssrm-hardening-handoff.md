# SSRM hardening — handoff and open items

**Date:** 2026-09-11
**Branch:** `feature/ssrm-dataprovider-refactor` (work described here was left **uncommitted** by the
agent that did it; the owner commits)
**Audience:** the next agent (or person) picking up the AG Grid server-side row model (SSRM) work in
`@wellsfargo-starui/grid` + `@wellsfargo-starui/data`. Everything below was verified against the
installed AG Grid 36.1 bundle, the vendored Rust/WASM engine, and a live run of
`apps/source/stomp-ssrm-minimal` — not read off documentation.

Read in this order: this file → the SSRM bullets in [`../../current-features.md`](../../current-features.md)
(search "SSRM") → [`2026-08-23-ssrm-engine-rust-perspective.md`](./2026-08-23-ssrm-engine-rust-perspective.md)
for the long-term engine direction. **Treat
[`2026-08-07-marketsgrid-ssrm-chrome.md`](./2026-08-07-marketsgrid-ssrm-chrome.md) with care:** it
prescribes remounting the AG Grid *surface* to switch row model, which permanently destroys the
customizer profile (`GridPlatform.destroy()` is one-way). The container already remounts at
`<MarketsGrid key>` instead — keep it that way.

---

## 1. System map

| Layer | Files | Role |
|---|---|---|
| Grid surface | `packages/react-grid/grid/src/widget/MarketsGridSsrmSurface.tsx` | Mounts `AgGridReact rowModelType="serverSide"`; wires datasource, block cache, tick binder, edit binder, status bar, set-filter values, paste guard, `getChildCount` |
| Datasource | `packages/react-grid/grid/src/ssrm/createSsrmDatasource.ts` | `getRows` → provider; first-block set-filter stripping; retry + timeout; ready gate; block cache serve / prefetch / revalidate |
| Block cache | `packages/react-grid/grid/src/ssrm/SsrmBlockCache.ts` | LRU of blocks keyed by view signature + start; patched by id on ticks, cleared before anything that moves rows |
| Ticks | `packages/react-grid/grid/src/ssrm/bindSsrmTicks.ts` | Engine deltas → `applyServerSideTransactionAsync`; positional refresh policy; scroll / paste pause; count reconciliation; failed-block retry |
| Edits | `packages/react-grid/grid/src/ssrm/bindSsrmEdits.ts` | `cellValueChanged` (edit / paste / fill) → `provider.applyEdits` whole rows, coalesced; `ssrmPasteTarget` paste guard |
| Status / counts | `useSsrmStatusModel.ts`, `SsrmStatusPanels.tsx`, `ssrmStatusBar.ts`, `widget/useSsrmFilterCounts.ts` | Engine-backed status bar and saved-filter pill counts, 1 Hz polls |
| Other locks | `withSsrmSetFilterValues.ts`, `lockSsrmExpressionColumns.ts`, `exportSsrmExcel.ts`, `drainSsrmRows.ts`, `withSsrmSelectAll.ts`, `sendSsrmClipboard.ts`, `wrapSsrmContextMenu.ts` | The "honesty locks" — never present block statistics as book statistics |
| Client contract | `packages/data/host-data/src/provider/ISsrmDataProvider.ts`, `SsrmProviderClientAdapter.ts` | `getRows / getColumnValues / getRowCount / getAggregates / watchGroups / applyEdits? / status?` + `onSsrmTick / onRefresh / onStatus` |
| Wire | `packages/data/host-data/src/runtime/protocol.ts`, `runtime/client/SharedWorkerDataServicesClient.ts` | `ssrm-get-rows / -column-values / -row-count / -aggregates / -watch-groups / -apply-edits` RPCs (`ssrmRpc`, 15 s timeout), `ssrm-tick` push, `ssrm-set-viewport` (dead — see §5) |
| Hub (SharedWorker) | `runtime/worker/SharedWorkerDataServicesHub.ts` | Routes RPCs to the plane; `flushSsrmTicks` fans `pollAllTicks()` out per provider; STOMP ingest → `plane.ingest` |
| Plane | `runtime/ssrm/SsrmWasmPlane.ts`, `toViewSpec.ts`, `ssrmTypes.ts` | Per-provider façade over the vendored Rust hub; AG Grid request → engine view spec; view cache (24 / session); epoch shadow columns for dates |
| Engine | `packages/data/host-data/vendor/dshub/` (`dshub.js`, `dshub_bg.wasm`, `dshub.d.ts`) | Vendored rangrez `RustHub` WASM. **Black box** — its capabilities are only known from probing (§3) |
| Demo + broker | `apps/source/stomp-ssrm-minimal`, `apps/source/stomp-view-server` | One `HostedSsrmMarketsGrid`, 20k synthetic FI positions, `?rate=N` live updates/sec |
| Measurement | `apps/scripts/ssrm-perf/` (README inside) | Playwright harnesses + engine probes used for every number in this document |

Rows never reach the main thread except as blocks; the engine cache in the SharedWorker is the source of
truth and every grid on a provider shares it.

---

## 2. What changed on 2026-09-11 (so you know what is new and why)

Correctness:
- **Descending sort was silently ascending.** The plane sent `{column, dir}`; the engine only honours
  `{column, sort}` (§3). Fixed in `toViewSpec.ts` / `ssrmTypes.ts`.
- **Every `cellValueChanged` threw** in `customizer/modules/conditional-styling/runtime/timedActivations.ts`
  (detached `getColId`, AG Grid 36 columns read `this.colId`). The throw aborted AG Grid's paste dispatch
  after the first cell, starved every listener registered later, and left the grid mid-bulk-write so the
  quick filter stopped refetching. Fixed; regression test added.
- **Inserts / deletes never reached the grid** (`update`-only transactions, `removals` unread). Now
  `remove` transactions + engine row-count reconciliation.
- **Header select-all read "Selected: 0"**; export ignored deselected rows. Both read
  `getServerSideSelectionState` now.
- **Date filters were lexicographic string compares and never ordered** (§3). Date columns now get a
  numeric `<col>__epoch` shadow declared at boot and stamped at ingest; date filters and sorts run on it.
- **Two `stomp-ssrm` providers received each other's group deltas** (`tick()` drained per provider).
  `pollAllTicks()` drains once and routes by session → provider.
- Unsupported filter conditions now ride the result (`unsupportedFilters`) and warn on the main thread.
- Lost worker replies: SSRM RPCs time out (15 s) and reject on client close; blocks retry 3× before `fail()`.

Performance:
- **Refresh storm removed.** Any active sort used to refresh every loaded block per 80 ms tick batch
  (10 req/s/block; 90 req/s with 23 blocks). Ticks are now transactions first; refreshes only when a
  loaded row's sort/filter/group key changed (250 ms), on a 1 s cadence for unloaded rows under a
  sort/group, or when the engine row count moved (flat views). Deferred during scroll and paste.
- Loaded rows indexed once per tick with `forEachNode` (AG Grid SSRM `getRowNode` is a linear scan).
- Client block cache + 1-block prefetch + background revalidation; first block held until `status !== 'loading'`.

Features / parity:
- `applyEdits` write path (paste / edit / fill → engine, coalesced per row, one RPC per paste).
- Paste guard: a paste that would land on block placeholders is refused with a warning.
- Quick search: multi-word AND-of-OR semantics; with no `searchColumns` every text column is searched.
- Group rows show child counts (`__count` → `getChildCount`).
- React unpinned (`~19.2.5` → `^19.2.5`) in the three React packages and all seven apps; one hoisted
  19.3.0 per install root. `scripts/run-app.mjs` works on Windows (`shell`, `taskkill /T`).

Tests added or updated for all of the above; `docs/current-features.md` updated.

---

## 3. Verified engine facts — do not re-derive

Probed with `apps/scripts/ssrm-perf/engine-probe-*.mjs` (loads the WASM in Node via `initSync`).

| Fact | Consequence |
|---|---|
| Sort descriptor is `{ column, sort: 'asc' \| 'desc' }`. A `dir` key is **ignored** (view comes back ascending). | Never emit `dir`. |
| String columns: `equals`, `equalsIgnoreCase`, `notEqual`, `contains`, `startsWith`, `in`, `blank`, `or` work. `greaterThan`, `lessThan`, `greaterThanOrEqual`, `inRange` on strings return **nothing**. | Anything that must order (dates) needs a numeric shadow column. AG Grid's text filter has no ordering ops, so text is fine. |
| Numbers (`f64`) order and range correctly. | — |
| String sort is case-sensitive ASCII (uppercase before lowercase), same as AG Grid's default comparator. | — |
| Group rows carry `__group`, `__level`, `__expanded`, `__count` (leaf count), `__path`; the top-level grouped `rowCount` is the group count. | `getChildCount` reads `__count`. |
| `apply_message_json` upserts **whole rows** by key. | A partial row nulls the columns it omits — always send full rows (edits do). |
| Boot schema types accepted: `f64`, `bool`, `string`. | No date type; hence `__epoch`. |
| Every boundary crossing is a JSON string (control in, rows out) and rows are then structured-cloned to each window. | Double serialisation per block (§5, item 9). |
| A view is live and maintained on every tick; the plane caps them at 24 per session (LRU). | Every distinct query (each expanded group, each pill, each set-filter list) costs a view. |

---

## 4. Measured baselines (production build, one grid, 20k rows)

From `ssrm-validate2.mjs` / `ssrm-validate3.mjs`; rerun them after any change to the files in §1.

| Measurement | Before 2026-09-11 | After |
|---|---|---|
| Block RPC round trip at idle, p50 | 5 ms | 4–5 ms |
| Idle, sorted, 1 block loaded: block requests / s | 10 | 1 (cold column) · ~5 (hot column, key-change refreshes) |
| Idle, sorted, 23–44 blocks loaded: requests / s | 90 | ~40 |
| Wheel scroll (100 × 20 rows @16 ms), sorted: requests | 361 | ~95–110 |
| Drag scroll (25 jumps), sorted: main-thread cost per jump p50 | 212 ms | 80–100 ms |
| Blank rows during wheel scroll (sampled at 32 ms) | 7 % | 6 % |
| Render cost with warm blocks | — | ~10 ms + ~1.5 ms per newly rendered row (27 rows ≈ 60 ms) |
| Cold start | empty first block (rowCount 0), then purge | one block |
| 10 000 updates/s, unsorted idle | not measured | 11 600 upserts/s applied, **0 long tasks** |
| 10 000 updates/s, sorted, block RPC p50 / p95 | — | 20 ms / 83 ms |
| Header select-all → status panel | 0 | 20,000 |
| Paste 4 cells (range) → engine | 1 row | 4 rows, 1 RPC, painted < 400 ms |

Drag-scroll cost is AG Grid DOM churn (CPU profile: ~56 % native layout/DOM, 22 % ag-grid-community,
8 % ag-grid-react, 9 % React + starui). The data path is not the bottleneck at this scale.

---

## 5. Open items, in priority order

Each item: what is wrong, the evidence, where, a suggested approach, and what "done" looks like.

### P0 — correctness a trader would notice

**1. Edits are overwritten by the next upstream tick for that row.**
Evidence: `ssrm-validate3.mjs` paste step — 4 values persisted through 3 s of ticks and an engine
refetch, but in one run a row reverted after an upstream tick. Cause: the STOMP fixture's `legacy` wire
mode resends the *whole* row and the engine upserts whole rows (§3), so an engine-side edit to *any*
column dies with the row's next tick. Where: `SsrmWasmPlane.ingest`, `stomp-view-server` (`LIVE_MODE`).
Approaches: (a) sparse wire mode (`live-mode: sparse` header / `LIVE_MODE=sparse`) — partial rows only
touch changed fields; verify the engine merges partial upserts rather than nulling; (b) an "edited
fields" overlay in the plane (per row id → {col: value, at}) reapplied on ingest until the upstream value
changes or a TTL passes; (c) the real answer for trading: a backend write path (`applyEdits` → upstream),
with the engine echoing the confirmed value. Done: a pasted value survives an upstream tick for its row,
and the behaviour is written down in `ISsrmDataProvider.applyEdits`'s doc comment.

**2. Unhandled error in the grid test project.** `npx vitest run --project grid` in
`packages/react-grid` passes all 2011 tests but exits 1 with one unhandled
`TypeError: textRange(...).getClientRects is not a function` (a jsdom gap hit asynchronously by some
dependency's text measurement). Not attributed to a file; `rg` for `textRange(` finds nothing in
`packages/`, `ag-grid-community`, `ag-grid-enterprise`, `@radix-ui`, `cmdk`, `@floating-ui`. Approach:
run with `--reporter=verbose` (slow, ~12 min) or bisect by folder to find the file, then stub
`Range.prototype.getClientRects` in `grid/src/test/setup.ts` or mock the component. Done: exit 0.

**3. Expression / calculated columns cannot sort, filter or group under SSRM; alerts and conditional
styling see loaded rows only.** Locked deliberately by `lockSsrmExpressionColumns.ts`. The chrome spec
mentions `configureExpressions` / `toSsrmExpressionRules` as "already built" — they exist only on the
unmerged `origin/feature/ssrm` branch and target an engine that does not exist on `main`. The vendored
WASM has no expression support. Approach: follow the three-tier planner in the Rust plan (§5.3 there):
compile what the engine can express (none today), materialise the rest client-side with the lock kept,
report the unsupported tier in the customizer. Done: the panel says which tier a column is in; nothing
silently blank.

### P1 — parity and robustness

**4. Expanded groups are not restored from a saved profile; no per-level block params.**
`isServerSideGroupOpenByDefault`, `getServerSideGroupLevelParams`, `serverSideOnlyRefreshFilteredGroups`,
`serverSideSortAllLevels`, `purgeClosedRowNodes`, `isApplyServerSideTransaction` are unset (see the
coverage table in the Rust plan §5.9). Where: `MarketsGridSsrmSurface.tsx`. Approach: feed
`isServerSideGroupOpenByDefault` from the grid state the profile already persists; measure the three
refresh options before defaulting them. Done: reload restores the same expanded groups.

**5. Pivot is translated but never exercised.** `spec.splitBy` / `columns` are emitted;
`serverSidePivotResultFieldSeparator` is unset; no test or demo pivots. Risk: separator collisions
corrupt the secondary column tree silently (Rust plan §5.9.2). Done: a pivot in the demo with a test.

**6. Cold start is slow and variable (5–42 s to first rows).** Evidence: `ssrm-validate3` `[cold]`.
Two contributors: the demo re-saves its provider row on a config-version or `?rate` change, which
restarts the provider and re-streams the 20k snapshot; and the first block after `ready` takes 1–2.5 s
(engine view build over 20k rows). Approach: measure `SsrmWasmPlane.readView` first-call cost;
consider warming the root view on `ready`; make the demo's re-save conditional on an actual config
diff. Done: cold start < 5 s on the fixture, first block < 300 ms after `ready`.

**7. Three independent 1 Hz pollers per grid.** Status model (2 row-count RPCs/s), pill counts (1 per
pill/s), expression aggregates. Each opens/reads an engine view against the 24-view cap; with many
expanded groups the cap thrashes (an eviction rebuilds a view over the whole dataset mid-scroll).
Approach: one `ssrm-summary` push per provider per tick carrying total / filtered / per-pill counts /
aggregates computed engine-side; raise or partition the view cap (block views vs poll views). Done:
zero polling RPCs at idle.

**8. `ssrm-set-viewport` is dead protocol.** Declared in `protocol.ts`, answered `ok:true` by the hub,
sent by nobody. Either implement the push model (client sends the visible range + overscan on
`bodyScroll`; worker pushes that window on change; client applies with `api.applyServerSideRowData`,
which exists in the installed enterprise bundle) or delete the message. The block cache + prefetch made
this less urgent; the drag-scroll cost is DOM, not data.

**9. Double serialisation on every block.** Rows are JSON-stringified inside the WASM boundary, parsed,
then structured-cloned per window. The CSRM path already has a columnar binary codec with transferables
(`protocol.ts` `delta-bin`, `providerEmit.ts`). Only worth doing after §7; at 20k rows / one grid the
RPC is 5 ms.

**10. Selection with group-selection state.** `useSsrmStatusModel.selectedCount` and
`filterSsrmExportSelection` fall back to loaded nodes when `toggledNodes` holds group objects
(`groupSelects`). Correct but incomplete. Done: counts and exports honour group selection state.

**11. `getColumnValues` ignores the quick filter.** Set-filter lists honour other columns' filters but
not `quickFilterText`; the list can offer values the quick filter would hide. One-line change in the
surface's values getter + plane.

### P2 — hygiene

12. `useSsrmStatusModel` listens for a `quickFilterChanged` grid event that does not exist (the
    `filterChanged` it also listens for fires anyway). Remove.
13. Status panels render `0` before the first engine answer; render a dash or "…" instead (the Rust plan
    calls this trap out).
14. `docs/superpowers/plans/2026-08-07-marketsgrid-ssrm-chrome.md` carries the fatal surface-remount
    advice — annotate or retire it.
15. `CLAUDE.md` says "pin to the stable line (React 19.2.x)"; the pins are now `^19.2.5` resolving 19.3.0
    at the owner's request. Update the policy text or re-pin consistently in both install roots.
16. Several files were written with LF line endings in a CRLF working tree (git warns, normalises on
    commit). Harmless; renormalise if it bothers `git diff`.
17. The demo's `App.test.tsx` was asserting two grids while `App.tsx` renders one; aligned to one grid.
    The README still says "two grids". Decide which the demo should be.
18. Multi-window / six-blotter SSRM soak was never run (the CSRM diagnosis in the memory notes was six
    blotters on one renderer thread). `ssrm-validate2.mjs` can be extended to open two pages on the same
    origin (shared SharedWorker + provider).

---

## 6. Gotchas that cost time this session

- **The Vite dev server serves a stale copy of package `dist/`.** Source-mode aliases prefer `dist/`,
  but Vite does not watch files outside the app root, so after `npm run build` in a package the dev
  server keeps serving the old module. Validate against `vite build` + `vite preview` (see the harness
  README), or restart the dev server.
- **Two Reacts = every hook test fails with `Cannot read properties of null (reading 'useState')`.**
  Root cause: a `~19.2.x` pin nesting a copy under a package/app while the root hoists 19.3.0 (pulled in
  by `ag-grid-react`). The externalised `@testing-library/react` loads the hoisted copy, aliased source
  loads the nested one. Fix recipe: loosen the pin, delete the root's `package-lock.json` and the nested
  `node_modules/react{,-dom}`, `npm install` (both `/` and `apps/`).
- **AG Grid 36 dispatches `cellValueChanged` for pastes through an async event queue** inside a bulk
  write. A listener that throws aborts the rest of the paste and leaves the grid in bulk-write mode.
  Guard every `cellValueChanged` listener; call column methods through the column.
- **AG Grid 36 DOM classes** (for Playwright): rows `.ag-grid-scrolling-container .ag-row`, scroller
  `.ag-grid-viewport`, stubs carry `ag-row-loading`, `row-id` attr = `getRowId`. Header cells and
  floating-filter cells both carry `col-id`. The floating date input is read-only.
- **Reaching the grid api from a page without a global:** walk the React fiber from
  `.ag-root-wrapper` up `.return` until `stateNode.api` exists (see `ssrm-diag2.mjs`).
- **Non-invasive worker instrumentation:** `addInitScript` wrapping `window.SharedWorker` to hook
  `port.postMessage` / `port.addEventListener('message')`; match `ssrm-get-rows` → `ssrm-rpc` by
  `reqId`. Synthetic ticks: `port.dispatchEvent(new MessageEvent('message', { data: { kind: 'ssrm-tick',
  subId, payload } }))`. The client's count reconciliation will *undo* a synthetic insert/delete after
  ~1 s because the engine never saw it — that is correct behaviour, not a bug.
- The SharedWorker outlives a page reload; only closing every tab replaces it. Protocol changes need the
  worker-name bump discipline noted in the chrome spec.
- The STOMP broker (`stomp-view-server`, :8081) is usually already running; `run-app.mjs` reuses it.

---

## 7. How to verify

```bash
# packages (root install)
npm run typecheck --prefix packages/data && npm run typecheck --prefix packages/react-grid
cd packages/data && npx vitest run host-data/src/runtime/ssrm host-data/src/runtime/client host-data/src/runtime/worker/ssrmHub.integration.test.ts
cd packages/react-grid && npx vitest run --project grid ssrm/ widget/MarketsGridSsrmSurface conditional-styling/runtime/timedActivations
# demo app (apps install root)
cd apps/source/stomp-ssrm-minimal && npx vitest run
# live measurement — see apps/scripts/ssrm-perf/README.md
```

Suggested commit split for the uncommitted work (all on `feature/ssrm-dataprovider-refactor`):
1. `fix(grid): call getColId through the column so paste and edit events survive AG Grid 36`
2. `fix(data): engine sort key is sort not dir; epoch shadow columns for date filters and sorts`
3. `feat(data,grid): engine write path for edits (ssrm-apply-edits), paste guard, provider status`
4. `perf(grid): transaction-first ticks, block cache + prefetch, ready gate, retry/timeout`
5. `fix(grid,data): removals, select-all counts, cross-provider ticks, RPC timeouts, unsupported filters`
6. `chore: unpin React to ^19.2.5 in both install roots; Windows launcher; demo rate param; ssrm-perf harness`
7. `docs: current-features SSRM bullets; this handoff`
