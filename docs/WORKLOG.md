# Worklog — outstanding items

Single index of known-open work in this repo — which, since 2026-08-02, again
includes the consumer/demo apps: the `stern-apps` repo was merged back
under [`apps/`](../apps) (git subtree, history preserved) once every package
held the 70% per-file coverage bar. Older entries that say "stern-apps" refer
to what is now the `apps/` tree; the separate remote is historical.

Each entry states what is wrong, why it was left, and what "done" looks like, so
it can be picked up cold. Close an item by deleting its section in the same
change that fixes it.

Last updated: 2026-09-11.

---

## 1. ~34 e2e specs target the deleted `demo-react`

**Area:** `apps/e2e` · **Blocked on:** a product decision, not a fix
**Detail:** [`apps/E2E_STATUS.md`](../apps/E2E_STATUS.md)

The app curation deleted `demo-react`, which was the suite's default `baseURL`
target. Only 13 of the 47 remaining specs pin their own port; the rest inherited
that default and are written against demo-react's markup — they wait on
`[data-grid-id="demo-blotter-v2"]`, which `star-demo` does not have. The
`baseURL` now points at star-demo (`:5175`), so they fail at setup rather than
silently passing.

**Measured baseline (first ever recorded):** 374 tests / 47 files →
**10 passed, 2 skipped, 362 failed**, 19.9 min.

**Important caveat on that number:** no pass/fail baseline for this suite was
ever recorded before the split. The old `docs/E2E_STATUS.md` carried an unfilled
*"Record the resulting N passed / M failed here"* placeholder and warned that its
headline figure was a *collection* count, not a pass count — so "398 tests" never
meant 398 passing. Specs pinned to surviving apps also fail (e.g. `v2-alerts` on
markets-grid-lab times out on `[role="tab"]`), and it is **not established**
whether the split caused that or it was already red.

**Done looks like** one of:
- give star-demo the surface the specs expect (a `demo-blotter-v2` grid, matching
  routes/fixtures) — most specs then pass unchanged, but it is a decision about
  what star-demo is *for*;
- rewrite the ~34 against star-demo's actual UI — honest, ~34 specs of work;
- delete them, accepting the coverage loss (much of it may belong as unit tests
  in `grid`, which already carries 697).

**To attribute the rest properly**, run the suite against `80ab02a` (before any
app was deleted) and diff. Nobody has.

**Also here:** `e2e-openfin/` came across pointing at `e2e-openfin-workspace`,
which was deleted. star-demo is itself an OpenFin app with a `launch.mjs` and
manifest, so retargeting is plausible but unverified. And
`apps/e2e/visual-reference-capture.spec.ts` is demo-react-bound too (boots via
the `demo-blotter-v2` selector) and its default output path
(`process.cwd()/docs/visual-reference/v1`) is wrong now that Playwright runs
from `apps/` — the checked-in snapshots it once produced were dropped from
`docs/` (2026-08-02); regenerating requires retargeting this spec as part of
the same decision.

---

## 3. `host-data-angular` is the last Angular package

**Repo:** stern-bak · **Blocked on:** nothing — needs a decision only

`packages/data/host-data-angular` survived the bucket deletion in `47c802a`
because it sits in the `data` bucket. It is excluded from the pipeline:
out of the root `workspaces`, and skipped by `SKIP_MEMBERS` in
`scripts/pack-npm.mjs` and `ANGULAR_MEMBERS` in
`scripts/gen-consumer-tsconfig.mjs`.

Its `tsconfig.json` used to extend `angular-core/tsconfig.angular.json`; those
three compiler options are now inlined so nothing dangles.

**Done looks like:** either keep it (no action, it costs one skip entry in two
scripts) or delete it — after which both skip mechanisms and the `data` bucket's
individually-listed workspace members can collapse to a `packages/data/*` glob.

---

## 4. 25 icons cannot be recoloured or themed

**Repo:** stern-bak · **Blocked on:** nothing, needs regenerating the SVGs

25 of 113 entries in `packages/design-system/icons-svg/allIcons.ts` hardcode hex
colours (`stroke="#a78bfa"`) instead of `currentColor`, despite that module's own
doc comment claiming otherwise. Consequences:

- `marketIconToDataUrl(key, color)` silently ignores `color` for them
- they cannot follow the light/dark theme ("no hardcoded hex anywhere" is
  the binding rule)

The list is pinned in `allIcons.test.ts` as `KNOWN_HARDCODED_COLOUR`, with a test
that fails if the set grows. **Done looks like** regenerating those SVGs with
`currentColor` and deleting their entries from that list.

## 5. `resolveBrowserIdentity` ignores the userId it is given

**Repo:** stern-bak · **Blocked on:** deciding whether the fix is safe

`packages/core/host-browser/src/identity.ts` hardcodes:

```ts
userId: LOGGED_IN_USER_ID,   // 'dev1'
```

It ignores **both** the `userId` URL param and `IdentityOverrides.userId`, even
though the interface advertises that field and reads every other one from the
same sources. So `new BrowserRuntime({ identity: { userId: 'k151344' } })`
silently yields `'dev1'`.

`userId` scopes profile persistence (`buildGridHostContext` passes it to the
storage factory), so in a browser-hosted app **every user shares one profile
scope**. `LOGGED_IN_USER_ID` is itself marked `@deprecated` in favour of
`PlatformBootstrapConfig.userId`, which suggests this is a leftover.

Pinned in `BrowserRuntime.test.ts` rather than fixed — changing it moves where
existing profiles resolve, which is a migration question, not a one-line edit.

**Done looks like** either honouring `params.get('userId') ?? overrides.userId ??
LOGGED_IN_USER_ID` and accepting the profile-scope move, or removing `userId`
from `IdentityOverrides` so the type stops promising something it does not do.

## 6. Two config factories hand out shared mutable defaults

**Repo:** stern-bak · **Blocked on:** nothing, but each fix needs a caller audit

Surfaced writing the coverage-70 Session 1 tests. Both are the same shape: a
factory that exists to give callers a *safe* object hands back a reference into
module-level state.

- `packages/types/shared-types/src/dockConfig.ts` — `createMenuItem()` does
  `windowOptions: partial?.windowOptions || DEFAULT_WINDOW_OPTIONS`. Every menu
  item created without explicit options aliases the **same** object, so a dock
  editor writing `item.windowOptions.width = 900` resizes every other item that
  took the default. Same for `viewOptions` / `DEFAULT_VIEW_OPTIONS`.
- `packages/types/shared-types/src/dataProvider.ts` —
  `getDefaultProviderConfig()` returns `{ ...DEFAULT_PROVIDER_CONFIGS[type] }`,
  a *shallow* copy. The stomp default's `heartbeat` object and the appdata
  default's `variables` record are still shared, so a provider editor binding a
  form field to `cfg.heartbeat.outgoing` mutates the table for every subsequent
  caller.

Both are pinned as-is in `dockConfig.test.ts` / `dataProvider.test.ts` with a
comment marking them hazards, rather than fixed — a deep clone changes object
identity, and nothing has established whether any caller relies on the current
aliasing (e.g. comparing `item.windowOptions === DEFAULT_WINDOW_OPTIONS` to
detect "unset"). **Done looks like** deep-cloning the defaults in both factories
after grepping the dock editor and the data-provider editor for identity checks.

**Also noticed, lower stakes:** `ConfigManager.userHasPermission(user, p)`
answers from `role.permissionIds` alone and never reads the permissions table,
while `getUserPermissions(user)` drops any id with no row. So a permission whose
definition was deleted still passes the check but is absent from the list. Both
behaviours are pinned in `configManager.authTables.test.ts`; which one is
correct is a product question.

## 7. Three defects in `workspace-setup-react`, all pinned not fixed

**Repo:** stern-bak · **Blocked on:** nothing; each is a small change with a
caller audit attached

Surfaced writing the coverage-70 Session 2 tests. Each is asserted as-is in the
suite with a comment, so a fix flips a test rather than landing silently.

**a. `IconPicker` lists every market icon twice, and search is broken.**
`buildIconList()` concatenates `ICON_META` (tagged `source: 'market'`) with
`ICON_OPTIONS` (tagged `source: 'lucide'` wholesale) — but 80 of
`ICON_OPTIONS`' 140 entries carry `mkt:*` ids, so 72 ids appear in both passes.
Three consequences, all pinned in `IconPicker.test.tsx`:

- `key={icon.id}` is non-unique, React logs *"Encountered two children with the
  same key"*, and the filtered grid cannot reconcile — searching `FileText`
  leaves ~72 non-matching icons on screen. This is the user-visible one.
- The mis-tagged duplicate takes the lucide branch on click and emits
  `https://api.iconify.design/mkt/bond.svg`, which does not exist. Persist that
  into a dock config and the button renders blank.
- The explicit `if (meta.category === "system") continue` skip is defeated:
  `mkt:wrench` and friends come back through the `ICON_OPTIONS` pass.

**Done looks like** deriving `source` from the id prefix rather than from which
list an entry came out of, and de-duplicating by id before render.

**b. `useRegistryEditor.testComponent` never sends a `userId`.** The callback is
`useCallback(..., [])` but reads `hostEnv.userId` from state that is populated
asynchronously, so it closes over the initial `{ appId: '', configServiceUrl: '' }`
forever. `customData.userId` is always `undefined` — the component-host saver
needs it to populate `userId` / `createdBy` / `updatedBy` on a freshly-built
`AppConfigRow`. **Done looks like** adding `hostEnv` to the dependency list (or
reading it through a ref) and checking what the saver currently does with an
absent `userId`.

