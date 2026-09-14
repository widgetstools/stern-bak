# `@wellsfargo-starui/e2e-openfin`

OpenFin e2e harness — a Playwright runner attached over CDP to a real
OpenFin runtime spawned via `@openfin/node-adapter`, driving the
fully-configured **star-demo** reference workspace app.

Targets [`apps/source/star-demo`](../source/star-demo/) because star-demo
ships a real seeded STOMP data provider, the dock + provider window, and
the test bridge — so blotters actually load and tick rows, which the
multi-window guards assert.

## Run

```bash
# From apps/e2e-openfin. Boots the STOMP server (:8081) + star-demo dev
# server (:5175) unless they are already listening, then launches OpenFin
# against star-demo's manifest and attaches over CDP.
npx playwright test

# Headed
npx playwright test --headed
```

`reuseExistingServer: true`, so an already-running `npm run dev` in
`apps/source/stomp-view-server` / `apps/source/star-demo` is reused.

**The star-demo dock must be closed first** — the harness boots its own
runtime from the same manifest, and the two would fight over the CDP port.

### Against a production preview

The test bridge installs in a Vite DEV build, or in any build when the
provider window's URL carries `?e2eBridge=1`. With `vite preview` serving
`dist/` on :5175 (the production dock), write a manifest copy whose
`providerUrl` has that flag and point the harness at it:

```powershell
$m = Get-Content ../source/star-demo/dist/platform/manifest.fin.json -Raw | ConvertFrom-Json
$m.platform.providerUrl = 'http://localhost:5175/?e2eBridge=1#/platform/provider'
$m | ConvertTo-Json -Depth 20 | Set-Content ../source/star-demo/dist/platform/manifest.e2e.fin.json
$env:OPENFIN_MANIFEST_URL = 'http://localhost:5175/platform/manifest.e2e.fin.json'
npx playwright test
```

The copy lives in the build output (untracked); the platform's uuid,
storage and layout are the dock's own, so the run restores whatever
layout the dock last saved alongside the e2e blotter windows.

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
   - `platform.openBlotter()` launches a MarketsGrid blotter **view** through
     the bridge's `launchComponent` — the platform's own registered-component
     launch, what a dock button runs. The entry is looked up in the live
     registry (`listRegistry`) as the one whose `hostUrl` is the blotter
     route — entry ids differ per profile, the seed's only hold on a fresh
     one — or set by `OPENFIN_BLOTTER_ENTRY`. The platform mints the `instanceId`,
     clones the entry's template config row (profiles + provider selection)
     onto it and stamps `?instanceId=` on the view URL, so each blotter has
     its own row **and a provider**, like a dock-launched view. Two things
     the harness must not do: a bare `Platform.createWindow` opens a
     row-less blotter that renders the "no provider" grid with no columns;
     and launching `asWindow` puts the blotter in the provider's renderer
     (same-app windows share it unless given a `processAffinity`), where one
     loaded 20k-row blotter saturates the thread the platform API runs on —
     the next launch took 27 s, the one after 66 s. Views are isolated by the
     manifest's `viewProcessAffinityStrategy`. The call returns a Playwright
     `Page` attached to the view.
   - `platform.bridge` exposes the WorkspacePlatform.Storage ops
     (`saveWorkspace` / `getWorkspace` / `getWorkspaces` /
     `deleteWorkspace` / `ping`) plus `listRegistry`, `launchComponent` and
     `deleteConfig`.
   Blotter windows opened during a test are auto-closed after it (so the
   shared hub isn't loaded down across the run) and their cloned config
   rows deleted.

> New top-level OpenFin windows don't surface on an already-attached
> Playwright CDP connection, so `openBlotter` reconnects fresh to resolve
> the page — don't "optimize" that into a single persistent connection.

## Specs

| Spec | Guards |
|---|---|
| `blotter-single-grid` | A cold load of a blotter creates exactly one AG Grid instance (one licence banner in a production build, two under dev StrictMode) and one `.ag-root-wrapper`. |
| `blotter-smoke` | A single blotter mounts in OpenFin, reaches an interactive grid with STOMP rows, and the rows tick. |
| `multi-blotter-load` | Three blotters with distinct instanceIds all reach interactive grids with rows; never strand on *"Connecting to ConfigService…"*. **Primary regression guard.** |
| `multi-blotter-late-join` | A blotter opened after the hub is warm attaches and shows rows inside the warm budget (logs the measured warm time). |
| `workspace-persistence` | Save → get-by-id → delete round-trips through the config-service-backed WorkspacePlatform storage. |

## Env overrides

| Var | Default | Purpose |
|---|---|---|
| `OPENFIN_MANIFEST_URL` | `http://localhost:5175/platform/manifest.fin.json` | Point at a different deployment |
| `OPENFIN_BLOTTER_ENTRY` | live lookup by route | Component Registry entry id the blotters launch from (default: the entry whose `hostUrl` is `/blotters/marketsgrid`) |
| `OPENFIN_CDP_PORT` | `9091` | Must match the manifest's `--remote-debugging-port` |

## Adding a spec

```ts
import { test, expect } from '../fixtures/launchOpenFin';

test('something useful', async ({ platform }) => {
  const page = await platform.openBlotter();
  // AG Grid 36: body rows sit under `.ag-grid-scrolling-rows`.
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
