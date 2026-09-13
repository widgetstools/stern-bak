# Refactor plan — grid data-apply, mount stack, hidden views, worker ingest, resilience (2026-09-13, revised the same day)

Written from the measurements of 2026-09-12/13 (WORKLOG 18–21). Every phase
below carries the number that motivates it, the number that proves it, its
entry and exit criteria, and the command that verifies it. Each phase is one
session and one commit. The rule of the week applies throughout: **rewrite a
subsystem when its measured problem is its design; fix in place when the
problem is a mechanism** — and the measurement that decides which is taken
before the rewrite, not after.

Not in scope: the data hub's fan-out design, the SSRM WASM plane's query path,
the customizer modules, persistence storage, the OpenFin platform layer. They
are the components that already work — recently measured, instrumented, and
fixed where needed. Handoff §6 items that stay open and are NOT picked up
here: the REST-mode re-probe, the demo apps' render-blocking Google Fonts, the
SharedArrayBuffer fan-out stretch, the `ssrm-blocks-dropped` hint and the
scroll-aware tick hold from WORKLOG 19.

## Revision note (what changed from the first draft, and the evidence)

1. **Phase B0 added, before any rewrite.** The two timers per updated row are
   now named from the installed AG Grid 36.1 bundles: ag-grid-react's
   `RenderStatusService` (one `setTimeout` per `rowNodeDataChanged`, present
   whenever the column-autosize bean exists) and ag-grid-enterprise's
   `FindService` (`_debounce`: one `clearTimeout` + one `setTimeout` per event,
   registered on every CSRM grid whether or not Find is used). The census
   fits: 2 × 94 726 is within 40 of 189 490. Find is used nowhere in this
   repo; nothing calls `autoSizeColumns`; the only consumer of the autosize
   module is the opt-in `sizeColumnsToFitOnReady` (default false). Both arrive
   through the default `AllEnterpriseModule` in
   `packages/react-grid/grid/src/widget/ensureAgGridModules.ts:16`. An explicit
   module list removes the whole timer storm with transactions unchanged.
   B0 measures that; its number decides B1.
2. **Phase B's `refreshCells({ force: true })` removed.** AG Grid 36.1's
   `refreshCell` computes `dataNeedsUpdating = forceRefresh || valuesDifferent`
   and flashes inside that branch, so `force: true` flashes every rendered
   cell of a changed row, not the 4.4 fields that changed. B1 calls it without
   `force`; the in-place patch already makes changed cells differ from their
   cached value.
