import { describe, expect, it } from 'vitest';
import { applyForwardPatches, applyPatches } from './applyPatches.js';
import { buildRowPatches } from './buildRowPatches.js';
import type {
  GridDataPort,
  MutationRejection,
  MutationResult,
  RowPatch,
} from '../../../platform/types.js';

/**
 * A grid data port that keeps rows in a plain object.
 *
 * It answers `mutate` the way both real adapters do — applying what it can
 * address and REJECTING what it cannot, with a reason — which is the only part
 * of the port the editing funnels touch. Shared with `editingCore.test.ts`.
 */
export function makeFakePort(seed: Record<string, Record<string, unknown>> = {}) {
  const rows: Record<string, Record<string, unknown>> = { ...seed };
  const mutations: RowPatch[][] = [];
  let refuse: (rowId: string) => string | null = () => null;

  const port = {
    async mutate(patches: readonly RowPatch[]): Promise<MutationResult> {
      mutations.push([...patches]);
      const applied: string[] = [];
      const rejected: MutationRejection[] = [];
      for (const patch of patches) {
        const reason =
          refuse(patch.rowId) ?? (rows[patch.rowId] ? null : 'That row is no longer in the grid.');
        if (reason) {
          rejected.push({ rowId: patch.rowId, reason });
          continue;
        }
        rows[patch.rowId] = { ...rows[patch.rowId], ...patch.fields };
        applied.push(patch.rowId);
      }
      return { applied, rejected, ok: rejected.length === 0 };
    },
  } as unknown as GridDataPort;

  return {
    port,
    rows,
    mutations,
    refuseWhen(fn: (rowId: string) => string | null) {
      refuse = fn;
    },
  };
}

describe('buildRowPatches', () => {
  it('groups cell patches into one row patch per row, redo side', () => {
    expect(
      buildRowPatches(
        [
          { rowId: 'r1', colId: 'qty', field: 'qty', oldValue: 100, newValue: 200 },
          { rowId: 'r1', colId: 'note', field: 'note', oldValue: '', newValue: 'x' },
          { rowId: 'r2', colId: 'qty', field: 'qty', oldValue: 1, newValue: 2 },
        ],
        'redo',
      ),
    ).toEqual([
      { rowId: 'r1', fields: { qty: 200, note: 'x' } },
      { rowId: 'r2', fields: { qty: 2 } },
    ]);
  });

  it('takes the old value on undo', () => {
    expect(
      buildRowPatches(
        [{ rowId: 'r1', colId: 'qty', field: 'qty', oldValue: 100, newValue: 200 }],
        'undo',
      ),
    ).toEqual([{ rowId: 'r1', fields: { qty: 100 } }]);
  });

  it('carries only the patched fields — the row is the adapter’s to assemble', () => {
    const built = buildRowPatches(
      [{ rowId: 'r1', colId: 'qty', field: 'qty', oldValue: 1, newValue: 2 }],
      'redo',
    );
    expect(Object.keys(built[0]!.fields)).toEqual(['qty']);
  });
});

describe('applyPatches', () => {
  it('writes through the port and reports the cells that landed', async () => {
    const fx = makeFakePort({ r1: { id: 'r1', qty: 100 } });
    const result = await applyForwardPatches(fx.port, [
      { rowId: 'r1', colId: 'qty', field: 'qty', oldValue: 100, newValue: 50 },
    ]);

    expect(fx.mutations).toEqual([[{ rowId: 'r1', fields: { qty: 50 } }]]);
    expect(result.applied).toHaveLength(1);
    expect(result.ok).toBe(true);
    expect(fx.rows.r1).toEqual({ id: 'r1', qty: 50 });
  });

  it('does not touch the port for an empty patch list', async () => {
    const fx = makeFakePort();
    await expect(applyPatches(fx.port, [], 'redo')).resolves.toEqual({
      applied: [],
      rejected: [],
      ok: true,
    });
    expect(fx.mutations).toEqual([]);
  });

  /**
   * The defect this phase closes. `buildRowUpdatesFromPatches` used to invent
   * `{ id: rowId }` for a row the grid did not hold and hand it to
   * `applyTransactionAsync`, which dropped it — while the funnel counted it as
   * applied and the journal recorded it.
   */
  it('reports a row the port cannot address instead of counting it applied', async () => {
    const fx = makeFakePort({});
    const result = await applyPatches(
      fx.port,
      [{ rowId: 'missing', colId: 'qty', field: 'qty', oldValue: 1, newValue: 2 }],
      'redo',
    );

    expect(result.applied).toEqual([]);
    expect(result.ok).toBe(false);
    expect(result.rejected).toEqual([
      { rowId: 'missing', reason: 'That row is no longer in the grid.' },
    ]);
  });

  it('confirms per CELL, so a partly-refused row set yields the cells that changed', async () => {
    const fx = makeFakePort({ r1: { id: 'r1', qty: 1 }, r2: { id: 'r2', qty: 1 } });
    fx.refuseWhen((rowId) => (rowId === 'r2' ? 'That row is still loading.' : null));

    const result = await applyPatches(
      fx.port,
      [
        { rowId: 'r1', colId: 'qty', field: 'qty', oldValue: 1, newValue: 9 },
        { rowId: 'r1', colId: 'note', field: 'note', oldValue: '', newValue: 'a' },
        { rowId: 'r2', colId: 'qty', field: 'qty', oldValue: 1, newValue: 9 },
      ],
      'redo',
    );

    expect(result.applied.map((p) => `${p.rowId}:${p.field}`)).toEqual(['r1:qty', 'r1:note']);
    expect(result.rejected).toEqual([{ rowId: 'r2', reason: 'That row is still loading.' }]);
    expect(result.ok).toBe(false);
  });
});
