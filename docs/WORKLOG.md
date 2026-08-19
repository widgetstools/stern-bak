# Worklog — outstanding items

> **2026-08-14 (feature/simplify):** `EXTERNAL_CONSUMPTION.md`, `MARKETSGRID_USAGE_GUIDE.md`, `STOMP_DATAPROVIDER_MARKETSGRID_GUIDE.md`, and the hosted-wrapper README were **deleted** — every one referenced packages, scripts, or apps that no longer exist. Phase 7 of the simplification roadmap rewrites consumer docs from scratch; `docs/latest/` remains the accurate set. Worklog entries below referring to those files are historical.
>
> **2026-08-14 (Phase 7):** the stale-docs refresh pass landed (former item 13 — closed): live docs' pre-collapse paths/names fixed, docs whose subject no longer exists deleted, `docs/superpowers/` dissolved into `docs/archive/`. Item 3 closed the same day: `host-data-angular` is deleted, not excluded.

Single index of known-open work in this repo — which, since 2026-08-02, again
includes the consumer/demo apps: the `stern-apps` repo was merged back
under [`apps/`](../apps) (git subtree, history preserved) once every package
held the 70% per-file coverage bar. Older entries that say "stern-apps" refer
to what is now the `apps/` tree; the separate remote is historical.

Each entry states what is wrong, why it was left, and what "done" looks like, so
it can be picked up cold. Close an item by deleting its section in the same
change that fixes it.

Last updated: 2026-08-18.

---

## 10. A `--force` build can be read half-written, failing ~109 suites

**Repo:** stern-bak · **Blocked on:** nothing; needs a repro loop to confirm the fix

Seen once in four consecutive `npm run test:coverage -- --force` runs on an
unchanged tree. `grid` failed **109 suites at collection** — not at assertion —
all with the same error:

```
Failed to resolve import "./primitives" from
  ../../design-system/design-system/dist/tokens/index.js
```

The emitted barrel was mid-write. A finished build emits
`from './primitives.js'`; the file on disk at that moment had the extensionless
specifier from a partial emit, which vite cannot resolve. Every package that
transitively imports design-system tokens then fails to load. `widgets-react` and
`workspace-setup-react` went down with it — three packages produced no coverage
summary.

Every library build is `rimraf dist && tsc` (required — it defeats a TS5055
on Turbo cache-restore). That leaves a window where `dist/`
exists but is incomplete, and a consumer's vite transform reading it gets a
truncated module. `--concurrency=1` does not close the window, so serialising is
not the answer.

**This failed loudly, which is the good news.** `check-package-coverage.mjs`
printed `INVALID — 3 of 21 package(s) produced no summary` and refused to give a
percentage. Before that guard existed it would have reported a plausible
`402/402 (100.0%)` and nobody would have looked.

**Done looks like** a repro (a loop of `--force` runs) and then one of: `tsc`
emitting to a temp dir and renaming into place atomically; or the `test` task
depending on a build output the consumer can't observe mid-write. Confirm by
running the loop 20× green, not once.

## 12. Demo-app follow-ups from the framework-usage audit (2026-08-02)

**Area:** `apps/source/*` · **Blocked on:** nothing — mechanical, just not urgent

The 2026-08-02 audit fixed the clear-cut defects (see the `feat/documentation`
branch); these judged-riskier items remain:

1. **Destructive resets should confirm via `AlertDialog`.** `basic`
   `src/App.tsx` `handleReset` wipes storage with no confirmation (its own
   HelpSheet advertises "with confirm"); `dataprovider-editor` `src/App.tsx`
   uses native `window.confirm`. Both should use `AlertDialog` from
   `@wellsfargo-starui/react`.
2. **markets-grid-lab gridIds carry `-vN` suffixes** (`lab-alerts-v2`, …,
   11 of 17 catalogs) — conflicts with the no-versioned-names rule and
   orphans saved profiles on every bump; the sanctioned reseed mechanism is
   `LAB_DEMO_PROFILES_FLAG_VERSION`. Renaming must be coordinated with
   `apps/e2e/v2-*.spec.ts` (which pin the ids) and `src/help/*.md`.
3. **Tokenize the DOM-only lab seed colors.** `src/seeds/renderers.ts`,
   `profiles/presets.ts` and `conditionalStyling.ts` `indicator.color` never
   reach the Visual Excel path, so `var(--ds-*)` values would work and
   collapse the `{dark, light}` literal pairs; keep hex only where colors are
   written into `.xlsx`. The seeds dir is carved out in `check:ds-tokens`
   with this rationale.
