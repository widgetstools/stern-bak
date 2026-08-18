# Recovering the e2e coverage the demo-react deletion cost

35 specs were deleted on 2026-08-18 because the app they drove no longer
exists ([`apps/E2E_STATUS.md`](../apps/E2E_STATUS.md), WORKLOG item 1). The
suite went green, but the coverage did not move anywhere — it was lost. This
is the plan to earn it back on apps that exist.

**The host is `markets-grid-lab` (`:5300`) for almost all of it.** It renders
`MarketsGrid` with `showProfileSelector`, `showSaveButton`,
`showSettingsButton`, `showFiltersToolbar` and `showFormattingToolbar` against
a live storage adapter, and its tabs already line up with what was deleted.
Nothing about the lab had to change to host the first phase.

## Why this is not just "undelete"

The deleted specs are recoverable in *intent*, not in *text*. Two things
differ on every port:

1. **Boot.** `bootCleanDemo` waited on `[data-grid-id="demo-blotter-v2"]`.
   The lab equivalent opens a tab (and, for profiles, a preset from the
   gallery) and waits on that grid's id.
2. **Storage.** demo-react persisted through ConfigService into IndexedDB
   (`marketsui-config` → `appConfig`, filtered by appId/userId). The lab uses
   `createMarketsGridLocalStorageStorage()`, so probes read
   `markets-grid-bundle:<gridId>` and `gc-active-profile:<gridId>`.

Everything else is a straight lift: the locators only ever touched component
testids, which all still exist.

## Phases

One phase per session. Each ends green, with the phase's specs committed.

| # | Phase | Specs recovered | Host | App change | Status |
|---|---|---|---|---|---|
| 1 | **Profile lifecycle** — create / switch / delete / clone | 1 | lab `profiles` tab | none | **DONE** — `lab-profile-lifecycle.spec.ts`, 21 tests green |
| 2 | **Profile state** — isolation ×2, stress, autosave | 4 | lab `profiles` tab | none | **attempted, not landed** — see below |
| 3 | **Customizer state** — calculated-columns, column-groups, conditional-styling | 3 | lab `calc` / `groups` / `conditional` tabs | none | |
| 4 | **Formatting surface** — column-customization, formatting-toolbar, column-templates, cell-renderer | 4 | lab `formatting` / `toolbar` / `renderers` tabs | none | |
| 5 | **Chrome** — general-settings, settings-panels, status-bar-toggle, console-health, filters-toolbar | 5 | lab, any tab | none | |
| 6 | **Popouts** — popout-window, popout-toolbar, popout-design-system | 3 | lab (popout is a `MarketsGrid` feature) | none | |
| 7 | **Nested fields** — the five `nested-*` specs | 5 | lab, new tab | **add a nested-field dataset** | |
| 8 | **Other hosts** — design-system-smoke, theme-switch, expression-editor, config-seed-roundtrip | 4 | design-system `:5310`, stomp-minimal `:5213`, star-demo `:5175` | none | |

**29 of 35 recovered.** Phase 7 is the only one needing an app change, and it
is the smallest possible one — a dataset, not a new interactive surface.

The original plan had all five profile specs as one phase. Phase 1 split after
the port surfaced three host differences worth absorbing into the shared
harness before the rest are written (below) — the remaining four inherit that
work and should go faster.

## Deliberately not recovered

| spec | why |
|---|---|
| `v2-two-grid-isolation` | No surviving app mounts two grids at once (`basic` has exactly one — the second `<MarketsGrid` match was a `MarketsGridHandle` type import). Recovering it means adding a two-grid surface whose only consumer is the test. |
| `v2-row-exclusion` | **Re-check before accepting this.** It lives in the `toolbar-date-settings` module, and no lab tab wires `onToolbarDateChange` — but a probe of the lab's settings sheet shows `toolbar-date-settings` IS registered in the nav (`v2-settings-nav-group-options` carries `general-settings toolbar-date-settings`). Whether the exclusion surface functions without the host callback is unverified. Deferred to phase 8 rather than written off. |
| `reference-cell-flash`, `stale-data-disconnect` | Targeted `markets-ui-react-reference` on `:5174`, an app that was never in this repo. The behaviours (cell flash, stale banner) could be written fresh against the lab's `live` tab and star-demo-ssrm, but nothing is portable — these would be new specs, not recoveries. |
| `v2-perf` | A perf harness, not a behaviour guard. Its thresholds were tuned to demo-react's dataset. |
| `visual-reference-capture` | Screenshot capture whose output path (`process.cwd()/docs/visual-reference/v1`) is wrong now that Playwright runs from `apps/`, and whose checked-in snapshots were dropped from `docs/` in 2026-08-02. Needs a decision about whether visual reference capture is wanted at all before it is worth rewriting. |

That is 6 specs — 5 if `row-exclusion` turns out to work off the registered
`toolbar-date-settings` panel. They stay recorded as an accepted gap rather
than quietly dropped.

