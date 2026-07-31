import { afterEach, describe, expect, it } from 'vitest';
import { INITIAL_DATA_CHANGE_HISTORY } from '@wellsfargo-starui/engine';
import { clearEditJournalRegistry, getEditJournal } from '../../../editing/editJournalScope.js';
import {
  clearJournalApplyGuardRegistry,
  withJournalApplyGuard,
} from '../../../editing/journalApplyGuard.js';
import { recordCellEditorChange } from './activate.js';

function mockPlatform(gridId: string) {
  return {
    gridId,
    getState: () => structuredClone(INITIAL_DATA_CHANGE_HISTORY),
    getModuleState: (id: string) => {
      if (id === 'data-change-history') return structuredClone(INITIAL_DATA_CHANGE_HISTORY);
      throw new Error(id);
    },
  };
}

function mockEvent(overrides: Record<string, unknown> = {}) {
  return {
    source: 'edit',
    colDef: { field: 'quantityFace' },
    column: { getColId: () => 'quantityFace' },
    data: { id: 'r1', quantityFace: 200 },
    oldValue: 100,
    newValue: 200,
    ...overrides,
  } as never;
}

describe('recordCellEditorChange', () => {
  afterEach(() => {
    clearEditJournalRegistry();
    clearJournalApplyGuardRegistry();
  });

  it('records a user cell edit in the journal', () => {
    const platform = mockPlatform('g1');
    const api = { getRowNode: () => ({ id: 'r1' }) } as never;

    recordCellEditorChange(platform as never, api, mockEvent());

    const journal = getEditJournal(platform);
    expect(journal.canUndo).toBe(true);
    expect(journal.entries[0]?.source).toBe('cell-editor');
    expect(journal.entries[0]?.patches[0]?.newValue).toBe(200);
  });

  it('skips when journal apply guard is active', async () => {
    const platform = mockPlatform('g2');
    const api = { getRowNode: () => ({ id: 'r1' }) } as never;

    await withJournalApplyGuard('g2', async () => {
      recordCellEditorChange(platform as never, api, mockEvent());
    });

    expect(getEditJournal(platform).canUndo).toBe(false);
  });

  it('skips api-sourced changes', () => {
    const platform = mockPlatform('g3');
    const api = { getRowNode: () => ({ id: 'r1' }) } as never;

    recordCellEditorChange(platform as never, api, mockEvent({ source: 'api' }));

    expect(getEditJournal(platform).canUndo).toBe(false);
  });

  it('skips when cellEditor record source is disabled', () => {
    const platform = mockPlatform('g4');
    const state = structuredClone(INITIAL_DATA_CHANGE_HISTORY);
    state.settings.recordSources.cellEditor = false;
    const patched = {
      ...platform,
      getState: () => state,
      getModuleState: () => state,
    };
    const api = { getRowNode: () => ({ id: 'r1' }) } as never;

    recordCellEditorChange(patched as never, api, mockEvent());

    expect(getEditJournal(patched).canUndo).toBe(false);
  });
});
