# Refactor plan — grid data-apply, mount stack, hidden views, worker ingest, resilience (2026-09-13)

Written from the measurements of 2026-09-12/13 (WORKLOG 14–21). Every phase
below carries the number that motivates it, the number that proves it, and a
single switch that turns it off. The rule of the week applies throughout:
**rewrite a subsystem when its measured problem is its design; fix in place
when the problem is a mechanism.** Two subsystems qualify for a rewrite (the
grid data-apply layer, the mount stack); everything else is in-place work
behind existing interfaces.

Not in scope: the data hub, the SSRM WASM plane, the customizer modules,
persistence, the OpenFin platform layer. They are the "components that already
work" — recently measured, instrumented, and fixed where needed.

---

## 0. Configuration contract: one switch per behaviour, no code reverts

Every phase that changes runtime behaviour ships behind exactly one setting.
Turning a phase off is an edit to that setting, a rebuild where the setting is
compiled in, and a restart where it is read at start. Never a code revert in
several files. The switches:

| Behaviour | Switch | Where it is read | Off = |
|---|---|---|---|
| Per-view renderer isolation (Phase A) | `platform.viewProcessAffinityStrategy` in `apps/source/star-demo/public/platform/manifest.fin.json` | OpenFin itself at app start, and once by the platform override (`workspacePersistence.ts`) | key absent or `"same"` → OpenFin's default grouping; the override takes its legacy path; the removed seed pins stay removed (a view without a tag shares its app's renderer, which is what the pin produced) |
| Grid data-apply mode (Phase B) | `MarketsGridProps.dataApply: 'transactions' \| 'rendered'` (default `'transactions'` until Phase B's numbers land, then `'rendered'`) | `MarketsGridContainer` → the apply layer | `'transactions'` = today's `applyTransactionAsync` path, untouched |
| Hidden-subscriber pause (Phase C) | provider config `pauseHiddenSubscribers?: boolean` (default off) with a hub-wide default in `PlatformBootstrapConfig` | data hub fan-out | off = fan out to every subscriber as today |
| Worker ingest path (Phase E) | provider config `wireFormat` already selects `json \| columnar` for fan-out; ingest adds `ingestFormat: 'json' \| 'columnar'` (default `json`) | `SsrmWasmPlane.ingest` / CSRM ingest | `json` = today |
| Worker asset versioning (Phase F3) | none needed — additive; a mismatch only logs and respawns | `ensureDataServicesHub` | n/a |

Phase A is the only switch that needs a dock restart. Phases B, C, E are
per-provider or per-grid settings that take effect on the next attach / mount.

---

## 1. Measured baseline (the numbers each phase is judged against)

Production build unless stated. Details and methods: WORKLOG 19, 20, 21;
`docs/openfin-view-process-isolation-experiment.md`.

| Measurement | Value |
|---|---|
| CSRM feed on the demo provider (20 000 rows, 372 columns, thin deltas, throttle 250 ms, conflate by key) | ~5 000 patched rows/s per view, 4.4 changed fields per row, 564 kB/s on the wire |
| AG Grid per-row update path, one view, 10 s | 189 490 `setTimeout` + 94 726 `clearTimeout` (two timers per updated row via `rowNodeDataChanged`: ag-grid-react `RenderStatusService`, an enterprise debounce); 74 841 timers ran as separate tasks; batched flushes 867 ms |
| Six CSRM views docked in one renderer | lag 338 ms p50 / 737 ms p95, later 1.4–5.5 s; 4–5 fps; hidden tabs as busy as visible ones |
| Same six views, one renderer per view (branch `feature/openfin-view-process-isolation`) | lag 0 / 96–153 / 150–226 ms; 60 fps; 505–644 MB per view (~3.4 GB vs 2.9 GB shared) |
| Data worker thread at the demo SSRM rate | ingest 35–60 % of the thread (58 ms p50 per batch, ~100 µs/row), tick flush 16–17 %; block reads queue 39 ms p50 / 980 ms p99 behind them, engine 7–17 ms |
| SSRM tick bytes per view after per-session trimming | 4.3 MB/s → 0.10 MB/s (95 % of upserts withheld) |
| Fling fill on the production dock, 400-row blocks | 543 ms (seven reads, three for passed-over ranges, two at a time) |
| Grid mount depth | 57 fibers from root to the AG Grid element; three persistence layers (grid-level data, profiles, view customData) |
| Platform worker ports for 13 pages | 59 connected, 58 AppData listeners (dead listeners still receive every delta) |
| Dev vs production fling on the same app and feed | 1.3–1.7 s vs 0.19–0.25 s |

---

## 2. Phases

### Phase A — Adopt or shelve per-view renderer isolation (decision, not code)

**Why.** Docked blotters share one renderer by default; isolation removed the
shared-thread lag entirely (§1). OpenFin's caveat stands: "no guarantee that a
different affinity value will create a different process, under the hood
Chromium can enforce its own process management".

**What.** Nothing further in code. The branch is complete: manifest switch,
seed unpinned, override strips persisted tags while the switch is on, tests for
both branches. Decide with numbers from the target hardware, not this box.

**Acceptance (run on a target-class machine, `cdp-process-map` + `cdp-mainthread-load` from Phase G).**
- one PID per docked view with the switch on; lag p95 < 150 ms per view under the demo feed;
- total renderer memory for the standard layout within the machine's budget (here +15 % over shared);
- hidden tabs keep firing 100 ms timers (≥ 70 of 80) — the earlier revert's failure mode stays absent.

**Off switch.** Remove `viewProcessAffinityStrategy` (or set `"same"`), `npm run build` in star-demo, restart the dock. No code changes. Merge the branch either way: with the key absent the code is inert.

### Phase B — Rewrite the grid data-apply layer (subsystem rewrite, strangler)

**Why.** Rows are now patched in place (WORKLOG 21), so AG Grid's node data is
current before the grid hears anything, yet the container still hands every
changed row to `applyTransactionAsync`, and AG Grid turns each into a
`rowNodeDataChanged` event with two timers. Two timers per row × 5 000 rows/s
is the per-view cost that isolation only spreads across cores.

**What.** A new module behind the container's existing interface (same props,
same `onDelta` entry point), selected by `dataApply: 'rendered'`:

