# Package bucket realignment (Phase 1 of the 21→7 consolidation)

**Status:** Approved for implementation planning
**Owner:** Anand Rao
**Related:** [`docs/WORKLOG.md`](../../WORKLOG.md) item 11, [`docs/PACKAGE_ORGANIZATION.md`](../../PACKAGE_ORGANIZATION.md)

## Problem

`npm run pack:npm` currently publishes 21 tarballs from 21 architecture-bucket
folders. The end goal (WORKLOG item 11) is 7 published packages, one per
bucket. That collapse cannot happen directly on the current folder layout
because three packages are filed under the wrong bucket by *dependency
profile*, which creates an npm cycle (`data → shared → data`) and would force
unwanted peer dependencies onto consumers (e.g. `ag-grid-enterprise` leaking
into any bucket that carries `widgets-react`).

WORKLOG item 11 already worked out the corrected arrangement and verified it
as a 6-layer DAG. This spec covers **only** the first of its three stages:
moving the three misfiled folders to their correct buckets, with all
package names, npm identities, and per-package `package.json`s unchanged.
Collapsing buckets into single `package.json`s is a separate, later spec.

## Convention constraint

This phase uses only mechanisms npm workspaces and TypeScript project
references already provide — nothing bespoke:

- **Folder moves are `git mv`, full stop.** No symlinks, no transitional
  re-export shims, no dual-publishing a package under two paths during a
  cutover window.
- **Package identity doesn't move.** Name, version, `exports` map, `main`,
  `types` in each `package.json` stay exactly as they are — only the parent
  directory changes. Consumers resolve by npm package name today and after;
  nothing about that resolution changes.
- **`workspaces` in the root `package.json` stays a plain array of
  glob/explicit-path strings** (the form already in use) — no custom
  workspace-discovery script, no `pnpm`-style `workspace:*` protocol (this
  repo is npm-only per `CLAUDE.md`).
- **`tsconfig.json` edits are limited to what the move literally breaks**
  (the `references` paths in `host-config`, per step 4 below) — not a
  broader tsconfig cleanup or restructuring of `extends`/`references`
  conventions.
- **The two Tailwind content-glob scripts get a mechanical path-segment
  edit** (old bucket name → new bucket name in existing string literals) —
  not a rewrite to a dynamic/glob-based discovery mechanism, even though
  that would arguably be more robust. That's a separate improvement, not
  bundled into this move.

If executing any step turns out to need something more elaborate than a
`git mv` plus the specific fix-ups listed below, that's a signal the plan is
wrong, not a cue to add tooling — stop and revisit rather than reaching for
a workaround.

## Non-goals (explicitly out of scope for this phase)

- Collapsing 21 `package.json` files into 7.
- Updating `check-package-cycles.mjs` / `check-package-coverage.mjs` to
  understand a bucket-collapsed layout — not needed until package.jsons
  actually collapse.
- Fixing the pre-existing dead `include` entry in
  `packages/react-core/widgets-react/tsconfig.json`
  (`"../openfin-platform/src/types/openfin.d.ts"`, which doesn't resolve to
  anything today — the real file lives at `./src/types/openfin.d.ts` and is
  already covered by the `src/**/*` include). Noted here so it isn't
  mistaken for something this move caused; left alone per YAGNI.

## The three moves

| # | Package(s) | From | To | Why |
|---|---|---|---|---|
| 1 | `host-config` | `packages/data/` | `packages/shared/` | Breaks the `data → shared → data` cycle; `host-config` peer-depends on `@wellsfargo-starui/engine` (a `shared` member) but sat in `data`. |
| 2 | `host-data-react` | `packages/data/` | `packages/react-core/` | Keeps `data` React-free so `host-data-angular` and non-React consumers are unaffected by a future `react` bucket collapse. |
| 3 | `config-browser`, `widgets-react` | `packages/react-core/` | `packages/react-grid/` | Confines the `ag-grid-enterprise` peer dependency to one future published bucket instead of leaking it into `react`. |

Each move is `git mv <folder> <new-folder>` — folder contents, package name,
and `package.json` are untouched except where a relative path literally
breaks (see below). This is why WORKLOG calls this a "provably inert" commit:
nothing about what consumers import changes, only where the folder sits.

## Per-move mechanical steps

1. `git mv packages/<old-bucket>/<member> packages/<new-bucket>/<member>`
2. **Root `package.json` `workspaces` array**: `shared/*`, `react-core/*`,
   and `react-grid/*` are already globs, so a member landing in one of
   those buckets needs no new entry. But `host-config` and
   `host-data-react` are currently **individually listed** (not covered by
   a `data/*` glob, because `host-data-angular` must stay excluded from
   `data/*` per WORKLOG item 3) — their explicit
   `"packages/data/host-config"` / `"packages/data/host-data-react"` lines
   must be **deleted** from `workspaces` once they move (the destination
   glob picks them up automatically; leaving the stale line is a listed
   path that no longer exists).
3. **`tsconfig.json` `extends`**: no change needed. Every member's
   `tsconfig.json` extends `"../../../tsconfig.base.json"` — 3 levels up
   from `packages/<bucket>/<member>/`. Since the folder depth
   (`packages/<bucket>/<member>/`) is unchanged by a bucket rename, this
   path stays correct after the move. (Verified: all four packages sit at
   the same depth before and after.)
