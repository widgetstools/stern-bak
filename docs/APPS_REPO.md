# The apps tree — how demos consume the packages

The consumer/demo apps and the Playwright suite live at **`apps/`** in this
repository. History: they started in-repo, moved to a sibling
`@wellsfargo-starui/apps` repo while the packages lacked coverage (the
enterprise pipeline demands unit-test coverage for every module it finds, and
demo apps should not carry token tests to satisfy a gate), and were merged
back by subtree once every package held the 70% per-file bar.

## `apps/` is an archive, not a tracked tree

**A fresh clone has no `apps/` directory.** The demos are ~5.4 MB of source
that changes rarely, and keeping them tracked made every CI job pay a second
full `npm install` for a tree nobody ships. They travel as `apps-demo.zip` at
the repo root and are extracted on demand (owner decision, 2026-09-15):

```bash
npm run apps:unpack          # extract apps/ from the archive
cd apps && npm install       # its own install root
# …work on a demo…
cd .. && npm run apps:pack   # re-archive; commit the zip AND the manifest
```

| | |
|---|---|
| `apps-demo.zip` | the archive — 751 files, 3.8 MB → 1.1 MB |
| `apps-demo.manifest.txt` | `<sha256>  <bytes>  <path>` per file, sorted |
| `npm run apps:check` | extracted tree vs. manifest; part of `lint:all` |

Three things keep that from becoming a foot-gun:

- **The manifest is committed beside the zip.** A binary blob throws away code
  review; the manifest puts back the part that matters — a PR shows exactly
  which demo files changed and by how much, even though the payload is opaque.
- **`apps:check` catches a stale archive** and is wired into `lint:all`, so
  "I edited a demo and forgot to re-pack" fails locally rather than silently
  losing the edit. It is a no-op when `apps/` is not extracted.
- **`apps:pack` refuses to write an archive that fails the coverage gate**
  (below). `--skip-gate` exists for a tree that cannot install.

`apps:pack` never archives generated output: its skip list mirrors
`apps/.gitignore` (`node_modules`, `dist`, `coverage`, `.turbo`, `vendor`,
`tarball`, Playwright artefacts, lockfiles) and it hard-fails if such a path
escapes the list. The 751 files it packs are exactly the 751 that were tracked
before the detach.

**History before the detach is intact** — `git log --follow -- apps/...` still
works for anything that existed then.

## The coverage bar still applies — at pack time

**`apps/` never enters the package CI surface.** It is its own npm install
root — outside the root workspaces, turbo, lint, CI and Sonar
(`sonar.sources=packages`, plus an explicit `apps/**` exclusion). The root
coverage gate (`scripts/check-package-coverage.mjs`) scans `packages/` only.

**The 70% per-file bar is not one of those exemptions**, but with the demos
out of CI there is no job to enforce it, so `apps:pack` does:

```bash
cd apps
npm run test:coverage:source   # every source app, per-file thresholds live
npm run test:coverage:check    # the gate — per file, plus the inclusion check
```

`apps/scripts/check-package-coverage.mjs` reads the same policy module the
packages read (`scripts/vitestCoverage.mjs`, via
`@wellsfargo-starui/platform/scripts/…`) so the two can never drift. Packing is
the only moment the demos change, so it is the only moment the bar can be
crossed. Two things stay out of scope:

- **the tarball track.** `tarball/<app>` is a verbatim, untracked copy of
  `source/<app>/src` that `makeTarballApp.mjs` regenerates; gating it would
  score the same files twice and put generated output on the critical path.
  It exists to prove the external install RESOLVES — `npm run test:tarball`.
- **Sonar.** Demo apps do not belong in the enterprise quality gate;
  `sonar.sources` stays `packages`.

## Layout

```
<platform>/          # this repo — @wellsfargo-starui/platform
  packages/          # the seven library buckets
  apps/              # consumer/demo apps + Playwright (own install root)
    source/*         # source-track apps (npm workspaces of apps/)
    tarball/*        # GENERATED tarball-track twins (gitignored)
    vendor/*.tgz     # vendored pack:npm output (gitignored)
    e2e/ e2e-openfin/
```

**The platform is resolved, never hardcoded.** `apps/scripts/resolvePlatform.mjs`
locates the checkout at install time — `$STARUI_PLATFORM`, else the **parent
directory** (the in-repo layout), else the legacy split-repo sibling paths — so
the same apps tree also works checked out beside the platform.

