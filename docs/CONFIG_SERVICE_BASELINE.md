# Config Service — Baseline Behavior & Scope

**Status:** authoritative baseline reference.
**Captured at:** `main` / commit `41d5bdc3` (branch `feat/config-service-perf`),
*before* any worker-authoritative ConfigManager re-optimization.

**Why this document exists.** A previous attempt to make config-service
access faster (the abandoned `feat/worker-config-manager-client` branch)
introduced load regressions — windows that used to open instantly began
hanging on *"Connecting to ConfigService…"* / *"Loading…"*. That branch is
preserved on `origin` for reference but is **not** the path forward.

This document is the **contract**. It records, in minute detail, every way
the config service is created, bootstrapped, read, and written in the
known-good baseline. Any re-optimization (the goal: make every window load
instantaneously with no race conditions) **must preserve every behavior
listed here**. The companion e2e suite (`e2e/config-service/`) encodes these
behaviors as executable guardrails.

---

## 1. Architecture at a glance

The "config service" is the **`ConfigManager`** in `@wellsfargo-starui/host-config`,
backed by a Dexie/IndexedDB database named **`marketsui-config`**, with an
optional REST sync layer when running against a remote config service.

There are **two ConfigManager instances** in a running OpenFin deployment:

| Instance | Lives on | Created by | Role |
|----------|----------|------------|------|
| **Main-thread ConfigManager** | Each window's main thread | `ensureConfigReady` (`@wellsfargo-starui/host-data`) | Profile/gridLevelData CRUD, provider catalog reads, Config Browser, dock/registry, workspace persistence. Passed into the hub as `mainThreadConfigManager`. |
| **Worker ConfigManager** | The SharedWorker (`mkt-data-services:${appId}`) | `defaultEntry.ts` (`createConfigManager` + full `init()`) | Sole IndexedDB writer for the AppData mirror; backs the worker catalog cache; always full-seeds on cold start. |

Both open the **same** `marketsui-config` IndexedDB database (IndexedDB is
shared across threads/windows of an origin). On a cold start they may both
run `seedIfEmpty()`; the second seeder no-ops because the DB is already
populated (emptiness check).

```
┌─────────────────────────── Window (main thread) ───────────────────────────┐
│  ensureConfigReady ──▶ ConfigManager (Dexie marketsui-config) ──▶ REST?     │
│        │                         ▲                                          │
│        │ mainThreadConfigManager │ profiles / providers / dock / registry   │
│        ▼                         │                                          │
│  ensureDataServicesHub ──▶ SharedWorkerDataServicesClient ──┐               │
└─────────────────────────────────────────────────────────────┼─────────────┘
                                                               │ MessagePort
┌──────────────────────── SharedWorker: mkt-data-services ─────▼─────────────┐
│  Worker ConfigManager (Dexie) ──▶ ConfigCatalogCache (providers)           │
│                                └─▶ WorkerAppDataStore (AppData rows)        │
│  installSharedWorkerHub: hydrateCatalog() ─▶ broadcast `catalog-ready`     │
└────────────────────────────────────────────────────────────────────────────┘
```

### Key source files

