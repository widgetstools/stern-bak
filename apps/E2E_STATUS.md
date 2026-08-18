# E2E status

> Was item 1 in the cross-repo worklog
> ([`stern-bak/docs/WORKLOG.md`](../docs/WORKLOG.md)); resolved 2026-08-18.

**The suite is green: 95 passed / 0 failed across 16 spec files (~1.9 min).**

Recovery of the coverage the demo-react deletion cost is under way — see
[`../docs/E2E_RECOVERY_PLAN.md`](../docs/E2E_RECOVERY_PLAN.md). Phase 1
(profile lifecycle, 21 tests) is done and hosted on `markets-grid-lab`.

```bash
npm run e2e          # from apps/
```

## What changed

The suite arrived here from the platform repo along with the apps its specs
drive, and two things were forced by the app curation:

1. **11 specs were deleted** because their host app no longer existed —
   `browser-blotter`, `hosted-markets-grid`, `platform-hooks-demo`,
   `v2-template-create-apply`, and the seven `container-*` specs. 58 → 47.
2. **The default `baseURL` moved from `:5190` (demo-react) to `:5175`
   (star-demo)**, because demo-react was deleted.

(2) left the suite mostly red: 33 specs were written against demo-react's
markup and waited on `[data-grid-id="demo-blotter-v2"]`, a grid no surviving app
renders. Two more targeted `markets-ui-react-reference` on `:5174`, an app that
was never in this repo at all. Those 35 are now deleted, along with five helpers
nothing reached any more (`configSeed`, `nestedFixtures`, `profileHelpers`,
`referenceBlotter`, `shadcnSelect`); `settingsSheet.ts` is trimmed to the three
exports the surviving specs import.

### The selection rule

A spec was deleted only if it BOTH depended on `demo-blotter-v2` or the `:5174`
app AND had zero passing tests in the measured run. Anything with at least one
passing test was kept — which is why seven `markets-grid-lab` specs that reach
`demo-blotter-v2` only through a shared helper are still here and green.

## Measured runs

| run | result |
|---|---|
| first measurement, after the split | 10 passed / 2 skipped / 362 failed of 374 |
| 2026-08-18, before deleting the orphans | 72 passed / 2 skipped / 308 failed of 382 |
| 2026-08-18, after | **74 passed / 0 failed of 74** |
| 2026-08-18, + recovery phase 1 | **95 passed / 0 failed of 95** |

The middle row is higher than the first because four real defects were fixed on
the way — see below. Note that no pass/fail baseline existed before the split:
the old `docs/E2E_STATUS.md` carried an unfilled *"Record the resulting N passed
/ M failed here"* placeholder and warned that its headline figure was a
*collection* count. "398 tests" never meant 398 passing.

## What the suite covers now

| spec file | app | port |
|---|---|---|
| `design-system-demo` | design-system | 5310 |
| `hello-blotter` | hello-blotter | 5177 |
| `lab-onboarding`, `v2-alerts`, `v2-bulk-update`, `v2-edit-history`, `v2-editing`, `v2-editing-family`, `v2-plus-minus`, `v2-shortcuts`, `v2-smart-edit`, `v2-window-focus-restore` | markets-grid-lab | 5300 |
| `lab-profile-lifecycle` (recovery phase 1) | markets-grid-lab | 5300 |
| `v2-column-value-getter` | stomp-marketsgrid-minimal | 5213 |
| `ssrm-viewport-ticks` | markets-grid-ssrm-lab | 5320 |
| `star-demo-ssrm-smoke` | star-demo-ssrm | 5176 |

`star-demo-ssrm-smoke` runs in its own `infra-restart` Playwright project with a
`dependencies: ['chromium']` gate: one of its tests kills and respawns the shared
STOMP feed on `:8081`, which `hello-blotter` and the SSRM specs hold open
connections to. Run beside them it raced their reconnects and the restarted page
never resumed ticking inside its poll window. The dependency makes it start only
once the parallel pool has drained, so it has the feed to itself.

## Defects found getting here

Two in product code, both real for a user and not test artefacts:

- **The grid density pill blocked clicks beneath it.** `.ds-density-pill` is as
  tall as the chip PLUS the menu, the menu keeps its box while closed, and the
  wrapper took pointer events across the whole thing — so an invisible strip sat
  over the toolbar and swallowed clicks on the alerts bell. Pointer events are
  now scoped to the chip and the open menu, with a `::before` bridging the gap so
  hover still carries from one to the other.
- **The formatter's mousedown guard had drifted.** Four copies of "eat mousedown
  unless the target is a form control", and one listed three tags instead of
  four. The ⋯ overflow menu renders inline inside that shell, so a `TEXTAREA` its
  own guard allowed was eaten on the way up. Now one hoisted
  `preserveGridCellOnMouseDown`.

Two in the specs:

- `v2-column-value-getter` budgeted 45s waits inside the global 30s test
  timeout, so its round-trip case could never finish. Once it could, it looked
  for `[col-id="region"]` under `.ag-grid-scrolling-cells` — a state class on the
  grid ROOT, not a container, so the match was the column HEADER, and the column
  sat outside AG Grid's virtualised window anyway. Its cleanup also clicked an
  unscoped "Clear", resolving to the Columns tab's clear-all behind the dialog
  overlay.

## The coverage this cost

The deleted specs were the only end-to-end cover for profile
lifecycle/isolation/stress, column groups, column templates, conditional
styling, the filters and formatting toolbars, general settings, popout windows,
autosave, two-grid isolation, row exclusion, nested-field variants, and the
config seed round-trip.

Those behaviours keep unit cover in `packages/` — formatter 30 test files,
expression 26, filters 21, conditional styling 20, profiles 13, templates 12,
calculated columns 7, column groups 5, general settings 5, row exclusion 5,
popout 4 — but a unit test does not exercise what these did: real AG Grid
rendering, IndexedDB persistence across a page reload, and a second OS window.

**The follow-up is to re-earn that cover against `markets-grid-lab`**, which
does render the full customizer and is where every surviving `v2-*` spec already
runs. Nobody has done it. `visual-reference-capture` needs the same treatment:
it was demo-react-bound, and its output path
(`process.cwd()/docs/visual-reference/v1`) was already wrong now that Playwright
runs from `apps/`.

## Also outstanding

`e2e-openfin/` no longer targets the deleted `e2e-openfin-workspace` — its
config launches `star-demo` (`:5175`) plus `stomp-view-server` (`:8081`), and its
README says so. It is not part of `npm run e2e` and has not been run here.
