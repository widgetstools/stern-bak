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

This repo needs the platform checkout. **Its directory name is not hardcoded
anywhere** — `scripts/resolvePlatform.mjs` finds it at install time:

1. `$STARUI_PLATFORM`, if set
2. a sibling directory named `stern-bak` (the default layout)
3. failing that, **any** sibling whose `package.json` is named
   `@wellsfargo-starui/platform`

So renaming or relocating the platform checkout needs no edit here. A candidate
only counts if that `name` field matches, so an unrelated directory is never
picked up by accident.

```
workspace/
  <platform>/       # any name — @wellsfargo-starui/platform
  starui-apps/      # this repo
```

```bash
# 1. platform repo — build packages (emits dist/ + tsconfig.consumer.json)
cd ../<platform> && npm install && npm run build:packages

# 2. tarball track only — pack the member packages into dist-npm/
npm run pack:npm

# 3. this repo — source track
cd ../starui-apps && npm install

# 4. this repo — tarball track (vendors the tarballs, then installs)
npm run setup:tarball
```

Platform checkout somewhere unusual:

```bash
STARUI_PLATFORM=/path/to/platform npm install          # macOS / Linux
set STARUI_PLATFORM=C:\path\to\platform && npm install # Windows
```

### How each track links back

- **source** — `postinstall` runs `scripts/linkPlatform.mjs`, which creates
  `node_modules/@wellsfargo-starui/platform` (a junction on Windows, a relative
  symlink elsewhere). npm prunes it on each install as extraneous; postinstall
  puts it back. That symlink is what makes
  `@wellsfargo-starui/platform/scripts/...` and the `tsconfig.consumer.json`
  `extends` resolve.
- **tarball** — `scripts/setup.mjs` **copies** the platform's `dist-npm/*.tgz`
  into `vendor/`, stripping the version:

  ```
  <platform>/dist-npm/wellsfargo-starui-grid-0.1.0.tgz
    -> vendor/wellsfargo-starui-grid.tgz
  ```

  The pins therefore reference this repo, and survive both a renamed checkout
  and a package version bump. `vendor/` is gitignored.

  `tarball/*` is deliberately **not** an npm workspace: npm resolves the
  workspace tree before running any lifecycle script, so a workspace member can
  never depend on files an install hook produces. Installing it separately is
  also higher fidelity — an external consumer has its own isolated
  `node_modules`, not this repo's hoisted one.

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
member packages as `file:../../vendor/<name>.tgz` deps.

Declare **all 21** members, not just the ones the app imports directly: the
packed tarballs depend on each other by concrete version, none are published, so
any transitive one you omit sends npm to the registry for a 404.

## Why `pack:npm`, not `propagate`

`propagate` packs one tarball per architecture **bucket**
(`@wellsfargo-starui/react-grid` with `./grid` subpaths). That shape only
resolves through the platform's Vite alias layer and was never installable
externally. `pack:npm` packs each package under its **real name**, which is what
external teams consume — so that is what the tarball track uses.
