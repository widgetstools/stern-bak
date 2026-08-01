# Package collapse — sub-phase 1: `design-system` bucket

**Status:** Approved for implementation planning
**Owner:** Anand Rao
**Related:** [`docs/WORKLOG.md`](../../WORKLOG.md) item 11, [`docs/superpowers/specs/2026-08-01-package-bucket-realignment-design.md`](./2026-08-01-package-bucket-realignment-design.md) (phase 1 — folder moves, already landed)

## Problem

WORKLOG item 11's phase 1 (folder moves) is done: the 21-package dependency
graph is now a clean DAG with each package sitting in the correct bucket.
Phase 2 — collapsing 21 `package.json` files into 7 published packages — is
still open. It requires more than "one `package.json` per existing folder":
the target grouping (verified as a 6-layer DAG in WORKLOG item 11) splits
`packages/shared/` into two published packages (`types`, `core`) and merges
`packages/react-ui/` into `packages/react-core/` (published as `react`).
Doing this correctly (unlike the deleted bucket-tarball scheme, which kept
member packages cross-referencing each other by old npm name and so was
"never installable externally" — see `CLAUDE.md` § Shipping packages)
requires rewriting cross-member imports to relative paths wherever siblings
merge into one package, consolidating `exports` maps, and reworking the
coverage/cycle-checking tooling that currently assumes one `package.json`
per member.

This is too large for one spec. It decomposes into 7 independent sub-phases,
each with its own spec → plan → implementation cycle:

1. **design-system** — collapse `design-system` + `icons-svg` (this spec)
2. **openfin** — collapse `host-openfin` + `openfin-platform`
3. **data** — collapse `host-data` alone
4. **grid** — collapse `grid` + `config-browser` + `widgets-react`
5. **react** — regroup (`react-ui` merges into `react-core`) + collapse (5 members)
6. **types + core** — regroup (split `shared` into two) + collapse (8 members total)
7. **Tooling + external verification** — `check-package-cycles.mjs`,
   `check-package-coverage.mjs`, `run-test-coverage.mjs` made collapse-aware;
   a scratch app outside the workspace verifies real external installability
   and peer isolation (`ag-grid-enterprise` absent for a `react`-only
   consumer, `react` absent for a `data`-only consumer)

Ordered easiest-first: 1–4 already have a 1:1 folder-to-target mapping (no
regroup needed, `design-system` additionally has zero cross-member
dependencies today); 5–6 need a folder regroup first; 7 depends on 1–6 all
having landed so the tooling can be written against the final shape once,
not iteratively re-patched.

**This spec covers only sub-phase 1.** The other six get their own specs
when picked up.

## Sub-phase 1 scope: collapse the `design-system` bucket

### Current state (verified against the actual package.json files)

- `packages/design-system/design-system/` — `@wellsfargo-starui/design-system@0.1.0`.
  `dependencies`: `@primeuix/themes`, `@wellsfargo-starui/shared-types`,
  `tailwindcss-animate`, `tailwindcss-primeui`. `peerDependencies`:
  `ag-grid-community@^35.1.0`, `tailwindcss@^3.4.1` (optional).
  `devDependencies`: `@fontsource-variable/inter`,
  `@fontsource-variable/jetbrains-mono`, `ag-grid-community@35.1.0`,
  `autoprefixer`, `postcss`, `rimraf@^6.0.1`, `tailwindcss@3.4.1`,
  `tsx`, `typescript@~5.9.3`, `vitest@^4.1.4`. 13 `exports` subpaths
  (`.`, `./css`, `./styles.css`, `./reset.css`, `./tailwind`, `./primeng`,
  `./shadcn`, `./adapters/ag-grid`, `./tokens`, `./tokens/primitives`,
  `./tokens/semantic`, `./tokens/components`, `./tokens/controls`,
  `./cell-renderers`, `./cell-renderers-registry`). Build:
  `rimraf dist tsconfig.tsbuildinfo && tsc --project tsconfig.json && tsx
  scripts/build-css.ts && tsx scripts/build-styles-css.ts && node
  ./scripts/copy-assets.mjs`.
