# CLAUDE.md — agent instructions for `starui` (MarketsUI platform monorepo)

This is the MarketsUI platform library monorepo — `packages/`, `docs/`,
`scripts/`, `tools/`.

**The consumer/demo apps and the Playwright e2e suite are NOT here.** They live
in a sibling repository (`@wellsfargo-starui/apps`, checked out beside this one)
because the enterprise CI/CD pipeline demands unit-test coverage for every module
it finds, and demo apps should not carry tests to satisfy a coverage gate. Those
apps still consume this repo's **source** — see
[`docs/APPS_REPO.md`](./docs/APPS_REPO.md).

**Read before editing:**

- [`README.md`](./README.md) — quick orientation, scripts, getting started
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — layer model + import rules
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

All workspace packages live under **`packages/`** in ten
architecture buckets (see
[`docs/PACKAGE_ORGANIZATION.md`](./docs/PACKAGE_ORGANIZATION.md)):

| # | Bucket | Path | Packages |
|---|--------|------|----------|
| 1 | UI Design System | `design-system/` | `design-system`, `icons-svg` |
| 2 | Angular UI Controls | `angular-ui/` | *(scaffold — PrimeNG/tokens)* |
| 3 | React UI Controls | `react-ui/` | `ui` |
| 4 | Angular Grid | `angular-grid/` | `grid` → `@wellsfargo-starui/grid-angular` |
| 5 | React Grid | `react-grid/` | `grid` → `@wellsfargo-starui/grid` |
| 6 | Data Utilities | `data/` | `host-config`, `host-data`, `host-data-react`, `host-data-angular` |
| 7 | OpenFin Utils | `openfin/` | `host-openfin`, `openfin-platform` |
| 8 | Angular Core | `angular-core/` | `app`, `widgets`, `config-browser` |
| 9 | React Core | `react-core/` | `widgets-react`, `widget-sdk`, `host-wrapper-react`, `config-browser`, `workspace-setup-react` |
| 10 | Core / Shared | `shared/` | `types`, `shared-types`, `engine`, `host`, `host-browser`, `widget`, `widget-browser` |

> **Angular is excluded from the build pipeline.** The build/typecheck/test/
> propagate flow targets **React + shared only**. The Angular buckets
> (`angular-ui`, `angular-grid`, `angular-core`) and the `host-data-angular`
> member are deliberately left out of the root `workspaces` (so they aren't
> installed, linked, or built), out of `scripts/propagate.mjs`
> (`ANGULAR_BUCKETS` / `ANGULAR_MEMBERS`), and out of
> `scripts/gen-consumer-tsconfig.mjs`. The source dirs still exist; re-add the
> workspace globs to bring Angular back. `build:packages` builds 21 packages.
>
> `@wellsfargo-starui/app` (`react-core/app`) and `tools/mcp-scaffold` were
> **deleted**, not excluded. `StarGridApp` is vendored into the apps repo's
> star-demo, which was its only consumer.

**Apps** live in the sibling apps repo and consume this one through a
`file:` link — see [`docs/APPS_REPO.md`](./docs/APPS_REPO.md).

