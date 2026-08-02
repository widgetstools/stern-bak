# Config-Service Load Optimization — Implementation Plan

**Branch:** `feat/config-service-perf` (off `main`, baseline `41d5bdc3`).
**Contract:** `docs/CONFIG_SERVICE_BASELINE.md` §5 (functional scope) and §7
(re-optimization rules) must hold at every step.
**Quarantine:** the abandoned worker-authoritative approach stays on
`feat/worker-config-manager-client` (local + `origin`); nothing here depends
on it.

## Guiding principle

> Each window `await`s only what it needs to paint its own shell and read its
> own config row. Everything else hydrates in the background behind explicit
> readiness signals.

Two hard rules from the failed attempt:

1. The **main-thread `ConfigManager`** stays the config source of truth. Do
   **not** route config reads/writes through worker RPC.
2. Never widen a window's first-paint `await` set — only narrow it and move
   hydration to the background.

## Execution order

Build the **OpenFin multi-window guardrails first** (the original pain is
untested), then measure, then optimize phase by phase. Each optimization phase
merges only when its guard plus all prior guards are green.

---

## Workstream A — OpenFin multi-window guardrails ✅ DONE

Target app: **`apps/demos/star-demo`** (Vite :5175, realm `star-demo`, CDP
:9091). Pivoted here from `e2e-openfin-workspace` because star-demo is the
fully-configured reference app — seeded STOMP provider (`dp-121e…` →
`ws://localhost:8081`), dock + provider window, dev test bridge — so blotters
actually load and tick rows. (`e2e-openfin-workspace`'s blotter never loads
rows in any environment and its old smoke spec referenced an
`__openfinWorkspaceApi` the app never set.)

Harness: `e2e-openfin/` (Playwright + `@openfin/node-adapter`, single worker).
Written fresh against the baseline (not cherry-picked).

- **A1 — multi-blotter launch.** ✅ `platform.openBlotter(instanceId)` →
  `Platform.createWindow({ url: '/blotters/marketsgrid?instanceId=…',
  customData:{instanceId} })`. `useHostedIdentity` reads `customData.instanceId`
  so each window scopes its own profile-set row; the `?instanceId=` makes each
  CDP URL unique for Playwright matching. New windows need a fresh
  `connectOverCDP` to surface.
- **A2 — fixture.** ✅ `e2e-openfin/fixtures/launchOpenFin.ts` — node-adapter
  `launch`+`connect` for control + the IAB test bridge; `chromium.connectOverCDP`
  for DOM. `waitForPlatformReady` via `bridge.getWorkspaces()`. Auto per-test
  blotter cleanup so windows don't accumulate.
- **A3 — specs** under `e2e-openfin/specs/` (6 tests, all green; full run ~1.9m
  warm):
  - `blotter-smoke` — single blotter mounts + loads STOMP rows + ticks.
  - `multi-blotter-load` — 3 blotters all reach interactive grids with rows;
    *"Connecting to ConfigService…"* never persists. **Primary regression guard.**
  - `multi-blotter-late-join` — warm second blotter attaches + shows rows (logs
    measured warm time; baseline ~12.5s → Phase 5 tightens the budget).
  - `workspace-persistence` — save → get-by-id → delete round-trips through the
    config-service-backed WorkspacePlatform storage. (The appId-scoped
    `getWorkspaces` list is intentionally not asserted — separate scoping
    concern; by-id is the authoritative contract.)
- **A4 — wire-up & docs.** ✅ `npm run e2e:openfin` runs the suite (webServers:
  stomp :8081 + star-demo :5175). `e2e-openfin/README.md` updated.

> The first run on a cold machine downloads the pinned OpenFin runtime
> (one-time, >1 min); `playwright.config.ts timeout` is sized for it. Warm boot
> ~15s.

---

## Workstream B — Phase 0: measurement ✅ DONE

- **B1 — load marks.** ✅ `packages/data/host-data/src/bootstrap/loadMarks.ts`
  (new). `performance.mark`-based milestone helpers (`markConfigReady`,
  `markHubConnected`, `markAppDataReady`, `markCatalogReady`,
  `markPlatformReady`) plus readers (`readLoadMilestone`, `readLoadTimings`).
  Each mark's `startTime` is the time-to-milestone in ms from `timeOrigin`.
  Idempotent (a milestone marks at most once per realm) and a full no-op when
  `performance.mark` is unavailable, so it is always safe to call from
  bootstrap. Exported from `@wellsfargo-starui/host-data` (root + `bootstrap` barrel).
  Unit-covered by `loadMarks.test.ts` (5 tests).
