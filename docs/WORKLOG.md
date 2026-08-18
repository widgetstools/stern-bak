# Worklog — outstanding items

> **2026-08-14 (feature/simplify):** `EXTERNAL_CONSUMPTION.md`, `MARKETSGRID_USAGE_GUIDE.md`, `STOMP_DATAPROVIDER_MARKETSGRID_GUIDE.md`, and the hosted-wrapper README were **deleted** — every one referenced packages, scripts, or apps that no longer exist. Phase 7 of the simplification roadmap rewrites consumer docs from scratch; `docs/latest/` remains the accurate set. Worklog entries below referring to those files are historical.
>
> **2026-08-14 (Phase 7):** the stale-docs refresh pass landed (former item 13 — closed): live docs' pre-collapse paths/names fixed, docs whose subject no longer exists deleted, `docs/superpowers/` dissolved into `docs/archive/`. Item 3 closed the same day: `host-data-angular` is deleted, not excluded.

Single index of known-open work in this repo — which, since 2026-08-02, again
includes the consumer/demo apps: the `stern-apps` repo was merged back
under [`apps/`](../apps) (git subtree, history preserved) once every package
held the 70% per-file coverage bar. Older entries that say "stern-apps" refer
to what is now the `apps/` tree; the separate remote is historical.

Each entry states what is wrong, why it was left, and what "done" looks like, so
it can be picked up cold. Close an item by deleting its section in the same
change that fixes it.

Last updated: 2026-08-02.

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
  in `EXTERNAL_CONSUMPTION.md` §1 (deleted — git history).

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


## 14. First-run catalog read stalled once — class closed, forensic cause unproven

**Area:** `packages/data/host-data` (worker) · **Blocked on:** recurrence

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

---

## 15. SSRM engine follow-ups from the hardening pass (2026-08-12)

**Area:** `packages/data/host-data/src/runtime/ssrm/` · **Blocked on:** nothing — technical debt only

> **2026-08-16:** the `QueryEngine.ts` 834-LOC item is **closed** —
> [`docs/SSRM_PARITY_ROADMAP.md`](./SSRM_PARITY_ROADMAP.md) Phase 1 took the
> documented tree-data split (`treeIndex.ts`); the engine is 744 LOC.
> That roadmap also supersedes the framing of this entry's opening line — a
> parity audit found 36 divergences, 21 of which **do** affect correctness,
> and Phase 1 closed seven of them inside this directory.

Deferred, non-blocking items from the ssrm-engine-hardening plan's final review; none affect correctness:

- Snapshot arriving mid-window drops pendingCount from updatesAccumulated totals (SsrmServer.ts:396-415) — cosmetic counter drift under snapshot churn.
- Any session's configureExpressions clears the whole shared order cache (QueryEngine.ts:161) — transient memo warm-up cost when many blotters push rules at mount; correctness unaffected.
- engineBoundary.test.ts only matches static import specifiers; dynamic import('../worker/...') would slip through.
- fanSsrmFlush rebuilds+enriches the full changed-key row set per filtered session per flush — N-sessions × changed-set work; window cadence bounds it.
- RowStore.emit() has no per-listener try/catch (pre-existing; flush path is isolated, raw onTick is opt-in).
- SsrmStats is exported from @wellsfargo-starui/data/ssrm-engine but not the ./runtime barrel.
- createSsrmStatusBar: mount load doesn't stamp lastLoadAt (one duplicate RPC possible per panel mount); burst-trailing and unmount-pending-timer paths untested; 2s fallback poll runs even for tick-capable providers.
- docs/latest/ssrm-engine.md: ICacheIngest listing omits clear(); pseudocode uses illustrative type names not in the codebase.

## 16. v2-column-value-getter.spec.ts: the "authors a column valueGetter" case fails — pre-existing

**Found:** 2026-08-13, during the Phase-1 StarGrid migration of
`stomp-marketsgrid-minimal`. **Not a migration regression** — verified by
stashing the migration, rebuilding packages, and re-running: the spec fails
identically against the old `HostedMarketsGrid` mount.

