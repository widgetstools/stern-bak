# Coverage plan — 70% per file on lines, statements, functions and branches

Branch: originally **`test/coverage-70`** (merged; the gate now rides every branch)

> Package names in the dated session tables below are **pre-collapse** —
> `widget-sdk`, `widget`, `widget-browser`, `host-data-react`, … were later
> merged into the seven bucket packages (see `docs/latest/packages.md`).
> The history is kept as written.

**The gate is met. Every file in every package is at or above 70% on all four
metrics — and, since 2026-08-18, every file in every app under `apps/source/`
too.**

This file is now the record of how it was done and the rules that keep it that
way. `## Conventions` stays binding for every new test — the point of the work
was tests that catch defects, not tests that move a number, and eight of the
findings below came from tests written against behaviour.

---

## Where things stand

| | packages/ | apps/source/ |
|---|---|---|
| Files at or above 70% (all metrics) | **817 / 817** (100.0%) | **309 / 309** (100.0%) |
| Units fully clear | **7 of 7** buckets | **10 of 10** apps |
| Remaining files | **0** | **0** |
| Tests | 6,799 passing, 1 skipped | 809 passing (source) + 654 (tarball) |

Verify with:

```bash
npm run test:coverage    # merges coverage/lcov.info for Sonar; pins --concurrency=1
npm run check:coverage   # the gate — lists every file below 70% on any metric

cd apps && npm run test:coverage:source   # the apps equivalent
cd apps && node scripts/check-package-coverage.mjs
```

### The apps tree runs the same policy

`apps/` is its own install root and stays outside turbo, lint, Sonar and the
package coverage gate — but the *threshold* is not a property of the CI surface,
it is a property of the code. Since 2026-08-18 `apps/scripts/vitestCoverage.mjs`
mirrors `scripts/vitestCoverage.mjs` exactly: `all: true` so an untested file
counts as 0% rather than vanishing, `perFile: true` so a well-covered module
cannot pay for an untested one, and 70% on **all four** metrics.

Before that, three things let the apps drift:

- `apps/scripts/check-package-coverage.mjs` read `summary.total` — an app-wide
  average. It now reports per file, and names every file that is short.
- No app config set `all` or `perFile`, so a file no test imported was simply
  absent from the report.
- `design-system` carried `branches: 60` locally.

React tests in apps are held to the same RTL rule as packages —
`scripts/check-react-testing-library.mjs` scans `apps/source/*` as well as
`packages/<bucket>/*`.

Never quote this file's number without re-running those. The measurement used to
be load-dependent: at turbo's default concurrency four consecutive runs on an
unchanged tree reported 504, 515, 520 and 391 files clear, and a fully-covered
package could report as failing — `openfin-platform` did, which is why session 4
had nothing to do. `run-test-coverage.mjs` now pins `--concurrency=1` itself, and
`check-package-coverage.mjs` prints `INVALID` instead of a percentage if any
package failed to produce a summary, so a collection failure can no longer read
as a coverage result.

**Keeping it at 100%.** The gate runs per file, so a new source file with no test
fails the build on the commit that adds it — there is no drift to police. Three
categories are excluded by `scripts/vitestCoverage.mjs` and are the only legitimate
way for a file to escape it: tests and fixtures, `*.bench.*` files (run by
`npm run bench`, not shipped), and `*.d.ts`. Adding to that list is a decision,
not a convenience.

---

## Conventions

### Branch coverage is the binding constraint

The gate enforces 70% on lines, statements, functions and branches per file.
In practice **branch coverage is the tightest metric**: a file can clear lines
while still failing on an untaken `if`, `catch` or early return. When a file is
close to the bar, check branches first — that is where the swallow paths and
degradation branches live, and where the defects found so far were hiding.

### React components — React Testing Library, always

Enforced by `npm run check:rtl` (part of `lint:all`), across `packages/<bucket>/*`
**and** `apps/source/*`. Any test that renders JSX
must import `@testing-library/react`.

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