- **B2 — instrumentation.** ✅ `ensureConfigReady` stamps `config-ready` after
  `ConfigManager.init`; `ensureDataServicesHub` stamps `hub-connected` (client
  wired), `appdata-ready` (mirror snapshot), `catalog-ready` (worker catalog
  preload); `ensurePlatformReady` stamps `platform-ready` after `bundle.ready`.
  Measurement only — no behavior change; all 349 host-data unit tests stay
  green.
- **B3 — budget guard.** ✅ Two time-to-interactive assertions added to
  `e2e/container-config-service.spec.ts` (`time-to-interactive budget`
  describe): cold boot (empty IndexedDB → full seed) and warm reload both read
  the `starui:platform-ready` mark and fence it. Budgets are intentionally
  generous headroom over the deterministic baseline (`platform-ready` ~1.2–1.4s
  observed): **cold < 12s, warm < 8s** — they fail loud on an envelope
  regression rather than tracking jitter, and the full ladder is logged
  (`[ttibudget] …`) every run so the baseline stays visible. `readLoadTimings`
  helper in `e2e/helpers/containerHost.ts` polls until `platform-ready` lands.
  Tighten the budgets as Workstream C phases land.

> Baseline ladder (container host, deterministic mock providers):
> `config-ready ≈ hub-connected ≈ 1.07s → appdata-ready ≈ catalog-ready ≈
> platform-ready ≈ 1.2–1.4s`. The gap from hub-connected to appdata-ready is the
> worker snapshot + catalog preload — Workstream C Phases 2/5 target it.

> **Side fix landed here:** the branch revert left stale `dist/` under
> `packages/openfin/*` still importing a removed `host-data` export
> (`getWorkerConfigHubScriptUrl`). Source-mode Vite resolution prefers an
> existing `dist/` file, so the container app failed to boot until the openfin
> bucket was rebuilt + re-propagated. Unrelated to Phase 0 but was blocking the
> guard; resolved by rebuilding `@wellsfargo-starui/host-openfin` + `@wellsfargo-starui/openfin-platform`.

---

## Workstream C — optimization phases (each with its guard)

### Phase 1 — Bound the identity gate ✅ DONE *(guard: A3 + container guardrail #1)*
`packages/react-core/widgets-react/src/hosted/useHostedIdentity.ts`:
- ✅ `instanceId` seeded **synchronously** (`useState` initializer:
  URL `?instanceId=` → `defaultInstanceId`) so the grid mounts on first paint;
  the OpenFin `customData` refine overrides it on the next tick (and is a no-op
  in the browser).
- ✅ `withTimeout(fin.me.getOptions(), 3s)` via a shared `readHostCustomData()`
  helper — one bounded round-trip now feeds both `instanceId` and the
  registered-component metadata; on timeout/error the synchronous seed stands,
  so a wedged runtime can no longer strand the window.
- ✅ Synchronous `configManagerOverride` (state initializer); lazy host path is
  **peek-first** (`peekConfigManager()` returns the Provider-realm singleton
  with no await), falling back to `getConfigManager()` which is diagnostically
  bounded (`CONFIG_MANAGER_SLOW_MS = 8s` warns but never drops the manager, so
  persistence is never lost).
- ✅ `ready` is now always `true` (instanceId seeded synchronously); retained
  for API compat. The three hosted-identity unit tests updated to await the
  specific async refine (`instanceId === 'OF-INSTANCE'` / storage-wrap) instead
  of `ready`.

> Validated: widgets-react 171 unit tests + typecheck green; container
> guardrails 6/6 (interactive-state test ~7.5s, no placeholder stick); OpenFin
> guardrails 6/6 with warm late-join **~10.7s** (down from ~12.5s baseline —
> the synchronous seed removes the first-paint gate). Note the placeholder is
> gated on `identity.instanceId` **and** `identity.configManager`, so the
> synchronous instanceId seed is what actually unsticks the common
> getOptions-hang case; the CM peek/bound handles the secondary path.

### Phase 2 — Split `bundle.ready` into parallel signals ✅ DONE *(guard: A3 + container persistence/template guards)*
- ✅ `IDataProvider.ts` — `DataServicesHubBundle` now exposes `appDataReady`
  (AppData mirror snapshot) + `catalogReady` (worker catalog preload);
  `ready = Promise.all([appDataReady, catalogReady])` retained for full-hydration
  callers.