The root `package.json` workspaces glob enumerates each bucket explicitly
(npm 10 doesn't do `packages/**`). When adding a new package:

1. Pick the architecture bucket by role (see table above).
2. Package name carries the framework suffix when a twin can exist; drop the
   suffix for framework-singletons (`ui`, `widget-sdk`, `grid`).
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
| Angular files | Angular Style Guide kebab + role suffix | `class FooComponent`, `class FooService` in `*.component.ts`, `*.service.ts`, `*.module.ts`, `*.directive.ts`, `*.pipe.ts` |

**Allowed in shared/ and react/ buckets**: `camelCase` and `PascalCase` only.
No kebab. No snake.

**Required in angular/ bucket and `apps/*-angular*` apps**: kebab-case
matching Angular Style Guide. Don't switch — Angular tooling and
muscle memory both depend on it.

**Carve-outs (kebab-case allowed despite the above)**:
- `packages/react-ui/ui/src/components/**` — shadcn-ui CLI generates kebab
  filenames (`alert-dialog.tsx`, `dropdown-menu.tsx`); renaming would
  diverge from `npx shadcn add ...` future regenerations
- `packages/react-grid/grid/src/customizer/ui/shadcn/**` — gc-themed
  shadcn copy carried over from the legacy grid-react extraction

**Public subpath exports** in `package.json` `"exports"` may use kebab
even when they point at camelCase files (subpath name is the package's
public API; renaming breaks consumers). Examples:
`@wellsfargo-starui/icons-svg/all-icons` → `./allIcons.ts`,
`@wellsfargo-starui/design-system/cell-renderers` → `./dist/cellRenderers.js`.

ESLint enforcement (`unicorn/filename-case` per-bucket) is a follow-up
PR. Until then: convention enforcement happens in code review.

## Build

**Turborepo 2.** Scripts at root:

```bash
npm run build       # build:consumer — packages + propagate tarballs
npm run typecheck   # typecheck:consumer — packages build, propagate, app tsc
npm test            # turbo test — Vitest
```

Every library package uses `"build": "rimraf dist && tsc"` (or
`ng-packagr`). The `rimraf` prefix is required to defeat a TS5055
"cannot overwrite input file" error that Turbo's cache-restore triggers
on the next run. Don't remove it.

## Install layout

- **Root** `npm install` / `npm run install:all` — `packages/*` only (workspace `"*"`).
- **Apps are a separate repo.** They consume this one two ways, both covered in
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
- `npm run propagate` packs `libs/*.tgz` + `manifest.json` for **bucket**
  consumers. Those bucket tarballs rename everything to
  `@wellsfargo-starui/<bucket>` with `./<member>` subpaths and only resolve
  through the Vite alias layer — they are **not** installable externally. Use
  `npm run pack:npm` for that.
- **Build-generated assets self-heal.** Source mode aliases TS/TSX live, but the
  design-system CSS (`dist/css/theme.css`) and host-data SharedWorker
  (`dist/assets/data-services-worker.mjs`) are emitted by `build:packages`. The
  shared Vite config (`staruiEnsureBuiltAssetsPlugin` in
  `scripts/staruiConsumerAliases.mjs`) checks for them at `buildStart` and runs
  `npm run build:packages` automatically if either is missing — so any app
  `dev`/`build` works even after a `clean`/`rimraf` wiped `dist/`. Set
  `STARUI_SKIP_ENSURE_BUILD=1` to bypass. App typecheck `tsconfig`s map
  `react`/`react-dom` → the single repo-root `@types/react` (`compilerOptions.paths`)
  so deep-typechecking `@wellsfargo-starui/grid` source doesn't collide with a second
  transitively-installed `@types/react`.

## Propagating package changes (external tarball consumers)

`npm run propagate` (delegates to `scripts/propagate.mjs`) builds
and packs **one tarball per architecture bucket** flat under `libs/`
(e.g. `wellsfargo-starui-react-grid.tgz` — a stable name with no version or
content hash, so `file:` pins never churn). **`libs/` is gitignored** — fresh
clones use `npm run bootstrap` / `npm run install:all`. Each bundle contains all
workspace packages in that bucket.

> These bucket tarballs are **not installable externally**: they rename every
> member to `@wellsfargo-starui/<bucket>` with `./<member>` subpaths, and the
> shipped `dist` files import each other by real member name — so they only
> resolve through the Vite alias layer. For external teams (and the apps repo's
> tarball track) use **`npm run pack:npm`**, which packs each package under its
> real name into `dist-npm/`.

Flags:

- `--dry-run` — show the plan, write nothing.
- `--gc` — delete orphaned tarballs in `libs/`.
- `--no-install` / `--no-build` — skip install or per-package build steps.
- Pass a bucket name (`react-core`) or member package (`grid`) to pack one bucket.

Manifest: `libs/manifest.json` maps `@wellsfargo-starui/<bucket>` → tarball +
`members` array.

## Testing

- Vitest 4 + jsdom 29 for unit tests. Baseline (2026-06-13): **1821 passing,
  1 skipped across 228 test files** (`npm test` — turbo across `packages/`).
  Slightly lower now that `@wellsfargo-starui/app` is deleted. Largest contributors: `grid` (546), `host-data` (355),
  `engine` (241), `design-system` (193), `widgets-react` (171).
- **Playwright lives in the apps repo now**, along with the apps its specs
  drive. Nothing in this repo runs e2e.

## UI stack rules (non-negotiable)

Every UI component — new or updated — MUST:

1. **Consume `@wellsfargo-starui/design-system` tokens.** Never hardcode colors,
   spacing, typography. Resolve through `--bn-*` / `--fi-*` CSS variables
   or the semantic exports from `@wellsfargo-starui/design-system/tokens/semantic`.

2. **Use the framework-matching primitive library:**
   - **React** → shadcn/ui (via `@wellsfargo-starui/ui` + `@wellsfargo-starui/grid` customizer
     primitives). **No native `<input>` / `<textarea>` / `<select>`.**
   - **Angular** → PrimeNG (themed via `@wellsfargo-starui/tokens-primeng`).
     `pInputText`, `pButton`, `pDropdown`, `pDialog`, etc.

3. **Be 100% dark/light compatible.** Every surface renders correctly
   under `[data-theme="dark"]` AND `[data-theme="light"]`. No hardcoded
   hex anywhere. Theme switching = flip `data-theme` on `<html>`;
   tokens resolve from there.

Applies to one-off dev UIs too. If tempted to build a custom primitive
that duplicates an existing shadcn/PrimeNG one, stop and use the existing
one instead.

## Import boundary rules

Enforced via convention (ESLint enforcement is a follow-up). See
`docs/ARCHITECTURE.md` for the full layer diagram. Key rules:

- Foundation packages (`shared-types`, `design-system`, `icons-svg`) must
  not import from anywhere except each other.
- `@wellsfargo-starui/engine` must not import from framework adapters (`widgets-react`, `grid`).
- Only `host-openfin` and `openfin-platform` may import from `@openfin/core`.
- Apps import from packages, never the reverse.

## Pre-implementation checklist

Run mentally before writing code for any feature add / update / remove:

1. **Architecture fit** — does it belong in the layer it's being added to?
2. **Design-system fit** — use shared primitives, not new ones
3. **Reuse before new** — search for existing implementations first
4. **Anti-pattern refuse list** — no native `<input>`/`<textarea>`/`<select>`
   (use shadcn), no per-panel re-exploration of settled UI
5. **Complexity ceilings** — 800 LOC / file, 80 LOC / function
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
3. If interaction changes, add/update the e2e spec in the apps repo.
4. Commit messages: conventional prefixes (`feat(pkg):`, `fix(pkg):`,
   `chore:`, `docs:`, `test:`, `ci:`, `refactor(pkg):`).

## Commit trailer

Every commit this agent makes should end with:

```
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

## Dep version edits

Pin to the **stable line** for each major (React 19.2.x, Angular 21.1.x,
@openfin/core 43.101.x), not the latest patch. The Angular demo's
[`apps/demo-angular/package.json`](./apps/demo-angular/package.json)
documents the per-package "stable-vs-latest" rationale inline in its
`//dependencies-registry-notes` block — mirror that pattern when
introducing version pins elsewhere. Don't drift: the whole reason for
this monorepo was to stop drift.
