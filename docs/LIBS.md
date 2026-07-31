# `libs/` — bucket tarballs for external consumers (not in git)

`libs/` holds **architecture-bucket tarballs** packed for **external (Artifactory)
tarball consumers** — e.g. published bundles and MCP scaffolding. The directory is
**gitignored**; generate it locally with `npm run propagate` or `npm run bootstrap`.

The repo's own demo apps under `apps/` do **not** use these tarballs — they build
from `packages/` source (Vite aliases + repo-root workspace symlinks) and declare
no `@wellsfargo-starui/*` deps. You only need `libs/` when validating what external consumers
install.

| File | Role |
|------|------|
| `manifest.json` | Maps `@wellsfargo-starui/<bucket>` → tarball filename + member packages |
| `starui-<bucket>.tgz` | One packed bundle per bucket under `packages/` (stable name, no version/hash) |

## Generate the tarballs

```bash
npm install
npm run build:packages
npm run propagate          # writes libs/starui-*.tgz + libs/manifest.json
```

`npm run bootstrap` does the same as part of a full fresh-clone setup.

## After package changes

Re-pack only when you need refreshed Artifactory tarballs:

```bash
npm run build:packages
npm run propagate
```

Nothing tarball-related needs committing: `libs/` is ignored and **lockfiles are
not committed** (each environment regenerates its own on `npm install`).
