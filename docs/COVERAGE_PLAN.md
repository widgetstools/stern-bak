# Coverage plan — reaching 70% per file

Branch: **`test/coverage-70`**

The gate (`{ lines: 70, perFile: true }`) is in place and enforcing. This file
splits the remaining work into sessions that can be picked up cold, one at a
time, each leaving the branch green.

**Read `## Conventions` before writing a single test.** The point of this work is
tests that catch defects, not tests that move a number — five of the findings so
far came from tests written against behaviour, and none would have come from
tests written to satisfy a threshold.

---

## Where things stand

| | |
|---|---|
| Files at or above 70% | **520 / 810** (64.2%) |
| Packages fully clear | 17 of 21 |
| Remaining files | **290** — all in `grid`, `ui`, `engine`, `widgets-react` |

Run this to get the live number; never quote this file's number without checking:

```bash
npm run test:coverage -- --force --concurrency=1   # merges coverage/lcov.info for Sonar
npm run check:coverage                             # the gate — lists every file below 70%
```

**`--concurrency=1` is load-bearing, not tidiness.** At turbo's default
concurrency four consecutive runs on an unchanged tree reported 504, 515, 520 and
391 files clear, and a package that is fully covered can report as failing —
`openfin-platform` did, which is why session 4 below has nothing left to do.
Serialised, the number is reproducible. See `WORKLOG.md` item 9.

---

## Conventions

### React components — React Testing Library, always

Enforced by `npm run check:rtl` (part of `lint:all`). Any test that renders JSX
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

## Sessions

Sizing assumes ~35 logic files or ~20 React components per session — the rate
actually observed, not an estimate. Order is smallest-gap-first so each session
finishes packages outright.

| # | Scope | Files | Kind | Exit criteria |
|---|---|---:|---|---|
| ✅ 0 | Infrastructure + 9 packages | — | — | Gate, Sonar LCOV, all 21 packages have a suite |
| ✅ 1 | `host-openfin` (1) · `host-config` (5) · `shared-types` (6) · `host-data` (6) | 18 | logic | 4 packages clear |
| ✅ 2 | `widget-sdk` (6) · `host-data-react` (8) · `workspace-setup-react` (9) | 23 | 14 React | 3 packages clear |
| ✅ 3 | `config-browser` (13) | 13 | 11 React | 1 package clear |
| ~~4~~ | ~~`openfin-platform` (23)~~ — **already clear; measure before starting** | 0 | — | — |
| 5 | `engine` — part 1 | 21 | logic | — |
| 6 | `engine` — part 2 | 21 | logic | `engine` clear |
| 7 | `widgets-react` (30) | 30 | 20 React | 1 package clear |
| 8–10 | `ui` (54) — shadcn components, ~18 per session | 54 | all React | `ui` clear |
| 11–16 | `grid` (164) — customizer modules, ~27 per session | 164 | 101 React | `grid` clear |

**~12 sessions remaining.** `grid` and `ui` are 75% of the total and are
deliberately last: they are the most repetitive, so the conventions will be well
established by the time they are reached.

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
package under-reports (see `WORKLOG.md` item 9). Confirm with
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

Append a row per session. Numbers come from `npm run check:coverage`, after a
**serialised** `npm run test:coverage -- --force --concurrency=1`.

| Session | Date | Files ≥70% | Δ | Packages cleared |
|---|---|---:|---:|---|
| 0 | 2026-07-31 | 412 → 443 | +31 | types, host, host-browser, design-system, widget, widget-browser, icons-svg, shared-types*, widget-sdk* |
| 1 | 2026-07-31 | 443 → 461 | +18 | host-openfin, host-config, shared-types, host-data |
| 2 | 2026-07-31 | 461 → 484 | +23 | widget-sdk, host-data-react, workspace-setup-react |
| 3 | 2026-07-31 | 484 → 520 | +36** | config-browser (openfin-platform was already clear) |

\* harness added, package not yet fully clear.

\*\* Session 3 wrote tests for 13 files, all in `config-browser`. The other +23
is `openfin-platform`, which this session did not touch: it was already above the
bar and only *reported* as failing under a parallel `test:coverage` run. The
before-number (484) came from such a run; 520 is the reproducible serialised
number. See `WORKLOG.md` item 9.

**Session 3 notes.** All 13 target files cleared — `config-browser` went from
5.7% to **99.0% lines / 92.1% branches**, 243 tests across 14 files, no assertion
weakened. The package had `environment: 'node'` and no RTL usage at all; the
config is now `jsdom` + `include: src/**/*.test.{ts,tsx}` + `testTimeout: 15_000`,
and `tsconfig.build.json` also excludes `src/test-utils/**`.

Two findings, both recorded in `WORKLOG.md`:

- **Item 9 — `test:coverage` is not reproducible at default concurrency.** Found
  while trying to record this session's before/after honestly. Four runs on an
  unchanged tree gave 504 / 515 / 520 / 391. One of those runs scored the repo
  out of **651** files instead of 810 because several packages never wrote a
  summary and `check-package-coverage.mjs` counted them as absent rather than
  failing. This is why session 4 has nothing to do.
- **Item 10 — `RowDrawer`'s JSON textarea has no accessible name.** It is the
  package's primary control and cannot be found by role+name; the panel test
  filters on `tagName` with a pointer to the item.

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
consistency hazards surfaced and are recorded as `WORKLOG.md` item 7.

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
findings are recorded as `WORKLOG.md` item 8 — three real defects in
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
