# Demo apps (`apps/demos/`)

Each folder is one consumer/reference app. Apps resolve `@wellsfargo-starui/*` straight from
live `packages/` source (Vite aliases + repo-root workspace symlinks) — they
declare no `@wellsfargo-starui/*` deps and need no `libs/*.tgz`.

## Running an app

```bash
cd apps/demos/demo-react
npm run dev
npm run build
```

From the **repo root**, use `npm run dev:demo-react`.

Full guide: **[`../../README.md` — Running apps](../../README.md#running-apps)**.

## CI parity

From repo root (builds packages, packs tarballs for Artifactory, builds apps from
source):

```bash
npm run verify:consumer
```
