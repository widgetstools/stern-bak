# Package Bucket Realignment (Phase 1 of 21→7) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `host-config`, `host-data-react`, `config-browser`, and `widgets-react` to the buckets that make the 21-package dependency graph an acyclic DAG (WORKLOG item 11), without collapsing any `package.json` — folder location changes only, npm package identity does not.

**Architecture:** Three sequential moves (`host-config` → `shared`; `host-data-react` → `react-core`; `config-browser` + `widgets-react` together → `react-grid`), each `git mv` plus the specific config fix-ups it breaks, each validated end-to-end — including installing the packed tarballs into the sibling apps repo — before the next move starts.

**Tech Stack:** npm 10 workspaces, Turborepo 2, TypeScript project references, Vitest 4.

## Global Constraints

- **npm only.** Never `pnpm`/`yarn`. `npm install` with no flags — no `--legacy-peer-deps`, no `--force`, no `npm ci` (see `CLAUDE.md` § Package manager).
- **Package identity does not move.** Every `package.json` (`name`, `version`, `exports`, `main`, `types`) stays byte-identical except where a step below says otherwise. Only the parent directory changes.
- **No bespoke tooling.** Folder moves are `git mv`, full stop — no symlinks, no re-export shims, no dual-publish window. Config edits are limited to what a step explicitly breaks (see the design spec's Convention Constraint section).
- **Each move is its own commit**, gated by a full validation pass (typecheck+build+test, cycle check, tarball install+build) — never batch two moves into one commit.
- **Tarball gate is mandatory per move, not optional.** In-repo `turbo` passing is necessary but not sufficient — the sibling apps repo installing the packed tarballs is the real acceptance oracle (this is exactly the check that would have caught the original `data → shared → data` cycle before it shipped).
- **Commit prefix:** use `refactor(packages):` for all four commits in this plan — this is a structural move, not a feature/fix.
- **Do not touch** `docs/current-features.md` — that file tracks capability changes; a folder move changes no capability. Do not touch `docs/ARCHITECTURE.md`'s bucket ASCII diagram — it is already stale in a larger way (still describes "Ten architecture buckets," including deleted Angular buckets) and partially patching it would misrepresent it as current; leave a note in Task 4 instead of editing it.
- **Repo paths:** platform repo (this one) is the current working directory. Apps repo is `/Users/develop/wfh/starui-apps` — a sibling checkout, referenced by absolute path.

---

### Task 0: Pre-flight — confirm the four target directories are clean

**Files:** none modified; read-only verification.

**Interfaces:** Gates Tasks 1–3. If any target directory has uncommitted changes, `git mv` on that directory carries the uncommitted content along with the rename — silently bundling unrelated work into what's supposed to be a pure structural-move commit. This must be resolved before Task 1 starts.

- [ ] **Step 1: Check git status scoped to the four directories**

```bash
git status --short packages/data/host-config packages/data/host-data-react packages/react-core/config-browser packages/react-core/widgets-react
```

- [ ] **Step 2: Handle any output**

If this prints nothing, the tree is clean for all four — proceed to Task 1.

If it prints modified (`M`) or untracked (`??`) entries — as of this plan's writing, `packages/react-core/config-browser/ConfigBrowser.test.tsx` was modified in the working tree, part of unrelated in-progress work on this branch — do **not** run `git mv` on that directory while it's dirty. In order of preference:

1. If the uncommitted change is finished, unrelated work, commit it separately first (its own message, no relation to this plan), so the directory is clean before the move.
2. If it's unfinished/WIP, stash only the affected paths — `git stash push -u -- <paths>` — do the move and its commit, then `git stash pop` and resume the WIP on top of the new location.
3. If the change looks substantial or its status is unclear, stop and ask the user which of the above they want rather than guessing — this is exactly the kind of action-affecting-uncommitted-work case that warrants a check-in first.

Re-run Step 1 after resolving and confirm it prints nothing for all four directories before starting Task 1.

---

### Task 1: Move `host-config` to `packages/shared/`

**Files:**
- Move: `packages/data/host-config/` → `packages/shared/host-config/`
- Modify: `package.json:1-13` (root workspaces array)
- Modify: `packages/shared/host-config/tsconfig.json` (post-move path)
- Modify: `docs/PACKAGE_ORGANIZATION.md:42,45` (bucket table)

**Interfaces:**
- Consumes: nothing from earlier tasks (this is the first task).
- Produces: `host-config` resolvable at `packages/shared/host-config/` for Task 4's WORKLOG note. No other task depends on this one's internals — Tasks 2 and 3 move unrelated packages.

- [ ] **Step 1: Move the folder with history preserved**

```bash
git mv packages/data/host-config packages/shared/host-config
```

- [ ] **Step 2: Fix the root `package.json` workspaces array**

`packages/shared/*` is already a glob entry in `workspaces`, so `host-config` needs no new entry — only removal of its old explicit path (it was listed individually, not covered by a `data/*` glob, because `host-data-angular` must stay excluded from that bucket per WORKLOG item 3).

Edit `package.json`:

```diff
   "workspaces": [
     "packages/design-system/*",
     "packages/react-ui/*",
     "packages/react-grid/*",
-    "packages/data/host-config",
     "packages/data/host-data",
     "packages/data/host-data-react",
     "packages/openfin/*",
     "packages/react-core/*",
     "packages/shared/*"
   ],
```

- [ ] **Step 3: Fix the broken `tsconfig.json` project reference**

`packages/shared/host-config/tsconfig.json` has a `references` array written relative to the *old* location (`packages/data/host-config` → `../../shared/host` reaches `packages/shared/host`). Now that `host-config` is a sibling of `host` and `engine` inside `packages/shared/`, those paths must shorten by one segment.

Edit `packages/shared/host-config/tsconfig.json`:

```diff
   "include": ["src"],
   "exclude": ["src/**/*.test.ts", "test/**"],
-  "references": [{ "path": "../../shared/host" }, { "path": "../../shared/engine" }]
+  "references": [{ "path": "../host" }, { "path": "../engine" }]
 }
```

(`extends: "../../../tsconfig.base.json"` is unchanged — `packages/<bucket>/<member>/` is still 3 levels from the repo root, only the bucket name changed, not the depth.)

- [ ] **Step 4: Update the bucket table in `docs/PACKAGE_ORGANIZATION.md`**

Edit line 42 (Data Utilities row) — remove `host-config`:

```diff
-| 4 | **Data Utilities** | `packages/data/` | `@wellsfargo-starui/host-data`, `@wellsfargo-starui/host-data-react`, `@wellsfargo-starui/host-data-angular`, `@wellsfargo-starui/host-config` |
+| 4 | **Data Utilities** | `packages/data/` | `@wellsfargo-starui/host-data`, `@wellsfargo-starui/host-data-react`, `@wellsfargo-starui/host-data-angular` |
```

Edit line 45 (Core / Shared row) — add `host-config`:

```diff
-| 7 | **Core / Shared** | `packages/shared/` | `@wellsfargo-starui/types`, `@wellsfargo-starui/shared-types`, `@wellsfargo-starui/engine`, `@wellsfargo-starui/host`, `@wellsfargo-starui/host-browser`, `@wellsfargo-starui/widget`, `@wellsfargo-starui/widget-browser` |
+| 7 | **Core / Shared** | `packages/shared/` | `@wellsfargo-starui/types`, `@wellsfargo-starui/shared-types`, `@wellsfargo-starui/engine`, `@wellsfargo-starui/host`, `@wellsfargo-starui/host-browser`, `@wellsfargo-starui/widget`, `@wellsfargo-starui/widget-browser`, `@wellsfargo-starui/host-config` |
```

- [ ] **Step 5: Confirm no leftover relative import crosses the old boundary**

```bash
grep -rn "from '\.\./\.\./data/host-config" packages/ || echo "no matches"
grep -rn "from '\.\./\.\./shared/host-config" packages/ || echo "no matches"
```

Expected: `no matches` both times — every cross-package import in this repo goes through the npm package name (`@wellsfargo-starui/host-config`), never a relative path, so nothing should match.

- [ ] **Step 6: Run the in-repo validation gate**

```bash
npx turbo typecheck build test
```

Expected: all green, `host-config` and every package that depends on it (grep `package.json` files for `@wellsfargo-starui/host-config` if you want the exact list — `grid`, `widgets-react`, `config-browser`, `workspace-setup-react` are the known consumers) build and test clean.

- [ ] **Step 7: Run the cycle checker**

```bash
npm run check:deps
```

Expected: no cycle reported. (`check-package-cycles.mjs` walks `packages/` on disk recursively — it needs no path updates for this move.)

- [ ] **Step 8: Pack and validate against the tarball apps**

```bash
npm run pack:npm
cd /Users/develop/wfh/starui-apps
npm run setup:tarball
npm run build:tarball
cd -
```

Expected: `setup:tarball` vendors the fresh tarballs (including a rebuilt `wellsfargo-starui-host-config.tgz`) with no ENOENT/version errors, and `build:tarball` builds all six tarball-track apps (`basic`, `dataprovider-editor`, `design-system`, `markets-grid-lab`, `star-demo`, `stomp-marketsgrid-minimal`) with no dependency resolution errors. `star-demo`'s `package.json` pins `@wellsfargo-starui/host-config` via `file:../../vendor/wellsfargo-starui-host-config.tgz` — that pin is by package name, unaffected by the folder move, so this step is really confirming the *build*, not the pin.

- [ ] **Step 9: Commit**

`git mv` already staged the folder rename (delete of the old path, add of the new one) — only the config files edited in Steps 2–4 still need staging:

```bash
git add package.json packages/shared/host-config/tsconfig.json docs/PACKAGE_ORGANIZATION.md
git status --short
```

Review the output before committing: it should show `packages/data/host-config/...` → `packages/shared/host-config/...` renames, plus the three edited config files as `M` — nothing else. If anything unexpected appears, stop and investigate before committing.

```bash
git commit -m "$(cat <<'EOF'
refactor(packages): move host-config into the shared bucket

Closes the data → shared → data npm cycle blocking the 21→7 package
consolidation (WORKLOG #11). host-config peer-depends on
@wellsfargo-starui/engine (a shared member) but sat in data — folder
move only, package identity and exports unchanged.

EOF
)"
```

---

### Task 2: Move `host-data-react` to `packages/react-core/`

**Files:**
- Move: `packages/data/host-data-react/` → `packages/react-core/host-data-react/`
- Modify: `package.json` (root workspaces array)
- Modify: `scripts/tailwindContentGlobs.mjs:10,32`
- Modify: `docs/PACKAGE_ORGANIZATION.md:42,44` (bucket table)

**Interfaces:**
- Consumes: nothing from Task 1 (independent package, but run after Task 1 per the agreed sequencing — `host-config` resolves the cycle that makes reasoning about the rest of the graph simple).
- Produces: `host-data-react` resolvable at `packages/react-core/host-data-react/` for Task 4's WORKLOG note.

- [ ] **Step 1: Move the folder with history preserved**

```bash
git mv packages/data/host-data-react packages/react-core/host-data-react
```

- [ ] **Step 2: Fix the root `package.json` workspaces array**

`packages/react-core/*` is already a glob, so only the stale explicit `data/host-data-react` entry needs removing (state after Task 1's edit):

```diff
   "workspaces": [
     "packages/design-system/*",
     "packages/react-ui/*",
     "packages/react-grid/*",
     "packages/data/host-data",
-    "packages/data/host-data-react",
     "packages/openfin/*",
     "packages/react-core/*",
     "packages/shared/*"
   ],
```

- [ ] **Step 3: `host-data-react`'s `tsconfig.json` needs no change**

It has no `references` array (confirmed during design grounding) and its `extends: "../../../tsconfig.base.json"` path is depth-based, not bucket-name-based — no edit needed. Nothing to do for this step; it's recorded so the next engineer doesn't go looking for a break that isn't there.

- [ ] **Step 4: Fix the two hardcoded Tailwind content-glob entries**

`scripts/tailwindContentGlobs.mjs` has two arrays (`platformAppTailwindContent`, `demoAppTailwindContent`) each with one literal `packages/data/host-data-react/...` entry, at different `../` depths. There is a third array, `externalConsumerTailwindContent`, with `node_modules/@wellsfargo-starui/react-core/widgets-react/...`-style entries — **do not touch those**; they're leftover from a deleted bucket-tarball publishing scheme (per the comment in `scripts/staruiTailwindContent.cjs`) and don't correspond to any real path, before or after this move.

Edit `scripts/tailwindContentGlobs.mjs`:

```diff
 export const platformAppTailwindContent = [
   '../../packages/react-ui/ui/src/**/*.{ts,tsx}',
   '../../packages/react-grid/grid/src/**/*.{ts,tsx}',
-  '../../packages/data/host-data-react/src/**/*.{ts,tsx}',
+  '../../packages/react-core/host-data-react/src/**/*.{ts,tsx}',
   '../../packages/react-core/workspace-setup-react/src/**/*.{ts,tsx}',
```

```diff
 export const demoAppTailwindContent = [
   '../../../packages/react-ui/ui/src/**/*.{ts,tsx}',
   '../../../packages/react-grid/grid/src/**/*.{ts,tsx}',
-  '../../../packages/data/host-data-react/src/**/*.{ts,tsx}',
+  '../../../packages/react-core/host-data-react/src/**/*.{ts,tsx}',
   '../../../packages/react-core/workspace-setup-react/src/**/*.{ts,tsx}',
```

- [ ] **Step 5: Confirm `scripts/staruiTailwindContent.cjs` needs no edit for this move**

```bash
grep -n "host-data-react" scripts/staruiTailwindContent.cjs || echo "no matches — confirmed, nothing to edit here"
```

Expected: `no matches` — that file only references `widgets-react`/`config-browser` (Task 3's concern).

- [ ] **Step 6: Update the bucket table in `docs/PACKAGE_ORGANIZATION.md`**

Edit line 42 (Data Utilities row) — remove `host-data-react` (state after Task 1's edit to this line):

```diff
-| 4 | **Data Utilities** | `packages/data/` | `@wellsfargo-starui/host-data`, `@wellsfargo-starui/host-data-react`, `@wellsfargo-starui/host-data-angular` |
+| 4 | **Data Utilities** | `packages/data/` | `@wellsfargo-starui/host-data`, `@wellsfargo-starui/host-data-angular` |
```

Edit line 44 (React Core row) — add `host-data-react`:

```diff
-| 6 | **React Core** | `packages/react-core/` | `@wellsfargo-starui/app`, `@wellsfargo-starui/widgets-react`, `@wellsfargo-starui/widget-sdk`, `@wellsfargo-starui/host-wrapper-react`, `@wellsfargo-starui/config-browser`, `@wellsfargo-starui/workspace-setup-react` |
+| 6 | **React Core** | `packages/react-core/` | `@wellsfargo-starui/app`, `@wellsfargo-starui/widgets-react`, `@wellsfargo-starui/widget-sdk`, `@wellsfargo-starui/host-wrapper-react`, `@wellsfargo-starui/config-browser`, `@wellsfargo-starui/workspace-setup-react`, `@wellsfargo-starui/host-data-react` |
```

(The pre-existing `@wellsfargo-starui/app` entry in that row is stale — `app` was deleted per `CLAUDE.md` — but fixing that is unrelated to this move; leave it.)

- [ ] **Step 7: Confirm no leftover relative import crosses the old boundary**

```bash
grep -rn "from '\.\./\.\./data/host-data-react" packages/ || echo "no matches"
```

Expected: `no matches`.

- [ ] **Step 8: Run the in-repo validation gate**

```bash
npx turbo typecheck build test
```

Expected: all green.

- [ ] **Step 9: Run the cycle checker**

```bash
npm run check:deps
```

Expected: no cycle reported.

- [ ] **Step 10: Pack and validate against the tarball apps**

```bash
npm run pack:npm
cd /Users/develop/wfh/starui-apps
npm run setup:tarball
npm run build:tarball
cd -
```

Expected: same as Task 1 Step 8 — all six tarball apps build clean. `star-demo` pins `@wellsfargo-starui/host-data-react` by name via `file:../../vendor/wellsfargo-starui-host-data-react.tgz`, unaffected by the folder move.

- [ ] **Step 11: Commit**

`git mv` already staged the folder rename — only the edited config files need staging:

```bash
git add package.json scripts/tailwindContentGlobs.mjs docs/PACKAGE_ORGANIZATION.md
git status --short
```

Review the output before committing: `packages/data/host-data-react/...` → `packages/react-core/host-data-react/...` renames plus the three edited files as `M` — nothing else.

```bash
git commit -m "$(cat <<'EOF'
refactor(packages): move host-data-react into the react-core bucket

Keeps the data bucket React-free so host-data-angular and non-React
consumers are unaffected once react-core collapses to one published
package (WORKLOG #11). Folder move only, package identity unchanged.

EOF
)"
```

---

### Task 3: Move `config-browser` and `widgets-react` to `packages/react-grid/`

**Files:**
- Move: `packages/react-core/config-browser/` → `packages/react-grid/config-browser/`
- Move: `packages/react-core/widgets-react/` → `packages/react-grid/widgets-react/`
- Modify: `scripts/tailwindContentGlobs.mjs:12-13,34-35`
- Modify: `scripts/staruiTailwindContent.cjs:50-51`
- Modify: `packages/design-system/design-system/turbo.json` (build.inputs — added during Task 3, discovered after Task 2's review found the same class of gap in this file)
- Modify: `packages/design-system/design-system/scripts/build-styles-css.ts` (CONTENT_GLOBS — same discovery)
- Modify: `tools/scripts/check-ds-tokens.ts` (ALLOW_PATHS allowlist entries — same discovery, different failure mode: a stale entry here doesn't break a build, it makes `npm run check:ds-tokens` false-positive on legitimate hex values)
- Modify: `docs/PACKAGE_ORGANIZATION.md:41,44` (bucket table)

**Interfaces:**
- Consumes: nothing from Tasks 1–2 (independent packages, run last per the agreed sequencing since both moves exist for the same reason — confining `ag-grid-enterprise` to one future bucket — and are validated as one unit).
- Produces: both packages resolvable at `packages/react-grid/` for Task 4's WORKLOG note.

- [ ] **Step 1: Move both folders with history preserved**

```bash
git mv packages/react-core/config-browser packages/react-grid/config-browser
git mv packages/react-core/widgets-react packages/react-grid/widgets-react
```

- [ ] **Step 2: Root `package.json` workspaces array needs no change**

Both `packages/react-core/*` (source) and `packages/react-grid/*` (destination) are already glob entries — neither package was individually listed. Nothing to edit. Verify:

```bash
grep -n "config-browser\|widgets-react" package.json || echo "confirmed: no explicit entries to remove"
```

- [ ] **Step 3: Neither package's `tsconfig.json` needs a path change**

Confirmed during design grounding: neither has a `references` array, and `extends` is depth-based (unchanged). `widgets-react/tsconfig.json` does have a pre-existing dead `include` entry, `"../openfin-platform/src/types/openfin.d.ts"`, which doesn't resolve to anything today (the real file lives at `./src/types/openfin.d.ts`, already covered by `src/**/*`) — this is a pre-existing anomaly unrelated to the move; leave it alone.

- [ ] **Step 4: Fix the hardcoded Tailwind content-glob entries in `scripts/tailwindContentGlobs.mjs`**

Two entries per array (`platformAppTailwindContent`, `demoAppTailwindContent`), same "don't touch `externalConsumerTailwindContent`" rule as Task 2 Step 4 applies here too.

```diff
 export const platformAppTailwindContent = [
   '../../packages/react-ui/ui/src/**/*.{ts,tsx}',
   '../../packages/react-grid/grid/src/**/*.{ts,tsx}',
   '../../packages/react-core/host-data-react/src/**/*.{ts,tsx}',
   '../../packages/react-core/workspace-setup-react/src/**/*.{ts,tsx}',
-  '../../packages/react-core/widgets-react/src/**/*.{ts,tsx}',
-  '../../packages/react-core/config-browser/src/**/*.{ts,tsx}',
+  '../../packages/react-grid/widgets-react/src/**/*.{ts,tsx}',
+  '../../packages/react-grid/config-browser/src/**/*.{ts,tsx}',
```

```diff
 export const demoAppTailwindContent = [
   '../../../packages/react-ui/ui/src/**/*.{ts,tsx}',
   '../../../packages/react-grid/grid/src/**/*.{ts,tsx}',
   '../../../packages/react-core/host-data-react/src/**/*.{ts,tsx}',
   '../../../packages/react-core/workspace-setup-react/src/**/*.{ts,tsx}',
-  '../../../packages/react-core/widgets-react/src/**/*.{ts,tsx}',
-  '../../../packages/react-core/config-browser/src/**/*.{ts,tsx}',
+  '../../../packages/react-grid/widgets-react/src/**/*.{ts,tsx}',
+  '../../../packages/react-grid/config-browser/src/**/*.{ts,tsx}',
```

(The `host-data-react` and `workspace-setup-react` lines shown above for context reflect Task 2's already-landed edit — don't re-edit those.)

- [ ] **Step 5: Fix `scripts/staruiTailwindContent.cjs`**

```diff
   return [
     join(REPO_ROOT, 'packages/react-ui/ui/src/**/*.{ts,tsx}'),
     join(REPO_ROOT, 'packages/react-grid/grid/src/**/*.{ts,tsx}'),
     join(REPO_ROOT, 'packages/react-core/workspace-setup-react/src/**/*.{ts,tsx}'),
-    join(REPO_ROOT, 'packages/react-core/widgets-react/src/**/*.{ts,tsx}'),
-    join(REPO_ROOT, 'packages/react-core/config-browser/src/**/*.{ts,tsx}'),
+    join(REPO_ROOT, 'packages/react-grid/widgets-react/src/**/*.{ts,tsx}'),
+    join(REPO_ROOT, 'packages/react-grid/config-browser/src/**/*.{ts,tsx}'),
   ];
```

- [ ] **Step 6: Fix the design-system package's own build-input globs and the ds-tokens allowlist**

Task 2's review found that the top-level `scripts/tailwindContentGlobs.mjs`/`staruiTailwindContent.cjs` files were not the only hardcoded-path locations — `packages/design-system/design-system/` carries its own build-input list, and `tools/scripts/check-ds-tokens.ts` carries an unrelated allowlist that also references these packages by path. Both need the same `react-core` → `react-grid` fix for `widgets-react` and `config-browser`.

Edit `packages/design-system/design-system/turbo.json` (relative paths, from `packages/design-system/design-system/`):

```diff
       "inputs": [
         "$TURBO_DEFAULT$",
         "../../react-ui/ui/src/**",
         "../../react-grid/grid/src/**",
-        "../../react-core/widgets-react/src/**",
-        "../../react-core/config-browser/src/**",
+        "../../react-grid/widgets-react/src/**",
+        "../../react-grid/config-browser/src/**",
         "../../react-core/workspace-setup-react/src/**",
         "../../react-core/host-data-react/src/**"
       ],
```

Edit `packages/design-system/design-system/scripts/build-styles-css.ts` (repo-root-relative path strings in the `CONTENT_GLOBS` array):

```diff
 const CONTENT_GLOBS = [
   'packages/react-ui/ui/src/**/*.{ts,tsx}',
   'packages/react-grid/grid/src/**/*.{ts,tsx}',
-  'packages/react-core/widgets-react/src/**/*.{ts,tsx}',
-  'packages/react-core/config-browser/src/**/*.{ts,tsx}',
+  'packages/react-grid/widgets-react/src/**/*.{ts,tsx}',
+  'packages/react-grid/config-browser/src/**/*.{ts,tsx}',
   'packages/react-core/workspace-setup-react/src/**/*.{ts,tsx}',
   'packages/react-core/host-data-react/src/**/*.{ts,tsx}',
 ].map((g) => resolve(repoRoot, g).replace(/\\/g, '/'));
```

Edit `tools/scripts/check-ds-tokens.ts`'s `ALLOW_PATHS` array — three entries reference exact file paths under the old `packages/react-core/widgets-react/` location; a stale entry here means the check silently ignores the wrong file (or nothing) rather than the intended one:

```diff
   'packages/design-system/design-system/tests/',
-  'packages/react-core/widgets-react/src/container/markets-grid-container/MarketsGridContainer.tsx',
+  'packages/react-grid/widgets-react/src/container/markets-grid-container/MarketsGridContainer.tsx',
   'packages/react-grid/grid/src/customizer/ui/ExpressionEditor/language.ts',
```

```diff
   'packages/react-grid/grid/src/customizer/modules/column-templates/snapshotTemplate.test.ts',
-  'packages/react-core/widgets-react/src/hosted/__tests__/useColorLinking.test.tsx',
-  'packages/react-core/widgets-react/src/hosted/useColorLinking.ts',
+  'packages/react-grid/widgets-react/src/hosted/__tests__/useColorLinking.test.tsx',
+  'packages/react-grid/widgets-react/src/hosted/useColorLinking.ts',
```

Then run the check directly to confirm it's clean (it is not part of `lint:all` or any turbo pipeline, so nothing else exercises it automatically):

```bash
npm run check:ds-tokens
```

Expected: exits clean (no new hardcoded-hex/legacy-var findings). If it reports findings on the three files above, the path fix is wrong — re-check the exact relative paths against where the files actually live post-move.

- [ ] **Step 7: Update the bucket table in `docs/PACKAGE_ORGANIZATION.md`**

Edit line 41 (React Grid row) — add both packages:

```diff
-| 3 | **React Grid** | `packages/react-grid/` | `@wellsfargo-starui/grid` |
+| 3 | **React Grid** | `packages/react-grid/` | `@wellsfargo-starui/grid`, `@wellsfargo-starui/config-browser`, `@wellsfargo-starui/widgets-react` |
```

Edit line 44 (React Core row) — remove both packages (state after Task 2's edit to this line):

```diff
-| 6 | **React Core** | `packages/react-core/` | `@wellsfargo-starui/app`, `@wellsfargo-starui/widgets-react`, `@wellsfargo-starui/widget-sdk`, `@wellsfargo-starui/host-wrapper-react`, `@wellsfargo-starui/config-browser`, `@wellsfargo-starui/workspace-setup-react`, `@wellsfargo-starui/host-data-react` |
+| 6 | **React Core** | `packages/react-core/` | `@wellsfargo-starui/app`, `@wellsfargo-starui/widget-sdk`, `@wellsfargo-starui/host-wrapper-react`, `@wellsfargo-starui/workspace-setup-react`, `@wellsfargo-starui/host-data-react` |
```

- [ ] **Step 8: Confirm no leftover relative import crosses the old boundary**

```bash
grep -rn "from '\.\./\.\./react-core/config-browser\|from '\.\./\.\./react-core/widgets-react" packages/ || echo "no matches"
grep -rln "react-core/widgets-react\|react-core/config-browser" --include="*.ts" --include="*.mjs" --include="*.cjs" --include="*.json" . 2>/dev/null | grep -v node_modules | grep -v /dist/ | grep -v tsbuildinfo || echo "no matches"
```

Expected: `no matches` for the first command (import-style specifiers). The second command is a broader literal-string sweep across the whole repo (not just `packages/`) — after Step 6's edits it should also print `no matches`; if it finds anything, that's a fourth hardcoded-path location Step 6 didn't anticipate and needs the same fix before proceeding.

- [ ] **Step 9: Run the in-repo validation gate**

```bash
npx turbo typecheck build test
```

Expected: all green — this is the move most likely to surface a real break, since `widgets-react` is the biggest of the four packages moving in this plan; read any failure carefully before assuming it's a path issue.

- [ ] **Step 10: Run the cycle checker**

```bash
npm run check:deps
```

Expected: no cycle reported.

- [ ] **Step 11: Pack and validate against the tarball apps**

```bash
npm run pack:npm
cd /Users/develop/wfh/starui-apps
npm run setup:tarball
npm run build:tarball
cd -
```

Expected: all six tarball apps build clean. `star-demo` pins both `@wellsfargo-starui/config-browser` and `@wellsfargo-starui/widgets-react` by name via `vendor/*.tgz`, unaffected by the folder move.

- [ ] **Step 12: Commit**

`git mv` already staged both folder renames — only the edited config files need staging:

```bash
git add scripts/tailwindContentGlobs.mjs scripts/staruiTailwindContent.cjs packages/design-system/design-system/turbo.json packages/design-system/design-system/scripts/build-styles-css.ts tools/scripts/check-ds-tokens.ts docs/PACKAGE_ORGANIZATION.md
git status --short
```

Review the output before committing: `packages/react-core/config-browser/...` → `packages/react-grid/config-browser/...` and `packages/react-core/widgets-react/...` → `packages/react-grid/widgets-react/...` renames, plus the six edited files as `M` — nothing else.

```bash
git commit -m "$(cat <<'EOF'
refactor(packages): move config-browser and widgets-react into the react-grid bucket

Confines the ag-grid-enterprise peer dependency to one future
published bucket instead of leaking it into react-core (WORKLOG #11).
Folder move only, package identity unchanged.

EOF
)"
```

---

### Task 4: Close out WORKLOG item 11's folder-move stage

**Files:**
- Modify: `docs/WORKLOG.md` (item 11 section)

**Interfaces:**
- Consumes: the fact that Tasks 1–3 landed and validated clean (no code interface — this is a documentation-only task).
- Produces: nothing further tasks depend on; this is the final task in the plan.

- [ ] **Step 1: Verify the final tree shape**

```bash
ls packages/data packages/shared packages/react-core packages/react-grid
```

Expected:
- `packages/data/` — only `host-data`, `host-data-angular`
- `packages/shared/` — `engine`, `host`, `host-browser`, `host-config`, `shared-types`, `types`, `widget`, `widget-browser`
- `packages/react-core/` — `config-browser` and `widgets-react` **absent**; `host-data-react`, `host-wrapper-react`, `widget-sdk`, `workspace-setup-react` present
- `packages/react-grid/` — `grid`, `config-browser`, `widgets-react`

- [ ] **Step 2: Confirm the package count is unchanged**

```bash
npm run pack:npm
ls dist-npm/*.tgz | wc -l
```

Expected: **21** — this phase moves folders, it does not collapse packages. (Collapsing to 7 is the next, separate stage.)

- [ ] **Step 3: Update WORKLOG.md item 11**

Read the current item 11 section (`docs/WORKLOG.md`, "## 11. Bucket contents are wrong; 21 published packages should become 7") and replace its **"When it runs"** paragraph and the paragraph after it with a status update. Find:

```markdown
**When it runs.** Whenever someone picks it up — nothing blocks it any more.
```

Replace with:

```markdown
**Folder-move stage: done.** `host-config` → `shared`, `host-data-react` →
`react-core`, `config-browser` + `widgets-react` → `react-grid` landed as
three separate commits, each validated with `npx turbo typecheck build
test`, `npm run check:deps`, and a full tarball install + build in the
sibling `starui-apps` repo. Package count is still 21 — only folder
location changed, per the design spec at
[`docs/superpowers/specs/2026-08-01-package-bucket-realignment-design.md`](./superpowers/specs/2026-08-01-package-bucket-realignment-design.md).

**What remains** is the second stage this item originally described:
collapsing 21 `package.json` files into 7, which still requires
`check-package-cycles.mjs` and `check-package-coverage.mjs` to be taught to
treat `packages/<bucket>/<member>/` as graph nodes (see "Still true" above)
before it can start.
```

- [ ] **Step 4: Commit**

```bash
git add docs/WORKLOG.md
git commit -m "$(cat <<'EOF'
docs: close out the folder-move stage of WORKLOG item 11

All three package moves landed and validated (typecheck/build/test,
cycle check, tarball install) across three prior commits. Package
count remains 21 — the package.json collapse to 7 is a separate,
still-open stage.

EOF
)"
```

---

## Self-Review Notes

- **Spec coverage:** all five numbered steps of the design spec's "Per-move mechanical steps" section map to steps within Tasks 1–3 (folder move, workspaces edit, tsconfig fix, hardcoded script paths, docs). The spec's "Done looks like" checklist maps to Task 4 Steps 1–2 (tree shape, package count) plus the WORKLOG update in Step 3.
- **Convention constraint honored:** no task introduces a symlink, shim, new script, or workspace-protocol change — every edit is either a `git mv`, a literal string replacement in an existing file, or a documentation table row.
- **Sequencing matches the approved design:** `host-config` (breaks the cycle) → `host-data-react` → `config-browser`+`widgets-react` together, one commit each.
