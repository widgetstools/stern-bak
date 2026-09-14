# Edit lifecycle, staged batches, and file import — platform plan (CSRM + SSRM)

**Status:** proposed · phases E1–E6 open
**Origin:** built once, app-side, in `apps/source/spg-pricing-blotter`
(2026-09-12) — that app is the working prototype every phase below
platformizes. Its seams are cited throughout; treat them as the reference
implementation, not as the final home.
**Scope:** BOTH row models. None of this is SSRM-specific — CSRM has the
same gaps, mostly worse (see §1).

---

## 1. What exists today, per row model — the gaps these phases close

### The write path

| | CSRM | SSRM |
|---|---|---|
| Provider write contract | **None.** `IDataProvider` (`packages/data/host-data/src/provider/IDataProvider.ts`) is read-only — start/stop/refresh/getData/onTick. | `ISsrmDataProvider.applyEdits` (optional) → worker engine upsert + per-cell edit overlays (`SsrmWasmPlane.ts` — `applyEditOverlays`, cap 10 000 rows). |
| What an edit does | `editing-core/applyPatches.ts` applies a LOCAL `applyTransactionAsync`. Nothing goes upstream; **the next snapshot replay or feed tick reverts the edit.** | `applyServerSideTransactionAsync` (paint) + the `ssrmEditWriter` seam → `applyEdits` → engine; the overlay holds the edit over whole-row feed resends until upstream moves or echoes. |
| Upstream persistence | None. | None built in — the engine cache is client-side truth; the feed is never written to. |
| Commit visibility | None — an edit looks "done" the instant it paints, whether or not anything durable happened. | Same. |

Both models therefore share the honesty gap the SPG blotter closed
app-side: **a painted cell and a committed cell are indistinguishable.**

### The prototype (spg-pricing-blotter) — what it proved and where

- **One seam covers every write path.** Wrapping `applyEdits`
  (`src/trading/serverWriteProvider.ts`) gave cell edits, multi-hundred-row
  pastes, Smart Edit, Bulk Update, undo/redo and CSV-import Save the same
  commit lifecycle with zero per-feature wiring — because
  `applyPatches.ts` + `bindSsrmEdits` already funnel there. The CSRM
  equivalent seam is the same `applyPatches` function's other branch.
- **Cell states as a store + `cellClassRules`**
  (`src/trading/cellStates.ts`, painted by `src/provider/columns.ts`):
  `staged` (amber fill — local only) → `pending` (yellow border — sent,
  not committed) → cleared on ack (the upstream echo then flashes the
  cell) → `failed` (red border, per-row, never batch-fatal). One rAF-
  coalesced `refreshCells({force})` per change burst — a 500-cell paste
  costs one repaint, not 500.
- **Validate-before-stage** (`/api/lookup`): an unknown key must never
  reach the cache — under SSRM the engine's whole-row upsert would mint a
  phantom row; under CSRM a transaction `add` would.
- **Whole-row merge on stage**: engine upserts are whole-row, so staged
  fields merge over the server's current row before any `applyEdits`.
- Live-verified timeline: amber → "n awaiting server" for exactly the
  server's ack window → cleared; refused rows red without stranding the
  batch.

---

## 2. Phases

Each phase is session-sized, lands green on `npx turbo typecheck build
test`, and extends existing seams — no parallel machinery. Order within a
row model matters (E1 before E2/E3/E5); E4 and E6 are independent.

### E1 — Write contract + edit-ack lifecycle (the foundation)

*Contract:* one write shape on BOTH provider interfaces.
`IDataProvider.applyEdits?(req)` gains the SSRM signature
(`rows` + `editedColumns` — whole rows, edited columns named), and both
gain a lifecycle surface:

```
onEditLifecycle(handler: (e: EditLifecycleEvent) => void): Unsubscribe
// e: { batchId, rowKey, columns, phase: 'pending' | 'confirmed' | 'rejected', error? }
```

*Client:* a shared `editLifecycle` grid module (row-model agnostic)
replacing the prototype's app-side `CellStateStore` + hand-rolled
`cellClassRules`: it brands the api (the `SSRM_EDIT_WRITER_KEY` /
`SSRM_EXPR_AGG_KEY` pattern in
`core/engine/src/customizer/modules/editing-core/ssrmEditWriter.ts`),
paints `.ds-edit-pending` / `.ds-edit-failed` from design tokens on
whichever columns the provider reports writable, and coalesces repaints
per burst. `applyPatches.ts` needs no change beyond routing the CSRM
branch through `applyEdits` when the provider has one — closing the
"CSRM edits silently revert on the next tick" hole with the same
mechanism SSRM already has.

*Exit:* a CSRM grid over a provider with `applyEdits` shows the same
pending→confirmed timeline the SPG blotter shows under SSRM; a provider
without `applyEdits` keeps today's paint-only behaviour and the editing
toolbars' honest disables extend to CSRM.

### E2 — Worker-side upstream write-back

Today the prototype POSTs from the WINDOW. Two windows editing one book
each post independently, and a reload mid-flight loses the pending state.
Move the write to the SharedWorker: provider config gains

