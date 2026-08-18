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
| 2 | **Profile state** — isolation ×2, stress, autosave | 4 | lab `profiles` tab | none | next |
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
