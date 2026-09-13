# ssrm-perf — measurement harness for the SSRM MarketsGrid

Playwright scripts that drive `apps/source/stomp-ssrm-minimal` headlessly and measure the
server-side row model from the page's point of view: block round trips, tick handling,
refresh storms, blank rows while scrolling, paste accuracy, quick search, date filters,
sort direction. Plus two Node probes that load the vendored Rust/WASM engine directly.

Every number in `docs/superpowers/plans/2026-09-11-ssrm-hardening-handoff.md` came from here.
Not part of CI; run by hand. Outputs (JSON + screenshots) go to `./out/` (gitignored) or
`$SSRM_PERF_OUT`.

## Setup

```bash
# 1. broker (usually already running on :8081)
cd apps/source/stomp-view-server && npm run dev
# 2. build packages that changed, then the app — measure the PRODUCTION build:
#    the Vite dev server serves a stale copy of package dist/ (files outside the app root are not watched)
npm run build --prefix packages/data && npm run build --prefix packages/react-grid
STARUI_SKIP_ENSURE_BUILD=1 npm run build --prefix apps/source/stomp-ssrm-minimal
cd apps/source/stomp-ssrm-minimal && npx vite preview --port 5215 --strictPort
```

Playwright comes from `apps/node_modules` (the scripts resolve it relative to `apps/package.json`).

## Scripts

| Script | Measures |
|---|---|
| `ssrm-validate.mjs` | Cold load, idle tick rates, fast scroll + jumps (blank-row sampling), synthetic tick, sort storm, quick filter. Also exports the `INIT` page hook the other scripts import. |
| `ssrm-validate2.mjs` | Drag vs wheel scroll profiles (unsorted / sorted), synthetic tick, header select-all, sorted request volume with many blocks loaded. |
| `ssrm-validate3.mjs` | Paste into a selected range via the real clipboard (edit RPC captured), multi-word quick search, date `equals` / `greaterThan` via `api.setFilterModel`, sort direction, sorted idle + wheel. |
| `ssrm-multiwindow.mjs` | N same-origin pages (`PAGES`, default 2) sharing one SharedWorker / STOMP session / engine cache: per-page cold start (page 2+ must ride the warm cache), idle RPC volume (~zero with tick-gated pollers; use `?rate=0` for a truly quiet feed), sibling-scroll isolation (page 1 pays nothing while page 2 scrolls), cross-window edit propagation through `ssrm-apply-edits` + the edit overlay. Aborts the Google Fonts hosts like `worker-baseline.mjs`. Ends with `[hubSsrm]`: the data hub's `hub-introspect.ssrm` accounting (block-read queue wait vs engine time, tick-flush cost and session count, ingest) plus the replay `fanout` figures. |
| `ssrm-profile.mjs` | Render cost per rows scrolled; CDP CPU profile during a drag, at idle, and while sorted. |
| `ssrm-diag2.mjs` | Reaches the grid api through the React fiber and traces `pasteStart` / `cellValueChanged` / `pasteEnd` plus hub status events around a quick search. |
| `engine-probe-ops.mjs` | Which filter ops / sorts the WASM engine honours on string vs number columns. |
| `engine-probe-sort.mjs` | Which sort descriptor key the engine reads (`sort`, not `dir`). |
| `worker-baseline.mjs` | The worker-split plan's measurement (plan §5): **A** config-RPC latency (`hub-ready` / `list-configs` on the PLATFORM-services port, the scalar `provider-running` on the DATA port) idle vs a `?rate=10000` storm vs the 20k snapshot re-stream; **B** a fresh window opening mid-storm (wall→rows, spawn offset, `starui:*` load marks) plus the grid customizer opening in it (`customizerOpenMs`); **C** 10 CSRM windows × 20k rows — first window (cold, with its spawn offset + `platform-ready`) and 9 simultaneous joiners (per-window full paint, spread, last÷first). Needs both previews (`SSRM_URL` :5215, `CSRM_URL` :5216) and the broker. Knobs: `PHASES=AB,C`, `CSRM_PAGES=10`, `THROTTLE=4` (CDP page throttle — a Windows proxy on a fast rig; the SharedWorker thread cannot be throttled), `TAG=…` names `out/<tag>-<ts>.json`. Every context aborts the Google Fonts hosts: the demo pages block `DOMContentLoaded` on them, and on a proxied box that alone read 0.1–11 s per window. |
| `worker-split-smoke.mjs` | Rerunnable proof of the split on a live preview: both SharedWorkers by name, catalog + AppData answered by the platform worker only, the provider running on the data worker, `hub-ready` / `list-configs` on the data port get NO reply (route deleted), `provider-running` still does. Exits non-zero on any failed check. |
| `cdpDock.mjs` | Not a script — the shared plumbing for the `cdp-*` / `csrm-frame-counter` probes below: raw DevTools protocol over a WebSocket to a RUNNING Chromium (`--cdp`, default `http://127.0.0.1:9091`, the star-demo dock's `--remote-debugging-port`), page selection by `--url` substring (`--all` for every match, probes then run in parallel), `Runtime.evaluate`, and reload-with-init-script for the probes that must be in place before the app loads. No Playwright, nothing restarted; a docked layout keeps its state unless a probe says `--reload`. |
| `cdp-timer-census.mjs` | WORKLOG 21's timer storm, as a script: wraps `setTimeout` / `clearTimeout` on a view and buckets by delay + callback source for `--seconds` (default 10) — total set / clear / ran-as-task counts and the top buckets (which named ag-grid-react's `RenderStatusService` and the enterprise `FindService` debounce). Wraps the live page in place; `--reload` installs the wrapper before load. Refactor plan B0/B1 acceptance instrument. |
| `cdp-mainthread-load.mjs` | Event-loop lag (50 ms interval drift) p50/p95/max, frame gaps + fps from `requestAnimationFrame`, long tasks via `PerformanceObserver` — per view, in parallel, no reload. The numbers behind the docked-six-blotter diagnosis and Phase A / B3 acceptance (lag p95 < 150 / 250 ms). A hidden view reports no frames; that is expected. |
| `cdp-hidden-liveness.mjs` | Two facts per view: is it alive while hidden (100 ms interval fired n / 80 over 8 s, max gap, rAF frames — the earlier isolation revert's failure mode) and does the page KNOW it is hidden (`document.visibilityState`, `document.hidden`, and OpenFin's `View.isShowing()` when `fin` exists). The second is Phase C's entry criterion: the hub's `meta.hidden` comes from `document.hidden`. |
| `cdp-process-map.mjs` | On the OpenFin provider page (default `--url /platform/provider`): every child window's views with their renderer PID, working-set / private memory and CPU (`View.getProcessInfo`), `processAffinity` tag, `isShowing`, plus a distinct-PID summary; the raw `fin.System.getAllProcessInfo()` tree goes to the JSON. Phase A acceptance (one PID per docked view, memory in budget). Exits 1 on a non-OpenFin page. |
| `cdp-fiber-remount.mjs` | WORKLOG 20's probe: installs a minimal `__REACT_DEVTOOLS_GLOBAL_HOOK__` before the app loads (always reloads), records every React commit, and reports each AG Grid instance (`ag-root-wrapper` host fiber) with its first commit, fiber depth from the root and full ancestor chain (names + keys); two instances get their chains diffed. Phase D0 (depth) and D2 (one grid per load). Production bundles may shorten component names; the chain shape and keys still identify instances. |
| `csrm-frame-counter.mjs` | Frames, rows and (with `--bytes`, which `JSON.stringify`s each frame) payload bytes per message kind on every SharedWorker port a view opens — `delta`, `delta-bin`, `delta-patch`, `ssrm-tick:rowDelta`, … — for `--seconds`. The WORKLOG 19 port count (31 rowDelta frames, 45 MB in 10 s) and WORKLOG 21's CSRM feed shape (3 500 rows per 250 ms frame) as a script. `delta-bin` frames report bytes only (their rows are inside the encoded buffer). Reloads the page to wrap the `SharedWorker` constructor. |

