# `@wellsfargo-starui/demo-configservice-react`

Integration demo for the **MarketsGrid × ConfigService** wiring shipped
in `docs/plans/MARKETS_GRID_API.md` §Storage.

Forked from `apps/demos/demo-react`. Same three views (single grid / two-grid
dashboard / market depth), same columns, same data, same live-tick
showcase. **What's different:** profile persistence routes through
`createConfigServiceStorage(...)` instead of a direct `DexieAdapter`.

## Run

```bash
# From monorepo root — Dexie-only mode (default)
npm run dev:demo-configservice-react
# Vite at http://localhost:5191
```

Or from inside the app dir:

```bash
cd apps/demo-configservice-react
npm run dev
```

Port **5191** (5190 is owned by `demo-react`, the plain-`DexieAdapter`
sibling). Both can run side-by-side for visual comparison.

### REST-backed mode

Bring up the REST backend and point the demo at it:

```bash
# Terminal 1 — REST server on :3001
cd apps/config-service-server && npm run dev

# Terminal 2 — demo wired to the server
cd apps/demo-configservice-react
cp .env.example .env.local
# uncomment VITE_CONFIG_SERVICE_URL in .env.local
npm run dev
```

Same client code; ConfigManager swaps `LocalConfigClient` for
`RestConfigClient` based on the env flag. Writes mirror to REST and
Dexie; reads still come from Dexie. Failed REST writes queue in
`PENDING_SYNC` and retry every 10s.

## What the demo proves

### 1. ConfigService seeds itself from `seed-config.json`

On first boot (Dexie tables empty) the demo's `createConfigManager({ seedConfigUrl })` call points at `public/seed-config.json` — same file shipped with the other reference apps. It populates the `appRegistry`, `userProfiles`, `roles`, and `permissions` tables with canonical values:

- **appId:** `TestApp`
- **user:** `dev1` (assigned the `admin` + `developer` roles for `TestApp`)
- Plus the full permission + role graph

Subsequent boots skip the fetch (the ConfigManager bails when `appRegistry.count() > 0`). You can inspect the seeded rows by opening the Config Browser from the grid's Database icon.

### 2. MarketsGrid consumes a `StorageAdapterFactory`

`App.tsx`:

```ts
const APP_ID = 'TestApp';   // matches the seed

const storage = useMemo<StorageAdapterFactory | undefined>(() => {
  if (!configManager) return undefined;
  return createConfigServiceStorage({
    configManager,
    appId: APP_ID,
    userId,     // flips when the user-switcher is clicked
  });
}, [configManager, userId]);

<MarketsGrid gridId="demo-blotter-v2" storage={storage} ... />
```

MarketsGrid resolves `effectiveInstanceId = gridId` (this app is
standalone — no framework-supplied instanceId) and calls the factory.
Each grid gets its own `StorageAdapter`, but they all share the
`(appId, userId)` scope baked into the factory.

### 3. Profile data is scoped by `userId`

Three demo users in the header: **dev1** (default, matches the seed), **Alice**, and **Bob**. Click to swap.

- Each user has their own set of profiles.
- Each user's Showcase profile is seeded independently on first view.
- Switching from dev1 → Alice replaces every `<MarketsGrid>`'s profile
  list in place. dev1's bolded columns, calculated columns, colour
  rules — all gone. Alice's pristine Showcase is what she sees.
- Switch back → the previous user's work is exactly as they left it.

Under the hood: the factory's closure changes (`userId: 'dev1'` →
`userId: 'alice'`). Next `listProfiles` call returns the new user's
bundle from ConfigService, filtered by `appId=TestApp` + `userId=<new>`
+ `componentType='markets-grid-profile-set'` + `configId=<instanceId>`.

### 4. Profiles persist across reloads

Reload the page — whatever profile was active per-user comes back.
Backend depends on the env flag:

- **`VITE_CONFIG_SERVICE_URL` unset** → Dexie-only. All writes land
  in IndexedDB; nothing leaves the browser.
- **`VITE_CONFIG_SERVICE_URL=http://localhost:3001/api/v1`** → REST
  mode. Writes mirror to the server first, then Dexie. Failed writes
  queue in `PENDING_SYNC` and retry every 10s.

Same MarketsGrid code, same `createConfigServiceStorage` factory,
same profile shapes — only the ConfigManager's `configServiceRestUrl`
option flips.

### 5. Admin actions slot — Database icon on the right edge of the primary toolbar

The Database icon at the far right of the grid's toolbar row launches
a Config Browser popup window (`window.open` with a fixed window
name). The popup:

- Carries the demo's `hostEnv` via `?hostEnv=<base64>` query param so
  the browser filters to `appId='TestApp'`
- Shares the same Dexie database (same-origin = same IndexedDB) so
  writes from the main window show up on the next Refresh click
