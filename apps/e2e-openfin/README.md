# `@wellsfargo-starui/e2e-openfin`

OpenFin e2e harness — a Playwright runner attached over CDP to a real
OpenFin runtime spawned via `@openfin/node-adapter`, driving the
fully-configured **star-demo** reference workspace app.

Targets `apps/source/star-demo` (not the deleted `e2e-openfin-workspace`)
because star-demo ships a real seeded STOMP data provider, the dock +
provider window, and the dev test bridge — so blotters actually load and
tick rows, which the multi-window guards assert.

Replaces the legacy Vitest+bridge-channel harness (the deleted
`e2e-openfin-vitest` app — git history).

## Run

```bash
# Boots the STOMP server (:8081) + star-demo dev server (:5175), then
# launches OpenFin against star-demo's manifest and attaches over CDP.
npm run test:e2e:openfin

# Headed
npm --prefix e2e-openfin run test:e2e:headed
```

`reuseExistingServer: true`, so an already-running `npm run dev:stomp` /
`npm run dev:star-demo` (or `npm run star-demo`) session is reused.

## How it works

1. Playwright's `webServer` block boots two servers: the STOMP view
   server ([`@wellsfargo-starui/stomp-view-server`](../source/stomp-view-server/),
   `:8081`, health-checked at `/health`) and star-demo's Vite dev server
   (`:5175`, **DEV mode** so the test bridge installs).
2. The `launchOpenFin` fixture calls `@openfin/node-adapter`'s `launch()`
   with star-demo's manifest, then `connect()`s an out-of-runtime `fin`
   proxy.
3. star-demo's manifest declares `--remote-debugging-port=9091`. The
   fixture polls `http://127.0.0.1:9091/json/version`, waits for the
   provider window, connects to the dev test bridge
   (`marketsui-test-bridge`), and waits for the platform's storage API
   (`getWorkspaces` succeeds only once `WorkspacePlatform` is live).
4. Specs drive the worker-scoped `platform` handle:
   - `platform.openBlotter(instanceId)` launches a MarketsGrid blotter
     window via `Platform.createWindow` with a distinct
     `customData.instanceId` (+ matching `?instanceId=` so each window's
     CDP URL is unique) and returns a Playwright `Page` attached to it.
     Each blotter scopes its own profile-set config row.
   - `platform.bridge` exposes the WorkspacePlatform.Storage ops
     (`saveWorkspace` / `getWorkspace` / `getWorkspaces` /
     `deleteWorkspace` / `ping`).
   Blotter windows opened during a test are auto-closed after it (so the
   shared hub isn't loaded down across the run).

> New top-level OpenFin windows don't surface on an already-attached
> Playwright CDP connection, so `openBlotter` reconnects fresh to resolve
> the page — don't "optimize" that into a single persistent connection.

## Specs

| Spec | Guards |
|---|---|
| `blotter-smoke` | A single blotter mounts in OpenFin, reaches an interactive grid with STOMP rows, and the rows tick. |
| `multi-blotter-load` | Three blotters with distinct instanceIds all reach interactive grids with rows; never strand on *"Connecting to ConfigService…"*. **Primary regression guard.** |
| `multi-blotter-late-join` | A blotter opened after the hub is warm attaches and shows rows inside the warm budget (logs the measured warm time). |
| `workspace-persistence` | Save → get-by-id → delete round-trips through the config-service-backed WorkspacePlatform storage. |

## Env overrides

| Var | Default | Purpose |
|---|---|---|
| `OPENFIN_MANIFEST_URL` | `http://localhost:5175/platform/manifest.fin.json` | Point at a different deployment |
| `OPENFIN_APP_ORIGIN` | `http://localhost:5175` | Origin used to build blotter URLs |
| `OPENFIN_CDP_PORT` | `9091` | Must match the manifest's `--remote-debugging-port` |

## Adding a spec

```ts
import { test, expect } from '../fixtures/launchOpenFin';

test('something useful', async ({ platform }) => {
  const page = await platform.openBlotter('my-instance');
  await expect(page.locator('.ag-grid-scrolling-rows .ag-row').first()).toBeVisible();
});
```

## Concurrency

`workers: 1` and the `platform` fixture is worker-scoped — one OpenFin
runtime serves every test. Parallel CDP attachments to one OpenFin
runtime aren't supported, so don't lift this constraint.

## Runtime note

The first run on a fresh machine downloads the OpenFin runtime version
pinned in star-demo's manifest (one-time, can exceed a minute); the
`timeout` in `playwright.config.ts` is sized for it. Subsequent warm runs
boot in ~15s.