3. **Phase B's switch removed; B is one implementation behind the existing
   port.** `ApplyProviderToGridState`
   (`packages/react-grid/widgets-react/src/container/markets-grid-container/applyProviderToGrid.ts:27`)
   is the port; it has two constructors today
   (`useProviderDataWiring.ts:132`, `blotter/hooks/useBlotterDataConnection.ts:59`)
   and the first draft covered only one. The transaction update branch is
   deleted in the same change (CLAUDE.md pre-implementation rule 7, handoff
   rule 3 — the first draft's "old path stays a release" contradicted both).
4. **Phase B now names the consumers the transaction path feeds** besides
   `RowChangeBus`: calculated columns on `rowDataUpdated`, conditional styling
   on `modelUpdated`, the event bridge's `grid:rowDataUpdated`. Each moves in B2.
5. **Phase C is opt-in only (owner decision 2026-09-13: Option 2).**
   `packages/react-grid/widgets-react/src/container/markets-grid-container/useProviderDataWiring.ts:196-202`
   records that hidden-pause + refresh-on-visible was removed deliberately so
   hidden blotters keep alerting. Pausing fan-out at the hub reverses that.
   The compatible form (no DOM work while hidden, bus still fed) is B3. C's
   SSRM branch also relied on the count check, which only refreshes on a
   count mismatch (`bindSsrmTicks.ts:231`); it now uses a reset tick.
6. **The hidden signal is an entry criterion, not an assumption.**
   `meta.hidden` derives from `document.hidden`
   (`SharedWorkerDataServicesClient.ts:969`); no probe this week recorded
   `visibilityState` for an inactive docked tab. G1's liveness probe records it.
7. **Phase F2/F3 re-scoped to the mechanism.** The worker URL is already
   content-hashed in production (`createDataServicesWorker.ts:111`; star-demo's
   dist carries `data-services-worker-BBFYs2zw.mjs`) and an `error` listener
   already exists at line 117 (it only logs). What is missing is a bound on
   `configManager.init({ mode: 'attach' })`, a visible failure state, a build id
   in introspect, and a check of the rolling-reload window.
8. **Phase E1 dropped.** Conflation is the transport's
   (`providers/transports/stomp.ts:338-359`) and the hub hands the engine the
   same batch it caches (`providerEmit.ts:130`). A provider that does not
   conflate is a config change (`throttleMs` + `conflateByKey`), not code.
9. **Phase D gets a profile-first gate.** "57 fibers", "three persistence
   layers" and "≤ 25 fibers" were unrecorded; WORKLOG 20's placeholder grid is
   already fixed (70239b3); the 2.5 s cold reload is an SSRM number of which
   1.1 s is `platform-ready`. D0 attributes the remaining ~1.4 s before any
   component is rewritten. `MarketsGridContainer.tsx` is 1058 lines today.
10. **Phase A is complete** (merged as 558c789; the manifest carries
    `viewProcessAffinityStrategy: "different"`). Only the target-hardware
    decision remains.
11. **Phase E2 rewritten as a cost measurement** (owner, 2026-09-13):
    columnar ingest has its own encode cost, the engine may have to transpose
    it back to rows, and any columnar payload that reaches a window is
    reassembled on the main thread. E2 now decomposes today's ingest by stage
    and benchmarks both sides of every candidate before any engine entry
    point is requested; E3 states its client cost as a field merge.

---

## 0. Binding constraints (override the phase text)

1. **One phase per session, one commit per phase**, conventional prefix,
   `Co-Authored-By` trailer, full gate green before commit
   (`npx turbo typecheck build test` + `npm run lint:all`).
2. **Superseded code is deleted in the same change as its replacement**
   (CLAUDE.md rule 7). One sanctioned exception: Phase D is a three-session
   strangler; `HostedMarketsGrid` and `MarketsGridContainer` survive D1–D2 and
   are deleted in D3. No adapter outlives D3.
3. **A switch exists only where both behaviours are legitimate products**
   (§1). A switch is never a way to keep a superseded implementation.
4. **≤ 800 lines per file, ≤ 80 per function — enforced mechanically** from G1
   by `npm run check:loc` (`scripts/check-file-size.mjs`, wired into
   `lint:all` next to `check:rtl`). Its allowlist names each file already over
   the ceiling and the phase that removes it (`MarketsGridContainer.tsx` → D3);
   a listed file may not grow and no new file may cross.
5. **Measure on the production build, on the target box.** Scrolling and
   rendering numbers from `vite dev` are not evidence (7–9× slower on that
   path, WORKLOG 19). A phase without a target-box number in §2 is not done.
6. **No dist rebuilds under a dev-served OpenFin platform**; restart workers by
   quitting the dock (`npm run client`) or `self.close()` over CDP; verify
   served bytes before trusting a worker-side measurement (WORKLOG 19).
7. **`docs/current-features.md` and WORKLOG updated with every phase.** Closed
   WORKLOG items are deleted, not struck through.
8. **Regression targets — behaviours that are correct today and must stay so:**
   - cells flash only where a value changed, on visible rows only;
   - alerts, conditional styling, calculated columns and data-change history
     see every changed row once per frame (via `RowChangeBus` or AG Grid's
     own events, see B2);
   - selection, editing and paste survive live updates (edits write through
     the engine and return as patches);
   - sort / filter / group positions and aggregates update within the
     provider's throttle window;
   - SSRM: loaded blocks reconcile after a purge, a reset, and a hidden period;
   - hidden blotters keep alerting (owner decision 2026-09-13: Option 2;
     Phase C is opt-in only);
   - one AG Grid instance per blotter per load (WORKLOG 20's test);
   - popouts share the main window's renderer (`popoutWindow.ts`; Phase A
     touches views, not windows).

## 1. Configuration contract: the switches that remain

| Behaviour | Switch | Where it is read | Off = |
|---|---|---|---|
| Per-view renderer isolation (A) | `platform.viewProcessAffinityStrategy` in `apps/source/star-demo/public/platform/manifest.fin.json` | OpenFin at app start; once by the platform override (`workspacePersistence.ts`) | key absent or `"same"` → OpenFin's default grouping; the override takes its legacy path |
| Hidden-subscriber pause (C, opt-in only) | provider config `pauseHiddenSubscribers?: boolean` (default off) | data hub fan-out | fan out to every subscriber (today) |
| Worker ingest format (E2, only if its measurement says so) | provider config `ingestFormat: 'json' \| 'columnar'` (default `json`) | `SsrmWasmPlane.ingest` | `json` = today |
| SSRM tick column patches (E3) | per-session capability `tickPatches` advertised by the grid | `HubSsrmRpc.flushTicks` / `SsrmSessionWindows` | a session that does not advertise it keeps full rows |

**Phase B has no switch.** Its update path is the single implementation behind
`ApplyProviderToGridState`; turning it off is `git revert` of the B1 commit,
which constraint 1 guarantees is one commit. **Phase D has no switch**:
consumers migrate in D2–D3 and the old components are deleted in D3.

Phase A is the only switch that needs a dock restart. C and E are per-provider
settings that take effect on the next attach.

---

## 2. Measured baseline (the numbers each phase is judged against)

Production build unless stated. Details and methods: WORKLOG 19, 20, 21;
`docs/openfin-view-process-isolation-experiment.md`.

| Measurement | Value | Source |
|---|---|---|
| CSRM feed on the demo provider (20 000 rows, 372 columns, thin deltas, throttle 250 ms, conflate by key) | ~5 000 patched rows/s per view, 4.4 changed fields per row, 564 kB/s on the wire | WORKLOG 21 |
| AG Grid per-row update path, one view, 10 s | 189 490 `setTimeout` + 94 726 `clearTimeout`; 74 841 timers ran as separate tasks; batched flushes 867 ms | WORKLOG 21 |
| The two timers | `RenderStatusService` (ag-grid-react, autosize bean) + `FindService` `_debounce` (enterprise, CSRM only); both from `AllEnterpriseModule` | this revision, installed bundles |
| B0 shipped list (Find out), dev-served dock, isolation on, 12 docked CSRM views (4 visible + 8 hidden tabs), 10 s, per view | `setTimeout` 61 229–61 262 (from 189 490), `clearTimeout` 12–22 (from 94 726), timers run as tasks ≈ 61 240 (from 74 841); the one remaining bucket is `colAutosize.processResizeOperations` at 61 169 = one per updated row; 12 batch flushes | B0, 2026-09-13 |
| Same run, main thread per view | lag p50 0–0.3 ms / p95 1.7–8 ms / max 19–38 ms; visible views 118–119 fps; long tasks 0 per 10 s — WITH isolation, dev server; the no-isolation number is still owed | B0 |
| Same run, hidden docked tabs | `document.visibilityState === 'hidden'` on all 8 inactive tabs; 100 ms timers 80 of 80; 0 rAF frames; timer census identical to the visible views | B0 — C entry (b) met |
| Same run, renderer processes | 12 views → 12 PIDs, 444–505 MB working set each, 2–30 % CPU | B0 |
| Same run, CPU profile per view (`cdp-cpu-profile`, 250 µs sampling) | busy 1.05–1.81 s per 10 s (10–17 %), of which `(program)` 0.71–1.51 s (native: task dispatch for the 61 000 autosize timers, message deserialisation); `executeBatchUpdateRowData` inclusive 99–186 ms (from 867 ms); data client `handleMessage` 82–119 ms, `mergeThinPatches` self 66–106 ms; GC 5–136 ms; the autosize timers themselves ≤ 19 ms when they run | B0 |
| B1 (rendered-row apply), production preview, isolation on, 12 docked CSRM views (4 visible + 8 hidden tabs), per view per 10 s | `setTimeout` 22–46 (from 61 250 after B0 and 189 490 before), `clearTimeout` 0–5, timers run as tasks 19–38; `executeBatchUpdateRowData` 0 ms — no update transactions on the unsorted view — and `refreshCells` 0.6–20 ms; visible views busy 0.50–0.81 s (5–8 %), lag p50 0 / p95 0.5–1.4 / max 1.1–6.9 ms, 120 fps, 0 long tasks; AG Grid's `advanceAnimations` timers still fire on visible views (cells flash) | B1, 2026-09-13 |
| Same run, hidden tabs | busy 1.12–1.48 s (11–14 %): `mergeThinPatches` 320–567 ms against 31–33 ms on the visible views for the same feed, GC 43–297 ms, 2–3 long tasks of 71–102 ms, lag max 51–79 ms. Same code, same frames — the hidden renderer processes run slower per instruction (background priority / efficiency cores on this Apple-silicon rig). A B3 input, not a B1 cost | B1 |
| Six CSRM views docked in one renderer | lag 338 ms p50 / 737 ms p95, later 1.4–5.5 s; 4–5 fps; hidden tabs as busy as visible ones | WORKLOG 21 |
| Same six views, one renderer per view | lag 0 / 96–153 / 150–226 ms; 60 fps; 505–644 MB per view (~3.4 GB vs 2.9 GB shared) | experiment doc §4 |
| Data worker thread at the demo SSRM rate | ingest 35 % of the thread (58 ms p50 per batch, ~100 µs/row), tick flush 17 %; block reads queue 39 ms p50 / 980 ms p99 behind them, engine 7–17 ms | WORKLOG 19 |
| SSRM tick bytes per view after per-session trimming | 4.5 MB/s → 0.10 MB/s (95 % of upserts withheld) | WORKLOG 19 |
| Fling fill on the production dock, 400-row blocks | 543 ms (seven reads, three for passed-over ranges, two at a time) | WORKLOG 19 |
| Cold reload → rows, production dock, one SSRM blotter | 2.5 s, of which `platform-ready` 1.1 s and the first block 97 ms; the remaining ~1.4 s is unattributed | WORKLOG 19; D0 attributes it |
| Grid mount depth and persistence layers | unrecorded — D0 records fiber depth and the three loads (grid-level data, profiles, view customData) | D0 |
| Platform worker ports for 13 pages | 59 connected, 58 AppData listeners (dead listeners still receive every delta) | WORKLOG 18 |
| Dev vs production fling on the same app and feed | 1.3–1.7 s vs 0.19–0.25 s | WORKLOG 19 |

Every phase appends its before/after row here.

---

## 3. Phases

Each phase: Why · What · Entry · Out of scope · Exit · Verify · Off switch.

### G1 — Instruments and the size gate (one session, first)

**Why.** The probes that found this week's issues exist only as CDP snippets
in the WORKLOG dev-rig notes; nothing in the repo runs them
(`apps/scripts/ssrm-perf/` holds the SSRM harness; `apps/e2e-openfin/fixtures/cdp.ts`
is the only CDP helper). Every acceptance number below needs them.

**What.** In `apps/scripts/ssrm-perf/`, one script each, with a README row:
`cdp-timer-census.mjs` (wrap `setTimeout`/`clearTimeout` by callback source —
WORKLOG 21), `cdp-fiber-remount.mjs` (DevTools hook via
`Page.addScriptToEvaluateOnNewDocument`, ancestor-chain diff per commit —
WORKLOG 20), `cdp-process-map.mjs` (`fin.View.getProcessInfo` from the provider
page — WORKLOG 21), `cdp-mainthread-load.mjs` (event-loop lag, frame gaps, long
tasks per view — experiment doc §3 step 6), `cdp-hidden-liveness.mjs` (100 ms
interval per view **and `document.visibilityState`** — the C entry criterion),
`csrm-frame-counter.mjs`. The block/fling probe is `ssrm-validate.mjs` already.
Plus `scripts/check-file-size.mjs` → `npm run check:loc` (constraint 4), seeded
with the current over-ceiling census, wired into `lint:all`.

**Entry.** None. **Out of scope.** Any product code.
**Exit.** The census script reproduces WORKLOG 21's one-view numbers within
10 % on the production dock; `npm run check:loc` is green with its allowlist.
**Verify.** `node apps/scripts/ssrm-perf/cdp-timer-census.mjs` against the
dock; `npm run lint:all`.

### B0 — Explicit AG Grid module list, then the census (one session)

**Why.** Revision note 1. If the timer storm is a registration artefact, the
per-row cost that remains is the 867 ms of flush + listener work, and that
number decides whether B1 is a design rewrite or unnecessary.

**What.** Register the modules explicitly: `ensureAgGridModules` unpacks
`AllEnterpriseModule` / `AllCommunityModule` one level and registers every
member except an exclusion list (`platformAgGridModules()` in
`packages/react-grid/grid/src/widget/ensureAgGridModules.ts`). `Find` is
excluded — nothing in the repo uses it and its `FindService` debounce is one
of the two timers. The column-autosize module STAYS: ag-grid-react's
`RenderStatusService` timer is gated on it, but so are the column menu's
"Autosize This Column / All Columns" items (the `ColumnMenu` item factory
checks for the service), so dropping it is a feature change, not a
measurement. The provider editor's own `AllEnterpriseModule` registration
(`ensureProviderEditorAgGridModules.ts`) is replaced by the same call —
`ModuleRegistry` is global, so it would put Find back for every grid.
`agGridModules` stays a prop for consumers that need more. Then, on the
production dock, two census runs: (i) the shipped list; (ii) a throwaway local
build with `ColumnAutoSize` added to the exclusion — the zero-timer floor,
measured and not committed. Plus the six-blotter measurement WITHOUT
isolation (manifest key removed for the run) on (i).

**Entry.** G1. **Out of scope.** The apply path.
**Exit.** Census on one view, transactions unchanged: (i) `clearTimeout` ≈ 0
and `setTimeout` about half of 189 490 (the FindService pair gone; the
`RenderStatusService` timer remains); (ii) `setTimeout` < 5 000 and timers run
as tasks < 2 000 — the floor. Flush + listener time per 10 s and the
six-docked-view lag p95 on (i) recorded in §2. **Decision rule for B1:** B1–B3 proceed unless six
docked views without isolation reach lag p95 < 250 ms AND flush + listener
time ≤ 200 ms per 10 s on the shipped list (i) — in which case B1–B3 are
shelved and WORKLOG 21 records the number. If only (ii) meets it, the lever is
an upstream fix to `RenderStatusService` (one queued timer, not one per
event), which is a report to AG Grid, not a platform change. The expected
outcome is that B1 proceeds: the flush cost is independent of timers.
**Measured 2026-09-13, (i) on the dev-served dock with isolation on (12
views):** `clearTimeout` 94 726 → 12–22 and `setTimeout` 189 490 → ≈ 61 250 per
view per 10 s; every remaining timer is `RenderStatusService`'s
`processResizeOperations`, one per updated row. Hidden tabs do exactly the
same timer work as visible ones. The flush is measured: `executeBatchUpdateRowData` 99–186 ms per view
per 10 s, under B1's 200 ms line already; what the 61 000 autosize macrotasks
cost sits in `(program)`, 0.7–1.5 s per view per 10 s, and each view is busy
1.05–1.81 s per 10 s in total. **Decision (2026-09-13): B1 proceeds.** Six of
these views on one shared renderer thread would carry 6.3–10.9 s of busy time
per 10 s — saturation — so the no-isolation lag run cannot pass the rule; it
is still owed to §2 as confirmation (manifest key removed, dock restarted).
(ii) needs a throwaway build on a production preview, never under the
dev-served dock (constraint 6). Code: commit acd4b23.
**Verify.** `npx turbo test --filter=@wellsfargo-starui/grid`; `apps/e2e`
customizer smoke; no AG Grid error #200 in the console; the census script.
**Off switch.** None needed: a missing module is a visible error, and `modules`
restores any list.

### B1 — Rendered-row apply behind the port, no `force` (one session) — built 2026-09-13

**Why.** Rows are patched in place (WORKLOG 21), so node data is current
before the grid hears anything, yet every changed row still went through
`applyTransactionAsync` (`applyProviderToGrid.ts`) and AG Grid turned each
into a `rowNodeDataChanged` event, a row-controller refresh, and the listener
work of every service subscribed to it — 61 000 timer macrotasks per 10 s per
view after B0.

**What (as built).** Inside `createApplyProviderToGridState` — the one
implementation of `ApplyProviderToGridState`, constructed at
`useProviderDataWiring.ts` and `blotter/hooks/useBlotterDataConnection.ts` —
the update branch is `renderedRowUpdates.ts`:

1. adds still ride `applyTransactionAsync` (they change the row set);
2. every updated row's node is looked up (`getRenderedNodes` index, else
   `getRowNode`, O(1) under the client-side model); a delivered object that is
   not the node's (full-row providers) is synced onto it in place with the
   transaction's replace semantics (`syncRowInPlace`);