4. **`tsconfig.json` `references` — the one path that does break**:
   `packages/data/host-config/tsconfig.json` has
   `"references": [{ "path": "../../shared/host" }, { "path": "../../shared/engine" }]`,
   written relative to its *old* location (`data/host-config` →
   `../../shared/host` reaches `packages/shared/host`). After the move to
   `packages/shared/host-config`, these become siblings, so the paths must
   change to `"../host"` and `"../engine"`. `host-data-react`,
   `config-browser`, and `widgets-react` have no `references` array — no
   equivalent fix needed for moves 2 and 3.
5. **Hardcoded bucket-relative paths in build scripts** — grep found two
   files with literal `packages/<bucket>/<member>` (or
   `node_modules/@wellsfargo-starui/<bucket>/<member>`) strings that must be
   updated to the new bucket name:
   - `scripts/tailwindContentGlobs.mjs` — multiple entries for
     `host-data-react`, `widgets-react`, `config-browser` across several
     glob arrays (source-mode and installed-mode paths, at different
     `../` depths).
   - `scripts/staruiTailwindContent.cjs` — two entries for `widgets-react`
     and `config-browser`.
   (`scripts/staruiConsumerAliases.mjs` was checked and only references
   these packages by npm **name**, e.g. `@wellsfargo-starui/host-data-react`
   — unaffected by the folder move, no change needed.
   `scripts/pack-npm.mjs`, `scripts/gen-consumer-tsconfig.mjs`, and
   `scripts/check-package-cycles.mjs` were checked and contain no
   hardcoded bucket/member paths — they discover packages dynamically.)
6. **Documentation** — `docs/PACKAGE_ORGANIZATION.md` and
   `docs/ARCHITECTURE.md` document the bucket table and will read stale
   after each move; update the table entries for the moved member(s) in the
   same commit. (Other docs matched by the earlier grep —
   `CONFIG_SERVICE_BASELINE.md`, `E2E_STATUS.md`, etc. — reference these
   packages narratively, not as a structural bucket listing; leave them
   unless a specific line is actually wrong after the move.)
7. Grep the full `packages/` tree for any remaining relative (non-npm-name)
   import that crosses into or out of the moved folder — expected to find
   none, since the import boundary rules require cross-package imports to
   go through the package name, but this is the actual verification step,
   not an assumption.

## Validation gate (run after each individual move, before moving to the next)

1. `npx turbo typecheck build test` green across the whole repo.
2. `node scripts/check-package-cycles.mjs` — confirm no cycle introduced or
   left behind.
3. `npm run pack:npm`, then install the resulting tarballs into
   `/Users/develop/wfh/starui-apps/tarball` and confirm that project
   installs and builds with **no dependency resolution errors**. This is
   the acceptance gate — the tarball app is the real external consumer and
   is more authoritative than an in-repo typecheck pass.
4. Commit the single move (folder move + all fix-ups above) before starting
   the next move.

## Sequencing

One group at a time, in the table order above (`host-config` first — it
resolves the cycle that blocks reasoning about the other two independently;
`host-data-react` second; `config-browser` + `widgets-react` together
third, since both moves exist to confine `ag-grid-enterprise` to the same
future bucket and are validated as one unit). Each move is its own commit
with its own passing validation gate, so a tarball failure discovered after
move 2 doesn't implicate move 1 — revert only the offending commit.

## Risks

- **Silent stale workspace glob entries.** If the explicit
  `packages/data/host-config` / `packages/data/host-data-react` lines
  aren't removed from `workspaces`, `npm install` will simply fail to find
  the path (loud, not silent) — low risk, but called out explicitly in step
  2 above since it's easy to forget.
- **Missed hardcoded path.** The grep in step 5 covered `scripts/` and
  `docs/`; if another hardcoded bucket path exists outside those two
  directories (e.g. in a CI config file this repo doesn't otherwise
  reference), it would surface as a build or lint failure in the validation
  gate, not silently.
- **Tarball gate is the real oracle.** In-repo `turbo build/typecheck/test`
  can pass while the *published* package graph is still broken (that's
  exactly how the original 21-tarball layout's cycle went unnoticed) — so
  the tarball install in `/Users/develop/wfh/starui-apps/tarball` is
  mandatory per move, not a nice-to-have.

## Done looks like

- Three commits landed (one per move), each with a green validation gate.
- `packages/data/` contains only `host-data` and `host-data-angular`.
- `packages/shared/` contains `host-config` alongside `engine`, `host`,
  `host-browser`, `shared-types`, `types`, `widget`, `widget-browser`.
- `packages/react-core/` contains `host-data-react` alongside
  `host-wrapper-react`, `widget-sdk`, `workspace-setup-react` (no longer
  `config-browser` or `widgets-react`).
- `packages/react-grid/` contains `grid`, `config-browser`, and
  `widgets-react`.
- `npm run pack:npm` still emits 21 tarballs (package count unchanged — this
  phase moves folders, it does not collapse packages).
- The tarball app at `/Users/develop/wfh/starui-apps/tarball` installs and
  builds cleanly against the final state.
- WORKLOG item 11 updated to mark the folder-move stage complete and note
  what remains (the `package.json` collapse stage).
