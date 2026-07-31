# Worklog — outstanding items

Single index of known-open work across **both** repos:

- `widgetstools/stern-bak` — this repo, the library monorepo (`@wellsfargo-starui/platform`)
- `widgetstools/stern-apps` — the consumer/demo apps (`@wellsfargo-starui/apps`)

Each entry states what is wrong, why it was left, and what "done" looks like, so
it can be picked up cold. Close an item by deleting its section in the same
change that fixes it.

Last updated: 2026-07-31.

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

## 4. 326 files still below 70% line coverage

**Repo:** stern-bak · **Branch:** `test/coverage-70` · **Blocked on:** nothing, just volume

The coverage infrastructure is in place and enforcing; the tests are not written
yet. `npm run test:coverage && npm run check:coverage` reports the live number.

**Progress:** 484 / 810 files at or above 70% (59.8%), from 412 / 806 at the
start. All 21 packages now have a real suite — five had none at all — and 15 of
the 21 clear the gate outright.

**Where the remaining gap is concentrated:**

| Package | Files < 70% |
|---|---:|
| `grid` | 164 |
| `ui` | 54 |
| `engine` | 42 |
| `widgets-react` | 30 |
| `openfin-platform` | 23 |
| `config-browser` | 13 |

**→ Session-by-session breakdown, conventions and progress log:
[`COVERAGE_PLAN.md`](./COVERAGE_PLAN.md).** ~14 sessions remaining. Read its
`## Conventions` before writing tests.

**Notes for whoever picks this up:**

- The gate is `thresholds: { lines: 70, perFile: true }` in
  `scripts/vitestCoverage.mjs`. It only bites under `npm run test:coverage` —
  plain `npm test` runs without `--coverage`, so the suite stays fast and green.
- React components must be tested with React Testing Library, enforced by
  `npm run check:rtl` (wired into `lint:all`).
- Barrels are safe: a file with zero executable lines scores 100%, so pure
  re-export `index.ts` files do not need tests.
- `docs/package-coverage-and-sonar-lcov.md` suggests 60% per package; this gate
  is deliberately stricter at 70% per file. Reconciling the two numbers is a
  decision nobody has made.
- Work smallest-gap-first — each package cleared is one that can never regress.

## 5. 25 icons cannot be recoloured or themed

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

## 6. `resolveBrowserIdentity` ignores the userId it is given

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

## 7. Two config factories hand out shared mutable defaults

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

## 8. Three defects in `workspace-setup-react`, all pinned not fixed

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

## Pre-existing, tracked elsewhere

Not repeated here to avoid two lists drifting — see
[`PACKAGING_CHANGELOG.md` § Open items](./PACKAGING_CHANGELOG.md#open-items):

1. Duplicate worker chunk in demo output (~249 KB; demo output only)
2. Test coverage / Sonar LCOV — none of the tooling exists yet
3. ESLint `unicorn/filename-case` per-bucket enforcement

Item 1 there refers to "in-repo demos", which now live in stern-apps — the fix
belongs in that repo's `source/` apps.
