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
    `viewProcessAffinityStrategy: "different"`). Measured on the target on
    2026-09-13 (§A table, §2 runs 1–6); the off switch needed fix 1fe0ec6 to
    clear the uuid affinities the runtime persists into saved layouts.
    Recommendation recorded in §A: keep; the owner closes it.
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

| **Windows native, runs 1–5 (2026-09-13, 20:27 UTC): Windows 11, 32 GB, OpenFin 43.142.101.2, production preview on :5175 (hashed worker asset), isolation on, 12 docked CSRM views (4 visible + 8 hidden tabs)** | | §7.2 |
| Run 1 — renderer processes | 13 distinct PIDs for 13 views (12 blotters + find-in-page); working set 314–462 MB, private 257–406 MB per blotter view; per-process CPU 4.9–33.8 % | `cdp-process-map` |
| Run 2 — hidden liveness | every view 80 of 80 ticks, max gap 120–155 ms; all 8 inactive tabs report `visibilityState === 'hidden'`, `fin` present; visible views 480–483 rAF frames in 8 s | `cdp-hidden-liveness` |
| Run 3 — main thread per view | lag p50 0 / p95 4.9–13.5 / max 17.8–49.6 ms; visible views 60 fps (gap p50 16.7, p95 17.1–17.5 ms); long tasks 0 on all 12 | `cdp-mainthread-load` — **A pass line met on target (p95 < 150 ms)** |
| Run 4 — timer census per view per 10 s | `setTimeout` 35–72 (Mac 22–46; 189 490 before this plan), `clearTimeout` 0–3, ran as tasks 34–69; the largest bucket is the 200 ms refresh window (17–18 per 10 s) | `cdp-timer-census` — **B1 pass line met on target** |
| Run 5 — CPU profile per view per 10 s | busy 1.32–2.65 s (12–25 %), `(program)` 0.76–2.13 s, GC 23–253 ms; `executeBatchUpdateRowData` 0 ms, `refreshCells` 4.9–19.5 ms; `mergeThinPatches` visible views 269–333 ms, hidden tabs 472–564 ms (1.5–2×, not the Mac's 10×) | `cdp-cpu-profile` — **B1 flush + refresh < 200 ms met on target**; B3 input: the hidden-tab gap is small on Windows |
| Run 6, first attempt (manifest key removed, star-demo rebuilt, dock relaunched, the saved 12-view layout restored) | **Not an isolation-off measurement**: 13 distinct PIDs for 13 views again, the same per-view affinity uuids as run 1. The saved layout carried 36 runtime-assigned uuid `processAffinity` values (one per view; `view.getOptions()` shows a fresh uuid per view under `"different"`, `getSnapshot()` persists it) and the no-strategy cleanup only knew `view-iso-*`. The numbers it produced are a second isolation-on sample: lag p95 8.9–13.5 ms, 60 fps visible, 0 long tasks, 35–72 `setTimeout` per view per 10 s | `cdp-process-map` — fix: `stripLegacyViewIsolationAffinity.ts` treats bare-uuid affinities as isolation artefacts when the strategy is off (5 tests). Run 6 is re-run with the fix built in; Phase A cannot be judged before that |
| **Run 6, valid (2026-09-13, 21:25 UTC): isolation OFF, fix 1fe0ec6 built in, packages + star-demo rebuilt, the same saved layout (uuid affinities inside) restored** | | §7.2 |
| Run 6.1 — renderer processes | 2 distinct PIDs for 13 views: all 12 blotters in one renderer (private 3 346 MB, working set 3 372 MB) plus find-in-page. Isolation on, same views: 12 processes, private 250–406 MB (sum 3 837 MB, +15 %), working set 304–462 MB (sum 4 505 MB, +34 %) | `cdp-process-map` — **the switch works**: the persisted uuids were neutralised by the cleanup |
| Run 6.3 — main thread per view | lag p50 0–0.3 / p95 197–221 / max 262–275 ms; visible views 39–40 fps (gap p95 102–110 ms); long tasks 0 on all 12. Isolation on: p95 4.9–13.5 ms, 60 fps | `cdp-mainthread-load` — **run-6 pass line met (p95 < 250 ms)**; A's win on target: p95 ~220 → ≤ 14 ms, 40 → 60 fps |
| Run 6.4 — timer census per view per 10 s | `setTimeout` 38–74, `clearTimeout` 0–3 (isolation on: 35–72) | `cdp-timer-census` — B1 holds with or without isolation |
| **B2 step 1 (2026-09-13, 22:0x UTC): one CSRM view (20 000 rows, 372 columns, 15 ticking) in its own window on the production dock, isolation on, B1 code — census + CPU profile per state, 10 s each** | | §B2 |
| default view | `setTimeout` 71 (18 × 200 ms refresh window, 18 × bus flush); busy 22 %; `executeBatchUpdateRowData` 0 ms, `refreshCells` 15 ms | `b2-measure` (scratchpad driver over `cdp-timer-census` / `cdp-cpu-profile`) |
| sorted by `pnl` (ticking) | `setTimeout` 23 387 — 23 237 of them `processResizeOperations` at 0 ms; busy 42 %; `executeBatchUpdateRowData` 2 522 ms, `refreshCells` 4 ms | B1's transaction rule, as predicted: every `pnl` tick moves a row |
| grouped `desk` › `trader`, `sum(marketValue)`, `sum(pnl)` (collapsed, 8 group rows displayed) | `setTimeout` 23 545 — 23 398 `processResizeOperations`; busy 20 %; `executeBatchUpdateRowData` 795 ms, `refreshCells` 0 | aggregated ticking values ride transactions; cheaper than sorted because nothing rendered moves |
| filtered on `desk` (set filter, 5 000 rows displayed) | `setTimeout` ≈ 3 300 — 3 208 `processResizeOperations`; busy 27 %; `executeBatchUpdateRowData` 1 002 ms, `refreshCells` 17 ms | static key column: the transactions are the first-touch snapshot healing of 20 000 rows still draining |
| toolbar-date exclusion `[currency] == "AUD"` (17 142 rows displayed), external filter unattributed | `setTimeout` 44 689 — 44 539 `processResizeOperations`; busy 38 %; `executeBatchUpdateRowData` 1 579 ms, `refreshCells` 0 | **the B2 target**: every updated row is a transaction while the exclusion is on |
| **B2 step 2 built, same view reopened on the rebuilt bundle (22:1x UTC)** | | |
| toolbar-date exclusion `[currency] == "AUD"`, module declares `currency` | `setTimeout` 2 117 (1 916 `processResizeOperations` — the first-touch snapshot healing still draining, as in the filtered state); busy 25 %; `executeBatchUpdateRowData` 64 ms, `refreshCells` 22 ms | **B2 exit met**: 44 689 → 2 117 timers, 1 579 → 64 ms of transaction work; updates to other columns stay in place |
| default view (control) | `setTimeout` 78; busy 22 %; `executeBatchUpdateRowData` 0, `refreshCells` 16 ms | unchanged |
| sorted by `pnl` (control) | `setTimeout` 44 723 (44 539 `processResizeOperations`); busy 39 %; `executeBatchUpdateRowData` 1 854 ms | unchanged by design (23 387 in the first run: the count follows how many `pnl` ticks land in the window) |
| **D0 (2026-09-14, 00:0x UTC): cold reload, navigation → first rows, production dock with 12 SSRM views open, isolation on, platform warm; `cdp-cold-reload.mjs` (bootstrap marks + React commits + DOM milestones + CPU by chunk per segment); CSRM = 20 000 rows × 372 columns, 4 reloads; SSRM = 2 reloads** | CSRM | SSRM |
| HTML → DOMContentLoaded (fetch + parse/compile + module eval of the critical chunks) | 655–1 051 ms; busy 458–880 (`(program)` 300–550, `index.js` 70–160), idle 134–240 | 779–1 065 ms; busy 569–903 |
| DOMContentLoaded → `starui:platform-ready` (the five bootstrap marks; the platform is warm) | 33–90 ms | 36–69 ms |
| **platform-ready → grid created (licence banner) — the mount stack** | **617–717 ms, busy 614–714, idle 3–12; 326–557 React commits before the grid; top chunks `ag-grid-community` 183–296, `index.js` 128–136, native 103–183, `ag-grid-enterprise` ≈ 60** | **627–634 ms, busy 626–633, idle 0–1; 456–472 commits; `ag-grid-community` 166–236, native 126–144, `index.js` 104, enterprise 99** |
| grid created → AG Grid root mounted (commit N, fiber depth 67) | 55–95 ms | 66 ms |
| root mounted → first header cell (AG Grid column / header init) | 492–793 ms, all busy (372 columns) | 316–340 ms |
| first header → first rows | 1 607–3 354 ms: busy 787–2 690 (`ag-grid-community` 190–950, native 850–920 = snapshot deserialisation + client-side model, `index.js` 270–340 ingest), idle 445–820 (waiting for the 20 000-row snapshot) | 1 011–1 070 ms: busy 543–889, idle 122–527 (first block from the engine) |
| **first rows on screen** | **4.29–5.47 s** | **2.87–3.26 s** |
| Attribution of `processResizeOperations` | ag-grid-react's autosize bean (`queueResizeOperationsForTick` in `ag-grid-react-*.js`) listens to `rowNodeDataChanged` / `cellValueChanged` / `rowDataUpdated` / expansion events and schedules `setTimeout(() => colAutosize.processResizeOperations(), 0)` on every one — one macrotask per transaction-updated row, no coalescing. Its own work is nil (the operation queue is empty); the cost in the sorted / grouped states is `executeBatchUpdateRowData` (the re-sort / re-aggregate per flush window), 0.8–2.5 s per 10 s | B2 step 3: nothing further in B2 — that is the price of keeping sort order and aggregates live, paid only for rows whose key changed |

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

### B2 — Sorted / grouped / filtered cost, and the external filter (one session) — built 2026-09-13

**Why.** B1's transaction rule means a blotter sorted or grouped on a ticking
column pays the old per-row cost for exactly those rows, and a blotter with
the toolbar-date row exclusion active pays it for every row, because an
external filter cannot be attributed to a column.

**What (as built).**
1. Measured on the production dock (one CSRM view, 20 000 rows, 372 columns,
   isolation on), census + `cdp-cpu-profile` each — all five in §2: default
   71 timers per 10 s; sorted by a ticking column 23–45 k; grouped two
   levels with ticking aggregates 23.5 k; filtered on a static column ≈ 3.3 k
   (a draining first-touch tail); the exclusion on 44.7 k.
2. The external filter declares its columns. `GridPlatform.externalFilters`
   (`ExternalFilterColumnRegistry`, interface `ExternalFilterColumns`, on
   every module's `PlatformHandle`) holds `declare(owner, cols | null)` /
   `columns()`; the toolbar-date module's `activateRowExclusion` declares
   `collectColumnRefs(parse(expression))` on activation and on every
   expression change, withdraws on an empty expression and on dispose; the
   container hands `handle.platform.externalFilters` to the apply path next
   to the bus (`getExternalFilterColumns` seam) and `readKeyColumns` adds the
   declared columns to the key set while `isExternalFilterPresent()` is true
   — with nothing declared it is still `all`. Tests: registry, collector,
   platform handle, module (declare / re-declare / withdraw), apply path
   (exclusion on: non-declared update in place, declared-column change rides
   a transaction).
3. Sorted / grouped: nothing further. The tens of thousands of timers are
   ag-grid-react's autosize flush scheduled once per `rowNodeDataChanged`
   (attribution in §2); the cost that matters is the re-sort / re-aggregate
   per flush window (`executeBatchUpdateRowData` 0.8–2.5 s per 10 s), paid
   only for rows whose key changed — the price of a live sort order.

**Entry.** B1. **Out of scope.** Hidden views. **Exit.** The five numbers in
§2; the external-filter attribution with its test.
**Measured 2026-09-13, same view on the rebuilt bundle:** exclusion on
44 689 → 2 117 timers per 10 s, `executeBatchUpdateRowData` 1 579 → 64 ms,
rendered rows refreshed in place (`refreshCells` 22 ms); default and sorted
unchanged. Exit met.
**Verify.** The two probes; `npx vitest run` in `packages/react-grid` and
`packages/core`. `npm run check:loc` now passes on Windows too — the ratchet
compared backslash paths with its POSIX baseline keys and reported every
baseline file as new (fixed in the same commit).
**Off switch.** `git revert` of the B2 commit.

### B3 — Hidden views without pausing the feed, and the six-blotter number (one session) — skipped (owner, 2026-09-13)

**Status.** Not built. The owner skipped B3 after the Windows target rows in
§2: hidden docked tabs cost 1.5–2× the visible ones in the same merge
(`mergeThinPatches` 472–564 vs 269–333 ms per 10 s), not the Mac's 10×;
they keep 80 of 80 timer ticks with lag p95 ≤ 13.5 ms; with isolation on
their DOM work runs on their own core; and the six-view no-isolation number
this phase owed is already recorded by run 6 (p95 197–221 ms, under the
250 ms line). What is NOT done: the hidden branch of the apply path
(skip `refreshCells` while `document.hidden`, one refresh on
`visibilitychange`), the hidden-tab census / long-task rows, and the
hidden-alert e2e. Reopen B3 if a target layout ever runs docked views
without isolation, or if hidden-tab busy time on the target exceeds what
the owner will pay (run 5: 1.8–2.0 s per 10 s per hidden tab, each on its
own renderer process).

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
above — B3 was skipped (owner, 2026-09-13), so the number available is §2
run 5 on the isolated dock: hidden tabs busy 1.8–2.0 s per 10 s, above the
1.0 s line, but each on its own renderer process rather than the shared
thread the line was written for; whether that is worth an opt-in that
silences the hidden blotter's alerting is the owner's call, not triggered
by this plan; (b) G1's probe shows
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
`npm run build` in star-demo, restart the dock. The restore-time cleanup
must also neutralise the uuid affinities the runtime wrote into every saved
layout while the switch was on (fix 1fe0ec6, found by run 6 — without it the
switch did nothing for restored layouts). Confirm OFF with run 1: one
renderer PID for the blotters.

**Measured on the target (Windows 11, 32 GB, 43.142.101.2, 12 docked CSRM
views, §2 runs 1–6, 2026-09-13):**

| Exit criterion | Isolation on | Isolation off | Met |
|---|---|---|---|
| One PID per docked view | 13 for 13 | 2 for 13 (all blotters in one) | yes |
| Lag p95 per view < 150 ms | 4.9–13.5 ms, 60 fps | 197–221 ms, 39–40 fps | yes |
| Renderer memory within budget | 12 × 250–406 MB private, sum 3 837 MB | one process, 3 346 MB private | +15 % private (+491 MB), +34 % working set — within a 32 GB box |
| Hidden tabs ≥ 70 of 80 ticks | 80 of 80, all report `hidden` | not re-measured | yes |

The B0/B1 apply-path work is what made the OFF numbers survivable (p95
~220 ms against 737 ms before B0/B1 on the Mac); isolation is what turns
40 fps into 60 fps and ~220 ms into ≤ 14 ms on the visible views.
**Recommendation: keep the switch on** for the docked layout; the cost is
half a gigabyte of private memory across 12 views. The exit rule above said
re-run after B3; B3 was skipped (owner, 2026-09-13), so these rows are the
final ones and A closes on them.

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
**Exit.** The §2 row is filled. **Decision rule (revised by the owner,
2026-09-13):** D1–D3 proceed on maintainability grounds whatever the profile
says — the layering already cost two fixes this week (WORKLOG 20's placeholder
mount was a stale render in one layer feeding another; B2 had to plumb one
value through the container, two wiring hooks and the two constructors of
the apply state), and the container is 1 058 lines with a function over the
ceiling that nothing else in the plan removes. D0 is therefore the BASELINE
for D2's exit (cold reload ≤ 2.0 s needs a measured before) and the
attribution of the other ~1.4 s, not a gate. The original rule (proceed only
if the mount stack accounts for ≥ 300 ms) is kept here for the record.
**Landing order (explicit):** D1 adds `BlotterHost` next to the existing
exports, D2 switches call sites, D3 deletes — at every commit the old path
still works and the container's tests still run. D is the riskiest phase in
the plan; it runs on its own branch off the B2 branch so the review stays
readable.
**Measured 2026-09-14 (§2, `cdp-cold-reload.mjs`, branch
`feature/blotter-host`):** the mount stack — platform-ready to the grid
being created — is 617–717 ms on the CSRM blotter and 627–634 ms on the
SSRM one, and it is compute, not waiting: 3–12 ms idle, 326–557 React
commits before the grid mounts (fiber depth 67), the busy time split
between AG Grid code that runs before any grid exists (module registration
on first use, the column-definition pipeline: 180–300 ms), the app's own
hooks and renders (`index.js` 105–135 ms) and native work (100–180 ms).
The original ≥ 300 ms rule would have said proceed as well. The rest of the
reload is outside D: 0.7–1.1 s of script fetch + parse before
DOMContentLoaded, 0.3–0.8 s of AG Grid column/header init, and the data
itself — 1.0–1.1 s to the first SSRM block, 1.6–3.4 s to the 20 000-row CSRM
snapshot on screen (about half of it idle, waiting for the worker). The
bootstrap marks are trivial here (33–90 ms) because the platform is warm;
the 1.1 s `platform-ready` figure quoted above was a cold platform.
**D2's exit, re-based on this baseline:** platform-ready → grid created
≤ 300 ms with ≤ 50 commits before the grid, and first rows 0.4 s earlier
than these rows on the same layout; the absolute "≤ 2.0 s" written before
the baseline was an SSRM number on a different day and is superseded.
**Verify.** `node cdp-cold-reload.mjs --url <blotter> --runs 2`
(`--target <id>` when several views share a URL); the JSON in
`apps/scripts/ssrm-perf/out/`.

### D1 — `BlotterHost` (one session) — built 2026-09-14

**What.** One component in `packages/react-grid/widgets-react/src/blotter/`
with an explicit state machine in its own file (`blotterHostMachine.ts`):
identity → storage → provider selection → provider config → grid. It renders
exactly one `MarketsGrid`, only when the config it needs is present, never a
placeholder a later phase replaces; the three persistence loads resolve behind
one gate. `MarketsGrid` and the customizer are unchanged. The container's
provider-selection, persistence and admin-action tests move over unchanged in
intent; WORKLOG 20's "stub grid mounts exactly once" test moves here.

**As built.** `blotterHostMachine.ts` is pure: `resolveBlotterHostStep(facts)`
returns `identity | storage | selection | config | grid(data, key) |
grid(empty, reason)`, and a chosen provider whose row is neither present nor
failed is `config` whatever a stale `loading` flag says — WORKLOG 20's
combination is unrepresentable. `BlotterHost.tsx` is the outer host (the
hosted-view features, the data-plane provider, the full-bleed layout; it
mounts the body only once identity and storage are settled) plus the body,
which gathers the remaining facts and renders what the step says: one loading
note, or one `MarketsGrid` keyed `csrm|ssrm::provider::keyColumn`, or the
empty grid. The orchestration is split into hooks under `blotter/host/` so
every function stays under the 80-line ceiling: view features (identity, tab
title, linking, document title, legacy cleanup), grid-level persistence and
caption, toolbar date, active provider, data feed and its actions, admin
actions and the two Custom Settings host APIs. The wiring modules it reuses
(`useGridLevelPersistence`, `useProviderDataWiring`, `useSsrmProviderWiring`,
`buildColumnDefs`, the dialogs, the overlay) stay in the container folder
until D3 moves or deletes them. Props are `HostedMarketsGridProps` plus an
optional explicit `storage` factory (wins over the ConfigService-backed one),
so D2 is a rename at the call sites and the container's tests could move with
their intent intact. Tests moved: loading gate (WORKLOG 20), SSRM (no
throwaway grid, auto-pick, stable ssrm config, refresh/reload routing), admin
actions and host APIs, toolbar historical mode and save-and-switch, provider
stale state, caption persistence (the OpenFin rename now arrives the way it
does in production: `customData.savedTitle` + `options-changed`); plus the
hosted gates (connecting note while storage is pending, explicit storage,
document title, data-plane wrapper) and the machine's own table.
`MarketsGridContainer` and `HostedMarketsGrid` are untouched and still
exported — D2 switches the call sites, D3 deletes.

**Entry.** D0's decision rule. **Out of scope.** Consumers (D2, D3).
**Exit.** Unit tests green; both files under the ceiling. **Met:** 52 tests in
`widgets-react/src/blotter`, `check:loc` green with every new function under
80 lines, react-grid typecheck green. **Verify.**
`npx turbo test --filter=@wellsfargo-starui/grid`; `npm run check:loc`.

### D2 — Migrate star-demo (one session) — in progress 2026-09-14

**What.** star-demo's three container/hosted-grid call sites move to
`BlotterHost`. E2E under `apps/e2e-openfin`: one AG Grid licence banner per
blotter in the production build.

**As built so far.** Both route views (`BlottersMarketsGrid`,
`BlottersSsrmMarketsGrid`) render `BlotterHost` from
`@wellsfargo-starui/grid/widgets` with their props unchanged; the third call
site was the test double in `staruiVitestMocks.ts`, now a `BlotterHost` stub
(`data-testid="blotter-host"`) and the view / main tests read it. New spec
`apps/e2e-openfin/specs/blotter-single-grid.openfin.spec.ts`: installs a
console counter before a reload and asserts one `.ag-root-wrapper` and one
"AG Grid Enterprise License" banner (two under the Vite dev build, where
StrictMode mounts effects twice). star-demo typecheck and production build
green. Two pre-existing star-demo test facts, unrelated to D2 and reproduced
at HEAD: `platformBootstrap.test.ts › initConfigBootstrap resolves json
config in browser` fails, and the Provider prefetch tests take 3.4 s of their
5 s timeout alone (`import()` of every tool-window chunk), so they trip when
the suite runs in parallel — the `@wellsfargo-starui/data` test mock also
lacks `warmPlatform`, which surfaces as an unhandled error there.
**Owed:** the e2e run (the harness boots its own OpenFin runtime on the same
CDP port as the dock, so it needs a dock-free box) and the D0 table
re-recorded on the production dock — the dock was closed when D2 reached that
step.
**Entry.** D1. **Exit.** star-demo e2e green; on the production dock the
D0 table re-recorded with platform-ready → grid created ≤ 300 ms and
≤ 50 commits before the grid, first rows 0.4 s earlier than D0's rows on
the same layout (the earlier "≤ 2.0 s from 2.5 s" predates the baseline).
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
3. **B1 → B2 → B3** — the apply path, in that order. *B1 and B2 built; B3
   skipped by the owner (2026-09-13).*
4. **C** — only if B3's hidden number on the target box exceeds its threshold,
   and only after G1's visibility check; opt-in per provider. *With B3
   skipped, see §C entry (a): owner's call.*
5. **A decision** — target hardware, after B3 (so it measures what B leaves).
   *Measured; closes on the §A rows.*
6. **F1–F4** — independent of the above; any time after G1.
7. **D0**, then **D1 → D2 → D3** only if D0's rule says so.
8. **E2** measurement any time after G1; its format change (if any) and **E3**
   engine repo first, here after B2.
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

---

## 7. Windows target — verification loop and next steps (added 2026-09-13)

Every number in §2 so far is from the M4 Max dev rig (36 GB, 10 performance
+ 4 efficiency cores). Constraint 5 says a phase is not done without a
target-box number; this is the loop for the Windows 11 / 32 GB box. The Mac
rows stay as lower bounds.

### 7.1 Set up once

1. Node 22 or newer — the probes use the global `WebSocket` (the repo's
   `engines` floor of 20 is for the packages, not the probes).
2. `git checkout feature/grid-apply-and-mount-refactor`, then at the root
   `npm install` and `npm run build:packages` (fresh `packages/*/dist`).
3. `cd apps && npm install` — `postinstall` creates the platform junction
   (in-repo apps need no `STARUI_PLATFORM`).
4. Broker: `cd apps/source/stomp-view-server && npm run dev` (port 8081).
5. Production dock, in `apps/source/star-demo`:
   `set STARUI_SKIP_ENSURE_BUILD=1 && npm run build`, then
   `npx vite preview --port 5175 --strictPort`, then in a second shell
   `npm run client` (OpenFin's RVM fetches runtime 43.142.104.2 on first
   launch, so the box needs the RVM cache or internet once). CDP is on
   `localhost:9091` from the manifest's `--remote-debugging-port`.
6. Confirm production bytes before trusting anything: the shared workers in
   `http://localhost:9091/json/list` must be under `/assets/…-<hash>.mjs`,
   never `/@fs/…`.
7. Open the WORKLOG 21 layout: six CSRM blotters docked as four panes + two
   tabs in ONE Browser window. The twelve-view layout used on the Mac is a
   fine second run, but the six-view one is what the baselines compare to.

### 7.2 The runs (from `apps/scripts/ssrm-perf`; PowerShell needs double quotes around `--url`)

| # | Command | Records | Pass line |
|---|---|---|---|
| 1 | `node cdp-process-map.mjs` | PIDs, memory per view (isolation state) | A: one PID per view; memory within the box's budget |
| 2 | `node cdp-hidden-liveness.mjs --url "localhost:5175/?instanceId" --all --seconds 8` | hidden tabs alive and reporting `hidden` | A: ≥ 70 of 80 ticks; C/B3: `visibilityState` = `hidden` |
| 3 | `node cdp-mainthread-load.mjs --url "localhost:5175/?instanceId" --all --seconds 10` | lag p50/p95/max, fps, long tasks per view | A (isolation on): p95 < 150 ms; B3 (isolation off): p95 < 250 ms |
| 4 | `node cdp-timer-census.mjs --url "localhost:5175/?instanceId" --all --seconds 10` | timers per view | B1: `setTimeout` < 5 000, tasks < 2 000 (Mac: 22–46) |
| 5 | `node cdp-cpu-profile.mjs --url "localhost:5175/?instanceId" --all --seconds 10` | busy %, flush + refresh, `mergeThinPatches` hidden vs visible | B1: flush + `refreshCells` < 200 ms (Mac: ≤ 20); B3: is the hidden-tab 10× gap there on Windows too? |
| 6 | isolation OFF — delete `viewProcessAffinityStrategy` and its `$comment-…` key from `apps/source/star-demo/public/platform/manifest.fin.json`, rebuild `packages/` (the cleanup lives in `@wellsfargo-starui/openfin`; safe under the bundled preview) then star-demo, restart the dock, restore the same saved layout; **run 1 first and require ONE renderer PID** — the saved layout carries a runtime uuid `processAffinity` per view and only the platform cleanup switches them off (first attempt 2026-09-13 came up isolated, see §2); if it is still isolated, strip every `processAffinity` from the snapshot and re-apply it; then 3, 4 | the owed six-view no-isolation lag | B0/B1 confirmation: p95 < 250 ms |
| 7 | by eye on a visible blotter | only cells whose value changed flash; sort by a ticking column → rows re-order (that view's census rises: expected, B1's transaction rule); group by a static column with an aggregated ticking value → aggregates move | B1 exit; B2 inputs |

Every probe writes its JSON to `apps/scripts/ssrm-perf/out/` (gitignored);
paste the console tables into §2 as "Windows native" rows beside the Mac
rows and attach the JSON to the branch's pull request.

### 7.3 Reading the results

- Mac numbers are the lower bound. Expect Windows timer counts to match
  (they count events, not time) and every time number to be larger.
- With isolation, Task Manager shows one process per view; without, one
  process near 100 % of one core is the shared-thread signature.
- Intel 12th-generation and later CPUs have efficiency cores and Windows 11
  schedules background processes onto them, so the Mac's hidden-tab result
  (`mergeThinPatches` 320–567 ms hidden vs 31–33 ms visible) may reproduce.
  If it does, B3's saving is bounded by scheduling, not by DOM work, and
  the visible number is the one to quote for hidden cost.
- Demo pages block `DOMContentLoaded` on Google Fonts (handoff §6.4). On a
  box without internet the first paint can wait 10 s or more; that is the
  fonts, not the platform.
- Reloading a page never restarts the SharedWorkers; quit the dock and run
  `npm run client` again. Never rebuild `packages/*/dist` under a dev-served
  dock (constraint 6) — the production preview is immune, it is bundled.

### 7.4 What to do next, in order

1. Record the Windows rows in §2 (runs 1–7). Decide Phase A on them: keep
   the manifest key if the lag win is worth the per-view memory on the
   target, otherwise delete it; either way close A in this plan.
   *Status 2026-09-13: runs 1–6 recorded (run 7 by eye still owed). The
   numbers for the decision are in §A; recommendation: keep.*
2. **B2** — the five sorted / grouped / filtered measurements and the
   toolbar-date external filter declaring its column. *Done 2026-09-13
   (§B2, §2).*
3. **B3** — hidden views, starting with the scheduling question above.
   *Skipped (owner, 2026-09-13): the Windows rows answered the scheduling
   question (1.5–2×, not 10×) and run 6 supplied the no-isolation number;
   see §B3 for what stays unbuilt.*
4. Housekeeping: `check:design-system-deps` is red on eight `apps/source`
   packages (pre-existing); decide "skip `apps/`" or declare the dependency,
   and open the pull request for the branch. *Done 2026-09-13: the check
   scanned the pre-reorganisation package roots (none exist) plus `apps/`,
   so it verified no library package and only ever flagged the demo apps,
   which declare no `@wellsfargo-starui/*` dependency at all (they consume
   the platform through the postinstall symlink). It now scans the
   `packages/` buckets as npm units (member sources count towards their
   bucket, build shims skipped) and leaves `apps/` out by design; the one
   real finding — `@wellsfargo-starui/core` injects CSS over `--ds-*`
   tokens without declaring design-system — is declared. Pull request
   opened against `feature/worker-hub-config-refactor` (the stack's parent,
   which has no PR of its own yet).*
5. Then **D0** (profile-first) and **F1–F4** in any order.
