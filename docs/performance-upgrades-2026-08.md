# Performance fixes & platform upgrades — August 2026 campaign

**Branch:** `feature/llm_bot`
**Trigger:** streaming blotters felt "very very sluggish and janky" under live
updates (20k rows, high-rate STOMP feeds), degraded further with summary
panels and panel drag/resize, and eventually crashed a browser-hosted
instance with *"Aw, Snap! — Out of Memory"*.
**Outcome:** every root cause was measured before it was fixed; the user-felt
verdict after the batch-granularity fix was "performance is much better."

This is the consolidated record. Deep-dives it links to:
[`hidden-window-oom.md`](./hidden-window-oom.md) (the crash),
[`blotter-performance-roadmap.md`](./blotter-performance-roadmap.md)
(reference anchors + open follow-ups).

---

## 1. Method (why the findings can be trusted)

Everything below was diagnosed with live measurement, not code reading alone:

- **Playwright/Chromium harnesses** measuring long tasks (PerformanceObserver),
  frame cadence (rAF deltas), and a 60-second held-ArrowDown "scroll
  endurance" test — the scenario the sluggishness reports described.
- **CDP CPU profiles** of both the page main thread and — via a raw
  WebSocket to the browser's debug port — the **data-services SharedWorker**
  itself, including `setTimeout` fidelity probes *inside* the worker.
- **The grid API spy** (added during the campaign, §5.1) counting every
  `GridApi` call and every AG Grid event, which conclusively separated
  "layers above the grid misbehaving" from "data pipeline misbehaving".
- **Machine-drift controls**: identical runs interleaved with a reference
  app, because ambient load on the dev machine shifted results up to 4×
  between measurement windows. (The reference app — a sibling AG Grid
  project — was later converted to server-side row model by its owner and
  is retired as a baseline.)

Two measurement gotchas worth remembering permanently:

1. **Playwright/CDP launch Chromium with background throttling disabled**
   (`--disable-background-timer-throttling`,
   `--disable-backgrounding-occluded-windows`,
   `--disable-renderer-backgrounding`). Hidden-window pathologies are
   *invisible to test automation*; only a real, human-driven browser
   reproduces them.
2. A point-in-time CPU sample can catch Defender/AV spikes; only
   interleaved runs with a control are comparable.

---

## 2. Platform upgrades

### 2.1 AG Grid 35.1.0 → 36.1.0 (commit `bd6b97a`)

Scope: `ag-grid-community` / `ag-grid-enterprise` / `ag-grid-react` moved to
exact `36.1.0` across all three declaring packages (`core`, `design-system`,
`react-grid`, peers to `^36.1.0`) and all six apps.

- **Zero breaks**: 14/14 typecheck+build tasks, every package suite
  (core 966, openfin 487, grid 2 536, react 628) and every app suite
  (star-demo 557, minimal 25, lab 116, dataprovider-editor 43,
  design-system 203, basic 72, stomp-view-server 87) green with no code
  changes beyond the item below.
- **Feature re-enabled**: `groupHideColumnsUntilExpanded` is now emitted by
  general-settings — 35.1.0 rejected the option (state was
  tracked-but-suppressed); 36.1.0 declares it, so the settings-panel toggle
  is live again.
- **Measured benefit** (machine-drift-controlled): ~13–18% less main-thread
  long-task time under passive 20k-row streaming. **Keyboard-scroll
  endurance was unchanged** — the AG 35 `getVScrollPosition` forced-layout
  hotspot survives in 36 (profiled at 18.9% self-time either way), so the
  upgrade is worthwhile but was not the scroll fix.

### 2.2 OpenFin stack 43.101.2 / 23.0.20 → 43.104.2 / 23.2.25 (commit `1861ff6`)

- `@openfin/core` → **43.104.2** everywhere (root override, packages/openfin,
  apps root, star-demo, node-adapter in star-demo + e2e-openfin), matching
  exactly what `@openfin/workspace(-platform)@23.2.25` peer on and what
  their transitive `@openfin/notifications@2.14.4` depends on — `npm ls`
  shows every path deduping to one core version in both install roots.
