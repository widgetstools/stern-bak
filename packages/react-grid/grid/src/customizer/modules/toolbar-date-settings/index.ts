import { defineModule, type Module } from '@wellsfargo-starui/core';
import {
  INITIAL_TOOLBAR_DATE_SETTINGS,
  TOOLBAR_DATE_SETTINGS_MODULE_ID,
  type ToolbarDateSettingsState,
} from './state';
import { ToolbarDateSettingsPanel } from './ToolbarDateSettingsPanel';
import { activateRowExclusion } from './activate';
import { buildExternalFilterOptions } from './rowExclusionFilter';

export {
  TOOLBAR_DATE_SETTINGS_MODULE_ID,
  INITIAL_TOOLBAR_DATE_SETTINGS,
  type ToolbarDateSettingsState,
} from './state';
export {
  applyHistoricalToolbarDateToAppData,
  isHistoricalToolbarDate,
  resolveToolbarDateHistoryEnabled,
} from './applyHistoricalToolbarDateToAppData';
export { useToolbarDateSettingsBridge } from './useToolbarDateSettingsBridge';
export { ToolbarDateSettingsPanel } from './ToolbarDateSettingsPanel';

export const toolbarDateSettingsModule: Module<ToolbarDateSettingsState> = defineModule({
  id: TOOLBAR_DATE_SETTINGS_MODULE_ID,
  name: 'Custom Settings',
  category: 'options',
  priority: 1002,

  // defineModule defaults: schemaVersion 1, identity serialize,
  // spread-over-initial deserialize + migrate.
  initialState: INITIAL_TOOLBAR_DATE_SETTINGS,

  /** Nudges AG-Grid's external filter to re-run on cell/expression edits. */
  activate: activateRowExclusion,

  /**
   * Install the row-exclusion external filter. Always emitted so the host's
   * `setGridOption` sync removes a stale filter when the expression is
   * cleared; the callbacks read the live expression so an empty one is a
   * no-op (`isExternalFilterPresent` → false).
   */
  transformGridOptions(opts, _state, ctx) {
    return { ...opts, ...buildExternalFilterOptions(opts, ctx) };
  },

  SettingsPanel: ToolbarDateSettingsPanel,
});
