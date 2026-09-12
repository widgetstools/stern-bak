# Worker-split refactor — handoff (continue on the Windows 11 target box)

**Branch:** `feature/worker-hub-config-refactor` (off `feature/ssrm-dataprovider-refactor`)
**Landed so far:** W0 (baselines), W1a (dual-worker wiring), W1b (slim host)
**Remaining:** W1c, W2, W3, W4 — this document is how to do them.
**Plan of record:** [`2026-09-12-worker-split-plan.md`](./2026-09-12-worker-split-plan.md) — phase specs, §5 measurement table, honest limits. This handoff is the *operator's* companion: environment, verification loop, and the exact state each remaining phase starts from.

Read this top to bottom once before touching code. The measurement discipline is the point of the whole exercise — a change that "looks right" but isn't measured on the target hardware has not landed.

---

## 1. Why we are doing this refactor

**The symptom (reported from real deployments):** windows take tens of seconds to open — tool windows, the grid customizer — while a blotter is streaming high-frequency updates. Opening a second view feels like the app hangs.

**The mechanism.** One SharedWorker hosts three planes over ONE event loop:

- **data plane, high frequency** — STOMP ingest → flatten → WASM `apply_message_json` (synchronous), SSRM tick loop, CSRM delta fan-out, block RPCs;
- **config catalog, low frequency** — `hub-ready` / `get-config` / `list-configs` / `config-invalidate` / `hub-introspect` / `provider-running`;
- **AppData, low frequency** — attach/snapshot/delta/set/upsert/ack.

A JS worker cannot preempt a running macrotask. A `list-configs` that arrives while an ingest batch is running waits for that batch AND everything already queued ahead of it. On a fast machine the ingest batches are short (drain-paced) and the queue empties between them — which is exactly why the dev rig (M4 Max) could barely reproduce it. On the target (Windows 11 / 32 GB corporate hardware, 2–5× slower single-thread, efficiency cores, AV) those macrotasks run several times longer, the gaps close, and config requests pile up behind ingest. Add `useRest: true` (config reads become REST round-trips through the worker), OpenFin background throttling, and more windows × more providers, and "tens of seconds" is the expected result, not an anomaly.

**Why in-worker prioritization can't fix it:** reordering the queue cannot shorten the *running* macrotask, and the ingest batches ARE the macrotasks. Isolation needs a second thread; for cross-window sharing that means a second SharedWorker.

**The fix, in four moves:**
1. **Split** config + AppData into their own `mkt-platform-services:«appId»` SharedWorker (W1) — its event loop stays empty, so config/AppData answer in milliseconds regardless of data-plane load.
2. **Thin the windows** (W2) — a window REQUESTS config/AppData over a port; it no longer LOADS its own ConfigManager/Dexie on its main thread (which today contends with the storming worker). Boot becomes: connect two ports, one config-snapshot RPC, subscribe invalidations.
3. **Warm at app load** (W2) — `warmPlatform()`, one fire-and-forget call at app entry / OpenFin dock load, so the worker + providers are up before the first grid mounts, off the UI thread. The existing lazy create-on-first-grid-mount path stays as the fallback.
4. **Fix the fan-out** (W4) — 20k snapshot to 10 CSRM blotters near-simultaneously: today the replay runs per-window to completion (window 10 waits for nine full replays); a round-robin chunk scheduler collapses the first→last spread.

