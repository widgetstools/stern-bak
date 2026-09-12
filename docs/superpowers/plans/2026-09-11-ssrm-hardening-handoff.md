# SSRM hardening — handoff and open items

**Date:** 2026-09-11 (first pass committed as `b720833..6a037d2`; the second pass — §2b — was
left **uncommitted** by the agent that did it; the owner commits)
**Branch:** `feature/ssrm-dataprovider-refactor`
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
| Wire | `packages/data/host-data/src/runtime/protocol.ts`, `runtime/client/SharedWorkerDataServicesClient.ts` | `ssrm-get-rows / -column-values / -row-count / -aggregates / -watch-groups / -apply-edits` RPCs (`ssrmRpc`, 15 s timeout), `ssrm-tick` push |
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

## 2b. What changed in the second pass (2026-09-11, hardening)

Every P0/P1 item from the original §5 was closed except double serialisation; the closures and
their mechanisms:

- **Edits survive upstream ticks** (was item 1). `bindSsrmEdits` now sends the per-row
  `editedColumns` it coalesced (read via `event.column.getColId()`), and `SsrmWasmPlane.applyEdits`
  holds each named cell as an overlay: a whole-row resend of the pre-edit value is rewritten so the
  edit stands; an upstream value that genuinely moves — or echoes the edit — releases the hold, as
  do row removals, config changes and a 10 000-row FIFO cap. Semantics documented on
  `ISsrmDataProvider.applyEdits`; verified against the real WASM
  (`SsrmWasmPlane.wasm.integration.test.ts`) and live across two windows under a 1 000 upd/s
  legacy feed (`ssrm-multiwindow.mjs`: the edited cell read back edited on BOTH pages).
- **Grid test project exits 0** (was item 2). The unhandled `textRange(...).getClientRects`
  TypeError was `@codemirror/view` (ExpressionEditor) measuring on a rAF after its test finished —
  a jsdom Range gap. `grid/src/test/setup.ts` shims `Range.prototype.getClientRects` /
  `getBoundingClientRect`.
- **Calculated columns say their tier** (was item 3). The panel editor shows an `SSRM TIER` chip +
  note under SSRM: grid-computed per loaded row, sort/filter/group locked (the engine has no
  expression support); `astUsesAggregateFunctions` flags expressions whose SUM/AVG/MIN/MAX/COUNT
  read engine-wide totals. The compile tier stays empty until an engine with expressions lands
  (Rust plan §5.3).
- **Expanded groups restore from a saved profile** (was item 4). `captureGridState` derives
  `rowGroupExpansion` from loaded group nodes (AG Grid's state module reports none under SSRM);
  `applyGridState` stashes the ids on the api (`RESTORED_EXPANDED_GROUP_IDS_KEY`); the surface
  answers `isServerSideGroupOpenByDefault` from the stash as each group row loads. Group node ids
  derive from data (`key` / `level:parents:key`), so they are reload-stable. The per-level block
  params / refresh options remain unset — see §5.
- **Pivot is translated AND exercised** (was item 5). Probed: `splitBy` pivots grouped views only;
  fields come back `key|…|valueCol` with `|` and no field list. The plane derives
  `pivotResultFields`; the surface sets `serverSidePivotResultFieldSeparator: '|'`; pivot with no
  row groups is reported unsupported; the demo enables `enablePivot`; the real-WASM test pins the
  whole path.
- **Cold start** (was item 6). Three causes closed: the demo re-saved (→ restarted → re-streamed)
  its provider row on every version/localStorage mismatch — now re-saves only when the built config
  actually differs; the first block paid the engine's root-view build — the hub now warms the root
  view when the snapshot lands (`warmSsrm` on `ready`, and for late SSRM attaches); and — probed —
  the engine DROPS rows ingested while no session is subscribed, which grid sessions only do on
  their first RPC, so early snapshot chunks were lost — the plane now anchors a hub-owned
  subscription before any ingest. Measured (`ssrm-multiwindow.mjs`): second window 213–247 ms to
  rows; first window ~6–7 s, dominated by the fixture broker's snapshot streaming pace.
- **Zero polling RPCs at idle** (was item 7). The status model and pill counters are tick-gated:
  the 1 Hz cadence reads only after a provider tick/refresh arrived (grid-side changes still
  refresh immediately). Measured: 0 block RPCs and 0 polls over 10 s at `?rate=0`, both windows.
  The view cache is partitioned (block 24 / poll 12 per session) so pollers can never evict a
  block view mid-scroll. The engine-side `ssrm-summary` push remains an option if live-feed poll
  cost (measured ~3 RPCs/s/grid under load) ever matters.
- **`ssrm-set-viewport` deleted** (was item 8) — protocol type, `isRequest` arm, hub case.
- **Selection with group-selection state** (was item 10). `ssrmGroupSelection.ts`: counts resolve
  the `groupSelects` tree against loaded group rows' engine `__count` (AG Grid 36 serializer
  semantics: a toggled entry is the opposite of its parent; leaves carry `nodeId` only); exports
  filter drained flat rows by each row's rebuilt group chain. Both fall back to the loaded-node
  walk rather than guess when a toggled group is not loaded.
