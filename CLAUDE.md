# CLAUDE.md — agent instructions for `starui` (MarketsUI platform monorepo)

This is the MarketsUI platform library monorepo — `packages/`, `apps/`,
`docs/`, `scripts/`, `tools/`.

**The consumer/demo apps and the Playwright e2e suite live under `apps/`** —
merged back from the former sibling `@wellsfargo-starui/apps` repo (subtree,
history preserved) once every package held the 70% per-file coverage bar.
`apps/` is its **own npm install root**, deliberately outside the root
workspaces, turbo, lint, the coverage gate and Sonar (`sonar.sources=packages`),
so demo apps never enter the package CI surface — see
[`docs/APPS_REPO.md`](./docs/APPS_REPO.md).

**Read before editing:**

- [`README.md`](./README.md) — quick orientation, scripts, getting started
- [`docs/SIMPLIFICATION_ROADMAP.md`](./docs/SIMPLIFICATION_ROADMAP.md) — the
  simplification effort's execution record (phase status, constraints,
  deviations ledger); read this before touching anything the roadmap covers
- [`docs/SSRM_PARITY_ROADMAP.md`](./docs/SSRM_PARITY_ROADMAP.md) — the SSRM/CSRM
  behavioural-parity effort (11 phases, one per session; complete). **Its binding
  constraints govern any change to a customizer module that touches rows**:
  modules go through the `platform.data` port and never branch on the row model
- [`docs/SSRM_PARITY_COMPLETION.md`](./docs/SSRM_PARITY_COMPLETION.md) — the four
  findings that roadmap left open, sequenced as Phases 11–14 (one per session).
  Inherits the roadmap's binding constraints verbatim
- [`docs/WORKLOG.md`](./docs/WORKLOG.md) — **known-open items across both repos**; check
  before starting work so you don't rediscover a documented gap
- [`docs/COVERAGE_PLAN.md`](./docs/COVERAGE_PLAN.md) — the 70%-per-file effort, split
  into sessions. **Its `## Conventions` section is binding**: React components are
  tested with React Testing Library (enforced by `npm run check:rtl`, which scans
  `apps/source/*` as well as `packages/`), and a failing
  assertion means checking the source before touching the test
- [`docs/latest/architecture.md`](./docs/latest/architecture.md) — layer model +
  import rules (with diagrams); [`docs/latest/`](./docs/latest/README.md) is the
  current documentation set
- [`docs/current-features.md`](./docs/current-features.md) — granular inventory of every implemented feature in `packages/`, grouped by bucket. Kept in lockstep with code (update on every feature add/change/remove).

## Package manager

**npm 10 workspaces.** Never `pnpm`, never `yarn`. Install with plain
`npm install` — no `--legacy-peer-deps`, no `--force`. Every workspace
resolves cleanly. If a future install needs the flag, treat that as a
real ERESOLVE bug to investigate, not a permanent workaround.

**Lockfiles are not committed** (`package-lock.json` is gitignored). They pin `registry.npmjs.org`, which a client site behind a
corporate Artifactory can't reach — so each environment regenerates its own
lock on `npm install` against whatever registry its `.npmrc` points at (see
[`.npmrc.example`](./.npmrc.example)). Use `npm install` everywhere, **never
`npm ci`** (it requires a committed lock). Reproducibility rests on the version
pins in `package.json`.

One root `overrides` entry remains: `@openfin/core` is pinned to
`43.101.4` to keep the workspace direct deps aligned with the version
that `@openfin/workspace-platform` / `@openfin/notifications` /
`@openfin/workspace` declare as a transitive (currently `43.101.2`).
Drop the override only by aligning all five packages on the same
version in the same change.

## Package layout

All workspace packages live under **`packages/`** in seven
architecture buckets (see
[`docs/PACKAGE_ORGANIZATION.md`](./docs/PACKAGE_ORGANIZATION.md)):