**What this does NOT fix (state it, don't oversell):** a second blotter's SSRM block reads still queue behind ingest on the data worker (same plane, by design); two threads still share the CPU under saturation; decode/paint stays per-window (parallel, not a hub cost). The win is *queueing isolation* + *thin windows* + *deterministic boot*.

---

## 2. Hardware reality — the binding constraint

**Development was an M4 Max / 32 GB. Deployment is Windows 11 / 32 GB corporate hardware.** Everything measured on the Mac is a *lower bound*. This is why the rest of the work moves to the Windows box:

- **Every phase exit gate runs twice: native and `THROTTLE=4`** (the harness's CPU-throttle proxy), and **final acceptance is on the actual Windows 11 target**.
- The `THROTTLE=4` proxy *understates* Windows: CDP throttles page renderer threads only; the SharedWorker thread cannot be throttled from Playwright, so worker-side costs (ingest, encode) ran at Mac speed in every throttled row. On real Windows the worker's own macrotasks stretch too — so the production picture is worse than the proxy, which is the direction that matters.
- **First task on the Windows box:** re-run the W0 baseline there (native, i.e. no throttle needed — the CPU is the throttle) AND with `useRest: true` if the deployment uses a config service. Record it in the plan's §5 as the "Windows native" column. This is the number that proves the problem is real on target and that each phase moved it.

---

## 3. Environment setup on the Windows box

Node 20+, git, a POSIXish shell (Git Bash or WSL both fine; the app scripts are cross-platform and use `shell: process.platform === 'win32'`).

```bash
# 1. clone + branch
git clone <repo> && cd starui
git checkout feature/worker-hub-config-refactor

# 2. install BOTH roots (packages + apps are separate install roots)
npm install                 # root: packages/*
cd apps && npm install      # apps: own root; postinstall symlinks the platform
cd ..

# 3. build the packages once (apps consume dist/)
npm run build               # turbo build across packages/

# 4. Playwright browser for the perf harness
cd apps && npx playwright install chromium && cd ..
```

**The perf rig needs three processes** (the harness drives the browser; you start the servers):

```bash
# terminal 1 — the STOMP broker (20k synthetic FI rows)
cd apps/source/stomp-view-server && npm run build && node dist/main.js   # :8081

# terminal 2 — SSRM app, PRODUCTION preview (not dev — dev is slower and noisier)
cd apps/source/stomp-ssrm-minimal && npx vite build && npx vite preview --port 5215 --strictPort

# terminal 3 — CSRM app, production preview (for the W4 fan-out phase C)
cd apps/source/stomp-marketsgrid-minimal && npx vite build && npx vite preview --port 5216 --strictPort
```

**Run the baseline:**

```bash
cd apps/scripts/ssrm-perf
SSRM_URL=http://localhost:5215/ CSRM_URL=http://localhost:5216/ TAG=win-w0 node worker-baseline.mjs
# writes out/win-w0-<ts>.json ; console prints [A1]/[A2]/[A3]/[B]/[C]
```

Harness knobs (all env vars): `PHASES=AB` or `PHASES=C` to run one group; `THROTTLE=4` for the CPU proxy (only meaningful ON the Mac — on Windows the CPU already IS the constraint); `CSRM_PAGES=10` fan-out window count. What each probe means is documented at the top of `worker-baseline.mjs`; the numbers it emits map 1:1 to the plan's §5 table rows.

**Reading the numbers:** the four that matter — `configRpcDuringSnapshotRestream` max (config starvation), `windowOpenMidStorm.wallToRowsMs` (tool-window open), `csrmFanout.joinSpreadMs` + `last÷first` (the fan-out ladder). Compare every phase's run to the "Windows native W0" column you recorded first.

---

## 4. Where the code is (map before you touch)

Everything is `packages/data/host-data/src/`:

| concern | file(s) |
|---|---|
| Data hub (the god object, **1016 lines** — over the 800 ceiling) | `runtime/worker/SharedWorkerDataServicesHub.ts` |
| Slim platform host (W1b, **done**) | `runtime/worker/PlatformServicesHost.ts` |
| Worker entry — shared `install()`, name-branch | `runtime/worker/entry.ts`, `runtime/worker/defaultEntry.ts` |
| Catalog RPC handlers (already extracted, context-injected) | `runtime/worker/hubCatalogRpc.ts` |
| AppData subsystem (self-contained class) | `runtime/worker/HubAppDataService.ts`, `runtime/worker/WorkerAppDataStore.ts` |
| Config catalog cache | `hub/ConfigCatalogCache.ts` |
| CSRM fan-out — bucketed pre-encoded replay | `runtime/worker/replayCache.ts`, `runtime/worker/providerEmit.ts`, `runtime/worker/hubEncoding.ts`, `runtime/wire/columnarCodec.ts` |
| Dual-worker connection + bundle | `hub/ensureDataServicesHub.ts` |
| AppData attach through platform port | `runtime/bootstrap/bootstrap.ts` |
| Worker factories (both) | `runtime/bootstrap/createDataServicesWorker.ts` |
| Boot chain | `bootstrap/ensurePlatformReady.ts`, `bootstrap/ensureConfigReady` (same file), `bootstrap/loadMarks.ts` |
| Catalog invalidation wire | `hub/wireWorkerCatalogSync.ts` |
| Provider-lifecycle template resolution (data hub's ONLY config/AppData read) | `SharedWorkerDataServicesHub.ts` ~line 574, `appDataLookup` |
| Worker asset build | `scripts/buildWorker.mjs` |

**The data hub's only remaining coupling to config/AppData** is at provider start/restart/refresh — it resolves the provider cfg and its AppData template tokens (`appDataLookup`). Rare events. W1c makes those on-demand reads against shared IndexedDB; there is deliberately NO worker↔worker bridge.

---

## 5. What is already landed (don't redo it)

- **W1a** (`2abde28`): `createPlatformServicesWorker` spawns `mkt-platform-services:«appId»` first; `HubConnection` carries both workers + both clients; AppData attaches via `bootstrapDataServices.appDataClient`; catalog readiness gates on `platformClient`; `wireWorkerCatalogSync` invalidates both; bundle exposes `platformClient`.
- **W1b** (`898022f`): `PlatformServicesHost` (catalog RPC + AppData + ConfigCatalogCache, no data plane) installed by the SAME bundled asset via a `self.name` branch in `defaultEntry` (`mkt-platform-services:*` → slim host). `entry.ts` has one shared `install()` serving both brains. Introspection answers honestly (zero providers).
- Both live-verified on the SSRM preview; data suite **705 passing** throughout.

Staging caveats still true (W1c closes them): **both** workers currently run `seedIfEmpty` (in-lock idempotent, so harmless), and the data hub still hosts the catalog/AppData handlers even though nothing routes to them there. `SharedWorkerDataServicesHub.ts` is still 1016 lines.

---

## 6. Remaining phases — the exact work

Each phase: one focused change, `npx turbo typecheck build test` green, a live smoke on the preview, numbers recorded in plan §5. Commit per phase with a `feat(data):`/`feat(perf):` message and the `Co-Authored-By` trailer. Push to the branch.

### W1c — make the data hub stop serving config/AppData (structural isolation)

Right now the split is additive; W1c makes it real.

1. **Delete the catalog + AppData request routing from `SharedWorkerDataServicesHub`.** The `hub-ready` / `get-config` / `list-configs` / `config-invalidate` / `hub-introspect` / `provider-running` cases and the `appdata-*` dispatch leave the data hub's `handleRequest` / `handleAppDataRequest` — they live only in `PlatformServicesHost` now. The data client never sends them there anymore (W1a already pointed AppData + catalog readiness at the platform client); grep for any straggler and re-point it.
2. **Data hub keeps a READ-ONLY `ConfigManager`** for the one thing it still needs: resolving the provider cfg + AppData template tokens at provider start/restart/refresh. Replace the in-memory catalog/AppData mirror reads at `~line 574` (`appDataLookup`) with an on-demand Dexie read at those lifecycle moments. IndexedDB is shared across workers; a fresh read at start time is correct by construction (a `refresh-provider`/restart reads current rows).
3. **Services worker becomes the sole seeder.** Remove `seedIfEmpty` from the data-hub boot path; keep it in the platform host. (The data hub's own comment about being the "stale-warm safety net" moves with the seeder — the services worker now owns that recovery role.)
4. **`wireWorkerCatalogSync` targets ONLY the platform client** — drop the second (data-hub) invalidation added in W1a; the data hub's on-demand reads make its cache staleness moot.
5. **Hub file drops under 800 lines** as the handlers leave. If it doesn't, extract the SSRM RPC/tick section next (it's the other big block) — but that's a bonus, not a gate.

*Verify:* data suite green; live smoke shows catalog/AppData answered by the platform worker only (introspect the data worker → it reports no catalog); provider start still resolves AppData templates (the stomp app's `{{positions.asOfDate}}` historical path is the test — it reads an AppData token at start). Numbers: config probe unchanged-or-better; the point of W1c is correctness/lines, not a new number.

### W2 — thin windows + `warmPlatform()` + boot ordering

1. **`warmPlatform(config, { providers?: 'autoStart' | string[], workerScriptUrl? })`** — new public API (export from the data package root and re-export where `ensurePlatformReady` is exported). Fire-and-forget: kicks both worker spawns + hydrate + the named providers' starts, merged through the existing per-`appId` promise maps (`configReadyPromises` / `platformPromises` / `hubConnections`) so it and the lazy grid-mount path are the same flight — first caller wins, nothing double-boots, repeat calls no-op. Provider warm-up uses the container's existing late-join (`isProviderRunning` / `waitForProviderRunning`) so a grid mounting after warm attaches to a RUNNING provider.
2. **Thin the window boot.** `ensureConfigReady` (the tool-window path) stops constructing a main-thread ConfigManager + opening Dexie; it connects the platform port and does one `config-snapshot` RPC + invalidation subscription. The window-side ConfigManager and `wireWorkerCatalogSync`'s window origin leave the boot path; **the services worker becomes the only Dexie writer for config AND AppData** (config save/delete become platform-client RPCs). The grid **customizer's** config-service storage adapter re-targets the platform client; add a per-`gridId` profile cache in the services worker so the Nth window opening the same blotter gets its profile from worker RAM, not a Dexie re-read.
3. **Boot ordering + WORKLOG-14.** Services worker spawns first; window-interactive gates on it alone. Make the services worker's hydrate ordering explicit and test-pinned: the RPC port handler installs before hydrate awaits, every catalog read keeps the bounded-reply deadline (`hubCatalogRpc.ts` already has it). This is the WORKLOG item 14 class (first-run catalog read stall) — close it or reduce it to a pinned regression test.
4. **OpenFin:** call `warmPlatform` from the dock/workspace bootstrap; verify `acquireBackgroundFreezeExemption` (in `ensurePlatformReady`) covers the hidden/background dock-boot window — that lock exists for exactly this.

*Verify (this is the phase the whole effort is FOR):* on the Windows box, open a tool window / customizer WHILE a blotter streams at the real feed rate — it must open in the low hundreds of ms, not seconds. Record `windowOpenMidStorm.wallToRowsMs` and a customizer-open timing. Also: a demo calls `warmPlatform` at entry and a grid mounts measurably faster than the lazy path (plan §5 row); a second demo stays lazy-only to prove the fallback still boots everything.

### W3 — re-measure + soak + docs

Re-run the full W0 probe (Windows native + the Mac's `THROTTLE=4` for continuity); run `ssrm-multiwindow.mjs` (PAGES=2 parity with the hardening handoff §4b, then the deferred PAGES=6 at `?rate=10000`); fill plan §5's "after" column; update `docs/current-features.md`, cross-reference the hardening handoff, and delete anything the split orphaned. If worker assets became consumer-visible, note it in `docs/APPS_REPO.md`.

### W4 — CSRM fan-out: 20k × 10 blotters, almost simultaneously

Build on what exists (`replayCache.ts` already keeps bucketed pre-encoded binary chunks with per-bucket invalidation; `broadcast` fans one template to all; encoded `ArrayBuffer`s post un-transferred = memcpy-grade clone, not row re-clone). Change:

1. **Interleave, don't serialize.** Today N simultaneous attaches run `replayCacheToPort` to completion one at a time (window 10's first chunk waits for nine full replays). Replace with a round-robin chunk scheduler: one pass posts chunk k to every pending replay before chunk k+1 to any, yielding to the macrotask queue between passes so ingest + block RPCs breathe. First→last spread collapses from O(9×replay) to O(one pass).
2. **One encode for both paths** — the live `replace` broadcast and the late-join replay share the same bucketed encoded chunks.
3. **Backpressure-aware pacing** per port (the socket-high-water idea the STOMP server uses) — a stalled hidden window doesn't hold the round-robin hostage; skip, catch up next pass.
4. **SharedArrayBuffer, gated stretch.** With `crossOriginIsolated` (OpenFin can set COOP/COEP; the web app needs server headers) the encoded snapshot region becomes ONE SAB all windows read — zero copies at fan-out. Behind the existing `EncodedChunk` seam so it's a transport swap. Only after 1–3 are measured.

Also add worker-side timing so plan §5's "hub-thread ms consumed by the fan-out" row gets a number (wrap the encode + post loop with `performance.now()` deltas, expose via `hub-introspect`).

*Verify:* the W0 phase-C 10-window run — target last window's full-paint within ~1.5× the first window's (baseline was 2.14× Mac-native, worse throttled), hub-thread fan-out time within ~2× a single-window replay. On the Windows box this is the number the desk feels; it must move.

---

## 7. Rules that hold for every remaining phase (binding)

1. **One store, one painter / one owner.** The services worker is the single Dexie writer for config + AppData after W2; the data hub reads on demand. No second source of truth.
2. **No worker↔worker bridge** unless a concrete feature forces it (then a BroadcastChannel from the services worker is the escape hatch — decide then).
3. **Repo conventions:** no `v1/`/`legacy/` paths; superseded code deleted in the same change as its replacement; ≤800 LOC/file, ≤80 LOC/function; update `docs/current-features.md` same-commit-or-immediate-follow-up; conventional commit prefixes; the `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>` trailer.
4. **Package manager:** npm 10 workspaces, plain `npm install`, never `npm ci`, never a flag. Two install roots (`/` and `apps/`).
5. **Measure on target.** A phase without a Windows-box number in plan §5 is not done, regardless of green tests. Green proves correctness; the number proves the point of the refactor.
6. **One phase per session/commit**, suite green each time, so any phase can ship or roll back independently.

---

## 8. Fast orientation commands

```bash
# what's landed on the branch
git log --oneline feature/ssrm-dataprovider-refactor..HEAD

# the hub that must shrink
wc -l packages/data/host-data/src/runtime/worker/SharedWorkerDataServicesHub.ts

# prior baseline outputs to diff against
ls apps/scripts/ssrm-perf/out/

# full data suite (the gate)
npx turbo test --filter=@wellsfargo-starui/data

# the plan + this handoff
docs/superpowers/plans/2026-09-12-worker-split-plan.md
docs/superpowers/plans/2026-09-12-worker-split-handoff.md
```
