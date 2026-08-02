# StarUI platform

A config-driven UI framework for capital-markets trading apps on OpenFin and
in the browser. StarUI ships a MarketsGrid product (AG Grid Enterprise +
customizer modules), a SharedWorker-backed data-services runtime, and hosted
shells so React and Angular widgets can run side-by-side under one OpenFin
workspace.

This monorepo consolidates previously fragmented Markets UI / widget tooling
into a single source of truth. Package names use the `@wellsfargo-starui/*` scope; the
repo directory is `starui/`.

See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for the layer model and
[`docs/PACKAGE_ORGANIZATION.md`](./docs/PACKAGE_ORGANIZATION.md) for the ten
architecture buckets.

## Monorepo layout

```
starui/                      # npm workspace root
├── packages/                # ten architecture buckets (@wellsfargo-starui/* libraries)
├── apps/                    # consumer/reference demos (apps/demos/*) — installed | source modes
├── docs/                    # architecture, parity, consumer guides
├── scripts/                 # propagate, Vite/Tailwind consumer helpers
├── tools/                   # OpenFin launcher + dev utilities
├── e2e/                     # Playwright suite (demo-react + reference app)
└── e2e-openfin/             # OpenFin CDP smoke tests
```

## Stack

- **Node** ≥ 20, **npm** 10 workspaces, **Turborepo** 2
- **React** 19.2.x + **TypeScript** 5.9.x + **Vite** 7.x
- **Angular** 21.1.x (`ng-packagr` for library packages)
- **AG Grid Enterprise** 35.1.x (`themeQuartz`, module registry)
- **OpenFin** 43.101.x (Core / Workspace / Dock-Manager)
- **Dexie** (IndexedDB) for local config persistence; SharedWorker for live data
- **Radix UI** + shadcn primitives via `@wellsfargo-starui/react`
- **Vitest** 4 + **Playwright** 1.59

## Package buckets

Seven buckets under `packages/`, one published package each after the
package collapse (WORKLOG item 11) — former member packages live on as
export subpaths of their bucket package.

| # | Bucket | Path | Package |
|---|--------|------|---------|
| 1 | Design system | `design-system/` | `@wellsfargo-starui/design-system` (design-system + icons-svg) |
| 2 | React grid | `react-grid/` | `@wellsfargo-starui/grid` (grid + config-browser + widgets-react) — MarketsGrid + customizer |
| 3 | Data | `data/` | `@wellsfargo-starui/data` (host-data) |
| 4 | OpenFin | `openfin/` | `@wellsfargo-starui/openfin` (openfin-platform + host-openfin) |
| 5 | React core | `react-core/` | `@wellsfargo-starui/react` (ui + widget-sdk + host-wrapper-react + workspace-setup-react + host-data-react) |
| 6 | Types | `types/` | `@wellsfargo-starui/types` (types + shared-types) |
| 7 | Core | `core/` | `@wellsfargo-starui/core` (engine + host + host-browser + host-config + widget + widget-browser) |

**Import rules (summary):** foundation packages never import framework adapters;
only `@wellsfargo-starui/openfin` may import `@openfin/core`; apps import
from packages, never the reverse. Full rules in [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md).

## Apps

| App | Port | Command |
|---|---|---|
| `demo-react` | 5190 | `npm run dev:demo-react` |
| `demo-configservice-react` | 5191 | `npm run dev:demo-configservice-react` |
| `mockdata-provider-starui-app` | 5192 | `npm run dev:mockdata-provider-starui-app` |
| `dataprovider-editor-starui-app` | 5193 | `npm run dev:dataprovider-editor-starui-app` |
| `my-stomp-app` | 5200 | `npm run dev:my-stomp-app` |
| `demo-stomp-markets-grid` | 5210 | `npm run dev:demo-stomp-markets-grid` (needs `npm run dev:stomp`) |
| `stomp-marketsgrid-minimal` | 5213 | `npm run dev:stomp-marketsgrid-minimal` — lean STOMP→MarketsGrid code sample (needs `npm run dev:stomp`) |
| `platform-hooks-demo` | 5214 | `npm run dev:platform-hooks-demo` — AppData bootstrap + grid event callbacks (mock data, no broker) |
| `basic-starui-app` | 5194 | `npm run dev:basic-starui-app` |
| `markets-ui-react-reference` | 5174 | `npm run dev:markets-ui-react-reference` |
| `stomp-view-server` | 8081 | `npm run dev:stomp` |