- **Set-filter lists honour the quick filter** (was item 11) — values getter forwards
  `quickFilterText`; the plane applies it like any other condition.
- Hygiene closed (were items 12–15, 17): dead `quickFilterChanged` listener removed; count panels
  render an en-dash until the first engine answer; the 2026-08-07 chrome spec carries a superseded
  banner; CLAUDE.md documents the `^19.2.5` React caret policy; the demo README describes the
  one-grid app.
- New: `ssrm-multiwindow.mjs` (N same-origin pages, shared worker/session/cache — cold, idle,
  sibling-scroll isolation, cross-window edit), run at PAGES=2 for the numbers above. The
  `@wellsfargo-starui/data/runtime` barrel no longer value-exports the WASM-only plane/host
  (page bundles could not resolve `@starui/dshub`); the hub reaches them relatively.

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
| Every boundary crossing is a JSON string (control in, rows out) and rows are then structured-cloned to each window. | Double serialisation per block (§5, item 2). |
| A view is live and maintained on every tick; the plane caps them per session (block 24 / poll 12 partitions since pass 2). | Every distinct query (each expanded group, each pill, each set-filter list) costs a view. |
| **Rows applied while the datasource has ZERO subscribed sessions are dropped** — `connect` alone is not enough, a `subscribe` control must exist. | The plane holds a hub-owned anchor subscription (`__hub-anchor:<id>`) from first ingest to provider stop. Without it, snapshot rows streamed before the first grid RPC were silently lost — the "empty first block, then purge" cold start. |
| `splitBy` pivots **grouped views only**; alone it returns flat leaves. Pivot fields are named `<key>\|…\|<valueCol>` (`\|` separator, no escaping) and the payload carries NO field list. | The plane derives `pivotResultFields` from the window; the surface sets `serverSidePivotResultFieldSeparator: '\|'`; pivot with no row groups is reported unsupported. A pivot key VALUE containing `\|` corrupts the tree — documented limit. |
| **No delete primitive.** No `apply_message_json` envelope removes rows, and a re-boot (same or bumped `schemaRef`, empty schema, even all-sessions-disconnect) keeps existing rows. | A restart that SHRINKS the dataset leaves removed keys in the engine (see §5). The old "empty replace re-boots so stale keys drop" comment was wrong whenever anything was subscribed. |
| Same-schema re-boot keeps rows AND live subscriptions; late subscribers see the shared cache. | A second grid attaching (which re-runs `boot`) is safe. |
| Engine facts above are pinned by `SsrmWasmPlane.wasm.integration.test.ts`, which runs the plane against the real vendored WASM. | A vendored WASM bump that changes them fails tests instead of rendering silently wrong grids. |

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


### 4b. Multi-window baselines (pass 2, `ssrm-multiwindow.mjs`, PAGES=2, production build)