- `packages/design-system/icons-svg/` — `@wellsfargo-starui/icons-svg@1.0.0`.
  `dependencies`: `@lucide/angular`, `lucide-react`. `peerDependencies`:
  `react@^19.2.5` (optional). `devDependencies`: `@types/react@^19.2.14`,
  `rimraf@^6.0.1`, `typescript@~5.9.3`, `vitest@^4.1.4`. 5 `exports`
  subpaths (`.`, `./react`, `./angular`, `./all-icons`, `./svg/*`). Build:
  `rimraf dist && tsc -p tsconfig.build.json && node ./scripts/copy-assets.mjs`.
- **Zero cross-dependency verified**: neither member's source imports the
  other (grepped both directions; `design-system/src/cellRenderers.ts` and
  `cellRendererRegistry.ts` only *mention* `@wellsfargo-starui/icons-svg` in
  comments, no real import).
- **3 external consumers** actually import `@wellsfargo-starui/icons-svg`
  (verified by real `import`/`vi.mock` statements, not comment mentions) —
  7 files, 9 import statements: `openfin/openfin-platform` (2 files:
  `dockEditor/iconUtils.ts` line 12, `dockEditor/iconUtils.test.ts` line 3),
  `react-core/workspace-setup-react` (3 files: `components/IconPicker.tsx`
  lines 16–18 [3 imports], `components/IconPicker.test.tsx` line 4,
  `ImportConfig.tsx` line 12), `react-grid/grid` (2 files:
  `customizer/modules/column-customization/CellRendererEditors/IconTextEditor.tsx`
  line 10, `.../CellRendererEditors.test.tsx` line 3). A fourth package,
  `react-grid/config-browser`, was flagged during design-time grepping but
  is **not** a real consumer — its `src/icons.tsx` only *mentions*
  `@wellsfargo-starui/icons-svg` in a comment explaining it deliberately
  uses `lucide-react` instead; confirmed no import and no dependency
  declaration. No change needed there.
- `openfin-platform`, `workspace-setup-react`, and `grid` already depend on
  **both** `design-system` and `icons-svg` in `package.json` — after
  collapse they just drop the now-redundant `icons-svg` line.

### Target state

- **One package.json survives**: `packages/design-system/package.json`
  (+ `tsconfig.json`, `vitest.config.ts`) at the bucket root. Member
  subfolders (`packages/design-system/design-system/`,
  `packages/design-system/icons-svg/`) keep their `src/` trees exactly
  where they are (WORKLOG's constraint: member `src/` stays load-bearing,
  never flattened into one `src/` per bucket) but lose their own
  `package.json`/`tsconfig.json`/`vitest.config.ts`/build scripts.
- **Name**: `@wellsfargo-starui/design-system` survives (the more prominent
  identity); `@wellsfargo-starui/icons-svg` is retired as an npm name.
- **Version**: `0.1.0` (design-system's existing version — it's the
  surviving identity being extended, not replaced).
