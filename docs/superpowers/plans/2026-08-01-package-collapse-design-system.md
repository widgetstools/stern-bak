# Package Collapse Sub-Phase 1 (design-system) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse `packages/design-system/design-system` and `packages/design-system/icons-svg` — currently two separate npm packages — into one published package, `@wellsfargo-starui/design-system`, retiring the `@wellsfargo-starui/icons-svg` npm identity in favor of new `./icons*` subpaths, with zero source-file relocation.

**Architecture:** Both members' `src`/root-level source trees, build scripts, and per-member `tsconfig.json` files stay exactly where they are — only each member's `package.json`, `vitest.config.ts`, and (for design-system) `turbo.json` are deleted, replaced by one new set at the bucket root (`packages/design-system/`). The new root `package.json`'s `exports` map and `scripts.build` orchestrate both members' existing, unmodified build pipelines. Because there is no compatibility shim for the retired `icons-svg` name, the package-identity change and the 3 consumer packages' import-site migration must land in one atomic commit — the repo cannot stay green with only one half applied.

**Tech Stack:** npm 10 workspaces, Turborepo 2, TypeScript project references, Vitest 4.

## Global Constraints

- **npm only.** Never `pnpm`/`yarn`, never `--legacy-peer-deps`, never `--force`, never `npm ci`.
- **No bespoke tooling / no compatibility shim.** A consumer that still imports `@wellsfargo-starui/icons-svg` after this lands must get a real "module not found," not a silent re-export shim — that is the correct signal that its import needs updating, same as every other consumer in this change.
- **Member `src`/root source trees do not move.** `packages/design-system/design-system/src/` and `packages/design-system/icons-svg/{index.ts,allIcons.ts,react/,angular/,svg/}` stay at their exact current paths. Only each member's `package.json`, `vitest.config.ts`, and `turbo.json` (design-system only — icons-svg's is deleted, not relocated) are removed.
- **Package identity**: name `@wellsfargo-starui/design-system`, version `0.1.0` (design-system's existing version — the surviving identity, not bumped).
- **Coverage-tooling gap is accepted, not patched.** `check-package-coverage.mjs`/`run-test-coverage.mjs` will scan `packages/design-system/coverage/` as a one-level path after this lands; they still expect two-level `packages/<bucket>/<member>/coverage/` elsewhere. This is documented in WORKLOG, not fixed here — sub-phase 7 makes the tooling collapse-aware once, for the final shape.
- **Commit trailer:** ends with `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
- **Repo paths:** platform repo is the working directory. Apps repo is `/Users/develop/wfh/starui-apps` — a sibling checkout, referenced by absolute path, for tarball validation only (this plan never edits files there).

---

### Task 0: Pre-flight — confirm target paths are clean

**Files:** none modified; read-only verification.

**Interfaces:** Gates Task 1. Uncommitted changes in any of the paths this plan touches would get silently bundled into Task 1's commit.

- [ ] **Step 1: Check git status scoped to every path this plan touches**

```bash
git status --short \
  packages/design-system/design-system \
  packages/design-system/icons-svg \
  package.json \
  packages/openfin/openfin-platform \
  packages/react-core/workspace-setup-react \
  packages/react-grid/grid \
  CLAUDE.md docs/PACKAGE_ORGANIZATION.md docs/current-features.md docs/WORKLOG.md
```

- [ ] **Step 2: Handle any output**

If empty, proceed to Task 1. If not empty, resolve per the same order of preference as prior plans in this series: commit unrelated finished work separately first; stash only the affected paths (`git stash push -u -- <paths>`) if it's WIP to resume after; or stop and ask the user if the change looks substantial or its status is unclear. Re-run Step 1 and confirm empty before starting Task 1.

---

### Task 1: Collapse design-system + icons-svg into one package, migrate consumers

**Files:**
- Create: `packages/design-system/package.json`
- Create: `packages/design-system/vitest.config.ts`
- Move: `packages/design-system/design-system/turbo.json` → `packages/design-system/turbo.json`
- Delete: `packages/design-system/design-system/package.json`
- Delete: `packages/design-system/design-system/vitest.config.ts`
- Delete: `packages/design-system/icons-svg/package.json`
- Delete: `packages/design-system/icons-svg/vitest.config.ts`
- Delete: `packages/design-system/icons-svg/turbo.json`
- Modify: `packages/design-system/icons-svg/tsconfig.json` (found during execution: pre-existing `include` typo, `"all-icons.ts"` vs the real `allIcons.ts`, never before exercised because icons-svg never had its own `typecheck` script — the new merged `typecheck` script is the first thing to run `tsc --noEmit` against this exact config)
- Modify: `scripts/packageDistFinalize.mjs` (found during execution: `finalizeDist()` unconditionally read `pkgDir/package.json` just to log a name — throws ENOENT for a collapsed member subfolder, which by design no longer has one. Made the read optional with a directory-basename fallback; this is shared infra every future sub-phase's members will also hit, not something specific to design-system)
- Modify: `packages/react-grid/grid/vitest.config.ts` (found during execution: a hardcoded Vite `resolve.alias` bare-matches `@wellsfargo-starui/design-system` as a string prefix and rewrites it to a fixed file path, `../../design-system/design-system/dist/index.js` — this swallows every subpath that isn't given its own more-specific alias entry first, including the new `/icons/all-icons`. Confirmed via repo-wide grep this exact pattern exists in no other package's vite/vitest config — added one more specific alias, following the file's own existing convention of listing specific subpaths before the bare fallback)
- Modify: `scripts/pack-npm.mjs` (found during execution: `discover()` only ever checked `packages/<bucket>/<member>/package.json` — a hardcoded two-level assumption. Silently skipped `design-system` from `pack:npm` entirely, no error, just 19 tarballs instead of 20. This is a hard functional break, not the accepted coverage-tooling gap — fixed now: check the bucket root for a package.json first, only fall back to the member-level scan if it's absent, so uncollapsed buckets are unaffected)
- Modify: `scripts/staruiConsumerAliases.mjs` (found during execution: `discoverManifestFromPackages()` and `findMemberFolder()` have the identical two-level-only assumption, but this file backs the apps repo's **source-track** Vite dev/build alias resolution and the generated consumer tsconfig — silently dropping design-system there would break `npm run dev`/`build:source` for any app importing it, not just a reporting gap. My plan's tarball-only validation (Step 14) wouldn't have caught this. Fixed both functions the same way: bucket-root package.json checked first; `findMemberFolder` returns `''` for the collapsed case, which `path.join` naturally resolves back to the bucket root everywhere it's used downstream (verified: no other call site needed changes; confirmed end-to-end via `npm run check:source-aliases` and by re-running `npm run pack:npm`, which now emits 20 tarballs including `design-system`)
- Modify: `packages/design-system/icons-svg/allIcons.test.ts` (add environment override)
- Modify: `packages/design-system/icons-svg/index.test.ts` (add environment override)
- Modify: `package.json:9` (root workspaces array)
- Modify: `package.json` `devDependencies` (drop the root-level `@wellsfargo-starui/icons-svg` dev-dependency — found during execution, not caught during planning: root `package.json` devDependencies also declares `@wellsfargo-starui/design-system`, `@wellsfargo-starui/icons-svg`, `@wellsfargo-starui/shared-types`, `@wellsfargo-starui/types` for repo-root tooling; only the `icons-svg` line needs removing, the others are unaffected)
- Modify: `packages/openfin/openfin-platform/src/dockEditor/iconUtils.ts:12`
- Modify: `packages/openfin/openfin-platform/src/dockEditor/iconUtils.test.ts:3`
- Modify: `packages/openfin/openfin-platform/package.json`
- Modify: `packages/react-core/workspace-setup-react/src/components/IconPicker.tsx:16-18`
- Modify: `packages/react-core/workspace-setup-react/src/components/IconPicker.test.tsx:4`
- Modify: `packages/react-core/workspace-setup-react/src/ImportConfig.tsx:12`
- Modify: `packages/react-core/workspace-setup-react/package.json`
- Modify: `packages/react-grid/grid/src/customizer/modules/column-customization/CellRendererEditors/IconTextEditor.tsx:10`
- Modify: `packages/react-grid/grid/src/customizer/modules/column-customization/CellRendererEditors/CellRendererEditors.test.tsx:3`
- Modify: `packages/react-grid/grid/package.json`

**Interfaces:**
- Consumes: nothing from earlier tasks (first substantive task).
- Produces: `@wellsfargo-starui/design-system` resolvable with 18 `exports` subpaths (13 original + 5 new `./icons*`) for Task 2's doc updates and WORKLOG note. No other task depends on this one's internals.

- [ ] **Step 1: Move design-system's `turbo.json` to the bucket root and adjust relative depth**

```bash
git mv packages/design-system/design-system/turbo.json packages/design-system/turbo.json
```

The file moved up one directory level, so every `../../` path becomes `../` (one segment shorter), and `outputs` must list both members' now-separately-located `dist/` folders since one `build` task now covers both. Edit `packages/design-system/turbo.json` to:

```json
{
  "$schema": "https://turbo.build/schema.json",
  "extends": [
    "//"
  ],
  "tasks": {
    "test": {
      "dependsOn": [
        "^build",
        "build"
      ]
    },
    "build": {
      "dependsOn": [
        "^build"
      ],
      "inputs": [
        "$TURBO_DEFAULT$",
        "../react-ui/ui/src/**",
        "../react-grid/grid/src/**",
        "../react-grid/widgets-react/src/**",
        "../react-grid/config-browser/src/**",
        "../react-core/workspace-setup-react/src/**",
        "../react-core/host-data-react/src/**"
      ],
      "outputs": [
        "design-system/dist/**",
        "icons-svg/dist/**"
      ]
    }
  }
}
```

- [ ] **Step 2: Delete icons-svg's own `turbo.json`**

Its only content (`{"extends": ["//"], "tasks": {"build": {"outputs": ["dist/**"]}}}`) is fully subsumed by Step 1's relocated config, which already lists `icons-svg/dist/**` in `outputs`.

```bash
git rm packages/design-system/icons-svg/turbo.json
```

- [ ] **Step 3: Create the merged root `package.json`**

Write `packages/design-system/package.json`:

```json
{
  "name": "@wellsfargo-starui/design-system",
  "version": "0.1.0",
  "private": true,
  "description": "MarketsUI design system — primitives, semantic tokens, themes, framework adapters, and framework-agnostic SVG icons. Consolidates fi-trading-terminal tokens + star UI wrappers + icons-svg.",
  "type": "module",
  "main": "./design-system/dist/index.js",
  "module": "./design-system/dist/index.js",
  "types": "./design-system/dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./design-system/dist/index.d.ts",
      "import": "./design-system/dist/index.js"
    },
    "./css": "./design-system/dist/css/theme.css",
    "./styles.css": "./design-system/dist/css/styles.css",
    "./reset.css": "./design-system/dist/css/reset.css",
    "./tailwind": {
      "types": "./design-system/dist/adapters/tailwind.d.ts",
      "import": "./design-system/dist/adapters/tailwind.js",
      "default": "./design-system/dist/adapters/tailwind.js"
    },
    "./primeng": {
      "types": "./design-system/dist/adapters/primeng.d.ts",
      "import": "./design-system/dist/adapters/primeng.js",
      "default": "./design-system/dist/adapters/primeng.js"
    },
    "./shadcn": {
      "types": "./design-system/dist/adapters/shadcn.d.ts",
      "import": "./design-system/dist/adapters/shadcn.js",
      "default": "./design-system/dist/adapters/shadcn.js"
    },
    "./adapters/ag-grid": {
      "types": "./design-system/dist/adapters/agGrid.d.ts",
      "import": "./design-system/dist/adapters/agGrid.js",
      "default": "./design-system/dist/adapters/agGrid.js"
    },
    "./tokens": {
      "types": "./design-system/dist/tokens/index.d.ts",
      "import": "./design-system/dist/tokens/index.js"
    },
    "./tokens/primitives": {
      "types": "./design-system/dist/tokens/primitives.d.ts",
      "import": "./design-system/dist/tokens/primitives.js"
    },
    "./tokens/semantic": {
      "types": "./design-system/dist/tokens/semantic.d.ts",
      "import": "./design-system/dist/tokens/semantic.js"
    },
    "./tokens/components": {
      "types": "./design-system/dist/tokens/components.d.ts",
      "import": "./design-system/dist/tokens/components.js"
    },
    "./tokens/controls": {
      "types": "./design-system/dist/tokens/controls.d.ts",
      "import": "./design-system/dist/tokens/controls.js"
    },
    "./cell-renderers": {
      "types": "./design-system/dist/cellRenderers.d.ts",
      "import": "./design-system/dist/cellRenderers.js"
    },
    "./cell-renderers-registry": {
      "types": "./design-system/dist/cellRendererRegistry.d.ts",
      "import": "./design-system/dist/cellRendererRegistry.js"
    },
    "./icons": {
      "types": "./icons-svg/dist/index.d.ts",
      "import": "./icons-svg/dist/index.js",
      "require": "./icons-svg/dist/index.js"
    },
    "./icons/react": {
      "types": "./icons-svg/dist/react/index.d.ts",
      "import": "./icons-svg/dist/react/index.js"
    },
    "./icons/angular": "./icons-svg/angular/index.ts",
    "./icons/all-icons": {
      "types": "./icons-svg/dist/allIcons.d.ts",
      "import": "./icons-svg/dist/allIcons.js"
    },
    "./icons/svg/*": "./icons-svg/svg/*"
  },
  "scripts": {
    "build": "rimraf design-system/dist design-system/tsconfig.tsbuildinfo icons-svg/dist && tsc --project design-system/tsconfig.json && tsx design-system/scripts/build-css.ts && tsx design-system/scripts/build-styles-css.ts && node design-system/scripts/copy-assets.mjs && tsc --project icons-svg/tsconfig.build.json && node icons-svg/scripts/copy-assets.mjs",
    "typecheck": "tsc --noEmit --project design-system/tsconfig.json && tsc --noEmit --project icons-svg/tsconfig.json",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "peerDependencies": {
    "ag-grid-community": "^35.1.0",
    "tailwindcss": "^3.4.1",
    "react": "^19.2.5"
  },
  "peerDependenciesMeta": {
    "tailwindcss": {
      "optional": true
    },
    "react": {
      "optional": true
    }
  },
  "devDependencies": {
    "@fontsource-variable/inter": "^5.3.0",
    "@fontsource-variable/jetbrains-mono": "^5.3.0",
    "@types/react": "^19.2.14",
    "ag-grid-community": "35.1.0",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.47",
    "rimraf": "^6.0.1",
    "tailwindcss": "3.4.1",
    "tsx": "^4.22.2",
    "typescript": "~5.9.3",
    "vitest": "^4.1.4"
  },
  "files": [
    "design-system/dist",
    "design-system/src/styles",
    "icons-svg/dist",
    "icons-svg/svg/**/*.svg",
    "icons-svg/angular/**/*"
  ],
  "dependencies": {
    "@primeuix/themes": "^1.2.3",
    "@wellsfargo-starui/shared-types": "*",
    "tailwindcss-animate": "^1.0.7",
    "tailwindcss-primeui": "^0.6.1",
    "@lucide/angular": "^1.17.0",
    "lucide-react": "^0.554.0"
  },
  "sideEffects": [
    "*.css"
  ]
}
```

This is the union of both members' original `package.json` fields: 18 `exports` entries (design-system's 13 unchanged + icons-svg's 5 renested under `./icons*`), merged `dependencies`/`peerDependencies`/`devDependencies` (no version conflicts — every shared devDependency already matched exactly between the two originals), and a `build` script that runs both members' original build commands back to back, each still targeting its own `tsconfig.json`/`tsconfig.build.json` and emitting into its own `dist/` (`design-system/dist/` and `icons-svg/dist/` respectively — neither member's own `tsconfig.json` needs editing, since `rootDir`/`outDir` in each stays relative to where that config file already lives).

- [ ] **Step 4: Delete both members' own `package.json`**

```bash
git rm packages/design-system/design-system/package.json
git rm packages/design-system/icons-svg/package.json
```

- [ ] **Step 5: Create the merged `vitest.config.ts`**

Write `packages/design-system/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';
import { coverage } from '../../scripts/vitestCoverage.mjs';

