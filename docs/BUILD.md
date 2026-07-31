# Building the StarUI monorepo

Step-by-step guide for a **fresh machine**. See also [README.md](../README.md#getting-started) and [LIBS.md](./LIBS.md).

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | ≥ 20 |
| npm | 10.x (`npm install` — not yarn/pnpm; lockfiles aren't committed) |
| Git | any recent |

Optional for e2e: Chromium (Playwright installs via `npx playwright install`).

---

## Build matrix

There are **two app-facing build surfaces** plus one side artifact for external
consumers. Apps build **from source** — they never depend on the tarballs.

| Layer | What | Command (repo root) | Output |
|-------|------|---------------------|--------|
| **1. Packages** | `@wellsfargo-starui/*` libraries under `packages/` | `npm run build:packages` | `packages/*/*/dist/` |
| **2. Apps** | Consumer / reference apps, `@wellsfargo-starui/*` from `packages/` source | `npm run build:apps` | `apps/demos/<app>/dist/` |
| **(side) Tarballs** | Architecture-bucket `.tgz` for external (Artifactory) consumers | `npm run propagate` | `libs/starui-*.tgz` (gitignored) |

Apps resolve every `@wellsfargo-starui/*` import straight from `packages/` source — Vite via
the aliases in [`scripts/staruiConsumerAliases.mjs`](../scripts/staruiConsumerAliases.mjs),
`tsc` via the repo-root workspace symlinks. Apps declare **no** `@wellsfargo-starui/*` deps
and require **no** `libs/*.tgz`. See [apps/README.md](../apps/README.md).

**Install apps** (nested workspace — installs each app's own third-party deps):

```bash
npm run install:apps    # npm install --prefix apps
```

---

## 1. Build packages (libraries)

From repo root:

```bash
npm install
npm run build:packages
```

**Unit tests (packages only):**

```bash
npm test
# or: npm run test:packages
```

**Typecheck libraries only:**

```bash
npm run typecheck:packages
```

---

## 2. Build apps (from source)

```bash
npm run build:packages
npm run install:apps
npm run build:apps
```

**CI-equivalent one-liner** (also packs tarballs for Artifactory parity):

```bash
npm run verify:consumer
```

(`verify:consumer` = `build:packages` → `propagate` (pack tarballs) →
`install:apps` → `build:apps` source.)

**Typecheck apps:**

```bash
npm run typecheck:apps
```

App `tsc` resolves `@wellsfargo-starui/grid` (consumed **as source**) via the **root**
workspace link, so it deep-typechecks the grid internals. Each app's typecheck
`tsconfig` therefore maps `react`/`react-dom` → the repo-root `@types/react`
(`compilerOptions.paths`); without it a second `@types/react` (pulled into
`apps/node_modules` transitively, e.g. by `react-markdown`) carries a different
Radix `CSSProperties` augmentation than the grid source sees, breaking typecheck
on a clean install.

**Run a dev server:**

```bash
npm run dev:demo-react          # @wellsfargo-starui/demo-react
npm run dev:markets-grid-lab    # @wellsfargo-starui/markets-grid-lab
```

See [apps/demos/README.md](../apps/demos/README.md).

The Angular demo (`demo-angular`) consumes the **built** `@wellsfargo-starui/design-system`
`dist/` through the workspace symlink, so run `build:packages` before building it.
The node `stomp-view-server` is a plain TypeScript app with no `@wellsfargo-starui/*` deps.

---

## Tarballs (`libs/`) — external consumers only

`libs/` is **not** in git and is **not** needed to build or run the apps. Generate
it when validating the bundles published to Artifactory:

```bash
npm run build:packages
npm run propagate            # writes libs/starui-*.tgz + libs/manifest.json
```

`propagate` builds each architecture bucket and packs one stable-named `.tgz` per
bucket. It does **not** touch the apps. Force a rebuild with
`npm run bootstrap -- --force`. See [LIBS.md](./LIBS.md).

---

## Fresh clone (full setup)

```bash
git clone <repo-url> starui
cd starui
npm run install:all
```

Runs **`bootstrap`**: `npm install` → `build:packages` → `propagate` (pack
tarballs) → `npm install --prefix apps`. If `libs/` already exists, bootstrap
**skips** the pack unless `npm run bootstrap -- --force`.

### Packages + apps only (skip tarballs)

```bash
npm install
npm run build:packages
npm run install:apps
npm run build:apps
```

---

## After changing `packages/`

```bash
npm run build:packages
npm run build:apps      # apps pick up the source change directly
```

Re-run `npm run propagate` only when you need refreshed Artifactory tarballs.
Do **not** commit `libs/`.

---

## Build everything

```bash
npm run build:all
```

Runs `build:consumer` (packages + propagate + install apps) then **`build:apps`**
(source).

---

## Clean reinstall

```bash
npm run clean
npm run install:all
```

---

## Quick reference

| Goal | Commands |
|------|----------|
| Fresh clone, everything | `npm run install:all` |
| Libraries only | `npm install` → `npm run build:packages` → `npm test` |
| Consumer CI | `npm run verify:consumer` |
| App bundles (source) | `npm run build:apps` |
| Run demo (dev) | `npm run dev` (`@wellsfargo-starui/demo-react`) |
| Pack Artifactory tarballs | `npm run build:packages` → `npm run propagate` |
