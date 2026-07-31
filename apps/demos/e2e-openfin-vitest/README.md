# `e2e-openfin/` — OpenFin-driven end-to-end tests

True end-to-end tests for the OpenFin platform layer of marketsui-platform.
Each spec launches a real OpenFin runtime via `@openfin/node-adapter`,
connects to a running dev server, and drives platform APIs to assert
behaviour observable from outside the runtime.

This is a different stratum from the Vitest integration tests inside each
package (e.g. `packages/openfin-platform/src/workspace-persistence.test.ts`):

| Layer | Where | Runtime | Speed | Coverage |
|---|---|---|---|---|
| Integration | `packages/*/src/*.test.ts` | Node + jsdom, OpenFin stubbed | <2s for full suite | Logic of one module against real-shape inputs |
| **E2E (this folder)** | `e2e-openfin/specs/*.e2e.spec.ts` | Real OpenFin runtime | 30–60s per spec | The override is wired to OpenFin's public API and round-trips through ConfigService |

These specs are intentionally NOT part of the default `npm test` run — see
"CI implications" below.

---

## Pre-requisites

1. **Markets-UI E2E dev server on port 5197.** The suite auto-starts
   `@wellsfargo-starui/markets-ui-react-reference` via `globalSetup.ts` if nothing
   is listening. Do **not** point tests at port 5174 unless that port is
   definitely this repo's reference app — another Vite app on 5174 will
   boot OpenFin without the test bridge.

   Manual start (optional):
   ```
   npm run dev -w @wellsfargo-starui/markets-ui-react-reference -- --port 5197
   ```

2. **OpenFin runtime.** `@openfin/node-adapter` auto-downloads the runtime
   binary (~100MB) on first launch.

3. **A display.** OpenFin doesn't run headless. On Linux CI use `xvfb-run`.

4. Workspace install: `npm install`

## Running

From the repo root:

```
npm run test:e2e:openfin
```

…which is shorthand for `npm test -w @wellsfargo-starui/e2e-openfin`. Default manifest:

```
http://localhost:5197/platform/manifest.e2e.fin.json
```

(CDP port **9190**, dedicated security realm `marketsui-e2e`.)

Override manifest URL:

```
MUI_MANIFEST_URL=http://localhost:5197/platform/manifest.e2e.fin.json npm run test:e2e:openfin
```

Each spec runs sequentially (`pool: 'forks'`, `singleFork: true` in
`vitest.config.ts`) — multiple OpenFin platforms racing for ports and
shared Dexie DBs would just confuse each other.

## How it works

1. `globalSetup.ts` ensures `@wellsfargo-starui/markets-ui-react-reference` is reachable at port 5174 (starts it if needed).
2. Spec `beforeAll` calls `launchPlatform(manifestUrl)` from `helpers/platform.ts`.
3. `launchPlatform` invokes `@openfin/node-adapter`'s `launch()` to boot
   the runtime, waits for CDP port **9090**, connects the `fin` proxy,
   waits for the provider window, then polls the test bridge channel.
4. The provider window loads `/platform/provider`, which calls `initWorkspace()`. In dev mode it then dynamically imports
   `@wellsfargo-starui/host-wrapper-react/test-bridge` which
   creates an OpenFin Channel named `marketsui-test-bridge`.
5. The helper's `BridgeClient` connects to that channel and exposes
   typed methods (`saveWorkspace`, `getWorkspaces`, `getWorkspace`,
   `deleteWorkspace`, `ping`).
6. Each spec calls those methods, which the bridge proxies into
   `WorkspacePlatform.getCurrentSync().Storage.*` — these route through
   the override in `packages/openfin-platform/src/workspace-persistence.ts`
   which writes/reads ConfigService rows.
7. `afterAll` quits the platform.

### Playwright CDP path

For UI-level assertions (multi-window, dock, views), see
`specs/cdp-smoke.e2e.spec.ts` and `helpers/cdp.ts`. Playwright attaches
via `connectOverCDP` to the same `--remote-debugging-port=9090` the
manifest declares.

## CI implications

These tests are **not** part of the default CI build. The existing
[`.github/workflows/`](../.github/workflows/) pipelines run unit tests
and Playwright (against `apps/demos/demo-react`); they don't have OpenFin
runtime, a display, or a markets-ui dev server alive.

If you want to wire these into CI:

- Use `windows-latest` (or macOS) runners with desktop session enabled
- Install OpenFin runtime ahead of time (or accept the first-launch
  download cost in your CI time budget)
- Spin up the markets-ui dev server (`npm run dev -w @wellsfargo-starui/markets-ui-react-reference &`) and `wait-on http://localhost:5174`
- Then run `npm run test:e2e:openfin`
- Expect 1–2 minute runtimes per spec file; cache the OpenFin runtime
  download between runs

## Adding a new spec

1. Drop a file at `specs/<your-name>.e2e.spec.ts`.
2. Use `launchPlatform()` in `beforeAll` and `quit()` in `afterAll`.
3. If you need new bridge actions, add them to
   `@wellsfargo-starui/host-wrapper-react/src/test-bridge/install.ts` AND
   `e2e-openfin/helpers/platform.ts`'s `BridgeClient` interface.

## Files

```
e2e-openfin/
├── README.md                          (this file)
├── package.json                       (workspace; test script + node-adapter dep)
├── vitest.config.ts                   (long timeouts, sequential, node env)
├── helpers/
│   ├── platform.ts                    (launchPlatform + BridgeClient typed wrapper)
│   └── cdp.ts                         (CDP poll + Playwright attach helpers)
├── globalSetup.ts                     (auto-start dev server if needed)
└── specs/
    ├── workspace-persistence.e2e.spec.ts  (Phase 1 — workspace round-trip)
    └── cdp-smoke.e2e.spec.ts              (Playwright CDP attach smoke)
```

The bridge's in-app side lives at:
```
packages/react/hosts/host-wrapper-react/src/test-bridge/install.ts
```

…installed lazily from `Provider.tsx` only when `import.meta.env.DEV` is
true (the dev server). Never present in production bundles.
