import type { GridOptions } from 'ag-grid-community';
import type { Module, PlatformHandle } from '@wellsfargo-starui/core';
import {
  DATA_CHANGE_HISTORY_MODULE_ID,
  DATA_CHANGE_HISTORY_SCHEMA_VERSION,
  deserializeDataChangeHistoryState,
  INITIAL_DATA_CHANGE_HISTORY,
  type DataChangeHistoryState,
} from '@wellsfargo-starui/core';
import { DataChangeHistoryPanel } from './DataChangeHistoryPanel.js';
import { activateDataChangeHistory } from './runtime/activate.js';
import { wrapEditableValueSetters } from './transforms/wrapEditableValueSetters.js';

export { DATA_CHANGE_HISTORY_MODULE_ID };

export const dataChangeHistoryModule: Module<DataChangeHistoryState> = {
  id: DATA_CHANGE_HISTORY_MODULE_ID,
  name: 'Edit History',
  code: '10',
  schemaVersion: DATA_CHANGE_HISTORY_SCHEMA_VERSION,
  priority: 26,

  getInitialState: () => structuredClone(INITIAL_DATA_CHANGE_HISTORY),

  serialize: (state) => ({ settings: state.settings }),

  deserialize: deserializeDataChangeHistoryState,

  transformGridOptions(opts: Partial<GridOptions>, state: DataChangeHistoryState): Partial<GridOptions> {
    if (!state.settings.enabled || !state.settings.unifyUndo) return opts;
    return {
      ...opts,
      undoRedoCellEditing: false,
      undoRedoCellEditingLimit: undefined,
    };
  },

  transformColumnDefs(defs, state, ctx) {
    return wrapEditableValueSetters(defs, state, ctx);
  },

  activate: activateDataChangeHistory,

  SettingsPanel: DataChangeHistoryPanel,
};

export { EditHistoryToolbarBody } from './EditHistoryToolbarBody.js';
