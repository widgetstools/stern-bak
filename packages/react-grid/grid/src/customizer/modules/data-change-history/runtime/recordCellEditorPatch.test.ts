import { afterEach, describe, expect, it, vi } from 'vitest';
import { INITIAL_DATA_CHANGE_HISTORY } from '@wellsfargo-starui/core';
import { clearEditJournalRegistry, getEditJournal } from '../../../editing/editJournalScope.js';
import {
  clearJournalApplyGuardRegistry,
  withJournalApplyGuard,
} from '../../../editing/journalApplyGuard.js';
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
});