**c. `useRegistryEditor` imports the main `@wellsfargo-starui/openfin-platform`
barrel.** Its sibling `useDockEditor` deliberately imports
`@wellsfargo-starui/openfin-platform/config` with a comment explaining that the
main barrel's `@openfin/workspace-platform` side effects throw
`Cannot read properties of undefined (reading 'uuid')` outside OpenFin — and the
editor renders in a plain browser window at dev time. Every symbol
`useRegistryEditor` uses is exported from `/config`, so this is a one-line
import change; the tests currently mock the whole barrel to work around it.

**Also noticed, cosmetic:** `InspectorPane`'s Config ID preview falls back to
`"—"` only when the derivation is falsy, but `deriveTemplateConfigId('', '')`
returns `"-"`. A brand-new draft therefore previews its id as a lone hyphen and
the em-dash branch is unreachable.

## 8. `config-browser`'s JSON editor has no accessible name

**Repo:** stern-bak · **Blocked on:** nothing; one attribute

`RowDrawer`'s payload `<textarea>` is labelled only by a sibling `<div>` reading
"JSON payload", which is not an accessible name. It is the primary control of
the row editor — the only way to change a config row — and it is unreachable by
`getByRole('textbox', { name })`, indistinguishable from the toolbar's
quick-filter box. `ConfigBrowser.test.tsx` works around it by filtering matches
on `tagName`, with a comment pointing here.

Same class as the drawer's Close button, which does have a `title` and is
therefore fine. **Done looks like** an `aria-label="JSON payload"` (or an
`id`/`htmlFor` pair against the existing heading), after which the test helper
can go back to a plain role+name query.

## 9. `CollapsibleToolbar`'s pin control has no accessible name

**Repo:** stern-bak · **Blocked on:** nothing; one attribute

The pin/unpin `<Button>` inside `CollapsibleToolbar` is icon-only (`Pin` /
`PinOff` from lucide). It exposes a `title` tooltip but no `aria-label`, so it
is unreachable by `getByRole('button', { name })` — the session 8 coverage test
falls back to querying the sole button after hover expand. **Done looks like**
`aria-label="Pin toolbar open"` / `"Unpin toolbar"` (or equivalent), after which
the test can name the control explicitly.

## 10. A `--force` build can be read half-written, failing ~109 suites

**Repo:** stern-bak · **Blocked on:** nothing; needs a repro loop to confirm the fix

Seen once in four consecutive `npm run test:coverage -- --force` runs on an
unchanged tree. `grid` failed **109 suites at collection** — not at assertion —
all with the same error:

```
Failed to resolve import "./primitives" from
  ../../design-system/design-system/dist/tokens/index.js
```

The emitted barrel was mid-write. A finished build emits
`from './primitives.js'`; the file on disk at that moment had the extensionless
specifier from a partial emit, which vite cannot resolve. Every package that
transitively imports design-system tokens then fails to load. `widgets-react` and
`workspace-setup-react` went down with it — three packages produced no coverage
summary.

Every library build is `rimraf dist && tsc` (required — it defeats a TS5055
on Turbo cache-restore). That leaves a window where `dist/`
exists but is incomplete, and a consumer's vite transform reading it gets a
truncated module. `--concurrency=1` does not close the window, so serialising is
not the answer.

**This failed loudly, which is the good news.** `check-package-coverage.mjs`
printed `INVALID — 3 of 21 package(s) produced no summary` and refused to give a
percentage. Before that guard existed it would have reported a plausible
`402/402 (100.0%)` and nobody would have looked.

**Done looks like** a repro (a loop of `--force` runs) and then one of: `tsc`
emitting to a temp dir and renaming into place atomically; or the `test` task
depending on a build output the consumer can't observe mid-write. Confirm by
running the loop 20× green, not once.

## 11. Bucket contents are wrong; 21 published packages should become 7

**Repo:** stern-bak · **Unblocked:** the coverage effort is finished (807/807)

`pack:npm` publishes **21** tarballs. That is 21 artifacts to onboard through
Artifactory, 21 names for consumers to choose between, and 21 versions moving
independently. The obvious fix — one `package.json` per existing folder — does
**not** work, and the reason is that the buckets were drawn by *architecture role*
rather than by *dependency profile*:

- It creates an npm cycle, `data → shared → data`.
- It unions each folder's peers. `shared` would force `ag-grid-community` on the
  zero-dependency `shared-types`; `data` would force `react` on the vanilla
  `host-data` SharedWorker layer; `react-core` would force **`ag-grid-enterprise`**,
  a licensed product, on anyone using `widget-sdk` to author a widget. That undoes
  [`PACKAGING_CHANGELOG.md`](archive/PACKAGING_CHANGELOG.md) §6 and the verified promise
  in [`EXTERNAL_CONSUMPTION.md`](./EXTERNAL_CONSUMPTION.md) §1.

The 21-package graph itself is a clean DAG, 9 layers deep — nothing is wrong with
the packages. The misfiling is **`host-config`**: it sits at layer 3 with 8
consumers across 4 buckets, filed under "Data Utilities". That single placement is
what closes the loop.

**The agreed arrangement** — verified mechanically as a 6-layer DAG. Recorded here
so nothing drifts before it runs: **do not add a new package to a bucket that
contradicts this table.**

| Layer | Published package | Members |
|---|---|---|
| 0 | `types` | `shared-types`, `types` |
| 1 | `core` | `engine`, `host`, `host-browser`, **`host-config`**, `widget`, `widget-browser` |
| 1 | `design-system` | `design-system`, `icons-svg` |
| 2 | `data` | `host-data` |
| 3 | `openfin` | `host-openfin`, `openfin-platform` |
| 4 | `react` | `ui`, **`host-data-react`**, `widget-sdk`, `host-wrapper-react`, `workspace-setup-react` |
| 5 | `grid` | `grid`, **`config-browser`**, **`widgets-react`** |

*(Table names are the eventual Phase 2 published-package names. This phase's
actual folders are* `shared`*,* `react-core`*, and* `react-grid` *respectively —
see "Folder-move stage: done" below.)*

Three moves do the work: `host-config` → `core` kills the cycle, `host-data-react`
→ `react` keeps `data` React-free (so `host-data-angular` and non-React consumers
are unaffected), and `config-browser` + `widgets-react` → `grid` confines
`ag-grid-enterprise` to one bucket.

**Folder-move stage: done.** `host-config` → `shared`, `host-data-react` →
`react-core`, `config-browser` + `widgets-react` → `react-grid` landed as
three separate commits, each validated with `npx turbo typecheck build
test`, `npm run check:deps`, and a full tarball install + build in the
sibling `starui-apps` repo. Package count is still 21 — only folder
location changed, per the design spec at
`docs/superpowers/specs/2026-08-01-package-bucket-realignment-design.md` (deleted — git history).

**What remains** is the second stage this item originally described:
collapsing 21 `package.json` files into 7, which still requires
`check-package-cycles.mjs` and `check-package-coverage.mjs` to be taught to
treat `packages/<bucket>/<member>/` as graph nodes (see "Still true" below)
before it can start.

**Package-collapse sub-phase 1: done.** `design-system` + `icons-svg`
collapsed into one `@wellsfargo-starui/design-system` package (20
tarballs, was 21). No source moved — only per-member `package.json`,
`vitest.config.ts`, and `turbo.json` were removed in favor of one set
at the bucket root. `@wellsfargo-starui/icons-svg`'s public API moved
to new `./icons*` subpaths; 9 consumer import sites across
`openfin-platform`, `workspace-setup-react`, and `grid` were migrated.
Per the design spec at
`docs/superpowers/specs/2026-08-01-package-collapse-design-system-design.md` (deleted — git history),
the coverage-tooling two-level-scan gap is an accepted interim state,
not fixed here — but `pack-npm.mjs` and `staruiConsumerAliases.mjs`
both needed a real fix during execution (not deferred): they hardcoded
the same two-level scan and were silently dropping the collapsed
package entirely from `pack:npm` output and the source-track consumer
alias manifest. Fixed generically so future sub-phases' collapsed
buckets are picked up automatically.

