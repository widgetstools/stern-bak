# Splitting the SharedWorker: platform services out of the data plane

**Status:** proposed · phases W0–W3 open · branch `feature/worker-hub-config-refactor`
**Problem owner's statement (2026-09-12):** config + AppData + data providers
hosted in a single SharedWorker is a bottleneck — the worker is single-
threaded, so while it publishes high-frequency updates to a blotter, tool
windows opening take a long time because their config requests wait on the
same thread.

---

## 1. The bottleneck, mechanically

One SharedWorker (`runtime/worker/entry.ts` → `SharedWorkerDataServicesHub`)
hosts THREE planes over one event loop and one port protocol:

1. **Data plane, high frequency** — STOMP ingest → `flattenRows` → WASM
   `apply_message_json` (synchronous, milliseconds per batch at trading
   rates), the SSRM tick loop (`flushSsrmTicks` per `publishWindowMs`),
   CSRM delta fan-out (`providerEmit.ts`), block RPCs.
2. **Config catalog, low frequency** — `hub-ready` / `get-config` /
   `list-configs` / `config-invalidate` / `hub-introspect` /
   `provider-running` (`hubCatalogRpc.ts`).
3. **AppData, low frequency** — attach/snapshot/delta/set/upsert/ack
   (`HubAppDataService.ts` — the sole IndexedDB writer for AppData rows).

A JS worker cannot preempt a macrotask. A `list-configs` that arrives while
a 20k-row snapshot batch is ingesting waits for that batch AND everything
already queued ahead of it — at 10k updates/sec the queue is never short.
This is why in-worker prioritization is a non-fix: reordering the queue
cannot shorten the running macrotask, and ingest batches ARE the macrotasks.
Isolation requires a second thread, and for cross-window sharing that means
a second SharedWorker.

**Evidence to date** (to be formalized by W0): the hardening handoff's
first-window cold measurements put multi-second windows on the data plane
during snapshot streaming; WORKLOG item 14 is a first-run catalog read that
stalled — `hubCatalogRpc.ts` now carries a reply deadline precisely because
a catalog read behind a busy boot had no bounded latency. Tool windows use
`ensureConfigReady` (main-thread ConfigManager, no hub) partly to dodge
this — but anything needing AppData or worker catalog answers still queues
behind ingest.

## 2. Target shape

```
window (THIN: no Dexie, no ConfigManager, no seeding — two ports + RPC)
   ├── PlatformServicesClient ── SharedWorker "«appId»-platform"
   │      (config reads AND writes,   · the ONLY ConfigManager / Dexie owner
   │       AppData, invalidations)    · HubAppDataService (sole AppData writer)
   │                                  · seedIfEmpty on first boot
   │                                  · per-window config-snapshot RPC + push invalidations
   └── SharedWorkerDataServicesClient ── SharedWorker "«appId»" (data hub)
          (providers, CSRM deltas,       · provider slots + transports
           SSRM RPCs + ticks)            · SSRM WASM plane
                                         · own READ-ONLY ConfigManager (Dexie reads
                                           at provider lifecycle moments only)
```

**Thin-window principle (2026-09-12 requirement):** a window must not LOAD
config/AppData — it REQUESTS them. Today every window constructs its own
ConfigManager (Dexie open + seed-identity check + catalog preload + AppData
bootstrap hooks, all on that window's main thread, all contending with the
storming data worker) — the observed tens-of-seconds window opens. After
the split a window's boot is: connect two SharedWorker ports, one
`config-snapshot` RPC (kilobytes), subscribe invalidations — interactive in
the low hundreds of milliseconds regardless of data-plane load, because the
services worker's queue is empty by construction. This covers the grid
customizer too: its profile/config storage adapter re-targets the services
client, and the services worker keeps a per-`gridId` profile cache in
memory so the Nth window opening the same blotter gets its profile from
worker RAM, not an IndexedDB re-read.

Three facts make this split cheap:

- **The modules already exist.** `hubCatalogRpc` takes a context interface;
  `HubAppDataService` is a self-contained class. They move; they are not
  rewritten.
