/**
 * The write-back state machine.
 *
 * The grid is optimistic and the server is authoritative, so the only thing
 * this module has to get right is the unhappy path: a refused write must
 * leave neither a wrong value on screen nor an entry in the undo stack for an
 * edit that never happened. These cases pin that, and pin that no reporting
 * hook can break the revert it is reporting.
 */
import { describe, expect, it, vi } from 'vitest';
import { submitEdits, type EditSubmission, type EditWriteBack } from './writeBack.js';
import type { CellPatch, EditApplyResult } from './types.js';

const PATCH_A: CellPatch = { rowId: 'r1', field: 'px', colId: 'px', oldValue: 1, newValue: 2 };
const PATCH_B: CellPatch = { rowId: 'r2', field: 'px', colId: 'px', oldValue: 3, newValue: 4 };

const submission = (patches: readonly CellPatch[] = [PATCH_A]): EditSubmission => ({
  gridId: 'g1',
  source: 'cell-editor',
  patches,
});

const applied = (patches: readonly CellPatch[]): EditApplyResult => ({
  applied: patches,
  rejected: [],
  ok: true,
});

function hooks(rollbackResult: EditApplyResult = applied([PATCH_A])) {
  const order: string[] = [];
  return {
    order,
    retract: vi.fn(() => void order.push('retract')),
    rollback: vi.fn(async () => {
      order.push('rollback');
      return rollbackResult;
    }),
  };
}

describe('submitEdits — accepted', () => {
  it('hands the app exactly what landed and does nothing else', async () => {
    const submit = vi.fn(async () => {});
    const h = hooks();
    const sub = submission([PATCH_A, PATCH_B]);

    await expect(submitEdits({ submit }, sub, h)).resolves.toBe(true);

    expect(submit).toHaveBeenCalledWith(sub);
    // Confirmation is the broadcast arriving, not this promise resolving —
    // so a resolved submit must not touch the grid or the journal.
    expect(h.rollback).not.toHaveBeenCalled();
    expect(h.retract).not.toHaveBeenCalled();
  });

  it('does not call the service for an empty submission', async () => {
    const submit = vi.fn();
    await expect(submitEdits({ submit }, submission([]), hooks())).resolves.toBe(true);
    expect(submit).not.toHaveBeenCalled();
  });

  it('accepts a synchronous submit', async () => {
    const submit = vi.fn(() => undefined);
    await expect(submitEdits({ submit }, submission(), hooks())).resolves.toBe(true);
  });
});

describe('submitEdits — refused', () => {
  it('retracts the journal entry, reverts the cells, and reports', async () => {
    const error = new Error('409 conflict');
    const onFailure = vi.fn();
    const h = hooks();
    const writeBack: EditWriteBack = {
      submit: vi.fn(async () => { throw error; }),
      onFailure,
    };

    await expect(submitEdits(writeBack, submission(), h)).resolves.toBe(false);

    expect(h.rollback).toHaveBeenCalledWith([PATCH_A]);
    expect(onFailure).toHaveBeenCalledWith(
      expect.objectContaining({ error, rolledBack: [PATCH_A], stuck: [] }),
    );
  });

  // Order matters: a revert is itself a write, and an undo stack still holding
  // the refused entry while it lands would let the user redo back to the value
  // the server just rejected.
  it('retracts before it reverts', async () => {
    const h = hooks();
    await submitEdits({ submit: async () => { throw new Error('no'); } }, submission(), h);
    expect(h.order).toEqual(['retract', 'rollback']);
  });

  it('never rethrows — callers run it detached from the edit that produced it', async () => {
    const h = hooks();
    await expect(
      submitEdits({ submit: () => Promise.reject(new Error('boom')) }, submission(), h),
    ).resolves.toBe(false);
  });

  // Under SSRM a row whose block has been evicted cannot be addressed, so the
  // revert is partial and the user is still looking at a wrong value.
  it('reports the patches the revert could not restore as stuck', async () => {
    const onFailure = vi.fn();
    const h = hooks(applied([PATCH_A]));

    await submitEdits(
      { submit: async () => { throw new Error('no'); }, onFailure },
      submission([PATCH_A, PATCH_B]),
      h,
    );

    expect(onFailure).toHaveBeenCalledWith(
      expect.objectContaining({ rolledBack: [PATCH_A], stuck: [PATCH_B] }),
    );
  });

  it('treats a revert that throws as nothing restored, and still reports', async () => {
    const onFailure = vi.fn();
    const h = hooks();
    h.rollback.mockRejectedValueOnce(new Error('grid destroyed'));

    await submitEdits(
      { submit: async () => { throw new Error('no'); }, onFailure },
      submission([PATCH_A, PATCH_B]),
      h,
    );

    expect(onFailure).toHaveBeenCalledWith(
      expect.objectContaining({ rolledBack: [], stuck: [PATCH_A, PATCH_B] }),
    );
  });
});

describe('submitEdits — hostile hooks', () => {
  it('reverts even when retracting throws', async () => {
    const h = hooks();
    h.retract.mockImplementationOnce(() => { throw new Error('journal gone'); });

    await expect(
      submitEdits({ submit: async () => { throw new Error('no'); } }, submission(), h),
    ).resolves.toBe(false);
    expect(h.rollback).toHaveBeenCalled();
  });

  it('survives an onFailure that throws', async () => {
    await expect(
      submitEdits(
        {
          submit: async () => { throw new Error('no'); },
          onFailure: () => { throw new Error('toast exploded'); },
        },
        submission(),
        hooks(),
      ),
    ).resolves.toBe(false);
  });

  it('works with no onFailure at all', async () => {
    const h = hooks();
    await expect(
      submitEdits({ submit: async () => { throw new Error('no'); } }, submission(), h),
    ).resolves.toBe(false);
    expect(h.rollback).toHaveBeenCalled();
  });

  it('works with no retract — a grid that is not journaling still reverts', async () => {
    const rollback = vi.fn(async () => applied([PATCH_A]));
    await submitEdits(
      { submit: async () => { throw new Error('no'); } },
      submission(),
      { rollback },
    );
    expect(rollback).toHaveBeenCalledWith([PATCH_A]);
  });
});
