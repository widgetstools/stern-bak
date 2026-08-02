# `@wellsfargo-starui/apps`

Consumer and reference apps for the MarketsUI platform. **Never deployed** —
only `packages/*` in the platform repo get published.

These apps used to live at `apps/` inside the platform repo. They were split out
because the enterprise CI/CD pipeline demands unit-test coverage for every module
it finds, and demo apps that exist purely to exercise the libraries should not be
carrying tests to satisfy a coverage gate.

**Known-open items for both repos** are indexed in
[`stern-bak/docs/WORKLOG.md`](https://github.com/widgetstools/stern-bak/blob/main/docs/WORKLOG.md)
— check it before starting work. The e2e suite in particular has a documented
gap (see [`E2E_STATUS.md`](./E2E_STATUS.md)).

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

This tree needs the platform checkout. **Its location is not hardcoded
anywhere** — `scripts/resolvePlatform.mjs` finds it at install time:

1. `$STARUI_PLATFORM`, if set
2. the **parent directory** — the default layout, since this tree lives at
   `<platform>/apps`
3. a sibling directory named `stern-bak` (the legacy split-repo layout)
4. failing that, **any** sibling whose `package.json` is named
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

Every UI app has a tarball twin. `stomp-view-server` does not, and should not:
it imports zero `@wellsfargo-starui` packages, so a tarball copy would prove
nothing.

| Track | Apps | Ports |
|---|---|---|
| `source/` | 7 | 5175, 5193, 5194, 5213, 5300, 5310, 8081 |
| `tarball/` | 6 | source port **+ 1000** (6175, 6193, …) so both tracks can run at once |

**`tarball/` is generated — do not hand-edit it.**

```bash
npm run make:tarball-apps    # regenerate all six from source/
npm run setup:tarball        # vendor the tarballs, then install each app
```

`scripts/makeTarballApp.mjs` copies each app's `src/` **verbatim** and rewrites
only its four config surfaces (`package.json`, `vite.config.ts`,
`tailwind.config.js`, `tsconfig*.json`). That is the whole point: both tracks
run identical application code, so a failure in `tarball/` is a genuine
external-consumption defect in the packages rather than a porting artefact. If a
tarball app ever needs a `src/` edit to build, fix the package.

Per-app specifics that cannot be inferred (port, `vite-plugin-svgr` for
star-demo, `assetsInclude` for markets-grid-lab) live in the `APPS` table at the
top of that script — add an entry there to add an app.

### Dependencies vs overrides

Each tarball app's `dependencies` lists **only the packages it actually
imports** — 2 for `design-system`, 15 for `star-demo` — because that is what a
real consumer's manifest looks like. The generator derives the list by scanning
the app's own source.

`overrides` then names the **whole packed set**, pointing every
`@wellsfargo-starui/*` at `vendor/*.tgz`. That block is purely a *"no registry
available"* shim: the packed tarballs depend on each other by concrete version
and none are published, so without it npm goes to the registry for every
transitive one and 404s. Against a real Artifactory the registry answers and the
block would not exist.

Two npm behaviours pin this shape, both established by experiment rather than
docs:

- Overriding a package whose direct dependency uses a **different** spec
  (`"^0.1.0"` vs `"file:…"`) fails with `EOVERRIDE`. The identical `file:` spec
  in both places is accepted.
- Listing only the *transitive remainder* in `overrides` is **not** enough: once
  overrides are present, a direct `file:` dep stops satisfying a transitive
  semver range for that same package and npm 404s on it. So `overrides` must
  name every package, direct ones included.

## Why `pack:npm`, not `propagate`

`propagate` packs one tarball per architecture **bucket**
(`@wellsfargo-starui/react-grid` with `./grid` subpaths). That shape only
resolves through the platform's Vite alias layer and was never installable
externally. `pack:npm` packs each package under its **real name**, which is what
external teams consume — so that is what the tarball track uses.