```
editEndpoint?: { url: string; method?: 'POST'; headers?; batchMs?: number }
```

The worker owns POST + retry + per-row verdict reconciliation and emits
the E1 lifecycle events to every subscribed window (the fan-out exists —
`flushSsrmTicks` / the CSRM delta path). The SSRM edit overlay's
release-on-echo already closes the loop; CSRM gets the same via the hub
row cache. Per-window wrappers become unnecessary; the SPG blotter's
`withServerWrites` reduces to config.

*Exit:* two windows on one provider — an edit in either shows pending in
BOTH and confirms in both from one POST. Kill the server: the edit goes
`rejected` in both windows, no double-post.

### E3 — Staged-edit tier (draft batches)

Staging in the prototype is client-state: a reload orphans the amber
cells (values persist in the engine, their "staged" meaning is lost).
Add a named overlay tier next to the existing SSRM edit overlays
(`SsrmWasmPlane.ts` holds per-cell overlays already — this is a second
`kind` on the same structure, not new machinery):

```
stageEdits(stageId, req) · commitStage(stageId) → E1/E2 write path
discardStage(stageId)   · stages(): { stageId, cells }[]
```

Discard becomes "drop the tier" — no server re-fetch, no whole-row
restore dance (`serverWriteProvider.ts#discardStaged` documents the
dance this deletes). CSRM: the same tier lives in the hub row cache.
Staged tiers survive window reloads and are visible to every window.

*Exit:* stage a CSV in window A, see amber in window B, reload A —
amber intact; commit from B — both windows run pending→confirmed.

### E4 — File-import module (customizer)

The prototype's dialog (`src/components/ImportPricesDialog.tsx` +
`csv.ts`) generalized into a `data-import` customizer module: file pick
(CSV first; XLSX later via the existing export dependency), column
mapping UI (source column → grid column, key column selection),
validate-against-provider (`lookup` batch — E1's contract grows
`lookupRows(keys)`), old→new preview with per-line errors, apply as an
E3 stage. Nothing writes on import; Save/Discard are E3.

*Exit:* the SPG dialog is deleted in the same change (repo rule:
superseded code goes); the module reaches CSRM grids unchanged.

### E5 — Write-conflict signal

If upstream ticks a `pending`/`staged` cell to a value DIFFERENT from
the one sent/staged, today last-write-wins silently. The SSRM overlay
already detects "upstream moved" (that is its release condition —
`SsrmWasmPlane.ts` edit-overlay reclaim); instead of only releasing,
emit `{ phase: 'conflict', theirs, ours }` on the E1 lifecycle and paint
`.ds-edit-conflict` until the trader picks (re-apply mine / take
theirs). CSRM: same check in the hub cache upsert.

*Exit:* pinned test — pending edit + a genuinely different upstream tick
→ conflict state, never a silent overwrite in either direction.

### E6 — Batch-ack status panel

A status-bar panel (`n staged · n pending · n confirmed (session) · n
failed`) fed by the E1 store — the engine-backed panel pattern in
`SsrmStatusPanels.tsx` / `useSsrmStatusModel.ts`, but purely client-side
state so it is row-model agnostic. Replaces the prototype's header
chips. Click-through: failed → focus first failed cell.

---

## 3. Binding constraints

1. **One store, one painter.** Every phase reads/writes the E1 lifecycle
   store. A feature that tracks its own pending set (the prototype's
   app-side store is grandfathered until E1 lands, then deleted) is a
   second source of truth and will disagree with the first.
2. **Honesty rules carry over.** Pending means "not committed", ever —
   no optimistic clearing on POST-sent. Refusals are per-row. A provider
   without a write path keeps honest disables (the SSRM toolbar pattern:
   `lookupSsrmEditWriter` gating in `BulkUpdateToolbarBody` et al.).
3. **Whole-row upserts stay whole-row.** Any stage/write API takes whole
   rows + `editedColumns` (the engine contract; also what keeps CSRM
   transactions from nulling columns).
4. **Validate before cache.** No import/stage path may write a key the
   provider cannot confirm exists.
5. **Tokens only** for the state styles (`--ds-accent-warning` /
   `--ds-accent-negative` — as in the prototype's `styles.css`), both
   themes.

## 4. Traceability

| Prototype piece (spg-pricing-blotter) | Becomes |
|---|---|
| `src/trading/cellStates.ts` + `columns.ts` cellClassRules + `styles.css` states | E1 module (then deleted app-side) |
| `src/trading/serverWriteProvider.ts` (wrapper + POST + per-row verdicts) | E1 contract + E2 worker write-back |
| `stage / saveStaged / discardStaged` | E3 tiers |
| `src/components/ImportPricesDialog.tsx` + `csv.ts` + `/api/lookup` | E4 module + `lookupRows` |
| server ack delay (`SPG_ACK_DELAY_MS`) | the test knob every phase's e2e uses |
| `SsrmApplyEditsRequest/Result` barrel export | **done** (2026-09-12) |
