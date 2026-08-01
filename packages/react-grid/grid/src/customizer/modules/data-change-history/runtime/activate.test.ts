import { afterEach, describe, expect, it, vi } from 'vitest';
import { GridPlatform, INITIAL_DATA_CHANGE_HISTORY } from '@wellsfargo-starui/engine';
import { clearEditJournalRegistry, getEditJournal } from '../../../editing/editJournalScope.js';
import {
  clearJournalApplyGuardRegistry,
  withJournalApplyGuard,
} from '../../../editing/journalApplyGuard.js';
import { dataChangeHistoryModule } from '../index.js';
import { activateDataChangeHistory, recordCellEditorChange } from './activate.js';

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
  it('skips recording when module disabled or field metadata missing', () => {
    const platform = mockPlatform('g5');
    const disabled = {
      ...platform,
      getState: () => ({
        ...structuredClone(INITIAL_DATA_CHANGE_HISTORY),
        settings: { ...INITIAL_DATA_CHANGE_HISTORY.settings, enabled: false },
      }),
      getModuleState: () => ({
        ...structuredClone(INITIAL_DATA_CHANGE_HISTORY),
        settings: { ...INITIAL_DATA_CHANGE_HISTORY.settings, enabled: false },
      }),
    };
    const api = { getRowNode: () => ({ id: 'r1' }) } as never;
    recordCellEditorChange(disabled as never, api, mockEvent());
    expect(getEditJournal(disabled).canUndo).toBe(false);

    recordCellEditorChange(platform as never, api, mockEvent({
      colDef: {},
      column: { getColId: () => '' },
    }));
    expect(getEditJournal(platform).canUndo).toBe(false);
  });

  it('resolveRowId falls back through getRowNode', () => {
    const platform = mockPlatform('g6');
    const api = {
      getRowNode: () => ({ id: 'resolved-r1' }),
    } as never;
    recordCellEditorChange(platform as never, api, mockEvent({
      data: { quantityFace: 200 },
    }));
    expect(getEditJournal(platform).entries[0]?.patches[0]?.rowId).toBe('resolved-r1');
  });
});

describe('activateDataChangeHistory', () => {
  afterEach(() => {
    clearEditJournalRegistry();
  });

  it('records cell edits and suspends journal when settings.suspended', () => {
    const platform = new GridPlatform({
      gridId: 'dch-grid',
      modules: [dataChangeHistoryModule],
    });
    const listeners = new Map<string, Set<(event?: unknown) => void>>();
    const api = {
      getRowNode: () => ({ id: 'r1' }),
      addEventListener: (evt: string, fn: (event?: unknown) => void) => {
        if (!listeners.has(evt)) listeners.set(evt, new Set());
        listeners.get(evt)!.add(fn);
      },
      removeEventListener: (evt: string, fn: (event?: unknown) => void) => {
        listeners.get(evt)?.delete(fn);
      },
    };
    platform.onGridReady(api as never);

    for (const fn of listeners.get('cellValueChanged') ?? []) {
      fn({
        source: 'edit',
        colDef: { field: 'quantityFace' },
        column: { getColId: () => 'quantityFace' },
        data: { id: 'r1', quantityFace: 200 },
        oldValue: 100,
        newValue: 200,
      });
    }
    expect(getEditJournal(platform).canUndo).toBe(true);

    platform.store.setModuleState('data-change-history', (state) => ({
      ...state,
      settings: { ...state.settings, suspended: true },
    }));
    expect(getEditJournal(platform).suspended).toBe(true);

    platform.destroy();
  });

  it('syncs journal suspend when settings change via subscribe', () => {
    const platform = new GridPlatform({
      gridId: 'dch-suspend',
      modules: [dataChangeHistoryModule],
    });
    const api = {
      getRowNode: () => ({ id: 'r1' }),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    platform.onGridReady(api as never);
    platform.store.setModuleState('data-change-history', (state) => ({
      ...state,
      settings: { ...state.settings, suspended: true },
    }));
    expect(getEditJournal(platform).suspended).toBe(true);
    platform.store.setModuleState('data-change-history', (state) => ({
      ...state,
      settings: { ...state.settings, suspended: false },
    }));
    expect(getEditJournal(platform).suspended).toBe(false);
    platform.destroy();
  });

  it('dispose detaches listeners safely', () => {
    const platform = {
      gridId: 'dch-mock',
      getState: () => structuredClone(INITIAL_DATA_CHANGE_HISTORY),
      subscribe: () => () => {},
      api: {
        onReady: (fn: (api: unknown) => void) => {
          fn({
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
          });
          return () => {};
        },
      },
    };
    const dispose = activateDataChangeHistory(platform as never);
    expect(() => dispose()).not.toThrow();
  });
});