The apps tree materialises the link two ways:

- **source track** — a `postinstall` creates
  `apps/node_modules/@wellsfargo-starui/platform` pointing at the platform root,
  which is what makes `@wellsfargo-starui/platform/scripts/*` and the
  `tsconfig.consumer.json` `extends` resolve.
- **tarball track** — it **copies** `dist-npm/*.tgz` into `apps/vendor/`,
  stripping the version, so its pins reference nothing in `packages/` at all.

## Why moving them out worked

Two things in this repo were already location-independent:

- `scripts/staruiConsumerAliases.mjs` and `scripts/staruiTailwindContent.cjs`
  compute `REPO_ROOT` from **their own file location**, not from the app
  directory. Aliases resolve into `packages/` no matter where the app lives.
- The root `package.json` has **no `exports` field**, so any subpath is
  importable once the package is linked.

The one thing that did *not* survive the move was `tsc`. Apps used to resolve
`@wellsfargo-starui/*` through the root `node_modules/@wellsfargo-starui/<member>`
workspace symlinks, which only works as an ancestor lookup from inside this repo.
That is what `tsconfig.consumer.json` replaces.

## `tsconfig.consumer.json`

Generated by `scripts/gen-consumer-tsconfig.mjs` during `build:packages`, and
**gitignored** — it points at `dist/`, so it is build output.

It declares a `paths` entry per `@wellsfargo-starui/*` export. TypeScript
resolves `paths` relative to the config file that declares them, so a config
living here resolves into here regardless of who extends it:

```jsonc
// consumer app tsconfig.json
{ "extends": "@wellsfargo-starui/platform/tsconfig.consumer.json" }
```

Because `extends` **replaces** rather than merges `compilerOptions.paths`, a
consumer app must not declare its own `paths` block — it would silently wipe out
every package mapping.

## The two tracks

| | source | tarball |
|---|---|---|
| Resolution | aliases + `tsconfig.consumer.json` | plain `node_modules` |
| Input | this repo's `packages/` | `npm run pack:npm` → `dist-npm/*.tgz` |
| Vite config | `staruiConsumerViteConfig(...)` | plain — no platform imports |
| Answers | "did a platform change break the demos?" | "can an external team install this?" |

The tarball track must build with **no** aliases and with this repo's
`packages/` directory inaccessible. That is the check that keeps external
consumption honest.

`pack:npm` is the only packing step. A second one (`propagate`) used to emit one
tarball per architecture **bucket** into `libs/`, renaming members to
`@wellsfargo-starui/<bucket>` with `./<member>` subpaths; those resolved only
through the Vite alias layer and were never installable externally. With the
in-repo apps gone they had no consumer left, so `propagate.mjs`, `libs/`,
`dist/` and `bootstrap.mjs` were deleted.

## What "source mode" actually resolves to

A correction worth knowing, because the name is misleading: the aliases prefer
built **`dist/`** and fall back to `src/` only when `dist/` is absent. After
`build:packages`, apps consume dist — not live TypeScript. To get live-source
behaviour for one package, delete that package's `dist/`.

## Workflow

One command from the repo root does all of the below — build the packages,
pack them, and install both `apps/` tracks:

```bash
npm run setup:apps
```

What it runs, in order:

```bash
# repo root
npm install && npm run build:packages     # emits dist/ + tsconfig.consumer.json
npm run pack:npm                          # only needed for the tarball track

# apps/ (own install root)
cd apps
npm install                               # postinstall links platform -> parent
npm run setup:tarball                     # vendor pack:npm output, (re)generate
                                           # tarball/ twins, then install them
npm run typecheck && npm run build        # both tracks
```

`setup:tarball` runs `scripts/setup.mjs` (vendor), `scripts/makeTarballApp.mjs
--all` (regenerate) and `scripts/installTarball.mjs` (install) in sequence, so
one call covers both a fresh `tarball/` (doesn't exist yet) and a refresh
(already exists, contents drifted).

After changing a package, rebuild at the root; the source track picks it up on
the next app build. The tarball track additionally needs `pack:npm`, then
`setup:tarball` under `apps/` — or `npm run setup:apps` from the root for both.