- star-demo manifest `runtime.version` → **43.142.104.2**, the build HERE
  shipped in lockstep with workspace 23.2.25 (2026-08-13).
- Context: the previous pins were 5 runtime patches and many workspace
  patches behind; patches published months into an old line (23.0.21/22)
  are backported fixes for exactly what was running. LSEG publicly runs
  ahead of the old pins within the same majors.
- CLAUDE.md's override paragraph was rewritten — it described a `43.101.4`
  pin no file actually had.

---

## 3. The streaming-performance root causes (in discovery order)

### 3.1 Dock re-render coupling & summary refresh (commit `87cd1c0`)

Symptoms: adding summary panels worsened streaming; drag/resize of panels
was extremely sluggish; the customizer dialog took seconds to open.

- The dock layout tree hosting the live grid re-rendered on every widget
  row-data refresh because object-rest-spread minted fresh props each
  render. Fixed by the memoized `DockShell` + explicitly-enumerated
  `useMemo` for surface props: a row refresh now updates only the
  widget-content React context, never the dock/grid tree.
- The summary recompute was a **debounce**, which never settles under
  continuous streaming (then dumps one giant catch-up burst). Replaced with
  a **throttle** (≤1 recompute per 750ms, with a trailing run).
- Zero-widget gate: a summary-enabled blotter with no widgets was doing a
  full 20k-row `forEachNode` read + React state set every 750ms for nothing.
  Now: no subscription, no timers, no reads at zero widgets.
- `useBlotterVisibilityGuard`: ports a verified fix for the documented
  AG Grid + dock failure mode — a tab-hidden panel collapses to zero width,
  AG Grid can't measure a viewport and renders **every** column (~15–16×
  cells, measured in a sibling app). Capture-phase `pointerdown` +
  `flushSync` unmounts the grid *before* the dock collapses it;
  `ResizeObserver` remounts; column/filter/scroll state round-trips. An
  always-on `[blotter-dock] tab click→painted Nms` console line is the
  canary (the guard dies silently if a dock upgrade renames `.dock-tab`).

### 3.2 Hidden-window out-of-memory crash (commits `44a386e`, docs `a0a0b63`)

Full write-up: [`hidden-window-oom.md`](./hidden-window-oom.md).
One-paragraph version: Chromium throttles **timers** in hidden windows
toward 1/min but never throttles **MessagePort delivery**, so a hidden
streaming blotter queued every decoded batch via `applyTransactionAsync`
faster than AG Grid's throttled flush timer could drain — heap profiling
showed the queued decoded rows dominating the heap (442MB of 522MB) until
the renderer died. Fix: while `document.hidden`, every applied tick is
followed by a synchronous `flushAsyncTransactions()` — arrival-driven, so
throttling can't starve it; zero cost while visible; the
hidden-blotters-stay-current trading policy preserved verbatim.
Reproduced live in a real minimized Chrome; invisible to automation (§1).

### 3.3 Layers above AG Grid: formally exonerated (commit `9c608fe` tooling)

The strong suspicion was "something is reloading/refreshing the grid."
The grid API spy proved otherwise: in 30s of 4k-updates/sec streaming the
entire platform made **only** `applyTransactionAsync` calls (168×, 4ms
total) — zero `setGridOption`, zero `refreshCells`/`redrawRows`, zero
filter/column/sort operations, zero column re-evaluations. Every module's
"gated by design" claim held in practice.

### 3.4 The real jank: batch granularity collapse (commit `3d4012b`)

The spy's event tallies exposed it: AG flushes arrived every **~1.4s**
instead of the configured 200ms (`asyncTransactionWaitMillis` verified live
at 200; raw in-page `setTimeout(200)` healthy at 200–380ms). Batches
arrived as 8 back-to-back messages (7×500 + remainder ≈ **3,800 rows**),
then ~1.4s silence: one giant synchronous flush instead of ten small ones —
the 100–200ms main-thread tasks in every profile.

