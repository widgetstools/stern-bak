# Package Collapse Sub-Phase 2 (openfin) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse `packages/openfin/host-openfin` and `packages/openfin/openfin-platform` — currently two separate npm packages — into one published package, `@wellsfargo-starui/openfin`, with `host-openfin`'s single export moving to a new `./host` subpath and `openfin-platform`'s five existing subpaths keeping their names under the new package prefix.

**Architecture:** Both members' `src`/`tsconfig.json`/`scripts` stay exactly where they are — only each member's `package.json` and `vitest.config.ts` are deleted, replaced by one new set at the bucket root (`packages/openfin/`). Because there is no compatibility shim for either retired name, the package-identity change and all 28 consumer files' import-site migration must land in one atomic commit — the repo cannot stay green with only one half applied. Same discipline as sub-phase 1.

**Tech Stack:** npm 10 workspaces, Turborepo 2, TypeScript project references, Vitest 4.

## Global Constraints

- **npm only.** Never `pnpm`/`yarn`, never `--legacy-peer-deps`, never `--force`, never `npm ci`.
- **No bespoke tooling / no compatibility shim.** A consumer that still imports `@wellsfargo-starui/host-openfin` or `@wellsfargo-starui/openfin-platform` after this lands must get a real "module not found," not a silent re-export shim.
- **Member `src`/`tsconfig.json`/`scripts` do not move.** `packages/openfin/host-openfin/src/` and `packages/openfin/openfin-platform/{src,scripts}/` stay at their exact current paths. Only each member's `package.json` and `vitest.config.ts` are removed. Neither member has its own `turbo.json` — nothing to relocate there (verified: `ls packages/openfin/host-openfin packages/openfin/openfin-platform` shows no `turbo.json` in either).
- **Package identity**: name `@wellsfargo-starui/openfin` (new — neither existing name survives), version `0.1.0`.
- **Coverage-tooling gap is accepted, not patched** — same as sub-phase 1, documented in WORKLOG, fixed once in sub-phase 7.
- **`STARUI_PLATFORM` must be set explicitly for every tarball-validation command**, pointed at this worktree's absolute path — plain `npm run setup:tarball`/`build:tarball` in the apps repo silently resolves the platform repo as a sibling directory (the main checkout), not this worktree. This bit sub-phase 1; do not skip it here even if nothing seems wrong.
- **Commit trailer:** ends with `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
- **Repo paths:** platform repo is the working directory. Apps repo is `/Users/develop/wfh/starui-apps` — a sibling checkout, referenced by absolute path, for tarball validation only (this plan never edits files there).

---

### Task 0: Pre-flight — confirm target paths are clean

**Files:** none modified; read-only verification.

**Interfaces:** Gates Task 1.

- [ ] **Step 1: Check git status scoped to every path this plan touches**

```bash
git status --short \
  packages/openfin/host-openfin \
  packages/openfin/openfin-platform \
  package.json \
  packages/react-grid/grid \
  packages/react-grid/widgets-react \
  packages/react-core/host-wrapper-react \
  packages/react-core/workspace-setup-react \
  packages/react-grid/config-browser \
  CLAUDE.md docs/PACKAGE_ORGANIZATION.md docs/current-features.md docs/ARCHITECTURE.md docs/WORKLOG.md