- ✅ `ensureDataServicesHub.ts` — `buildReadiness()` kicks both signals off in
  parallel (was sequential: appData *then* catalog) and returns the bundle as
  soon as the hub connection is established (`markHubConnected`), no longer
  awaiting full hydration. No-op rejection guards keep unawaited signals from
  surfacing as unhandled rejections.
- ✅ `ensurePlatformReady.ts` — returns once config + hub connection are
  established; `markPlatformReady` + `markPlatformWarm` now fire in the
  background off `bundle.ready` (attach-mode stays correct — warm marker still
  implies full hydration). AppData bootstrap hooks run in the background off
  `bundle.appDataReady`.
- ✅ `ProviderClientAdapter.start()` — **safety net**: since the platform now
  returns before catalog preload, a grid can attach mid-hydration. `start()`
  now waits for `waitForCatalogReady()` and retries the catalog lookup once
  before throwing, so row loading is preserved.
- ✅ `DataHubProvider.tsx` `hubToDataServices` — maps `DataServices.ready` to
  `appDataReady` (not the combined `ready`), so eager/template mode
  (`dataServicesMode='eager'`) suspends only on AppData hydration, never the
  catalog preload. Lazy mode (default) paints immediately as before.
- ✅ `star-demo` `FullGate` — needed **no change**: it suspends on
  `initPlatformBootstrap()`, which now resolves at hub-connect instead of full
  hydration, so the route paints earlier automatically.

> Validated: host-data 349 + host-data-react 8 unit tests, typecheck across
> both packages; container guardrails 6/6 (ladder now shows `appDataReady` ≈
> `catalogReady`, confirming the parallel resolve); OpenFin guardrails 6/6 with
> multi-blotter-load ~16s (was ~20s in the Phase 1 run) and warm late-join
> ~10.2s. The `ensurePlatformReady` unit tests were updated to await
> `bundle.ready` / `bundle.appDataReady` before asserting the now-backgrounded
> warm marker + AppData-bootstrap calls.

### Phase 3 — On-demand single-provider config *(guard: container provider-selection + new attach test)* — **DONE**
`packages/react-core/widgets-react/src/v2/markets-grid-container/MarketsGridContainer.tsx`
+ provider-attach path (`useDataProvider` / `ProviderClientAdapter`): resolve
the one needed provider by id instead of gating attach on
`waitForCatalogReady()`. Catalog still preloads in background for the picker.

> **Done.** `ConfigCatalogCache.ensure(providerId)` resolves one provider on
> demand — returns the cached row if present, else a single `ConfigManager`
> read (no full `loadAll`) and caches the result. The worker's `get-config`
> handler is now async and calls `ensure()`, so a grid that needs exactly one
> provider no longer waits on the whole catalog preload; caching the row means
> the synchronous `handleAttach` lookup that follows finds it. `ProviderClientAdapter.start()`
> dropped the Phase 2 `waitForCatalogReady()` retry — the single on-demand
> `get-config` resolves mid-preload. `MarketsGridContainer` needed no change:
> it already attaches via the per-provider `useDataProviderConfig` →
> `getProviderConfig` (now on-demand) and gates `providerReady` on
> `activeRow.loading`, not the full list; `useDataProvidersList` still drives
> the picker off the background full-catalog preload (refreshing on
> `catalog-ready`).
>
> Validation: new unit coverage — `ConfigCatalogCache.ensure()` (cached vs
> single-row fetch, unknown-provider null, no second fetch), worker
> `get-config resolves a provider on demand before the catalog preloads`, and
> `ProviderClientAdapter` `start() resolves the provider on demand when the
> catalog never preloaded`. host-data 354/354 + host-data-react 8/8 green;
> container guardrails 6/6 (cold platform-ready ~1.1s, warm ~1.0s); OpenFin
> guardrails 6/6 with multi-blotter-load ~15.9s and warm late-join ~11.2s.
> The `SharedWorkerDataServicesHub` get-config tests now await a tick (the
> handler is async) and match replies by `reqId`.

### Phase 4 — Cold-start seed dedup *(guard: A3 late-join + warm-window e2e; strongest tests)* — **DONE**
`packages/data/host-config/src/ConfigManager.ts` (`seedIfEmpty`),
`crossWindowStorage.ts`, `ensurePlatformReady.ts`: cross-window seed-in-flight
lock (localStorage marker keyed by `seedConfigUrl`) so worker + main thread
don't both fetch+seed; preserve the stale-warm-marker fallback.