Cause, measured *inside* the SharedWorker via CDP: the worker sat at ~91%
CPU (see §3.5) and its 100ms conflation timer was delivered every
**660–1,050ms**. Fix: `maxBufferedRows` in `bufferedDispatch` — flush
synchronously from `push()`'s own call stack (which runs per incoming
frame regardless of timer health) the moment the buffer holds 1,000
entries; under conflation the cap counts *unique keys* so same-key churn
never triggers it.

Result at 4k updates/sec: max clump 3,800 → ≤1,000 rows (wire chunks of
500); AG flush cadence ~1,400 → ~850ms; longest main-thread task 163–214 →
**126ms**; frames over 200ms in the 60s scroll test: 4–18 → **0**.
User-confirmed: "performance is much better."

### 3.5 The worker bottleneck itself: per-byte STOMP parsing (uncommitted → this change set)

Worker CPU profile under load: `_collectBodyNullTerminated` —
@stomp/stompjs's byte-at-a-time frame parser — at **30.1%**, plus
`parseChunk`/`_consumeTokenAsRaw`/onmessage ≈ 18% more (≈48% total parse),
columnar encode ≈ 24%. At ~4.4MB/s of full-row JSON that per-byte JS
dispatch is ~4.4M function calls/sec.

Fix: **`fastStompParser.ts` + `fastStompClient.ts`** — vectorized STOMP 1.2
framing (text frames parse with *zero decode*: `string.indexOf('\n\n')` /
`indexOf('\0')` and the body slice is the JSON string; binary frames via
`Uint8Array.indexOf` + one `TextDecoder` per section, `content-length`
honoured) behind the exact `StompClient` structural interface the transport
already consumed. Default implementation; `cfg.stompImpl: 'stompjs'` is the
typed escape hatch for brokers outside the covered surface
(transactions/acks/receipts intentionally unimplemented).

Measured swap effect, same probes: parse share **~48% → <2%** (~25×),
worker idle **8.7% → 40.2%**, conflation-timer delivery **660–1,050ms →
100–390ms**, emit cycle ~1.4s/3,800 rows → ~400ms/≤2,000. Main-thread
totals are unchanged by design (this removes worker cost, i.e. **headroom**:
several times the update rate is now sustainable before anything starves;
the size cap became the rare safety net it was designed to be).
30 new tests (18 parser goldens incl. chunk-split/multibyte/heart-beat/
escaping cases; 12 client behaviours incl. redial, watchdog, teardown
semantics); data suite 755/755.

### 3.6 OpenFin-layer fixes from the guidelines review (commits `bc71d62`, `9c608fe`)

A full review of the workspace/browser-window implementation found the
architecture sound (canonical v23 init, save-only-on-save persistence,
ref-counted listener managers, documented+reverted process-affinity
experiment) plus:

- **500ms per-view `getOptions()` poll** in `OpenFinRuntime` — the only
  standing per-view IPC in the system (2 round-trips/sec/view, forever).
  Replaced with the view `options-changed` event (zero standing IPC), poll
  retained solely as a fallback for runtimes without the event API.
- **Selection-broadcast debounce** (120ms trailing) in `useGridContextLink`
  — a held-key selection walk now publishes once instead of one IAB/FDC3
  message per keypress.
- Shipped diagnostic `console.log` probe removed from
  `windowOptionsSubscription`.
- Noted (not changed): the star-demo manifest disables background
  throttling wholesale (`--disable-background-timer-throttling …`) — a
  deliberate historical tradeoff that the §3.2 drain fix now makes worth
  re-testing, since hidden views could reclaim background CPU safely.

### 3.7 App-level tuning (commit `420581d`)

star-demo seed provider `throttleMs` 100 → 200ms, matching the 5-flushes/sec
cadence the grid renders at (`maxGridUpdatesPerSecond` default 5 →
`asyncTransactionWaitMillis` 200ms) — halves window-side message handling
with no visible latency change. `stomp-marketsgrid-minimal`'s
`STOMP_PROVIDER_CFG_VERSION` bumped so stale IndexedDB rows re-seed.

---

## 4. What was ruled OUT (so nobody re-chases it)

- **Upper-layer grid operations** — spy-proven clean (§3.3).
- **AG Grid configuration** — the sibling reference app ran 372 columns
  (~50 with deliberately expensive styling, allocating formatters,
  all-column flash) smoothly on near-default options; our 28-column grid's
  per-cell cost was never the driver.
