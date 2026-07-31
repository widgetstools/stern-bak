# `@wellsfargo-starui/apps`

Consumer and reference apps for the MarketsUI platform. **Never deployed** —
only `packages/*` in the platform repo get published.

These apps used to live at `apps/` inside the platform repo. They were split out
because the enterprise CI/CD pipeline demands unit-test coverage for every module
it finds, and demo apps that exist purely to exercise the libraries should not be
carrying tests to satisfy a coverage gate.

## Layout — two consumption tracks

```
source/     resolves @wellsfargo-starui/* out of the platform checkout
tarball/    installs @wellsfargo-starui/* as ordinary npm packages
```

| | `source/` | `tarball/` |
|---|---|---|
| Resolution | Vite aliases + `tsconfig.consumer.json`, both from the platform repo | plain `node_modules` |
| Vite config | `staruiConsumerViteConfig(...)` | **plain** — no platform imports |
| tsconfig | extends `@wellsfargo-starui/platform/tsconfig.consumer.json` | extends local `tsconfig.base.json` |
| Answers | "does a platform change break the demos?" | "can an external team actually install this?" |

The `tarball/` track is the honest external-consumer simulation: it must build
with **no** aliases and no access to the platform's `packages/` tree. That
property is verified by hiding `packages/` and rebuilding.

## Setup

This repo expects the platform checkout **beside it**:

```
workspace/
  stern-bak/        # platform repo (@wellsfargo-starui/platform)
  starui-apps/      # this repo
```

The link is the `"@wellsfargo-starui/platform": "file:../stern-bak"` dependency
in `package.json` — rename that path if your platform checkout is named
differently.

```bash
# 1. platform repo — build packages (emits dist/ + tsconfig.consumer.json)
cd ../stern-bak && npm install && npm run build:packages

# 2. tarball track only — pack the member packages
npm run pack:npm

# 3. this repo
cd ../starui-apps && npm install
```

## Commands

```bash
npm run typecheck:source    # all 7 source-track apps
npm run build:source
npm run typecheck:tarball
npm run build:tarball
npm run typecheck && npm run build   # both tracks

cd source/star-demo && npm run dev   # one app
```

## Apps (`source/`)

| App | Port | Purpose |
|---|---|---|
| `star-demo` | 5175 | OpenFin workspace demo; primary e2e target |
| `markets-grid-lab` | 5300 | MarketsGrid editing / profiles lab |
| `design-system` | 5310 | Design-system showcase |
| `stomp-marketsgrid-minimal` | 5213 | Smallest STOMP → grid path |
| `basic` | 5194 | Tutorial — minimal grid host |
| `dataprovider-editor` | 5193 | Tutorial — data-provider editor |
| `stomp-view-server` | 8081 | STOMP fixture server (not a UI app) |

`tarball/` currently carries `basic`. Adding another app is mechanical: copy it
from `source/`, point `tsconfig` at the local `tsconfig.base.json`, replace the
Vite/Tailwind configs with plain ones, and declare the `@wellsfargo-starui/*`
member packages as `file:` deps on `../../../stern-bak/dist-npm/*.tgz`.

## Why `pack:npm`, not `propagate`

`propagate` packs one tarball per architecture **bucket**
(`@wellsfargo-starui/react-grid` with `./grid` subpaths). That shape only
resolves through the platform's Vite alias layer and was never installable
externally. `pack:npm` packs each package under its **real name**, which is what
external teams consume — so that is what the tarball track uses.