| Area | Path |
|------|------|
| ConfigManager class + factory | `packages/data/host-config/src/ConfigManager.ts` |
| Row/option types | `packages/data/host-config/src/types.ts` |
| Dexie schema | `packages/data/host-config/src/db.ts` |
| Seeding + identity | `packages/data/host-config/src/normalizeSeedData.ts`, `seedDigest.ts` |
| Profile StorageAdapter | `packages/data/host-config/src/profileStorage.ts`, `profileSet.ts`, `profiles.ts` |
| Visibility / effective user | `packages/data/host-config/src/visibility.ts`, `effectiveUser.ts` |
| REST client | `packages/data/host-config/src/client.ts` |
| Bootstrap (config-only + full) | `packages/data/host-data/src/bootstrap/ensurePlatformReady.ts` |
| Bootstrap config + validation | `packages/data/host-data/src/bootstrap/PlatformBootstrapConfig.ts`, `resolvePlatformBootstrap.ts` |
| Cross-window warm marker | `packages/data/host-data/src/bootstrap/platformWarmSession.ts`, `crossWindowStorage.ts` |
| Hub | `packages/data/host-data/src/hub/ensureDataServicesHub.ts`, `wireWorkerCatalogSync.ts`, `ConfigCatalogCache.ts` |
| Worker entry | `packages/data/host-data/src/runtime/worker/defaultEntry.ts`, `entry.ts` |
| React providers | `packages/data/host-data-react/src/runtime/DataHubProvider.tsx`, `DataServicesProvider.tsx` |
| Provider catalog store | `packages/data/host-data/src/runtime/config/store.ts` |
| Hosted identity | `packages/react-core/widgets-react/src/hosted/useHostedIdentity.ts`, `HostedMarketsGrid.tsx` |
| Workspace persistence | `packages/openfin/openfin-platform/src/workspacePersistence.ts`, `workspace.ts` |
| Dock / registry | `packages/openfin/openfin-platform/src/db.ts`, `launch.ts`, `registryClone.ts` |
| OpenFin config singleton | `packages/openfin/openfin-platform/src/config*` (`getConfigManager`, `peekConfigManager`, `setConfigManager`) |
| Star-demo wiring | `apps/demos/star-demo/src/main.tsx`, `platformBootstrap.tsx`, `platform/Provider.tsx` |

---

## 2. ConfigManager — creation & init

### Factory

```ts
export function createConfigManager(options: ConfigManagerOptions = {}): ConfigManager
```

`ConfigManagerOptions` (`types.ts`):

| Option | Default | Notes |
|--------|---------|-------|
| `appId` | `'dev-app'` (`DEFAULT_APP_ID`) | Deployment id; scopes rows + SharedWorker name |
| `identity` | `{ userId: 'dev-user', displayName: 'Dev User' }` | Session user; owner stamping, private rows |
| `seedConfigUrl` | `undefined` | Deploy-bundle JSON for empty DB |
| `seedConfigReload` | `'empty-only'` | or `'when-changed'` (digest compare) |
| `configServiceRestUrl` | `undefined` | Enables REST mode |
| `dataServices` | `undefined` | AppData mirror handle for ApplicationContext |

Construction side effects (before `init()`): opens `ConfigDatabase`
(Dexie, lazy), creates `ChangeNotifier` (may open
`BroadcastChannel('marketsui-config-changes')`), creates the `profiles`
namespace.

### `init(options?: { mode?: 'full' | 'attach' })`

Idempotent and single-flight (`isInitialized` / `initInFlight` guards;
no-op after `dispose()`).

`performInit` branching:

1. **Not attach** → `await seedIfEmpty()` (fetch + normalize + bulkPut seed
   tables; on `when-changed`, compare digest and re-seed if changed).
2. `await publishApplicationContext()` — **no-op** unless `dataServices` is
   wired; otherwise awaits `appData.ready()` and publishes `AppId`,
   `LoggedInUser`, `ImpersonatedUser=null`, `LoggedInUserProfile`.
3. If REST mode → `startSyncDrain()` (`setInterval`, 10 000 ms).
4. `isInitialized = true`.

**Attach mode** (`init({ mode: 'attach' })`) skips `seedIfEmpty()` — used by
later windows when a prior window already seeded IndexedDB (see §4.3).

> **There is no `ConfigManager.ready()`** — readiness == `await init()`
> resolving. The worker facade `WorkerConfigManagerClient.ready()` is a
> *different* (abandoned-branch) construct and is **not** part of this baseline.

---

## 3. Storage model

### Dexie database `marketsui-config` (schema v4)

