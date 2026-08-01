# Package collapse — sub-phase 7: tooling + external verification

Final sub-phase of the package-collapse roadmap (WORKLOG item 11; roadmap in
[2026-08-01-package-collapse-design-system-design.md](./2026-08-01-package-collapse-design-system-design.md)).
Sub-phases 1–6 landed the target shape: 7 buckets, one published package
each, former members living on as export subpaths. This sub-phase makes the
repo's own tooling understand that shape and turns the sub-phase-6 manual
external verification into a scripted gate.

## Problem

Four scripts still assume the pre-collapse world of one `package.json` per
member at `packages/<bucket>/<member>/`:

1. **`check-package-cycles.mjs`** builds its graph from `package.json` files
   and drops self-package imports (`to !== from`). After the collapse, all
   intra-bucket member wiring goes through the bucket package's own subpaths
   (`@wellsfargo-starui/core/host`, `@wellsfargo-starui/react/widget-sdk`), so an
   intra-bucket cycle (e.g. engine ↔ host inside `core/`) is invisible to it.
2. **`check-package-coverage.mjs`** discovers packages by two-level
   `packages/<bucket>/<member>/package.json` scan. Collapsed buckets keep
   their manifest at the bucket root — so it currently discovers only
   `host-data-angular` (skipped) and the engine build shim (which it would
   falsely flag as "no real test script"). The whole gate is a no-op.
   Separately, the "package has no real test script" check must be
   re-expressed **per member**, or a suite-less member hides inside a bucket
   whose siblings carry a suite.
3. **`run-test-coverage.mjs`** scans `packages/<bucket>/<pkg>/coverage/lcov.info`
   (two-level). Collapsed buckets write `coverage/` at the bucket root, so the
   merged Sonar LCOV silently loses every collapsed bucket.
4. **`pack-npm.mjs`** never prunes `dist-npm/`, and its manifest merges with
   whatever is already there — during sub-phase 6 validation the directory
   still held 18 retired-name tarballs and the manifest listed 25 packages.

And the external-consumer verification (tarball install, subpath resolution,
retired-name failure, peer isolation) exists only as a by-hand transcript in
the sub-phase 6 worklog entry.

## Design

### 1. `check-package-cycles.mjs` — member-level graph

Keep the existing package-level checks untouched (declared-deps graph, import
graph, undeclared-import check). Add a third analysis: a **member graph**.

- **Nodes.** For each collapsed bucket (a `packages/<bucket>/package.json`
  whose name starts `@wellsfargo-starui/`), each immediate subfolder containing
  `src/` is a member node, id `<pkgName>#<folder>` (e.g.
  `@wellsfargo-starui/core#engine`). Non-collapsed packages (host-data-angular)
  stay single nodes.
- **Subpath → member mapping.** Parse the bucket's `exports` map: each export
  target path's first segment is the owning member folder
  (`"./host": "./host/dist/index.js"` → member `host`;
  `"."` → `./engine/dist/…` → member `engine`). Resolve an import specifier
  to a member by longest-prefix match against the export keys.
- **Edges.** Re-walk sources; for each `@wellsfargo-starui/*` import, resolve
  (bucket, subpath) → member node and add `fromMember → toMember`
  (including same-bucket edges — the whole point). Also resolve **relative
  imports** that escape the member folder (`../../host/src/…`) to the member
  that owns the resolved path.
- **Report.** Same cycle detection over member nodes; fails the run on any
  member-level cycle. Info line reports member count and intra-bucket edge
  count so a silent regression to 0 edges is visible.

### 2. `check-package-coverage.mjs` — collapse-aware discovery, per-member suite check

- **Discovery.** A "coverage unit" is a directory with a
  `@wellsfargo-starui/*` `package.json` (bucket root first; fall back to
  two-level for non-collapsed stragglers). Non-scope manifests (the engine
  build shim) are ignored everywhere.
- **Summary location.** `<unitDir>/coverage/coverage-summary.json` — works
  unchanged for bucket roots.
