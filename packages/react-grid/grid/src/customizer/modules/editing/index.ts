/**
 * Editing — the merged numeric-edit module: smart edit, bulk update,
 * plus/minus nudges, and letter shortcuts behind one module id, one
 * persisted envelope, one settings panel, and one keyboard runtime.
 * Pre-merge profiles (four envelopes under the legacy module ids) load
 * through `migrateLegacy`.
 */

import type { Module } from '@wellsfargo-starui/core';
import {
  applyPlusMinusColDefTransforms,
  applyShortcutsColDefTransforms,
  applySmartEditColDefTransforms,
  deserializeEditingState,
  EDITING_MODULE_ID,
  EDITING_SCHEMA_VERSION,
  INITIAL_EDITING,
  LEGACY_EDITING_MODULE_IDS,
  migrateLegacyEditingState,
  type EditingState,
} from '@wellsfargo-starui/core';
import { EditingPanel } from './EditingPanel.js';
import { activateEditing } from './runtime/activate.js';

export { EDITING_MODULE_ID };

export const editingModule: Module<EditingState> = {
  id: EDITING_MODULE_ID,
  name: 'Editing',
  category: 'editing',
  schemaVersion: EDITING_SCHEMA_VERSION,
  // Priority slot of the former smart-edit module (22). The former
  // bulk-update/plus-minus/shortcuts slots (23-25) held no other
  // transforms, so composing the three colDef transforms here preserves
  // the pre-merge pipeline order exactly.
  priority: 22,

  legacyIds: LEGACY_EDITING_MODULE_IDS,
  migrateLegacy: migrateLegacyEditingState,

  getInitialState: () => structuredClone(INITIAL_EDITING),

  serialize: (state) => ({
    smartEdit: { settings: state.smartEdit.settings },
    bulkUpdate: { settings: state.bulkUpdate.settings },
    plusMinus: { settings: state.plusMinus.settings, nudges: state.plusMinus.nudges },
    shortcuts: { settings: state.shortcuts.settings, shortcuts: state.shortcuts.shortcuts },
  }),

  deserialize: deserializeEditingState,

  transformColumnDefs(defs, state) {
    let out = defs;
    if (state.smartEdit.settings.enabled) {
      out = applySmartEditColDefTransforms(out, state.smartEdit.settings.magnitudeShortcutsEnabled);
    }
    if (state.plusMinus.settings.enabled) {
      out = applyPlusMinusColDefTransforms(out);
    }
    if (state.shortcuts.settings.enabled) {
      out = applyShortcutsColDefTransforms(out, state.shortcuts.shortcuts);
    }
    return out;
  },

  activate: activateEditing,

  SettingsPanel: EditingPanel,
};

export { EditingPanel } from './EditingPanel.js';
export { useEditingSlice } from './useEditingSlice.js';