- **New subpath scheme** for icons-svg's former public API, nested under
  `./icons` on the merged package:
  - `./icons` (was icons-svg's `.`)
  - `./icons/react` (was `./react`)
  - `./icons/angular` (was `./angular`)
  - `./icons/all-icons` (was `./all-icons`)
  - `./icons/svg/*` (was `./svg/*`)

  Design-system's own 13 existing subpaths are unchanged.
- **Merged `exports`**: design-system's 13 entries + the 5 new `./icons*`
  entries = 18 total. No collision — the only shared top-level path was
  `.`, which stays design-system's own index; icons-svg's content moved off
  `.` onto `./icons`.
- **Merged `dependencies`**: `@primeuix/themes`, `@wellsfargo-starui/shared-types`,
  `tailwindcss-animate`, `tailwindcss-primeui`, `@lucide/angular`,
  `lucide-react`.
- **Merged `peerDependencies`**: `ag-grid-community@^35.1.0`,
  `tailwindcss@^3.4.1` (optional), `react@^19.2.5` (optional) — union of
  both, no version conflicts.
- **Merged `devDependencies`**: union of both lists — versions match
  exactly on every shared entry (`rimraf@^6.0.1`, `typescript@~5.9.3`,
  `vitest@^4.1.4`); icons-svg additionally contributes `@types/react@^19.2.14`.
- **Build script**: runs both members' build steps against their own `src/`
  trees, each still emitting into its own `dist/` subfolder that the merged
  `exports` map points into — e.g.
  `rimraf dist tsconfig.tsbuildinfo && tsc --project tsconfig.json && tsx
  scripts/build-css.ts && tsx scripts/build-styles-css.ts && node
  scripts/copy-assets.mjs && tsc -p tsconfig.icons.build.json && node
  scripts/copy-icons-assets.mjs` (exact script names/paths get finalized in
  the implementation plan — this spec fixes the *shape*, not every path).
- **Consumer migration**: all 9 import statements across the 7 files in the
  3 real consumer packages get rewritten to
  `@wellsfargo-starui/design-system/icons...`; each consumer's
  `package.json` drops the now-redundant `icons-svg` dependency line
  (already covered by their existing `design-system` dependency).

### Known, accepted gap: coverage tooling

`check-package-coverage.mjs` and `run-test-coverage.mjs` currently scan a
two-level `packages/<bucket>/<member>/coverage/` layout. After this
sub-phase, `design-system` is a one-level `packages/design-system/coverage/`
package. Per explicit decision: **this gap is accepted, not patched now** —
documented in WORKLOG as a known interim state. Tests still run and pass;
only the coverage-percentage aggregation script's directory-scan misbehaves
for already-collapsed buckets until sub-phase 7 makes it collapse-aware.
Every sub-phase 2–6 will carry the same accepted gap; sub-phase 7 fixes it
once, for the final shape, rather than being iteratively re-patched after
every sub-phase.

### Validation gate (same discipline as phase 1)

1. `npx turbo typecheck build test` green.
2. `npm run check:deps` — no cycles.
3. `npm run pack:npm` — must still emit tarballs for every *other* package
   unaffected (still 20, since `design-system`+`icons-svg` collapse from 2
   tarballs to 1: `21 - 2 + 1 = 20`).
4. Tarball install + build in `/Users/develop/wfh/starui-apps/tarball` —
   the real acceptance oracle, same as phase 1. `star-demo`'s `vendor/*.tgz`
   pins need updating for the retired `icons-svg` name (drop it) and the
   changed `design-system` tarball now carrying more content.
5. Manual resolution check on the built consumer: both a design-system-only
   subpath (e.g. `./tokens/semantic`) and an icons subpath (e.g.
   `./icons/all-icons`) resolve correctly from `dist-npm` output, not just
   from the workspace alias layer.

### Out of scope for this sub-phase

- Sub-phases 2–7 (separate specs).
- Fixing `check-package-coverage.mjs`/`check-package-cycles.mjs` (sub-phase 7).
- Any change to `design-system`'s or `icons-svg`'s actual source behavior —
  this is purely a packaging/identity consolidation.

## Convention constraint (carried forward from phase 1)

Same discipline: no bespoke tooling beyond what the collapse itself
requires. The build script concatenation, `exports` map merge, and import
rewrites are the substance of this change — not a new abstraction layer,
shim, or compatibility re-export for the retired `icons-svg` name. A
consumer that still imports `@wellsfargo-starui/icons-svg` after this
lands gets a real "module not found," not a silent shim — that's the
correct signal that its import needs updating, matching how every other
consumer in this same change gets updated for real.

## Done looks like

- `packages/design-system/design-system/` and
  `packages/design-system/icons-svg/` have no `package.json`,
  `tsconfig.json`, or `vitest.config.ts` of their own — only `src/` and
  member-specific scripts remain.
- `packages/design-system/package.json` is the sole workspace member for
  this bucket, name `@wellsfargo-starui/design-system`, version `0.1.0`,
  18 `exports` entries, merged dependency lists as specified above.
- `npm run pack:npm` emits 20 tarballs (was 21).
- All 9 consumer-side `@wellsfargo-starui/icons-svg` import statements (7
  files, 3 packages) are rewritten;
  `grep -r "@wellsfargo-starui/icons-svg" packages/` (excluding the merged
  package's own build artifacts, if any) returns nothing outside historical
  docs/comments.
- Full validation gate (above) green, including the tarball-app rebuild.
- `docs/WORKLOG.md` item 11 updated: sub-phase 1 marked done, the accepted
  coverage-tooling gap noted, sub-phase 2 named as next.