export default defineConfig({
  test: {
    coverage: coverage({
      include: [
        'design-system/src/**/*.{ts,tsx,js,jsx}',
        'icons-svg/index.ts',
        'icons-svg/allIcons.ts',
        'icons-svg/react/**/*.{ts,tsx}',
      ],
    }),
    environment: 'jsdom',
    include: [
      'design-system/tests/**/*.test.ts',
      'design-system/src/**/*.test.ts',
      'icons-svg/**/*.test.ts',
    ],
    exclude: ['**/node_modules/**', '**/dist/**'],
    snapshotFormat: { printBasicPrototype: false },
  },
});
```

The import path is `../../scripts/vitestCoverage.mjs` (two levels up from `packages/design-system/`), one segment shorter than design-system's original `../../../scripts/vitestCoverage.mjs` (which was three levels up from `packages/design-system/design-system/`) — the config file moved up one directory.

`environment: 'jsdom'` matches design-system's original default (the larger, more DOM-dependent test surface). icons-svg's two test files need a per-file override back to `node` (Step 6) since they were originally configured with `environment: 'node'` and don't use jsdom-only APIs.

- [ ] **Step 6: Add per-file environment overrides to icons-svg's test files**

Vitest supports a docblock comment to override the config's default `environment` for a single file. Add this as the first line of each:

`packages/design-system/icons-svg/allIcons.test.ts`:
```diff
+// @vitest-environment node
 import { describe, expect, it } from 'vitest';