4. **`dataprovider-editor` `StatsPanel` polls at 1 Hz** while `basic`
   deliberately teaches the event-driven alternative — two tutorials
   demonstrating opposite patterns.
5. **`check:ds-tokens` violations — re-counted 2026-08-18: 382, and the shape
   matters more than the number.** 298 of them are in TESTS, lab SEEDS and
   demo APPS — none of which ship. Of the ~84 in shipping source the largest
   clusters are legitimate: `cssToExcelColor.ts` converts CSS to Excel colour
   literals (hex is the output format), and `expressionEditor.css` is an
   editor theme. This is not a 382-item backlog; it is a small number of real
   ones inside a large number of false positives, and the check's carve-outs
   should be widened before anyone works it.
6. ~~`star-demo` `RenameViewTab` imports `Button, Input` from
   `@wellsfargo-starui/grid/customizer`~~ — **STALE, verified fixed
   2026-08-18.** Both `star-demo` and `star-demo-ssrm` already import from
   `@wellsfargo-starui/react`.
7. **Grid perf risk (from the archived June perf audit, still open):**
   timed/header conditional-styling rules and virtual calculated columns can
   trigger full-grid scans every tick; only partially covered by
   `blotter-performance-roadmap` Tier 4.


## 14. First-run catalog read stalled once — class closed, forensic cause unproven

**Area:** `packages/data/host-data` (worker) · **Blocked on:** recurrence

Observed once (2026-08-02, first-run cold boot of `stomp-marketsgrid-minimal`):
the worker's first ConfigManager read (`ConfigCatalogCache.ensure` →
`store.get` → Dexie) never settled, so `handleGetConfig` never replied and
the client hung on a stranded promise. Instrumented browser traces of
subsequent first-run boots (fresh profile, empty IndexedDB, real seed
storm) could not reproduce the stall.

**The failure class is closed at both layers, with tests:**
- `useDataProviderConfig` bounds each fetch (2.5s × 3 silent re-issues on
  no-response; explicit rejections unchanged) — `react-core` hook tests.
- Every async catalog RPC handler now guarantees **exactly one reply** —
  result, error, or a 10s deadline error — via `replyBounded` in
  `hubCatalogRpc.ts`; late completions are not re-sent but keep their side
  effects (row cached; `catalog-ready` still broadcast) —
  `hubCatalogRpc.test.ts` "Bounded replies" suite, including the observed
  six-invalidate seed storm interleaving.

**Remaining (forensic only):** what made that one Dexie read stall. If a
deadline error ever surfaces in the wild (`"catalog read did not settle"`),
capture the worker console via chrome://inspect at that moment — the
backstop now makes the event visible instead of silent.

---

## 15. SSRM engine follow-ups from the hardening pass (2026-08-12)

**Area:** `packages/data/host-data/src/runtime/ssrm/` · **Blocked on:** nothing — technical debt only

> **2026-08-16:** the `QueryEngine.ts` 834-LOC item is **closed** —
> [`docs/SSRM_PARITY_ROADMAP.md`](./SSRM_PARITY_ROADMAP.md) Phase 1 took the
> documented tree-data split (`treeIndex.ts`); the engine is 744 LOC.
> That roadmap also supersedes the framing of this entry's opening line — a
> parity audit found 36 divergences, 21 of which **do** affect correctness,
> and Phase 1 closed seven of them inside this directory.

**Seven of eight closed 2026-08-18.** All were "none affect correctness"; two
turned out to cost real work per mount and per idle second.

- ✅ Snapshot mid-window dropped `pendingCount` from `updatesAccumulated` —
  those updates DID arrive and were counted at ingest, so zeroing made the
  cumulative total drift below the real one, and that total is the denominator
  of the conflation ratio `getStats` reports. The snapshot flush now carries
  the discarded count.
- ✅ Any session's `configureExpressions` cleared the WHOLE shared order cache,
  so ten blotters pushing rules at mount evicted each other's warm orders nine
  times over. Now `invalidateSessionOrders` drops only the entries naming that
  session — reachable because every cache key carries the requesting session's
  identity since Phase 12. A SESSIONLESS configure still clears everything: it
  changes what every session without its own set resolves to.
- ✅ `engineBoundary.test.ts` matched only `from '…'`, so
  `await import('../worker/x')` or a `require` would have slipped through —
  and a dynamic import is exactly how someone reaches for the forbidden side
  once the static form is refused. Now matches all three forms, with a case
  asserting it.
