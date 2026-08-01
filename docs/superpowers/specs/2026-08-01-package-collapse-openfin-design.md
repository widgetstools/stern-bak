# Package collapse — sub-phase 2: `openfin` bucket

**Status:** Approved for implementation planning
**Owner:** Anand Rao
**Related:** [`docs/WORKLOG.md`](../../WORKLOG.md) item 11, [`docs/superpowers/specs/2026-08-01-package-collapse-design-system-design.md`](./2026-08-01-package-collapse-design-system-design.md) (sub-phase 1 — landed; establishes the pattern this spec follows)

## Problem

Second of seven sub-phases collapsing 21 `package.json` files into 7
published packages (WORKLOG item 11 phase 2). This sub-phase collapses
`packages/openfin/host-openfin` and `packages/openfin/openfin-platform` —
currently two separate npm packages, already 1:1 with the `openfin` folder
bucket (no regroup needed) — into one published package.

This spec follows the pattern sub-phase 1 established and validated: member
`src`/`dist` trees stay exactly where they are; only each member's
`package.json` and `vitest.config.ts` are deleted, replaced by one set at
the bucket root; no compatibility shim for any retired identity; the same
validation gate (typecheck/build/test, `check:deps`, `check:ds-tokens`,
`pack:npm` tarball count, tarball install+build in the sibling apps repo
with `STARUI_PLATFORM` pointed at the worktree — a lesson learned during
sub-phase 1's execution, now known up front).

## Current state (verified against the actual package.json/tsconfig/vitest files)

- **`packages/openfin/host-openfin/`** — `@wellsfargo-starui/host-openfin@0.1.0`.
  Single export (`.`). `dependencies`: `@wellsfargo-starui/host`,
  `@wellsfargo-starui/host-browser`, `@wellsfargo-starui/types`.
  `peerDependencies`: `@openfin/core@43.101.2` (optional),
  `@openfin/workspace@23.0.20` (optional). `devDependencies`:
  `@openfin/core@43.101.2`, `rimraf@^6.0.1`, `typescript@~5.9.3`,
  `vitest@^4.1.4`. Build: `rimraf dist tsconfig.tsbuildinfo && tsc --project
  tsconfig.json` (no asset-copy step). Vitest: `environment: 'jsdom'`,
  `globals: false`. No `turbo.json` of its own.
- **`packages/openfin/openfin-platform/`** — `@wellsfargo-starui/openfin-platform@0.1.0`.
  Five exports (`.`, `./config`, `./plugin`, `./test-bridge`,
  `./dock-editor`). `dependencies`: `@wellsfargo-starui/design-system`,
  `@wellsfargo-starui/host`, `@wellsfargo-starui/host-config`,
  `@wellsfargo-starui/host-data`, `@wellsfargo-starui/types`.
  `peerDependencies`: `@openfin/core@43.101.2` (optional),
  `@openfin/workspace@23.0.20` (optional),
  `@openfin/workspace-platform@23.0.20` (optional). `devDependencies`:
  `@openfin/core@43.101.2`, `@openfin/workspace@23.0.20`,
  `@openfin/workspace-platform@23.0.20`, `jsdom@^29.0.2`, `rimraf@^6.0.1`,
  `typescript@~5.9.3`, `vitest@^4.1.4`. Build: `rimraf dist
  tsconfig.tsbuildinfo && tsc --project tsconfig.json && node
  ./scripts/copy-assets.mjs` (same `finalizeDist` helper sub-phase 1 fixed
  to tolerate a member with no `package.json`). Vitest: `environment:
  'jsdom'`, `globals: true`, `include: ['src/**/*.test.ts']`, `css: false`.
  No `turbo.json` of its own. Its `tsconfig.json` has one project reference,
  `{ "path": "../../design-system/design-system" }` — **verified still
  valid** post-sub-phase-1 (`npx tsc --noEmit --project
  packages/openfin/openfin-platform/tsconfig.json` returns zero errors),
  since sub-phase 1 never moved that member's own `tsconfig.json`. No
  change needed to this reference.
- **Zero real cross-dependency between the two members**: `host-openfin`'s
  `notifications.ts` mentions `@wellsfargo-starui/openfin-platform` only in
  a comment (explaining an architectural boundary), not a real import —
  confirmed by grep for actual `import`/`from` statements. Same shape as
  design-system/icons-svg's zero cross-dependency in sub-phase 1.
- **27 external consumer files across 5 packages** import one or both of
  the two current names — larger than sub-phase 1's 7 files:
  - `@wellsfargo-starui/host-openfin` (7 files, all bare `.` imports, no
    subpaths — it only has one export): `react-grid/grid` (4 files:
    `widget/useRestoreCellFocusOnWindowFocus.ts`,
    `customizer/modules/alerts/useAlertsOpenFinBridge.ts` + `.test.tsx`,
    `runtime/openFin.ts`), `react-grid/widgets-react` (3 files:
    `hosted/useGridLinkNotifications.ts` + `.test.tsx`,
    `hosted/windowOptionsSubscription.ts`).
  - `@wellsfargo-starui/openfin-platform` (20 files, ~35 import
    statements including `vi.mock`/dynamic `import()` — exact count to be
    re-verified during planning): `react-core/host-wrapper-react` (1 file,
    `/test-bridge` subpath), `react-core/workspace-setup-react` (16 files,
    overwhelmingly the `/config` subpath, two files —
    `registry/useRegistryEditor.ts` and `.test.ts` — using the bare `.`
    barrel, which WORKLOG item 7c already flags as a pre-existing bug
    unrelated to this collapse: `useDockEditor` deliberately uses `/config`
    to avoid `@openfin/workspace-platform` side effects that throw outside
    OpenFin, but `useRegistryEditor` doesn't follow that pattern yet — not
    fixed here, just carried forward as-is with an updated import path),
    `react-grid/config-browser` (3 files, `/config` subpath).
- **Package.json dependency declarations**: `grid`, `widgets-react`,
  `host-wrapper-react`, `workspace-setup-react`, `config-browser` all
  already declare whichever of the two names they import as a real
  dependency (to be reconfirmed per-package during planning, following
  sub-phase 1's precedent of checking rather than assuming).

## Target state

- **One package.json survives**: `packages/openfin/package.json` (+
  `vitest.config.ts`) at the bucket root. Member subfolders keep their
  `src/`, `tsconfig.json`, and (for `openfin-platform`) `scripts/` —
  losing only `package.json` and `vitest.config.ts`.
- **Name**: `@wellsfargo-starui/openfin` (a new name — neither existing
  identity survives, per WORKLOG's literal roadmap and the explicit
  decision made during this sub-phase's design). Version `0.1.0`.
- **Merged `exports`** (6 entries):
  - `.` — was `openfin-platform`'s `.` (the larger, more-used identity
    keeps the bare import)
  - `./host` — was `host-openfin`'s `.` (new subpath)
  - `./config`, `./plugin`, `./test-bridge`, `./dock-editor` — unchanged,
    still pointing into `openfin-platform`'s own `dist/`
- **Merged `dependencies`**: `@wellsfargo-starui/design-system`,
  `@wellsfargo-starui/host`, `@wellsfargo-starui/host-browser`,
  `@wellsfargo-starui/host-config`, `@wellsfargo-starui/host-data`,
  `@wellsfargo-starui/types` (union, `host` and `types` appear in both
  members with identical `"*"` ranges — no conflict).
- **Merged `peerDependencies`**: `@openfin/core@43.101.2` (optional),
  `@openfin/workspace@23.0.20` (optional),
  `@openfin/workspace-platform@23.0.20` (optional) — union, no version
  conflicts on the shared entries.
- **Merged `devDependencies`**: union of both lists — every shared entry
  matches exactly (`@openfin/core@43.101.2`, `rimraf@^6.0.1`,
  `typescript@~5.9.3`, `vitest@^4.1.4`); `openfin-platform` additionally
  contributes `@openfin/workspace@23.0.20`,
  `@openfin/workspace-platform@23.0.20`, `jsdom@^29.0.2`.
- **Build script**: `rimraf host-openfin/dist host-openfin/tsconfig.tsbuildinfo
  openfin-platform/dist openfin-platform/tsconfig.tsbuildinfo && tsc
  --project host-openfin/tsconfig.json && tsc --project
  openfin-platform/tsconfig.json && node
  openfin-platform/scripts/copy-assets.mjs` — exact form finalized during
  planning, matching sub-phase 1's precedent of running each member's
  original build command unmodified, just orchestrated from one script.
- **Vitest merge**: base config uses `openfin-platform`'s settings
  (`environment: 'jsdom'`, `globals: true`, `css: false`) since it's the
  more heavily-documented and more heavily-used config. `host-openfin`'s
  `globals: false` is not a real conflict — `globals: true` only adds
  implicit `describe`/`it`/`expect`, it doesn't remove the explicit
  imports `host-openfin`'s tests already use, so no per-file override is
  needed (unlike sub-phase 1's genuine `jsdom` vs `node` environment
  conflict).
- **Consumer migration**: all real import/`vi.mock`/dynamic-`import()`
  statements across the 27 files get their package-name prefix swapped —
  `@wellsfargo-starui/host-openfin` → `@wellsfargo-starui/openfin/host`;
  `@wellsfargo-starui/openfin-platform` (bare) →
  `@wellsfargo-starui/openfin`; `@wellsfargo-starui/openfin-platform/config`
  → `@wellsfargo-starui/openfin/config` (same pattern for `/plugin`,
  `/test-bridge`, `/dock-editor` — subpath names themselves don't change).
  Each consumer's `package.json` gets its dependency line(s) renamed to
  match.

## Known, accepted gap: coverage tooling

Same accepted gap as sub-phase 1, same reasoning: `check-package-coverage.mjs`
will scan `packages/openfin/coverage/` as one-level after this lands.
Documented in WORKLOG, fixed once in sub-phase 7 for the final shape.

## Validation gate (identical to sub-phase 1)

1. `npx turbo typecheck build test` green.
2. `npm run check:deps` — no cycles.
3. `npm run check:ds-tokens` — unchanged from baseline (no source moved).
4. `npm run pack:npm` — **19** tarballs (was 20 after sub-phase 1 —
   `openfin` collapses from 2 into 1).
5. Tarball install + build in `/Users/develop/wfh/starui-apps`, with
   `STARUI_PLATFORM` explicitly pointed at the worktree path (sub-phase 1
   found that plain `npm run setup:tarball` silently resolves the platform
   repo as a sibling of the apps repo — i.e. the main checkout, not a
   worktree — so this must be set explicitly every time, not just when a
   problem is suspected).
6. Manual resolution spot-check on the packed tarball: confirm `./host`
   and at least one of the unchanged subpaths (`./config`) resolve to real
   files inside the tarball, not just via the workspace alias layer.

## Convention constraint (carried forward)

Same as sub-phase 1: no bespoke tooling, no compatibility shim for either
retired name. A consumer that still imports `@wellsfargo-starui/host-openfin`
or `@wellsfargo-starui/openfin-platform` after this lands must get a real
"module not found."

## Out of scope for this sub-phase

- Sub-phases 3–7 (separate specs).
- Fixing `check-package-coverage.mjs`/`check-package-cycles.mjs` (sub-phase 7).
- WORKLOG item 7c's `useRegistryEditor` bare-barrel-import bug — carried
  forward with an updated path, not fixed.
- Any change to either member's actual source behavior — this is purely a
  packaging/identity consolidation.

## Done looks like

- `packages/openfin/host-openfin/` and `packages/openfin/openfin-platform/`
  have no `package.json` or `vitest.config.ts` of their own — only `src/`,
  `tsconfig.json`, and (for `openfin-platform`) `scripts/` remain.
- `packages/openfin/package.json` is the sole workspace member for this
  bucket: name `@wellsfargo-starui/openfin`, version `0.1.0`, 6 `exports`
  entries, merged dependency lists as specified above.
- `npm run pack:npm` emits 19 tarballs (was 20).
- All real `@wellsfargo-starui/host-openfin` and
  `@wellsfargo-starui/openfin-platform` import sites are rewritten;
  `grep -r` for either old name outside `packages/openfin/` returns only
  historical/comment mentions, no real imports.
- Full validation gate green, including the tarball-app rebuild with
  `STARUI_PLATFORM` set.
- `docs/WORKLOG.md` item 11 updated: sub-phase 2 marked done, sub-phase 3
  (`data` — trivial single-member collapse) named as next.
