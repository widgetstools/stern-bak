# SSRM parity completion — the four findings the roadmap left open

**Branch:** `feature/simplify`. **Status: 0 / 4 phases done.**

[`SSRM_PARITY_ROADMAP.md`](./SSRM_PARITY_ROADMAP.md) closed 32 of 36 audit
findings across 11 phases and recorded four as needing their own sessions. This
document is those four, sequenced. Phases continue that roadmap's numbering
(it ran Phase 0 → Phase 10) and are written to be picked up cold, one per
session.

**The roadmap's [binding constraints](./SSRM_PARITY_ROADMAP.md#binding-constraints-they-override-phase-text)
govern every phase here and are not restated.** The two that bite hardest in
this stretch:

- **No module may branch on the row model.** Everything below goes through
  `platform.data` or the worker plane, never an `if (ssrm)` in
  `customizer/modules/**` — `no-restricted-properties` over both halves of
  that tree makes `lint:all` fail if one is added (Phase 10).
- **800 LOC / file, 80 LOC / function.** Phase 12 opens by paying a debt
  against this, described there.

## What changed since the roadmap was written

Two commits moved the ground under these findings and are the reason the
sequencing below differs from the roadmap's own note:

- **`293e2d2` built `SessionOverlay`** — the per-session query layer three of
  the four findings were all waiting on
  (`packages/data/host-data/src/runtime/ssrm/SessionOverlay.ts`, 15 cases in
  `SessionOverlay.test.ts`). `QueryEngine` already exposes
  `setSessionPatches` (`:269`), `clearSessionPatches` (`:277`) and
  `setSessionExclude` (`:288`). **No client can call any of them** — that gap
  is Phase 12 and it is now plumbing, not design.
- **`76489fe` built the edit write-back path** — `EditWriteBack.onFailure`
  reports `{ error, rolledBack, stuck }` on a refused write. **Nothing
  listens**, so a refused edit reverts silently. That is why the smallest
  phase is scheduled first rather than last.

---

## Phase 11 — a refused write is visible, and two panels stop lying

**Goal:** every failure this platform already detects reaches the user.

**Entry:** none. Runnable immediately, and independent of Phases 12–14.

**Why first, despite being the smallest.** `76489fe` shipped a revert path
whose whole purpose is telling someone. Until a surface exists, a rejected
edit silently reverts, which is a worse user experience than the silent no-op
the parity effort set out to remove.

**Scope**

- **Mount a toast surface.** `sonner` is a declared dependency
  (`packages/react-core/package.json:101`) and `SonnerToaster` is exported
  (`packages/react-core/ui/src/index.ts:83`), but **nothing under `packages/`
  mounts it** — the only `<Toaster />` in the tree is
  `apps/source/design-system/src/App.tsx:148` and its showcase. Decide the
  mount point (the grid shell vs. the containers), and mind that an OpenFin
  view is its own window: a toast portalled to `document.body` is correct
  here, but confirm it against the view's stacking rather than assuming.
- **Wire `EditWriteBack.onFailure` to it.** Two distinct messages, because
  they are two distinct situations: `rolledBack` non-empty means "your edit
  was rejected and has been undone"; `stuck` non-empty means "your edit was
  rejected and the grid could not undo it" — the second is the one that
  matters, and under SSRM it is reachable whenever the row's block has been
  evicted. Do not collapse them into one string.
- **CSRM drops the host's `onSavingChange`.** `MarketsGridContainer.tsx:748`
  passes `onSavingChange={setIsSavingProfile}`, overwriting whatever the host
  supplied. The SSRM container already does this correctly — it chains, via
  `hostOnSavingChange` / `handleSavingChange`
  (`SsrmMarketsGridContainer.tsx:490-493`). Adopt that pattern; do not invent
  a second one.
- **The SSRM row-count panels never consult pagination.**
  `createSsrmStatusBar.tsx` contains no reference to pagination at all, and
  its three worker-backed replacements
  (`NATIVE_COUNT_TO_SSRM`, `:188-192`) always render whole-dataset counts
  (`:153-172`). Establish what the native components they replace render when
  `pagination` is on **before** changing anything — the fix is only a fix if
  it matches what CSRM shows.

**Exit**

- A rejected edit raises a toast naming what happened, distinguishing reverted
  from stuck.
- A host passing `onSavingChange` to `MarketsGridContainer` receives it.
- The row-count panels agree between row models with pagination on and off,
  with a test pinning both.

