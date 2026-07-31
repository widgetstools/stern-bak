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
| Files at or above 70% | **443 / 810** (54.7%) |
| Overall line coverage | ~50% |
| Packages fully clear | 9 of 21 |
| Remaining files | **367** — 200 React (`.tsx`), 167 pure logic |

Run this to get the live number; never quote this file's number without checking:

```bash
npm run test:coverage      # runs all suites, merges coverage/lcov.info for Sonar
npm run check:coverage     # the gate — lists every file below 70%
```

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
| 1 | `host-openfin` (1) · `host-config` (5) · `shared-types` (6) · `host-data` (6) | 18 | logic | 4 packages clear |
| 2 | `widget-sdk` (6) · `host-data-react` (8) · `workspace-setup-react` (9) | 23 | 14 React | 3 packages clear |
| 3 | `config-browser` (13) | 13 | 11 React | 1 package clear |
| 4 | `openfin-platform` (23) | 23 | logic | 1 package clear |
| 5 | `engine` — part 1 | 21 | logic | — |
| 6 | `engine` — part 2 | 21 | logic | `engine` clear |
| 7 | `widgets-react` (30) | 30 | 20 React | 1 package clear |
| 8–10 | `ui` (54) — shadcn components, ~18 per session | 54 | all React | `ui` clear |
| 11–16 | `grid` (164) — customizer modules, ~27 per session | 164 | 101 React | `grid` clear |

**~16 sessions remaining.** `grid` and `ui` are 60% of the total and are
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

**4 — `openfin-platform`** is all logic but heavily `fin`-dependent. Copy the
`windowOptionsSubscription` tests' approach: `vi.stubGlobal('fin', …)` with a
fake window, and a `__reset…ForTests` hook where one exists.

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

Append a row per session. Numbers come from `npm run check:coverage`.

| Session | Date | Files ≥70% | Δ | Packages cleared |
|---|---|---:|---:|---|
| 0 | 2026-07-31 | 412 → 443 | +31 | types, host, host-browser, design-system, widget, widget-browser, icons-svg, shared-types*, widget-sdk* |

\* harness added, package not yet fully clear.