`npm run dev` defaults to `demo-react` at http://localhost:5190.

Run `npm run verify:apps` to smoke-test dev servers.

### Packages vs consumer apps

| Layer | Path | Build command |
|-------|------|----------------|
| **Libraries** | `packages/*` | `npm run build:packages` |
| **Apps** (from source) | `apps/demos/*` | `npm run build:apps` |
| **Bucket tarballs** (external/Artifactory consumers only) | `libs/*.tgz` (gitignored) | `npm run propagate` |

Apps build **from source**: Vite maps `@wellsfargo-starui/grid`, `@wellsfargo-starui/app`, … to
`packages/` via [`scripts/staruiConsumerAliases.mjs`](./scripts/staruiConsumerAliases.mjs),
and `tsc` resolves them via the repo-root workspace symlinks. Apps declare **no**
`@wellsfargo-starui/*` deps and need **no** `libs/*.tgz`. The tarballs exist only for external
(Artifactory) consumers — see [Running apps](#running-apps) below.

After library changes, apps pick up edits live — just rebuild:

```bash
npm run build:packages
npm run build:apps
npm run verify:consumer    # CI parity: also packs Artifactory tarballs
```

Validate source-mode resolution before starting demos:

```bash
npm run check:source-aliases           # warn if build:packages still needed
npm run check:source-aliases -- --strict   # fail until packages are built
```

Full matrix: **[`docs/BUILD.md`](./docs/BUILD.md)** and **[`apps/README.md`](./apps/README.md)**.

## Grid customizer modules (`@wellsfargo-starui/grid`)

| Module | Priority | Purpose |
|---|---|---|
| `general-settings` | 0 | Grid Options — row sizing, selection, flash-on-change + colour swatches, side bar, … |
| `column-templates` | 1 | Named style templates |
| `column-customization` | 10 | Per-column format, filter, style, layout |
| `calculated-columns` | 15 | Expression-driven virtual columns |
| `column-groups` | 18 | Header group hierarchy |
| `conditional-styling` | 20 | Expression-driven row/cell painting |
| `saved-filters` | 30 | Quick-filter pills |
| `toolbar-visibility` | 40 | Toolbar show/hide |
| `grid-state` | 200 | AG Grid native state on explicit Save |

See **[docs/BUILD.md](./docs/BUILD.md)** and **[docs/LIBS.md](./docs/LIBS.md)** for build and tarball layout.

## Prerequisites

- **Node.js** ≥ 20
- **npm** 10.x (see `packageManager` in root `package.json` — use `npm install`, not `yarn` / `pnpm`)

> **Lockfiles are not committed.** `package-lock.json` / `apps/package-lock.json`
> are gitignored — they pin `registry.npmjs.org`, which a site behind a corporate
> Artifactory can't reach. Every install uses `npm install` (never `npm ci`); each
> environment regenerates its own lock against the registry in its `.npmrc` (see
> [`.npmrc.example`](./.npmrc.example)). Version pins in `package.json` are the
> reproducibility anchor.

## Getting started

The build pipeline targets **React + shared** packages and the **React/node**
demo apps. (Angular is excluded from the build — see
[CLAUDE.md](./CLAUDE.md#package-layout).) There are **two install surfaces**:

| Surface | Path | What gets installed |
|---------|------|---------------------|
| **Packages** | repo root | `packages/*` (React + shared), `tools/mcp-scaffold`, `e2e-openfin` — workspace `"*"` links between libraries |
| **Apps** | `apps/` (nested workspace) | Demos — their own third-party deps (react, ag-grid, …); `@wellsfargo-starui/*` resolves from `packages/` source (no tarballs) |

### Fresh clone

```bash
git clone <repo-url> starui
cd starui

npm install            # 1. root — packages/* (React + shared) + workspace links
npm run install:apps   # 2. apps/ — each demo's own third-party deps
```

That's the whole setup — no `libs/*.tgz` and no Angular/Artifactory step needed.
Then **run** or **build** (next sections).

> **One-command alternative:** `npm run install:all` runs
> `npm install` → `build:packages` → `propagate` (packs gitignored `libs/` for
> external Artifactory consumers) → `install:apps`. Use the two explicit commands
> above to skip the tarball packing.

### Existing clone (after `git pull`)

```bash
npm install            # reconcile root workspace (only if packages/deps changed)
npm run install:apps   # reconcile apps workspace (only if an app's deps changed)
npm run build:packages # rebuild libraries if package source changed
```

`install:apps` is the **safe reconcile** for the nested apps workspace — it clears
the apps lockfile and re-resolves every demo's deps. Re-run it whenever an app
errors on a missing dependency (never `rm -rf apps/node_modules` or
`npm i -w <app>` — those leave the tree inconsistent).

### Run an app

```bash
npm run dev                  # demo-react → http://localhost:5190
npm run dev:star-demo        # → http://localhost:5175
npm run dev:markets-grid-lab
npm run star-demo            # star-demo + OpenFin client
```

The first `dev`/`build` **auto-runs `build:packages`** if the design-system CSS /
host-data worker aren't built yet (the `staruiEnsureBuiltAssetsPlugin` self-heal),
so you never hit a cryptic `ENOENT … theme.css`. To build the libraries up front:
`npm run build:packages`. (Bypass the auto-build with `STARUI_SKIP_ENSURE_BUILD=1`.)

### Build the apps

```bash
npm run build:packages   # build the 23 React + shared libraries
npm run build:apps       # production-build all 16 React/node apps → apps/demos/<app>/dist
```

`@wellsfargo-starui/*` resolves from live `packages/` source, so after editing a library you
just re-run `build:apps` (or hot-reload in `dev`) — no re-`propagate` needed.

### Library-only work (faster)

```bash
npm install
npm run build:packages
npm test
```

Skip `install:apps` until you need to run a demo or `npm run build:apps`.

### Pack Artifactory tarballs (external consumers only)

```bash
npm run build:packages
npm run propagate            # writes gitignored libs/*.tgz + manifest.json
# or force a full rebuild: npm run bootstrap -- --force
```

CI parity for the whole pipeline: `npm run verify:consumer`
(`build:packages` → `propagate` → `install:apps` → `build:apps`).

---

## Running apps

Each Vite demo lives **once** under `apps/demos/<app>/` and builds **from source**:
[`scripts/staruiConsumerAliases.mjs`](./scripts/staruiConsumerAliases.mjs) aliases
`@wellsfargo-starui/*` to live `packages/` source for Vite, and `tsc` resolves the same
imports via the repo-root workspace symlinks. Apps declare **no** `@wellsfargo-starui/*` deps
and need **no** `libs/*.tgz`.

> **Setup:** `npm install && npm run install:apps` once after clone (see
> [Getting started](#getting-started)). `stomp-view-server` is a plain node app
> (no `@wellsfargo-starui/*` deps); `demo-angular` is excluded from the build.

#### From the repo root

```bash
# Primary demo — http://localhost:5190
npm run dev
npm run dev:demo-react

# Other demos (all root dev:* scripts)
npm run dev:markets-ui-react-reference    # → http://localhost:5174
npm run dev:star-demo                     # → http://localhost:5175
npm run dev:markets-grid-lab

# By workspace name (any Vite demo)
npm --prefix apps run dev -w @wellsfargo-starui/demo-react
npm --prefix apps run dev -w @wellsfargo-starui/star-demo

# Production bundles — all apps, or one app
npm run build:apps
npm --prefix apps run build -w @wellsfargo-starui/demo-react
```

#### From inside an app folder

```bash
cd apps/demos/demo-react

npm run dev          # dev server (source)
npm run build        # production bundle (source)
```

Edit files under `packages/` — the running dev server hot-reloads without any
extra step.

---

## Quick demo commands

```bash
npm install && npm run install:apps

# Primary React demo — http://localhost:5190
npm run dev

# OpenFin reference app (MarketsGrid + data-services) — http://localhost:5174
npm run dev:markets-ui-react-reference

# Launch demo-react inside OpenFin
npm run dev:openfin

# Launch the React reference app inside OpenFin
npm run dev:openfin:markets-react
```

## Build & test pipelines

Turbo's graph covers direct workspace deps. Demo apps build from `packages/`
source (no tarballs); the package and app builds are orchestrated explicitly:

```text
Packages (libraries)                Apps (demos, from source)
─────────────────────               ─────────────────────────
npm run build:packages        →     npm run install:apps
npm run typecheck:packages          npm run build:apps
npm run test:packages               npm run typecheck:apps
```

### Root scripts

| Script | What it does |
|---|---|
| `build:packages` | Build all libraries under `packages/` |
| `build:apps` | Build all demo apps from source |
| `build:consumer` | `build:packages` → `propagate --no-build` (pack tarballs) → `install:apps` |
| `typecheck:packages` | `tsc --noEmit` on libraries |
| `typecheck:apps` | Typecheck demo apps from source |
| `typecheck:consumer` | `build:packages` → `install:apps` → `typecheck:apps` (CI) |
| `test:packages` | Vitest across library packages (`npm test`) |
| `check:source-aliases` | Verify `@wellsfargo-starui/*` Vite aliases resolve in source mode (`--strict` fails until `build:packages` done) |
| `check:tarballs` | Fail if local `libs/*.tgz` are stale vs `packages/` build (optional; `libs/` not in git) |
| `verify:consumer` | CI parity: `build:packages` → `propagate` (pack tarballs) → `install:apps` → `build:apps` (source) |
| `install:apps` | Fresh `npm install` in nested `apps/` workspace |
| `install:all` | `bootstrap` — packages + propagate + apps (fresh clone default) |
| `bootstrap` | `npm install` → `build:packages` → `propagate` → `install:apps` |
| `propagate` | Rebuild gitignored `libs/` bucket tarballs for external (Artifactory) consumers |
| `e2e` | Playwright (`e2e/`) |
| `test:e2e:openfin` | OpenFin CDP smoke tests (`e2e-openfin/`) |
| `clean` | Remove `node_modules`, `dist`, `.turbo` |

Shorthand defaults:

```bash
npm run build        # build:consumer
npm run typecheck    # typecheck:consumer
npm test             # test:packages
```

Package-scoped:

```bash
npm run build -w @wellsfargo-starui/core
npm test  -w @wellsfargo-starui/grid
```

### Tarballs (external consumers only)

The repo's own apps build from source and don't use these tarballs. `propagate`
packs them for external (Artifactory) consumers:

- `npm run propagate` writes one `.tgz` per architecture bucket under `libs/`
  (e.g. `starui-react-grid.tgz` bundles `@wellsfargo-starui/grid`). The name is stable —
  no version or content hash.
- Manifest: `libs/manifest.json` when present, else `dist/packages/manifest.json`
  after a package build.
- External consumers install the same buckets from Artifactory and wire Vite through
  [`scripts/staruiConsumerVite.mjs`](./scripts/staruiConsumerVite.mjs).

## Hosting a MarketsGrid in the reference app

The React reference app (`apps/markets-ui-react-reference`) hosts blotters via
plain client-side routes. Use `<HostedMarketsGrid>` from
`@wellsfargo-starui/grid/widgets/hosted` — it replaces the older multi-layer
HostedComponent / BlotterGrid stack with one call site.

The wrapper owns identity (`instanceId`, `appId`, `userId`), ConfigService-backed
storage, data-services mounting, theme, document title, and OpenFin workspace
save hooks. The route view only supplies grid-specific props.

```tsx
// apps/markets-ui-react-reference/src/views/BlottersMarketsGrid.tsx
import { HostedMarketsGrid } from '@wellsfargo-starui/grid/widgets/hosted';

export default function BlottersMarketsGrid() {
  return (
    <HostedMarketsGrid
      componentName="MarketsGrid"
      defaultInstanceId="markets-ui-reference-blotter"
      documentTitle="MarketsGrid · Blotter"
      withStorage
      theme="auto"
      dataServices={dataServices}
      dataServicesMode="eager"
      gridId="markets-ui-reference-blotter"
      historicalDateAppDataRef="positions.asOfDate"
      showFiltersToolbar
      showFormattingToolbar
      defaultColDef={{ floatingFilter: true, filter: true, sortable: true, resizable: true }}
    />
  );
}
```

Wire the view as a lazy route (e.g. `/blotters/marketsgrid`). The same URL works
in the browser, an OpenFin view (identity from `customData`), or a standalone
OpenFin window.

More detail: [`packages/react-grid/widgets-react/src/hosted/README.md`](./packages/react-grid/widgets-react/src/hosted/README.md).

### OpenFin launch contexts

| Context | Command |
|---|---|
| Browser dev | `npm run dev:markets-ui-react-reference` |
| OpenFin workspace | `npm run dev:openfin:markets-react` |
| Manual manifest | `npm run launch:openfin -- http://localhost:5174/platform/manifest.fin.json` |

## Testing

| Layer | Command | Notes |
|---|---|---|
| Unit (packages) | `npm test` | Vitest 4 + jsdom |
| Consumer verify | `npm run verify:consumer` | Tarballs + app build/typecheck |
| E2E (browser) | `npm run e2e` | Playwright in `e2e/` |

Playwright starts dev servers automatically (`playwright.config.ts`):

- **5190** — `demo-react` (default `baseURL`; most `v2-*.spec.ts` tests)
- **5191** — `demo-configservice-react`
- **5174** — `markets-ui-react-reference` with `STARUI_DEV_SOURCE=1` (integration
  specs such as `hosted-markets-grid.spec.ts`, `reference-cell-flash.spec.ts`)
- **5214** — `platform-hooks-demo` with `STARUI_DEV_SOURCE=1` (`e2e/platform-hooks-demo.spec.ts`)

Run a single spec:

```bash
npx playwright test e2e/reference-cell-flash.spec.ts
STARUI_DEV_SOURCE=1 npx playwright test e2e/hosted-markets-grid.spec.ts
```

OpenFin CDP smoke tests live in `e2e-openfin/` — `npm run test:e2e:openfin`.

CI runs package and consumer jobs separately; see `.github/workflows/ci.yml`.

## Key docs

| Doc | Contents |
|---|---|
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | Layer model, import boundaries |
| [`docs/PACKAGE_ORGANIZATION.md`](./docs/PACKAGE_ORGANIZATION.md) | Ten-bucket layout |
| [`docs/PARITY.md`](./docs/PARITY.md) | Package parity gate |
| [`docs/guides/platform-bootstrap-config.md`](./docs/guides/platform-bootstrap-config.md) | Web `app-config.json` vs OpenFin manifest `customSettings` (`appId`, `userId`, hub bootstrap) |
| [`docs/EXTERNAL_CONSUMPTION.md`](./docs/EXTERNAL_CONSUMPTION.md) | **Teams outside this repo**: install from npm/tarballs, one-import styling, bundler support, publishing |
| [`docs/PACKAGING_CHANGELOG.md`](./docs/PACKAGING_CHANGELOG.md) | History behind the above — what the packaging workstream changed, how it was verified, and the open items |
| [`docs/guides/consumer-app-sharedworker-and-tailwind.md`](./docs/guides/consumer-app-sharedworker-and-tailwind.md) | SharedWorker + Tailwind pitfalls for IN-REPO consumer apps (source mode) |
| [`docs/guides/design-system-upgrade-and-openfin-palette.md`](./docs/guides/design-system-upgrade-and-openfin-palette.md) | StarUI v1 OKLCH token upgrade + OpenFin `CustomPaletteSet` bridge |
| [`docs/STOMP_DATAPROVIDER_MARKETSGRID_GUIDE.md`](./docs/STOMP_DATAPROVIDER_MARKETSGRID_GUIDE.md) | Fresh app + STOMP provider + MarketsGrid end-to-end |
| [`docs/MARKETSGRID_USAGE_GUIDE.md`](./docs/MARKETSGRID_USAGE_GUIDE.md) | MarketsGrid scenarios (components, hub, OpenFin, persistence) |
| [`docs/guides/platform-hooks-demo.md`](./docs/guides/platform-hooks-demo.md) | AppData bootstrap hooks + grid event callback bindings |
| [`CLAUDE.md`](./CLAUDE.md) | Agent / contributor conventions |

## Platform tooling

- `tools/scripts/launch-openfin.mjs` — launch a manifest inside OpenFin
- `scripts/propagate.mjs` — build and pack bucket tarballs
- `scripts/verify-apps.mjs` — dev-server smoke check

## Developer guide

Step-by-step commands for the three common audiences in this repo, plus
propagate, clean, and test workflows.

### Prerequisites

```bash
node -v    # ≥ 20
npm -v     # 10.x (npm 10 workspaces)
npm install     # from repo root — always start here on a fresh clone
```

Bucket tarballs under `libs/` are **gitignored** — run `npm run install:all`
(or `bootstrap`) on a fresh clone to generate them. After package changes, run
`npm run propagate`. Lockfiles aren't committed (regenerated per environment),
so there's nothing to commit but source. See [docs/LIBS.md](./docs/LIBS.md).

---

### Build by audience

#### 1. Library developers (packages only)

You edit code under `packages/` and use workspace `"*"` links between libraries.
Demo apps are **not** involved.

```bash
# Compile all libraries
npm run build:packages

# Typecheck libraries only
npm run typecheck:packages

# Unit tests (Vitest) across libraries
npm test
# same as: npm run test:packages

# Single package
npm run build -w @wellsfargo-starui/grid
npm run typecheck -w @wellsfargo-starui/core
npm test -w @wellsfargo-starui/grid
```

Use this loop while changing `@wellsfargo-starui/core`, `@wellsfargo-starui/grid`, `@wellsfargo-starui/react`, etc.
No propagate step is required until demo apps or external consumers need the change.

#### 2. Demo-app / consumer developers (apps in `apps/`)

Apps install StarUI as **bucket tarballs** from `libs/` (same model as
Artifactory consumers). After library changes, tarballs must be refreshed.

```bash
# Full consumer pipeline (CI parity) — packages → propagate → apps
npm run build

# Typecheck the same path
npm run typecheck

# CI gate before merge (build + typecheck apps)
npm run verify:consumer

# Check local libs/ tarballs match packages/ (optional; libs/ not in git)
npm run check:tarballs
```

**Fast local dev** — source mode is the default; no tarball refresh needed while editing `packages/`:

```bash
npm run dev:demo-react
npm run dev:markets-ui-react-reference
```

To validate the packed **tarballs** an external consumer would install:

```bash
npm run build:packages && npm run propagate    # writes libs/*.tgz + manifest.json
```

If edits to packages do not show up in the browser, clear the Vite prebundle cache:

```bash
rm -rf node_modules/.vite apps/*/node_modules/.vite
```

#### 3. External consumers (outside this repo)

External teams install bucket tarballs from Artifactory (or a copied `libs/*.tgz`
set), not the monorepo workspace.

1. Install the buckets your app needs (e.g. `@wellsfargo-starui/react-grid`, `@wellsfargo-starui/react-core`).
2. Copy [`scripts/staruiConsumerVite.mjs`](./scripts/staruiConsumerVite.mjs) and
   [`scripts/staruiConsumerAliases.mjs`](./scripts/staruiConsumerAliases.mjs) into
   the app (or use your internal scaffold).
3. Build and test in **your** app CI — StarUI does not publish per-member npm
   packages; each tarball bundles every package in an architecture bucket.

To produce tarballs from this monorepo for hand-off:

```bash
npm run build:packages
npm run propagate
# tarballs land in libs/ — see libs/manifest.json for filenames + members
```

#### 4. Scaffold apps with MCP (`@wellsfargo-starui/mcp-scaffold`)

MCP server (tarball in `libs/starui-mcp-scaffold-*.tgz`) scaffolds external-consumer
React apps with bundled `libs/` StarUI tarballs, design-system compliance, shadcn UI,
AG Grid themes, STOMP server, and OpenFin reference template.

```bash
# Pack MCP server (includes bundled platform tarballs)
npm run pack:mcp

# Run via npx
npx -y ./libs/starui-mcp-scaffold-0.1.0-<sha>.tgz
```

**Cursor / Claude Code** (`~/.cursor/mcp.json` or project `.mcp.json`):

```json
{
  "mcpServers": {
    "starui-scaffold": {
      "command": "npx",
      "args": ["-y", "./libs/starui-mcp-scaffold-0.1.0-<sha>.tgz"],
      "env": { "STARUI_ROOT": "/path/to/starui" }
    }
  }
}
```

**VS Code** (`.vscode/mcp.json` — use `"servers"` root key + `"type": "stdio"`):

```json
{
  "servers": {
    "starui-scaffold": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "./libs/starui-mcp-scaffold-0.1.0-<sha>.tgz"]
    }
  }
}
```

Templates: `basic`, `mockdata-provider`, `dataprovider-editor`, `stomp`, `openfin-platform`.
See [`tools/mcp-scaffold/README.md`](./tools/mcp-scaffold/README.md).

---

### Building apps

Production builds for all demo / reference apps:

```bash
# Requires fresh libs/ tarballs — runs build:packages + propagate first
npm run build:consumer

# Apps only (fails if libs/ tarballs are missing or stale)
npm run build:apps
```

Build a **single app**:

```bash
npm run build --workspace=@wellsfargo-starui/demo-react
npm run build --workspace=@wellsfargo-starui/markets-ui-react-reference
npm run build --workspace=@wellsfargo-starui/demo-angular
```

Preview a production build locally:

```bash
npm run build --workspace=@wellsfargo-starui/demo-react
npm run preview --workspace=@wellsfargo-starui/demo-react
```

Dev servers (no production build):

```bash
npm run dev                              # demo-react → :5190
npm run dev:markets-ui-react-reference     # reference app → :5174
npm run verify:apps                        # smoke-check all dev server ports
```

---

### Propagate packages (tarballs → `libs/`)

`propagate` builds architecture-bucket tarballs, writes `libs/manifest.json`,
updates demo-app `package.json` tarball paths, and runs `npm install` where needed.

```bash
# Pack all buckets (typical after library changes)
npm run propagate

# Preview without writing files
npm run propagate -- --dry-run

# Pack one bucket only
npm run propagate -- react-grid
npm run propagate -- react-core
npm run propagate -- @wellsfargo-starui/grid          # resolves to containing bucket

# Remove orphaned tarballs in libs/
npm run propagate -- --gc

# Repack without rebuilding packages (use when only the manifest changed)
npm run propagate -- --no-build

# Repack without the root lockfile convergence install
npm run propagate -- --no-install
```

**When to propagate**

| You changed… | Run |
|---|---|
| Any package under `packages/` that demo apps consume | `npm run propagate` |
| Only docs / e2e / scripts (no package code) | Nothing |
| Before opening a PR that touches libraries | `npm run verify:consumer` |
| Before committing tarball updates | `npm run check:tarballs` |

Each bucket tarball uses a stable, content-independent name, e.g.
`libs/starui-react-grid.tgz`. `libs/manifest.json` maps
`@wellsfargo-starui/react-grid` → filename and lists member packages inside the bundle.
A version-stamped human-readable mirror is kept under `dist/packages/`.

---

### Clean

Remove installed dependencies, compiled output, and Turbo cache:

```bash
npm run clean
```

Then reinstall:

```bash
npm install
npm run propagate    # if libs/ was empty or you need fresh tarballs
```

To clear **Vite dev cache only** (stale hot reload after package edits):

```bash
rm -rf node_modules/.vite apps/*/node_modules/.vite
```

---

### Run tests

#### Unit tests (Vitest — libraries)

```bash
# All library packages
npm test

# One package
npm test -w @wellsfargo-starui/grid
npm test -w @wellsfargo-starui/core

# Watch mode (from a package directory)
npm run test:watch -w @wellsfargo-starui/grid
```

#### Typecheck

```bash
npm run typecheck:packages    # libraries only
npm run typecheck:apps        # apps only (needs current libs/ tarballs)
npm run typecheck             # full consumer path (default)
```

#### Consumer verification (pre-merge)

```bash
npm run verify:consumer       # packages + propagate + install:apps + build:apps (source)
npm run check:tarballs        # optional: local libs/ vs fresh pack (after propagate)
npm run check:deps            # package cycle check
```

---

### Run E2E tests

The Playwright suite lives under [`apps/`](./apps) (`apps/e2e`,
`apps/e2e-openfin`) along with the apps its specs drive — see
[`docs/APPS_REPO.md`](./docs/APPS_REPO.md). `npm test` at the root is Vitest
over `packages/` only; e2e runs from `apps/` (`cd apps && npx playwright test`).

### Quick reference

| Goal | Command |
|---|---|
| First-time setup | `npm run install:all` |
| Edit libraries | `npm run build:packages && npm test` |
| Edit libraries + test in demo app | `npm run dev` (hot-reloads `packages/` source) |
| Pack tarballs for an Artifactory hand-off | `npm run build:packages && npm run propagate` |
| Pre-merge CI check | `npm run verify:consumer && npm test && npm run e2e` |
| Production build all apps | `npm run build` |
| Nuke and reinstall | `npm run clean && npm run install:all` |

## Copyright

Internal Wells Fargo Capital Markets project. Not open-source.
