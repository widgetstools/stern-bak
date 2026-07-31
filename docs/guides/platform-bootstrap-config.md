# Platform bootstrap config

How browser and OpenFin apps resolve **`appId`**, **`userId`**, and config-service settings before `ensurePlatformReady()` spawns the SharedWorker hub.

---

## Unified shape

Every runtime resolves the same TypeScript interface (`PlatformBootstrapConfig` from `@wellsfargo-starui/host-data`):

| Field | Required | Purpose |
|-------|----------|---------|
| `appId` | yes | SharedWorker name `mkt-data-services:${appId}` — **one value per deployment** |
| `userId` | yes | Session user for AppData, profiles, private provider rows |
| `useRest` | no | When `true`, enable REST config service (requires URL) |
| `configServiceRestUrl` | no | REST API base URL when `useRest === true` |
| `seedConfigUrl` | no | URL to the shipped seed bundle (typically `/seed.json`). Relative paths resolve against manifest `platform.providerUrl` origin so one manifest works in dev and production. Must match the Config Browser **rocket** (deploy) export shape: `activeAppId`, `activeUserId`, `appRegistry`, `userProfiles`, `roles`, `permissions`, optional `appConfig`. |
| `seedConfigReload` | no | `empty-only` (default, **ship with app**) — seed once when Dexie is empty; end users get your layout on first launch without manual import. `when-changed` — also re-seed when `seed.json` content changes (local dev only: export → replace `public/seed.json` → reload). |
| `appDataBootstrap` | no | Declarative AppData hook ids + run policy (see below) |

---

## AppData bootstrap hooks

Seed AppData providers (entitlements, `SessionContext`, desk defaults) **after** the hub is ready. Hooks run on the **main thread** — implement them in a standard app file and reference stable ids from config.

### App registry — `src/platform/appDataBootstrap.ts`

```typescript
import type { AppDataBootstrapHookRegistry } from '@wellsfargo-starui/host-data';

export const appDataBootstrapHooks: AppDataBootstrapHookRegistry = {
  'session-context': async (ctx) => {
    await ctx.upsertAppData({
      name: 'SessionContext',
      values: { userId: ctx.userId, entitlements: ['desk-a'] },
    });
  },
};
```

### Manifest — `app-config.json`

```json
{
  "appId": "stomp-marketsgrid-minimal",
  "userId": "dev1",
  "appDataBootstrap": {
    "onHubReady": ["session-context"],
    "runPolicy": "if-missing",
    "targets": { "session-context": ["SessionContext"] }
  }
}
```

| `runPolicy` | Behavior |
|-------------|----------|
| `if-missing` (default) | Skip hook when all `targets[hookId]` AppData providers exist with keys |
| `always` | Run on every trigger |
| `once-per-session` | Run at most once per browser tab session |

### Wire at bootstrap

```typescript
import { appDataBootstrapHooks } from './platform/appDataBootstrap.js';

const platform = await ensurePlatformReady(config, {
  workerScriptUrl: workerAssetUrl,
  appDataBootstrapHooks,
});
```

Only **hook ids** are stored in JSON — never executable code.

**Interactive demo:** [`apps/demos/platform-hooks-demo`](../../apps/demos/platform-hooks-demo/) — `npm run dev:platform-hooks-demo` ([full testing guide](./platform-hooks-demo.md)).

---

## Web browser — `app-config.json`

Place at **`public/app-config.json`** (served as `/app-config.json`):

```json
{
  "appId": "markets-ui-dev",
  "userId": "dev1",
  "useRest": false,
  "configServiceRestUrl": "http://localhost:3001/api/v1",
  "seedConfigUrl": "/seed-config.json"
}
```

### Loader

```typescript
import {
  resolvePlatformBootstrapFromJson,
  ensurePlatformReady,
} from '@wellsfargo-starui/host-data';
import workerAssetUrl from '@wellsfargo-starui/host-data/assets/data-services-worker.mjs?url';

const config = await resolvePlatformBootstrapFromJson('/app-config.json');
export const platform = await ensurePlatformReady(config, {
  workerScriptUrl: workerAssetUrl,
});
```

For tests or inline config, use `resolvePlatformBootstrapFromObject(raw)`.

### Rules

