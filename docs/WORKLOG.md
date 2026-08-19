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

## 1. ~~35 e2e specs target the deleted `demo-react`~~ — RESOLVED 2026-08-18

**Area:** `apps/e2e` · **Resolved by:** deleting them
**Detail:** [`apps/E2E_STATUS.md`](../apps/E2E_STATUS.md)

The app curation deleted `demo-react`, the suite's default `baseURL` target. 33
specs were written against its markup — they wait on
`[data-grid-id="demo-blotter-v2"]`, which no surviving app renders — so they
failed at setup rather than silently passing. Two more targeted
`markets-ui-react-reference` on `:5174`, an app that was never in this repo.

**Resolution:** the 35 orphaned specs and their five now-unreferenced helpers
are deleted, and `settingsSheet.ts` is trimmed to the three exports the
surviving specs import. **The suite is 74/74 green across three consecutive
full runs**, down from 50 spec files to 15.

Selection rule, so the record is checkable: a spec was deleted only if it both
(a) depended on `demo-blotter-v2` or the `:5174` app, and (b) had zero passing
tests in the measured run. Every spec with at least one passing test was kept —
which is why seven `markets-grid-lab` specs that reach `demo-blotter-v2` only
through a shared helper are still here.

`visual-reference-capture.spec.ts` went with them: demo-react-bound, and its
default output path (`process.cwd()/docs/visual-reference/v1`) was already wrong
now that Playwright runs from `apps/`. The snapshots it once produced were
dropped from `docs/` in 2026-08-02; regenerating them needs a spec written
against an app that exists.

**Accepted coverage loss.** These were the only end-to-end cover for profile
lifecycle/isolation/stress, column groups, column templates, conditional
styling, the filters and formatting toolbars, general settings, popout windows,
autosave, two-grid isolation, row exclusion, nested-field variants, and the
config seed round-trip. Those behaviours keep unit cover in `packages/`
(formatter 30 test files, expression 26, filters 21, conditional styling 20,
profiles 13, templates 12, calculated columns 7, column groups 5, general
settings 5, row exclusion 5, popout 4), but a unit test does not exercise the
browser paths these did: real AG Grid rendering, IndexedDB persistence across a
reload, and a second OS window. **Recovery is under way** against `markets-grid-lab`, which does render the
full customizer: [`docs/E2E_RECOVERY_PLAN.md`](./E2E_RECOVERY_PLAN.md) sequences
29 of the 35 across 8 phases, and names the 6 it would leave. Phase 1 (profile
lifecycle, 21 tests) is done; the suite is 95 green.

**Also here:** `e2e-openfin/` no longer points at the deleted
`e2e-openfin-workspace`; its config launches `star-demo` and its README says so.
Left alone.

---


## 4. 25 icons ship a fixed palette — CLOSED 2026-08-18 (was mis-framed)

**Repo:** stern-bak

This was carried as "25 icons cannot be recoloured or themed", citing the
module's own doc comment as claiming otherwise. Investigating it inverted the
finding.

The 25 are a **deliberate** curated set — trading actions and flows — and
`allIcons.ts` says so at the block itself: *"These ship with hardcoded hex
fills so they keep their stylized colour identity in both themes."* `buy` is
green, `sell` is red, `crypto` is gold; `algo` and `connectivity` use five
colours to distinguish nodes. Collapsing them to `currentColor` would make
profit and loss identical. They are saturated mid-tones, so they read on light
and dark alike — the "100% dark/light" rule is met, just not via
`currentColor`.

**What WAS wrong**, and is fixed:

1. The module header claimed *"Each SVG uses stroke=`currentColor` so the color
   can be replaced at runtime"* — a blanket statement the curated block
   contradicts eleven lines later. That contradiction is what made this look
   like a defect. Header corrected.
2. `marketIconToDataUrl(key, colour)` ignored `colour` for them **silently**.
   Now `FIXED_PALETTE_ICONS` (derived from the markup, so it cannot drift) and
   `isRecolourable(key)` are exported, so a colour control can say which of its
   options will not respond.

`allIcons.test.ts` asserts the derived list matches the markup, that every
other icon really does recolour, and that the header no longer makes the
blanket claim.

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