The editor flow passes (opens Columns tab, authors
`CONCAT([region], "/", [country])` on `region`, saves); after the reload the
assertion `locator('.ag-grid-scrolling-cells [col-id="region"]')` times out —
the rendered column window ends at `Trader` and no `region` cell exists in the
DOM. The file's other two cases (validation-only, no grid-cell assertions)
pass. Suspects, unverified: the seeded column set / order changed so `region`
now sits beyond the horizontally-virtualized window at 1280px, or the
`STOMP_PROVIDER_CFG_VERSION` refresh replaced a column list that previously
placed `region` in view. Last known green: `e1cf395` (2026-08-11, AG Grid 36
selector sweep). Fix belongs with the spec (scroll the column into view the
way `hello-blotter.spec.ts` does, or pin the column) or with the seeded
column order — decide when picking this up.

## Pre-existing, tracked elsewhere

Not repeated here to avoid two lists drifting — see
[`PACKAGING_CHANGELOG.md` § Open items](archive/PACKAGING_CHANGELOG.md#open-items):

1. Duplicate worker chunk in demo output (~249 KB; demo output only)
2. Test coverage / Sonar LCOV — none of the tooling exists yet
3. ESLint `unicorn/filename-case` per-bucket enforcement

Item 1 there refers to "in-repo demos", which now live under `apps/source/` —
the fix belongs in those apps.

---

## 17. SSRM/CSRM behavioural parity — 36 divergences (2026-08-16)

**Area:** `packages/core/engine/src/customizer/modules/`,
`packages/data/host-data/src/runtime/ssrm/`,
`packages/react-grid/widgets-react/src/container/` ·
**Blocked on:** nothing — sequenced work
**Plan:** [`docs/SSRM_PARITY_ROADMAP.md`](./SSRM_PARITY_ROADMAP.md) (11 phases, one per session)

A four-layer audit found SSRM and CSRM grids at parity in *chrome* and not in
*behaviour*. Only five `ssrm` guards exist in all of
`packages/react-grid/grid/src/widget/`, and nothing in the customizer is
row-model aware — `PlatformHandle` has no row-model field
(`platform/types.ts:263-278`) and the one place that anticipated one is a TODO
(`useSsrmExpressionBridge.ts:61-62`). Sixteen modules therefore run their CSRM
implementations against a ~2,000-row block cache.

**10 findings produce confidently wrong output**, including Advanced Filter
returning the entire unfiltered dataset (`ssrm/filter.ts:231`), nested-path
columns broken across filter/sort/set-values, and aggregate calculated columns
rendering a total that revises itself as the user scrolls. **11 are silent
no-ops** — notably every editing write path, which funnelled into
`applyTransactionAsync` (`editing-core/applyPatches.ts:14`, a
ClientSideRowModel-only API) while `EditJournal` recorded the edit as
successful *(closed by Phase 4 — writes go through `platform.data.mutate()`
and the journal records only confirmed cells; an SSRM edit still does not
survive a block refetch, which needs a per-session edit overlay in the query
plane — see the phase's decision 1)*, and the row-change delta hot path,
which under SSRM emitted a `full` structural change with three empty arrays on
every streaming tick *(closed by Phase 5 — `applyServerSideTransaction`'s
result is reported through `RowChangeSink`, and the filter-pill badges patch
from it: ten ticks over one row went from 22 worker round trips to 4, counted
in `useFilterModel.test.ts`)*. The rest were controls that accept input and
do nothing under one row model *(closed by Phase 6 — `data:capabilitiesChanged`
plus `useCapability` / `useCapabilityGate` put the capability copy on screen:
the bulk-update distinct dropdown reads through `platform.data.distinct()`,
Excel export confirms its scope, header paint and row exclusion disable with a
stated reason, and the custom aggregation expression closes Phase 1's
hand-off)*. **15 are container wiring gaps** *(closed by Phases 7–10: the SSRM
container now `extends Omit<MarketsGridProps, …>` and spreads the rest, so
`StarGrid.advanced` reaches it; caption, grid events, `appData`, `adminActions`,
`onError` and Config Browser routing all match CSRM; the loading overlay,
provider-failure shell and historical-date round trip landed in Phase 8; and a
provider's declared `columnDefinitions` reach the grid intact in Phase 9)*.

**Status: 11 / 11 phases complete (2026-08-17).** `npm run lint:all` now fails
on a customizer module that touches the row model directly —
`no-restricted-properties` over both halves of `customizer/modules/**`, with
ten annotated exemptions each naming why it is about the grid's DISPLAY rather
than the dataset. `docs/current-features.md` §366–390 was corrected phase by
phase.

**Four findings remained open. They are now sequenced as Phases 11-14 in
[`docs/SSRM_PARITY_COMPLETION.md`](./SSRM_PARITY_COMPLETION.md) — see item 20
below**, which supersedes the scoping notes that were here. Three of them
(T1-4, T2-4's real fix, an SSRM edit surviving a block refetch) wanted ONE
thing, a per-session layer the query applies before it pages; `293e2d2` built
it (`SessionOverlay`), so what is left is plumbing rather than design. The
fourth (T2-6, the alerts bell) is unchanged in shape and still needs its own
session. The fifth item recorded here — **two windows on one historical
provider** — is closed as **not a defect**: it is architectural and CSRM
behaves identically.

---

## 18. `npm run lint:all` fails on a test-only member cycle in the types bucket — CLOSED 2026-08-17

**Closed** together with a second, independent failure in the same command
(below). `npm run lint:all` now exits 0, which matters because Phase 10's
row-model ESLint rule reports into it: until now a new violation would have
landed in a command that was already red for two unrelated reasons, and
nobody could have told them apart.

**Fix 1 — the member cycle.** `check-package-cycles.mjs`'s MEMBER walk now
skips `*.test.*` / `*.spec.*` files and `__tests__` / `__mocks__` directories.
Test files are excluded from every package's build (`tsconfig.json`'s
`exclude`) and are absent from `dist`, so they are not part of the shipped
topology that graph describes. Deliberately scoped to the member walk:
`loadImportGraph` keeps walking tests because it also feeds the
undeclared-import check, where a test's import genuinely does need its
dependency declared. Verified both ways — a non-test back edge still FAILS,
the same edge from a test file passes.

**Fix 2 — `check:design-system-deps` was scanning the wrong tree entirely.**
Its roots named `packages/shared/{foundation,runtime,services,platform}`,
`packages/react` and `packages/angular`: a layout that no longer exists, so
none of the six resolved and the check had silently stopped guarding any
package at all. What it DID still scan was `apps/` — which is its own npm
install root, deliberately outside the root workspaces, turbo, lint, the
coverage gate and Sonar — so it failed on nine demo apps for a workspace
dependency they neither have nor should declare. It now reads the seven
buckets from the root manifest's `workspaces` list (not a walk for any
package.json, which found private build shims like `packages/core/engine`
and demanded they declare a dep the enclosing bucket already declares), and
scans the whole bucket directory rather than a `<bucket>/src` that does not
exist. Verified: passes on the real tree, and FAILS when
`@wellsfargo-starui/core` — which does reference `--ds-*` — has the
dependency removed.

---

<details>
<summary>Original report</summary>

**Found:** 2026-08-16, during SSRM parity Phase 1. **Pre-existing** — verified
by stashing the phase's changes and re-running `node
scripts/check-package-cycles.mjs` on the clean tree, which fails identically.

```
FAIL member-level imports (bucket subpaths + relative escapes): 1 cycle(s)
  @wellsfargo-starui/types#types → @wellsfargo-starui/types#shared-types → @wellsfargo-starui/types#types
```

The forward edge is real and intended: `types/src/dataProvider.ts` (and
`configuration.ts`, `fieldSelector.ts`) re-export from
`@wellsfargo-starui/types/shared/*`, which is how the bucket keeps one
definition behind two import paths. The back edge is a **test file** —
`shared-types/src/themeKeyParity.test.ts:3` imports `../../types/src/index` to
assert the two members' theme keys agree, i.e. exactly the kind of
cross-member reach a parity test is for.

So `check-package-cycles.mjs` walks `*.test.ts` when it collects member-escape
edges, and a test-only edge is reported as a shipped cycle. `lint` itself is
clean (0 errors, 369 warnings); `check:deps` is what fails, which takes
`lint:all` down with it. Done looks like: the member walk skips test files (or
the parity test reaches the sibling through the package's public
`@wellsfargo-starui/types` specifier), and `lint:all` exits 0.

</details>

---

## 19. How far does the SSRM query plane scale? — MEASURED 2026-08-17

**Why:** a proposal to rewrite the query plane as a Rust/WASM component. Every
one of the 36 SSRM parity findings was a WIRING defect — not one was "too
slow" — so the case for a rewrite rests entirely on scale, and nobody had
measured it. `npm run bench:ssrm:sweep` runs `bench-ssrm.mjs` once per dataset
size in its own process (heap figures need a fresh heap) and reports growth
factors so superlinear behaviour is visible rather than inferred.

**Conditions:** node, 40 columns, machine load 4–8, `--max-old-space-size=12288`.
Node only — no browser, no AG Grid, no React — so a real tab hits every ceiling
below *sooner*, not later.

| metric | 100k | 250k | 500k | 1M | growth (10× rows) |
|---|---|---|---|---|---|
| ingest (`replaceSnapshot`) | 586 ms | 1461 | 2960 | 6174 | 10.5× |
| **store heap** | **41 MB** | **98** | **197** | **393** | **9.6×** |
| sorted block, cold | 127 ms | 423 | 975 | 2135 | 16.9× |
| filtered + sorted, cold | 46 ms | 144 | 304 | 688 | 14.9× |
| grouped, cold | 48 ms | 121 | 244 | 574 | 12.1× |
| quick filter, cold | 25 ms | 78 | 178 | 427 | 17.3× |
| full-store fold (`SUM`) | 153 ms | 440 | 1009 | 2413 | 15.8× |
| distinct scan (997 values) | 18 ms | 45 | 74 | 173 | 9.8× |
| 20-block scroll | 143 ms | 415 | 905 | 2274 | 15.9× |
| **2000-row tick** | **6.9 ms** | **7.4** | **7.5** | **7.6** | **1.1×** |
| total heap | 278 MB | 676 | 1344 | 2681 | 9.6× |

### Conclusion: no cliff, and the binding constraint is MEMORY, not CPU

**Nothing falls over.** 1M rows × 40 cols completes every operation with no
OOM. The 15–17× growth flagged on the sort-based paths is not a cliff — 10×
rows under n·log n is ~12×, and the rest is cache behaviour at a larger working
set. Quadratic would have been 100×.

**The streaming path is size-independent.** A 2000-row tick costs 6.9 ms at
100k and 7.6 ms at 1M — 1.1× for 10× the data. That is what a live blotter
does all day, and it does not care how big the store is.

**Memory is what runs out first.** Total heap reaches 2.7 GB at 1M rows *in
node*. Add a browser, AG Grid and React and 1M rows is not viable at any
engine speed. Store heap is a clean linear 41 MB → 393 MB.

**Where interactivity goes:** cold sort and 20-block scroll cross ~1 s between
250k and 500k. Comfortable at 100k (127 ms / 143 ms), fine at 250k
(423 / 415), degrading at 500k (975 / 905), poor at 1M (2135 / 2274).

### Recommendation: the sweep does not justify a Rust/WASM engine today

At the sizes this platform actually runs, the plane is comfortable. Revisit
**only** if a real requirement for 500k+ rows in a browser appears — and note
that the argument then is **columnar memory layout, not raw speed**: a typed
columnar store could plausibly cut the 393 MB store heap by a large factor,
which is the ceiling that binds, whereas the CPU numbers at 500k are
inconvenient rather than disqualifying.

The three open findings (T1-4, row exclusion at source, edit overlay) remain
the WRONG justification for a rewrite — they are ~2 sessions of JavaScript
against the existing plane.

**If it is ever revisited:** build one operation behind a third
`GridDataPort` adapter, keep the JS engine, and run both against the existing
conformance suites — `portContract.test.ts` (49 cases, already written to run
against multiple adapters), `filterPredicate.test.ts` (40),
`engineContract.test.ts` (37). Do not port the expression DSL
(`core/engine/src/expression/`, ~2,030 lines) in a spike; size it separately.

**Re-run with:** `npm run bench:ssrm:sweep` ·
`SWEEP_ROWS=… SWEEP_COLS=… SWEEP_HEAP_MB=… npm run bench:ssrm:sweep`

---

## 20. The SSRM parity tail — 4 findings, 4 phases (2026-08-17) — 3 / 4 DONE

**Area:** `packages/data/host-data/src/runtime/ssrm/`,
`packages/data/host-data/src/runtime/worker/`,
`packages/react-grid/grid/src/`, `packages/react-grid/widgets-react/src/container/` ·
**Blocked on:** nothing — sequenced work ·
**Plan:** [`docs/SSRM_PARITY_COMPLETION.md`](./SSRM_PARITY_COMPLETION.md)
(4 phases, one per session)

Item 17's roadmap closed 32 of 36 findings and recorded four as needing their
own sessions. Those four are now sequenced as **Phases 11–14**, continuing the
roadmap's numbering. Two commits since it was written changed what remains:

- **`293e2d2`** built `SessionOverlay` — the per-session query layer that
  three of the four findings were all waiting on. `QueryEngine` exposes
  `setSessionPatches` / `clearSessionPatches` / `setSessionExclude` and
  `SessionOverlay.test.ts` pins 15 cases including the sharing-model
  invariant. **No client can call any of them**, so what was a design problem
  is now plumbing with an exact template (`configureExpressions`, 7 hops).
- **`76489fe`** built the edit write-back path. `EditWriteBack.onFailure`
  reports `{ error, rolledBack, stuck }` on a refused write and **nothing
  listens** — a rejected edit reverts silently. That is why the smallest phase
  is scheduled first.

**Phase 11 — DONE 2026-08-17.** `GridToastSurface` (sonner; shadcn's
`useToast` holds `TOAST_LIMIT = 1`, so its second message evicts the first)
mounts once per document from `MarketsGrid`/`MarketsGridCore`, and
`reportEditFailure` raises two toasts — reverted expires, **stuck does not**.
`MarketsGridContainer` chains the host's `onSavingChange` instead of dropping
it (latent: nothing in the tree passed it, said so in the record rather than
inflated). **The pagination finding was NOT A DEFECT** and closed as such:
AG Grid's native count components never consult pagination — `_getTotalRowCount`
/ `_getFilteredRowCount` walk the whole model — so the SSRM panels were already
right and a page-aware version would have been the divergence; verified by
mounting a real CSRM grid at `pagination: true` and reading the DOM, now pinned
by `createSsrmStatusBar.pagination.test.tsx`. Establishing that surfaced two
divergences that WERE real, both fixed: the filtered panel's label is
AG Grid's own default "Filtered", and it hides while `filtered === total` as
`FilteredRowsComp` does. **Open, recorded not banked:** no e2e — no app in
`apps/` registers an `editWriteBack`, so no browser path can produce a refused
write; and `MarketsGridContainer.tsx` sits at 825 lines against the 800 ceiling
(already 815 at `df48fdf`, one of 28 files in `packages/` currently over).

**Phase 12 — DONE 2026-08-17,** in two commits in the order the phase demanded.
`dae3b7d` split `QueryEngine.ts` 895 → 765 (`queryAggregation.ts`,
`querySort.ts`; `treeBlock` deliberately stayed — it needs four pieces of
engine state) and took `getRows` from 96 lines to 33 via `groupBlock`. Then the
seven RPC hops: `ssrm-set-session-patches` / `ssrm-set-session-exclude` reach
`SessionOverlay`, `SsrmDataAdapter.mutate` records the **edited fields** (not
the assembled row) so an SSRM edit survives a block refetch, and row exclusion
crosses as an **expression** — a function does not survive a structured clone —
compiled in the plane through `evaluateRowExclusion`, which **moved into
`@wellsfargo-starui/core`** so the worker and the client-side external filter
share one meaning. `GridDataPort.setRowExclusion` is how the module says it:
`activateRowExclusion` used to call `api.onFilterChanged()`, a
branch-on-row-model hiding in a module that never wrote `if (ssrm)`. **The
shared-path gate had to be built before it could gate anything** —
`bench:ssrm` never passed a `sessionId`; it now measures the sharing as memo
hits/misses with three rows that MUST read 0, and all three do. Cold timings
looked 15% worse until a stash-to-baseline re-run showed machine drift; every
warm number is 0.0 ms either side. **Open:** `protocol.ts` (831) and
`SharedWorkerDataServicesClient.ts` (1289) are over the 800 ceiling and were
already over before the phase (801 / 1249).

**Phase 13 — DONE 2026-08-17.** T1-4. The gap was total and was measured before
anything was designed: a filter on a calculated column matched **nothing** (an
empty grid), a sort on one was a silent no-op, a group on one collapsed to a
single `""` bucket, and `sum()` over one read 0 — enrichment on the returned
page was already right, which is why it stayed invisible until someone sorted.
The fields now materialise in `SessionOverlay`'s per-session row view before
the filter runs, and the affordability rests on ONE line: `requestReadsAnyField`
makes it opt-in per QUERY, not per session, so a grid that merely HAS a
calculated column keeps sharing the plane's cache. Rules are in the cache key
(`rulesRevision`) and materialisation is memoised per row in a `WeakMap` —
sound because `RowStore` never mutates a stored row in place. Two things the
tests found that the design had not: a session's row-EXCLUSION expression can
read a calculated column (nothing in the request reveals that, so excluding
counts as reading everything), and `enrich` would have re-evaluated every rule
on the sliced page, making a self-referencing expression answer differently
depending on whether the query happened to sort on it. Parity is pinned against
a **real AG Grid** running the real `buildVirtualColDef` valueGetter, not
against arithmetic. Cost: ~190 ms cold for the whole-store pass, **1.5 ms per
warm block**. `QueryEngine.ts` went 778 → 894 and was brought back to **772**
in the same phase (`queryFilter.ts`, `queryColumnRefs.ts`). **Also corrected
here:** Phase 11's ESLint check used a pattern that never matched the default
formatter, so its "0 → 0" was vacuous — re-audited, the conclusion held (no
file's count rose) but `createSsrmStatusBar.tsx` was 1 → 1 and Phase 11 grew
that function 102 → 105 lines; now 0. **Open:** an aggregate that folds a
calculated column (`SUM([total])` where `total` is itself calculated) still
folds undefined — `aggregateScope` iterates raw store rows. Pre-existing.

**Phase 14** (full, no entry) — T2-6, the alerts bell. A new worker→client
message kind carrying hits (row key + rule id) addressed by `sessionId`,
across three packages, plus a dedupe against `__ssrmAlert`.

**Closed as not-a-defect:** *two windows on one historical provider fight for
its single snapshot*. Architectural, and **CSRM behaves identically**, so it
is not a parity finding. Reopen as a product decision about historical
providers if it ever matters.

**Estimate: 1 full session remaining** — Phase 14, which never had an entry
dependency.