- **`appId` and `userId` must be stable** across every tab/window in the deployment.
- **`useRest`** gates REST mode (same semantics as OpenFin manifest — URL alone does not enable REST).
- Per-grid **`instanceId`** stays in route props / URL params — not in this file.

---

## OpenFin — manifest `customSettings`

Platform **`manifest.fin.json` → `customSettings`** (deployment-wide — same for every view):

```json
"customSettings": {
  "appId": "markets-ui-react-reference",
  "userId": "dev1",
  "useRest": false,
  "configServiceRestUrl": "http://localhost:3001/api/v1",
  "seedConfigUrl": "http://localhost:5174/seed-config.json"
}
```

| Field | Scope | Notes |
|-------|--------|-------|
| `appId` | Platform | **Required** — SharedWorker name; must match across all views |
| `userId` | Session | Dev: manifest pin. **Prod:** SSO → platform provider forwards via `customData` on child spawns |
| `useRest` / `configServiceRestUrl` | Environment | Same gate as today (`resolveRestUrl`) |
| `seedConfigUrl` | Environment | Optional Dexie seed |

View **`customData`** carries per-window `instanceId` only — **not** hub `appId`.

### Loader

```typescript
import { resolvePlatformBootstrapFromManifest } from '@wellsfargo-starui/openfin-platform/config';
import { ensurePlatformReady } from '@wellsfargo-starui/host-data';
import workerAssetUrl from '@wellsfargo-starui/host-data/assets/data-services-worker.mjs?url';

const config = await resolvePlatformBootstrapFromManifest();
export const platform = await ensurePlatformReady(config, {
  workerScriptUrl: workerAssetUrl,
});
```

Outside OpenFin (plain browser import), `resolvePlatformBootstrapFromManifest()` returns `DEV_PLATFORM_BOOTSTRAP` without throwing.

Pure helper for tests: `resolvePlatformBootstrapFromCustomSettings(customSettings)`.

---

## Dev fallback

Tests and local harnesses may use `DEV_PLATFORM_BOOTSTRAP` from `@wellsfargo-starui/host-data`:

```typescript
import { DEV_PLATFORM_BOOTSTRAP } from '@wellsfargo-starui/host-data';
// { appId: 'TestApp', userId: 'dev1', useRest: false }
```

Replace hardcoded `LOGGED_IN_USER_ID` / `DEFAULT_APP_ID` literals as apps migrate (Phase 6). **`useHostedIdentity`** and **`DataHubProvider`** now expose bootstrap `appId` / `userId` via React context; `LOGGED_IN_USER_ID` in `@wellsfargo-starui/types` is deprecated.

---

## Ship config with the app

End users should not import config manually. Configure once, export, commit, ship:

1. Run the app locally; set up providers, grids, dock, workspaces, profiles.
2. **Config Browser** → **Export** → **rocket** (deploy bundle). Save as `public/seed.json`.
3. Set `seedConfigUrl: "/seed.json"` in `app-config.json` and manifest `customSettings` (relative path — resolved at runtime).
4. Leave `seedConfigReload` unset (default `empty-only`) so seed runs only on empty IndexedDB.
5. Commit `public/seed.json` with the release. Optional: `npm run validate:seed` in apps that ship a seed (e.g. `star-demo`).

First launch seeds Dexie from the bundled file; later launches use persisted config. To refresh during development, set `seedConfigReload: "when-changed"` locally only.

---

## Validation

`validatePlatformBootstrapConfig(config)` returns `{ valid, errors, warnings }`:

- **Errors:** empty `appId` or `userId` (blocks bootstrap)
- **Warnings:** `useRest: true` without `configServiceRestUrl`

Loaders throw `PlatformBootstrapConfigError` when validation fails.

---

## Pilot app — `apps/demos/markets-grid-lab`

Reference wiring (PR1b):

| File | Role |
|------|------|
| `public/app-config.json` | Web bootstrap config (`appId: markets-grid-lab`) |
| `src/platformBootstrap.ts` | `resolvePlatformBootstrapFromJson` → `ensurePlatformReady` |
| `src/main.tsx` | Async init, then `<DataHubProvider platform={platform} userId={config.userId}>` |

SharedWorker name: `mkt-data-services:markets-grid-lab` (from `app-config.json` `appId`).
