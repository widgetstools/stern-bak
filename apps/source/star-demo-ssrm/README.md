# star-demo — the OpenFin workspace demo

The primary end-to-end demo and e2e target: an **OpenFin workspace platform**
hosting a MarketsGrid blotter, the data-provider tools, the config browser
and workspace setup — all wired through the StarUI host/port runtime. Also
runs in a plain browser tab for quick iteration.

> Dev server port: **5175**. OpenFin platform uuid: **`star-demo`**.

```bash
npm run dev            # vite on http://localhost:5175 (browser mode)
npm run client         # launch the OpenFin platform against the manifest
npm run typecheck      # app + test tsconfigs
npm test               # vitest
npm run validate:seed  # sanity-check public/seed.json
```

## Routes

The app uses a **HashRouter** — real URLs always carry `#/`:

| URL | View |
|---|---|
| `http://localhost:5175/#/` | home |
| `…/#/platform/provider` | OpenFin platform provider (bootstraps the workspace) |
| `…/#/blotters/marketsgrid` | `HostedMarketsGrid` blotter (`gridId: star-demo-blotter`) |
| `…/#/dataproviders` | data-provider editor |
| `…/#/config-browser` | configuration browser |
| `…/#/workspace-setup` | workspace setup (config-only tier) |
| `…/#/rename-view-tab` | rename-tab dialog (no data plane at all) |

## Two-tier bootstrap

Each window warms only the tier its initial route needs (read from
`location.hash` — see [`src/main.tsx`](./src/main.tsx)):

- `#/rename-view-tab` — pure dialog; neither config rows nor the data plane.
- `#/workspace-setup` — `initConfigBootstrap()` (config store only).
- everything else — `initPlatformBootstrap()` (config + SharedWorker data
  hub). A boot watchdog ([`src/bootWatchdog.ts`](./src/bootWatchdog.ts))
  shows a token-styled stall screen if the platform never mounts.

## Configuration & seeding

- [`public/platform/manifest.fin.json`](./public/platform/manifest.fin.json)
  — the OpenFin manifest (`customSettings.appId: "Star-Demo"`); its
  `providerUrl` points at `…/#/platform/provider`.
- [`public/app-config.json`](./public/app-config.json) — browser-mode
  bootstrap: `useRest`, `configServiceRestUrl`, `seedConfigUrl` only.
- [`public/seed.json`](./public/seed.json) — the seeded config registry
  (registry `appId: "StarDemo"`, `activeAppId: "Star-Demo"` — the two
  spellings live in different namespaces). `npm run validate:seed` checks it.
- Workspace registration rides `@wellsfargo-starui/openfin/config` +
  `@wellsfargo-starui/react/workspace-setup`.

## Notes

- `src/starGridApp/` is the **vendored** remnant of the deleted
  `@wellsfargo-starui/app` package — star-demo was its only consumer.
- E2E specs in [`apps/e2e/`](../../e2e/) and
  [`apps/e2e-openfin/`](../../e2e-openfin/) target this app on `:5175`.

## StarUI surfaces consumed

`@wellsfargo-starui/core` (+`/host`, `/host/browser`, `/host/config`) ·
`@wellsfargo-starui/data` (+ worker asset) · `@wellsfargo-starui/openfin`
(+`/host`, `/config`) · `@wellsfargo-starui/grid` (`/widgets/hosted`,
`/widgets/provider-editor`, `/config-browser`, `/customizer`, `/styles.css`) ·
`@wellsfargo-starui/react` (`/data/runtime`, `/workspace-setup`,
`/host/test-bridge`, primitives) · `@wellsfargo-starui/design-system`
(+`/css`) · `@wellsfargo-starui/types`.

> Framework docs: [`docs/latest/`](../../../docs/latest/README.md).