> **Done — implemented with the Web Locks API rather than a localStorage
> marker.** The plan's localStorage marker can't coordinate the SharedWorker:
> `localStorage`/`sessionStorage` don't exist in worker contexts, and the
> worker is one of the contexts that races to seed. `navigator.locks` is the
> only same-origin mutual-exclusion primitive available in **both** windows
> and the SharedWorker, and it auto-releases when a holder is destroyed, so a
> crash mid-seed needs no stale-TTL bookkeeping. `seedIfEmpty()` now wraps the
> fetch+seed body in an exclusive Web Lock keyed by `starui:seed-lock:<url>`
> (`runWithSeedLock`), with the emptiness check moved *inside* the lock
> (`seedIfEmptyLocked`) so a late acquirer finds the rows already present and
> skips the fetch entirely. When `navigator.locks` is unavailable (older
> runtime / jsdom) it falls back to running directly — `bulkPut` is idempotent
> on primary key, so a concurrent seed is wasteful but still correct.
> `ensurePlatformReady.resolveAttachMode` (the cross-window warm-marker
> fast-path) is unchanged and still preserved — the lock is the finer-grained
> guard for the simultaneous cold-start window where no warm marker exists yet,
> so no `crossWindowStorage.ts` change was needed.
>
> Validation: new `configManager.seedLock.test.ts` — a serializing mock
> `navigator.locks` proves two managers booting concurrently fetch + seed
> exactly once (`fetch` called 1×, `maxActive === 1`), both requesting an
> exclusive lock named `starui:seed-lock:<url>`, and no lock is taken when
> there is no `seedConfigUrl`. Full host-config suite 142/142 green (existing
> seed tests cover the no-locks fallback). Container guardrails 6/6 (cold
> platform-ready ~0.95s, warm ~1.0s); OpenFin guardrails 6/6 with three-blotter
> cold load ~15.7s and warm late-join ~10.1s — no regression.

### Phase 5 — Warm-path fast attach *(guard: warm-second-window budget test)* — **DONE**
Mostly verification: a warm second window connects, sees catalog hydrated, and
paints within budget. Add the budget assertion; close any gaps.

> **Done.** Verification confirmed the warm path is already optimal after
> Phases 1-4: a second blotter joining an already-warm hub takes the attach
> fast-path — `ensureConfigReady` runs in attach mode (no re-seed; the warm
> marker is set and Phase 4's lock means the cold seed already completed once),
> the hub connection is reused, and Phase 3's on-demand `get-config` resolves
> the provider from the already-hydrated worker cache. No first-paint gate sits
> on `waitForCatalogReady()` anymore (it only feeds the Phase 2 `catalogReady`
> promise inside `buildReadiness`, never the bundle return), so there were no
> code gaps to close.
>
> Guard added: `e2e-openfin/specs/multi-blotter-late-join.openfin.spec.ts` now
> asserts a tight `WARM_ATTACH_BUDGET_MS = 25_000` against the measured elapsed
> (was a loose 60s Playwright timeout with no assertion). Rows are awaited with
> a generous 60s ceiling so a slow-but-loading window fails on the explicit
> budget assertion (clear message) rather than an opaque row timeout. Observed
> warm second-window attach: ~10.3s — ~2.4x under budget. OpenFin guardrails
> 6/6.

---

## Status — all phases complete

Workstream A + Phases 0-5 are done. The "Connecting to ConfigService…" stall and
multi-blotter hangs that motivated this work are eliminated and pinned by
guardrails: container TTI budgets (cold platform-ready ~0.95s / warm ~1.0s) and
OpenFin star-demo guardrails (cold three-blotter load ~16s, warm fast-attach
~10s with a 25s hard budget). Re-run the suites in
[Verification](#verification) before shipping.

---

## Verification

```
npm run e2e:container                       # browser guardrails (fast)
npm run e2e:openfin                         # multi-window guardrails (runtime)
npx vitest run -w @wellsfargo-starui/host-data         # bootstrap/hub units
npx vitest run -w @wellsfargo-starui/widgets-react     # hosted identity units
```

## Risk & rollback

| Phase | Risk | Guard |
|-------|------|-------|
| 0 measure | none | new budget test |
| 1 identity gate | low | A3 + container #1 |
| 2 readiness split | medium | A3 + container persistence/template |
| 3 on-demand provider | medium | provider-selection + attach test |
| 4 seed dedup | medium-high | A3 late-join + warm-window |
| 5 warm attach | low | warm-window budget |

All changes additive on `feat/config-service-perf`; each phase is independently
revertible.
