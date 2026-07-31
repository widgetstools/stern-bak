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
});