| Table | Primary key | Indexes |
|-------|-------------|---------|
| `appConfig` | `configId` | `appId`, `userId`, `[componentType+componentSubType]`, `isTemplate` |
| `appRegistry` | `appId` | — |
| `userProfile` | `userId` | `appId` |
| `roles` | `roleId` | — |
| `permissions` | `permissionId` | `category` |
| `pendingSync` | `++id` | `tableName`, `recordId` |

### `AppConfigRow`

```ts
interface AppConfigRow {
  configId: string;
  appId: string;
  userId: string;
  isPublic?: boolean;
  displayText: string;
  componentType: string;
  componentSubType: string;
  isTemplate: boolean;
  singleton?: boolean;
  payload: any;
  createdBy: string; updatedBy: string;
  creationTime: string; updatedTime: string;
}
```

### `componentType` discriminators (`shared-types/src/configuration.ts`)

`data-provider`, `appdata`, `markets-grid-profile-set`, `dock-config`,
`component-registry`, `workspace`, plus any **registered component**
`componentType` (e.g. `blotter`) when `registeredIdentity` is injected.

### `configId` conventions

| Pattern | Example | Used for |
|---------|---------|----------|
| `configId === instanceId` | a UUID or minted id | **MarketsGrid profile-set** (profiles + gridLevelData in one row) |
| `dp-${uuid}` / existing providerId | `dp-121e…` | data-provider rows |
| `ad-${uuid}` | | AppData rows |
| `${type}-${subType}`.toLowerCase() | `grid-credit` | registry **template** rows (`isTemplate: true`) |
| `${base}::${appId}::${userId}` | `dock-config::StarDemo::dev1` | scoped dock/registry |
| `component-registry[::appId::system]` | | global registry (`userId: 'system'`) |
| `WS_${workspaceId}` / snapshot id | | workspace snapshots (`componentType: 'workspace'`) |
| `marketsgrid-view-state::${instanceId}` | | **legacy** — deleted on first mount by `HostedMarketsGrid` |

### Optimistic concurrency

`saveConfig(config, { expectedUpdatedTime })` and the profile-set
`payload.version` both guard against lost updates
(`ProfileSetVersionConflictError`, `OptimisticLockError` / HTTP 412).

### REST sync

When `configServiceRestUrl` is set, writes go REST-first
(`PUT/DELETE ${restUrl}/${segment}/${id}`) then mirror to Dexie; failures
queue in `pendingSync` and drain every 10 s (max 10 retries). REST segments:
`appConfig→configurations`, `appRegistry→app-registry`,
`userProfile→user-profiles`, `roles`, `permissions`.

### Change notifications

After every successful `saveConfig`/`deleteConfig`, `ChangeNotifier.notify`
fires same-tab subscribers and posts to
`BroadcastChannel('marketsui-config-changes')` for cross-tab listeners.

---

## 4. Bootstrap & per-window load sequence

### 4.1 Two bootstrap tiers (`star-demo/platformBootstrap.tsx`)

- **`initConfigBootstrap()`** → resolve identity (OpenFin manifest or
  `/app-config.json`) → `ensureConfigReady(config)` → `setConfigManager(cm)`.
  **No SharedWorker, no AppData, no catalog.**
- **`initPlatformBootstrap()`** → `await initConfigBootstrap()` (shares the
  same `config` + ConfigManager) → `ensurePlatformReady(config, …)` →
  `setConfigManager(platform.configManager)`. Adds hub connect + AppData
  snapshot + catalog preload.

Both are module-level singletons (`configBootstrapPromise`,
`platformBootstrapPromise`) so repeated calls in a window dedupe.

### 4.2 Suspense gates (`star-demo/main.tsx`)

| Gate | Suspends on | Mounts |
|------|-------------|--------|
| `ConfigGate` | `use(initConfigBootstrap())` | provider, workspace-setup |
| `FullGate` | `use(initPlatformBootstrap())` | data-providers, config-browser, `/`, blotters (+ `DataHubProvider`) |
| (none) | — | rename-view-tab (pure fin dialog) |

