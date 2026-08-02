# E2E status after the repo split

> Tracked as item 1 in the cross-repo worklog:
> [`stern-bak/docs/WORKLOG.md`](../docs/WORKLOG.md).

**Short version: a full run is 10 passed / 2 skipped / 362 failed out of 374.
The harness works; the suite does not. Part of that is attributable to the app
curation, part of it cannot be attributed either way — see below.**

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

## Full-run result

```
374 tests in 47 files
 10 passed    2 skipped    362 failed        (19.9 min)
```

## What is and is not attributable

**Attributable to the curation:** the ~34 specs that inherited demo-react's
baseURL. demo-react was deleted; they cannot pass. This was known and accepted
when the app list was chosen.

**NOT attributable — and I could not determine it either way:** specs pinned to
apps that survived (`markets-grid-lab` `:5300`, etc.) also fail. For example
`v2-alerts` times out on `[role="tab"]`.

The reason attribution is impossible: **no pass/fail baseline was ever recorded
for this suite.** The platform repo's `docs/E2E_STATUS.md` carried the
instruction *"Record the resulting N passed / M failed here"* with the value
never filled in, and explicitly warned that its headline figure was a
*collection* count, not a pass count:

> Counts are collection counts, not pass counts. Capture pass/fail from a real
> run — the multi-server topology below means a snapshot taken with a stale dev
> server or an un-booted port is not representative.

So "398 tests" never meant "398 passing". That document also listed several
known-fragile and pre-existing failures.

What *is* established: the apps and the plumbing are fine. A DOM probe against
markets-grid-lab returns `title="MarketsGrid Feature Lab"` with 3108 characters
of rendered content, and `lab-onboarding` passes 3/3 in isolation. The app
serves; the specs' assumptions about its state are what fail.

**To attribute the rest properly**, run the suite against the pre-split commit
(`80ab02a`, before any app was deleted) and compare. Until someone does, treat
the red as "unknown health, now measured for the first time" rather than "the
split broke 362 tests".

## Specs pinned to surviving apps (these are the ones worth triaging first)

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