**Closes:** post-write edit rejection surface; two bugs found during Phases
7–10 and recorded rather than fixed.

---

## Phase 12 — the session query layer reaches the client

**Goal:** a window can tell the plane about state that is private to it, so
the query answers for *that* window.

**Entry:** none in code — `SessionOverlay` is built and tested. Read
`SessionOverlay.ts`'s header first; it states the invariant the whole layer
rests on.

**Open by paying a debt.** `QueryEngine.ts` is **895 lines against the 800
ceiling** — it was 777 at `24dfdc2` and `293e2d2` added 118. The roadmap
anticipated this session starting with a split; it is now overdue rather than
anticipated. Visible seams, all cohesive and none of them load-bearing for the
session work: the **pivot cluster** (`pivotKey:714`,
`collectPivotResultFields:722`, `pivotAggregate:744`, `valueAgg:772`), the
**sort cluster** (`sortGroupRows:800`, `sortRows:822`), and the **tree path**
(`treeBlock:506`). Split first, land it, then build on a file under the
ceiling — not the other way round.

**Scope**

The RPC is **mechanical, and it has an exact template**:
`configureExpressions` is already a per-session call and already traverses
every hop this one needs. Follow it rather than inventing a shape.

| Hop | File | Template site |
|---|---|---|
| 1 | `runtime/protocol.ts` | `SsrmConfigureExpressionsRequest:417`, union member `:443` |
| 2 | `runtime/worker/SharedWorkerDataServicesHub.ts` | dispatch branch `:618-622` |
| 3 | `runtime/client/SharedWorkerDataServicesClient.ts` | `ssrmConfigureExpressions` |
| 4 | `runtime/ssrm/SsrmPlane.ts` | `:157` |
| 5 | `runtime/ssrm/SsrmServer.ts` | `:222` |
| 6 | `provider/ISsrmDataProvider.ts` | `:37` |
| 7 | `provider/SsrmProviderClientAdapter.ts` | `:166` |

Then the client-side seam, which is the only part needing a decision:

- **`SsrmDataSource` is where core reaches the plane**
  (`packages/core/engine/src/platform/types.ts:478`). It is a *structural*
  interface — core declares the shape, the data package supplies an
  implementation — so adding optional `setSessionPatches` /
  `setSessionExclude` members there crosses no import boundary. Optional
  because a transport need not implement them, exactly as the existing members
  handle that.
- **`SsrmDataAdapter.mutate()` calls it** after `applyServerSideTransaction`,
  so an edit survives a block refetch. This is the point of the whole phase:
  today the value lives only in AG Grid's block cache, and under an active
  sort `bindSsrmTicks` schedules a purge-refresh 50 ms after every tick.
- **Row exclusion installs a predicate** rather than filtering after paging.
  The client-side external filter it replaces leaves `rowCount` wrong, which
  is what the scrollbar is built from — `SessionOverlay.test.ts` already pins
  that exclusion must affect `rowCount` and `grandTotal`, so those cases
  become reachable rather than new.

**Exit**

- An SSRM edit survives a block refetch, and is visible only to the window
  that made it.
- Row exclusion removes rows from the session's own counts and aggregates, at
  the source.
- `npm run bench:ssrm` shows the **shared** path unchanged — a grid that is
  neither editing nor excluding must still share one cache entry. This is the
  invariant that makes the plane worth having; treat a regression here as a
  failed phase, not a tuning problem.
- `QueryEngine.ts` under 800 lines.

**Closes:** T2-4's real fix; an SSRM edit surviving a block refetch (Phase 4
decision 1).

---

## Phase 13 — filter, sort and group on calculated columns

**Goal:** a calculated column behaves like a real one under both row models.

**Entry:** Phase 12. Not startable before it — this phase is an addition to
the layer Phase 12 makes reachable.

**Scope**

The roadmap's own statement of why this was deferred is still the accurate
one: the plane's memoised order-cache entries hold **raw** rows by design and
every call site enriches the sliced page *after* paging (`QueryEngine.enrich`,
`:862`). That is exactly what makes one memo entry safe to share between
sessions running different rules. So filtering or sorting on a calculated
field needs an enriched view that is **per-session and incremental**:

- a per-query enrich is O(rows × rules) on every distinct filter;
- materialising into `RowStore` is wrong, because rules are per-session and
  the store is shared.

`SessionOverlay.stateFor().view(row)` is precisely that hook — it is already
the per-session row view the filter and sort consult, and it already returns
the **same reference** for an unpatched row so a session with one edit does
not copy the store. Computed fields materialise there, alongside patches.