```bash
SSRM_URL=http://localhost:5215/ CSRM_URL=http://localhost:5216/ TAG=win-w2 node apps/scripts/ssrm-perf/worker-baseline.mjs
SSRM_URL=http://localhost:5215/ node apps/scripts/ssrm-perf/worker-split-smoke.mjs
APP_URL=http://localhost:5215/ TAG=baseline node apps/scripts/ssrm-perf/ssrm-validate3.mjs
APP_URL="http://localhost:5215/?rate=10000" TAG=10k node apps/scripts/ssrm-perf/ssrm-validate3.mjs
node apps/scripts/ssrm-perf/engine-probe-ops.mjs
```

`?rate=N` sets the broker's live update rate (row-updates/sec) through the demo's provider config.

## How the page hook works

`INIT` (in `ssrm-validate.mjs`) is injected with `addInitScript` before the app boots. It wraps
`window.SharedWorker`, hooks `port.postMessage` and `port.addEventListener('message')`, and matches
`ssrm-get-rows` posts to `ssrm-rpc` replies by `reqId` — so block latency is measured from the page
without touching product code. It also records `ssrm-tick` payload sizes and long tasks
(`PerformanceObserver`). Blank rows are `.ag-grid-scrolling-container .ag-row.ag-row-loading`
(AG Grid 36 class names); the scroller is `.ag-grid-viewport`.

A synthetic tick dispatched on the hooked port exercises the client's transaction path, but the
engine never saw it, so the 1 s row-count reconciliation restores engine truth afterwards — expected.
