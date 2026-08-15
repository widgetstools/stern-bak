# End-to-end tests

Playwright suite for the demo apps (primary target **star-demo** on
:5175; the labs pin :5300/:5320 and hello-blotter :5177). Run with
`npm run e2e`. NOTE: ~34 `v2-*` specs still target the deleted
`demo-react` app and fail at boot — see [`../E2E_STATUS.md`](../E2E_STATUS.md).

## Current shape

The suite has grown well past its original handful of specs. As of
2026-06-13 it collects:

- **Main suite** (`playwright.config.ts`) — **384 tests across 48 specs**.
- **Container suite** (`playwright.container.config.ts`, the
  `container-*.spec.ts` files excluded from the main config) — **16 tests
  across 5 specs**, run with `npm run e2e:container`.

`e2e/helpers/settingsSheet.ts` provides the shared harness
(`bootCleanDemo`, `openPanel`, `forceNavigateToPanel`, `closeSettingsSheet`).

The full spec inventory, the seven-server `webServer` topology, known-fragile
specs, and the procedure for capturing a fresh pass/fail baseline live in
[`../E2E_STATUS.md`](../E2E_STATUS.md) — keep that file in sync when
specs are added, removed, or re-pointed. Pass/fail counts are captured from a
live run there rather than asserted here, because the multi-server topology
makes a stale snapshot misleading.

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
import { bootCleanDemo, openPanel, closeSettingsSheet } from './helpers/settingsSheet';

test('my new feature', async ({ page }) => {
  await bootCleanDemo(page);                      // fresh grid, profile storage wiped
  await openPanel(page, 'column-customization');  // opens sheet + navigates via visible dropdown
  // … exercise the feature via cs-* / cols-* / cg-* testids …
  await closeSettingsSheet(page);
});
```

The visible path (`openPanel`) uses the header dropdown — realistic user flow. The hidden-nav path (`forceNavigateToPanel`) dispatches a synthetic click via `evaluate()` to bypass the a11y nav's 1×1px overflow-clipped wrapper; use only when the dropdown is out of scope.

Add a new `PanelModuleId` + root-testid entry to the helper when a new module ships a settings panel.

## Running locally

```
npm run e2e                                        # full main suite
npm run e2e:container                              # container-* specs (own config + :5215 host)
npx playwright test e2e/v2-filters-toolbar.spec.ts # single spec
npx playwright test -g "captures current filter"   # grep test title
npx playwright test --debug                        # interactive
```

The main suite auto-starts its seven dev servers (see the topology table in
[`../E2E_STATUS.md`](../E2E_STATUS.md)); each reuses an existing
server on its port if one is already listening. Kill stale dev servers before
a clean run so a previous run's stale code isn't silently reused — on Windows,
`Get-Process node | Stop-Process -Force` (scope as needed); on Unix,
`lsof -ti:5190 | xargs kill`.