```

- [ ] **Step 2: Handle any output**

If empty, proceed to Task 1. If not empty, resolve per the same order of preference as prior plans: commit unrelated finished work separately first; stash only the affected paths (`git stash push -u -- <paths>`) if it's WIP to resume after; or stop and ask the user if the change looks substantial or its status is unclear. Re-run Step 1 and confirm empty before starting Task 1.

---

### Task 1: Collapse host-openfin + openfin-platform into one package, migrate consumers

**Files:**
- Create: `packages/openfin/package.json`
- Create: `packages/openfin/vitest.config.ts`
- Delete: `packages/openfin/host-openfin/package.json`
- Delete: `packages/openfin/host-openfin/vitest.config.ts`
- Delete: `packages/openfin/openfin-platform/package.json`
- Delete: `packages/openfin/openfin-platform/vitest.config.ts`
- Modify: `package.json:13` (root workspaces array)
- Modify: `packages/react-grid/grid/vitest.config.ts` (alias key rename — this package's own source is also being rewritten, see below)
- Modify: 7 files in `packages/react-grid/grid` and `packages/react-grid/widgets-react` (host-openfin import rewrites)
- Modify: 21 files in `packages/react-core/host-wrapper-react`, `packages/react-core/workspace-setup-react`, `packages/react-grid/config-browser` (openfin-platform import rewrites)
- Modify: `packages/react-grid/widgets-react/src/hosted/useHostedIdentity.ts` and `.../HostedMarketsGrid.tsx` (found during execution: a real dynamic `import(/* @vite-ignore */ '@wellsfargo-starui/openfin-platform/config')` call and two directly-related JSDoc comments — missed by every grep pattern used during design/planning because `/* @vite-ignore */` sits between `import(` and the string literal, breaking the `import\(['"]` regex. widgets-react already declares `@wellsfargo-starui/openfin` as a dependency from Step 9's host-openfin rename, so no package.json change needed — just the string literal and its two explanatory comments)
- Modify: `packages/react-grid/grid/package.json`, `packages/react-grid/widgets-react/package.json`, `packages/react-core/host-wrapper-react/package.json`, `packages/react-core/workspace-setup-react/package.json`, `packages/react-grid/config-browser/package.json` (dependency rename)

**Interfaces:**
- Consumes: nothing from earlier tasks (first substantive task).
- Produces: `@wellsfargo-starui/openfin` resolvable with 6 `exports` subpaths (`.`, `./host`, `./config`, `./plugin`, `./test-bridge`, `./dock-editor`) for Task 2's doc updates and WORKLOG note.

- [ ] **Step 1: Create the merged root `package.json`**

Write `packages/openfin/package.json`:

```json
{
  "name": "@wellsfargo-starui/openfin",
  "version": "0.1.0",
  "private": true,
  "description": "OpenFin RuntimePort plugin + workspace shell (dock, home, notifications, child windows, config import/export). Consolidates host-openfin + openfin-platform.",
  "type": "module",
  "main": "./openfin-platform/dist/index.js",
  "types": "./openfin-platform/dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./openfin-platform/dist/index.d.ts",
      "import": "./openfin-platform/dist/index.js"
    },
    "./host": {
      "types": "./host-openfin/dist/index.d.ts",
      "import": "./host-openfin/dist/index.js"
    },
    "./config": {
      "types": "./openfin-platform/dist/configOnly.d.ts",
      "import": "./openfin-platform/dist/configOnly.js"
    },
    "./plugin": {
      "types": "./openfin-platform/dist/plugin.d.ts",
      "import": "./openfin-platform/dist/plugin.js"
    },
    "./test-bridge": {
      "types": "./openfin-platform/dist/testBridge/index.d.ts",
      "import": "./openfin-platform/dist/testBridge/index.js"
    },
    "./dock-editor": {
      "types": "./openfin-platform/dist/dockEditor/index.d.ts",
      "import": "./openfin-platform/dist/dockEditor/index.js"
    }
  },
  "files": [
    "host-openfin/dist",
    "openfin-platform/dist"
  ],
  "scripts": {
    "build": "rimraf host-openfin/dist host-openfin/tsconfig.tsbuildinfo openfin-platform/dist openfin-platform/tsconfig.tsbuildinfo && tsc --project host-openfin/tsconfig.json && tsc --project openfin-platform/tsconfig.json && node openfin-platform/scripts/copy-assets.mjs",
    "typecheck": "tsc --noEmit --project host-openfin/tsconfig.json && tsc --noEmit --project openfin-platform/tsconfig.json",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@wellsfargo-starui/design-system": "*",
    "@wellsfargo-starui/host": "*",
    "@wellsfargo-starui/host-browser": "*",
    "@wellsfargo-starui/host-config": "*",
    "@wellsfargo-starui/host-data": "*",
    "@wellsfargo-starui/types": "*"
  },
  "peerDependencies": {
    "@openfin/core": "43.101.2",
    "@openfin/workspace": "23.0.20",
    "@openfin/workspace-platform": "23.0.20"
  },
  "peerDependenciesMeta": {
    "@openfin/core": {
      "optional": true
    },
    "@openfin/workspace": {
      "optional": true
    },
    "@openfin/workspace-platform": {
      "optional": true
    }
  },
  "devDependencies": {
    "@openfin/core": "43.101.2",
    "@openfin/workspace": "23.0.20",
    "@openfin/workspace-platform": "23.0.20",
    "jsdom": "^29.0.2",
    "rimraf": "^6.0.1",
    "typescript": "~5.9.3",
    "vitest": "^4.1.4"
  },
  "sideEffects": [
    "*.css"
  ]
}
```

This is the union of both members' original fields, following sub-phase 1's exact pattern: 6 `exports` entries (`host-openfin`'s single `.` renested under `./host`; `openfin-platform`'s 5 entries unchanged in name, `openfin-platform`'s `.` becomes the merged package's `.`), merged `dependencies`/`peerDependencies`/`devDependencies` (no version conflicts — every shared entry between the two originals matched exactly), and a `build` script that runs both members' original build commands back to back against their own unmodified `tsconfig.json`/`scripts`.

- [ ] **Step 2: Delete both members' own `package.json`**

```bash
git rm packages/openfin/host-openfin/package.json
git rm packages/openfin/openfin-platform/package.json
```

- [ ] **Step 3: Create the merged `vitest.config.ts`**

Write `packages/openfin/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';
import { coverage } from '../../scripts/vitestCoverage.mjs';

/**
 * Vitest config for `@wellsfargo-starui/openfin`.
 *
 * Runs in `jsdom` so the workspace-persistence override can use a fetch-
 * style URL parser when extracting instanceIds, and so any DOM-shape test
 * helpers work. The OpenFin runtime (`fin` global) and the parent
 * WorkspacePlatformProvider class are stubbed per-test — we never spin up
 * a real OpenFin platform during unit tests.
 */
export default defineConfig({
  test: {
    coverage: coverage({
      include: [
        'host-openfin/src/**/*.{ts,tsx}',
        'openfin-platform/src/**/*.{ts,tsx}',
      ],
    }),
    environment: 'jsdom',
    globals: true,
    include: [
      'host-openfin/src/**/*.test.ts',
      'openfin-platform/src/**/*.test.ts',
    ],
    css: false,
  },
});
```

Base settings come from `openfin-platform`'s original config (the more heavily-documented and more heavily-used one). `host-openfin`'s original `globals: false` is not a real conflict with `globals: true` — the latter only adds implicit `describe`/`it`/`expect`, it doesn't remove `host-openfin`'s tests' existing explicit imports, so no per-file override is needed (unlike sub-phase 1's genuine `jsdom` vs `node` conflict). The import path is `../../scripts/vitestCoverage.mjs` (two levels up from `packages/openfin/`), matching the depth sub-phase 1 established for a bucket-root config.

- [ ] **Step 4: Delete both members' own `vitest.config.ts`**

```bash
git rm packages/openfin/host-openfin/vitest.config.ts
git rm packages/openfin/openfin-platform/vitest.config.ts
```

- [ ] **Step 5: Fix the root `package.json` workspaces array**

`"packages/openfin/*"` is a glob matching subdirectories one level under `packages/openfin/` — after this collapse, neither member has a `package.json` anymore, so the glob would match zero packages. Replace with a literal single-package entry, same pattern as `packages/design-system` after sub-phase 1.

```diff
   "workspaces": [
     "packages/design-system",
     "packages/react-ui/*",
     "packages/react-grid/*",
     "packages/data/host-data",
-    "packages/openfin/*",
+    "packages/openfin",
     "packages/react-core/*",
     "packages/shared/*"
   ],
```

- [ ] **Step 6: Fix `grid`'s hardcoded Vite alias for host-openfin**

`packages/react-grid/grid/vitest.config.ts` has a hardcoded `resolve.alias` entry keyed on the OLD specifier `@wellsfargo-starui/host-openfin`. Since Step 9 below rewrites `grid`'s own source to import `@wellsfargo-starui/openfin/host` instead, this alias's *key* must change to match (the *target* file doesn't move, so the replacement path is unchanged):

```diff
       { find: '@wellsfargo-starui/types', replacement: resolve(__dirname, '../../shared/types/src/index.ts') },
-      { find: '@wellsfargo-starui/host-openfin', replacement: resolve(__dirname, '../../openfin/host-openfin/src/index.ts') },
+      { find: '@wellsfargo-starui/openfin/host', replacement: resolve(__dirname, '../../openfin/host-openfin/src/index.ts') },
       { find: '@wellsfargo-starui/host', replacement: resolve(__dirname, '../../shared/host/src/index.ts') },
```

(Confirmed via repo-wide grep: no other package's `vite.config.ts`/`vitest.config.ts` has a hardcoded alias for either `host-openfin` or `openfin-platform` — only `grid`'s does, plus `openfin-platform`'s own file, which is being deleted entirely in Step 4.)

- [ ] **Step 7: Rewrite the 7 `host-openfin` import statements**

`packages/react-grid/grid/src/widget/useRestoreCellFocusOnWindowFocus.ts`:
```diff
-} from '@wellsfargo-starui/host-openfin';
+} from '@wellsfargo-starui/openfin/host';
```

`packages/react-grid/grid/src/customizer/modules/alerts/useAlertsOpenFinBridge.ts`:
```diff
-} from '@wellsfargo-starui/host-openfin';
+} from '@wellsfargo-starui/openfin/host';
```

`packages/react-grid/grid/src/customizer/modules/alerts/useAlertsOpenFinBridge.test.tsx`:
```diff
-vi.mock('@wellsfargo-starui/host-openfin', () => ({
+vi.mock('@wellsfargo-starui/openfin/host', () => ({
```

`packages/react-grid/grid/src/runtime/openFin.ts`:
```diff
-} from '@wellsfargo-starui/host-openfin';
+} from '@wellsfargo-starui/openfin/host';
```

`packages/react-grid/widgets-react/src/hosted/useGridLinkNotifications.ts`:
```diff
-} from '@wellsfargo-starui/host-openfin';
+} from '@wellsfargo-starui/openfin/host';
```

`packages/react-grid/widgets-react/src/hosted/useGridLinkNotifications.test.tsx`:
```diff
-vi.mock('@wellsfargo-starui/host-openfin', () => ({
+vi.mock('@wellsfargo-starui/openfin/host', () => ({
```

`packages/react-grid/widgets-react/src/hosted/windowOptionsSubscription.ts`:
```diff
-} from '@wellsfargo-starui/host-openfin';
+} from '@wellsfargo-starui/openfin/host';
```

Leave every comment-only mention of `@wellsfargo-starui/host-openfin` untouched (e.g. the docblocks in `useRestoreCellFocusOnWindowFocus.ts`, `useAlertsOpenFinBridge.ts`, `useGridLinkNotifications.ts`) — historical/explanatory prose, not live references, out of scope.

- [ ] **Step 8: Rewrite the `openfin-platform` import statements (21 files, 35 real statements)**

Every occurrence of `@wellsfargo-starui/openfin-platform` becomes `@wellsfargo-starui/openfin` — subpath suffixes (`/config`, `/test-bridge`, `/dock-editor`) are unchanged, only the package-name prefix changes. Files with a bare (no-subpath) reference become the bare `@wellsfargo-starui/openfin` name.

`packages/react-core/host-wrapper-react/src/test-bridge/install.ts`:
```diff
-export { installTestBridge } from '@wellsfargo-starui/openfin-platform/test-bridge';
+export { installTestBridge } from '@wellsfargo-starui/openfin/test-bridge';
```

`packages/react-core/workspace-setup-react/src/ImportConfig.test.tsx` (3 occurrences, lines 4/18/19):
```diff
-import type { ImportConfigBundleResult } from '@wellsfargo-starui/openfin-platform/config';
+import type { ImportConfigBundleResult } from '@wellsfargo-starui/openfin/config';
```
```diff
-vi.mock('@wellsfargo-starui/openfin-platform/config', async (importOriginal) => {
-  const actual = await importOriginal<typeof import('@wellsfargo-starui/openfin-platform/config')>();
+vi.mock('@wellsfargo-starui/openfin/config', async (importOriginal) => {
+  const actual = await importOriginal<typeof import('@wellsfargo-starui/openfin/config')>();
```

`packages/react-core/workspace-setup-react/src/WorkspaceSetup.tsx`:
```diff
-} from "@wellsfargo-starui/openfin-platform/config";
+} from "@wellsfargo-starui/openfin/config";
```

`packages/react-core/workspace-setup-react/src/ImportConfig.tsx`:
```diff
-} from "@wellsfargo-starui/openfin-platform/config";
+} from "@wellsfargo-starui/openfin/config";
```

`packages/react-core/workspace-setup-react/src/WorkspaceSetup.test.tsx` (6 occurrences, lines 4/39/40/44/45/52):
```diff
-import type { RegistryEntry } from '@wellsfargo-starui/openfin-platform/config';
+import type { RegistryEntry } from '@wellsfargo-starui/openfin/config';
```
```diff
-vi.mock('@wellsfargo-starui/openfin-platform/config', async (importOriginal) => ({
-  ...(await importOriginal<typeof import('@wellsfargo-starui/openfin-platform/config')>()),
+vi.mock('@wellsfargo-starui/openfin/config', async (importOriginal) => ({
+  ...(await importOriginal<typeof import('@wellsfargo-starui/openfin/config')>()),
```
```diff
-vi.mock('@wellsfargo-starui/openfin-platform', async () => ({
-  ...(await import('@wellsfargo-starui/openfin-platform/config')),
+vi.mock('@wellsfargo-starui/openfin', async () => ({
+  ...(await import('@wellsfargo-starui/openfin/config')),
```
```diff
-const { ACTION_LAUNCH_COMPONENT } = await import('@wellsfargo-starui/openfin-platform/config');
+const { ACTION_LAUNCH_COMPONENT } = await import('@wellsfargo-starui/openfin/config');
```

`packages/react-core/workspace-setup-react/src/components/workspace-setup/InspectorPane.tsx` (2 occurrences, lines 26/30 — both identical text, use `replace_all`):
```diff
-} from "@wellsfargo-starui/openfin-platform/config";
+} from "@wellsfargo-starui/openfin/config";
```

`packages/react-core/workspace-setup-react/src/components/workspace-setup/ComponentsPane.tsx`:
```diff
-import type { RegistryEntry } from "@wellsfargo-starui/openfin-platform/config";
+import type { RegistryEntry } from "@wellsfargo-starui/openfin/config";
```

`packages/react-core/workspace-setup-react/src/components/workspace-setup/ComponentsPane.test.tsx`:
```diff
-import type { RegistryEntry } from '@wellsfargo-starui/openfin-platform/config';
+import type { RegistryEntry } from '@wellsfargo-starui/openfin/config';
```

`packages/react-core/workspace-setup-react/src/components/workspace-setup/DockPane.tsx` (2 occurrences, lines 31/32):
```diff
-} from "@wellsfargo-starui/openfin-platform/config";
-import { ACTION_LAUNCH_COMPONENT } from "@wellsfargo-starui/openfin-platform/config";
+} from "@wellsfargo-starui/openfin/config";
+import { ACTION_LAUNCH_COMPONENT } from "@wellsfargo-starui/openfin/config";
```

`packages/react-core/workspace-setup-react/src/components/workspace-setup/types.ts`:
```diff
-import type { RegistryEntry } from '@wellsfargo-starui/openfin-platform/config';
+import type { RegistryEntry } from '@wellsfargo-starui/openfin/config';
```

`packages/react-core/workspace-setup-react/src/components/workspace-setup/DockPane.test.tsx` (2 occurrences, lines 8/9):
```diff
-} from '@wellsfargo-starui/openfin-platform/config';
-import { ACTION_LAUNCH_COMPONENT } from '@wellsfargo-starui/openfin-platform/config';
+} from '@wellsfargo-starui/openfin/config';
+import { ACTION_LAUNCH_COMPONENT } from '@wellsfargo-starui/openfin/config';
```

`packages/react-core/workspace-setup-react/src/components/workspace-setup/InspectorPane.test.tsx` (2 occurrences, lines 7/8):
```diff
-} from '@wellsfargo-starui/openfin-platform/config';
-import { ACTION_LAUNCH_COMPONENT } from '@wellsfargo-starui/openfin-platform/config';
+} from '@wellsfargo-starui/openfin/config';
+import { ACTION_LAUNCH_COMPONENT } from '@wellsfargo-starui/openfin/config';
```

`packages/react-core/workspace-setup-react/src/registry/useRegistryEditor.ts` (bare import — no subpath, per WORKLOG item 7c's pre-existing note this is a known-not-ideal pattern, carried forward as-is):
```diff
-} from "@wellsfargo-starui/openfin-platform";
+} from "@wellsfargo-starui/openfin";
```

`packages/react-core/workspace-setup-react/src/hooks/useDockEditor.ts`:
```diff
-} from "@wellsfargo-starui/openfin-platform/config";
+} from "@wellsfargo-starui/openfin/config";
```

`packages/react-core/workspace-setup-react/src/components/dock-editor/iconUtils.ts`:
```diff
-} from '@wellsfargo-starui/openfin-platform/dock-editor';
+} from '@wellsfargo-starui/openfin/dock-editor';
```

`packages/react-core/workspace-setup-react/src/components/dock-editor/icons.ts`:
```diff
-} from '@wellsfargo-starui/openfin-platform/dock-editor';
+} from '@wellsfargo-starui/openfin/dock-editor';
```

`packages/react-core/workspace-setup-react/src/hooks/useDockEditor.test.ts`:
```diff
-vi.mock('@wellsfargo-starui/openfin-platform/config', () => ({
+vi.mock('@wellsfargo-starui/openfin/config', () => ({
```

`packages/react-core/workspace-setup-react/src/registry/useRegistryEditor.test.ts` (4 real occurrences — line 13 is a comment, leave untouched):
```diff
-import type { RegistryEntry } from '@wellsfargo-starui/openfin-platform/config';
+import type { RegistryEntry } from '@wellsfargo-starui/openfin/config';
```
```diff
-vi.mock('@wellsfargo-starui/openfin-platform', async () => {
-  const config = await import('@wellsfargo-starui/openfin-platform/config');
+vi.mock('@wellsfargo-starui/openfin', async () => {
+  const config = await import('@wellsfargo-starui/openfin/config');
```
```diff
-const { REGISTRY_CONFIG_VERSION } = await import('@wellsfargo-starui/openfin-platform/config');
+const { REGISTRY_CONFIG_VERSION } = await import('@wellsfargo-starui/openfin/config');
```

`packages/react-grid/config-browser/src/ConfigBrowser.test.tsx`:
```diff
-vi.mock('@wellsfargo-starui/openfin-platform/config', () => ({
+vi.mock('@wellsfargo-starui/openfin/config', () => ({
```

`packages/react-grid/config-browser/src/hooks/useConfigBrowser.ts`:
```diff
-} from "@wellsfargo-starui/openfin-platform/config";
+} from "@wellsfargo-starui/openfin/config";
```

`packages/react-grid/config-browser/src/hooks/useConfigBrowser.test.ts`:
```diff
-vi.mock('@wellsfargo-starui/openfin-platform/config', () => ({
+vi.mock('@wellsfargo-starui/openfin/config', () => ({
```

- [ ] **Step 9: Rename the dependency declaration in each of the 5 consumer `package.json`s**

`packages/react-grid/grid/package.json`:
```diff
-    "@wellsfargo-starui/host-openfin": "*",
+    "@wellsfargo-starui/openfin": "*",
```

`packages/react-grid/widgets-react/package.json`:
```diff
-    "@wellsfargo-starui/host-openfin": "*",
+    "@wellsfargo-starui/openfin": "*",
```

`packages/react-core/host-wrapper-react/package.json`:
```diff
-    "@wellsfargo-starui/openfin-platform": "*",
+    "@wellsfargo-starui/openfin": "*",
```

`packages/react-core/workspace-setup-react/package.json`:
```diff
-    "@wellsfargo-starui/openfin-platform": "*",
+    "@wellsfargo-starui/openfin": "*",
```

`packages/react-grid/config-browser/package.json`:
```diff
-    "@wellsfargo-starui/openfin-platform": "*",
+    "@wellsfargo-starui/openfin": "*",
```

(Each file has exactly one line to change — no duplicate `openfin-platform`/`host-openfin` entries in any of these five, unlike `grid`'s multiple `design-system` lines in sub-phase 1.)

- [ ] **Step 10: `tools/scripts/check-ds-tokens.ts` needs no change**

Its `ALLOW_PATHS` entry `'packages/openfin/openfin-platform/src/'` remains a valid path — no source moved. Confirmed by reading the file; no edit needed. Recorded here so the next engineer doesn't go looking for a break that isn't there.

- [ ] **Step 11: Refresh workspace symlinks and confirm no leftover reference**

```bash
npm install
grep -rn "@wellsfargo-starui/host-openfin\|@wellsfargo-starui/openfin-platform" packages/ --include="*.ts" --include="*.tsx" \
  | grep -vE "^packages/openfin/(host-openfin|openfin-platform)/"
```

Expected: `npm install` completes cleanly. The grep's remaining output should contain only comment/docblock mentions (e.g. the architecture-boundary comments in `useAlertsOpenFinBridge.ts`, `useGridLinkNotifications.ts`, `useRestoreCellFocusOnWindowFocus.ts`, `useRegistryEditor.test.ts`, `ConfigManager.ts`, `profileStorage.identity.test.ts`, `engine/index.ts`) — no real `import`/`vi.mock`/dynamic-`import()` statement. If a real one shows up, it was missed — fix it before continuing. **This is exactly the gate that caught a real miss during this plan's own execution**: `widgets-react/src/hosted/useHostedIdentity.ts` had a dynamic `import(/* @vite-ignore */ '@wellsfargo-starui/openfin-platform/config')` that every narrower design-time grep pattern missed (the comment between `import(` and the string broke those regexes) — this bare-string grep caught it immediately. Trust this step, not the earlier per-file list, as the final word on completeness.

```bash
ls node_modules/@wellsfargo-starui/host-openfin node_modules/@wellsfargo-starui/openfin-platform 2>&1
```

Expected: both `No such file or directory`.

- [ ] **Step 12: Run the in-repo validation gate**

```bash
npx turbo typecheck build test
```

Expected: all green.

- [ ] **Step 13: Run the cycle checker and the design-tokens check**

```bash
npm run check:deps
npm run check:ds-tokens
```

Expected: `check:deps` reports no cycles. `check:ds-tokens` output is unchanged from its pre-existing baseline (272 issues, per sub-phase 1's confirmed count — this sub-phase touches no styling/color code).

- [ ] **Step 14: Pack and validate against the tarball apps**

```bash
npm run pack:npm
ls dist-npm/*.tgz | wc -l
```

Expected: **19** tarballs (was 20 after sub-phase 1).

```bash
cd /Users/develop/wfh/starui-apps
STARUI_PLATFORM=<this-worktree-absolute-path> npm run setup:tarball
STARUI_PLATFORM=<this-worktree-absolute-path> npm run build:tarball
cd -
```

(Replace `<this-worktree-absolute-path>` with the actual path — check `pwd` in the platform repo first. Do not omit `STARUI_PLATFORM`; sub-phase 1 found that omitting it silently vendors the main checkout's stale tarballs instead of this worktree's freshly-packed ones.)

Expected: `setup:tarball`'s cleanup step removes the stale `vendor/wellsfargo-starui-host-openfin.tgz` and `vendor/wellsfargo-starui-openfin-platform.tgz` automatically.

**What actually happened when this plan was executed, more severe than anticipated:** `build:tarball` failed in **5 of 6** apps with `npm error 404 ... '@wellsfargo-starui/openfin@^0.1.0' is not in this registry`. Root cause: each tarball app's generated `package.json` has an `overrides` block pinning every `@wellsfargo-starui/*` name to its vendor tarball (required because none are published to a real registry — see the comment block in `starui-apps/scripts/makeTarballApp.mjs` around `overrides`). That block is auto-generated from the *current* `vendor/` contents, but hadn't been regenerated since before this sub-phase — so it was missing the brand-new `@wellsfargo-starui/openfin` entry entirely (a stale-*dependency-line* issue, not the softer stale-single-app issue this plan originally anticipated). Fix: run `npm run make:tarball-apps` **in the apps repo** — its own documented regeneration command, which rescans the already-correct `vendor/` directory and rewrites every app's `overrides`+`dependencies`. This is running the apps repo's own designed maintenance tooling, not a hand patch; confirmed with the user before running since it modifies files in a sibling repo. After regenerating and re-running `setup:tarball`, **5 of 6** apps built clean. The 6th, `star-demo`, failed for a *different*, genuinely out-of-scope reason: `source/star-demo/src/main.tsx` (real application source in the apps repo, not a generated file) directly imports `@wellsfargo-starui/host-openfin` — confirmed via direct inspection of the source file, not just the generated tarball copy. This is real apps-repo application code needing its own follow-up; per this plan's boundary, it is not fixed here — noted for Task 2's WORKLOG update. 5/6 apps building clean (spanning every other consumer of the collapsed package) is sufficient confirmation that the collapse itself is correctly externally-installable.

- [ ] **Step 15: Manual resolution spot-check on the packed tarball**

```bash
tar -xOzf dist-npm/wellsfargo-starui-openfin-0.1.0.tgz package/package.json | grep -A3 '"./host"'
tar -tzf dist-npm/wellsfargo-starui-openfin-0.1.0.tgz | grep -E "host-openfin/dist/index|openfin-platform/dist/configOnly"
```

Expected: the `exports` entry for `./host` is present in the packed `package.json`, and both a host-openfin compiled file (`host-openfin/dist/index.js`) and an openfin-platform compiled file (`openfin-platform/dist/configOnly.js`) are present in the tarball.

- [ ] **Step 16: Commit**

```bash
git add packages/openfin package.json \
  packages/react-grid/grid \
  packages/react-grid/widgets-react \
  packages/react-core/host-wrapper-react \
  packages/react-core/workspace-setup-react \
  packages/react-grid/config-browser
git status --short
```

Review the output before committing: `packages/openfin/host-openfin/{package.json,vitest.config.ts}` and `packages/openfin/openfin-platform/{package.json,vitest.config.ts}` deleted; `packages/openfin/{package.json,vitest.config.ts}` added; the 28 import-site files, `grid/vitest.config.ts`, root `package.json`, and 5 consumer `package.json`s modified — nothing else.

```bash
git commit -m "$(cat <<'EOF'
refactor(packages): collapse host-openfin and openfin-platform into one package

Sub-phase 2 of the 21-package.json-to-7 collapse (WORKLOG #11 phase 2).
Retires both the @wellsfargo-starui/host-openfin and
@wellsfargo-starui/openfin-platform npm identities in favor of a new
@wellsfargo-starui/openfin package — host-openfin's single export moves
to a new ./host subpath; openfin-platform's five existing subpaths
(., /config, /plugin, /test-bridge, /dock-editor) keep their names
under the new prefix. No source files moved. Migrates all 28 real
import sites across grid, widgets-react, host-wrapper-react,
workspace-setup-react, and config-browser, plus a hardcoded Vite
alias in grid's own vitest.config.ts.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Documentation updates and WORKLOG close-out

**Files:**
- Modify: `CLAUDE.md` (bucket table, `@openfin/core` import rule)
- Modify: `docs/PACKAGE_ORGANIZATION.md` (bucket table)
- Modify: `docs/ARCHITECTURE.md` (bucket line, two import-rule lines)
- Modify: `docs/current-features.md` (§ 7.1 and § 7.2 headers)
- Modify: `docs/WORKLOG.md` (item 11 progress note)

**Interfaces:**
- Consumes: Task 1's completed collapse (package name, new `./host` subpath).
- Produces: nothing further tasks depend on; final task in this sub-phase's plan.

- [ ] **Step 1: Update `CLAUDE.md`'s bucket table**

```diff
-| 5 | OpenFin Utils | `openfin/` | `host-openfin`, `openfin-platform` |
+| 5 | OpenFin Utils | `openfin/` | `openfin` |
```

- [ ] **Step 2: Update `CLAUDE.md`'s `@openfin/core` import rule**

```diff
-- Only `host-openfin` and `openfin-platform` may import from `@openfin/core`.
+- Only `@wellsfargo-starui/openfin` may import from `@openfin/core`.
```

- [ ] **Step 3: Update `docs/PACKAGE_ORGANIZATION.md`'s bucket table**

```diff
-| 5 | **OpenFin Utils** | `packages/openfin/` | `@wellsfargo-starui/host-openfin`, `@wellsfargo-starui/openfin-platform` |
+| 5 | **OpenFin Utils** | `packages/openfin/` | `@wellsfargo-starui/openfin` |
```

- [ ] **Step 4: Update `docs/ARCHITECTURE.md`'s bucket line and import rules**

```diff
-packages/openfin/         — (7) host-openfin, openfin-platform
+packages/openfin/         — (7) @wellsfargo-starui/openfin
```

```diff
-- `grid` must not import `@openfin/*` — OpenFin lives in `host-openfin`
-- `host-openfin` is optional; browser-only apps never import it
+- `grid` must not import `@openfin/*` — OpenFin lives in `@wellsfargo-starui/openfin`
+- `@wellsfargo-starui/openfin`'s OpenFin peer deps are optional; browser-only apps never import them
```

- [ ] **Step 5: Update `docs/current-features.md` § 7.1 and § 7.2 headers**

`§ 7.1`'s bullet lists describe symbols directly (no explicit subpath enumeration, since `host-openfin` only ever had one export) — only the header changes; the `**Path:**` line stays accurate (source unchanged):

```diff
-### 7.1 `@wellsfargo-starui/host-openfin`
+### 7.1 Host runtime (`@wellsfargo-starui/openfin/host`)
```

`§ 7.2`'s "Public exports" bullet list (`.`, `./config`, `./plugin`, `./test-bridge`, `./dock-editor`) is unchanged text — those subpath names don't change, only the package prefix does. Only the header changes:

```diff
-### 7.2 `@wellsfargo-starui/openfin-platform`
+### 7.2 `@wellsfargo-starui/openfin`
```

(Read the actual current file content around these headings first — line numbers may have shifted; locate by heading text, not line number alone.)

- [ ] **Step 6: Verify no stray reference**

```bash
grep -n "@wellsfargo-starui/host-openfin\|@wellsfargo-starui/openfin-platform" CLAUDE.md docs/PACKAGE_ORGANIZATION.md docs/ARCHITECTURE.md docs/current-features.md
```

Expected: no matches. If something prints, read it — it may be a legitimate historical mention outside the sections this task touches; only fix it if it's describing current state incorrectly.

- [ ] **Step 7: Update `docs/WORKLOG.md` item 11**

Find the paragraph sub-phase 1 added ("**Package-collapse sub-phase 1: done.**" ... "**Next:** sub-phase 2..."). Replace the "**Next:**" line with a new status paragraph:

```diff
-**Next:** sub-phase 2 (`openfin` bucket — `host-openfin` +
-`openfin-platform`), per the roadmap in
-[`docs/superpowers/specs/2026-08-01-package-collapse-design-system-design.md`](./superpowers/specs/2026-08-01-package-collapse-design-system-design.md).
+**Package-collapse sub-phase 2: done.** `host-openfin` +
+`openfin-platform` collapsed into one `@wellsfargo-starui/openfin`
+package (19 tarballs, was 20). Both prior npm identities retired —
+`host-openfin`'s single export moved to `./host`; `openfin-platform`'s
+five subpaths kept their names under the new prefix. 28 consumer
+import sites across `grid`, `widgets-react`, `host-wrapper-react`,
+`workspace-setup-react`, and `config-browser` were migrated, plus a
+hardcoded Vite alias in `grid`'s own `vitest.config.ts`. Per the design
+spec at
+[`docs/superpowers/specs/2026-08-01-package-collapse-openfin-design.md`](./superpowers/specs/2026-08-01-package-collapse-openfin-design.md),
+the coverage-tooling gap remains accepted, not fixed here.
+
+**Next:** sub-phase 3 (`data` bucket — `host-data` alone, the
+trivial single-member case), per the roadmap in
+[`docs/superpowers/specs/2026-08-01-package-collapse-design-system-design.md`](./superpowers/specs/2026-08-01-package-collapse-design-system-design.md).
```

If Task 1 Step 14 found a stale apps-repo dependency reference (mirroring sub-phase 1's `star-demo` finding), add one more sentence noting it as a non-blocking `stern-apps` follow-up — otherwise omit.

- [ ] **Step 8: Run the in-repo validation gate once more**

```bash
npx turbo typecheck build test
```

Expected: all green (docs-only changes — this step catches anything accidentally touched while editing docs).

- [ ] **Step 9: Commit**

```bash
git add CLAUDE.md docs/PACKAGE_ORGANIZATION.md docs/ARCHITECTURE.md docs/current-features.md docs/WORKLOG.md
git status --short
```

Review before committing: exactly these five files, nothing else.

```bash
git commit -m "$(cat <<'EOF'
docs: close out package-collapse sub-phase 2 (openfin)

Updates CLAUDE.md, PACKAGE_ORGANIZATION.md, ARCHITECTURE.md, and
current-features.md to reflect host-openfin and openfin-platform's
retirement in favor of @wellsfargo-starui/openfin, and records
sub-phase 2's completion in WORKLOG item 11.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Notes

- **Spec coverage:** the design spec's "Target state" section (package identity, exports scheme, dependency merge, build/vitest shape, consumer migration) maps to Task 1 Steps 1–10. The spec's validation gate maps to Steps 11–15. The spec's "Done looks like" checklist maps to Task 1 (tree/tarball-count/import-migration) and Task 2 (WORKLOG item).
- **Proactive sweep already applied**, learning from sub-phase 1's two rounds of execution-time discoveries: checked `check-ds-tokens.ts` (no change needed, confirmed), root `package.json` devDependencies (no reference, confirmed), and every `vite.config.ts`/`vitest.config.ts` repo-wide for hardcoded aliases (found and fixed the one in `grid`'s own config — the same class of bug sub-phase 1 found reactively, caught proactively here instead).
- **Type/name consistency:** `@wellsfargo-starui/openfin` used consistently across Task 1 (package.json, exports, consumer rewrites) and Task 2 (docs). Subpath names (`./host`, `./config`, `./plugin`, `./test-bridge`, `./dock-editor`) consistent throughout. Tarball counts (19) consistent between Task 1 Step 14 and Task 2's WORKLOG text.
- **Convention constraint honored:** no symlink, shim, or compatibility re-export for either retired name.
- **Corrected during planning:** the spec's hand-counted "20 files / ~27 total" was off by one file (workspace-setup-react has 17 affected files, not 16) — verified programmatically via grep rather than manual recount, corrected to 21 files / 35 statements for `openfin-platform`, 28 total combined with `host-openfin`'s 7. The per-file diffs in Steps 7–8 were already complete and correct; only the summary counts needed fixing. Both this plan and the spec were corrected to match.
