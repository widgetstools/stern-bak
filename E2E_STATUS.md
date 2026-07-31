# E2E status after the repo split

**Short version: the harness works, but roughly two-thirds of the suite is
currently unusable and needs a decision, not a mechanical fix.**

## What happened

The suite moved here from the platform repo along with the apps its specs drive.
Two changes were forced by the app curation:

1. **11 specs were deleted** because their host app no longer exists —
   `browser-blotter`, `hosted-markets-grid`, `platform-hooks-demo`,
   `v2-template-create-apply`, and the seven `container-*` specs (plus
   `playwright.container.config.ts` and the `containerHost` / `platformHooksDemo`
   helpers). 58 specs → 47.

2. **The default `baseURL` moved from `:5190` (demo-react) to `:5175`
   (star-demo)**, because demo-react was deleted.

## The problem with (2)

Only 13 of the 47 remaining specs pin their own port. The other ~34 inherited
the default baseURL, and they were written against **demo-react's** markup.
star-demo does not have it.

Concretely, `e2e/helpers/settingsSheet.ts` waits on:

```ts
page.waitForSelector('[data-grid-id="demo-blotter-v2"]')
```

That grid id does not exist in star-demo, so every spec routed through
`bootCleanDemo` / `waitForV2Grid` fails at setup. A sample run of three
retargeted specs produced **13 failed tests**, all on that selector.

This is not a selector-tweak problem. Those specs assume demo-react's routes,
grid ids, and seeded fixtures.

## Verified working

| Spec area | Target | Result |
|---|---|---|
| `lab-onboarding` | markets-grid-lab `:5300` | **3 passed** |

The harness itself, the dev-server orchestration, and the apps repo wiring are
all confirmed good — a passing spec against a surviving app proves the plumbing.

## Specs that should still be fine (pinned ports, surviving apps)

- `markets-grid-lab` `:5300` — `lab-onboarding`, `v2-alerts`, `v2-bulk-update`,
  `v2-edit-history`, `v2-editing`, `v2-plus-minus`, `v2-shortcuts`,
  `v2-smart-edit`, `v2-window-focus-restore`
- `design-system` `:5310` — `design-system-demo`
- `stomp-marketsgrid-minimal` `:5213` — `v2-column-value-getter`

## The decision needed

The ~34 demo-react specs need one of:

1. **Give star-demo the surface they expect** — add a `demo-blotter-v2` grid and
   matching routes/fixtures. Makes the specs pass largely unchanged, but it is a
   product decision about what star-demo is for.
2. **Rewrite them against star-demo's actual UI** — honest, but it is 34 specs of
   real work.
3. **Delete them** — they cover MarketsGrid customizer behaviour (settings
   panels, profiles, column templates, conditional styling, popouts), so this
   loses meaningful coverage. Much of it may be better expressed as unit tests in
   the platform repo's `grid` package, which already carries 697.

Until then, run the pinned-port specs only:

```bash
npx playwright test e2e/lab-onboarding.spec.ts e2e/v2-alerts.spec.ts \
  e2e/v2-editing.spec.ts e2e/v2-edit-history.spec.ts e2e/v2-bulk-update.spec.ts \
  e2e/v2-plus-minus.spec.ts e2e/v2-shortcuts.spec.ts e2e/v2-smart-edit.spec.ts \
  e2e/v2-window-focus-restore.spec.ts e2e/design-system-demo.spec.ts \
  e2e/v2-column-value-getter.spec.ts
```

## Also outstanding

`e2e-openfin/` came across too. Its target was `e2e-openfin-workspace`, which was
deleted. star-demo is itself an OpenFin app with a `launch.mjs` and a manifest,
so retargeting is plausible but unverified.