## 11. ~~Bucket contents are wrong; 21 published packages should become 7~~ — CLOSED

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
5. **`check:ds-tokens` violations — re-counted 2026-08-18: 382, and the shape
   matters more than the number.** 298 of them are in TESTS, lab SEEDS and
   demo APPS — none of which ship. Of the ~84 in shipping source the largest
   clusters are legitimate: `cssToExcelColor.ts` converts CSS to Excel colour
   literals (hex is the output format), and `expressionEditor.css` is an
   editor theme. This is not a 382-item backlog; it is a small number of real
   ones inside a large number of false positives, and the check's carve-outs
   should be widened before anyone works it.
6. ~~`star-demo` `RenameViewTab` imports `Button, Input` from
   `@wellsfargo-starui/grid/customizer`~~ — **STALE, verified fixed
   2026-08-18.** Both `star-demo` and `star-demo-ssrm` already import from
   `@wellsfargo-starui/react`.
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

**Seven of eight closed 2026-08-18.** All were "none affect correctness"; two
turned out to cost real work per mount and per idle second.

- ✅ Snapshot mid-window dropped `pendingCount` from `updatesAccumulated` —
  those updates DID arrive and were counted at ingest, so zeroing made the
  cumulative total drift below the real one, and that total is the denominator
  of the conflation ratio `getStats` reports. The snapshot flush now carries
  the discarded count.
- ✅ Any session's `configureExpressions` cleared the WHOLE shared order cache,
  so ten blotters pushing rules at mount evicted each other's warm orders nine
  times over. Now `invalidateSessionOrders` drops only the entries naming that
  session — reachable because every cache key carries the requesting session's
  identity since Phase 12. A SESSIONLESS configure still clears everything: it
  changes what every session without its own set resolves to.
- ✅ `engineBoundary.test.ts` matched only `from '…'`, so
  `await import('../worker/x')` or a `require` would have slipped through —
  and a dynamic import is exactly how someone reaches for the forbidden side
  once the static form is refused. Now matches all three forms, with a case
  asserting it.
- ✅ `RowStore.emit()` had no per-listener try/catch. `onTick` is a public
  subscription and one consumer throwing aborted the loop, so every listener
  registered after it — including the windowed flush every session's ticks
  ride on — silently missed that tick.
- ✅ `SsrmStats` (and `SsrmFlushEvent`, `ViewportInterestScope`) reachable only
  through `/ssrm-engine`; now on the `./runtime` barrel too, which is where
  the hub introspect payload types live.
- ✅ `createSsrmStatusBar` mount load left `lastLoadAt` at 0, so the first tick
  inside the throttle window saw `elapsed` as the whole epoch, took the
  leading edge, and duplicated the mount fetch — one wasted RPC per panel,
  three panels, every grid mount. And the 2s fallback poll ran even for
  tick-capable providers: a worker round trip per panel every 2s, forever, on
  an idle grid. Both fixed, both pinned.
- ✅ `docs/latest/ssrm-engine.md`: `ICacheIngest` omitted `clear()` and the
  query-surface listing predated the session layer. Both now match the source.

**Still open, deliberately:** `fanSsrmFlush` rebuilds and enriches the full
changed-key row set per FILTERED session per flush — N-sessions × changed-set
work. That is the design (a filtered session cannot discover a row that changes
INTO its filter without inspecting it) and the window cadence bounds it.

## 16. ~~v2-column-value-getter.spec.ts: the "authors a column valueGetter" case fails~~ — CLOSED 2026-08-18

**Closed by** `8010b38`. Three defects, all in the spec:
its own waits budgeted 45s inside the global 30s test timeout, so it could
never reach the end; `.ag-grid-scrolling-cells` is a state class on the grid
ROOT rather than a container, so `[col-id="region"]` matched the column HEADER;
and `region` sits outside AG Grid's virtualised column window anyway (the body
scrolls ~5650px in a ~1250px viewport). Its cleanup also clicked an unscoped
"Clear" that resolved to the Columns tab's clear-all behind the dialog overlay.
The spec now scrolls the column in, asserts on `.ag-cell`, and scopes the
Clear. **3/3 passing.**

Original entry follows.

### Original (2026-08-13)

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

## 20. The SSRM parity tail — 4 findings, 4 phases (2026-08-17) — CLOSED, 4 / 4 DONE

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
warm number is 0.0 ms either side. **Open, restated 2026-08-17:** measured by ESLint's `max-lines` rather than
`wc -l`, `protocol.ts` is NOT over; `SharedWorkerDataServicesClient.ts` is, by
169 code lines, and is the one real file-level violation this effort touched.

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
that function 102 → 105 lines; now 0. **Not a defect** (established 2026-08-17): an aggregate folding a CALCULATED
column returns 0 in BOTH row models — measured, `SUM([total])` = 0 and
`SUM([px])` = 30 either side — because CSRM's `allRows` comes from
`platform.data.scan`, which yields raw row data, exactly as `aggregateScope`
iterates raw store rows. A limitation of the calculated-column feature, not a
parity gap.