- **IndexedDB is shared across workers.** The data hub does not need the
  services worker to READ configs: it keeps its own read-only ConfigManager
  against the same Dexie DB. Single-WRITER discipline goes FURTHER than
  first drafted: the services worker owns ALL config and AppData writes —
  windows never touch Dexie at all (`wireWorkerCatalogSync` and the
  window-side ConfigManager leave the window boot path entirely; the
  customizer's saves become services-client RPCs). One writer, one truth,
  no per-window IndexedDB connections.
- **The data hub's config/AppData reads happen at provider LIFECYCLE
  moments only** — start / restart / refresh resolve the cfg and its
  AppData template tokens (`SharedWorkerDataServicesHub.ts:574`,
  `appDataLookup`). Rare events → the data worker re-reads IndexedDB on
  demand at those moments. **No worker↔worker bridge port in the design.**
  (If a future feature needs push-fresh AppData in the data plane, a
  BroadcastChannel from the services worker is the escape hatch — decide
  then, not now.)

## 3. Phases

### W0 — Pin the bottleneck with numbers

Extend `apps/scripts/ssrm-perf/` with a config-probe page: while
`stomp-ssrm-minimal` streams at `?rate=10000`, a second window issues
`hub-ready` + `list-configs` + an AppData attach every 500 ms and records
p50/p99. Baseline BEFORE any split, same numbers re-run in W3. The blotter
workload target shape (10 windows / 20k rows / 10k updates-sec) is the
measurement condition, per the platform's standing rule. Also capture
tool-window time-to-interactive (lab window open during the storm). Also
baseline the W4 target now: 10 CSRM windows attaching to one 20k-row
provider — per-window time-to-full-paint and the FIRST→LAST spread (the
"almost simultaneously" number), idle and under ticks.

*Exit:* numbers in this doc's §5; the probe committed and rerunnable.

### W1 — Extract the platform-services worker

**W1a landed (2026-09-12): dual-worker wiring.** `createPlatformServicesWorker`
spawns `mkt-platform-services:«appId»` FIRST (staging: same worker bundle —
a second instance whose provider machinery never receives an attach);
`HubConnection` carries both workers + both clients (the client class is
port-generic); AppData attaches through the platform client
(`bootstrapDataServices.appDataClient`), catalog readiness gates on the
platform client, catalog invalidations go to both workers (until W1c
narrows the data hub to on-demand reads), and the bundle exposes
`platformClient`. Live-verified: rows from the data worker, all five
`starui:*` marks incl. catalog/appdata served by the platform worker,
probe on the platform port max 1.3 ms during a snapshot re-stream. Both
workers still run `seedIfEmpty` (in-lock idempotent) during staging.
**W1b landed (2026-09-12): the slim host.** `PlatformServicesHost` —
catalog RPC handlers + `HubAppDataService` + `ConfigCatalogCache`,
nothing of the data plane — installed by the SAME bundled asset via a
`self.name` branch in `defaultEntry` (`mkt-platform-services:*` → slim
host; else full hub). One asset, zero app churn, no second `?url`
import; the platform instance never executes the lazy stompjs/WASM
graph. `entry.ts` gained one shared port-lifecycle `install()` serving
both brains. Introspection RPCs answer honestly for the services worker
(zero providers). Live-verified: catalog + AppData served by the slim
host, probes healthy through a snapshot re-stream. (A dedicated slim
ASSET remains an optional size optimization, no longer a phase gate.)
Remaining in W1: **W1c** — delete catalog/AppData serving from the data
hub (read-only stores for provider-lifecycle template resolution),
services worker becomes sole seeder, hub under the 800-line ceiling.

- New entry `runtime/worker/platformServicesEntry.ts` + built asset
  `platform-services-worker.mjs` (second entry in the package's worker
  build; `staruiEnsureBuiltAssetsPlugin` learns to check both).
  SharedWorker name `«appId»-platform` (the data worker keeps `«appId»`).
- Move: `hubCatalogRpc` handlers, `HubAppDataService`,
  `WorkerAppDataStore`, worker ConfigManager construction + `seedIfEmpty`
  + hydrate. Delete the moved cases from the hub's dispatch table in the
  same change (repo rule — no shims; every consumer is in-repo).
- New `PlatformServicesClient` (the catalog+AppData slice of today's
  `SharedWorkerDataServicesClient`, PLUS config writes: save / delete
  become RPCs so the services worker is the only Dexie writer and
  `wireWorkerCatalogSync` dissolves — invalidations originate where the
  write lands and push to every subscribed window). `AppDataMirror`
  re-targets the services client. The grid customizer's config-service
  storage adapter re-targets it too, with the per-`gridId` profile cache
  served from worker memory. The DATA worker's catalog staleness is
  resolved by its on-demand reads — a `refresh-provider` / restart reads
  current rows by construction.
- The data hub keeps a read-only ConfigManager for provider starts and
  the `appDataLookup` template resolution, now reading IndexedDB at
  lifecycle moments (fresh Dexie read replaces the in-memory mirror).

*Exit:* both workers boot; every existing suite green; the demo apps run
unchanged (bootstrap wires both clients); the hub file shrinks below the
800-line ceiling as the moved sections leave.

### W2 — Boot rework, app-load warm-up, ordering hardening

**W2 landed (2026-09-12, Windows target).** `ensureConfigReady` is the
thin-window tier (platform port first and alone; read-only attach-mode
IndexedDB; gated on the services worker's catalog; config writes become
`config-save` / `config-delete` RPCs through `ConfigManagerOptions.writer`
so the services worker is the single writer and self-invalidates —
`wireWorkerCatalogSync` deleted); `warmPlatform()` as specified
(stats-mode attach = running provider, zero fan-out); the installer
ordering is test-pinned (every port attached before hydrate, dispatch
backlogged — WORKLOG 14 closed with its forensic cause); star-demo's
OpenFin provider window calls `warmPlatform(config, { providers:
'autoStart' })`. The per-`gridId` worker-RAM profile cache was NOT built:
profile reads are window-local IndexedDB primary-key gets behind the
ConfigManager's row cache and never touch the data worker's thread.
Numbers in §5.

- **`warmPlatform()` — the one-line app-load call.** Today the worker is
  created when the first hosted grid MOUNTS (`DataHubProvider` defaults to
  `mode: 'lazy'` → `ensurePlatformReady` on mount), so the first grid's
  paint pays the whole platform boot. New public API:

  ```ts
  // index.html / app entry / OpenFin dock bootstrap — fire and forget:
  warmPlatform(bootstrapConfig, {
    workerScriptUrl?,          // same resolution rules as ensurePlatformReady
    providers?: 'autoStart' | string[],  // hydrate + start these once the hub is up
  });
  ```

  Semantics: returns a promise nobody needs to await; kicks the worker
  spawn(s) + catalog/AppData hydrate + the named providers' starts, all
  off the UI thread. It is `ensurePlatformReady` + provider warm-up under
  a deliberate name — and it MERGES with the lazy path through the
  existing per-`appId` promise maps (`configReadyPromises` /
  `platformPromises` / `hubPromises`), so the grid-mount fallback stays
  exactly as it is: whichever caller runs first owns the flight, the
  other attaches to it, nothing double-boots. Repeat calls are no-ops.
  Post-W1 the call is genuinely non-blocking: `seedIfEmpty` and hydrate
  live in the services worker, so the main thread holds promises and
  nothing else (today `createConfigManager` + Dexie open/seed run on the
  MAIN thread — the split is what makes "async and off-thread" true
  rather than aspirational).
  Provider warm-up uses the late-join machinery the container already has
  (`isProviderRunning` / `waitForProviderRunning`): a grid mounting after
  `warmPlatform` attaches to a RUNNING provider and paints from cache.
- **OpenFin:** the dock/workspace bootstrap calls `warmPlatform` while
  the dock loads, so by the time a user launches a blotter view the hub
  is up and its `autoStart` providers are streaming. Note the existing
  `acquireBackgroundFreezeExemption` in `ensurePlatformReady` — the warm
  call typically runs in a hidden/background window, exactly the case
  that lock exists for; W2 verifies it covers the dock-boot path.
- `ensurePlatformReady` spawns the services worker FIRST and gates
  window-interactive on it alone; the data worker spawn + provider warm
  happen behind it without blocking config consumers.
  `ensureConfigReady` upgrades from "main-thread ConfigManager only" to
  "services worker attached" so tool windows get worker-served catalog +
  AppData without ever touching the data plane.
- Make the services worker's hydrate ordering explicit and test-pinned —
  this is the WORKLOG-14 class (first-run catalog read stall): the RPC
  port handler must be installed before hydrate awaits, and every catalog
  read keeps the bounded-reply deadline.
- Warm-session markers (`platformWarmSession.ts`) and the freeze-exemption
  lock reviewed for two-worker reality.

*Exit:* cold-start trace shows tool-window config readiness independent of
data-plane state; WORKLOG 14 closed or reduced to a pinned regression test;
a demo app calls `warmPlatform` from its entry (grid mounts measurably
faster than the lazy path — number recorded in §5) while a second demo
keeps the lazy-only path to prove the fallback still boots everything.

### W3 — Re-measure, soak, document

W0 probe re-run (expectation: config RPC p99 under a 10k-updates/sec storm
within noise of idle p99 — single-digit milliseconds — versus the W0
baseline); `ssrm-multiwindow.mjs` soak with the split (PAGES=2 parity with
the handoff §4b numbers, then the deferred PAGES=6); docs
(`current-features`, `APPS_REPO` if worker assets are consumer-visible,
handoff cross-reference), and deletion sweep of anything the split
orphaned.

### W4 — CSRM snapshot fan-out: 20k rows × 10 blotters, almost simultaneously

What already exists (build on it, don't reinvent): the replay path keeps
**bucketed, pre-encoded binary chunks** with per-bucket invalidation
(`runtime/worker/replayCache.ts` — attach cost is proportional to recent
churn, not cache size) over the columnar codec
(`hubEncoding.encodeChunk` → `wire/columnarCodec.ts`), and `broadcast`
fans one event template to every listener. Encoded `ArrayBuffer`s are
POSTed un-transferred, so each port pays a memcpy-grade structured clone
of bytes — already far cheaper than cloning 20k row objects per window.

What W4 changes:

1. **Interleave, don't serialize.** Today N simultaneous attaches run
   `replayCacheToPort` to completion one window at a time — window 10's
   first chunk waits for nine full replays. Replace with a round-robin
   chunk scheduler: one pass posts chunk k to every pending replay before
   chunk k+1 to any, yielding to the macrotask queue between passes so
   provider ingest and block RPCs breathe. First→last spread collapses
   from O(9 × replay) to O(one pass).
2. **One encode for both paths.** The live `replace` broadcast and the
   late-join replay must share the same bucketed encoded chunks (one
   encode per bucket per churn, whatever the audience count).
3. **Backpressure-aware pacing** per port (the socket-high-water idea the
   STOMP server uses): a stalled hidden window must not hold the
   round-robin pass hostage — skip it, catch it up next pass.
4. **SharedArrayBuffer, gated stretch.** With `crossOriginIsolated`
   (OpenFin can set COOP/COEP; the web app needs server headers), the
   encoded snapshot region becomes ONE SAB all windows read — zero copies
   at fan-out. Designed behind the same `EncodedChunk` seam so it is a
   transport swap, not a rewrite; only attempted after 1–3 are measured.

*Exit:* the W0 10-window baseline re-run — target: last window's
full-paint within ~1.5× the first window's, and total hub-thread time for
the fan-out within ~2× a single-window replay (encode once + N buffer
posts). Numbers into §5.

## 4. Honest limits — what this split does NOT fix

- **Same-plane contention stays.** A second blotter window's SSRM block
  reads still queue behind ingest on the data worker — that is inherent
  (they share the cache on purpose). This plan fixes tool-window/config
  starvation, not data-plane latency.
- **Two threads still share the CPU.** Under machine saturation the
  services worker's scheduling improves latency because its queue is
  empty, not because cycles appear. The win is queueing isolation.
- **Decode cost stays per window.** Encoded snapshot buffers fan out
  cheaply, but each window still decodes and builds row objects on its own
  main thread — that is parallel across windows (each has its own thread)
  and is not a hub bottleneck, but it bounds single-window paint time.

## 5. Measurements

**W0 run: 2026-09-12**, `apps/scripts/ssrm-perf/worker-baseline.mjs`
(synthetic catalog RPCs injected on the hooked worker port — no app
changes), production previews, stomp-view-server 20k rows, M-series macOS.
Raw JSON in `apps/scripts/ssrm-perf/out/worker-baseline-*.json`.

**Hardware reality (binding constraint, 2026-09-12):** development is an
M4 Max / 32 GB — close to the fastest single-thread CPU shipping. The
deployment target is **Windows 11 / 32 GB corporate hardware**: expect
2–5× slower single-thread, efficiency-core scheduling, AV scanning. Every
number below measured natively is a LOWER BOUND. Rule for all phases:
exit gates run twice — native and `THROTTLE=4` (the harness's CDP
Windows proxy) — and final acceptance happens on the actual Windows 11
target. The proxy itself UNDERSTATES Windows: CDP throttles page
renderer threads only, the SharedWorker thread cannot be throttled from
Playwright, so worker-side costs (ingest, encode, fan-out posting) still
ran at M4 speed in every `THROTTLE=4` row.

| probe | native (M4 Max) | THROTTLE=4 (Windows proxy, worker unthrottled) | Windows native² (W1b HEAD) | after (W3/W4) |
|---|---|---|---|---|
| `list-configs` p50 / p99, idle | 0.2–0.3 / 0.4–0.5 ms | 0.1 / 0.5 ms | 0.3 / 0.6 ms | — |
| `list-configs` p50 / p99, rate=10000 storm (steady state) | 0.1–0.2 / 0.9–2.1 ms | 0.2 / 0.6 ms | 0.3 / 0.7 ms | — |
| config RPC DURING 20k snapshot re-stream — p99 / MAX | 0.8 / 1.4 ms | 1.0 / **103.8 ms** | 0.7 / **53.5 ms** | — |
| Fresh window open mid-storm: wall→rows / `platform-ready` | 225–267 / 70–88 ms | **924 / 219 ms** | 762 / 187 ms | — |
| 10 CSRM windows × 20k: first window (pays broker snapshot) | 4 806 ms | 3 683 ms¹ | 4 343 ms | — |
| 10 CSRM windows × 20k: 9 joiners, per-window full paint | 1 091 → 2 337 ms (p50 1 950) | 2 642 → **5 437 ms** (p50 4 539) | 2 400 → 3 225 ms (p50 2 579) | — |
| 10 CSRM windows × 20k: joiner spread / last÷first | 1 246 ms / 2.14× | **2 795 ms** / 2.06× | 825 ms / 1.34× | — |
| Joiner `platform-ready` during the fan-out | 138–220 ms | 235–494 ms | 466–754 ms | — |
| Hub-thread ms consumed by the fan-out (encode + post) | needs worker-side timing (W4 adds it) | — | — | — |

¹ broker-paced (network dominates), and the second C run rides the prior
run's warmed broker snapshot cache — not comparable across runs.

² **Windows 11 target box, 2026-09-12** (`worker-baseline.mjs`,
`TAG=win-w0-w1b`, raw JSON `out/win-w0-w1b-*.json`), run on the W1b HEAD
as the handoff's first task. Two caveats make it a *pre-W1c/W2/W4*
column rather than a pristine "before": the dual worker was already
spawned, and the harness's catalog probe rode `ports[0]` — since W1a that
is the PLATFORM port, so the A-rows here already show queueing isolation
(the 53.5 ms max during the re-stream is on the platform worker, most
plausibly the re-save `config-invalidate` Dexie read + AppData resync
landing under the probe, not ingest — W3 re-probes both ports by name).
The B/C rows are untouched by W1: on this box the joiner ladder is
1.34× (target ≤ 1.5×) and the spread 825 ms — the W4 gate must move from
here, not from the Mac numbers.

**W1c landed (2026-09-12, Windows native, `TAG=win-w1c`, raw
`out/win-w1c-*.json`; the harness now probes BOTH ports by worker name —
`hub-ready` / `list-configs` on the platform port, the scalar
`provider-running` on the data port).** Config probe unchanged-or-better
on every row: idle 0.3 / 0.5 ms, storm 0.3 / 0.6 ms, during the 20k
re-stream p99 0.4 ms / **max 0.6 ms** (the W1b column's 53.5 ms max did
not recur); the data-port probe stays at p99 0.4–0.5 ms / max 0.5 ms
across idle, storm and re-stream — on this box the SSRM ingest macrotasks
are short enough that even the data plane answers a scalar RPC within a
millisecond. Fresh window mid-storm 614 ms wall→rows, `platform-ready`
157 ms (was 762 / 187). The live probe that gated this phase also
uncovered a first-window message-loss race in the worker installer
(WORKLOG item 14's forensic cause, fixed in the same change): before it,
a cold first window's `appdata-ready` / `catalog-ready` /
`platform-ready` marks never fired. 10-window CSRM: joiners
1 993 → 3 322 ms (p50 2 576, spread 1 329 ms, last÷first 1.67×) — same
band as the W1b column within run-to-run noise; the first window read
12.7 s on this run against 4.3 s before — traced (navigation + resource
timing) NOT to the platform but to the demo page's `<link>` to Google
Fonts stylesheets, which block `DOMContentLoaded` and every bootstrap
behind it on an external fetch: 11.1 s, 1.7 s and 0.1 s for the same
request across three cold windows on this box, with spawn →
`platform-ready` a steady ~140 ms and spawn → 20k rows ~1.3 s underneath.
The harness now aborts the font hosts and records each window's spawn
offset so first-window numbers decompose into page vs platform; the
demo apps should self-host or defer those fonts (see WORKLOG 17) — on a
proxied corporate box this alone is seconds of a "slow window open".
Re-sampled with the fonts isolated (`win-w1c-c3`): first window 1 476 ms
(spawn at 201 ms, `platform-ready` 335 ms), joiners 2 449 → 3 644 ms
(p50 3 072, spread 1 195, last÷first 1.49×).

**W2 landed (2026-09-12, Windows native, `TAG=win-w2`, raw
`out/win-w2-*.json`, fonts isolated).** Config probe unchanged (idle
0.4 / 0.6 ms, storm 0.3 / 0.6 ms, re-stream p99 1.1 / max 2.6 ms; data
port p99 ≤ 0.7 ms / max 1.4 ms). The thin window's own ladder is the
number this phase is for: fresh window mid-storm `config-ready` 172 ms →
`platform-ready` **177 ms** (5 ms apart — no seed, no seed lock, no
main-thread hydrate; W1c: 145 → 157, W1b: 173 → 187), wall→rows 632 ms of
which spawn at 168 ms — the rest is page JS + grid paint, not platform.
10-window CSRM first window 1 366 ms (spawn 170 ms, `platform-ready`
**222 ms**, i.e. 52 ms after the workers spawned); joiners
2 541 → 3 745 ms (p50 2 937, spread 1 204, last÷first 1.47×), joiner
`platform-ready` 789–1 179 ms — unchanged band, as expected: the joiner
ladder is replay + decode + paint, W4's target. The customizer-open timing
(`customizerOpenMs`) is wired in the harness but the SSRM demo's toolbar
does not render the settings button, so it reads `null` there — see the
W3 notes for where it is measured.

### W0 findings — what reproduced and what did not

**Reproduced: the W4 fan-out ladder.** Nine windows attaching at once to a
20k CSRM cache finish in a near-monotonic ladder (1 091 → 2 337 ms) —
per-window serialized replay, exactly the mechanism W4's round-robin
scheduler removes. Platform boot is NOT the cost (joiner `platform-ready`
at 138–220 ms); the ladder is replay + decode + paint queueing.

**Starvation appears under the Windows proxy.** At `THROTTLE=4` the
snapshot re-stream produced a 103.8 ms `hub-ready` stall (native max:
1.2 ms) — the first direct sighting of a config RPC pinned behind
ingest — while mid-storm window opens went 225 → 924 ms and the joiner
ladder reached 5.4 s. All with the WORKER still at native speed; on real
Windows hardware the worker's own macrotasks stretch too, so the
production picture is strictly worse than the proxy — the reported
tens-of-seconds opens are consistent with this trajectory (slower worker
macrotasks × more windows × REST-mode config), not anomalous.

**Not reproduced natively: config-RPC starvation.** Across idle, a
rate=10000 steady storm, and the 20k snapshot re-stream itself, catalog
RPC p99 never exceeded 2.1 ms, and a fresh window opened mid-storm in
~250 ms. The SSRM ingest path batches into SHORT macrotasks
(drain-paced chunks + `publishWindowMs` conflation), so on a fast
machine the queue drains between them. The tens-of-seconds tool-window
opens reported from real deployments therefore come from conditions this
rig did not model, most plausibly: **`useRest: true`** (config reads
become REST round-trips through the worker instead of Dexie),
**OpenFin** (background throttling/occlusion of the worker's owning
context; corporate hardware), **more windows × more providers**
compounding with the CSRM fan-out ladder above, and Windows-class CPUs
where the same macrotasks run several times longer. **W0 follow-up
(open):** re-run this exact probe on a corporate/OpenFin rig with
`useRest: true` before treating the config plane as low-risk — the
architectural argument for the split (queueing isolation, thin windows,
single-writer) stands regardless, but the latency claim should carry the
right numbers for the environment that hurt.