- **Per-member re-expression of "no real test script":** for each collapsed
  bucket, every member folder (immediate subfolder with `src/`) must contain
  at least one `*.test.*`/`*.spec.*` file (anywhere under the member,
  excluding `node_modules`/`dist`). A member with none is reported in a new
  `✗ member(s) without a suite` section and fails the gate, exactly like the
  old package-level check. Documented exemption set for members that
  legitimately carry no tests (generated-code members, e.g. `icons-svg` if it
  has none — verify against the tree and keep the set minimal, each entry
  with a why-comment). `host-data-angular` stays skipped.
- **Include-glob audit.** Because `coverage.all: true` only reports files the
  bucket's vitest `coverage.include` globs cover, a member missing from those
  globs hides from the per-file gate. The check cross-references: every
  member with a suite must have at least one file in the bucket's
  coverage-summary. A member whose files are entirely absent from the summary
  is reported as a collection failure (like the existing no-summary case).

### 3. `run-test-coverage.mjs` — bucket-root LCOV scan

`findLcovFiles()` additionally checks `packages/<bucket>/coverage/lcov.info`
(one level). Two-level scan stays for any straggler. SF-path rewriting is
already absolute-path based and needs no change.

### 4. `pack-npm.mjs` — prune stale output

- Full pack (no member filter): wipe `dist-npm/` before packing; manifest is
  rebuilt from exactly this run.
- Subset pack (`pack:npm grid`): keep the existing merge, but drop manifest
  entries (and delete tarballs) whose package name is no longer in the
  discovery set — retired identities can never linger again.

### 5. `scripts/verify-external-consumers.mjs` — scripted external gate

New script, wired as `npm run verify:external`. Steps:

1. Run `pack:npm` (fresh, full) unless `--no-pack`.
2. In a temp dir outside the repo: `npm init -y`, install all 7 tarballs by
   path, then in a child `node --input-type=module` process assert
   `import.meta.resolve()` succeeds for **every key of every package's
   `exports` map** (subpath list derived from the packed manifests, not
   hardcoded) and fails (ERR_MODULE_NOT_FOUND) for every **retired name**
   (hardcoded list: engine, host, host-browser, host-config, widget,
   widget-browser, shared-types, ui, widget-sdk, host-wrapper-react,
   workspace-setup-react, host-data-react, host-data, host-openfin,
   openfin-platform, config-browser, widgets-react, icons-svg).
3. **Peer isolation.** Two more temp installs, dep closures computed from the
   packed manifests (not hardcoded):
   - data-only consumer (`data` + its transitive `@wellsfargo-starui/*` closure):
     `react` must NOT be present in `node_modules`.
   - react-only consumer (`react` + closure): `ag-grid-enterprise` must NOT
     be present.
4. Non-zero exit + a named-assertion report on any failure; temp dirs cleaned
   on success, left in place (path printed) on failure.

`require.resolve` is deliberately not used — several `.` entries are
import-only by design (data, openfin, design-system, the types `./host`-side
subpaths), which `require` reports as ERR_PACKAGE_PATH_NOT_EXPORTED.

### Out of scope

- Fixing the pre-existing `tools/scripts/check-design-system-deps.ts` stale
  roots (existsSync-guarded no-ops).
- The apps-repo import migration and the README refresh (tracked separately
  in WORKLOG).

## Validation gate

1. `npm run check:deps` — passes; info line shows member nodes > package
   nodes and a non-zero intra-bucket edge count.
2. Synthetic-cycle smoke: temporarily add an intra-bucket cycle import and
   confirm the member graph catches it (removed before commit).
3. `npm run test:coverage` (full, serial) then `npm run check:coverage --report`
   — every bucket produces a summary; no false "no suite" flags; the engine
   shim is not reported.
4. `npm run pack:npm` from a dirty `dist-npm/` → exactly 7 tarballs, manifest
   lists exactly 7.
5. `npm run verify:external` — all assertions green.
6. `npx turbo build typecheck test` — unchanged, green.

## Done looks like

All six gate items green, the WORKLOG item 11 accepted coverage-tooling gap
closed, and the roadmap's sub-phase list fully struck.
