/**
 * Smart Edit — bulk update, arithmetic across selections, +/- increment,
 * and K/M/B magnitude shortcuts.
 */

import type { Module } from '@wellsfargo-starui/engine';
import {
  applySmartEditColDefTransforms,
  deserializeSmartEditState,
  INITIAL_SMART_EDIT,
  SMART_EDIT_MODULE_ID,
  SMART_EDIT_SCHEMA_VERSION,
  type SmartEditState,
} from '@wellsfargo-starui/engine';
import { SmartEditPanel } from './SmartEditPanel.js';
import { activateSmartEdit } from './runtime/activate.js';

export { SMART_EDIT_MODULE_ID };

export const smartEditModule: Module<SmartEditState> = {
  id: SMART_EDIT_MODULE_ID,
  name: 'Smart Edit',
  code: '06',
  schemaVersion: SMART_EDIT_SCHEMA_VERSION,
  priority: 22,

  getInitialState: () => structuredClone(INITIAL_SMART_EDIT),

  serialize: (state) => ({ settings: state.settings }),

  deserialize: deserializeSmartEditState,

  transformColumnDefs(defs, state) {
    if (!state.settings.enabled) return defs;
    return applySmartEditColDefTransforms(defs, state.settings.magnitudeShortcutsEnabled);
  },

  activate: activateSmartEdit,

  SettingsPanel: SmartEditPanel,
};

export { SmartEditToolbarBody } from './SmartEditToolbarBody.js';
export { useSmartEditSelection } from './useSmartEditSelection.js';