**Phase 14 — DONE 2026-08-17.** T2-6. The premise was re-confirmed first:
`fanSsrmFlush` sends a session its interested rows, or the full changed set
only for a FILTERED session, and `__ssrmAlert` is written by `enrich` on rows
being handed over — so a worker-detected alert really was only ever present on
a row the client already had, and there is no cheaper fix. `alertHits`
evaluates a session's alert rules over the changed rows of every flush and
answers with **row key + rule id, never rows**, so widening the evaluation past
the viewport does not widen the payload. **Deviation from the phase text,
deliberate:** the hits ride the existing `ssrm-tick` message rather than a new
kind — that message already reaches every data subscriber on every flush under
the same `subId`, and a second one would be a parallel channel to the same
recipients (binding constraint 2). Deduped in `bindSsrmTicks`, the only place
holding both the hits and the grid api (`getRowNode` answering `undefined` IS
"has this session loaded the row"); a held row's hit is dropped because the
platform's row-change delta finds it. Reaches the alerts module as the platform
event `data:alertHits`, which a client-side grid never emits — so the module
subscribing is not a row-model branch. Only `dataChange` rules: a
`relativeChange` rule needs a baseline this session recorded, and a row nobody
observed has none. Cost over a 2000-row tick: **0.2 ms** for 1 rule, 0.4 ms for
3, **0.0 ms with none** — against 24.6 ms for the upsert it rides on.
**Open:** `activateAlerts` is 208 lines against the 80-line function ceiling
(already 202 before this phase; the addition is 6 lines after hoisting its body
out on finding the first draft had grown it to 225). Getting it under means
extracting the delta/full-pass cluster — a refactor of the alerts hot path.

**Item 20 is closed.** With the roadmap's 11 phases (item 17), all 36 SSRM/CSRM
parity findings are now closed or recorded as not-defects.

**Closed as not-a-defect:** *two windows on one historical provider fight for
its single snapshot*. Architectural, and **CSRM behaves identically**, so it
is not a parity finding. Reopen as a product decision about historical
providers if it ever matters.

**Estimate: none — the effort is complete.**

---

## 21. Complexity ceilings: enforced on the diff, two real violations left (2026-08-17)

**Area:** `scripts/check-complexity-budget.mjs`, `eslint.config.mjs` ·
**Blocked on:** nothing

CLAUDE.md calls 800 lines / file and 80 lines / function binding. ESLint has
both as `warn`, and **192 functions** and **7 files** are already over — so the
ceilings were a norm, not a rule, and the norm actually being applied was
narrower: *don't make it worse, and fix what you grew*.
`npm run check:complexity` makes that mechanical: for every file changed
against the base ref it compares the file's total lines-over-the-ceiling before
and after, and fails when a FUNCTION's grew. **Diff-scoped, so it is NOT in
`lint:all`** — that is a whole-repo gate and this one's meaning depends on what
you are comparing to. It runs in CI's `quality` job on pull requests, with
`--base=origin/<target>`; locally a bare run defaults to `@{upstream}`, i.e.
"the work I am about to push".

- **Excess, not violation count**, so splitting one 200-line function into a
  120 and a 100 passes (excess 120 → 60) while 102 → 105 fails. Counting
  violations would punish exactly the change the ceiling exists to encourage.
- **ESLint's numbers, not `wc -l`.** They disagree by hundreds of lines here
  (`max-lines` skips blanks and comments), which is how four phase records came
  to report files as "over the ceiling" that the rule never flagged.
- **File growth is reported, not blocked.** A function over the ceiling can
  always be fixed locally by hoisting a closure that captures nothing; a file
  can only be fixed by splitting it, which is a design decision and shouldn't
  be forced on whoever adds the next feature line.

Introducing it found **five** function-level regressions across Phases 11 and
14 that hand review had missed, all now fixed by hoisting — `activateAlerts` is
201 lines, *below* the 202 it started at.

**One fixed, one deliberately not.**