Module scope pre-warms the tier the initial route needs **before** React
renders (`initConfigBootstrap()` for workspace-setup; `initPlatformBootstrap()`
for everything else except rename-view-tab).

### 4.3 `ensurePlatformReady` sequence (`ensurePlatformReady.ts`)

1. `warmHubConnection(...)` — **sync, fire-and-forget**; spawns the
   SharedWorker so it boots/seeds in parallel.
2. `await ensureConfigReady(config)` — main-thread ConfigManager `init`
   (attach mode skips seed).
3. `await ensureDataServicesHub({ …, mainThreadConfigManager })`.
4. `wireWorkerCatalogSync(configManager, bundle.client)`.
5. `await bundle.ready` — **AppData mirror snapshot** *then*
   **`client.waitForCatalogReady()`**.
6. `markPlatformWarm(appId)` — cross-window flag.
7. Optional `runAppDataBootstrap(...)`.

`resolveAttachMode(config)`: returns `false` if a `seedConfigUrl` exists but
its identity isn't cached yet; otherwise returns `isPlatformWarm(appId)`.

### 4.4 What each window waits for before first paint (star-demo)

| Window / route | Gate | Awaits before first paint |
|----------------|------|---------------------------|
| `/platform/provider` | `ConfigGate` | identity resolve + ConfigManager `init` (attach if warm). Full hub warmed in background. |
| `/workspace-setup` | `ConfigGate` | same config-only tier |
| `/rename-view-tab` | none | lazy chunk only |
| `/dataproviders` | `FullGate` | config + worker connect + AppData snapshot + catalog preload |
| `/config-browser` | `FullGate` | same full hub (needs catalog invalidation wiring) |
| `/` | `FullGate` + `StarGridApp` | full hub + runtime + StarGridApp boot |
| `/blotters/marketsgrid` | `FullGate` + `StarGridApp` | full hub + StarGridApp; grid shell shows *"Connecting to ConfigService…"* until `instanceId` + `configManager` resolve; AppData snapshot **not** awaited (`dataServicesMode: 'lazy'` default) |

### 4.5 Known race conditions / blocking points (the perf surface to fix)

These are the baseline behaviors the re-optimization is trying to make
faster — **without breaking the contract in §5–§6**:

1. **Cold-start seeding is serialized to a single fetch+write.** Worker +
   main-thread may both enter `seedIfEmpty`, but it runs entirely inside a
   `navigator.locks` web lock whose emptiness check (`appRegistry.count()` +
   `appConfig.count()`) runs *before* the `fetch`. The first acquirer
   fetches + bulk-writes; every later acquirer finds rows present and
   returns after two `count()` reads — no second fetch, no second write.
   The worker cannot read the cross-window warm marker (no localStorage in
   a SharedWorker), so it stays the deterministic seeder and the
   stale-warm safety net (§4.5.3); this is by design, not redundant work.
2. **`bundle.ready` gates every data window** on AppData snapshot **and**
   catalog preload. Under heavy live-tick fan-out on the single worker
   thread, later blotters wait behind earlier ones — *this is the
   multi-blotter slowdown the optimization targets*.
3. **Stale warm marker** — `isPlatformWarm` true but IndexedDB wiped →
   attach-mode windows see an empty store until the worker re-seeds.
4. **Seed identity not cached** forces a non-attach (full seed) path even
   when warm.
5. **Provider window ordering** — `ConfigGate` must finish `setConfigManager`
   before `Provider` mounts `initWorkspace()` (which calls
   `peekConfigManager()`); star-demo guarantees this via the gate.