- ✅ `RowStore.emit()` had no per-listener try/catch. `onTick` is a public
  subscription and one consumer throwing aborted the loop, so every listener
  registered after it — including the windowed flush every session's ticks
  ride on — silently missed that tick.
- ✅ `SsrmStats` (and `SsrmFlushEvent`, `ViewportInterestScope`) reachable only
  through `/ssrm-engine`; now on the `./runtime` barrel too, which is where
  the hub introspect payload types live.
- ✅ `createSsrmStatusBar` mount load left `lastLoadAt` at 0, so the first tick
  inside the throttle window saw `elapsed` as the whole epoch, took the
  leading edge, and duplicated the mount fetch — one wasted RPC per panel,
  three panels, every grid mount. And the 2s fallback poll ran even for
  tick-capable providers: a worker round trip per panel every 2s, forever, on
  an idle grid. Both fixed, both pinned.
- ✅ `docs/latest/ssrm-engine.md`: `ICacheIngest` omitted `clear()` and the
  query-surface listing predated the session layer. Both now match the source.

**Still open, deliberately:** `fanSsrmFlush` rebuilds and enriches the full
changed-key row set per FILTERED session per flush — N-sessions × changed-set
work. That is the design (a filtered session cannot discover a row that changes
INTO its filter without inspecting it) and the window cadence bounds it.

## 17. SSRM/CSRM behavioural parity — 36 divergences (2026-08-16)

**Area:** `packages/core/engine/src/customizer/modules/`,
`packages/data/host-data/src/runtime/ssrm/`,
`packages/react-grid/widgets-react/src/container/` ·
**Blocked on:** nothing — sequenced work
**Plan:** [`docs/SSRM_PARITY_ROADMAP.md`](./SSRM_PARITY_ROADMAP.md) (11 phases, one per session)

A four-layer audit found SSRM and CSRM grids at parity in *chrome* and not in
*behaviour*. Only five `ssrm` guards exist in all of
`packages/react-grid/grid/src/widget/`, and nothing in the customizer is
row-model aware — `PlatformHandle` has no row-model field
(`platform/types.ts:263-278`) and the one place that anticipated one is a TODO
(`useSsrmExpressionBridge.ts:61-62`). Sixteen modules therefore run their CSRM
implementations against a ~2,000-row block cache.