- Closes via the OS window close button; main window stays put

The admin entry is built via `createConfigBrowserAction({ launch })`
from `@wellsfargo-starui/config-browser` — the same helper ships with the
package for any consumer.

### 6. Cross-grid profile isolation under ConfigService

Two-grid dashboard view (`?view=dashboard`). Two grids, two different
`gridId`s: `dashboard-rates-v2` + `dashboard-equities-v2`. Both pass
the same `storage` factory. The factory produces a distinct adapter
per `gridId` — each grid has its own profile rows in ConfigService,
but they share the `(appId, userId)` scope. Bold a column on Rates;
Equities stays untouched. Switch user; both grids replace state in
lockstep.

## Key code locations

| File | What it demonstrates |
|---|---|
| `src/App.tsx` — `useEffect` around `createConfigManager` | ConfigService bootstrap in Dexie-only dev mode |
| `src/App.tsx` — `useMemo storage = createConfigServiceStorage({...})` | The factory-per-user construction |
| `src/App.tsx` — `DEMO_USERS` array + user-switcher UI | Per-user scoping mechanism |
| `src/App.tsx` — `ensureShowcaseSeedFor(userId, storage)` | Writing directly through the factory's StorageAdapter to seed |
| `src/App.tsx` — `adminActions` array | The Tools-menu slot |
| `src/Dashboard.tsx` — `storage` prop passthrough | Cross-grid factory reuse |

## Comparison to `apps/demos/demo-react`

| Concern | `demo-react` (port 5190) | `demo-configservice-react` (port 5191) |
|---|---|---|
| Profile storage | `new DexieAdapter()` (direct) | `createConfigServiceStorage({...})` (factory) |
| MarketsGrid prop | `storageAdapter={...}` | `storage={...}` |
| Scope | `gridId` only | `(appId, userId, instanceId)` |
| User switching | n/a | dev1 / Alice / Bob tabs in the header |
| Admin actions | not shown | Database icon on right edge of primary toolbar → Config Browser popup |
| Seed data | none | `public/seed-config.json` loaded on first boot |
| Production path | `DexieAdapter` is dev-only | Set `VITE_CONFIG_SERVICE_URL` → same code hits REST ConfigService |

Both run simultaneously and persist to different IndexedDB databases
(`demo-react` → Grid Customizer profiles DB; this demo →
`marketsui-config` DB via ConfigManager).

## Optimistic concurrency

Every profile-set row carries a monotonic `version` number. The
adapter bumps it on each save and rejects saves that observe the
row has advanced since the last load — a `ProfileSetVersionConflictError`
is thrown from the ConfigService adapter.

Two-tab smoke test (after shipping the version field):

- [ ] Open `http://localhost:5191` in two tabs as user `dev1`.
- [ ] In tab 1: create profile "A", save. Check Config Browser — row's payload now has `version: <N>`.
- [ ] In tab 2: reload to pick up A, then create profile "B", save. Check Config Browser — `version: <N+1>`.
- [ ] In tab 1 (without reloading): edit A, save → throws `ProfileSetVersionConflictError` (tab 1 still thinks version is N, but actual is N+1). Current UI propagates this as an unhandled rejection; wrapping in a user-visible toast with Reload / Overwrite options is a deferred follow-up.
- [ ] Reload tab 1 and retry — succeeds.

## Things you can verify

- [ ] Open `http://localhost:5191`. Active user defaults to **dev1**. Showcase profile loads automatically.
- [ ] Click the Database icon at the far right of the top toolbar row. A new window opens titled "Config Browser · MarketsGrid Demo".
- [ ] In the popup, click the `App Registry` tab — see `TestApp` row (seeded from `seed-config.json`).
- [ ] Click `User Profiles` tab — see `dev1` with roles `admin`, `developer` for `TestApp`.
- [ ] Click `App Config` tab — see one row with `componentType: "markets-grid-profile-set"`, `configId: "demo-blotter-v2"`, `appId: "TestApp"`, `userId: "dev1"`. Expand the payload — it's `{ profiles: [ Showcase ] }`.
- [ ] Back in the main window: bold the `price` column in the formatting toolbar. Save profile.
- [ ] In the popup: click Refresh. The `markets-grid-profile-set` row's `updatedTime` is newer and the payload reflects the bold.
- [ ] Switch user to **Alice**. Main grid's bold is gone — Alice's pristine Showcase seeds.
- [ ] In the popup after Refresh: two `markets-grid-profile-set` rows now, one for `dev1`, one for `alice`, each scoped independently.
- [ ] Switch back to **dev1**. Your bold is exactly where you left it.
- [ ] Reload the page. Active user persists. The seed is NOT re-run (ConfigManager bails when `appRegistry.count() > 0`).
- [ ] Switch to dashboard view (`?view=dashboard`). Both grids load per-user profile state independently.