| # | Bucket | Path | Packages |
|---|--------|------|----------|
| 1 | UI Design System | `design-system/` | `design-system` |
| 2 | React Grid | `react-grid/` | `grid` |
| 3 | Data Utilities | `data/` | `data` |
| 4 | OpenFin Utils | `openfin/` | `openfin` |
| 5 | React Core | `react-core/` | `react` (ui + workspace-setup-react + host-data-react) |
| 6 | Types | `types/` | `types` (types + shared-types) |
| 7 | Core | `core/` | `core` (engine + host + host-browser + host-config) |

> **The Angular buckets are deleted, not excluded.** `angular-ui`,
> `angular-grid` and `angular-core` (`app-angular`, `widgets-angular`,
> `config-browser-angular`, `grid-angular`) are gone — recover from git history
> if ever needed.
>
> **All Angular packages are deleted** (including the last scaffold,
> `data/host-data-angular`, removed on `feature/simplify`). Recover from
> git history if ever needed. `build:packages` builds 7 packages (one per
> bucket — see `docs/WORKLOG.md` item 11).
>
> `@wellsfargo-starui/app` (`react-core/app`) and `tools/mcp-scaffold` were also
> deleted. `StarGridApp` is vendored into the apps repo's star-demo, which was
> its only consumer.

**Apps** live under `apps/` (own install root; a `postinstall` symlink
resolves the platform to the parent directory) — see
[`docs/APPS_REPO.md`](./docs/APPS_REPO.md).