**10 findings produce confidently wrong output**, including Advanced Filter
returning the entire unfiltered dataset (`ssrm/filter.ts:231`), nested-path
columns broken across filter/sort/set-values, and aggregate calculated columns
rendering a total that revises itself as the user scrolls. **11 are silent
no-ops** — notably every editing write path, which funnelled into
`applyTransactionAsync` (`editing-core/applyPatches.ts:14`, a
ClientSideRowModel-only API) while `EditJournal` recorded the edit as
successful *(closed by Phase 4 — writes go through `platform.data.mutate()`
and the journal records only confirmed cells; an SSRM edit still does not
survive a block refetch, which needs a per-session edit overlay in the query
plane — see the phase's decision 1)*, and the row-change delta hot path,
which under SSRM emitted a `full` structural change with three empty arrays on
every streaming tick *(closed by Phase 5 — `applyServerSideTransaction`'s
result is reported through `RowChangeSink`, and the filter-pill badges patch
from it: ten ticks over one row went from 22 worker round trips to 4, counted
in `useFilterModel.test.ts`)*. The rest were controls that accept input and
do nothing under one row model *(closed by Phase 6 — `data:capabilitiesChanged`
plus `useCapability` / `useCapabilityGate` put the capability copy on screen:
the bulk-update distinct dropdown reads through `platform.data.distinct()`,
Excel export confirms its scope, header paint and row exclusion disable with a
stated reason, and the custom aggregation expression closes Phase 1's
hand-off)*. **15 are container wiring gaps** *(closed by Phases 7–10: the SSRM
container now `extends Omit<MarketsGridProps, …>` and spreads the rest, so
`StarGrid.advanced` reaches it; caption, grid events, `appData`, `adminActions`,
`onError` and Config Browser routing all match CSRM; the loading overlay,
provider-failure shell and historical-date round trip landed in Phase 8; and a
provider's declared `columnDefinitions` reach the grid intact in Phase 9)*.

**Status: 11 / 11 phases complete (2026-08-17).** `npm run lint:all` now fails
on a customizer module that touches the row model directly —
`no-restricted-properties` over both halves of `customizer/modules/**`, with
ten annotated exemptions each naming why it is about the grid's DISPLAY rather
than the dataset. `docs/current-features.md` §366–390 was corrected phase by
phase.

**Four findings remained open. They are now sequenced as Phases 11-14 in
[`docs/SSRM_PARITY_COMPLETION.md`](./SSRM_PARITY_COMPLETION.md) — see item 20
below**, which supersedes the scoping notes that were here. Three of them
(T1-4, T2-4's real fix, an SSRM edit surviving a block refetch) wanted ONE
thing, a per-session layer the query applies before it pages; `293e2d2` built
it (`SessionOverlay`), so what is left is plumbing rather than design. The
fourth (T2-6, the alerts bell) is unchanged in shape and still needs its own
session. The fifth item recorded here — **two windows on one historical
provider** — is closed as **not a defect**: it is architectural and CSRM
behaves identically.

---

## 19. How far does the SSRM query plane scale? — MEASURED 2026-08-17

**Why:** a proposal to rewrite the query plane as a Rust/WASM component. Every
one of the 36 SSRM parity findings was a WIRING defect — not one was "too
slow" — so the case for a rewrite rests entirely on scale, and nobody had
measured it. `npm run bench:ssrm:sweep` runs `bench-ssrm.mjs` once per dataset
size in its own process (heap figures need a fresh heap) and reports growth
factors so superlinear behaviour is visible rather than inferred.

**Conditions:** node, 40 columns, machine load 4–8, `--max-old-space-size=12288`.
Node only — no browser, no AG Grid, no React — so a real tab hits every ceiling
below *sooner*, not later.

| metric | 100k | 250k | 500k | 1M | growth (10× rows) |
|---|---|---|---|---|---|
| ingest (`replaceSnapshot`) | 586 ms | 1461 | 2960 | 6174 | 10.5× |
| **store heap** | **41 MB** | **98** | **197** | **393** | **9.6×** |
| sorted block, cold | 127 ms | 423 | 975 | 2135 | 16.9× |
| filtered + sorted, cold | 46 ms | 144 | 304 | 688 | 14.9× |
| grouped, cold | 48 ms | 121 | 244 | 574 | 12.1× |
| quick filter, cold | 25 ms | 78 | 178 | 427 | 17.3× |
| full-store fold (`SUM`) | 153 ms | 440 | 1009 | 2413 | 15.8× |
| distinct scan (997 values) | 18 ms | 45 | 74 | 173 | 9.8× |
| 20-block scroll | 143 ms | 415 | 905 | 2274 | 15.9× |
| **2000-row tick** | **6.9 ms** | **7.4** | **7.5** | **7.6** | **1.1×** |
| total heap | 278 MB | 676 | 1344 | 2681 | 9.6× |

### Conclusion: no cliff, and the binding constraint is MEMORY, not CPU

**Nothing falls over.** 1M rows × 40 cols completes every operation with no
OOM. The 15–17× growth flagged on the sort-based paths is not a cliff — 10×
rows under n·log n is ~12×, and the rest is cache behaviour at a larger working
set. Quadratic would have been 100×.

**The streaming path is size-independent.** A 2000-row tick costs 6.9 ms at
100k and 7.6 ms at 1M — 1.1× for 10× the data. That is what a live blotter
does all day, and it does not care how big the store is.

**Memory is what runs out first.** Total heap reaches 2.7 GB at 1M rows *in
node*. Add a browser, AG Grid and React and 1M rows is not viable at any
engine speed. Store heap is a clean linear 41 MB → 393 MB.

**Where interactivity goes:** cold sort and 20-block scroll cross ~1 s between
250k and 500k. Comfortable at 100k (127 ms / 143 ms), fine at 250k
(423 / 415), degrading at 500k (975 / 905), poor at 1M (2135 / 2274).

### Recommendation: the sweep does not justify a Rust/WASM engine today

At the sizes this platform actually runs, the plane is comfortable. Revisit
**only** if a real requirement for 500k+ rows in a browser appears — and note
that the argument then is **columnar memory layout, not raw speed**: a typed
columnar store could plausibly cut the 393 MB store heap by a large factor,
which is the ceiling that binds, whereas the CPU numbers at 500k are
inconvenient rather than disqualifying.

The three open findings (T1-4, row exclusion at source, edit overlay) remain
the WRONG justification for a rewrite — they are ~2 sessions of JavaScript
against the existing plane.

**If it is ever revisited:** build one operation behind a third
`GridDataPort` adapter, keep the JS engine, and run both against the existing
conformance suites — `portContract.test.ts` (49 cases, already written to run
against multiple adapters), `filterPredicate.test.ts` (40),
`engineContract.test.ts` (37). Do not port the expression DSL
(`core/engine/src/expression/`, ~2,030 lines) in a spike; size it separately.

**Re-run with:** `npm run bench:ssrm:sweep` ·
`SWEEP_ROWS=… SWEEP_COLS=… SWEEP_HEAP_MB=… npm run bench:ssrm:sweep`

---

## 21. Complexity ceilings: enforced on the diff, two real violations left (2026-08-17)

**Area:** `scripts/check-complexity-budget.mjs`, `eslint.config.mjs` ·
**Blocked on:** nothing

CLAUDE.md calls 800 lines / file and 80 lines / function binding. ESLint has
both as `warn`, and **192 functions** and **7 files** are already over — so the
ceilings were a norm, not a rule, and the norm actually being applied was
narrower: *don't make it worse, and fix what you grew*.
`npm run check:complexity` makes that mechanical: for every file changed
against the base ref it compares the file's total lines-over-the-ceiling before
and after, and fails when a FUNCTION's grew. **Diff-scoped, so it is NOT in
`lint:all`** — that is a whole-repo gate and this one's meaning depends on what
you are comparing to. It runs in CI's `quality` job on pull requests, with
`--base=origin/<target>`; locally a bare run defaults to `@{upstream}`, i.e.
"the work I am about to push".

- **Excess, not violation count**, so splitting one 200-line function into a
  120 and a 100 passes (excess 120 → 60) while 102 → 105 fails. Counting
  violations would punish exactly the change the ceiling exists to encourage.
- **ESLint's numbers, not `wc -l`.** They disagree by hundreds of lines here
  (`max-lines` skips blanks and comments), which is how four phase records came
  to report files as "over the ceiling" that the rule never flagged.
- **File growth is reported, not blocked.** A function over the ceiling can
  always be fixed locally by hoisting a closure that captures nothing; a file
  can only be fixed by splitting it, which is a design decision and shouldn't
  be forced on whoever adds the next feature line.

Introducing it found **five** function-level regressions across Phases 11 and
14 that hand review had missed, all now fixed by hoisting — `activateAlerts` is
201 lines, *below* the 202 it started at.

**One fixed, one deliberately not.**

1. **`activateAlerts` — DONE 2026-08-18.** Split into `alertsEvaluator.ts`
   (what decides whether a row change is a hit, plus the state that decision
   needs) and `activate.ts` (wiring alone). Everything needing no per-grid
   state became a module-level function taking an `EvaluatorDeps` object, so
   the factory kept only the observed-row set and the watched-column memo —
   without that second step the split just moved a 173-line function next
   door. The whole alerts directory is now at zero
   `max-lines-per-function` warnings, including a pre-existing 81-line
   `createAlertDispatcher`. 89 tests unchanged and green.
2. **`SharedWorkerDataServicesClient.ts` (169 code lines over) — NOT doing it,
   and this is a decision rather than a deferral.** The obvious seam is the
   SSRM RPC surface: 8 public methods plus `rpcSsrm` and three private fields,
   about 170 code lines, which would take the file just under. But those
   methods are reached as `client.ssrmGetRows(...)` from 11 call sites, and
   `SharedWorkerDataServicesClient` is a published export — so the split is
   either a breaking API change (`client.ssrm.getRows`) or a delegation layer
   that adds most of the lines back. Trading a public API break for a
   NON-BLOCKING warning on a file that works is the wrong trade. This is
   exactly why `check-complexity-budget` reports file growth rather than
   failing on it. Revisit if the file is being restructured for another
   reason.

**CI runs it report-only, deliberately.** `feature/simplify` predates the
check and trips it **26 times** against `main` (9 of those are new files whose
functions ship over the ceiling), so gating on it would block the branch that
introduced it. Same treatment, and the same reason, as the `check:ds-tokens`
step beside it. The LOCAL default (`@{upstream}`) is exact and blocking, which
is where it actually catches things — CI is the backstop.

**Done looks like** the 26 worked through, `continue-on-error` dropped from the
CI step, the two violations above split, and `max-lines` promoted from reported
to blocking in `check-complexity-budget.mjs`.

---

