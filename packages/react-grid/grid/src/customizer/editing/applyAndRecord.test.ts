import { describe, expect, it } from 'vitest';
import {
  EditJournal,
  type EditPlatform,
  type GridDataPort,
  type MutationRejection,
  type MutationResult,
  type RowPatch,
} from '@wellsfargo-starui/core';
import { applyAndRecord, cellCountLabel, resolveJournalLabel } from './applyAndRecord.js';
import { isJournalApplyInProgress } from './journalApplyGuard.js';

/**
 * An {@link EditPlatform} whose port keeps rows in a plain object.
 *
 * The funnels no longer touch a `GridApi` at all — they write through
 * `platform.data`, and what the port confirms is what the journal records. The
 * fake answers `mutate` the way both real adapters do, including refusing a
 * row it cannot address. Shared with the four funnel tests.
 */
export function makeFakeEditPlatform(seed: Record<string, Record<string, unknown>> = {}) {
  const rows: Record<string, Record<string, unknown>> = { ...seed };
  const mutations: RowPatch[][] = [];
  const guardDuringMutate: boolean[] = [];
  let refuse: (rowId: string) => string | null = () => null;
  const gridId = 'test-grid';

  const data = {
    async mutate(patches: readonly RowPatch[]): Promise<MutationResult> {
      mutations.push([...patches]);
      guardDuringMutate.push(isJournalApplyInProgress(gridId));
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
    async getRowsById(ids: readonly string[]) {
      const found = ids.filter((id) => rows[id]).map((id) => ({ id, data: rows[id]! }));
      return { rows: found, missing: ids.filter((id) => !rows[id]) };
    },
  } as unknown as GridDataPort;

  return {
    platform: { gridId, data } satisfies EditPlatform,
    rows,
    mutations,
    guardDuringMutate,
    refuseWhen(fn: (rowId: string) => string | null) {
      refuse = fn;
    },
  };
}

const PATCH = { rowId: 'r1', colId: 'qty', field: 'qty', oldValue: 1, newValue: 2 };

describe('applyAndRecord', () => {
  it('writes through the port and journals what landed', async () => {
    const fx = makeFakeEditPlatform({ r1: { id: 'r1', qty: 1 } });
    const journal = new EditJournal();

    const result = await applyAndRecord(fx.platform, [PATCH], journal, {
      source: 'smart-edit',
      label: (applied) => `edit · ${cellCountLabel(applied)}`,
    });

    expect(result.applied).toHaveLength(1);
    expect(fx.rows.r1).toEqual({ id: 'r1', qty: 2 });
    expect(journal.entries).toHaveLength(1);
    expect(journal.entries[0]?.label).toBe('edit · 1 cell');
  });

  /** Roadmap T2-1: the history panel showed edits that never happened. */
  it('journals nothing when the port refuses every row', async () => {
    const fx = makeFakeEditPlatform({ r1: { id: 'r1', qty: 1 } });
    fx.refuseWhen(() => 'The grid is still loading those rows from the server.');
    const journal = new EditJournal();

    const result = await applyAndRecord(fx.platform, [PATCH], journal, {
      source: 'smart-edit',
      label: () => 'edit',
    });

    expect(result.applied).toEqual([]);
    expect(result.ok).toBe(false);
    expect(result.rejected[0]?.reason).toContain('still loading');
    expect(journal.entries).toEqual([]);
    expect(journal.canUndo).toBe(false);
  });

  it('journals only the cells that landed, and labels from those', async () => {
    const fx = makeFakeEditPlatform({ r1: { id: 'r1', qty: 1 }, r2: { id: 'r2', qty: 1 } });
    fx.refuseWhen((rowId) => (rowId === 'r2' ? 'That row is not loaded.' : null));
    const journal = new EditJournal();

    await applyAndRecord(
      fx.platform,
      [PATCH, { rowId: 'r2', colId: 'qty', field: 'qty', oldValue: 1, newValue: 2 }],
      journal,
      { source: 'bulk-update', label: (applied) => `Set · ${cellCountLabel(applied)}` },
    );

    expect(journal.entries[0]?.patches.map((p) => p.rowId)).toEqual(['r1']);
    expect(journal.entries[0]?.label).toBe('Set · 1 cell');
  });

  it('holds the journal apply guard for the whole write', async () => {
    const fx = makeFakeEditPlatform({ r1: { id: 'r1', qty: 1 } });
    await applyAndRecord(fx.platform, [PATCH], null, {
      source: 'smart-edit',
      label: () => 'edit',
    });
    expect(fx.guardDuringMutate).toEqual([true]);
    expect(isJournalApplyInProgress(fx.platform.gridId)).toBe(false);
  });

  it('never reaches the port for an empty patch list', async () => {
    const fx = makeFakeEditPlatform();
    const result = await applyAndRecord(fx.platform, [], new EditJournal(), {
      source: 'smart-edit',
      label: () => 'edit',
    });
    expect(result).toEqual({ applied: [], rejected: [], ok: true });
    expect(fx.mutations).toEqual([]);
  });
});

describe('resolveJournalLabel', () => {
  it('falls back when no override is given', () => {
    expect(resolveJournalLabel(undefined, () => 'fallback')([])).toBe('fallback');
  });

  it('takes a string override verbatim', () => {
    expect(resolveJournalLabel('override', () => 'fallback')([])).toBe('override');
  });

  it('calls a function override with the applied patches', () => {
    expect(
      resolveJournalLabel((applied) => `n=${applied.length}`, () => 'fallback')([PATCH]),
    ).toBe('n=1');
  });
});
