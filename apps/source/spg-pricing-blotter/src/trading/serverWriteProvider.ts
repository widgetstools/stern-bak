/**
 * The server-confirmation seam: one wrapper around `ISsrmDataProvider`
 * that gives EVERY write path in the grid a real commit lifecycle.
 *
 * `MarketsGrid`'s SSRM surface funnels all writes through
 * `provider.applyEdits` — interactive cell edits, clipboard pastes
 * spanning hundreds of rows, the fill handle, Smart Edit, Bulk Update,
 * plus/minus nudges, undo/redo. Wrapping that ONE method means each of
 * them inherits, with no per-feature wiring:
 *
 *   1. the engine write (optimistic — the cell shows the value at once,
 *      and the worker's edit overlay holds it over feed resends),
 *   2. `pending` cell state (yellow border) for exactly the columns the
 *      trader touched (`editedColumns`, sliced against the writable set),
 *   3. a `POST /api/updates` carrying ONLY those fields,
 *   4. per-row confirm (border clears; the server's post-commit feed echo
 *      then flashes the cell and updates the server-derived columns) or
 *      per-row `failed` (red border) — one bad row never strands a batch.
 *
 * CSV import uses the same wrapper from the other side: `stage()` writes
 * whole rows into the engine (amber, local only), `saveStaged()` promotes
 * staged → pending → confirmed through the identical POST path, and
 * `discardStaged()` restores the server's rows.
 */
import type {
  ISsrmDataProvider,
  SsrmApplyEditsRequest,
  SsrmApplyEditsResult,
} from '@wellsfargo-starui/data';
import type { CellStateStore } from './cellStates';
import { lookupPositions, postUpdates } from './api';

/** Fields the server accepts (mirror of the server's WRITABLE_COLUMNS). */
export const WRITABLE_FIELDS = new Set([
  'price', 'priorPrice', 'trader', 'spreadDm', 'yieldToMaturity', 'coupon', 'pnl',
]);

export interface TradingWrites {
  /** Apply CSV rows to the grid only — amber `staged`, nothing sent. */
  stage(rows: Array<{ cusip: string; fields: Record<string, unknown> }>): Promise<void>;
  /** Commit every staged cell to the server (staged → pending → cleared). */
  saveStaged(): Promise<void>;
  /** Throw staged values away and restore the server's rows in the grid. */
  discardStaged(): Promise<void>;
}

export type TradingProvider = ISsrmDataProvider & TradingWrites;

interface RowWrite {
  cusip: string;
  fields: Record<string, unknown>;
  row: Record<string, unknown>;
}

function writableSlices(req: SsrmApplyEditsRequest): RowWrite[] {
  const out: RowWrite[] = [];
  req.rows.forEach((row: Record<string, unknown>, i: number) => {
    const cusip = String(row.cusip ?? '');
    if (!cusip) return;
    const edited = req.editedColumns?.[i] ?? Object.keys(row);
    const fields: Record<string, unknown> = {};
    for (const col of edited) {
      if (WRITABLE_FIELDS.has(col)) fields[col] = row[col];
    }
    if (Object.keys(fields).length > 0) out.push({ cusip, fields, row: row as Record<string, unknown> });
  });
  return out;
}

export function withServerWrites(
  inner: ISsrmDataProvider,
  store: CellStateStore,
  deps: { post?: typeof postUpdates; lookup?: typeof lookupPositions; onError?: (message: string) => void } = {},
): TradingProvider {
  const post = deps.post ?? postUpdates;
  const lookup = deps.lookup ?? lookupPositions;
  const onError = deps.onError ?? ((m: string) => console.warn(`[spg] ${m}`));

  async function commit(writes: RowWrite[]): Promise<void> {
    if (writes.length === 0) return;
    try {
      const { results } = await post(writes.map(({ cusip, fields }) => ({ cusip, fields })));
      const byCusip = new Map(results.map((r) => [r.cusip, r]));
      for (const w of writes) {
        const result = byCusip.get(w.cusip);
        if (result?.ok) store.clear(w.cusip, Object.keys(w.fields));
        else {
          store.mark(w.cusip, w.fields, 'failed');
          if (result?.error) onError(`${w.cusip}: ${result.error}`);
        }
      }
    } catch (e) {
      // The whole request failed — every cell it carried turns red.
      for (const w of writes) store.mark(w.cusip, w.fields, 'failed');
      onError(`server write failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const wrapper: TradingProvider = Object.create(inner) as TradingProvider;

  wrapper.applyEdits = async (req: SsrmApplyEditsRequest): Promise<SsrmApplyEditsResult> => {
    const writes = writableSlices(req);
    for (const w of writes) store.mark(w.cusip, w.fields, 'pending');
    // Engine first: the optimistic value paints now and the worker's edit
    // overlay holds it over feed resends while the server round-trip runs.
    const applied = await inner.applyEdits!(req);
    void commit(writes);
    return applied;
  };

  wrapper.stage = async (rows) => {
    // The engine upserts WHOLE rows — a partial row would null every column
    // it omits — so staging merges each import line over the server's
    // current row before it goes anywhere near the engine.
    const { found } = await lookup(rows.map((r) => r.cusip));
    const byCusip = new Map(found.map((r) => [r.cusip, r]));
    const engineRows: Record<string, unknown>[] = [];
    const editedColumns: string[][] = [];
    for (const r of rows) {
      const base = byCusip.get(r.cusip);
      if (!base) continue;
      engineRows.push({ ...base, ...r.fields });
      editedColumns.push(Object.keys(r.fields));
      store.mark(r.cusip, r.fields, 'staged');
    }
    if (engineRows.length > 0) {
      await inner.applyEdits!({ rows: engineRows, editedColumns });
    }
  };

  wrapper.saveStaged = async () => {
    const staged = store.updates('staged');
    if (staged.length === 0) return;
    const writes: RowWrite[] = staged.map((s) => ({ cusip: s.cusip, fields: s.fields, row: s.fields }));
    for (const w of writes) store.transition(w.cusip, Object.keys(w.fields), 'pending');
    await commit(writes);
  };

  wrapper.discardStaged = async () => {
    const staged = store.updates('staged');
    if (staged.length === 0) return;
    const { found } = await lookup(staged.map((s) => s.cusip));
    if (found.length > 0) {
      await inner.applyEdits!({
        rows: found,
        // The restore must WIN over the discarded staged overlay, so the
        // restored columns are declared edited (a fresh overlay of the
        // server value replaces the staged one).
        editedColumns: found.map((row) => {
          const stagedFields = staged.find((s) => s.cusip === row.cusip)?.fields ?? {};
          return Object.keys(stagedFields);
        }),
      });
    }
    for (const s of staged) store.clear(s.cusip, Object.keys(s.fields));
  };

  return wrapper;
}
