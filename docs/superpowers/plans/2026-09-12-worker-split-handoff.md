# Worker-split refactor — handoff (state after the Windows-target pass)

**Branch:** `feature/worker-hub-config-refactor` (off `feature/ssrm-dataprovider-refactor`)
**Landed:** W0 (baselines), W1a (dual-worker wiring), W1b (slim host), **W1c** (data hub stops serving config/AppData), **W2** (thin windows + `warmPlatform()` + boot ordering), **W4** (round-robin CSRM fan-out), **W3** (re-measure, soak, docs, orphan sweep) — all measured on the Windows 11 target.
**Plan of record:** [`2026-09-12-worker-split-plan.md`](./2026-09-12-worker-split-plan.md) — phase specs, §5 measurement table with the Windows columns, honest limits. This handoff is the *operator's* companion: environment, verification loop, what each phase changed, and the items that remain open because this box cannot verify them.

Read this top to bottom once before touching code. The measurement discipline is still the point: a change that "looks right" but isn't measured on the target hardware has not landed.

---

## 1. What the refactor was for, and what it delivered

**The symptom:** tool windows and the grid customizer took tens of seconds to open while a blotter streamed. **The mechanism:** one SharedWorker hosted the data plane (ingest → WASM, SSRM ticks, CSRM fan-out) and the low-frequency config catalog + AppData over ONE event loop; a config request queued behind whatever ingest macrotask was running.

**Delivered, in four moves (all on the Windows target):**

1. **Split** — config + AppData live in `mkt-platform-services:«appId»`; the data hub (`mkt-data-services:«appId»`) no longer answers `hub-ready` / `get-config` / `list-configs` / `config-invalidate` / `appdata-*` at all (routes deleted, not dormant). Its one remaining coupling is `ProviderLifecycleReads`: an on-demand IndexedDB read at provider create / restart / reconfigure. No worker↔worker bridge.
2. **Thin windows** — `ensureConfigReady` connects the platform port (spawned first and alone), opens IndexedDB read-only in attach mode with no seed URL, and gates on the services worker's catalog. A window never seeds, never fetches a seed bundle, never takes the seed lock. Config writes ride the port (`ConfigManagerOptions.writer` → `config-save` / `config-delete`), so the services worker is the single writer and self-invalidates.
3. **Warm at app load** — `warmPlatform(config, { workerScriptUrl?, providers?: 'autoStart' | ids })`: `ensurePlatformReady` + provider warm-up (stats-mode attach: the provider runs, nothing fans out until a data listener appears), merged with the lazy grid-mount path. star-demo's OpenFin provider window calls it.
4. **Fan-out** — `ReplayScheduler`: simultaneous late-join replays are interleaved round-robin (one chunk per pending port per round, 8 ms budget between rounds, MessageChannel yield), chunks frozen per job at enqueue, live deltas deferred per port until its `ready`, hub-thread accounting on `hub-introspect.fanout`.

**Numbers that prove it (Windows native, plan §5 has the full table):**

