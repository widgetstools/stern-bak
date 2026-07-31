# Consumer / reference apps (`apps/`)

Demo and reference apps only — never deployed; only `packages/*` get published.
Each app lives **once** under [`demos/<app>/`](./demos/).

**Apps build from source.** Vite aliases `@wellsfargo-starui/*` to live `packages/` source
and `tsc` resolves the same imports via the repo-root workspace symlinks. Apps
declare **no** `@wellsfargo-starui/*` deps and need **no** `libs/*.tgz` — `npm run propagate`
packs tarballs only for external (Artifactory) consumers.

Full instructions (root + in-app commands): **[`../README.md` — Running apps](../README.md#running-apps)**.

## Quick reference

### Setup (once)

```bash
# from repo root
npm install && npm run build:packages && npm run install:apps
```

### Build / dev (source)

| Where | Dev | Build |
|-------|-----|-------|
| **Repo root** | `npm run dev:demo-react` · `npm --prefix apps run dev -w @wellsfargo-starui/demo-react` | `npm run build:apps` |
| **App folder** | `cd apps/demos/demo-react && npm run dev` | `npm run build` |

CI: `npm run verify:consumer` from repo root (builds packages, packs tarballs,
builds apps from source).

## Nested workspace

[`apps/package.json`](./package.json) declares `demos/*`. Install from root with
`npm run install:apps`. Lockfiles are gitignored — do **not** commit `libs/`.

## Utilities

| Path | Role |
|------|------|
| [`grid-config/`](./grid-config/) | Shared grid profile JSON (not an npm package) |
| [`../scripts/build-app-track.mjs`](../scripts/build-app-track.mjs) | Runs `build` / `typecheck` from source for every app |

See **[`docs/BUILD.md`](../docs/BUILD.md)** for the full build matrix.
