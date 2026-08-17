/**
 * Write-back through the real editing spine.
 *
 * `writeBack.test.ts` in core pins the state machine against fake hooks; this
 * pins that the spine wires the real ones — that a refused write actually puts
 * the old value back in the grid, actually empties the undo stack, and does
 * both under the apply guard so the revert is not mistaken for a new edit.
 *
 * It also pins the default: a grid with no registered write-back behaves
 * exactly as every consumer's did before the feature existed.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditJournal, type EditSubmission, type EditWriteBackFailure } from '@wellsfargo-starui/core';
import { makeFakeEditPlatform } from './applyAndRecord.test.js';
import { applyAndRecord } from './applyAndRecord.js';
import {
  clearEditWriteBackRegistry,
  hasEditWriteBack,
  registerEditWriteBack,
} from './editWriteBack.js';

const PATCH = { rowId: 'r1', colId: 'qty', field: 'qty', oldValue: 1, newValue: 2 };
const PATCH_R2 = { rowId: 'r2', colId: 'qty', field: 'qty', oldValue: 1, newValue: 2 };

afterEach(() => {
  clearEditWriteBackRegistry();
});

/** A promise that settles when the detached submission has run its course. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

function edit(
  fx: ReturnType<typeof makeFakeEditPlatform>,
  journal: EditJournal | null,
  patches = [PATCH],
) {
  return applyAndRecord(fx.platform, patches, journal, {
    source: 'smart-edit',
    label: () => 'edit',
  });
}

describe('no write-back registered', () => {
  it('leaves the edit local, exactly as before the feature existed', async () => {
    const fx = makeFakeEditPlatform({ r1: { id: 'r1', qty: 1 } });
    const journal = new EditJournal();

    await edit(fx, journal);

    expect(hasEditWriteBack(fx.platform.gridId)).toBe(false);
    expect(fx.rows.r1).toEqual({ id: 'r1', qty: 2 });
    expect(journal.entries).toHaveLength(1);
    expect(fx.mutations).toHaveLength(1);
  });
});

describe('accepted write-back', () => {
  it('submits what landed, with the grid id and the funnel that produced it', async () => {
    const fx = makeFakeEditPlatform({ r1: { id: 'r1', qty: 1 } });
    const seen = deferred<EditSubmission>();
    registerEditWriteBack(fx.platform.gridId, {
      writeBack: { submit: (s) => { seen.resolve(s); } },
      port: fx.platform.data,
    });

    await edit(fx, new EditJournal());

    await expect(seen.promise).resolves.toEqual({
      gridId: fx.platform.gridId,
      source: 'smart-edit',
      patches: [PATCH],
    });
  });

  // The service is told about the edit, not about the attempt — same rule the
  // journal already follows.
  it('submits only the cells the port confirmed', async () => {
    const fx = makeFakeEditPlatform({ r1: { id: 'r1', qty: 1 }, r2: { id: 'r2', qty: 1 } });
    fx.refuseWhen((rowId) => (rowId === 'r2' ? 'That row is not loaded.' : null));
    const seen = deferred<EditSubmission>();
    registerEditWriteBack(fx.platform.gridId, {
      writeBack: { submit: (s) => { seen.resolve(s); } },
      port: fx.platform.data,
    });

    await edit(fx, new EditJournal(), [PATCH, PATCH_R2]);

    expect((await seen.promise).patches).toEqual([PATCH]);
  });

  it('does not submit when nothing landed', async () => {
    const fx = makeFakeEditPlatform({ r1: { id: 'r1', qty: 1 } });
    fx.refuseWhen(() => 'The grid is still loading those rows.');
    const submit = vi.fn();
    registerEditWriteBack(fx.platform.gridId, {
      writeBack: { submit },
      port: fx.platform.data,
    });

    await edit(fx, new EditJournal());
    await Promise.resolve();

    expect(submit).not.toHaveBeenCalled();
  });

  it('stops submitting once unregistered', async () => {
    const fx = makeFakeEditPlatform({ r1: { id: 'r1', qty: 1 } });
    const submit = vi.fn();
    registerEditWriteBack(fx.platform.gridId, { writeBack: { submit }, port: fx.platform.data });
    registerEditWriteBack(fx.platform.gridId, null);

    await edit(fx, new EditJournal());
    await Promise.resolve();

    expect(hasEditWriteBack(fx.platform.gridId)).toBe(false);
    expect(submit).not.toHaveBeenCalled();
  });
});

describe('refused write-back', () => {
  /**
   * A service whose answer is held until the test releases it, which is the
   * only way to observe the state the whole design exists for: the value on
   * screen while the POST is still in flight.
   */
  function registerRefusing(fx: ReturnType<typeof makeFakeEditPlatform>, error = new Error('409')) {
    const inFlight = deferred<void>();
    const failed = deferred<EditWriteBackFailure>();
    registerEditWriteBack(fx.platform.gridId, {
      writeBack: {
        submit: async () => {
          await inFlight.promise;
          throw error;
        },
        onFailure: (f) => { failed.resolve(f); },
      },
      port: fx.platform.data,
    });
    return {
      /** Let the service answer, and resolve once the grid has reconciled. */
      refuse: () => {
        inFlight.resolve();
        return failed.promise;
      },
    };
  }

  it('shows the edit while the write is in flight, then puts the old value back', async () => {
    const fx = makeFakeEditPlatform({ r1: { id: 'r1', qty: 1 } });
    const service = registerRefusing(fx);

    await edit(fx, new EditJournal());
    expect(fx.rows.r1).toEqual({ id: 'r1', qty: 2 });

    await service.refuse();
    expect(fx.rows.r1).toEqual({ id: 'r1', qty: 1 });
  });

  it('erases the entry, so the edit is neither undoable nor redoable', async () => {
    const fx = makeFakeEditPlatform({ r1: { id: 'r1', qty: 1 } });
    const journal = new EditJournal();
    const service = registerRefusing(fx);

    await edit(fx, journal);
    expect(journal.entries).toHaveLength(1);

    await service.refuse();
    expect(journal.entries).toEqual([]);
    expect(journal.canUndo).toBe(false);
    expect(journal.canRedo).toBe(false);
  });

  // The revert is a write like any other; without the guard the cell-editor
  // recorder would journal it as a fresh user edit.
  it('reverts under the journal apply guard', async () => {
    const fx = makeFakeEditPlatform({ r1: { id: 'r1', qty: 1 } });
    const service = registerRefusing(fx);

    await edit(fx, new EditJournal());
    await service.refuse();

    expect(fx.mutations).toHaveLength(2);
    expect(fx.guardDuringMutate).toEqual([true, true]);
  });

  it('reports the error and what it managed to revert', async () => {
    const fx = makeFakeEditPlatform({ r1: { id: 'r1', qty: 1 } });
    const error = new Error('service said no');
    const service = registerRefusing(fx, error);

    await edit(fx, new EditJournal());
    const reported = await service.refuse();

    expect(reported.error).toBe(error);
    expect(reported.rolledBack).toEqual([PATCH]);
    expect(reported.stuck).toEqual([]);
    expect(reported.submission.source).toBe('smart-edit');
  });

  // Under the server-side row model a row whose block has been evicted cannot
  // be addressed, so the revert cannot land and the user is still looking at
  // a value the server rejected. Silence there would be the worst outcome.
  it('reports a cell it could not revert as stuck', async () => {
    const fx = makeFakeEditPlatform({ r1: { id: 'r1', qty: 1 } });
    const service = registerRefusing(fx);

    await edit(fx, new EditJournal());
    // The row leaves the grid while the write is in flight.
    delete fx.rows.r1;

    const reported = await service.refuse();
    expect(reported.rolledBack).toEqual([]);
    expect(reported.stuck).toEqual([PATCH]);
  });

  it('does not journal the revert as a new edit', async () => {
    const fx = makeFakeEditPlatform({ r1: { id: 'r1', qty: 1 } });
    const journal = new EditJournal();
    const service = registerRefusing(fx);

    await edit(fx, journal);
    await service.refuse();

    expect(journal.entries).toEqual([]);
    expect(journal.undoStackSize).toBe(0);
  });
});