Two properties to hold, both already pinned for patches and needing the
equivalent for computed fields:

- a session with no rules still shares the cache (`SessionOverlay.test.ts`,
  "the sharing model is preserved");
- the identity that keys the cache changes when the rules change, or a stale
  order is served.

**Exit**

- Filtering, sorting and grouping on a calculated column returns the same rows
  in the same order under both row models.
- A clean session's memo behaviour is unchanged, proven by the existing
  hit/miss assertions rather than by inspection.

**Closes:** T1-4.

---

## Phase 14 — the alerts bell counts what the plane sees

**Goal:** the bell counts alerts across the dataset, not across the loaded
blocks.

**Entry:** none. Independent of Phases 11–13 and nothing gets easier by
ordering it after them — it is scheduled last only because it is the largest
single piece and closes no other finding.

**Scope**

Surveyed in Phase 5 and re-verified: the channel this rides **cannot** be the
tick fan-out. `SharedWorkerDataServicesHub.fanSsrmFlush` sends a session its
*interested* rows, or — only where `wantsUnmatchedRows(subId)` holds, i.e. a
**filtered** session — the full changed set, or nothing. An unfiltered session
therefore never receives a row outside its viewport, and widening that is
exactly the whole-payload-to-every-session cost the windowed flush exists to
avoid.

`__ssrmAlert` is written by `enrich`, which runs only on rows the plane is
**handing over** — so a worker-detected alert is only ever present on a row
the client already has. Wiring it to the dispatcher would not raise the count
by one. That is worth re-confirming before writing code, because it is the
reason a cheaper fix does not exist.

So: a **new worker→client message kind carrying HITS** (row key + rule id),
not rows, evaluated per session in the plane and addressed by `sessionId`
— `configureExpressions(rules, sessionId)` is already session-keyed, and one
grid's alerts must not ring in another's bell. Spans:

- `runtime/ssrm/expressionRules.ts` — a hits-only evaluator beside `enrich`
- `runtime/ssrm/SsrmPlane.ts` / `SsrmServer.ts`
- `runtime/worker/SharedWorkerDataServicesHub.ts` — message kind + fan-out
- `provider/ISsrmDataProvider.ts` + `SsrmProviderClientAdapter.ts` —
  `onSsrmAlert`
- the grid's alerts dispatcher wiring
- **a dedupe against `__ssrmAlert`** on the rows the client does hold, or
  every visible hit fires twice

Phase 0's rule against new RPCs does not apply: a notify channel is a read,
not a write into a shared store. The objection was always scope, not shape.

**Exit**

- The bell counts a hit on a row the client has never loaded.
- A visible hit counts once, not twice.
- Two windows on one provider with different alert rules each count their own.

**Closes:** T2-6.

---

## Not a defect — recorded and closed

**Two windows on one historical provider fight for its single snapshot.**
Carried by the roadmap as open. It is architectural and **CSRM behaves
identically**, so it is not an SSRM parity finding and closing it is not part
of this effort. Reopen it as a product decision about historical providers if
it ever matters; do not carry it as a parity gap.

---

## Sequencing summary

| Phase | Session | Entry | Closes |
|---|---|---|---|
| 11 — a refused write is visible | small | none | rejection surface + 2 bugs |
| 12 — session layer reaches the client | full | none | T2-4 real fix, edit survives refetch |
| 13 — calculated columns | full | Phase 12 | T1-4 |
| 14 — alerts bell | full | none | T2-6 |

Phases 11, 12 and 14 have no entry dependency and can run in any order. Only
Phase 13 is gated, on Phase 12.

## Verification, every phase

Inherited from the roadmap and not negotiable per phase:

1. `npx turbo typecheck build` exits 0.
2. Package tests run **serially, `--maxWorkers=2`**. This box produces false
   failures above load ~15 (`[vitest-pool]: Failed to start forks worker`,
   `Worker exited unexpectedly`), always in untouched packages — re-run
   standalone before believing one.
3. ESLint over the touched tree: no new warnings. Fix them in the phase that
   introduces them rather than banking them.
4. `node scripts/check-package-cycles.mjs` and `npm run check:rtl` pass.
5. `npm run bench:ssrm` for any phase touching the plane — Phase 12's shared
   path invariant is a gate, not an observation.
6. `docs/current-features.md` updated in the same commit (CLAUDE.md
   post-implementation rule 1), and the phase's record appended here.