**`stern-apps` follow-up (non-blocking):** the generated
`tarball/star-demo/package.json` in the apps repo still declares a
`file:` dependency on the now-nonexistent `wellsfargo-starui-icons-svg.tgz`
tarball. The source template (`source/star-demo/package.json`) is
already clean — this is a stale generated artifact, and `build:tarball`
succeeds despite it (npm doesn't error on the unused stale line). Worth
a `npm run make:tarball-apps` regeneration pass in that repo at some
point, but not urgent.

**Package-collapse sub-phase 2: done.** `host-openfin` +
`openfin-platform` collapsed into one `@wellsfargo-starui/openfin`
package (19 tarballs, was 20). Both prior npm identities retired —
`host-openfin`'s single export moved to `./host`; `openfin-platform`'s
five subpaths kept their names under the new prefix. 28 consumer
import sites across `grid`, `widgets-react`, `host-wrapper-react`,
`workspace-setup-react`, and `config-browser` were migrated, including
a dynamic `/* @vite-ignore */` import that broke every design-time
grep pattern and a hardcoded Vite alias in `grid`'s own
`vitest.config.ts`. Per the design spec at
`docs/superpowers/specs/2026-08-01-package-collapse-openfin-design.md` (deleted — git history),
the coverage-tooling gap remains accepted, not fixed here.

**`stern-apps` follow-up (non-blocking):** `tarball/*/package.json`'s
generated `overrides` block was stale (missing the new `openfin`
package entirely, still listing the three retired names) and had to be
regenerated via `npm run make:tarball-apps` in that repo before the
tarball validation gate could complete — 5 of 6 apps then built clean.
The 6th, `star-demo`, still fails: its real application source
(`source/star-demo/src/main.tsx`, not a generated file) imports
`@wellsfargo-starui/host-openfin` directly and needs its own update to
`@wellsfargo-starui/openfin/host` — genuine `stern-apps` app code, out
of this repo's scope.

**Package-collapse sub-phase 3: done.** `host-data` (the bucket's only
non-Angular member) collapsed into `@wellsfargo-starui/data` — the
trivial single-member case, no folder regroup needed, same mechanical
package.json-to-bucket-root pattern as sub-phases 1-2 for consistency.
`host-data-angular` stays excluded from the pipeline, untouched. ~70
import sites across `openfin`, `host-data-react`, `widgets-react`, plus
explanatory comments in `shared/host-config` and `shared/shared-types`,
were migrated, including `staruiConsumerAliases.mjs`'s dedicated
worker-asset resolution logic (regex, labels, `optimizeDeps` exclude
list) — a code region the sub-phase-1 generic two-level-scan fix didn't
cover, since it's data-bucket-specific rather than a manifest-discovery
concern. 19 tarballs (unchanged count from sub-phase 2 — a rename, not
a merge). Per the design spec at
`docs/superpowers/specs/2026-08-01-package-collapse-design-system-design.md` (deleted — git history),
the coverage-tooling gap remains accepted, not fixed here.

**`stern-apps` follow-up (non-blocking):** after regenerating
`tarball/*/package.json`'s generated `overrides` block via
`npm run make:tarball-apps` (same regeneration this repo's own tooling
already needed in sub-phase 2), 4 of 6 tarball apps still fail to
build — all four confirmed via direct source inspection to be genuine,
hand-written application code, not generated-config staleness:
`dataprovider-editor`, `markets-grid-lab`, and
`stomp-marketsgrid-minimal` (`source/*/src/{platformBootstrap,bootstrap}.ts`)
import `@wellsfargo-starui/host-data` directly (one also imports the
`/assets/data-services-worker.mjs?url` subpath) and need updating to
`@wellsfargo-starui/data`; the 4th, `star-demo`, is the
already-known sub-phase-2 `host-openfin` finding, not new. `basic` and
`design-system` build clean, confirming `@wellsfargo-starui/data`
itself is correctly externally-installable — all four failures are
genuine `stern-apps` app code, out of this repo's scope.

**Documentation-staleness note:** `README.md` and
`docs/EXTERNAL_CONSUMPTION.md` still reference retired package
identities (`host-openfin`, `openfin-platform`) left stale by
sub-phase 2 and not touched here either, to keep this sub-phase's
scope consistent with precedent (only
PACKAGE_ORGANIZATION.md, ARCHITECTURE.md, current-features.md, and this
file are updated per sub-phase). Worth a single consolidated doc sweep
once all sub-phases land, rather than fixing piecemeal.

**Package-collapse sub-phase 4: done.** `grid` + `config-browser` +
`widgets-react` collapsed into one `@wellsfargo-starui/grid` package (17
tarballs, was 19) — the first sub-phase with real cross-member npm
dependencies rather than a folder-adjacent rename. `grid`'s own `.` export
stays the merged package's `.`; `config-browser` retires to `./config-browser`
(+ `./config-browser/icons`), `widgets-react` to `./widgets` (+ 4 more
subpaths). Each member kept its own tsconfig and gets built via a separate
`tsc` invocation in dependency order (grid → config-browser → widgets-react),
so the 17 real cross-member imports of `@wellsfargo-starui/grid` (already the
final name) needed **no** text changes — they resolve through the normal
npm-workspace symlink exactly as before the merge. Only the 3 files
importing config-browser's old `.` export needed a rename, to
`@wellsfargo-starui/grid/config-browser`.

The three members had materially different vitest settings (`globals`,
`setupFiles`, `pool`) that no single flat config could express, so
`packages/react-grid/vitest.config.ts` uses Vitest's `test.projects` instead
— three inline sub-configs, each with its own `root` so `setupFiles`/`include`
resolve unchanged, coverage collected once at the top level across all three
src trees. Verified: 328 test files / 2490 tests (240 grid + 75 widgets-react
+ 13 config-browser), matching the pre-merge per-member counts exactly.
`eslint.config.mjs`'s stale `FRAMEWORK_ADAPTERS` entry for the retired
`widgets-react` name is left as a dead, harmless list item — edits to that
file are hook-blocked and this one didn't warrant an override. Per the
design spec at
`docs/superpowers/specs/2026-08-01-package-collapse-design-system-design.md` (deleted — git history),
the coverage-tooling gap remains accepted, not fixed here.

**`stern-apps` follow-up (non-blocking):** after regenerating
`tarball/*/package.json` via `npm run make:tarball-apps`, 4 of 6 tarball
apps still fail to build, all confirmed genuine application source:
`dataprovider-editor` and `markets-grid-lab` (already-known sub-phase-3
`host-data` finding), `star-demo` (already-known sub-phase-2 `host-openfin`
finding), and a new one — `stomp-marketsgrid-minimal/src/App.tsx` imports
`@wellsfargo-starui/widgets-react/hosted` directly and needs updating to
`@wellsfargo-starui/grid/widgets/hosted`. `basic` and `design-system` build
clean, confirming `@wellsfargo-starui/grid` itself is correctly
externally-installable.

**Package-collapse sub-phase 5: done.** The first sub-phase needing a
folder regroup: `react-ui/ui` moved into `react-core/` (git mv, history
preserved, `react-ui/` bucket eliminated), then the five members — `ui`,
`widget-sdk`, `host-wrapper-react`, `workspace-setup-react`,
`host-data-react` — collapsed into one `@wellsfargo-starui/react` package
(13 tarballs, was 17). `ui`'s `.` export becomes the merged package's `.`
(plus `./chart`, `./tailwind-config`); the others retire to subpaths:
`./widget-sdk`, `./host` (+`/test-bridge`), `./workspace-setup`, `./data`
(+`/runtime`) — mirroring sub-phase 2's `openfin/host` pattern. 139
consumer files migrated (bulk of them `grid`/`config-browser`/
`widgets-react` importing `ui`). Five-project `test.projects` vitest
config (per-member root/globals/setupFiles/timeouts); 84 test files /
606 tests, matching pre-merge per-member counts (ui 55, host-data 12,
workspace-setup 9, widget-sdk 7, host-wrapper 1). The coverage-tooling
gap remains accepted, not fixed here.

**Validation-gate change forced by this sub-phase:** every tarball app's
hand-written source imports `@wellsfargo-starui/ui`, so after this rename
0/6 apps build — the app-build gate can no longer distinguish platform
defects from apps-repo staleness. Replaced for this sub-phase by a
scratch consumer outside the workspace (`npm install` of the packed
tarball + resolve checks): all 9 export subpaths resolve, all 5 retired
names correctly fail as module-not-found. This matches the "scratch app"
external-verification idea already planned for sub-phase 7.

**`stern-apps` follow-up: done.** The consolidated import-migration pass
landed once the platform names went final (post sub-phase 6): apps-repo
commit `bd31f83` migrates 111 files across both tracks off the 18 retired
identities (mappings mirror the platform's), preceded by snapshot commit
`81b6d31` preserving the apps-side coverage-70 WIP found uncommitted in
that working tree (~150 new test files + vitest harness). The tarball
pipeline self-corrected — `setup.mjs` re-vendored the 7 new tarballs and
`makeTarballApp` recomputed every twin's dependency list from actual
imports. Validated: build green on both tracks (7 source apps, 6
regenerated tarball apps), `npm test` green (112 test files). The WIP snapshot's
own residue is closed too: apps commit `1de2956` fixes the 81 test-side
type defects (and star-demo's tests turned out to have never been
typechecked at all — its composite app tsconfig couldn't include them; a
non-composite `tsconfig.test.json` now covers them). Both tracks build,
typecheck and test green.

**eslint.config.mjs (pending, hook-blocked):** two stale
`packages/react-ui/ui/**` paths (the no-native-input `ignores` entry and
the kebab-case filename carve-out) need updating to
`packages/react-core/ui/**` — edits to that file are blocked by the
config-protection hook; owner will disable it and the fix lands as a
follow-up commit. Until then `npm run lint` flags ui's shadcn wrappers.

**Package-collapse sub-phase 6: done.** The second regroup-then-collapse
sub-phase: `shared/` (8 members) split into `packages/types/`
(`shared-types`, `types`) and `packages/core/` (`engine`, `host`,
`host-browser`, `host-config`, `widget`, `widget-browser`) — git mv,
history preserved, `shared/` bucket eliminated — then each new bucket
collapsed to one package. `@wellsfargo-starui/types`: the `types` member keeps
`.` (existing consumers untouched); `shared-types` retires to `./shared`
(+`/configuration`, `/dataProvider`, `/fieldSelector`). 44 consumer files
migrated. `@wellsfargo-starui/core`: `engine` takes `.` (ESM + CJS pair kept);
`host` → `./host`, `host-browser` → `./host/browser`, `host-config` →
`./host/config`, `widget` → `./widget`, `widget-browser` →
`./widget/browser`. 385 consumer files migrated. Dependency entries
across data, react-grid, openfin, react-core, design-system, and the
root swap the eight retired names for `types`/`core`; `ag-grid-community`
is core's only peer (host-config's optional engine peer became
internal). Two- and six-project `test.projects` vitest configs; 9 + 114
test files, matching pre-merge per-member counts. The coverage-tooling
gap remains accepted, not fixed here (sub-phase 7).

**Build-tooling landmines this sub-phase tripped, now defused:**

- **`ensure-workspace-links.mjs` still required `@wellsfargo-starui/icons-svg`**
  (retired in sub-phase 1). The fresh `npm install` that the workspace
  regroup forces prunes the leftover symlink that had been satisfying the
  stale entry, turning it into a hard `build:packages` failure. Entry
  dropped (and the list now names `types`/`core` instead of
  `shared-types`/`host-config`).
- **engine's `vite-plugin-dts` declaration rollup needs a member-level
  `package.json`.** The plugin walks up from the entry to the nearest
  package.json for its types-entry path; with only the bucket manifest it
  resolves `./engine/dist/index.d.ts` against `engine/` itself and dies
  on `engine/engine/dist`. `packages/core/engine/package.json` therefore
  survives as a clearly-marked non-workspace build shim (name
  `core-engine-build-shim`, excluded from the packed tarball — bucket
  `files` lists `engine/dist` only). It is the only member-level
  package.json left in any collapsed bucket.
- **Bare source aliases prefix-match subpath imports.** react-grid's
  vitest alias `@wellsfargo-starui/types` → `types/src` mangled the new
  `@wellsfargo-starui/types/shared/*` ids (rollup-alias string finds are prefix
  matches). Explicit subpath aliases now sit before every bare package
  alias in `packages/react-grid/vitest.config.ts` — a pattern any future
  source-aliasing config must copy.

**Validation (the "Done looks like" gate below, now met):** 21/21 turbo
build+typecheck+test tasks green (7 packages); check:deps acyclic with
all cross-package imports declared; ds-tokens at the 272 baseline;
check:rtl and check:source-aliases pass; `pack:npm` emits exactly 7
tarballs (dist-npm/ needed a manual `rm -rf` first — the script never
prunes stale output, so retired-name tarballs from earlier sub-phases
were still sitting there and the manifest listed 25 packages); a scratch
consumer outside the workspace installs all 7 tarballs with all 16
export subpaths resolving (ESM `import.meta.resolve`; `.` entries of
data/openfin/design-system/types-host subpaths are import-only by
design, so `require.resolve` is the wrong probe), all 7 retired names
failing as module-not-found, **react absent for a data-only consumer and
ag-grid-enterprise absent for a react-only consumer** — the sub-phase-7
peer-isolation assertion, already holding.

**eslint.config.mjs: fixed.** The config-protection hook turned out to be
already disabled (the local agent settings set
`ECC_DISABLED_HOOKS=pre:config-protection`; env vars from settings apply
at session start, so the block observed in sub-phase 5 predated that
entry taking effect). One follow-up commit landed the full backlog:
sub-phase 5's stale `packages/react-ui/ui/**` paths → `react-core/ui`,
`FOUNDATION_GLOBS`/`ENGINE_GLOBS` → `packages/types/shared-types` /
`packages/core/engine`, the foundation extglob → `!(design-system|types)`,
`FRAMEWORK_ADAPTERS`/`APP_REVERSE_DEP` groups rebuilt on the collapsed
names (grid/react + `/**` subpath variants — the old lists named only
retired identities, so those `error`-severity boundaries had been
enforcing nothing), and retired names scrubbed from rule messages.
`npx eslint "packages/**/*.{ts,tsx}"`: 0 errors, 376 warnings (the
pre-existing warn-level `any`/size backlog). The former "lint flags ui's
shadcn wrappers" symptom is gone.

**README.md needs a standalone refresh:** its bucket table and package
names are current again (fixed here), but large sections still describe
the pre-split world — in-repo `apps/`, `e2e/`, `libs/*.tgz`,
`npm run propagate`, `install:apps` — all deleted or moved to the apps
repo. Out of scope for this sub-phase; worth its own docs pass.

**Package-collapse sub-phase 7: done — item 11's roadmap is complete.**
Spec:
`docs/superpowers/specs/2026-08-01-package-collapse-tooling-design.md` (deleted — git history).
The tooling now understands the collapsed shape and the by-hand external
verification is a scripted gate:

- **`check-package-cycles.mjs`** grew a member-level graph
  (`<pkgName>#<memberFolder>` nodes; edges from bucket-subpath imports —
  including same-bucket self-references, invisible to the package graph by
  construction — plus relative imports escaping their member). Members are
  seeded from src/-bearing subfolders **union** exports-map-named folders:
  icons-svg keeps sources at its member root and an adversarial review
  proved the src/-only rule dropped it (and all edges through its five
  published subpaths) silently. The member-walk regex carries a lookbehind
  so `@import` examples in doc comments cannot fabricate edges — review
  manufactured a false core→design-system edge (and with a matching
  snippet, a whole false cycle) from prose alone. Current tree: 22 member
  nodes, 12 intra-bucket edges, acyclic; a synthetic engine→host probe
  fails the run naming the cycle.
- **Coverage pair, collapse-aware** (closes the accepted gap carried since
  sub-phase 1): units discovered at bucket roots (two-level fallback only
  for scoped stragglers; the engine build shim ignored), the
  no-real-test-script check re-expressed per member (suite file required;
  members with a suite must appear in their bucket's summary or it is a
  collection failure), bucket-root LCOV scanned with stale pre-collapse
  member LCOVs excluded from the merge. **Full serial run: 807/807 files
  at or above 70% across all 7 buckets — PASS.** The gate immediately
  caught one real gap on its first run (`icons-svg/react/DynamicIcon.tsx`
  at 0% — the bucket's test include was `.ts`-only, so a React member
  component had no discoverable test slot; fixed with an RTL suite,
  now 100%).
- **`pack:npm`** prunes: full pack wipes `dist-npm/`, subset pack deletes
  retired-name tarballs + manifest entries, unknown selectors fail loudly.
- **`npm run verify:external`** scripts the sub-phase 6 manual gate: temp
  consumer outside the repo, all 7 tarballs installed,
  `import.meta.resolve` over every exports key of every packed manifest
  (derived, not hardcoded; resolved targets checked to exist) plus 18
  retired names asserted dead, and manifest-computed peer-isolation
  closures (`react` absent for data-only, `ag-grid-enterprise` absent for
  react-only). 96 assertions green.

Also fixed while validating: root `typecheck` raced collapsed buckets'
own `rimraf`-first builds (same class as the sub-phase-5 test-ordering
fix — bucket `turbo.json`s now order typecheck after their own build),
and openfin/data finally got bucket `turbo.json`s with real output globs
(their builds were never cached; the long-standing "no output files
found" warnings are gone). Full matrix `turbo build typecheck test` in
one invocation: 21/21.

Process note: implemented and reviewed via parallel agent workflows; the
4-dimension adversarial review (17 agents) confirmed 3 findings (all
fixed above: the icons-svg member drop, the doc-comment edge fabrication,
silent unknown pack selectors) and refuted 10.

**Constraint that falls out (still binding):**
`packages/<bucket>/<member>/src/` is load-bearing once buckets collapse —
it is the primary surface the boundary checker stands on (exports-map
seeding covers the icons-svg-style exception, loudly). Do not flatten
members into a single `src/` per bucket.

---

## 12. Demo-app follow-ups from the framework-usage audit (2026-08-02)

**Area:** `apps/source/*` · **Blocked on:** nothing — mechanical, just not urgent

The 2026-08-02 audit fixed the clear-cut defects (see the `feat/documentation`
branch); these judged-riskier items remain:

1. **Destructive resets should confirm via `AlertDialog`.** `basic`
   `src/App.tsx` `handleReset` wipes storage with no confirmation (its own
   HelpSheet advertises "with confirm"); `dataprovider-editor` `src/App.tsx`
   uses native `window.confirm`. Both should use `AlertDialog` from
   `@wellsfargo-starui/react`.
2. **markets-grid-lab gridIds carry `-vN` suffixes** (`lab-alerts-v2`, …,
   11 of 17 catalogs) — conflicts with the no-versioned-names rule and
   orphans saved profiles on every bump; the sanctioned reseed mechanism is
   `LAB_DEMO_PROFILES_FLAG_VERSION`. Renaming must be coordinated with
   `apps/e2e/v2-*.spec.ts` (which pin the ids) and `src/help/*.md`.
3. **Tokenize the DOM-only lab seed colors.** `src/seeds/renderers.ts`,
   `profiles/presets.ts` and `conditionalStyling.ts` `indicator.color` never
   reach the Visual Excel path, so `var(--ds-*)` values would work and
   collapse the `{dark, light}` literal pairs; keep hex only where colors are
   written into `.xlsx`. The seeds dir is carved out in `check:ds-tokens`
   with this rationale.
4. **`dataprovider-editor` `StatsPanel` polls at 1 Hz** while `basic`
   deliberately teaches the event-driven alternative — two tutorials
   demonstrating opposite patterns.
5. **`check:ds-tokens` has 393 pre-existing violations in `packages/`**
   (largest: `widgets-react` container hexes) — a separate effort from the
   apps; the gate is not currently green anywhere.
6. **`star-demo` `RenameViewTab` imports `Button, Input` from
   `@wellsfargo-starui/grid/customizer` for non-grid UI** — a layering smell
   (should import from `@wellsfargo-starui/react`). The one surviving finding
   from the archived `REFACTOR-platform-tool-views` plan.
7. **Grid perf risk (from the archived June perf audit, still open):**
   timed/header conditional-styling rules and virtual calculated columns can
   trigger full-grid scans every tick; only partially covered by
   `blotter-performance-roadmap` Tier 4.

## 13. Stale-but-live docs need a path/name refresh pass

**Area:** `docs/` · **Blocked on:** nothing — mechanical

The 2026-08-02 docs audit kept these files because they document live
features, but each carries pre-collapse names/paths. One pass, per file:

- `MARKETSGRID_USAGE_GUIDE.md` — §20 cheat sheet + §21 template table are
  fully dead (`widgets-react`, `host-data-react/runtime`, `apps/demos/*`);
  live names: `@wellsfargo-starui/grid/widgets`, `/widgets/hosted`,
  `@wellsfargo-starui/react/data/runtime`.
- `STOMP_DATAPROVIDER_MARKETSGRID_GUIDE.md` — prereqs still say
  `npm run propagate` / install from `libs/`; Step 1 uses the deleted
  `mcp-scaffold` (`pack:mcp` is not a script). Protocol half is accurate.
- `EXTERNAL_CONSUMPTION.md` — §1 install names are pre-collapse; closing
  note recommends `propagate`.
- `PROFILE_PERSISTENCE.md`, `EXPRESSION_DSL.md`,
  `blotter-performance-roadmap.md` — `packages/shared/engine` →
  `packages/core/engine` (+ roadmap's `react-core/widgets-react` →
  `react-grid/...`, `apps/demos/*` → `apps/source/*`, and its "nothing
  implemented yet" header contradicting its own ✅ items).
- `CONFIG_SERVICE_BASELINE.md` — `apps/demos/star-demo/*` paths;
  `host-config`/`host-data` import names → `@wellsfargo-starui/core/host/config`
  / `@wellsfargo-starui/data`.
- `OPENFIN_GRID_LINKING.md` — `packages/react-core/widgets-react/...` →
  `packages/react-grid/widgets-react/...`; `apps/demos/` → `apps/source/`.
- `MEMORY_LEAK_AUDIT.md` (archived but current-content) —
  `--workspace=@wellsfargo-starui/host-data` → `@wellsfargo-starui/data`.
- `package-coverage-and-sonar-lcov.md` — cites nonexistent
  `scripts/run-unit-tests-with-report.mjs`; bucket-glob advice predates the
  seven explicit workspace paths.
- `guides/design-system-upgrade-and-openfin-palette.md` — `apps/demos/*`,
  `npm run build:apps`, link to the archived `BUILD.md`.
- `guides/platform-bootstrap-config.md` — `@wellsfargo-starui/host-data` →
  `@wellsfargo-starui/data`.

## 14. First-run catalog read stalled once — closed; forensic cause found 2026-09-12

**Area:** `packages/data/host-data` (worker) · **Blocked on:** nothing — closed

**Forensic cause found (2026-09-12, worker-split W1c live probe on the
Windows target):** not a Dexie stall — a port-adoption gap in the shared
worker installer. `defaultEntry` must `start()` each port to receive the
bootstrap handshake; on handover it removed its capture listener, and
`install()` only attached the host's listener AFTER the catalog + AppData
hydrate awaits. A started port with no listener drops messages, so every
request a first window sent in that window (its `appdata-attach`,
`hub-ready`, the first `get-config`) vanished — the window's readiness
promises never settled, the grid's `get-config` only succeeded on the
client-side retry. A port trace (`apps/scripts/ssrm-perf`, headless
Chromium, fresh profile) showed six unanswered requests followed by
answered retries. Fixed in `entry.ts`: every port is attached the moment
it is known and dispatch is backlogged, in arrival order, until the host
is ready; pinned by two regression tests in `entry.adoptPorts.test.ts`
(adopted-port mid-hydrate, onconnect-port mid-hydrate). The bounded-reply
backstops below stay.

Observed once (2026-08-02, first-run cold boot of `stomp-marketsgrid-minimal`):
the worker's first ConfigManager read (`ConfigCatalogCache.ensure` →
`store.get` → Dexie) never settled, so `handleGetConfig` never replied and
the client hung on a stranded promise. Instrumented browser traces of
subsequent first-run boots (fresh profile, empty IndexedDB, real seed
storm) could not reproduce the stall.

**The failure class is closed at both layers, with tests:**
- `useDataProviderConfig` bounds each fetch (2.5s × 3 silent re-issues on
  no-response; explicit rejections unchanged) — `react-core` hook tests.
- Every async catalog RPC handler now guarantees **exactly one reply** —
  result, error, or a 10s deadline error — via `replyBounded` in
  `hubCatalogRpc.ts`; late completions are not re-sent but keep their side
  effects (row cached; `catalog-ready` still broadcast) —
  `hubCatalogRpc.test.ts` "Bounded replies" suite, including the observed
  six-invalidate seed storm interleaving.

**Remaining (forensic only):** what made that one Dexie read stall. If a
deadline error ever surfaces in the wild (`"catalog read did not settle"`),
capture the worker console via chrome://inspect at that moment — the
backstop now makes the event visible instead of silent.

## 15. SSRM hardening follow-ups (2026-09-11)

**Area:** `packages/data/host-data/src/runtime/ssrm`, `packages/react-grid/grid/src/ssrm` ·
**Blocked on:** nothing — the remaining engine phases proceed in rangrez, per
the engine enhancement plan,
[`superpowers/plans/2026-08-23-ssrm-engine-rust-perspective.md`](superpowers/plans/2026-08-23-ssrm-engine-rust-perspective.md) §12
(T1–T7 + C1–C2 is the route to full SSRM parity, measured by `apps/source/markets-grid-lab-ssrm`);
evidence in
[`superpowers/plans/2026-09-11-ssrm-hardening-handoff.md`](superpowers/plans/2026-09-11-ssrm-hardening-handoff.md) §5

Three passes on 2026-09-11 closed every original P0/P1 item except double
serialisation, plus plan-§12 phases T1/T2/C1/C2; the 2026-09-12 engine pass
landed the remaining five (T3 computed columns, T4 aggregate scalars, T5
membership deltas / book-wide alerts, T6 typed dates with the `__epoch`
machinery deleted, T7 pivot completeness) — handoff §2/§2b/§2c are the change
logs, §3 the probed engine facts, §4/§4b the measured baselines; the parity
matrix stands at 14 full / 2 partial / 0 gap. What remains, in the handoff's
order: double serialisation per block (JSON in the WASM boundary, then
structured clone — only matters past ~1 grid / 20k rows, block RPC is
4–5 ms); per-level SSRM store options unset and unmeasured
(`getServerSideGroupLevelParams` and friends); the six-blotter soak
(`ssrm-multiwindow.mjs` ran at PAGES=2; `PAGES=6` at `?rate=10000` has not);
LF-in-CRLF line endings (harmless, owner's call).

## 16. Edit lifecycle, staged batches, file import — CSRM + SSRM (2026-09-12)

**Area:** `packages/data/host-data/src/provider`, `packages/core/engine/src/customizer/modules/editing-core`, grid customizer ·
**Blocked on:** nothing — phases are independent of the engine work; plan at
[`superpowers/plans/2026-09-12-edit-lifecycle-plan.md`](superpowers/plans/2026-09-12-edit-lifecycle-plan.md)

`apps/source/spg-pricing-blotter` proved the shape app-side: one wrapper
over `applyEdits` gives every grid write path a real commit lifecycle
(amber staged → yellow pending → cleared on server ack → red refused),
plus validated CSV import staged before save. The plan platformizes it in
six phases — E1 write contract + edit-ack lifecycle module (also closes
the CSRM hole where edits are local transactions the next tick reverts:
`IDataProvider` has NO write method today), E2 worker-side upstream
write-back (`editEndpoint` config; one POST per book, not per window),
E3 staged overlay tiers (reload-safe drafts; Discard = drop the tier),
E4 file-import customizer module (deletes the app's dialog), E5
write-conflict signal (pending cell ticked to a DIFFERENT upstream value
must not silently lose either way), E6 batch-ack status panel. One phase
per session; the app's stores/wrapper are deleted as each phase absorbs
them.

## 17. Single SharedWorker starves config/AppData under streaming load (2026-09-12)

**Area:** `packages/data/host-data/src/runtime/worker`, `bootstrap` ·
**Branch:** `feature/worker-hub-config-refactor` · plan at
[`superpowers/plans/2026-09-12-worker-split-plan.md`](superpowers/plans/2026-09-12-worker-split-plan.md)

One SharedWorker hosts three planes over one event loop: high-frequency
data (STOMP ingest → WASM, SSRM ticks, CSRM fan-out) plus low-frequency
config catalog RPCs and AppData. A worker cannot preempt a running ingest
macrotask, so tool windows opening mid-storm queue their config requests
behind the data plane — in-worker prioritization is structurally a
non-fix. Plan: split catalog RPC + HubAppDataService (already
self-contained modules) into a second `«appId»-platform` SharedWorker; the
data hub keeps a read-only ConfigManager and re-reads shared IndexedDB at
provider lifecycle moments (no worker↔worker bridge). Phases W0
measure → W1 extract → W2 boot rework (also the WORKLOG-14 hydrate-order
class, plus `warmPlatform()` — the one-line fire-and-forget app-load /
OpenFin-dock warm-up that spawns the workers and starts autoStart
providers off the UI thread; the existing lazy create-on-first-grid-mount
path stays as the fallback, merged through the same per-appId promise
maps) → W3 re-measure + soak → W4 CSRM fan-out (20k snapshot × 10
blotters near-simultaneous: round-robin chunk scheduling over the
existing bucketed pre-encoded replay cache, one encode for broadcast +
replay, backpressure-aware pacing, SAB as a crossOriginIsolated-gated
stretch). Thin-window principle added: windows never open Dexie — config
AND AppData reads/writes are services-worker RPCs (the customizer's
storage adapter included, with a per-gridId profile cache in worker
memory); the tens-of-seconds window opens trace to every window running
its own ConfigManager boot against a storming data worker. W0 baseline
RUN (2026-09-12, worker-baseline.mjs): the CSRM fan-out ladder reproduced
(9 joiners 1091→2337 ms, last÷first 2.14× vs the ≤1.5× target); config-RPC
starvation did NOT reproduce on the dev rig (p99 ≤ 2.1 ms even during the
20k snapshot re-stream — short drain-paced macrotasks) — re-probe on a
corporate/OpenFin rig with useRest:true before calling the config plane
low-risk. THROTTLE=4 Windows-proxy run (CDP page throttling; worker
thread NOT throttleable, so numbers understate Windows): the starvation
mechanism appears — 103.8 ms hub-ready stall during snapshot re-stream,
mid-storm window open 225→924 ms, joiner ladder to 5.4 s. Dev rig is an
M4 Max; deployment target is Windows 11 32 GB — all exit gates run native
AND throttled, final acceptance on the real target box. W1a+W1b landed
(dual worker + slim PlatformServicesHost behind a self.name branch); W1c
landed on the Windows target (2026-09-12): the data hub serves no catalog /
AppData (routes deleted, `ProviderLifecycleReads` re-reads IndexedDB at
create / restart / reconfigure, platform worker is the sole seeder, data
worker inits read-only attach mode, hub at the 800-line ceiling after
`HubSsrmRpc` + `HubStatsSampler` extraction); React hooks + adapters were
stragglers still issuing catalog RPCs on the DATA client and were
re-pointed at `platformClient`; the inspector merges both workers'
introspect. Windows-native W0 numbers (W1b HEAD) are in plan §5. W2 landed on
the Windows target (2026-09-12): `ensureConfigReady` is the thin-window
tier (platform-services port spawned alone and first, read-only attach-mode
IndexedDB, gated on the worker's catalog with a 20 s backstop — windows
never seed), config writes ride the port (`ConfigWriter` →
`config-save` / `config-delete`; the services worker is the single
writer, refreshes its catalog inline and self-invalidates on its own
change notifier for writes from anywhere else; window-side
`wireWorkerCatalogSync` deleted), `warmPlatform()` is the app-load /
OpenFin-provider-window warm-up (stats-mode attach keeps providers
running without fan-out; star-demo's provider window calls it with
`providers: 'autoStart'`), and the WORKLOG-14 installer race is fixed
(see item 14). Deliberately NOT done: a per-`gridId` profile cache in
worker RAM — reads stay window-local IndexedDB primary-key gets through
the ConfigManager's own row cache, which never touch the data worker's
thread, so there is no contention to remove; revisit only with a
measured read cost. Field note from the Windows probe: the demo pages
block `DOMContentLoaded` on Google Fonts (0.1–11 s here) — the harness
now aborts those hosts; apps should self-host or defer the fonts. W4
landed (2026-09-12): `ReplayScheduler` fans late-join replays out
round-robin (rounds of one chunk per pending port, 8 ms budget between
rounds, MessageChannel yield, chunks frozen per job at enqueue, live
deltas deferred per port until its `ready`), with hub-thread accounting on
`hub-introspect.fanout`; 10-window ladder 1.47× → 1.09–1.36× (spread
1 204 → 272–939 ms), hub thread ≈ 0.6–0.9 s encode + 0.45–0.6 s posting
per 9-port episode — the posting floor is structured-clone per port, so
the SharedArrayBuffer stretch (needs `crossOriginIsolated`) is the next
lever there and was NOT built. W3 closed the pass (2026-09-12): final
Windows-native column in plan §5 (re-stream config max 53.5 → 2.2 ms;
window ladder 6 ms; six-window `?rate=10000` soak green with SSRM block
p50 254 ms vs 145 at two pages — the same-plane contention the plan
excludes), the single-worker bootstrap helpers deleted
(`createDataServicesClient`, `bootstrapDataServicesWithWorkerAsset`,
`createAppDataServices` — no consumers, and they attached AppData on the
data port, which no longer answers), `wireWorkerCatalogSync` deleted,
docs aligned. **Open**, per the handoff §6: REST-mode re-probe against a
real config service; OpenFin-runtime verification of the provider-window
warm-up + freeze exemption; customizer-open timing on an app that renders
the settings button; the demo apps' render-blocking Google Fonts; the
SharedArrayBuffer fan-out stretch. Item 14 is closed with its cause. [`superpowers/plans/2026-09-12-worker-split-handoff.md`](superpowers/plans/2026-09-12-worker-split-handoff.md). Honest limits stated in the plan: same-plane
SSRM contention and CPU saturation are not fixed by this.

## 18. OpenFin live verification of the worker split (2026-09-12) — one defect fixed, one leak characterized

**Area:** `packages/data/host-data/src/bootstrap/freezeExemptionLock.ts`, worker port lifecycle · **Blocked on:** the port-leak cause

Probed the running star-demo platform (OpenFin 43.142, twelve SSRM views
streaming) over CDP from the provider window — numbers in the worker-split
plan §5 ("the deployment shape, measured live"): platform-port config RPCs
0.3 ms p50 while the data port's scalar probe waited 55 ms p50 / 190 ms
p99 behind ingest; `config-save` through the single writer and
`warmPlatform` from the provider page both verified live.

**Fixed:** `acquireBackgroundFreezeExemption` requested its Web Lock in
exclusive mode under one origin-wide name, so the provider window held it
and all twelve views sat in `navigator.locks.query().pending` — a queued
request neither rejects nor retries, so no warning either. Now `{ mode:
'shared' }` (test pinned). Windows loaded before this fix still hold /
queue the exclusive lock until the platform restarts — restart the
provider to verify with `navigator.locks.query()` in a view
(`held` should list `starui-background-freeze-exemption` in every data
window).

**Cause found — a `dist` rebuild under a dev-served platform reloads every
page mid-write.** star-demo runs on `vite dev` in source mode, which
serves `packages/*/dist` through `/@fs/` and watches it: any package
rebuild (`rimraf dist && tsc`) fires a full reload of EVERY open OpenFin
page while the files are half-written. Pages that catch that window fetch
a truncated worker asset (HTTP 200), no SharedWorker target ever appears,
and provider + views sit with no `starui:*` marks and an empty body — the
provider route's config gate never resolves, `fin.Platform.init` never
runs, no dock. Seen twice in one session (a data rebuild during a platform
restart; a grid rebuild with the platform live). Reloading each page once
the files are whole recovers it (10 ms ladder). Rule: do not rebuild
`dist` while a dev-served OpenFin platform is up — or test OpenFin against
a production preview. Still open underneath: the thin tier's 20 s catalog
deadline did not surface in the hung windows, so something earlier in
`ensureConfigReady` blocks when the worker is dead at first connect
(`ConfigManager.init({ mode: 'attach' })` is the suspect); reproduce by
serving a truncated worker asset to a fresh profile with the console
captured.

**Open — dead ports in the workers:** with 13 live pages the platform
worker reported 59 connected ports and 58 AppData listeners, the data
worker 58–59 ports (data subscribers are heartbeat-swept and were exactly
right). Every AppData delta is posted to each dead listener (silent
no-op per port, but ~45× the work) and the PortLike closures are retained.
Controlled experiments over CDP: opening and closing a config-only
window, opening and closing a blotter view, and reloading a live view all
returned the counts to baseline — `pagehide` → `port-close` works for
those lifecycles. The leaked entries accumulated earlier in the session
(~94 min, many view duplications and several `dist` rebuilds that
triggered Vite full reloads) and their originating lifecycle was not
reproduced. Proposed fix regardless of cause: liveness for platform-port
consumers — the client already heartbeats data subscriptions on the data
port; add a per-port `ping` on the platform port and let both hosts sweep
ports (and their AppData listeners) silent for the hidden-grace window,
mirroring the data hub's subscriber sweep.

## 19. SSRM tick fan-out shipped the whole table's churn to every view (2026-09-12) — fixed

**Symptoms (user, live OpenFin, twelve SSRM blotters on `stomp-ssrm1`):**
rows appear seconds after the busy indicator clears; after a fling the
blank rows take a couple of seconds to fill.

**What it was not.** The data worker: at the demo's feed rate a block read
costs ~3 ms of engine time with an empty queue (`hub-introspect.ssrm`,
plan §5). Request serialisation: letting AG Grid keep four block reads in
flight instead of two changed nothing (4.1 s vs 3.8 s fill) — the option
stays opt-in. The event loop of the views was idle (p95 lag 13 ms).

**What it was.** A CDP CPU profile of one hooked view: during a 44 s cold
load the main thread spent 11.8 s inside the data client's
`handleMessage` and 19 s in native `(program)` (structured-clone
deserialisation of incoming port messages); during a 13.9 s fling window
3.2 s + 5.3 s. AG Grid and React were a distant second. Counting the
messages on one view's data port over 10 s at rest: 31 `ssrm-tick`
`rowDelta` events, 45 MB in total (up to 3.2 MB each, 4.5 MB/s), carrying
38 000 full-width rows — for a grid holding two blocks of 200. The engine's
`poll_shared_delta` returns the whole table's churn once per flush and
`HubSsrmRpc.flushTicks` posted that identical payload to every session of
the provider: twelve views × 4.5 MB/s of structured clones, each view
deserialising rows it immediately discarded as "not loaded"
(`bindSsrmTicks` walks its loaded nodes per tick). During a fling the
deserialisation competes with row rendering; on a cold load it stretches
the widget mount (first block issued 11 s after `platform-ready`).

**Fix.** `SsrmSessionWindows` in the data hub: every flat block a session
reads registers its leaf keys; each `rowDelta` tick is trimmed per session
to the rows it holds plus `unloaded: { upserts, removals }` counts, which
`bindSsrmTicks` feeds into the same count check / positional refresh an
unknown upsert takes. Sessions that never read a flat block, grouped
sessions and sessions past 50 000 keys keep receiving the full delta (never
withhold a row the grid might hold; stale keys after a purge only cost
bytes). `hub-introspect.ssrm.tickFlush.upsertsPosted / upsertsWithheld`
count the effect. Measured after, same hooked thirteenth
view: 62 ticks in 10 s, 0.96 MB, 794 rows (0.10 MB/s, ≤31 kB each);
worker counters `upsertsPosted` 0.67 M vs `upsertsWithheld` 12.0 M (95 %
withheld); fling scroll-stop → rows filled 1.8 s (was 3.8–4.3 s; the
view's own long tasks during the fling are still ~3 s, so what remains is
rendering); cold reload → rows 13.7 s with the first block issued at
12.6 s and answered in 0.76 s (was 20–28 s / 1.0–1.6 s). Tick flush in
the worker rose from ~15 ms to 24 ms p50 with 13 sessions (keying ~3.6 k
rows per tick + thirteen filtered posts, versus thirteen 3 MB clones) —
~15 % of the worker thread at six flushes a second; the engine's delta
JSON parse is most of it.

**Trap met on the way (dev rig).** `vite dev` serves the worker asset
through its transform cache and did NOT notice the rebuilt
`dist/assets/data-services-worker.mjs` (file changed at 19:48, server
kept serving the 18:44 bytes; `touch` did not help, `?t=` is stripped
before the module lookup). Fresh SharedWorkers therefore ran old code
until the dev server itself was restarted — check the served bytes
(`curl .../@fs/.../data-services-worker.mjs | grep <new symbol>`) before
trusting any worker-side measurement on this rig.

**Where the rest of the fling goes (single blotter, 2026-09-12 late).**
With one SSRM blotter on the dev-served OpenFin dock a fling still filled
in 5.0 s, the view's main thread saturated (17 long tasks, 8.6 s, one of
1.0 s); a CDP profile put 2.8 s of a 6.5 s window as self time inside
React's development-mode `createElement` (one per AG Grid cell component,
stack captured per element), the worker client at 6 ms. Same SSRM app
(`stomp-ssrm-minimal`), same feed, same Chromium, three flings each:
**production build 190 / 206 / 247 ms** (block reads ~100–150 ms p50,
~300 ms of long tasks) vs **`vite dev` 1 728 / 1 681 / 1 314 ms** (block
reads 630–740 ms p50 against the SAME worker — the reply waits for the
busy page; 2.5–3.2 s of long tasks). Perf judgements about scrolling must
be made on a production build; the dev server is 7–9× slower on this path.
Second, smaller factor, from the data worker's own accounting over 21 min
at the default feed rate: ingest 8 538 batches, 58 ms p50 / 245 ms p99,
**35 % of the worker thread** (`flattenRows` + `JSON.stringify` +
`apply_message_json`); tick flush 21 ms p50, 17 %; block reads therefore
queue **39 ms p50 / 980 ms p99 / 3.1 s max** behind them (engine time
7 ms). Third: the blotter reads 100-row blocks, so a fling issues 7–9
reads two at a time (AG Grid's default), each paying that queue; 200-row
blocks halve the count and `blockLoadDebounceMillis` skips the blocks a
thumb drag passes over. The engine's per-row ingest cost (~100 µs/row) is
the worker-side lever.

**Production dock, confirmed live (user's build on :5175, one blotter +
probe, 400-row blocks):** cold reload → rows 2.5 s (`platform-ready` 1.1 s,
first block 97 ms); fling scroll-stop → filled **543 ms** (dev server:
5.0 s) with 0.9 s of long tasks on the view; seven block reads of 400 rows
at 97–351 ms, three of them issued before the scroll stopped for ranges
the thumb passed over, the rest two at a time. Next levers on that
blotter: `blockLoadDebounceMillis` (~100 ms) and
`maxConcurrentDatasourceRequests` (4) on the grid's `ssrm` config, both
opt-in; worker-side, a 400-row read costs the engine 17 ms and queues
37 ms p50 / 420 ms p99 behind ingest.

**Still open.**
- Rows in a tick are full width; a column-level patch from the engine
  (the CSRM `delta-patch` shape) would cut the remaining bytes by the
  changed-column ratio.
- The grid does not tell the hub when it purges blocks, so a session's key
  set only grows (bounded by the 50 000 cap, after which the session falls
  back to full ticks). A `ssrm-blocks-dropped` hint, or `maxBlocksInCache`
  on the grid, would keep long-scrolling sessions trimmed.
- All numbers are from `vite dev` (development React, unminified AG Grid);
  a production build of the views should be measured before quoting them.
- Cold path: the 11 s between `platform-ready` and the first block read on
  a thirteenth view is widget mount time under the tick flood; re-measure
  now that the flood is gone, then profile what remains.
- Ticks keep flowing at the feed's cadence while a grid scrolls (measured
  on a hooked view: 5.8 ticks/s scrolling vs 5.9 idle, trimmed payloads);
  the worker's flush is a timer, and the grid only holds its positional
  refreshes 150 ms past the last scroll event while tick transactions
  still land mid-scroll. If scroll smoothness matters more than mid-scroll
  freshness, a scroll-aware hold on tick transactions (queue, apply when
  scrolling stops) is the follow-up.
- `stomp-ssrm1` is not `autoStart`-flagged, so the dock warms only
  `test.dp`; the provider editor's Behaviour tab now has the switch.
- Restarting the workers: page reloads never do it (the new document joins
  the old worker before it dies). Quit the dock and `npm run client`, or
  `Runtime.evaluate` `self.close()` in each `shared_worker` CDP target.

## 20. Every blotter built its AG Grid twice (2026-09-13) — fixed

**Symptom (user, production build):** the AG Grid Enterprise licence
banner printed twice per blotter, CSRM and SSRM alike.

**Cause, measured on the production dock over CDP (a DevTools hook
installed before the app ran, fiber tree diffed per commit):** the first
`AgGridReact` instance belonged to `MarketsGridContainer`'s
`key="__no_provider__"` placeholder grid, the second to the real grid
keyed `csrm::<providerId>::<rowIdField>`, ~80 ms later. The container's
identity props (userId, appId, instanceId, storage) were stable and the
grid-level data loaded once. The sequence was: `loaded` and the persisted
selection landed together; on that same render `useDataProviderConfig`
still returned its previous, null-provider view `{ cfg: null,
loading: false }` — its effect re-syncs `loading` only one render later —
so the container's "provider chosen but config loading" guard missed,
fell through to the no-provider branch and mounted a full MarketsGrid
(AG Grid + enterprise modules, licence check) for one commit. The next
render said `loading: true`, the config arrived, and the keyed grid
replaced the placeholder.

**Fix.** `useDataProviderConfig` stamps each stored view with the
providerId it describes and derives the returned view synchronously: a
view for another id (or none) reports `{ cfg: null, loading: true }` on
the very render the new id appears. `MarketsGridContainer` additionally
treats "provider chosen, no cfg, no error" as loading regardless of the
flag. Regression tests: the hook's render log never contains
`{ cfg: null, loading: false }` for a provider whose config has not
landed; the container mounts the stub grid exactly once across the
pending → loaded transition and still offers the no-provider grid when
the config fetch has failed.

**Cost of the bug** was a full grid boot per blotter on every load (in
production ~80 ms of main-thread work plus the second licence check; in
`vite dev` several hundred ms), on top of StrictMode's dev-only double
mount.

**Dev-rig notes (how it was found):** `console` stacks name the creator
of each banner (`Runtime.consoleAPICalled` carries call frames); a
minimal `__REACT_DEVTOOLS_GLOBAL_HOOK__` installed by
`Page.addScriptToEvaluateOnNewDocument` receives every commit from
production React, which lets one diff the ancestor chains of two grid
instances and read hook state per commit. A `.ag-root-wrapper` appended
straight under `document.body` is `measureNativeScrollbarWidth`'s probe,
not a grid.

## 21. CSRM blotters freeze when docked into one OpenFin Browser window (2026-09-13) — diagnosed, partial fix

**Symptom (user):** with six 20 000-row CSRM blotters docked as panes /
tabs of ONE OpenFin Browser window, updates appear to freeze the grid and
cell flashes stay lit for seconds; separate windows are fine.

**Process layout (measured via `fin.View.getProcessInfo`):** all six
views share one renderer process (pid 10932, 2.9 GB) because every view
carries `processAffinity: "star-demo"` (the shared per-app group the
reverted isolation experiment left behind, see
`docs/archive/openfin-process-isolation.md`). One process = one main
thread: every view measured the same event-loop lag (338 ms p50 / 737 ms
p95 at first, 1.4–5.5 s later in the session), visible grids painted at
4–5 fps, and the two hidden tabs burned as much as the visible ones.

**Where the thread goes (per view, 10 s, timer census + CPU profiles):**
- The feed patches ~5 000 rows/s per view (3 500 rows per 250 ms throttle
  window, 4.4 changed fields per row, 372 columns, thin deltas on,
  conflation on; 564 kB/s on the wire). Throttling already caps the frame
  rate; conflation already collapses same-key repeats.
- AG Grid's transaction path fires `rowNodeDataChanged` once per updated
  row, and two listeners schedule a timer per event: ag-grid-react's
  `RenderStatusService` (`setTimeout(processResizeOperations)`, present
  whenever the ColumnAutoSize module is registered — `AllEnterpriseModule`
  is) and an enterprise debounce that clears + re-arms. Measured:
  **189 490 `setTimeout` + 94 726 `clearTimeout` in 10 s on one view**,
  74 841 of those timers ran as separate macrotasks. The batched
  transaction flushes (`executeBatchUpdateRowData`, every 200 ms) cost
  867 ms per 10 s per view. Six views → ~115 000 timer operations a
  second on one thread.
- The data client's thin-patch merge copied the whole 372-column row for
  every 4-field patch: 16.4 ms per 3 500-row frame vs 2 ms in place.

**Done here:** `mergeThinPatches` now patches the mirrored row in place
(`Object.assign` of the changed fields; the mirror row is the very object
the consumer and AG Grid's node hold), delivering that same object.
Change detection downstream is by value (cells compare against what they
last rendered; `RowChangeBus` reads changed nodes from AG Grid's flush
event), verified by reading every old-vs-new row consumer. Saves ~14 ms
per frame per view (21–58 ms/s per view at 1.5–4 frames/s). Tests pinned
the old "new object per patch" contract and were flipped; a consumer
that needs a row's previous values copies it. Measured on the dock it
did NOT relieve the freeze: the merge was ~5 % of the thread, the AG
Grid per-row update path is the rest.

**Next — planned in [`superpowers/plans/2026-09-13-grid-apply-and-mount-refactor-plan.md`](superpowers/plans/2026-09-13-grid-apply-and-mount-refactor-plan.md) (B0–B3 for item 1, A for item 2, C opt-in only for item 3):**
1. Stop handing AG Grid every changed row. With in-place patches the
   node data is already current, so the grid only needs: rendered rows'
   cells refreshed (with flash) — ~20 rows, not 5 000; a throttled model
   refresh when a sort / filter / group column changed (the rule
   `bindSsrmTicks` already applies for SSRM); adds and removes as
   transactions; and the changed nodes handed to `RowChangeBus` directly
   for alerts / conditional styling. Cuts the per-row event and timer
   storm ~50× and helps single windows too. A real change to
   `applyProviderToGrid` + the controller + the bus, with tests.
2. Per-view renderer isolation for docked views — IN PROGRESS on branch
   `feature/openfin-view-process-isolation`: not per-view stamping this
   time but OpenFin's platform-level `viewProcessAffinityStrategy:
   "different"` in the manifest ("The views in the same domain will have
   their own renderer processes"), the seed's `processAffinity:
   "star-demo"` pins removed, and the createView/createWindow overrides
   stripping every persisted affinity while the strategy is active.
   OpenFin's caveat: "no guarantee that a different affinity value will
   create a different process, under the hood Chromium can enforce its own
   process management". To re-measure per the revert note: PIDs per view,
   per-process memory vs the 2.9 GB shared renderer, event-loop lag per
   view, and hidden-view liveness (the hidden-view freeze that caused the
   revert is now handled by `backgroundThrottling: false` + the runtime
   flags).
   **Measured 2026-09-13 (this branch, production bundle, same six CSRM
   blotters docked as four panes + two tabs in ONE Browser window):**

   | | shared renderer (before) | one renderer per view (this branch) |
   |---|---|---|
   | processes | 1 (pid 10932), 2.9 GB | 6, 505–644 MB each (~3.4 GB) |
   | event-loop lag per view p50 / p95 / max | 338 ms / 737 ms / 778 ms (later 1.4–5.5 s) | **0 / 96–153 / 150–226 ms** |
   | frame gap on visible views p50 / p95 | 200–250 ms / 350–800 ms (4–5 fps) | **17 ms / 67 ms (60 fps)** |
   | long tasks per view per 10 s | 2–6 (thread saturated by sub-50 ms tasks) | 12–22, 0.9–2.0 s (the AG Grid per-row update work, now on its own core) |
   | hidden tabs | share the saturated thread | 100 ms timers fire 70–73 of 80, lag ≤ 180 ms — alive, still processing updates |

   OpenFin stamped a unique affinity per view (`fin.View.getProcessInfo`
   shows distinct PIDs) — Chromium did not consolidate on this box (16
   renderers alive during the run). Memory per view is ~15 % higher than
   its share of the single process. The docked freeze is gone; what
   remains per view is the AG Grid per-row update cost (next item 1).
   **Windows target verification (2026-09-13, plan §7.2, 12 docked CSRM
   views, runtime 43.142.101.2):** isolation on — 13 renderer PIDs for 13
   views, 314–462 MB working set each, hidden tabs 80 of 80 ticks, lag p95
   4.9–13.5 ms at 60 fps, no long tasks. The isolation-OFF run (manifest key
   removed, same saved layout restored) came up isolated again: the runtime
   stamps a bare-uuid `processAffinity` per view under `"different"`,
   `getSnapshot()` persists it, and the no-strategy cleanup only knew
   `view-iso-*`. Fixed in `stripLegacyViewIsolationAffinity.ts` (uuid
   affinities are isolation artefacts too, tests added). Re-run with the fix
   built in, same saved layout: 2 renderer PIDs for 13 views (all 12
   blotters in one, private 3 346 MB vs 3 837 MB summed over the 12 isolated
   processes, +15 %); lag p95 197–221 ms and 39–40 fps on the visible views
   against 4.9–13.5 ms and 60 fps isolated; timers 38–74 per view per 10 s
   either way. Phase A decision inputs are in the plan's §A. Also measured:
   `view.getOptions()` reports `backgroundThrottling: true` even for a view
   created with `false` — judge throttling by liveness, not by that option.
3. Pause fan-out to hidden subscribers in the hub (it already knows
   `meta.hidden`) and replay from cache on visibility.

**B0 + B1 measured (2026-09-13, plan B0 acd4b23 / B1 24abcb1):** with
`Find` dropped from the registered modules (its `FindService` debounce was
the `clearTimeout` + `setTimeout` pair) and streaming updates applied in
place — rendered rows refreshed in one `refreshCells` per flush window,
changed nodes handed to `RowChangeBus.noteRowsChanged`, a transaction only
for rows whose sort / filter / group / aggregate key changed — one docked
view per 10 s went from 189 490 `setTimeout` + 94 726 `clearTimeout` to
22–46 + 0–5, and the batch flush from 867 ms to 0 (`refreshCells` ≤ 20 ms).
Production preview, isolation on, 12 views: visible views 5–8 % busy at
120 fps, no long tasks. Hidden docked tabs report
`document.visibilityState === 'hidden'`, keep their 100 ms timers and keep
receiving the feed (owner decision, plan Phase C); they spend 10× longer in
`mergeThinPatches` than visible tabs for the same frames — background
scheduling of the hidden process, to be confirmed in plan B3. The
no-isolation six-view lag run is owed to the plan's §2 as confirmation.

**B2 measured and built (2026-09-13):** one CSRM view (20 000 rows, 372
columns, 15 ticking) on the production dock, census + CPU profile per grid
state, 10 s each — default 71 `setTimeout`; sorted by a ticking column
23–45 k; grouped two levels with ticking aggregates 23.5 k; filtered on a
static column ≈ 3.3 k (first-touch tail); the toolbar-date row exclusion on
44.7 k with 1.6 s of `executeBatchUpdateRowData`, because an external
filter could not be attributed to columns and every updated row rode a
transaction. Now the toolbar-date module declares the columns its expression
reads on `GridPlatform.externalFilters` (`ExternalFilterColumnRegistry`,
`collectColumnRefs`) and the apply path treats them as key columns: the
same state measures 2 117 timers and 64 ms, rendered rows refreshed in
place. The remaining tens of thousands in the sorted / grouped states are
ag-grid-react's autosize flush (`setTimeout(processResizeOperations, 0)`
once per `rowNodeDataChanged`); their cost is the re-sort / re-aggregate per
flush window, paid only for rows whose key changed. `npm run check:loc`
compared backslash paths with its POSIX baseline on Windows and reported
every baseline file as new — fixed.

**Dev-rig notes:** `fin.View.getProcessInfo()` from the provider page maps
views to PIDs; wrapping `setTimeout`/`clearTimeout` in an init script and
bucketing by callback source finds timer storms that CPU profiles only
show as native self time; concurrent per-isolate CPU profiles on a shared
thread over-attribute wall time (sum across views exceeded the window
12×) — use them for ranking within a view, never for absolute cost.

## Pre-existing, tracked elsewhere

Not repeated here to avoid two lists drifting — see
[`PACKAGING_CHANGELOG.md` § Open items](archive/PACKAGING_CHANGELOG.md#open-items):

1. Duplicate worker chunk in demo output (~249 KB; demo output only)
2. Test coverage / Sonar LCOV — none of the tooling exists yet
3. ESLint `unicorn/filename-case` per-bucket enforcement

Item 1 there refers to "in-repo demos", which now live under `apps/source/` —
the fix belongs in those apps.