| what | before (W1b HEAD) | after |
|---|---|---|
| config RPC max during the 20k re-stream | 53.5 ms | 0.6–2.6 ms |
| fresh window mid-storm: `config-ready` → `platform-ready` | 173 → 187 ms (window seeding) | 172 → **177 ms** (5 ms; no seed, no main-thread hydrate) |
| first CSRM window: spawn → `platform-ready` | — | **52–70 ms** |
| 10 CSRM windows × 20k: joiner spread / last÷first (three runs each) | 825–1 329 ms / 1.34–1.47× | **272 / 939 / 1 321 ms — 1.09× / 1.36× / 1.58×** (≤ 1.5× when the attaches share an episode; the 1.58× run split into two episodes by the joiners' own boot spread, hub posting 184 ms) |
| hub-thread per 9-port fan-out | (no instrumentation) | 0.56–1.06 s encode + 0.32–0.58 s posting |
| six-window SSRM soak at rate 10000 | (not run) | green: zero idle block RPCs, sibling-scroll isolation, cross-window edit on all six; block p50 254 ms (145 at two pages — same-plane contention, by design) |

**What it does NOT fix (unchanged from the plan, now with evidence):** the joiners' ~3.2 s wall time on this box is client-bound — ten renderer processes decoding and painting 20k rows on one CPU — not hub-bound; the posting floor is one structured clone per port per chunk (only a `crossOriginIsolated` SharedArrayBuffer transport removes it); encode is feed-dependent (each attach re-encodes the buckets dirtied since the previous one — the price of a consistent per-attach snapshot); SSRM block reads still share the data worker's queue with ingest, by design.

**Two findings that were not in the plan:**

- **The demo pages block `DOMContentLoaded` on Google Fonts.** On this proxied box the same stylesheet fetch took 0.1 s, 1.7 s and 11.1 s across three cold windows — a 12.7 s "first window" that had nothing to do with the platform. The harness now aborts `fonts.googleapis.com` / `fonts.gstatic.com` in every context and records each window's SharedWorker spawn offset so numbers decompose into page vs platform. **For the field this is real:** self-host or defer those fonts in the demo apps (open item).
- **WORKLOG item 14's "first-run catalog read stall" was a port-adoption gap, not Dexie.** `defaultEntry` starts each port to receive the bootstrap handshake; the installer only attached its listener after the hydrate awaits, so everything a cold first window sent mid-hydrate (its AppData attach, `hub-ready`, the first `get-config`) was dropped and its readiness marks never fired. Fixed in `entry.ts` (attach every port immediately, backlog dispatch until ready), pinned by two regression tests. Closed.

---

## 2. Hardware reality

Development was an M4 Max; every phase here was measured on the Windows 11 / 32 GB target natively — the CPU is the throttle, `THROTTLE=4` is only a proxy on the Mac. The Mac columns in plan §5 stay as lower bounds; the "after" column and every landed-phase paragraph are Windows native. If the box changes, re-run §3's loop before trusting any number.

---

## 3. Environment and the verification loop

```bash
# install BOTH roots (packages + apps are separate install roots)
npm install
cd apps && npm install && cd ..
npm run build                          # turbo build across packages/
cd apps && npx playwright install chromium && cd ..

# terminal 1 — the STOMP broker (20k synthetic FI rows)                :8081
cd apps/source/stomp-view-server && npm run build && node dist/main.js
# terminal 2 — SSRM app, PRODUCTION preview                             :5215
cd apps/source/stomp-ssrm-minimal && STARUI_SKIP_ENSURE_BUILD=1 npx vite build && npx vite preview --port 5215 --strictPort
# terminal 3 — CSRM app, production preview                             :5216
cd apps/source/stomp-marketsgrid-minimal && STARUI_SKIP_ENSURE_BUILD=1 npx vite build && npx vite preview --port 5216 --strictPort
```

Rebuild the two apps after ANY package change — they consume `packages/*/dist`. Note the filtered `npx turbo build --filter=…` can leave a sibling package's `dist` un-restored from cache (seen: `openfin-platform/dist` missing → the CSRM build fails on `configOnly.js`); plain `npm run build` restores everything.

**The loop, per change:**

```bash
npx turbo typecheck test                                              # green
cd apps/scripts/ssrm-perf
SSRM_URL=http://localhost:5215/ node worker-split-smoke.mjs           # 13 checks: the split is real on the live build
SSRM_URL=http://localhost:5215/ CSRM_URL=http://localhost:5216/ TAG=<tag> node worker-baseline.mjs
```

`worker-split-smoke.mjs` introspects both workers by name and proves `hub-ready` / `list-configs` on the DATA port get no reply. `worker-baseline.mjs` emits `[A1]/[A2]/[A3]` (platform-port `hub-ready` / `list-configs` and data-port `provider-running`, idle / storm / re-stream), `[B]` (fresh window mid-storm: wall→rows, spawn offset, load marks, customizer open), `[C]` (10 CSRM windows: first window + 9 joiners + `hubFanout`). Knobs: `PHASES=AB,C`, `CSRM_PAGES=10`, `THROTTLE=4`, `TAG`. Raw JSON in `out/<tag>-<ts>.json`.

**Reading the numbers:** `configRpcDuringSnapshotRestream.*.max` (starvation), `windowOpenMidStorm.loadMarks` (`config-ready` → `platform-ready` is the thin-window ladder), `csrmFanout.joinSpreadMs` + last÷first (fan-out), `csrmFanout.hubFanout.lastEpisode` (`encodeMs` + `hubThreadMs` = hub-thread cost of the fan-out). Compare against the W1b-HEAD column in §5.

---

## 4. Where the code is now

Everything is `packages/data/host-data/src/` unless noted:

| concern | file(s) |
|---|---|
| Data hub (800 lines — at the ceiling) | `runtime/worker/SharedWorkerDataServicesHub.ts` |
| Slim platform host: catalog RPCs + AppData + `config-save` / `config-delete` + self-invalidation | `runtime/worker/PlatformServicesHost.ts`, `runtime/worker/hubCatalogRpc.ts` |
| Data hub's only config/AppData coupling (on-demand IndexedDB reads) | `runtime/worker/ProviderLifecycleReads.ts` |
| SSRM slice / stats sampler (extracted verbatim) | `runtime/worker/HubSsrmRpc.ts`, `runtime/worker/HubStatsSampler.ts` |
| Round-robin replay fan-out + macrotask yield | `runtime/worker/ReplayScheduler.ts`, `runtime/worker/yieldToMacrotask.ts` |
| Worker entry — shared `install()`, `self.name` branch, port backlog until ready | `runtime/worker/entry.ts`, `runtime/worker/defaultEntry.ts` |
| Thin-window config tier, platform boot, warm-up | `bootstrap/ensurePlatformReady.ts`, `bootstrap/warmPlatform.ts` |
| Connections: platform port alone / both | `hub/ensureDataServicesHub.ts` (`warmPlatformConnection`, `HubConnection`) |
| Single-writer delegate (core) | `packages/core/host-config/src/types.ts` (`ConfigWriter`), `ConfigManager.ts` |
| Client config writes + catalog RPCs | `runtime/client/SharedWorkerDataServicesClient.ts` (`saveConfigRow`, `deleteConfigRow`) |
| Inspector merge of both workers | `hub/mergeHubIntrospect.ts`, `packages/react-core/host-data-react/src/runtime/HubInspectorDrawer.tsx` |
| Harness + smoke | `apps/scripts/ssrm-perf/worker-baseline.mjs`, `worker-split-smoke.mjs`, `README.md` |

Deleted in this pass (superseded, no consumer): `hub/wireWorkerCatalogSync.ts` (the host self-invalidates), and the single-worker bootstrap helpers `runtime/bootstrap/createDataServicesClient.ts`, `runtime/bootstrap/bootstrapWithWorkerAsset.ts`, react `createAppDataServices.ts` — they spawned only the data worker and attached AppData on it, which hangs since W1c; `ensurePlatformReady` / `warmPlatform` are the entry points.

---

## 5. Rules that still hold (binding)

1. **One store, one owner.** The services worker is the single writer for config + AppData; the data hub reads on demand at lifecycle moments; windows never seed.
2. **No worker↔worker bridge** unless a concrete feature forces it (BroadcastChannel from the services worker is the escape hatch — the ConfigManager's own change notifier already crosses contexts for invalidation).
3. **Repo conventions:** no `v1/`/`legacy/` paths; superseded code deleted in the same change; ≤800 LOC/file, ≤80 LOC/function; `docs/current-features.md` updated with every change; conventional commit prefixes; the `Co-Authored-By` trailer.
4. **Package manager:** npm 10 workspaces, plain `npm install`, never `npm ci`, never a flag. Two install roots (`/` and `apps/`).
5. **Measure on target.** A phase without a Windows-box number in plan §5 is not done.
6. **One phase per commit**, suite green each time.

---

## 6. Open items — what this box could not verify, and what was deliberately not built

1. **REST mode (`useRest: true`).** No config service reachable here, so the W0 follow-up (re-probe with REST) stays open. Note for whoever runs it: in the code, REST is write-through only — every `restUrl` use is on a write path or the drain; reads are always local IndexedDB — so "config reads become REST round-trips" is not how the ConfigManager works. With the single writer, REST writes now originate in the services worker with ITS identity; no host supplies `AppIdentity.getAccessToken` today, and if one ever does, the worker cannot call it — the thin tier would need to fall back to local writes for that host.
2. **OpenFin.** star-demo's provider window now calls `warmPlatformFromProvider()` (`warmPlatform` with `providers: 'autoStart'`; the seeded `test.dp` STOMP provider is flagged). Not run in an OpenFin runtime here: verify the provider window keeps its stats subscription alive (it is session-long) and that `acquireBackgroundFreezeExemption` (in `ensurePlatformReady`) is granted in that hidden window — the lock retries until granted.
3. **Customizer-open timing.** The harness step exists (`windowOpenMidStorm.customizerOpenMs`, clicks `[data-testid="v2-settings-open-btn"]`, waits for `[aria-label="Grid settings"]`), but `stomp-ssrm-minimal` does not render the settings button, so it reads `null` there. Run it against an app that does (markets-grid-lab) — the thin-window ladder (5 ms) says the platform side is not where a slow customizer open would come from.
4. **Demo fonts.** Self-host or defer the Google Fonts `<link>`s in the demo apps' `index.html` (see §1). Until then, any first-window number taken WITHOUT the harness's host abort is page-load, not platform.
5. **SharedArrayBuffer fan-out** (plan W4 item 4) — not built. Needs `crossOriginIsolated` (COOP/COEP headers; OpenFin can set them). It is the only lever left on the posting half of the fan-out cost; the `EncodedChunk` seam in `ReplayScheduler.postNextChunk` is where the transport swaps.
6. **Per-`gridId` profile cache in the services worker** — deliberately NOT built. Profile reads are window-local IndexedDB primary-key gets behind the ConfigManager's own row cache; they never touch the data worker's thread, so there is no contention to remove. Revisit only with a measured read cost.
7. **Soak** — `ssrm-multiwindow.mjs` PAGES=2 and PAGES=6 (`?rate=10000`) results are in plan §5 (W3); the script now aborts the font hosts like the baseline. Re-run after any hub change.

---

## 7. Fast orientation commands

```bash
git log --oneline feature/ssrm-dataprovider-refactor..HEAD          # what landed, per phase
wc -l packages/data/host-data/src/runtime/worker/SharedWorkerDataServicesHub.ts   # must stay ≤ 800
ls apps/scripts/ssrm-perf/out/                                       # raw JSON per run (gitignored)
npx turbo test --filter=@wellsfargo-starui/data                      # the data gate
docs/superpowers/plans/2026-09-12-worker-split-plan.md               # the plan + §5 numbers
```
