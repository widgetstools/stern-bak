# Worklog — outstanding items

Single index of known-open work across **both** repos:

- `widgetstools/stern-bak` — this repo, the library monorepo (`@wellsfargo-starui/platform`)
- `widgetstools/stern-apps` — the consumer/demo apps (`@wellsfargo-starui/apps`)

Each entry states what is wrong, why it was left, and what "done" looks like, so
it can be picked up cold. Close an item by deleting its section in the same
change that fixes it.

Last updated: 2026-08-01.

---

## 1. ~34 e2e specs target the deleted `demo-react`

**Repo:** stern-apps · **Blocked on:** a product decision, not a fix
**Detail:** [`E2E_STATUS.md`](https://github.com/widgetstools/stern-apps/blob/main/E2E_STATUS.md)

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
manifest, so retargeting is plausible but unverified.

---

## 2. `eslint.config.mjs` references deleted packages

**Repo:** stern-bak · **Blocked on:** a repo hook that forbids agent edits to that file

Stale after the deletions in `7e4a674` and `47c802a`:

- `FRAMEWORK_ADAPTERS` still lists `@wellsfargo-starui/app` (deleted)
- `APP_REVERSE_DEP` guards against importing `@wellsfargo-starui/app` — a rule
  for a package that no longer exists, plus its usage block on `OPENFIN_GLOBS`
- lint globs for `packages/angular-core/**`, `packages/angular-grid/**`,
  `packages/angular-ui/**` (all deleted)

**Nothing is broken** — the patterns simply match nothing. This is dead config,
not a failure.

**Done looks like** a human pass removing those entries. One edit, no logic
change. The hook exists to stop agents weakening lint config, which is why it
was respected rather than bypassed.

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
- they cannot follow the light/dark theme, which `CLAUDE.md` requires
  ("no hardcoded hex anywhere")

The list is pinned in `allIcons.test.ts` as `KNOWN_HARDCODED_COLOUR`, with a test
that fails if the set grows. **Done looks like** regenerating those SVGs with
`currentColor` and deleting their entries from that list.

## 5. `resolveBrowserIdentity` ignores the userId it is given

**Repo:** stern-bak · **Blocked on:** deciding whether the fix is safe

`packages/shared/host-browser/src/identity.ts` hardcodes:

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

- `packages/shared/shared-types/src/dockConfig.ts` — `createMenuItem()` does
  `windowOptions: partial?.windowOptions || DEFAULT_WINDOW_OPTIONS`. Every menu
  item created without explicit options aliases the **same** object, so a dock
  editor writing `item.windowOptions.width = 900` resizes every other item that
  took the default. Same for `viewOptions` / `DEFAULT_VIEW_OPTIONS`.
- `packages/shared/shared-types/src/dataProvider.ts` —
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

Every library build is `rimraf dist && tsc` (required, see `CLAUDE.md` — it
defeats a TS5055 on Turbo cache-restore). That leaves a window where `dist/`
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
  [`PACKAGING_CHANGELOG.md`](./PACKAGING_CHANGELOG.md) §6 and the verified promise
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
[`docs/superpowers/specs/2026-08-01-package-bucket-realignment-design.md`](./superpowers/specs/2026-08-01-package-bucket-realignment-design.md).

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
[`docs/superpowers/specs/2026-08-01-package-collapse-design-system-design.md`](./superpowers/specs/2026-08-01-package-collapse-design-system-design.md),
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

**Next:** sub-phase 2 (`openfin` bucket — `host-openfin` +
`openfin-platform`), per the roadmap in
[`docs/superpowers/specs/2026-08-01-package-collapse-design-system-design.md`](./superpowers/specs/2026-08-01-package-collapse-design-system-design.md).

**Still true:** collapsing 21 vitest configs → 7 breaks the two-level
`packages/<bucket>/<pkg>/coverage/` scan in `run-test-coverage.mjs` and
`check-package-coverage.mjs`, and the latter's "package has no real test script"
check must be re-expressed **per member**, or a suite-less member hides inside a
bucket its siblings carry.

**Done looks like:** folders moved (names unchanged, tree green) → buckets
collapsed to one `package.json` each → `check-package-cycles.mjs` taught to treat
`packages/<bucket>/<member>/` as graph nodes and to follow *relative* imports, so
intra-bucket cycles stay caught → `pack:npm` emits 7 tarballs → a scratch app
outside the workspace installs them with no aliases and asserts
`ag-grid-enterprise` absent for a `react`-only consumer and `react` absent for a
`data`-only consumer.

**Constraint that falls out:** `packages/<bucket>/<member>/src/` is load-bearing
once buckets collapse — it is the only surface the boundary checker can stand on.
Do not flatten members into a single `src/` per bucket.

---

## Pre-existing, tracked elsewhere

Not repeated here to avoid two lists drifting — see
[`PACKAGING_CHANGELOG.md` § Open items](./PACKAGING_CHANGELOG.md#open-items):

1. Duplicate worker chunk in demo output (~249 KB; demo output only)
2. Test coverage / Sonar LCOV — none of the tooling exists yet
3. ESLint `unicorn/filename-case` per-bucket enforcement

Item 1 there refers to "in-repo demos", which now live in stern-apps — the fix
belongs in that repo's `source/` apps.