3. rows whose sort / filter / group / aggregated-value column changed value —
   detected per node against the key values seen after the previous tick
   (`api.getCellValue`, so value getters and calculated columns count; the
   first touch after a key-set change rides once and heals the snapshot) —
   still ride `applyTransactionAsync({ update })`. That is what AG Grid needs
   to re-sort / re-filter / re-aggregate along the changed path with
   `keepRenderedRows` and `keepEditingRows`; `refreshClientSideRowModel` (the
   first draft's throttled model refresh) recycles rows but has no changed
   path and no editing guard, so it was dropped. This is the rule
   `bindSsrmTicks` already applies for SSRM. Quick filter, pivot mode, the
   advanced filter and an external filter cannot be attributed to columns:
   while any is active every updated row is a transaction, as before;
4. every other updated row: rendered ones are refreshed in one
   `refreshCells({ rowNodes })` per `asyncTransactionWaitMillis` window (the
   grid's MAX UPDATES / SEC keeps its meaning), never `force` — AG Grid
   refreshes and flashes only cells whose value differs; all of them are
   handed to `RowChangeBus.noteRowsChanged` (new on the bus; counts as a flush
   for the frame's delta / full classification);
5. calculated columns subscribe to the bus instead of `rowDataUpdated`, which
   now fires only for a snapshot / add / remove (`grid:rowDataUpdated` in the
   event catalog says so); conditional styling and alerts were on the bus
   already;
6. the transaction update branch is gone. Without a `rowIdField` the grid
   cannot address nodes, so that legacy path keeps its plain update
   transaction.

**Entry.** B0's decision rule said proceed. **Out of scope.** Hidden views
(B3); SSRM (`bindSsrmTicks` keeps `applyServerSideTransactionAsync`);
attributing the toolbar-date external filter to its column (B2).
**Exit.** Unit tests: `renderedRowUpdates` (rendered-only refresh, no
`force`, bus feed, key detection incl. first touch and key-set change,
quick / pivot / external / advanced → transactions, full-row sync, clear /
dispose), the apply state (no transaction for value updates, sorted key
change rides one, dispose), both seams, the bus (`noteRowsChanged` is a
delta), calculated columns on the bus — green. Dock census after a rebuild:
`setTimeout` < 5 000 per 10 s on the default view; flush + refresh
(`executeBatchUpdateRowData` + `refreshCells`) < 200 ms per 10 s; flashing
only on changed cells (e2e).
**Measured 2026-09-13, production preview, isolation on (12 views):** exit
met — `setTimeout` 22–46 per 10 s per view (189 490 before this plan),
flush 0 ms + `refreshCells` ≤ 20 ms (867 ms before), visible views 5–8 %
busy at 120 fps with no long tasks. Still owed: a look at a visible blotter
to confirm only changed cells flash; the six-view no-isolation lag
(manifest key removed) — from the visible views' 0.5–0.8 s busy per 10 s,
four visible + two hidden on one thread is about 4 s per 10 s, well inside
the 250 ms p95 line. Code: commit 24abcb1.
**Verify.** `npx vitest run` in `packages/react-grid` and `packages/core`;
`cdp-timer-census.mjs` and `cdp-cpu-profile.mjs` on the dock.
**Off switch.** `git revert` of the B1 commit.

### B2 — Sorted / grouped / filtered cost, and the external filter (one session)

**Why.** B1's transaction rule means a blotter sorted or grouped on a ticking
column pays the old per-row cost for exactly those rows, and a blotter with
the toolbar-date row exclusion active pays it for every row, because an
external filter cannot be attributed to a column.

**What.**
1. Measure on the production dock, census + `cdp-cpu-profile` each: the
   default view; sorted by a ticking column; grouped by a static column with
   an aggregated ticking value (two group levels); filtered on a static
   column; the toolbar-date exclusion on. Record all five in §2.
2. Let the external filter declare its columns: the toolbar-date module
   registers the column it excludes on (a platform resource the apply path
   can read), and `readKeyColumns` treats it as a key column instead of
   `all`. Test: exclusion on, non-date update → in place.
3. Grouped aggregates over a ticking value already use AG Grid's changed
   path through the transaction rows; nothing further unless (1) says so.

**Entry.** B1. **Out of scope.** Hidden views. **Exit.** The five numbers in
§2; the external-filter attribution with its test.
**Verify.** The two probes; `npx vitest run` in `packages/react-grid`.
**Off switch.** `git revert` of the B2 commit.

### B3 — Hidden views without pausing the feed, and the six-blotter number (one session)

**Why.** Two of six docked views were hidden tabs and burned as much as the
visible ones. Hidden blotters must keep alerting
(`useProviderDataWiring.ts:196-202`), so the DOM work is what stops, not the feed.

**What.** In the apply implementation: while `document.hidden`, skip
`refreshCells` and the throttled model refresh, still call
`noteRowsChanged`; on `visibilitychange` to visible, one `refreshCells` of the
rendered nodes plus one model refresh. Then the acceptance run on the
production dock: six CSRM blotters docked as four panes + two tabs, WITHOUT
isolation.

**Entry.** B2. G1's `cdp-hidden-liveness.mjs` recorded
`document.visibilityState === 'hidden'` on every inactive docked tab
(2026-09-13, 8 of 12 views), so the hidden branch has its signal.
B1's production run adds a question B3 answers first: hidden tabs spent
10× longer in `mergeThinPatches` than visible ones for the same frames
(320–567 vs 31–33 ms per 10 s) — measure whether that is background
scheduling of the hidden renderer process (`cdp-cpu-profile` on a hidden
tab before and after making it visible), because if it is, no DOM saving
changes it and the number to quote for hidden cost is the visible one.
**Out of scope.** Hub-side pausing (C).
**Exit.** Six docked views without isolation: lag p95 < 250 ms (from 737 ms+);
hidden tabs' long tasks per 10 s and the census recorded in §2; alerts fire on
a hidden tab (e2e: rule on a hidden view, assertion on its toast/bus output).
**Verify.** `cdp-mainthread-load.mjs`, `cdp-hidden-liveness.mjs`, the census;
`apps/e2e-openfin` hidden-alert spec.
**Off switch.** `git revert` of this commit.

### C — Pause fan-out to hidden subscribers (opt-in only; decided 2026-09-13)

**The fork.** `useProviderDataWiring.ts:196-202`: the earlier hidden-pause +
refresh-on-visible was removed deliberately — "hidden/minimized blotters must
stay current (window-local alerting, instant correctness on restore)". Pausing
at the hub means a hidden blotter's alerts and relative-change rules see no
transitions until it is shown; a cache replay restores end state only.

| Option | Hidden-blotter CPU | Hidden-blotter alerting |
|---|---|---|
| 1. Hub pause (`pauseHiddenSubscribers`) | ≈ 0 while hidden | stops; rules evaluate only after the replay on visibility |
| 2. B3 only (no DOM work, bus fed) | deserialisation + in-place merge + bus — the merge is ~5 % of the thread (WORKLOG 21); the rest is measured in B3 | continues |

**Decision (owner, 2026-09-13): Option 2.** B3 is the platform's hidden
behaviour; the feed is never paused by default. Option 1 is built only as an
opt-in per-provider setting for blotters that carry no window-local rules, and
only if a hidden view still costs more than 1.0 s of JavaScript per 10 s on the
target box after B3 (WORKLOG 21 measured 9–14 s on the shared thread).

**Entry.** (a) B3's hidden number on the target box exceeds the threshold
above; (b) G1's probe shows
`document.visibilityState === 'hidden'` for an inactive docked tab — otherwise
`meta.hidden` (`SharedWorkerDataServicesClient.ts:969`) never flips and this
phase has no trigger. **(b) met 2026-09-13:** `cdp-hidden-liveness` on the
dock read `hidden` on all 8 inactive docked tabs, timers 80 of 80.

**What.** In `ReplayScheduler` / the delta broadcast
(`SharedWorkerDataServicesHub.ts:115` already exposes `isHidden(subId)`), skip
ports whose subscription is hidden and mark them stale; on the client's
visibility ping (`SharedWorkerDataServicesClient.ts:983-991`) replay from the
cache for that subscriber (the attach replay: `sub-init` + full replay for thin
subscriptions, `delta` with `replace` otherwise). SSRM: keep a `dirty` flag per
hidden session and skip its `rowDelta` ticks; on visibility send one tick with
`reset: true`, which `bindSsrmTicks.ts:303` already routes to a fast refresh of
loaded blocks — the count check (`bindSsrmTicks.ts:231`) only refreshes on a
count mismatch and would leave loaded rows stale.

**Exit.** Hub tests: a hidden subscriber receives no deltas, exactly one replay
on visibility, cache view consistent afterwards; SSRM: one reset tick on
visibility. Hidden views' long tasks ≈ 0 per 10 s; `chunksPosted` drops by the
hidden share; a tab switched to visible shows current data within one replay
(< 300 ms for 20 000 rows, `hub-introspect.fanout`).
**Verify.** `npx turbo test --filter=@wellsfargo-starui/data`; the hidden
liveness probe. **Off switch.** `pauseHiddenSubscribers: false`.

### A — Per-view renderer isolation: decide on target hardware (no code)

**Status.** Merged (558c789): manifest switch on, seed unpinned, override
strips persisted tags while the switch is on, tests for both branches.
OpenFin's caveat stands: "no guarantee that a different affinity value will
create a different process".

**Entry.** G1's `cdp-process-map.mjs` and `cdp-mainthread-load.mjs`; a
target-class machine.
**Exit (acceptance).** One PID per docked view with the switch on; lag p95
< 150 ms per view under the demo feed; total renderer memory for the standard
layout within the machine's budget (here +15 % over shared); hidden tabs keep
firing 100 ms timers (≥ 70 of 80). Re-run after B3: isolation buys cores, B
buys less work; the decision is whether the memory is worth what B leaves.
**Off switch.** Remove `viewProcessAffinityStrategy` (or set `"same"`),
`npm run build` in star-demo, restart the dock.

### D0 — Where the cold reload goes (one session)

**Why.** The mount-stack rewrite was motivated by unrecorded numbers and a bug
that is already fixed (WORKLOG 20). The recorded number is 2.5 s cold reload →
rows with `platform-ready` at 1.1 s and the first block at 97 ms; ~1.4 s is
unattributed.

**What.** Production dock, one blotter, cold reload, CDP profile from
navigation to first rows, attributed across: widget mount (fiber commits from
`cdp-fiber-remount.mjs`, depth recorded), the three gated loads (grid-level
data, profiles, view customData — name each hook), AG Grid init (module
registration, licence check), first render. Record the table in §2.

**Entry.** G1. **Out of scope.** Any code change.
**Exit.** The §2 row is filled. **Decision rule:** D1–D3 proceed only if the
mount stack (fiber commits + gated-load waiting, not network) accounts for
≥ 300 ms of the 1.4 s; otherwise D is shelved with the number in WORKLOG.
**Verify.** The profile JSON in `apps/scripts/ssrm-perf/out/`.

### D1 — `BlotterHost` (one session)

**What.** One component in `packages/react-grid/widgets-react/src/blotter/`
with an explicit state machine in its own file (`blotterHostMachine.ts`):
identity → storage → provider selection → provider config → grid. It renders
exactly one `MarketsGrid`, only when the config it needs is present, never a
placeholder a later phase replaces; the three persistence loads resolve behind
one gate. `MarketsGrid` and the customizer are unchanged. The container's
provider-selection, persistence and admin-action tests move over unchanged in
intent; WORKLOG 20's "stub grid mounts exactly once" test moves here.

**Entry.** D0's decision rule. **Out of scope.** Consumers (D2, D3).
**Exit.** Unit tests green; both files under the ceiling. **Verify.**
`npx turbo test --filter=@wellsfargo-starui/grid`; `npm run check:loc`.

### D2 — Migrate star-demo (one session)

**What.** star-demo's three container/hosted-grid call sites move to
`BlotterHost`. E2E under `apps/e2e-openfin`: one AG Grid licence banner per
blotter in the production build.
**Entry.** D1. **Exit.** star-demo e2e green; cold reload → rows on the
production dock ≤ 2.0 s (from 2.5 s) and the D0 table re-recorded.
**Verify.** `apps/e2e-openfin`; `cdp-fiber-remount.mjs`.

### D3 — Migrate the remaining consumers and delete the old components (one session)

**What.** `stomp-marketsgrid-minimal` (five call sites) and `stomp-ssrm-minimal`
(two) move to `BlotterHost`; `HostedMarketsGrid`, `MarketsGridContainer` and the
hooks `BlotterHost` absorbed are deleted; `MarketsGridContainer.tsx` leaves the
`check:loc` allowlist; `docs/current-features.md` updated.
**Entry.** D2. **Exit.** No references remain; `apps/e2e` green; the allowlist
is shorter. **Verify.** `grep -r MarketsGridContainer packages apps/source`
returns nothing; full gate.

### E2 — Ingest serialisation cost: measure both sides before changing the format (one session; engine repo only if the numbers say so)

**Why.** Ingest is 35 % of the data worker's thread at the demo rate (58 ms
p50 per batch, ~100 µs/row: `flattenRows` + `JSON.stringify` +
`apply_message_json`, WORKLOG 19) and block reads queue up to 980 ms p99 behind
it — but that time is not split by stage, and the first draft proposed columnar
ingest as if the saving were free. It is not:

- **worker-side encode** is a per-row, per-column walk like `flattenRows` plus
  typed-array writes. `columnarCodec` carries only numbers as raw `f64` and
  booleans as bitmaps; string and nested columns are still `JSON.stringify`'d
  per column (`runtime/wire/columnarCodec.ts:7-26`). A 372-column blotter row's
  type mix decides how much of it is "zero parse" at all;
- **engine-side decode**: hub-rust's storage layout is not recorded in the
  handoff §3. If it stores rows, a columnar frame is transposed back into rows
  inside WASM — the same worker thread paying a second time;
- **any columnar payload that reaches a window** must be reassembled into row
  objects for AG Grid on the main thread — the worst place to spend. Ingest is
  worker → engine on one thread and never touches a window, so E2 does not add
  that cost; the paths that would are the existing opt-in CSRM
  `wireFormat: 'columnar'` (the client decodes, `docs/hub-fanout-optimizations.md`
  §9) and a columnar SSRM block payload (engine plan §6.5), which this plan does
  not introduce.

**What (this session, no engine change).**
1. Per-stage timing in `SsrmWasmPlane.ingest` (`SsrmWasmPlane.ts:358`) reported
   through `hub-introspect.ssrm`: `flattenRows`, `JSON.stringify`,
   `apply_message_json` (the engine's parse + apply; split further only if
   rangrez exposes its own counters).
2. A worker-side micro-benchmark in `apps/scripts/ssrm-perf/` on a captured
   demo batch (3 500 rows × 372 columns, the real type mix): (a) today's JSON
   path; (b) COL1 encode + decode + row rebuild in JS as an upper bound for the
   engine's transpose; (c) numbers as typed arrays with strings left as one
   JSON column. Every candidate is counted on both sides.
3. The demo row's type mix (numeric / boolean / string / nested column counts)
   recorded in §2.

**Entry.** G1. **Out of scope.** Any wire or engine change.
**Exit.** The per-stage split, the type mix and the benchmark table in §2.
**Decision rule.** A rangrez entry point (T8) is requested only if a candidate's
end-to-end cost (encode + decode/transpose + apply) is < 50 % of today's
per-row cost AND the split shows serialisation, not the engine's apply, as the
majority. Otherwise E2 closes with its numbers and the ingest lever is either
the engine's apply path (a rangrez item) or feed-side width (`projectFields`,
which is config). If the format does ship later: `ingestFormat: 'columnar'`,
off = `'json'`, acceptance `hub-introspect.ssrm` at the default feed, 12 views:
ingest share < 15 %, block read queue p99 < 100 ms.
**Verify.** `ssrm-multiwindow.mjs` `[hubSsrm]`; the benchmark script.

### E3 — Column-level SSRM tick patches (engine repo first; one session here)

**What.** `poll_shared_delta` returns full rows; the engine adds a
changed-column mask per upsert (rangrez T9; not yet on the engine plan —
T1–T7 and C1–C2 have all landed); `SsrmSessionWindows.trim`
(`SsrmSessionWindows.ts:81-95`) forwards patches for sessions that advertise
`tickPatches`. **Client cost is a merge, not a reassembly:** `bindSsrmTicks`
assigns the patch's fields onto the node's existing row (`Object.assign`, as
`mergeThinPatches` does for CSRM) before the transaction — a transaction with a
partial object would drop the row's other fields.
**Entry.** Engine support vendored into `packages/data/host-data/vendor/dshub/`;
B3 done. **Exit.** Tick flush p50 < 10 ms with 13 sessions (from 24 ms); tick
bytes per view drop by the changed-column ratio; a patched row keeps every
unpatched field (test). **Off switch.** A session that does not advertise
`tickPatches` keeps full rows.

### F1 — Platform-port liveness (one session)

**Why.** 13 pages, 59 connected ports, 58 AppData listeners (WORKLOG 18).
`PlatformServicesHost` adds a port on every request
(`PlatformServicesHost.ts:87, 105`) and removes it only on `port-close`; the
data hub sweeps subscribers (`SharedWorkerDataServicesHub.ts:417-433`,
`SubscriberRegistry.collectStale`, `SUBSCRIBER_SWEEP_INTERVAL_MS`).

**What.** The client sends a `ping` on the platform port at the data heartbeat
cadence, carrying the same `meta.hidden`
(`SharedWorkerDataServicesClient.ts:969`); the host keeps `lastSeen` per port
and sweeps ports silent past the hidden-grace window, dropping their
`HubAppDataService` listeners with them.
**Exit.** `connectedPorts` equals live pages after open / close / reload cycles
(13 → 13); tests: silent port evicted, live port kept, hidden port kept within
grace. **Verify.** `npx turbo test --filter=@wellsfargo-starui/data`;
`hub-introspect` on the dock.

### F2 — Fail fast on a dead worker at first connect (one session)

**Why.** WORKLOG 18: a page that fetched a truncated worker asset sat with no
marks and an empty body. `bootstrapConfigOnce` (`ensurePlatformReady.ts`)
awaits `configManager.init({ mode: 'attach' })` unbounded alongside
`awaitServicesWorker`, whose 20 s deadline (line 153) only warns; the
`error` listener at `createDataServicesWorker.ts:117` only logs.

**What.** Reproduce first (serve a truncated worker asset to a fresh profile,
console captured) and confirm which await blocks. Then: the same deadline on
`init`; the worker `error` event rejects the pending readiness; on failure a
visible state (`starui:platform-failed` mark + a status the host renders) and
a retry with backoff. **Exit.** The reproduction fails visibly within the
deadline; tests for the deadline and error paths. **Verify.**
`npx turbo test --filter=@wellsfargo-starui/data`; the reproduction.

### F3 — Worker build identity (one session)

**What is already true.** The worker URL is `new URL(..., import.meta.url)`
(`createDataServicesWorker.ts:111`); Vite content-hashes it in production, so a
new build spawns a new SharedWorker and a same-build reload joining the
running worker is correct. The dev-server staleness is constraint 6.

**What.** (1) A build id (Vite `define`) reported in `hub-ready` and
`hub-introspect`, shown by the inspector and logged by the client on attach.
(2) The rolling-reload window — old and new platform-services workers alive,
both ConfigManager writers on one IndexedDB — checked once with two previews;
the ConfigManager's cross-context change notifier is expected to make it
benign; if not, a Web Lock (the `freezeExemptionLock.ts` pattern) serialises
writers. **Exit.** Introspect shows the build id; the rolling-reload result is
recorded in WORKLOG 18 (and item 18 closed if nothing remains).

### F4 — Hook state audit (one session)

**What.** The `forId` stamp from `useDataProviderConfig`
(`packages/react-core/host-data-react/src/runtime/index.tsx:186-285`) applied to
`useDataProvidersList` (line 308) and `useResolvedCfg` (line 354); a render-log
test for each: no render reports "loaded" for an id it has not loaded.
**Verify.** `npx turbo test --filter=@wellsfargo-starui/react`.

### G2 — Name and fix the slow tests (one session)

**What.** Run the grid suite three times with the verbose reporter, record
every test over 4 s and any stall; fix each by isolation or a scoped timeout
that states its reason. `docs/COVERAGE_PLAN.md:327` (fake-timer hang to the 5 s
limit) and `:370` (one-in-three flake) are the two already named; include them.
**Verify.** `npx vitest run --reporter=verbose` in `packages/react-grid` ×3.

### G3 — Measurement rule in CLAUDE.md (with G2's commit)

Scrolling and rendering numbers are taken on production builds only; the dev
server is 7–9× slower on that path and is not evidence.

---

## 4. Order and dependencies

1. **G1** — instruments and the size gate; everything else is unverifiable without them.
2. **B0** — the mechanism test; its number decides B1.
3. **B1 → B2 → B3** — the apply path, in that order.
4. **C** — only if B3's hidden number on the target box exceeds its threshold,
   and only after G1's visibility check; opt-in per provider.
5. **A decision** — target hardware, after B3 (so it measures what B leaves).
6. **F1–F4** — independent of the above; any time after G1.
7. **D0**, then **D1 → D2 → D3** only if D0's rule says so.
8. **E2** measurement any time after G1; its format change (if any) and **E3**
   engine repo first, here after B3.
9. **G2 + G3** — any time after G1.

## 5. Traceability

| Source | Finding | Phase |
|---|---|---|
| WORKLOG 18 | dead platform ports / AppData listeners | F1 |
| WORKLOG 18 | hung windows on a truncated worker asset | F2 |
| WORKLOG 18 | dev rebuild under a dev-served platform | constraint 6, F3 |
| WORKLOG 19 | full-width tick rows | E3 |
| WORKLOG 19 | ingest share of the worker thread | E2 |
| WORKLOG 19 | dev vs production numbers | G3 |
| WORKLOG 19 | `ssrm-blocks-dropped`, scroll-aware tick hold, `autoStart` on `stomp-ssrm1` | out of scope (stated above) |
| WORKLOG 20 | placeholder grid — fixed | D0 (only depth remains) |
| WORKLOG 20 | hook returned a stale view for one render | F4 |
| WORKLOG 21 | per-row timer storm | B0, B1 |
| WORKLOG 21 | hidden tabs as busy as visible | B3, C |
| WORKLOG 21 | docked views share one renderer | A (done) |
| Handoff §6 | REST re-probe, fonts, SAB fan-out, customizer-open timing, soak | out of scope (stated above) |
| Review 2026-09-13 | findings 1–10 | revision note |

## 6. What this plan does not promise

- Chromium's process management (A) is outside our control; the switch and the
  measurement are what we own.
- B0's decision rule may shelve B1–B3; the plan says so rather than presuming
  the rewrite.
- Hub-side pausing (C) is opt-in and conditional; the platform's hidden
  behaviour is B3 (owner decision 2026-09-13).
- D0's decision rule may shelve D1–D3.
- E2's format change and E3 depend on the Rust engine accepting new entry
  points; only E2's measurement session runs before those are vendored, and
  E2 may close with no format change at all.