it('disables save until a name is entered', async () => {
  render(<ProfileDialog onSave={vi.fn()} />);
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

  await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), 'Trader view');
  expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
});
```

**Query by role and accessible name first**, then label, then text. Reach for
`data-testid` only when nothing else identifies the element — a test that can
only find a button by testid usually means the button has no accessible name,
which is a real defect worth fixing instead.

**Banned, and enforced by `check:rtl` — each fails the build:**

| Approach | Why |
|---|---|
| `enzyme` | shallow rendering never runs children |
| `react-test-renderer` | asserts on a tree, not on what a user sees |
| `react-dom/test-utils` | use RTL, which wraps it correctly |
| `ReactDOM.render(` | bypasses RTL's `act()` and cleanup |
| `createRoot(` | render via RTL instead |
| `.attachShadow(` | a shadow root hides the tree from RTL's queries |
| `.toMatchSnapshot()` | asserts "unchanged", not "correct" |

Also avoid, though not mechanically detectable: asserting on props objects, and
reaching into hook internals. Both pass while the component is broken for a
real user.

A `.test.tsx` that renders nothing and only exercises a pure helper is fine and
exempt — the check keys on JSX presence, not the file extension.

### Pure logic — plain vitest

No RTL, no jsdom unless the module genuinely touches the DOM. Test the exported
contract: real inputs, boundary values, and the failure paths the code
deliberately swallows.

### What a good test looks like here

- **Assert behaviour a caller depends on**, and say why in a comment when the
  reason is not obvious (`// a partial id would collide across rows`).
- **Cover the swallow paths.** This codebase deliberately catches and warns in
  many places; those branches are both uncovered and where bugs hide.
- **When an assertion fails, check the source before "fixing" the test.** Three
  of the defects found so far surfaced exactly this way.
- **Never weaken an assertion to make it pass.** If real behaviour differs from
  what it should be, pin the real behaviour and record the defect in
  `WORKLOG.md`, as done for the icon colours and the `userId` override.

### Per session

1. `npm run test:coverage && npm run check:coverage` — confirm the starting number.
2. Write tests for the session's package(s).
3. `npx turbo run typecheck build test --force` must be green.
4. `npm run check:rtl` must pass.
5. Commit with the before/after file count, and tick the row below.

Add `src/**/*.test.ts(x)` to a package's `tsconfig.json` `exclude` when adding
the first colocated test there — otherwise `tsc` compiles tests as shipped
source (this broke the `host-browser` build once already).

---

## Sessions — all complete

Sizing assumed ~35 logic files or ~20 React components per session; order was
smallest-gap-first so each session finished packages outright.

| # | Scope | Files | Kind | Exit criteria |
|---|---|---:|---|---|
| ✅ 0 | Infrastructure + 9 packages | — | — | Gate, Sonar LCOV, all 21 packages have a suite |
| ✅ 1 | `host-openfin` (1) · `host-config` (5) · `shared-types` (6) · `host-data` (6) | 18 | logic | 4 packages clear |
| ✅ 2 | `widget-sdk` (6) · `host-data-react` (8) · `workspace-setup-react` (9) | 23 | 14 React | 3 packages clear |
| ✅ 3 | `config-browser` (13) | 13 | 11 React | 1 package clear |
| ~~4~~ | ~~`openfin-platform` (23)~~ — never ran; it was already clear | 0 | — | — |
| ✅ 5 | `engine` — part 1 | 18 | logic | — |
| ✅ 6 | `engine` — part 2 | 22 | logic | `engine` clear |
| ✅ 7 | `widgets-react` (30) | 30 | 20 React | 1 package clear |
| ✅ 8 | `ui` — shadcn primitives, part 1 | 19 | all React | — |
| ✅ 9–10 | `ui` — overlays, forms, toasts | 35 | all React | `ui` clear |
| ✅ H | Gate hygiene — `*.bench.*` + `src/**/test/**` excluded | −3 | — | Denominator 810 → 807 |
| ✅ 11 | `grid` — widget surface | 45 | React | — |
| ✅ 12–15 | `grid` — customizer editors, UI, runtimes, panels | 118 | 101 React | `grid` clear · **807/807** |

**Nothing remaining.** Session 4 was struck rather than run: `openfin-platform`
was already above the bar and only *reported* as failing under the unreproducible
measurement described above.

### Notes per session

**1 — logic, no React.** `host-config`'s `ConfigManager.ts` is at 66.2% and only
needs its error paths; `db.ts`/`errors.ts`/`seedDigest.ts` are small.
`host-data`'s `createDataPort.ts` and `bootstrapWithWorkerAsset.ts` are at 0%.

**2 — first React-heavy session.** `useDockEditor` already has a suite to copy
the mocking pattern from (mock `@wellsfargo-starui/openfin-platform/config`,
`renderHook`, assert on state transitions).

**3 — `config-browser` had no RTL dependency** until this plan was written; it
was added. 11 of its 13 files are `.tsx` and it sits at 5.7%, the lowest of any
package with a suite.

**4 — `openfin-platform` needs no work.** Run on its own it is 38 files, 272
tests, 86.78% lines and **zero** files under the bar. The "23 files" this plan
was sized with came from a default-concurrency `test:coverage` run, where the
package under-reports. Confirm with
`cd packages/openfin/openfin-platform && npm run test -- --coverage` before
spending a session on it.

**5–6 — `engine`** is the platform core (storage adapters, profile bundles, row
change bus). Pure logic, no DOM. Highest value per test in the repo.

**7 — `widgets-react`** is container wiring; mock `host-data`/`host-config` at
the module boundary rather than standing up a real hub.

**8–10 — `ui`** is 54 shadcn components. Formulaic: render, assert the
accessible role/name, exercise each variant and the disabled state. Fastest
files in the repo once the first two are written.

**11–16 — `grid`** is the customizer modules. Several already have RTL panel
tests (`ConditionalStylingPanel.test.tsx`, `CalculatedColumnsPanel.test.tsx`) —
follow those, and prefer testing a module's `runtime/` logic directly where the
panel is only a thin form over it.

---

## Progress log

Numbers come from `npm run check:coverage` after `npm run test:coverage`. Rows in
chronological order; every one below was measured, not estimated.

| Session | Date | Files ≥70% | Δ | Packages cleared |
|---|---|---:|---:|---|
| 0 | 2026-07-31 | 412 → 443 | +31 | types, host, host-browser, design-system, widget, widget-browser, icons-svg, shared-types*, widget-sdk* |
| 1 | 2026-07-31 | 443 → 461 | +18 | host-openfin, host-config, shared-types, host-data |
| 2 | 2026-07-31 | 461 → 484 | +23 | widget-sdk, host-data-react, workspace-setup-react |
| 3 | 2026-07-31 | 484 → 520 | +36** | config-browser (openfin-platform was already clear) |
| 7 | 2026-07-31 | 520 → 550 | +30 | widgets-react |
| 5 | 2026-07-31 | 550 → 568 | +18 | — (engine, part 1) |
| 8 | 2026-07-31 | 568 → 587 | +19 | — (ui, part 1) |
| 11 | 2026-07-31 | 587 → 632 | +45 | — (grid, widget surface) |
| H | 2026-07-31 | 632/810 → 632/807 | −3 files scored | gate hygiene; no tests written |
| 6, 9–10, 12–15 | 2026-07-31 | 632 → **807** | +175 | **engine, ui, grid — 807/807, gate PASS** |

\* harness added, package not yet fully clear.

\*\* Session 3 wrote tests for 13 files, all in `config-browser`. The other +23
is `openfin-platform`, which that session did not touch: it was already above the
bar and only *reported* as failing under a parallel `test:coverage` run. The
before-number (484) came from such a run; 520 is the reproducible serialised
number.

**Why the last seven sessions share one row.** They were written and landed as a
single batch, so no intermediate measurement exists for any of them individually.
Earlier drafts of this table carried per-session rows (`689 → 714`, `714 → 807`)
that nothing produced — they are removed rather than left in, because an invented
number here is exactly what the `--concurrency=1` fix was meant to stop. The
endpoints are real: 632/807 was measured twice before the batch, 807/807 twice
after.

**Final batch notes (sessions 6, 9–10, 12–15).** 175 files, 154 new test files,
+559 tests. Verified on landing:

- `npm run check:coverage` — **807/807 (100.0%)**, PASS, three runs of four.
- `npx turbo run typecheck build test --force` — 62/62 tasks green.
- `npm run check:rtl` — PASS.
- 4,748 tests passing, 1 skipped, 0 failing.

The fourth run failed, and not on coverage: a `--force` rebuild was read
half-written and 109 `grid` suites died at collection. Recorded as `WORKLOG.md`
item 10. It matters here only because it is the failure the gate is now built to
survive — `check-package-coverage.mjs` printed `INVALID — 3 of 21 package(s)
produced no summary` and refused to give a percentage, where the old code would
have reported a clean-looking `402/402 (100.0%)`.

Checked for threshold-chasing rather than assumed absent: of the 807 files, 542
sit at 95–100% and only **14 land in the 70–72% band**. A suite written to clear
a bar rather than to describe behaviour piles up just above it; this one does not.
No `.skip` or `.todo` exists anywhere in the repo.

Two harness changes were needed and are worth knowing:

- **`ui/src/test/setup.ts` grew jsdom shims** — `ResizeObserver`, `matchMedia`,
  `setPointerCapture`/`releasePointerCapture`/`hasPointerCapture`,
  `scrollIntoView`, `elementFromPoint`. Without them Radix overlays (dialog,
  popover, select, dropdown-menu) and vaul's drawer reject asynchronously on
  open, which surfaces as an unhandled error rather than a failed assertion.
- **`grid`'s coverage exclude widened** from `src/widget/test/**` to
  `src/**/test/**`, which also covers `src/customizer/test/`. Both hold only test
  setup and query helpers.

One thing left undone: `SmartEditPanel.test.tsx` traded its
"DISCARD reverts draft changes" case for a confirm-threshold case. Nothing real
was lost — the old assertion checked that module state stayed `true` after
toggle-then-Reset, which passes whether or not Reset does anything, since the
toggle only touches the draft. But `discard` still has no test that would catch
it breaking. Worth one when someone next touches that panel.

**Session 3 notes.** All 13 target files cleared — `config-browser` went from
5.7% to **99.0% lines / 92.1% branches**, 243 tests across 14 files, no assertion
weakened. The package had `environment: 'node'` and no RTL usage at all; the
config is now `jsdom` + `include: src/**/*.test.{ts,tsx}` + `testTimeout: 15_000`,
and `tsconfig.build.json` also excludes `src/test-utils/**`.

Two findings, both recorded in `WORKLOG.md`:

- **`test:coverage` was not reproducible at default concurrency** — found while
  trying to record this session's before/after honestly. Four runs on an unchanged
  tree gave 504 / 515 / 520 / 391, and one scored the repo out of **651** files
  instead of 810 because several packages never wrote a summary and
  `check-package-coverage.mjs` counted them as absent rather than failing. This is
  why session 4 had nothing to do. *Since fixed and the worklog item closed* —
  the runner pins `--concurrency=1` and the gate now prints `INVALID` rather than
  a percentage when a summary is missing.
- **`RowDrawer`'s JSON textarea has no accessible name** (`WORKLOG.md` item 8).
  It is the package's primary control and cannot be found by role+name; the panel
  test filters on `tagName` with a pointer to the item.

What the next React session should know:

- **AG Grid renders fine in jsdom** — cells, styles and row clicks are all
  assertable — but only after stubbing `HTMLElement.prototype.offsetWidth` /
  `offsetHeight`. At jsdom's zero sizes it virtualises away every column but the
  first, and cell assertions then pass against an empty grid.
- **AG Grid 35 overrides boolean cells with a read-only checkbox**, ignoring the
  column's `valueFormatter`. `DataGrid`'s `"true"`/`"false"` branch never reaches
  the DOM; the test pins the checkbox, which is what a user actually sees.
- **`cellStyle` is observable as the cell's inline `style`**, so the ghost /
  mono / primary-key branches can be asserted for real instead of by reading the
  column definition back out of the grid.
- **`aria-hidden` on a closed drawer keeps its buttons out of role queries.**
  `RowDrawer` renders permanently (for the slide-out animation) with
  `aria-hidden={!open}`, and RTL honours that — so `getByRole('button', { name:
  'Cancel' })` finds the *dialog's* Cancel, not the drawer's. Convenient, but it
  also means the drawer's textarea **exists before any row is opened**: wait on
  its content, never on its presence, or the assertion races the click.
- **`setSelected` flips `selected` a render before `rows` catches up.** Waiting
  on `selected.key` alone leaves the previous table's rows in place. Waiting on
  a row *count* is not enough either — two tables can hold the same number of
  rows, which is exactly how one test passed locally and failed under load. Wait
  until every row carries the new table's primary key.
- **Mock the platform boundary, keep the domain logic real.** Only
  `@wellsfargo-starui/openfin-platform/config` is mocked here (an in-memory
  `ConfigManager` + Dexie stand-in in `src/test-utils/`); `host-config`'s
  `buildDeployExport` and `normalizeImportedAppConfigRow` run for real, so the
  import-reowning and deploy-validation assertions are against shipped code.

**Session 1 notes.** All 18 target files cleared; no test was weakened to get
there. Two assertions failed against real behaviour and were rewritten to pin
what the code does after reading it — the mock trades ticker mints *and then*
mutates in the same tick (so an empty book emits >1 row, not 1), and
`ConfigManager`'s v2 migration only fills an absent field rather than
overwriting a half-migrated row. Neither is a defect. Three aliasing /
consistency hazards surfaced and are recorded as `WORKLOG.md` item 6.

Two things worth knowing before the next Dexie-backed session:

- **Vitest fake timers deadlock `fake-indexeddb`.** Any `await` on a Dexie call
  after `vi.useFakeTimers()` hangs until the 5s test timeout. `host-config`'s
  drain-loop tests instead spy on `setInterval`, capture the scheduled callback
  and invoke it directly — same coverage, no deadlock.
- **`ConfigManager` always opens the same database name.** Tests that care about
  starting state must `indexedDB.deleteDatabase('marketsui-config')` in
  `beforeEach`, after the previous instance is disposed.

**Session 2 notes.** All 23 target files cleared; every package landed well
above the bar (`widget-sdk` 100%, `host-data-react` ≥88% per file,
`workspace-setup-react` ≥89%). 470 tests added, no assertion weakened. Four
findings are recorded as `WORKLOG.md` item 7 — three real defects in
`workspace-setup-react` (the `IconPicker` duplicate-id bug that breaks its own
search, `testComponent`'s stale-closure `userId`, and `useRegistryEditor`
importing the OpenFin-only barrel) plus one cosmetic id-preview fallback. All
are pinned as-is with a comment, so fixing one flips a test.

What the next React-heavy session should know:

- **`@wellsfargo-starui/openfin-platform`'s main barrel cannot be imported in
  jsdom** — `@openfin/workspace-platform` reads `fin.uuid` at module eval and
  throws. `/config`, `/dock-editor` and `/plugin` are the side-effect-free
  subpaths and import fine. When a hook under test pulls the main barrel, mock
  the whole barrel and re-export the real `/config` helpers from inside the
  factory so pure logic (`deriveTemplateConfigId`, `migrateRegistryToV2`) stays
  genuine.
- **`globals: false` means RTL never registers auto-cleanup.** `widget-sdk` and
  `workspace-setup-react` both set it, so every file that renders needs an
  explicit `afterEach(cleanup)`. Symptom is a passing test failing only when the
  file runs alongside its neighbours.
- **jsdom sizes everything at zero**, which makes `@tanstack/react-virtual`
  render no rows at all. Stub `HTMLElement.prototype.offsetWidth`/`offsetHeight`
  — that is what `observeElementRect` measures. Radix `ScrollArea` needs a
  `ResizeObserver` stub; vaul (`Drawer`) needs `setPointerCapture` /
  `releasePointerCapture` / `hasPointerCapture`, or its pointer events reject
  asynchronously and surface as unhandled errors.
- **React 19's `use()` does not resume under jsdom + act.** A suspended
  `use(promise)` never re-renders when the promise resolves, so eager-mode
  providers can only be asserted on the suspend. To exercise the resolved path,
  pass a thenable React can read synchronously
  (`Object.assign(Promise.resolve(), { status: 'fulfilled', value: undefined })`).
- **A component whose async effects settle after first paint needs a real
  barrier.** `WorkspaceSetup` renders as soon as `readHostEnv` resolves, one
  tick before the registry and dock rows land; querying a pane in between is
  flaky roughly one run in three. Wait on the loads *and* flush before asserting.
- **Per-keystroke `userEvent.type` is too slow on a large list.** The 245-button
  `IconPicker` grid blew the 5s default timeout under a parallel
  `test:coverage` run. Prefer `click` + `paste` where the filter is a pure
  function of the final value; `workspace-setup-react`'s config now also sets
  `testTimeout: 15_000`.
