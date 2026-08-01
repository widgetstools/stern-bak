import { describe, expect, it } from 'vitest';
import { INITIAL_DATA_CHANGE_HISTORY } from '@wellsfargo-starui/engine';
import { dataChangeHistoryModule } from './index.js';

describe('dataChangeHistoryModule', () => {
  it('disables AG Grid undo when unifyUndo is on', () => {
    const state = structuredClone(INITIAL_DATA_CHANGE_HISTORY);
    const opts = dataChangeHistoryModule.transformGridOptions!(
      { undoRedoCellEditing: true, undoRedoCellEditingLimit: 10 },
      state,
    );
    expect(opts.undoRedoCellEditing).toBe(false);
    expect(opts.undoRedoCellEditingLimit).toBeUndefined();
  });

  it('passes through when disabled', () => {
    const state = structuredClone(INITIAL_DATA_CHANGE_HISTORY);
    state.settings.enabled = false;
    const opts = dataChangeHistoryModule.transformGridOptions!(
      { undoRedoCellEditing: true },
      state,
    );
    expect(opts.undoRedoCellEditing).toBe(true);
  });

  it('passes through when unifyUndo is off', () => {
    const state = structuredClone(INITIAL_DATA_CHANGE_HISTORY);
    state.settings.unifyUndo = false;
    const opts = dataChangeHistoryModule.transformGridOptions!(
      { undoRedoCellEditing: true, undoRedoCellEditingLimit: 10 },
      state,
    );
    expect(opts.undoRedoCellEditing).toBe(true);
  });

  it('serialize keeps settings only and transformColumnDefs wraps editable columns', () => {
    const state = structuredClone(INITIAL_DATA_CHANGE_HISTORY);
    expect(dataChangeHistoryModule.serialize!(state)).toEqual({ settings: state.settings });
    const defs = dataChangeHistoryModule.transformColumnDefs!(
      [{ field: 'qty', editable: true }],
      state,
      {
        gridId: 'g',
        getRowId: () => 'r1',
        getModuleState: () => state,
        resources: {} as never,
        api: null,
      },
    );
    expect(typeof defs[0]?.valueSetter).toBe('function');
  });

  it('registers module shell metadata', () => {
    expect(dataChangeHistoryModule.id).toBe('data-change-history');
    expect(dataChangeHistoryModule.SettingsPanel).toBeTruthy();
    expect(dataChangeHistoryModule.getInitialState().settings.enabled).toBe(true);
  });
});