- **Conditional-styling engine cost** — compiled+cached expressions with an
  AG-native fast path; not naive per-cell interpretation.
- **Profile save/reapply loops** — autosave is disabled
  (`disableAutoSave: true`); live-profile sync fires on explicit saves only.
- **`stateUpdated` persistence storms** — nothing subscribes to it.
- **AG 36 as the scroll fix** — `getVScrollPosition` hotspot survives (§2.1).
- **cellSelection as the whole scroll story** — disabling it bought ~30%
  of keyboard-scroll cost (real, see §6) but the hotspot remained.

---

## 5. Diagnostic infrastructure now in the tree

| Hook | Arm | What it gives |
|---|---|---|
| Grid API spy (`gridApiSpy.ts`) | `?gridspy` or `localStorage['starui:gridApiSpy']='1'` | Counts+self-time of every mutating/scanning `GridApi` call (per-key for `setGridOption`) and every grid event; `window.__gridSpy.report()`; live api handle at `__gridSpy.api` |
| nofeed (`useProviderDataWiring.ts`) | `?nofeed` or `localStorage['starui:nofeed']='1'` | Live ticks arrive but are not applied — isolates apply/render cost from transport; loud `console.warn` when armed |
| Tab-paint canary (`useBlotterVisibilityGuard.ts`) | always on | `[blotter-dock] tab click→painted Nms` per hide/show cycle; its disappearance = the dock class-name contract broke |
| STOMP impl escape hatch | provider `stompImpl: 'stompjs'` | Reverts one provider to @stomp/stompjs without a build |

The measurement scripts themselves (long-task/fps harness, arrow-endurance,
heap watch with forced GC, page/worker CPU profilers, arrival/flush-cadence
probes) were session-scratch tooling; §1 + `hidden-window-oom.md` §7 record
enough method to recreate them.

---

## 6. Remaining headroom (measured, unimplemented)

| Lever | Evidence | Note |
|---|---|---|
| `thinDeltas: true` per provider | ~21% less scroll-window long-task time at 4k/s | **Do not combine** with `projectFields` on providers with nested dot-path columns — the projector rebuilds nested objects every frame, the differ sees everything changed; measured multi-second freezes |
| `projectFields: true` per provider | cuts encode+postMessage by the unused-field ratio | already on in star-demo seed; off in minimal |
| `cellSelection` configurable | disabling: ~30% less keyboard-scroll long-task time | hardcoded `true` in `MarketsGridSurface`; product call — removes range-copy/fill |
| `getVScrollPosition` forced-layout residue | 18.9% of scroll profile even without selection | needs caller attribution / floating-filter off A/B |
| Re-enable background throttling in the OpenFin manifest | flags predate the §3.2 drain fix | measured experiment, not a blind change |
| Body `JSON.parse` + columnar encode in worker | now the top two worker costs (~20% + ~28% of remaining) | wire-format changes or the bytes-in/bytes-out WASM design — a Rust/WASM stage pays only if the whole chain (frame split → parse → project → columnar encode) stays inside WASM emitting a transferable buffer |

---

## 7. Commit map (oldest → newest)

| Commit | Summary |
|---|---|
| `87cd1c0` | feat(grid): unified blotter/summary dock, visibility guard + canary, summary throttle + zero-widget gate, DockShell memoization |
| `44a386e` | fix(grid): hidden-window OOM drain + `?nofeed` hook |
| `420581d` | chore(apps): seed conflation 200ms; minimal cfg version bump |
| `bd6b97a` | chore: AG Grid 36.1.0 across packages and apps |
| `a0a0b63` | docs: hidden-window OOM writeup + inventory updates |
| `1861ff6` | chore: OpenFin 43.104.2 / workspace 23.2.25 / runtime 43.142.104.2 |
| `bc71d62` | refactor(openfin): event-driven customData watcher |
| `9c608fe` | feat(grid): grid API spy; link-broadcast debounce |
| `3d4012b` | fix(data): conflation batch-size cap |
| *(this change set)* | feat(data): fast STOMP client + this document |
