import type { Module } from '@wellsfargo-starui/core';
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

export const toolbarDateSettingsModule: Module<ToolbarDateSettingsState> = {
  id: TOOLBAR_DATE_SETTINGS_MODULE_ID,
  name: 'Custom Settings',
  code: '19',
  schemaVersion: 1,
  priority: 1002,

  getInitialState: () => ({ ...INITIAL_TOOLBAR_DATE_SETTINGS }),

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

  serialize: (state) => state,

  deserialize: (raw) => ({
    ...INITIAL_TOOLBAR_DATE_SETTINGS,
    ...((raw as Partial<ToolbarDateSettingsState> | null) ?? {}),
  }),

  migrate: (raw) =>
    !raw || typeof raw !== 'object'
      ? { ...INITIAL_TOOLBAR_DATE_SETTINGS }
      : { ...INITIAL_TOOLBAR_DATE_SETTINGS, ...(raw as Partial<ToolbarDateSettingsState>) },

  SettingsPanel: ToolbarDateSettingsPanel,
};
