# Worklog — outstanding items

Single index of known-open work across **both** repos:

- `widgetstools/stern-bak` — this repo, the library monorepo (`@wellsfargo-starui/platform`)
- `widgetstools/stern-apps` — the consumer/demo apps (`@wellsfargo-starui/apps`)

Each entry states what is wrong, why it was left, and what "done" looks like, so
it can be picked up cold. Close an item by deleting its section in the same
change that fixes it.

Last updated: 2026-07-31.

---

## 1. ~34 e2e specs target the deleted `demo-react`

**Repo:** stern-apps · **Blocked on:** a product decision, not a fix
**Detail:** [`E2E_STATUS.md`](https://github.com/widgetstools/stern-apps/blob/main/E2E_STATUS.md)

The app curation deleted `demo-react`, which was the suite's default `baseURL`
target. Only 13 of the 47 remaining specs pin their own port; the rest inherited
that default and are written against demo-react's markup — they wait on
`[data-grid-id="demo-blotter-v2"]`, which `star-demo` does not have. The
`baseURL` now points at star-demo (`:5175`), so they fail at setup rather than
silently passing.

**Measured baseline (first ever recorded):** 374 tests / 47 files →
**10 passed, 2 skipped, 362 failed**, 19.9 min.

**Important caveat on that number:** no pass/fail baseline for this suite was
ever recorded before the split. The old `docs/E2E_STATUS.md` carried an unfilled
*"Record the resulting N passed / M failed here"* placeholder and warned that its
headline figure was a *collection* count, not a pass count — so "398 tests" never
meant 398 passing. Specs pinned to surviving apps also fail (e.g. `v2-alerts` on
markets-grid-lab times out on `[role="tab"]`), and it is **not established**
whether the split caused that or it was already red.

**Done looks like** one of:
- give star-demo the surface the specs expect (a `demo-blotter-v2` grid, matching
  routes/fixtures) — most specs then pass unchanged, but it is a decision about
  what star-demo is *for*;
- rewrite the ~34 against star-demo's actual UI — honest, ~34 specs of work;
- delete them, accepting the coverage loss (much of it may belong as unit tests
  in `grid`, which already carries 697).

**To attribute the rest properly**, run the suite against `80ab02a` (before any
app was deleted) and diff. Nobody has.

**Also here:** `e2e-openfin/` came across pointing at `e2e-openfin-workspace`,
which was deleted. star-demo is itself an OpenFin app with a `launch.mjs` and
manifest, so retargeting is plausible but unverified.

---

## 2. `eslint.config.mjs` references deleted packages

**Repo:** stern-bak · **Blocked on:** a repo hook that forbids agent edits to that file

Stale after the deletions in `7e4a674` and `47c802a`:

- `FRAMEWORK_ADAPTERS` still lists `@wellsfargo-starui/app` (deleted)
- `APP_REVERSE_DEP` guards against importing `@wellsfargo-starui/app` — a rule
  for a package that no longer exists, plus its usage block on `OPENFIN_GLOBS`
- lint globs for `packages/angular-core/**`, `packages/angular-grid/**`,
  `packages/angular-ui/**` (all deleted)

**Nothing is broken** — the patterns simply match nothing. This is dead config,
not a failure.

**Done looks like** a human pass removing those entries. One edit, no logic
change. The hook exists to stop agents weakening lint config, which is why it
was respected rather than bypassed.

---

## 3. `host-data-angular` is the last Angular package

**Repo:** stern-bak · **Blocked on:** nothing — needs a decision only

`packages/data/host-data-angular` survived the bucket deletion in `47c802a`
because it sits in the `data` bucket. It is excluded from the pipeline:
out of the root `workspaces`, and skipped by `SKIP_MEMBERS` in
`scripts/pack-npm.mjs` and `ANGULAR_MEMBERS` in
`scripts/gen-consumer-tsconfig.mjs`.

Its `tsconfig.json` used to extend `angular-core/tsconfig.angular.json`; those
three compiler options are now inlined so nothing dangles.

**Done looks like:** either keep it (no action, it costs one skip entry in two
scripts) or delete it — after which both skip mechanisms and the `data` bucket's
individually-listed workspace members can collapse to a `packages/data/*` glob.

---

## Pre-existing, tracked elsewhere

Not repeated here to avoid two lists drifting — see
[`PACKAGING_CHANGELOG.md` § Open items](./PACKAGING_CHANGELOG.md#open-items):

1. Duplicate worker chunk in demo output (~249 KB; demo output only)
2. Test coverage / Sonar LCOV — none of the tooling exists yet
3. ESLint `unicorn/filename-case` per-bucket enforcement

Item 1 there refers to "in-repo demos", which now live in stern-apps — the fix
belongs in that repo's `source/` apps.
