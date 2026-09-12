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
window ──┬── PlatformServicesClient ── SharedWorker "«appId»-platform"
         │      (catalog RPC + AppData)     · worker ConfigManager (catalog cache)
         │                                  · HubAppDataService (sole AppData writer)
         │                                  · seedIfEmpty on first boot
         │
         └── SharedWorkerDataServicesClient ── SharedWorker "«appId»" (data hub)
                (providers, CSRM deltas,        · provider slots + transports
                 SSRM RPCs + ticks)             · SSRM WASM plane
                                                · own READ-ONLY ConfigManager
```

Three facts make this split cheap:

- **The modules already exist.** `hubCatalogRpc` takes a context interface;
  `HubAppDataService` is a self-contained class. They move; they are not
  rewritten.
- **IndexedDB is shared across workers.** The data hub does not need the
  services worker to READ configs: it keeps its own ConfigManager and reads
  Dexie directly — exactly what it does today. Single-WRITER discipline is
  preserved (services worker owns AppData writes; config writes stay where
  they are today — window ConfigManagers — with invalidations re-targeted).
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
tool-window time-to-interactive (lab window open during the storm).

*Exit:* numbers in this doc's §5; the probe committed and rerunnable.

### W1 — Extract the platform-services worker

- New entry `runtime/worker/platformServicesEntry.ts` + built asset
  `platform-services-worker.mjs` (second entry in the package's worker
  build; `staruiEnsureBuiltAssetsPlugin` learns to check both).
  SharedWorker name `«appId»-platform` (the data worker keeps `«appId»`).
- Move: `hubCatalogRpc` handlers, `HubAppDataService`,
  `WorkerAppDataStore`, worker ConfigManager construction + `seedIfEmpty`
  + hydrate. Delete the moved cases from the hub's dispatch table in the
  same change (repo rule — no shims; every consumer is in-repo).
- New `PlatformServicesClient` (small — the catalog+AppData slice of
  today's `SharedWorkerDataServicesClient`); the existing client drops
  those RPCs. `AppDataMirror` re-targets the services client.
  `wireWorkerCatalogSync` re-targets it too (data-provider/appdata row
  invalidations go to the services worker; the DATA worker's catalog
  staleness is resolved by its on-demand reads — a `refresh-provider` /
  restart reads current rows by construction).
- The data hub keeps a read-only ConfigManager for provider starts and
  the `appDataLookup` template resolution, now reading IndexedDB at
  lifecycle moments (fresh Dexie read replaces the in-memory mirror).

*Exit:* both workers boot; every existing suite green; the demo apps run
unchanged (bootstrap wires both clients); the hub file shrinks below the
800-line ceiling as the moved sections leave.

### W2 — Boot rework, app-load warm-up, ordering hardening

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

## 4. Honest limits — what this split does NOT fix

- **Same-plane contention stays.** A second blotter window's SSRM block
  reads still queue behind ingest on the data worker — that is inherent
  (they share the cache on purpose). This plan fixes tool-window/config
  starvation, not data-plane latency.
- **Two threads still share the CPU.** Under machine saturation the
  services worker's scheduling improves latency because its queue is
  empty, not because cycles appear. The win is queueing isolation.
- **Config WRITES remain window-side** (ConfigManager → Dexie). Moving
  writes into the services worker (single-writer symmetry with AppData) is
  a candidate W4, not assumed here.

## 5. Measurements

| probe | before (W0) | after (W3) |
|---|---|---|
| `list-configs` p50 / p99, idle | — | — |
| `list-configs` p50 / p99, rate=10000 storm | — | — |
| AppData attach→snapshot, storm | — | — |
| Tool-window time-to-interactive, storm | — | — |
| First hosted-grid mount → first paint: lazy vs `warmPlatform` at app load | — | — |