**Panels confirmed reachable in the lab's settings sheet** (probed, not
assumed): `general-settings`, `column-customization`, `calculated-columns`,
`column-groups`, `conditional-styling`, `editing`, `alerts`,
`data-change-history`, `visual-excel`, `toolbar-date-settings`. Phase 2–5 need
the first five and all are present.

## What phase 1 learned

Three differences between demo-react and the lab that every later phase
inherits. All three are absorbed into `e2e/helpers/labProfiles.ts`, so no
future port has to rediscover them.

1. **Row actions are hover-gated.** `.ds-ps-row-actions` is
   `opacity: 0; pointer-events: none` until `.ds-ps-row:hover` or
   `:focus-within` (`ProfileSelector.css:208`). Playwright's hit-test resolves
   to the row rather than the icon, so a bare `.click()` retries until the test
   times out. Every clone and delete case failed this way on the first run —
   14 of 21, each burning its full timeout. `revealRowActions()` hovers first.
2. **Cloning opens rename mode and pins the popover.** `handleClone` sets
   `renamingId` and `blockPopoverDismissRef` so the user can name the copy
   immediately, which means the first Escape cancels the rename rather than
   closing the popover. The helper accepts the composed name, then closes.
3. **The lab keeps its active tab in component state, not the URL.** A
   `page.reload()` lands back on the default tab, so any spec asserting
   persistence across a reload has to navigate again — `reopenPreset()`.
   demo-react had the grid at `/` and needed none of this.

Also worth carrying forward: boot from the app root, wipe storage, then open
the surface **once**. Opening it, wiping, and re-opening works but pays for two
grid boots per test — with a `beforeEach` on every case that was most of the
25 minutes the first run took. It is now 1.2 minutes for the same 21 tests.

## Phase 2: attempted, not landed — read this before retrying

`lab-profile-isolation-structure.spec.ts` (16 tests) was written and got as far
as **15/16 green**, but never to a stable 16/16 across repeat runs. It is NOT
committed: landing it would take the suite from 95 green to intermittently red.

**Three real causes were found and fixed** — all worth keeping, and the first
two are landed:

1. **The Save button never goes `disabled`.** It reports through `data-state`
   (`dirty` / `saved` / `idle`, `PrimaryToolbar.tsx:176`). A `saveAll` waiting
   on `toBeDisabled()` fails every test at once. Phase 1 never caught this
   because nothing in it was ever dirty.
2. **`openToolbarOverflowMenu` was not idempotent** (`settingsSheet.ts`). The ⋯
   trigger TOGGLES, so a second call closed the menu, `v2-settings-open-btn`
   left the DOM, and the click on it burned the whole test timeout. Latent for
   every spec that opens the settings sheet more than once per test — which no
   surviving spec does. **Landed separately**, since it is correct on its own
   merits.
3. **Module edits are dirty until saved.** Profiles are committed snapshots, so
   every on-disk assertion needs a `saveAll` first.

**The remaining cause is NOT yet known. Two theories were tested and both are
disproved** — recorded so nobody spends the time again:

- ~~"The streaming grid keeps the menubar from ever being stable."~~ **Measured
  and false.** The trigger's box drifts for **181ms** — the sheet's entrance
  animation — then stops: 0 changes after 1s across a 6s sample. A forced click
  derived from this theory changed nothing and made the run slower (8 min),
  which should have been read as the theory being wrong rather than the fix
  being too weak.
- ~~"React replaces the menubar node on each stream tick, restarting the
  stability check."~~ **Also false.** Sampling node identity every frame for 5s:
  `identitySwaps: 0`, `detachedSeen: 0`. Same node throughout, never detached.

What IS established: `locator.click` on the nav group trigger hangs for the full
180s test timeout; each affected test does two or more open → author → close →
save cycles; and across four runs the failing test MOVED between three different
cases, so it is timing-dependent rather than a bad locator.

**What to try next:**

- Capture a Playwright trace (`--trace on`) of a hanging run and read the
  actionability log in full. Every diagnosis so far has come from a truncated
  console log, and that is how two wrong theories survived as long as they did.
- Check whether the settings sheet is being re-opened underneath the click —
  `openModuleMenu` presses Escape between its retries, and Escape closes the
  sheet as well as the menu, which would restart the entrance animation each
  round.
- Do not reach for `force: true` on the menubar. It was tried, does nothing
  here, and blinds a check that caught two real bugs.

The written spec and its helpers are not in the tree. Recover them from this
plan's history or rewrite from `2a5527d~1:apps/e2e/v2-profile-isolation-structure.spec.ts`,
which is the original demo-react version.

## Conventions for each port

- **Keep the original's intent line-for-line.** If the deleted test proved
  "delete of the active profile falls back to Default", the port proves that,
  not something adjacent that happens to be easier on the new host.
- **Assert through persistence, not just the DOM.** The reason these are e2e
  and not unit tests is that they cross real storage and a real reload. A port
  that only checks the popover has thrown away the point.
- **No `waitForTimeout` as a substitute for a wait condition.** The originals
  carried several 300ms settles; where the port needs one, it waits on the
  observable effect instead.
- **Boot from a wiped store in `beforeEach`**, so specs stay order-independent.