```

`packages/design-system/icons-svg/index.test.ts`:
```diff
+// @vitest-environment node
 import { describe, expect, it } from 'vitest';
```

- [ ] **Step 7: Delete both members' own `vitest.config.ts`**

```bash
git rm packages/design-system/design-system/vitest.config.ts
git rm packages/design-system/icons-svg/vitest.config.ts
```

- [ ] **Step 8: Fix the root `package.json` workspaces array**

`"packages/design-system/*"` is a glob matching subdirectories one level under `packages/design-system/` — after this collapse, neither `design-system/design-system/` nor `design-system/icons-svg/` has a `package.json` anymore, so the glob would match zero packages. The bucket root itself (`packages/design-system/`, no trailing `/*`) needs to be listed as a literal single-package entry — the same pattern already used for `packages/data/host-data`.

```diff
   "workspaces": [
-    "packages/design-system/*",
+    "packages/design-system",
     "packages/react-ui/*",
     "packages/react-grid/*",
     "packages/data/host-data",
     "packages/openfin/*",
     "packages/react-core/*",
     "packages/shared/*"
   ],
```

- [ ] **Step 9: Rewrite the 9 import statements across the 3 real consumer packages**

Verified during planning: only `openfin-platform`, `workspace-setup-react`, and `grid` actually import `@wellsfargo-starui/icons-svg` (a fourth candidate, `config-browser/src/icons.tsx`, only *mentions* it in a comment — confirmed no real import, no dependency declaration, no change needed there).

`packages/openfin/openfin-platform/src/dockEditor/iconUtils.ts`:
```diff
-import { marketIconToDataUrl } from "@wellsfargo-starui/icons-svg/all-icons";
+import { marketIconToDataUrl } from "@wellsfargo-starui/design-system/icons/all-icons";
```

`packages/openfin/openfin-platform/src/dockEditor/iconUtils.test.ts`:
```diff
-vi.mock('@wellsfargo-starui/icons-svg/all-icons', () => ({
+vi.mock('@wellsfargo-starui/design-system/icons/all-icons', () => ({
```

`packages/react-core/workspace-setup-react/src/components/IconPicker.tsx`:
```diff
-import { DynamicIcon as Icon } from "@wellsfargo-starui/icons-svg/react";
-import { MARKET_ICON_SVGS, svgToDataUrl } from "@wellsfargo-starui/icons-svg/all-icons";
-import { ICON_META } from "@wellsfargo-starui/icons-svg";
+import { DynamicIcon as Icon } from "@wellsfargo-starui/design-system/icons/react";
+import { MARKET_ICON_SVGS, svgToDataUrl } from "@wellsfargo-starui/design-system/icons/all-icons";
+import { ICON_META } from "@wellsfargo-starui/design-system/icons";
```

`packages/react-core/workspace-setup-react/src/components/IconPicker.test.tsx`:
```diff
-import { ICON_META } from '@wellsfargo-starui/icons-svg';
+import { ICON_META } from '@wellsfargo-starui/design-system/icons';
```

`packages/react-core/workspace-setup-react/src/ImportConfig.tsx`:
```diff
-import { UPLOAD_SVG } from "@wellsfargo-starui/icons-svg/all-icons";
+import { UPLOAD_SVG } from "@wellsfargo-starui/design-system/icons/all-icons";
```

`packages/react-grid/grid/src/customizer/modules/column-customization/CellRendererEditors/IconTextEditor.tsx`:
```diff
-import { MARKET_ICON_SVGS } from '@wellsfargo-starui/icons-svg/all-icons';
+import { MARKET_ICON_SVGS } from '@wellsfargo-starui/design-system/icons/all-icons';
```

`packages/react-grid/grid/src/customizer/modules/column-customization/CellRendererEditors/CellRendererEditors.test.tsx`:
```diff
-import { MARKET_ICON_SVGS } from '@wellsfargo-starui/icons-svg/all-icons';
+import { MARKET_ICON_SVGS } from '@wellsfargo-starui/design-system/icons/all-icons';
```

Leave the comment-only mentions of `@wellsfargo-starui/icons-svg` untouched (e.g. `dockEditor/icons.ts`, `icons/meta.ts`, `config-browser/src/icons.tsx`, and the doc-comment lines in the files above this step didn't already touch) — they're historical/explanatory prose, not live references, and editing them is out of scope.

- [ ] **Step 10: Drop the now-redundant `icons-svg` dependency from the 3 consumers' `package.json`**

All three already depend on `@wellsfargo-starui/design-system`, which now contains the icons content — the separate `icons-svg` line is redundant.

`packages/openfin/openfin-platform/package.json`:
```diff
     "@wellsfargo-starui/design-system": "*",
-    "@wellsfargo-starui/icons-svg": "*",
```

`packages/react-core/workspace-setup-react/package.json`:
```diff
     "@wellsfargo-starui/design-system": "*",
-    "@wellsfargo-starui/icons-svg": "*",
```

`packages/react-grid/grid/package.json`:
```diff
     "@wellsfargo-starui/design-system": "*",
-    "@wellsfargo-starui/icons-svg": "*",
```

(Locate the exact line by searching for `@wellsfargo-starui/icons-svg` in each file — `grid`'s `package.json` lists `@wellsfargo-starui/design-system` more than once across different dependency-type sections; only the `icons-svg` line is removed, every `design-system` line stays untouched.)

- [ ] **Step 11: Refresh workspace symlinks and confirm no leftover reference**

```bash
npm install
grep -rn "@wellsfargo-starui/icons-svg" packages/ --include="*.ts" --include="*.tsx" \
  | grep -v "^packages/design-system/icons-svg/" \
  | grep -vE ": *\* +@wellsfargo-starui/icons-svg| @wellsfargo-starui/icons-svg[^/'\"]* \(| @wellsfargo-starui/icons-svg\)| @wellsfargo-starui/icons-svg's| @wellsfargo-starui/icons-svg —| @wellsfargo-starui/icons-svg\.$"
```

Expected: `npm install` completes cleanly (no ERESOLVE), and the grep's remaining output (after filtering out icons-svg's own source and known comment-only mentions) is empty — confirming every *real* import was migrated in Step 9. If the filtered grep still shows a real `import`/`vi.mock` line, it was missed — go back and fix it before continuing. (This filter is intentionally coarse; read whatever it prints rather than trusting it blindly — the goal is catching a missed import, not a perfectly precise grep.)

```bash
ls node_modules/@wellsfargo-starui/icons-svg 2>&1
```

Expected: `No such file or directory` — confirms `npm install` correctly pruned the retired package's symlink rather than leaving it dangling.

- [ ] **Step 12: Run the in-repo validation gate**

```bash
npx turbo typecheck build test
```

Expected: all green. Read any failure carefully — `design-system` is a large, heavily-tested package (well over 100 test files across `tests/` and `src/`), so a real regression is more likely here than in prior sub-phases.

- [ ] **Step 13: Run the cycle checker and the design-tokens check**

```bash
npm run check:deps
npm run check:ds-tokens
```

Expected: `check:deps` reports no cycles. `check:ds-tokens` output is unchanged from its pre-existing baseline (its `ALLOW_PATHS` entries for `packages/design-system/design-system/src/`, `packages/design-system/icons-svg/`, and `packages/design-system/design-system/tests/` all remain valid paths — this plan does not move any source, so no edit to `tools/scripts/check-ds-tokens.ts` is needed or expected).

- [ ] **Step 14: Pack and validate against the tarball apps**

```bash
npm run pack:npm
ls dist-npm/*.tgz | wc -l
```

Expected: **20** tarballs (was 21 — `design-system` and `icons-svg` collapse from 2 into 1).

**Important — found during execution:** if you're running this from a git worktree (not the main checkout), `setup.mjs` defaults to resolving the platform repo as a *sibling directory* of `starui-apps` — i.e. the main checkout, not your worktree. Running plain `npm run setup:tarball` here silently vendors the **main checkout's** stale `dist-npm/` (still 21 tarballs, the old split) instead of your worktree's freshly-packed 20. Set `STARUI_PLATFORM` to point at the worktree explicitly:

```bash
cd /Users/develop/wfh/starui-apps
STARUI_PLATFORM=/Users/develop/wfh/stern-bak/.claude/worktrees/pkg-collapse-design-system npm run setup:tarball
STARUI_PLATFORM=/Users/develop/wfh/stern-bak/.claude/worktrees/pkg-collapse-design-system npm run build:tarball
cd -
```

(Adjust the path to whatever worktree you're actually running from — check `pwd` in the platform repo first.)

Expected: `setup:tarball`'s own cleanup step ("Drop vendored tarballs that no longer correspond to a packed package") removes the stale `vendor/wellsfargo-starui-icons-svg.tgz` automatically, and `build:tarball` builds all six tarball-track apps clean. If `build:tarball` fails specifically because `source/star-demo/package.json` (in the **apps repo**, not this one) still declares a dependency on `@wellsfargo-starui/icons-svg`, that is a real, expected finding — it means the apps repo needs its own follow-up to drop that dependency (mirroring this repo's Step 10). Do not edit files in `/Users/develop/wfh/starui-apps` as part of this task; if this happens, stop and report it rather than silently patching a sibling repo, and note it for Task 2's WORKLOG update.

- [ ] **Step 15: Manual resolution spot-check on the packed tarball**

```bash
tar -xOzf dist-npm/wellsfargo-starui-design-system-*.tgz package/package.json | grep -A3 '"./icons/all-icons"'
tar -tzf dist-npm/wellsfargo-starui-design-system-*.tgz | grep -E "icons-svg/dist/allIcons|design-system/dist/tokens/semantic"
```

Expected: the `exports` entry for `./icons/all-icons` is present in the packed `package.json`, and both a design-system-only compiled file (`design-system/dist/tokens/semantic.js`) and an icons compiled file (`icons-svg/dist/allIcons.js`) are present in the tarball — confirming both members' build output actually ships, not just the workspace-alias-resolved version.

- [ ] **Step 16: Commit**

```bash
git add packages/design-system package.json \
  packages/openfin/openfin-platform \
  packages/react-core/workspace-setup-react \
  packages/react-grid/grid
git status --short
```

Review the output before committing: `packages/design-system/design-system/{package.json,vitest.config.ts,turbo.json}` and `packages/design-system/icons-svg/{package.json,vitest.config.ts,turbo.json}` deleted; `packages/design-system/{package.json,vitest.config.ts,turbo.json}` added; `packages/design-system/icons-svg/{allIcons.test.ts,index.test.ts}` modified (environment docblock); the 9 import-site files and 3 consumer `package.json`s modified; root `package.json` modified — nothing else.

```bash
git commit -m "$(cat <<'EOF'
refactor(packages): collapse design-system and icons-svg into one package

Sub-phase 1 of the 21-package.json-to-7 collapse (WORKLOG #11 phase 2).
Retires the @wellsfargo-starui/icons-svg npm identity in favor of new
./icons* subpaths on @wellsfargo-starui/design-system. No source files
moved — only each member's package.json/vitest.config.ts/turbo.json
were removed in favor of one set at the bucket root. Migrates the 9
real import sites across openfin-platform, workspace-setup-react, and
grid (a 4th candidate, config-browser, was a comment-only false
positive during design and needed no change).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Documentation updates and WORKLOG close-out

**Files:**
- Modify: `CLAUDE.md` (bucket table, foundation-packages import rule, subpath-export example)
- Modify: `docs/PACKAGE_ORGANIZATION.md` (bucket table)
- Modify: `docs/current-features.md` (§ 1.2 header and export-path list)
- Modify: `docs/WORKLOG.md` (item 11 progress note)

**Interfaces:**
- Consumes: Task 1's completed collapse (package name, new `./icons*` subpaths).
- Produces: nothing further tasks depend on; this is the final task in this sub-phase's plan.

- [ ] **Step 1: Update `CLAUDE.md`'s bucket table**

```diff
-| 1 | UI Design System | `design-system/` | `design-system`, `icons-svg` |
+| 1 | UI Design System | `design-system/` | `design-system` |
```

- [ ] **Step 2: Update `CLAUDE.md`'s foundation-packages import rule**

```diff
-- Foundation packages (`shared-types`, `design-system`, `icons-svg`) must
+- Foundation packages (`shared-types`, `design-system`) must
   not import from anywhere except each other.
```

- [ ] **Step 3: Update `CLAUDE.md`'s public-subpath-exports example**

```diff
 **Public subpath exports** in `package.json` `"exports"` may use kebab
 even when they point at camelCase files (subpath name is the package's
 public API; renaming breaks consumers). Examples:
-`@wellsfargo-starui/icons-svg/all-icons` → `./allIcons.ts`,
+`@wellsfargo-starui/design-system/icons/all-icons` → `icons-svg/allIcons.ts`,
 `@wellsfargo-starui/design-system/cell-renderers` → `./dist/cellRenderers.js`.
```

- [ ] **Step 4: Update `docs/PACKAGE_ORGANIZATION.md`'s bucket table**

```diff
-| 1 | **UI Design System** | `packages/design-system/` | `@wellsfargo-starui/design-system`, `@wellsfargo-starui/icons-svg` |
+| 1 | **UI Design System** | `packages/design-system/` | `@wellsfargo-starui/design-system` |
```

- [ ] **Step 5: Update `docs/current-features.md` § 1.2**

The `**Path:**` line stays accurate (source didn't move) — only the header and the 5 export-path bullets change:

```diff
-### 1.2 `@wellsfargo-starui/icons-svg`
+### 1.2 Icons (`@wellsfargo-starui/design-system/icons`)

 **Path:** `packages/design-system/icons-svg`
 **Purpose:** Framework-agnostic SVG icon catalogue (113 icons) for trading UIs.

 **Public exports:**

-- `.` — `ICON_PATHS`, `ICON_META`, helpers
-- `./react` — curated `lucide-react` re-exports + `DynamicIcon` (id → Lucide component)
-- `./angular` — `@lucide/angular` bindings: `LucideComponent`, `provideLucideIcons`, `provideLucideConfig`, `LUCIDE_ICONS`, `LUCIDE_CONFIG`, and per-icon standalone components (aliased to friendly names, e.g. `FileText`, `Home`)
-- `./all-icons` — `MARKET_ICON_SVGS`, `svgToDataUrl`, `marketIconToDataUrl`, named SVG constants, plus full icon-id enumeration
-- `./svg/*` — direct SVG file access
+- `./icons` — `ICON_PATHS`, `ICON_META`, helpers
+- `./icons/react` — curated `lucide-react` re-exports + `DynamicIcon` (id → Lucide component)
+- `./icons/angular` — `@lucide/angular` bindings: `LucideComponent`, `provideLucideIcons`, `provideLucideConfig`, `LUCIDE_ICONS`, `LUCIDE_CONFIG`, and per-icon standalone components (aliased to friendly names, e.g. `FileText`, `Home`)
+- `./icons/all-icons` — `MARKET_ICON_SVGS`, `svgToDataUrl`, `marketIconToDataUrl`, named SVG constants, plus full icon-id enumeration
+- `./icons/svg/*` — direct SVG file access
```

(Read the actual current file content around these lines first — line numbers may have shifted since planning; locate by the section heading and bullet text, not by line number alone.)

- [ ] **Step 6: Verify no stray reference and record the tarball-app follow-up if it happened**

```bash
grep -n "@wellsfargo-starui/icons-svg" CLAUDE.md docs/PACKAGE_ORGANIZATION.md docs/current-features.md
```

Expected: no matches (or only in unrelated historical context you did not intend to touch — read whatever it prints).

- [ ] **Step 7: Update `docs/WORKLOG.md` item 11**

Find the item 11 section's phase-2 status (it currently ends with the "Folder-move stage: done" / "What remains" / "Still true" text from phase 1's close-out). Add a new status paragraph after "What remains":

```markdown
**Package-collapse sub-phase 1: done.** `design-system` + `icons-svg`
collapsed into one `@wellsfargo-starui/design-system` package (20
tarballs, was 21). No source moved — only per-member `package.json`,
`vitest.config.ts`, and `turbo.json` were removed in favor of one set
at the bucket root. `@wellsfargo-starui/icons-svg`'s public API moved
to new `./icons*` subpaths; 9 consumer import sites across
`openfin-platform`, `workspace-setup-react`, and `grid` were migrated.
Per the design spec at
[`docs/superpowers/specs/2026-08-01-package-collapse-design-system-design.md`](./superpowers/specs/2026-08-01-package-collapse-design-system-design.md),
the coverage-tooling two-level-scan gap is an accepted interim state,
not fixed here. **[If Task 1 Step 14 found a stale `icons-svg`
dependency in the apps repo's `source/star-demo/package.json`, note it
here as a `stern-apps` follow-up — otherwise omit this sentence.]**

**Next:** sub-phase 2 (`openfin` bucket — `host-openfin` +
`openfin-platform`), per the roadmap in the same design spec.
```

Replace the bracketed instruction with either the real follow-up sentence (if Task 1 Step 14 hit that case) or nothing (delete the whole bracketed sentence if it didn't) — this is the one place in this plan where the exact final text depends on what Task 1 actually found, not a fixed diff.

- [ ] **Step 8: Run the in-repo validation gate once more** (docs-only changes, but confirm nothing else drifted)

```bash
npx turbo typecheck build test
```

Expected: all green (same result as Task 1 Step 12 — this step exists to catch anything accidentally touched while editing docs, not to re-verify Task 1's code change).

- [ ] **Step 9: Commit**

```bash
git add CLAUDE.md docs/PACKAGE_ORGANIZATION.md docs/current-features.md docs/WORKLOG.md
git status --short
```

Review before committing: exactly these four files, nothing else.

```bash
git commit -m "$(cat <<'EOF'
docs: close out package-collapse sub-phase 1 (design-system)

Updates CLAUDE.md, PACKAGE_ORGANIZATION.md, and current-features.md
to reflect icons-svg's retirement as a separate npm identity, and
records sub-phase 1's completion in WORKLOG item 11.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Notes

- **Spec coverage:** the design spec's "Target state" section (package identity, version, subpath scheme, merged exports/dependencies, build script shape, consumer migration) maps to Task 1 Steps 1–11. The spec's validation gate maps to Task 1 Steps 12–15. The spec's "Done looks like" checklist maps to Task 1 (tree/tarball-count/import-migration items) and Task 2 (WORKLOG item).
- **Corrected during planning, not just design:** the spec originally said 4 consumer packages / 11 files; grounding against the actual files during planning found `config-browser` was a false positive (comment-only, no import, no dependency) — the spec was corrected to 3 packages / 7 files / 9 import statements before this plan was written, and this plan reflects the corrected count throughout.
- **Convention constraint honored:** no symlink, shim, or compatibility re-export for the retired `icons-svg` name anywhere in Task 1; the "module not found" a stale consumer would hit is the intended signal.
- **Blast radius smaller than phase 1:** a proactive repo-wide grep during planning (learning from phase 1's final review, which caught hardcoded paths in nested build configs) found several files referencing `packages/design-system/design-system` or `packages/design-system/icons-svg` by path (`eslint.config.mjs`, `tools/scripts/check-ds-tokens.ts`, `tools/scripts/audit-contrast.ts`, `scripts/staruiTailwindPreset.cjs`, `scripts/staruiConsumerAliases.mjs`) — all confirmed to need **zero edits**, because this plan's design keeps every member's source/dist tree at its current path; only the package-identity files (`package.json`/`vitest.config.ts`/`turbo.json`) move or delete.