6. **`HostedMarketsGrid` identity gate** — renders the *"Connecting to
   ConfigService…"* placeholder until both `instanceId` **and**
   `configManager` are non-null (`HostedMarketsGrid.tsx`). `instanceId`
   resolves from `fin.me.getOptions()` / URL / default; a hung
   `getOptions()` blocks the placeholder. *(This is exactly what regressed
   on the abandoned branch.)*
7. **Lazy AppData** — first paint proceeds with an empty mirror;
   `{{name.key}}` templates (e.g. `{{positions.asOfDate}}`) need
   `dataServicesMode: 'eager'` + Suspense when their initial values must
   resolve before first attach.

---

## 5. Config-service consumers — the functional scope (must not regress)

Every row below is a behavior that an end user can observe. The
re-optimization must keep all of them working.

| # | Consumer | Files | Table · key | R/W | Trigger | User-visible behavior |
|---|----------|-------|-------------|-----|---------|-----------------------|
| 1 | **Data provider catalog** | `host-data/runtime/config/store.ts`, `provider-editor/*`, `DataProviderSelector.tsx`, `views/DataProviders.tsx` | `appConfig` · `data-provider` · `dp-{uuid}` | R/W | Editor save/delete/clone/import | Author STOMP/REST/Mock/AppData providers; they appear in picker; selection drives streams |
| 2 | **AppData providers** | `runtime/providers/appdata/store.ts`, `AppDataMirror.ts`, `appDataBootstrap.ts` | `appConfig` · `appdata` · `ad-{uuid}` | R/W | Editor; bootstrap hooks; toolbar date | `{{name.key}}` substitution; historical as-of date |
| 3 | **Config Browser** | `react-core/config-browser/*`, `views/ConfigBrowser.tsx` | all six tables | R/W | Open UI; edit/import/export/delete | Admin CRUD on every config row; export full deploy bundle |
| 4 | **Grid profiles** | `engine/profiles/ProfileManager.ts`, `profileStorage.ts`, `profileSet.ts`, `MarketsGrid.tsx` | `appConfig` · `configId=instanceId` · `payload.profiles[]` | R/W | Boot; create/switch/save/clone/import; workspace pre-save | Named column/layout/filter profiles; dirty tracking |
| 5 | **gridLevelData** | `markets-grid-container/MarketsGridContainer.tsx`, `gridLevelState.ts`, `profileStorage.ts` | same row · `payload.gridLevelData` | R/W | Mount load; provider/caption/binding change; import | Provider selection, caption, event bindings survive reload + profile switch |
| 6 | **Hosted identity + storage** | `hosted/useHostedIdentity.ts`, `HostedMarketsGrid.tsx`, `useHostedView.ts` | resolves CM; storage → `instanceId` rows | R/W | View mount; workspace save | OpenFin views persist per-instance state; `registeredIdentity` stamped on every save |
| 7 | **Workspace snapshots** | `openfin-platform/workspacePersistence.ts`, `workspace.ts` | `appConfig` · `workspace` · `WS_{id}` | R/W | Save/update/delete workspace | Saved layouts restore in OpenFin Home; `activeProfileId` round-trips in `customData` |
| 8 | **Dock config** | `openfin-platform/db.ts`, `useDockEditor.ts`, `dock.ts` | `appConfig` · `dock-config[::scope]` | R/W | Dock editor save; platform init | Dock buttons/menus |
| 9 | **Component registry** | `db.ts`, `useRegistryEditor.ts`, `launch.ts`, `registryClone.ts` | `appConfig` · `component-registry[::appId::system]`; templates `{type}-{subtype}` | R/W | Registry editor; launch clone | Register/launch components; template → instance clone before grid reads |
| 10 | **Config import/export** | `workspace.ts`, `configImport.ts`, `ImportConfig.tsx`, `deployExport.ts` | bulk `appConfig` + auth tables | R/W | Dock Export/Import; Config Browser export | Full deployment backup/restore; scoped deploy export |
| 11 | **Worker catalog cache** | `ConfigCatalogCache.ts`, `wireWorkerCatalogSync.ts` | reads `data-provider`/`appdata` | R + invalidate | Hub boot; provider save | Stream attach uses latest provider cfg; grid/profile saves do **not** invalidate catalog |
| 12 | **ApplicationContext** | `ConfigManager.ts` | AppData row `ApplicationContext` | W on init / R via `getApplicationContext` | Platform init; impersonation | App id, user, roles/permissions available to hooks |
| 13 | **Widget layouts** | `shared/widget/widgetLayouts.ts`, `widget-sdk/useWidget.ts` | `appConfig` · `simple-blotter-layout` · UUID | R/W | Widget lifecycle | Per-widget saved layouts |
| 14 | **Legacy cleanup** | `HostedMarketsGrid.tsx` | `appConfig` · `marketsgrid-view-state::{instanceId}` | delete | Once per browser | Removes obsolete pre-consolidation rows |