The root `package.json` workspaces glob enumerates each bucket explicitly
(npm 10 doesn't do `packages/**`). When adding a new package:

1. Pick the architecture bucket by role (see table above).
2. Package name carries the framework suffix when a twin can exist; drop the
   suffix for framework-singletons (`grid`, `react`, `data`).
3. `tsconfig.json` `"extends"` is `"../../../tsconfig.base.json"` (3 levels)
   from `packages/<bucket>/<package>/`.

## File naming

One rule per kind-of-thing. The rule is **filename matches the case of the
file's primary export**. Symbol naming (classes/functions/constants) is
already idiomatic across the repo — the rule below is what brings file
names in line with the symbols they export.

| Kind | Filename | Symbol |
|---|---|---|
| Class (default-shaped export) | `AppDataStore.ts` | `class AppDataStore` |
| React functional component | `MarketsGrid.tsx` | `function MarketsGrid()` or `const MarketsGrid =` |
| React hook | `useGridApi.ts` | `function useGridApi()` |
| Plain function collection / utility | `inferFields.ts` | `function camelCase()`, `const camelCase` |
| Types-only module | `types.ts` | `interface PascalCase`, `type PascalCase` |
| Constants module | `constants.ts` | `SCREAMING_SNAKE` for true constants; `camelCase` otherwise |
| Barrel | `index.ts` | re-exports |
| Folders | kebab-case | `data-provider-editor/` |

**Allowed in types/, core/ and react/ buckets**: `camelCase` and `PascalCase` only.
No kebab. No snake.

**Carve-outs (kebab-case allowed despite the above)**:
- `packages/react-core/ui/src/components/**` — shadcn-ui CLI generates kebab
  filenames (`alert-dialog.tsx`, `dropdown-menu.tsx`); renaming would
  diverge from `npx shadcn add ...` future regenerations
- `packages/react-grid/grid/src/customizer/ui/shadcn/**` — gc-themed
  shadcn copy carried over from the legacy grid-react extraction

**Public subpath exports** in `package.json` `"exports"` may use kebab
even when they point at camelCase files (subpath name is the package's
public API; renaming breaks consumers). Examples:
`@wellsfargo-starui/design-system/icons/all-icons` → `icons-svg/allIcons.ts`,
`@wellsfargo-starui/design-system/cell-renderers` → `./dist/cellRenderers.js`.

ESLint enforcement (`unicorn/filename-case` per-bucket) is a follow-up
PR. Until then: convention enforcement happens in code review.

## Build

**Turborepo 2.** Scripts at root:

```bash
npm run build       # build:packages — turbo build + tsconfig.consumer.json
npm run typecheck   # build:packages then turbo typecheck
npm test            # turbo test — Vitest
npm run pack:npm    # individual member tarballs -> dist-npm/ (external consumers)
```

Every library package uses `"build": "rimraf dist && tsc"` (or
`ng-packagr`). The `rimraf` prefix is required to defeat a TS5055
"cannot overwrite input file" error that Turbo's cache-restore triggers
on the next run. Don't remove it.

## Install layout

- **Root** `npm install` / `npm run install:all` — `packages/*` only (workspace `"*"`).
- **`apps/` is a separate install root** (`cd apps && npm install`; not part of
  the root workspaces). Apps consume the packages two ways, both covered in
  [`docs/APPS_REPO.md`](./docs/APPS_REPO.md):
  - **source track** — Vite through `scripts/staruiConsumerAliases.mjs`, `tsc`
    through the generated `tsconfig.consumer.json`. Both resolve to absolute
    paths derived from **this repo's** location, so they work from anywhere.
  - **tarball track** — installs `npm run pack:npm` output (each package under
    its real name), the path an external Artifactory consumer takes.
- **What "source mode" actually resolves to.** The aliases prefer built
  `dist/` and fall back to `src/` only when `dist/` is absent. After
  `build:packages`, apps consume dist — *not* live TS. Delete a package's
  `dist/` to get live-source behaviour for that package.
- **Build-generated assets self-heal.** Source mode aliases TS/TSX live, but the
  design-system CSS (`dist/css/theme.css`) and `@wellsfargo-starui/data` SharedWorker
  (`dist/assets/data-services-worker.mjs`) are emitted by `build:packages`. The
  shared Vite config (`staruiEnsureBuiltAssetsPlugin` in
  `scripts/staruiConsumerAliases.mjs`) checks for them at `buildStart` and runs
  `npm run build:packages` automatically if either is missing — so any app
  `dev`/`build` works even after a `clean`/`rimraf` wiped `dist/`. Set
  `STARUI_SKIP_ENSURE_BUILD=1` to bypass. App typecheck `tsconfig`s map
  `react`/`react-dom` → the single repo-root `@types/react` (`compilerOptions.paths`)
  so deep-typechecking `@wellsfargo-starui/grid` source doesn't collide with a second
  transitively-installed `@types/react`.

## Shipping packages to external consumers

`npm run pack:npm` packs every publishable package as an **individual** npm
tarball under `dist-npm/` (gitignored), each under its real name
(`@wellsfargo-starui/grid`, not a bucket alias). That is the standard npm model:
consumers install and import with no aliases and no build config.

There is no longer a bucket-tarball step. `scripts/propagate.mjs`, `libs/`,
`dist/` and `scripts/bootstrap.mjs` were deleted: bucket tarballs renamed every
member to `@wellsfargo-starui/<bucket>` with `./<member>` subpaths while the
shipped `dist` files still imported each other by real name, so they only ever
resolved through this repo's Vite alias layer — never installable externally.
Their last consumer was the legacy in-repo apps layout; today's `apps/` tree
uses `pack:npm` output for its tarball track. See
[`docs/APPS_REPO.md`](./docs/APPS_REPO.md).

## Testing

- Vitest 4 + jsdom 29 for unit tests. Baseline (2026-08-18): **6799 passing,
  1 skipped across 692 test files** (`npm run test:coverage` — turbo across
  `packages/`). Largest contributors: `react-grid` (2846), `core` (1452),
  `data` (948), `react` (541), `openfin` (483), `design-system` (358),
  `types` (171).
  The per-file 70% coverage gate rides the same run — see
  [`docs/COVERAGE_PLAN.md`](./docs/COVERAGE_PLAN.md), whose `## Conventions`
  section is binding for new tests. **Every file in `packages/` (817) and in
  `apps/source/` (309) is at or above 70% on lines, statements, functions and
  branches**; `apps/` enforces it through its own
  `apps/scripts/vitestCoverage.mjs`, which mirrors the package policy and is
  checked by `apps/scripts/check-package-coverage.mjs`.
- **Playwright lives under `apps/`** (`apps/e2e`, `apps/e2e-openfin`), along
  with the apps its specs drive. Nothing under `packages/` runs e2e, and the
  package test/coverage runs never enter `apps/`. `cd apps && npm run e2e` is
  **74 tests across 15 specs, green** — the 35 specs written against the
  deleted `demo-react` app were removed on 2026-08-18; most surviving specs
  drive `markets-grid-lab` (`:5300`), which renders the full customizer. See
  [`apps/E2E_STATUS.md`](./apps/E2E_STATUS.md) for the spec-to-app map, and
  [`docs/E2E_RECOVERY_PLAN.md`](./docs/E2E_RECOVERY_PLAN.md) for the phased
  recovery of the coverage that deletion cost.

## UI stack rules (non-negotiable)

Every UI component — new or updated — MUST:

1. **Consume `@wellsfargo-starui/design-system` tokens.** Never hardcode colors,
   spacing, typography. Resolve through `--bn-*` / `--fi-*` CSS variables
   or the semantic exports from `@wellsfargo-starui/design-system/tokens/semantic`.

2. **Use the framework-matching primitive library:**
   - **React** → shadcn/ui (via `@wellsfargo-starui/react` + `@wellsfargo-starui/grid` customizer
     primitives). **No native `<input>` / `<textarea>` / `<select>`.**
     (All Angular packages are deleted; there is no PrimeNG surface.)

3. **Be 100% dark/light compatible.** Every surface renders correctly
   under `[data-theme="dark"]` AND `[data-theme="light"]`. No hardcoded
   hex anywhere. Theme switching = flip `data-theme` on `<html>`;
   tokens resolve from there.

Applies to one-off dev UIs too. If tempted to build a custom primitive
that duplicates an existing shadcn/PrimeNG one, stop and use the existing
one instead.

## Import boundary rules

Enforced by `eslint.config.mjs` boundary zones (error level). See
[`docs/latest/architecture.md`](./docs/latest/architecture.md) for the full
layer diagram. Key rules:

- Foundation packages (`types`, `design-system`) must
  not import from anywhere except each other.
- `@wellsfargo-starui/core` must not import from framework adapters (`grid`).
- Only `@wellsfargo-starui/openfin` may import from `@openfin/core`.
- Apps import from packages, never the reverse.

## Pre-implementation checklist

Run mentally before writing code for any feature add / update / remove:

1. **Architecture fit** — does it belong in the layer it's being added to?
2. **Design-system fit** — use shared primitives, not new ones
3. **Reuse before new** — search for existing implementations first
4. **Anti-pattern refuse list** — no native `<input>`/`<textarea>`/`<select>`
   (use shadcn), no per-panel re-exploration of settled UI
5. **Complexity ceilings** — 800 lines / file, 80 lines / function, as ESLint
   counts them (`max-lines` / `max-lines-per-function`, both configured
   `skipBlankLines` + `skipComments` — NOT `wc -l`, which in this codebase
   reads hundreds of lines higher). Both are `warn`, and ~192 functions are
   already over, so the rule that is actually enforced is on the DIFF:
   `npm run check:complexity` fails a change that grows a function already over
   the ceiling. Pay for what you add by hoisting a closure that captures
   nothing to module level — see `docs/WORKLOG.md` item 21
6. **Test coverage** — unit for logic, e2e for interaction
7. **No versioned code** — never `v1/`, `v2/`, `legacy/` in paths or
   doc phasing; superseded code is deleted in the same change as its
   replacement

## Post-implementation checklist

After every feature add / update / fix / removal:

1. Update [`docs/current-features.md`](./docs/current-features.md) — same
   commit or immediate `docs:` follow-up. Add/edit/delete the bullets that
   correspond to the capability you changed; keep granularity at one bullet
   per importable thing. Don't ask the user first; just do it.
2. Run `npx turbo typecheck build test` and ensure green.
3. If interaction changes, add/update the e2e spec under `apps/e2e`.
4. Commit messages: conventional prefixes (`feat(pkg):`, `fix(pkg):`,
   `chore:`, `docs:`, `test:`, `ci:`, `refactor(pkg):`).

## Dep version edits

Pin to the **stable line** for each major (React 19.2.x, @openfin/core
43.101.x), not the latest patch. Document a per-package "stable-vs-latest"
rationale inline in a `//dependencies-registry-notes` block when introducing
version pins. Don't drift: the whole reason for this monorepo was to stop
drift.
