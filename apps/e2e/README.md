# End-to-end tests

Playwright suite for the demo apps. Most specs drive **markets-grid-lab**
(:5300); the rest pin design-system (:5310), stomp-marketsgrid-minimal
(:5213), the SSRM lab (:5320), star-demo-ssrm (:5176) and hello-blotter
(:5177). Run with `npm run e2e`.

## Current shape

**74 tests across 15 specs, green.** The 35 specs written against the deleted
`demo-react` app were removed on 2026-08-18 — see
[`../E2E_STATUS.md`](../E2E_STATUS.md) for the selection rule, the measured
runs, and the coverage that cost.

`e2e/helpers/settingsSheet.ts` provides the shared nav harness
(`clickSettingsFromToolbar`, `navigateToModule`, `openModuleMenu`). Its
demo-react boot helpers (`bootCleanDemo`, `openPanel`,
`forceNavigateToPanel`, `closeSettingsSheet`) went with those specs — they
waited on a grid no surviving app renders.

The spec-to-app map, the `webServer` topology and the measured pass/fail runs
live in [`../E2E_STATUS.md`](../E2E_STATUS.md) — keep that file in sync when
specs are added, removed, or re-pointed. Pass/fail counts are captured from a
live run there rather than asserted here, because the multi-server topology
makes a stale snapshot misleading.

`star-demo-ssrm-smoke` runs in its own `infra-restart` project gated on the
main one: it kills and respawns the shared STOMP feed on :8081, which other
specs hold connections to.

## Policy: tests ride alongside features

**Every feature change commits its own e2e test.** Four shapes:

### Add a feature

New spec file OR new `test('feature-name', …)` block inside a related
spec. Name it after the user-observable behaviour ("+ button captures
current filter as pill"), not the implementation detail.

Checklist:
- Use the public `data-testid` attributes already rendered by the
  component. Add a new testid to the component in the same commit if
  the test needs one.
- Wire the test to real user actions (`click`, `type`, `press`) — don't
  poke private state via `evaluate()`.
- Wait on visible effects (`toBeVisible`, `toHaveText`, grid cell DOM),
  not on timers.

### Update a feature

If the feature's user-observable behaviour changed, **update the
existing test in the same commit**. The commit diff should show both
the code change and the test update side-by-side.

If the change is purely internal (refactor, extraction, rename), no
test change is needed — the existing e2e run is the regression net.
Unit tests cover the internals.

### Remove a feature

Delete the test at the same time as the feature. Don't leave orphaned
expectations that will fail the next run. If only a sub-behaviour is
removed, trim the specific `test()` block; if the whole feature is
gone, delete the spec file.

### Fix a bug

Add a `test()` that reproduces the bug and fails against the old code.
The commit graph should show: (1) failing test, (2) code fix, (3) same
test now passing. Squash is fine; the commit message names the bug.

## When a test starts failing

Before modifying the test, decide which of these applies:

1. **The feature's behaviour changed intentionally** → update the test
   to match the new behaviour.
2. **The feature broke** → fix the feature, keep the test.
3. **The test was fragile (timing, selector drift)** → harden the
   test (better waits, more specific selectors), don't silence it.
4. **The test is testing something that no longer exists** → delete it.

Never add `test.skip` / `test.fixme` / `.only` to a committed spec.

## Using the nav helper

```ts
import { clickSettingsFromToolbar, navigateToModule } from './helpers/settingsSheet';

test('my new feature', async ({ page }) => {
  await page.goto('http://localhost:5300/');      // the lab renders the full customizer
  await clickSettingsFromToolbar(page);           // ⋯ overflow → Grid settings
  await navigateToModule(page, 'column-customization');
  // … exercise the feature via cs-* / cols-* / cg-* testids …
});
```

`navigateToModule` goes through the visible grouped menubar — the realistic
user flow — and resolves the owning category from each trigger's
`data-modules` attribute, so it does not duplicate the grouping map. For the
four editing modules (`smart-edit`, `bulk-update`, `plus-minus`, `shortcuts`)
it opens the merged `editing` panel and clicks the matching section tab.

## Running locally

```
npm run e2e                                    # full suite (74 tests, ~1.5 min)
npx playwright test e2e/v2-alerts.spec.ts      # single spec
npx playwright test -g "badge"                 # grep test title
npx playwright test --debug                    # interactive
```

The suite auto-starts its seven dev servers (see the topology table in
[`../E2E_STATUS.md`](../E2E_STATUS.md)); each reuses an existing server on its
port if one is already listening. Kill stale dev servers before a clean run so
a previous run's stale code isn't silently reused — on Windows,
`Get-Process node | Stop-Process -Force` (scope as needed); on Unix,
`lsof -ti:5300 | xargs kill`.