### Critical end-to-end flows (acceptance checklist for re-optimization)

1. Provider CRUD → appears in picker → select → stream connects.
2. gridLevelData → provider selection survives a page reload (same
   `instanceId` row).
3. Profile save / switch → columns/filters persist; provider selection
   (grid-level) unchanged.
4. Profile export / import (schemaVersion 2) → `gridLevelData` round-trips.
5. Config Browser → inspect profile-set, data-provider, workspace rows.
6. Export ALL / import bundle → providers + profiles + workspaces + registry
   + dock restore.
7. Workspace save / restore → layout + `activeProfileId` in `customData`.
8. Registry launch → template cloned to instance `configId` before grid
   reads its profile-set.
9. AppData template → `{{positions.asOfDate}}` resolves after bootstrap /
   toolbar date set.
10. Cross-tab → profile list refreshes via `subscribeToChanges` on the same
    instance row.
11. **Multi-window load** → provider window, then N blotters, all reach
    interactive state; later blotters use attach mode and do **not** re-seed.
12. **Warm second window** → opening a second data window after the first is
    warm skips `seedIfEmpty` (attach mode), no duplicate seed fetch.

---

## 6. Existing automated coverage

### Unit (Vitest) — strong

- `host-config`: 18 files — profiles namespace, identity, ApplicationContext,
  audit, visibility, component-type filter, impersonation, optimistic lock,
  seed + attach mode, profileStorage identity/cache, scope drift, REST client
  lock, Dexie upgrades, deploy export, seed normalize.
- `host-data`: bootstrap (`ensurePlatformReady`/`ensureConfigReady`,
  `platformWarmSession`, config validation, resolve, appDataBootstrap),
  hub (`ensureDataServicesHub`, `ConfigCatalogCache`, `wireWorkerCatalogSync`),
  `DataProviderConfigStore`, worker hub catalog RPC, client catalog RPC.
- `engine`: `ProfileManager` (reload persistence, switch isolation,
  export/import grid-level data v2), profile import policy gate.
- `widgets-react/hosted`: 20+ files — identity (browser/OpenFin/storage-wrap),
  withStorage, workspace-save wiring, loading guard, DataServices mount, etc.
- `openfin-platform`: workspace persistence round-trip + save channel fan-out,
  GC rules, config import re-ownership, registry clone / appId drift /
  template id invariants.

### E2E (Playwright) — partial

- Root browser suite (`e2e/`, `playwright.config.ts`, base `:5190`):
  `config-seed-roundtrip`, `v2-profile-lifecycle`/`-stress`/`-isolation`,
  `v2-autosave`, `v2-template-create-apply` (also `:5191`),
  `v2-two-grid-isolation`, `container-provider-selection`,
  `container-save-and-switch`, `hosted-markets-grid` (`:5174`),
  `browser-blotter` (`:5180`).
- Container suite (`playwright.container.config.ts`, `:5215`).
- OpenFin suite (`e2e-openfin/`, CDP, `:5181`): `blotter-smoke` (committed);
  workspace-persistence / multi-blotter specs exist only as WIP on the
  abandoned branch.