| Measurement | Value |
|---|---|
| Cold to first rows, window 1 (fresh worker, snapshot stream) | 5.9–7.0 s (broker pacing dominates) |
| Cold to first rows, window 2 (warm worker cache + warmed root view) | 213–247 ms |
| Idle 10 s, live feed 1000 upd/s — block RPCs per window | 0 (tick-gated polls: ~3 RPCs/s) |
| Idle 10 s, `?rate=0` — ALL RPCs per window | 0 block, 2–3 total (post-reset initial reads) |
| Window 2 scrolls 60 steps — window 1 block RPCs / long tasks | 0 / 0 (117 blocks on window 2, p50 19 ms) |
| Edit via `ssrm-apply-edits` + `editedColumns` on window 1, read on window 2 under live legacy feed | edited value on BOTH windows after 2.5 s of whole-row resends |

---

## 5. Open items, in priority order

Each item: what is wrong, the evidence, where, a suggested approach, and what "done" looks like.
Close an item by deleting it here in the change that fixes it.

**1. The engine cannot delete rows — a restart that shrinks the dataset leaves stale keys.**
Probed (§3): no `apply_message_json` envelope removes rows, and every re-boot shape keeps existing
rows while any session is subscribed. The "empty replace re-boots so stale keys drop" path in
`SsrmWasmPlane.ingest` never dropped anything once a session was live — and now the anchor
subscription is always live. Consequence: after a provider restart whose new snapshot no longer
contains some keys, those rows stay in the engine and render as current. The fixture always
resends all 20k keys, so the demo cannot show it. Approaches: (a) an engine-side delete/truncate
entry point (vendored WASM change — rangrez backlog, it is first-party); (b) plane-side tombstone
diff on restart: remember the key set, diff against the new snapshot once `ready` lands, and…
there is nothing to apply the deletions WITH today, which is why (a) is the real fix. Done: a
restart with a smaller snapshot shows exactly the new rows; the WASM integration test pins the
delete primitive.

**2. Double serialisation on every block.** Rows are JSON-stringified inside the WASM boundary,
parsed, then structured-cloned per window. The CSRM path already has a columnar binary codec with
transferables (`protocol.ts` `delta-bin`, `providerEmit.ts`). At 20k rows / one grid the block RPC
is 4–5 ms, so this only matters at much larger row counts or many windows.

**3. Per-level SSRM store options are unset and unmeasured.** `getServerSideGroupLevelParams`,
`serverSideOnlyRefreshFilteredGroups`, `serverSideSortAllLevels`, `purgeClosedRowNodes`,
`isApplyServerSideTransaction` (coverage table in the Rust plan §5.9). Group expansion restore
landed without them. Measure with the ssrm-perf harness before defaulting any.

**4. Scale the multi-window soak.** `ssrm-multiwindow.mjs` ran at PAGES=2 (numbers in §4b). The
six-blotter shape from the CSRM diagnosis is `PAGES=6 APP_URL="http://localhost:5215/?rate=10000"`
— not yet run.

**5. Line endings.** Several files carry LF in a CRLF working tree (git normalises on commit).
Harmless; renormalise only if it bothers `git diff` — owner's call, the diff would be repo-wide.


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

Second-pass additions to the same flow: `SsrmWasmPlane.wasm.integration.test.ts` runs the plane
against the real vendored WASM (no server needed); `ssrm-multiwindow.mjs` needs the broker + a
production `vite preview` on :5215 (see `apps/scripts/ssrm-perf/README.md`).

Suggested commit split for the second-pass work:
1. `fix(data): anchor engine subscription before ingest; edit overlays; view-cap partition; warm root view; page-safe runtime barrel; drop ssrm-set-viewport`
2. `feat(grid): profile group-expansion restore, pivot separator, group-selection counts/exports, quick-filter-scoped set lists, tick-gated pollers, dash-before-first-count, calc-column SSRM tier`
3. `fix(grid): shim jsdom Range geometry so the grid test project exits 0`
4. `feat(apps): demo config-diff re-save + enablePivot; ssrm-multiwindow soak harness`
5. `docs: engine facts (zero-subscriber drop, pivot naming, no delete), baselines 4b, close §5 items, chrome-spec banner, CLAUDE.md React policy`