1. **Rendered rows**: for changed rows whose node is currently rendered,
   `api.refreshCells({ rowNodes, force: true })` — with flash when the grid's
   flash setting is on. ~20 rows a frame instead of ~3 500.
2. **Model-affecting changes**: if a changed field is a sort, filter, group or
   aggregation column (the same rule `bindSsrmTicks` applies for SSRM),
   schedule one throttled `refreshClientSideRowModel` (`'filter'` /
   `'sort'` / `'aggregate'` as needed) — never per row.
3. **Adds and removes**: still transactions (they change the row set).
4. **Row-change bus**: hand the changed nodes to `RowChangeBus` directly
   (a new `noteRowsChanged(nodes)` entry) so alerts and conditional styling keep
   seeing exactly the rows that changed without a transaction flush.
5. **Hidden views**: no DOM work at all while `document.hidden`; on
   visibility, one full `refreshCells` of the rendered rows plus one model
   refresh.
6. **Unchanged contract**: `getRowId`, selection, editing/paste (which write
   through the engine and come back as patches), profile persistence.

**Tests.** Unit tests for the classifier (rendered / model-affecting / add /
remove), for hidden-view deferral, and for the bus feed; the container's
existing tests keep passing with `dataApply: 'transactions'`; a stub-grid test
asserting the number of `applyTransactionAsync` calls per frame drops to the
add/remove count.

**Acceptance (production build, one view, `cdp-timer-census` 10 s).**
- `setTimeout` calls < 5 000 (from 189 490); timers run as tasks < 2 000;
- flush + refresh time per 10 s < 200 ms (from 867 ms) with the same feed;
- flashing behaves as before on visible rows; sort/filter positions update within the throttle window;
- six docked views WITHOUT isolation: lag p95 < 250 ms (from 737 ms+).

**Off switch.** `dataApply: 'transactions'` on the grid. The old path is not
deleted until the new one has held for a full release.

### Phase C — Pause fan-out to hidden subscribers (in place)

**Why.** Two of six docked views were hidden tabs and burned as much as the
visible ones (9–14 s of JavaScript per 10 s each). The hub already knows:
every subscription carries `meta.hidden`.

**What.** In the data hub's fan-out (`ReplayScheduler` / delta broadcast):
skip ports whose subscription is hidden and mark them stale; on the client's
visibility ping flipping to visible, replay from the cache for that subscriber
(the attach replay already exists: `sub-init` + full replay for thin
subscriptions, `delta` with `replace` otherwise). SSRM: the per-session tick
trimming already keeps hidden sessions cheap; skip `rowDelta` ticks for hidden
sessions and let the grid's count check re-sync on visibility.

**Tests.** Hub tests: a hidden subscriber receives no deltas, receives exactly
one replay on visibility, and its cache view is consistent afterwards.

**Acceptance.** Hidden views' long tasks ≈ 0 per 10 s; hub fan-out `chunksPosted` drops by the hidden share; a tab switched to visible shows current data within one replay (< 300 ms for 20 000 rows, measured with the ReplayScheduler's `hub-introspect.fanout`).

**Off switch.** `pauseHiddenSubscribers: false` (default until measured).

### Phase D — Collapse the mount stack (subsystem rewrite, strangler)

**Why.** 57 fibers from root to the grid; hosted wrapper → container → grid →
host → surface, each with its own loading gates; the placeholder-grid branch
produced a throwaway AG Grid on every load (WORKLOG 20). Three persistence
layers resolve at different times.

**What.** One `BlotterHost` component with explicit, ordered phases and one
state machine: identity → storage → provider selection → provider config →
grid. It renders exactly one grid, only when the config it needs is present,
and never a placeholder that a later phase replaces. `MarketsGrid` and the
customizer stay as they are; `HostedMarketsGrid` and `MarketsGridContainer`
become thin adapters over `BlotterHost` and are removed when star-demo and the
lab apps have migrated.