- Legacy Vitest OpenFin bridge (`apps/demos/e2e-openfin-vitest/`):
  workspace Storage CRUD via the `marketsui-test-bridge` channel.

### Coverage gaps relevant to this effort

- **No** config-browser UI e2e.
- **No** committed multi-blotter / late-join OpenFin spec.
- **No** OpenFin workspace save→reload→restore UI round-trip (only the
  Storage-API bridge test).
- **No** star-demo e2e path.
- attach-mode warm-second-window only unit-tested.

The new guardrail specs (next section) target these gaps so the
re-optimization can be validated end-to-end.

---

## 7. Re-optimization rules (derived constraints)

1. **Preserve the §5 table and the §5 acceptance checklist** — every row,
   every flow.
2. **Never widen a window's first-paint await set.** Config-only windows must
   not start waiting on the data hub; blotter windows must not start waiting
   on anything they didn't already wait on at baseline.
3. **The `HostedMarketsGrid` identity gate must never deadlock.** Any OpenFin
   call in the identity path (`fin.me.getOptions()`) must be bounded/timed so
   a hung runtime call cannot strand a window on *"Connecting to
   ConfigService…"*.
4. **`configId === instanceId`** for MarketsGrid profile-sets is a wire
   contract with persisted data — do not change it.
5. **Catalog invalidation stays selective** — only `data-provider`/`appdata`
   writes invalidate the worker catalog; profile/dock/registry saves do not.
6. **Attach mode stays correct** — a warm second window must skip
   `seedIfEmpty`, and a stale warm marker must still converge once the worker
   re-seeds.
7. **Optimistic concurrency stays intact** (`payload.version`,
   `expectedUpdatedTime`, HTTP 412).
8. **The main-thread `ConfigManager` stays the config source of truth — never
   route config reads/writes through worker RPC.** Learned the hard way on
   the abandoned `feat/worker-config-manager-client` branch (see the archived
   `CONFIG_SERVICE_PERF_PLAN`): worker-mediated config I/O widened first
   paint and lost the synchronous read paths the §5 flows depend on.

---

## 8. Companion e2e guardrails

`e2e/container-config-service.spec.ts` (added with this document) encodes the
storage + load contract against the deterministic container host
(`marketsgrid-container-e2e`, port 5215, single worker). Run with:

```
npm run e2e:container
```

Current guardrails (all green at baseline):

1. **Window reaches interactive state** and the *"Connecting to
   ConfigService…"* placeholder never sticks (guards §4.5(6) — the exact
   regression the abandoned branch introduced).
2. **`configId === instanceId`** profile-set row carries **both** profiles and
   `gridLevelData` in one row (§4).
3. **`payload.version` increments monotonically** on successive saves
   (optimistic concurrency, §3).
4. **Grid-level provider selection survives a warm reload** without re-seeding
   (§5 rows 5–6, §4.4 warm path).

> **Finding while writing these (do not re-introduce):** the pre-existing
> `e2e/container-provider-selection.spec.ts` tests that read the Dexie row by
> the triple `(configId, appId, userId)` are **already failing on baseline** —
> the row's stamped `appId`/`userId` differ from the bootstrap identity even
> though persistence works (the UI-only tests pass). The guardrails here key
> off `configId === instanceId` only, which is the real persisted contract.
> A good cleanup task alongside the re-optimization is to fix
> `expectGridLevelProviderId` / `readProfileSetRow` to match by `configId`
> (or to assert the intended stamping) rather than the stale triple.

### Not yet covered (tracked gaps — see §6)

OpenFin multi-blotter instant-load and workspace save→restore round-trips
need the OpenFin CDP harness (`e2e-openfin/`) and a running runtime; they are
the highest-value additions once the re-optimization begins, since multi-window
load is the original pain point.
