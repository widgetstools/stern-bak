import { afterEach, describe, expect, it, vi } from 'vitest';
import { INITIAL_DATA_CHANGE_HISTORY, type EditSubmission } from '@wellsfargo-starui/core';
import { clearEditJournalRegistry, getEditJournal } from '../../../editing/editJournalScope.js';
import {
  clearJournalApplyGuardRegistry,
  withJournalApplyGuard,
} from '../../../editing/journalApplyGuard.js';
import {
  clearEditWriteBackRegistry,
  registerEditWriteBack,
} from '../../../editing/editWriteBack.js';
import { recordCellEditorPatch } from './recordCellEditorPatch.js';

const baseCtx = {
  gridId: 'g-patch',
  getRowId: ({ data }: { data?: { id?: string } }) => String(data?.id ?? ''),
  getModuleState: (id: string) => {
    if (id === 'data-change-history') return structuredClone(INITIAL_DATA_CHANGE_HISTORY);
    throw new Error(id);
  },
  resources: {} as never,
  api: { getRowNode: () => ({ id: 'r1' }) },
};

describe('recordCellEditorPatch', () => {
  afterEach(() => {
    clearEditJournalRegistry();
    clearJournalApplyGuardRegistry();
    clearEditWriteBackRegistry();
  });

  it('records a patch with explicit rowId', () => {
    recordCellEditorPatch(structuredClone(INITIAL_DATA_CHANGE_HISTORY), baseCtx as never, {
      data: { id: 'r1', qty: 2 },
      field: 'qty',
      colId: 'qty',
      oldValue: 1,
      newValue: 2,
      rowId: 'r1',
    });

    const journal = getEditJournal({ gridId: 'g-patch', getModuleState: baseCtx.getModuleState });
    expect(journal.canUndo).toBe(true);
    expect(journal.entries[0]?.patches[0]?.rowId).toBe('r1');
  });

  it('resolves rowId from ctx.getRowId when omitted', () => {
    recordCellEditorPatch(structuredClone(INITIAL_DATA_CHANGE_HISTORY), baseCtx as never, {
      data: { id: 'r9', qty: 5 },
      field: 'qty',
      colId: 'qty',
      oldValue: 4,
      newValue: 5,
    });

    expect(getEditJournal({ gridId: 'g-patch', getModuleState: baseCtx.getModuleState }).entries[0]?.patches[0]?.rowId).toBe('r9');
  });

  it('falls back to data.id when getRowId throws', () => {
    const ctx = {
      ...baseCtx,
      getRowId: () => {
        throw new Error('no row id');
      },
    };
    recordCellEditorPatch(structuredClone(INITIAL_DATA_CHANGE_HISTORY), ctx as never, {
      data: { id: 'fallback', qty: 1 },
      field: 'qty',
      colId: 'qty',
      oldValue: 0,
      newValue: 1,
    });
    expect(getEditJournal({ gridId: 'g-patch', getModuleState: baseCtx.getModuleState }).entries[0]?.patches[0]?.rowId).toBe('fallback');
  });

  it('skips when history disabled, values equal, or apply guard active', async () => {
    const disabled = structuredClone(INITIAL_DATA_CHANGE_HISTORY);
    disabled.settings.enabled = false;
    recordCellEditorPatch(disabled, baseCtx as never, {
      data: { id: 'r1' },
      field: 'qty',
      colId: 'qty',
      oldValue: 1,
      newValue: 2,
      rowId: 'r1',
    });
    expect(getEditJournal({ gridId: 'g-patch', getModuleState: baseCtx.getModuleState }).canUndo).toBe(false);

    recordCellEditorPatch(structuredClone(INITIAL_DATA_CHANGE_HISTORY), baseCtx as never, {
      data: { id: 'r1' },
      field: 'qty',
      colId: 'qty',
      oldValue: 1,
      newValue: 1,
      rowId: 'r1',
    });
    expect(getEditJournal({ gridId: 'g-patch', getModuleState: baseCtx.getModuleState }).canUndo).toBe(false);

    await withJournalApplyGuard('g-patch', async () => {
      recordCellEditorPatch(structuredClone(INITIAL_DATA_CHANGE_HISTORY), baseCtx as never, {
        data: { id: 'r1' },
        field: 'qty',
        colId: 'qty',
        oldValue: 1,
        newValue: 2,
        rowId: 'r1',
      });
    });
    expect(getEditJournal({ gridId: 'g-patch', getModuleState: baseCtx.getModuleState }).canUndo).toBe(false);
  });

  it('skips when rowId cannot be resolved', () => {
    recordCellEditorPatch(structuredClone(INITIAL_DATA_CHANGE_HISTORY), {
      ...baseCtx,
      getRowId: () => '',
      api: null,
    } as never, {
      data: undefined,
      field: 'qty',
      colId: 'qty',
      oldValue: 1,
      newValue: 2,
    });
    expect(getEditJournal({ gridId: 'g-patch', getModuleState: baseCtx.getModuleState }).canUndo).toBe(false);
  });

  it('skips when cell-editor record source is disabled', () => {
    const state = structuredClone(INITIAL_DATA_CHANGE_HISTORY);
    state.settings.recordSources.cellEditor = false;
    const ctx = {
      ...baseCtx,
      getModuleState: () => state,
    };
    recordCellEditorPatch(state, ctx as never, {
      data: { id: 'r1' },
      field: 'qty',
      colId: 'qty',
      oldValue: 1,
      newValue: 2,
      rowId: 'r1',
    });
    expect(getEditJournal({ gridId: 'g-patch', getModuleState: ctx.getModuleState }).canUndo).toBe(false);
  });
  /**
   * Write-back is persistence; DATA CHANGE HISTORY is an undo timeline. A user
   * who turns the timeline off has not asked for their edits to stop reaching
   * the server, so the two gates are deliberately separate.
   */
  describe('write-back', () => {
    function spyOnSubmit() {
      const submissions: EditSubmission[] = [];
      registerEditWriteBack('g-patch', {
        writeBack: { submit: (s) => void submissions.push(s) },
        port: { async mutate() { return { applied: [], rejected: [], ok: true }; } } as never,
      });
      return submissions;
    }

    const anEdit = {
      data: { id: 'r1' },
      field: 'qty',
      colId: 'qty',
      oldValue: 1,
      newValue: 2,
      rowId: 'r1',
    };

    it('submits an inline edit as a cell-editor patch', () => {
      const submissions = spyOnSubmit();
      recordCellEditorPatch(structuredClone(INITIAL_DATA_CHANGE_HISTORY), baseCtx as never, anEdit);

      expect(submissions).toHaveLength(1);
      expect(submissions[0]).toEqual({
        gridId: 'g-patch',
        source: 'cell-editor',
        patches: [{ rowId: 'r1', field: 'qty', colId: 'qty', oldValue: 1, newValue: 2 }],
      });
    });

    it('still submits when the history timeline is switched off', () => {
      const submissions = spyOnSubmit();
      const disabled = structuredClone(INITIAL_DATA_CHANGE_HISTORY);
      disabled.settings.enabled = false;

      recordCellEditorPatch(disabled, baseCtx as never, anEdit);

      expect(submissions).toHaveLength(1);
      expect(getEditJournal({ gridId: 'g-patch', getModuleState: baseCtx.getModuleState }).canUndo).toBe(false);
    });

    it('still submits when cell-editor recording is switched off', () => {
      const submissions = spyOnSubmit();
      const state = structuredClone(INITIAL_DATA_CHANGE_HISTORY);
      state.settings.recordSources.cellEditor = false;

      recordCellEditorPatch(state, { ...baseCtx, getModuleState: () => state } as never, anEdit);

      expect(submissions).toHaveLength(1);
    });

    it('submits nothing for a no-op edit or one with no resolvable row', () => {
      const submissions = spyOnSubmit();
      recordCellEditorPatch(structuredClone(INITIAL_DATA_CHANGE_HISTORY), baseCtx as never, {
        ...anEdit,
        newValue: 1,
      });
      recordCellEditorPatch(
        structuredClone(INITIAL_DATA_CHANGE_HISTORY),
        { ...baseCtx, getRowId: () => '', api: null } as never,
        { ...anEdit, data: undefined, rowId: undefined },
      );
      expect(submissions).toEqual([]);
    });

    // Our own revert comes back through the value setters; resubmitting it
    // would post the value the service just refused.
    it('submits nothing while the apply guard is held', async () => {
      const submissions = spyOnSubmit();
      await withJournalApplyGuard('g-patch', async () => {
        recordCellEditorPatch(structuredClone(INITIAL_DATA_CHANGE_HISTORY), baseCtx as never, anEdit);
      });
      expect(submissions).toEqual([]);
    });
  });
});