**Tests.** The fiber-level "one grid per load" check becomes an e2e assertion
(count AG Grid licence banners = 1 per blotter in a production build); the
container's provider-selection, persistence and admin-action tests move to
`BlotterHost` unchanged in intent.

**Acceptance.** Depth to the grid ≤ 25 fibers; one AgGridReact instance per
load; cold reload → rows on the production dock ≤ 2.0 s (from 2.5 s).

**Off switch.** The adapters keep the old components' names and props; an app
opts in by importing `BlotterHost`; nothing changes for apps that don't.

### Phase E — Worker ingest cost (in place, engine boundary)

**Why.** Ingest is 35–60 % of the data worker's thread at the demo rate
(flatten + `JSON.stringify` + WASM JSON parse + apply, ~100 µs/row); SSRM block
reads queue up to 980 ms p99 behind it.

**What.**
1. Conflate a batch by key before the engine when the provider conflates (the
   hub currently conflates for CSRM fan-out but hands the engine every row).
2. A columnar ingest path (`ingestFormat: 'columnar'`) using the existing
   `columnarCodec` frames end-to-end into `apply_message_json`'s sibling entry
   point — needs the engine (Rust) to accept the frame; scope it with the
   engine owners.
3. SSRM tick rows are full width; add column-level patches (the CSRM
   `delta-patch` shape) to the tick so the remaining bytes shrink by the
   changed-column ratio.

**Acceptance (`hub-introspect.ssrm`, default feed, 12 views).** Ingest share of
the worker thread < 15 %; block read queue p99 < 100 ms; tick flush p50 < 10 ms.

**Off switch.** `ingestFormat: 'json'`; tick patches negotiated per session
(a session that does not advertise `tickPatches` keeps full rows).

### Phase F — Resilience (in place)

1. **Platform-port liveness.** Per-port ping on the platform port and a sweep
   in both hosts for ports silent past the hidden-grace window, mirroring the
   data hub's subscriber sweep. Acceptance: `connectedPorts` equals live pages
   after open/close/reload cycles (13 pages → 13, not 59).
2. **Fail fast on a dead worker at first connect.** `ensureConfigReady` /
   `ensurePlatformReady` attach a worker `error` handler and a bounded
   first-message timeout; on failure surface a visible state and retry with
   backoff instead of hanging without marks (WORKLOG 18).
3. **Worker asset versioning.** Stamp the worker URL with the build hash and
   have the client compare the worker's reported build id on attach; on
   mismatch log loudly and force a respawn path (the SharedWorker must be
   closed by its last client — document the sequence). Kills the "reload
   joined the old worker" and "dev server pinned a stale bundle" classes.
4. **Hook state audit.** Apply the `forId` stamp pattern from
   `useDataProviderConfig` to `useDataProvidersList` and `useResolvedCfg`; add
   a render-log test to each (no render reports "loaded" for an id it has not
   loaded).

### Phase G — Tooling and gate (in place)

1. Move the probes that found this week's issues into
   `apps/scripts/ssrm-perf/` with a README: timer census, fiber remount diff,
   process map, main-thread load, hidden liveness, block/fling probe, CSRM
   frame counter. They are the acceptance instruments for every phase above.
2. Gate flakiness: the two grid tests that time out at 5 s under load get a
   longer timeout or isolation; investigate the one grid-suite stall.
3. Measurement rule, written into CLAUDE.md: scrolling and rendering numbers
   are taken on production builds only; the dev server is 7–9× slower on
   that path and is not evidence.

---

## 3. Order and dependencies

1. **G1** first (a day): the instruments make every later claim checkable.
2. **B** (the apply layer) — largest per-view win, independent of the OpenFin decision, benefits single windows too.
3. **C** (hidden pause) — small, independent, compounds with B.
4. **A** decision — measured on target hardware with G's probes; no code.
5. **F1–F4** — independent of the above; can run alongside.
6. **D** (mount stack) — after B, so the new host is written against the new apply layer, not the old one.
7. **E** — engine-boundary work; scope with the engine owners after B and C have shown what per-view cost remains.

## 4. Discipline (binding, from the worker-split handoff)

- One phase per commit, conventional prefix, `Co-Authored-By` trailer; full gate green before commit; ≤ 800 lines per file, ≤ 80 per function.
- Before/after numbers for every phase, from the production build, recorded in the plan's §1 table and WORKLOG.
- Every behaviour change behind its single switch from §0; the old path stays until the new one has held for a release.
- No dist rebuilds under a dev-served OpenFin platform; restart workers by quitting the dock (`npm run client`) or `self.close()` over CDP; verify served bytes before trusting a worker-side measurement (WORKLOG 19 dev-rig notes).

## 5. What this plan does not promise

- Chromium's process management (Phase A) is outside our control; the switch and the measurement are what we own.
- Phase E's columnar ingest depends on the Rust engine accepting a new entry point; until then item 1 (pre-engine conflation) is the only ingest gain.
- Phase D changes component names for consumers that migrate; the adapters keep old consumers working but do not make them faster.