1. **`activateAlerts` — DONE 2026-08-18.** Split into `alertsEvaluator.ts`
   (what decides whether a row change is a hit, plus the state that decision
   needs) and `activate.ts` (wiring alone). Everything needing no per-grid
   state became a module-level function taking an `EvaluatorDeps` object, so
   the factory kept only the observed-row set and the watched-column memo —
   without that second step the split just moved a 173-line function next
   door. The whole alerts directory is now at zero
   `max-lines-per-function` warnings, including a pre-existing 81-line
   `createAlertDispatcher`. 89 tests unchanged and green.
2. **`SharedWorkerDataServicesClient.ts` (169 code lines over) — NOT doing it,
   and this is a decision rather than a deferral.** The obvious seam is the
   SSRM RPC surface: 8 public methods plus `rpcSsrm` and three private fields,
   about 170 code lines, which would take the file just under. But those
   methods are reached as `client.ssrmGetRows(...)` from 11 call sites, and
   `SharedWorkerDataServicesClient` is a published export — so the split is
   either a breaking API change (`client.ssrm.getRows`) or a delegation layer
   that adds most of the lines back. Trading a public API break for a
   NON-BLOCKING warning on a file that works is the wrong trade. This is
   exactly why `check-complexity-budget` reports file growth rather than
   failing on it. Revisit if the file is being restructured for another
   reason.

**CI runs it report-only, deliberately.** `feature/simplify` predates the
check and trips it **26 times** against `main` (9 of those are new files whose
functions ship over the ceiling), so gating on it would block the branch that
introduced it. Same treatment, and the same reason, as the `check:ds-tokens`
step beside it. The LOCAL default (`@{upstream}`) is exact and blocking, which
is where it actually catches things — CI is the backstop.

**Done looks like** the 26 worked through, `continue-on-error` dropped from the
CI step, the two violations above split, and `max-lines` promoted from reported
to blocking in `check-complexity-budget.mjs`.

---

## 22. ~~`markets-grid-ssrm-lab`'s test suite is a stale clone~~ — CLOSED 2026-08-18

**Closed by** `c5edb24`. The remaining 19 failures were one cause: the setup
mock answered `provider: null` from `useSsrmDataProvider` and left
`useSsrmProviderDataWiring` unmocked, so `SsrmLabGrid` could only ever render
its "Starting SSRM provider…" placeholder while 19 cases waited for the grid.
The mock now supplies a live provider stub and a ready wiring. **132/132
passing.**

Original entry follows.

### Original (2026-08-18)

**Area:** `apps/source/markets-grid-ssrm-lab` · **Blocked on:** nothing —
test authoring, not a fix

Found while verifying that `apps/` is compatible with this branch's
architectural changes. It **is** — all 10 apps typecheck and build clean, 8 of
9 test suites are green, and this one fails **identically at the branch point
`df48fdf`** (24 failed / 92 passed either side), so none of it is a
compatibility problem.

The lab was created as a full clone of `markets-grid-lab` (`5a2fca1`) and its
tests came with it, still asserting the ORIGINAL's UI. Three real defects were
fixed on the way through (24 → 19 failures):

1. `testSetupMocks.ts` replaced `@wellsfargo-starui/react/data/runtime`
   wholesale but supplied only 2 of the 5 members the lab imports —
   `useDataServices`, `useUserIdFromContext` and `useSsrmDataProvider` were
   missing, so `SsrmLabProvider` threw at render and took out `App.test.tsx`
   and all 18 `tabs.test.tsx` cases before a single assertion ran.
2. `App.test.tsx` expected the header to read "MarketsGrid Feature Lab"; this
   lab's header names itself, "MarketsGrid SSRM Lab".
3. `tabs.test.tsx` rendered each tab under `LabDemoProvider` alone, but every
   feature tab here renders `SsrmLabGrid`, which calls `useSsrmLabProvider` and
   throws without `SsrmLabProvider`. `App` mounts both; a tab on its own got
   neither.

**The remaining 19 are the clone's real divergence**: the tabs assert
`data-testid="markets-grid"`, but this lab's tabs render a profile/lens picker
("6 profiles · multi-module seed · pick a lens in the profile selector · SSRM")
and reach a grid only after a selection. The expectations have to be rewritten
against the SSRM lab's actual UI — or, if the two labs are meant to render the
same shell, that divergence is the finding and the APP is what changes.

**Done looks like** someone who knows which of those two the lab is supposed to
be, deciding, and the suite matching it.
