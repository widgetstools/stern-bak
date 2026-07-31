/**
 * Shortcuts — letter-key arithmetic on focused/selected numeric cells.
 */

import type { Module } from '@wellsfargo-starui/engine';
import {
  SHORTCUTS_MODULE_ID,
  SHORTCUTS_SCHEMA_VERSION,
  applyShortcutsColDefTransforms,
  deserializeShortcutsState,
  INITIAL_SHORTCUTS,
  type ShortcutsState,
} from '@wellsfargo-starui/engine';
import {
  ShortcutsEditor,
  ShortcutsList,
  ShortcutsPanel,
} from './ShortcutsPanel.js';
import { activateShortcuts } from './runtime/activate.js';

export { SHORTCUTS_MODULE_ID };

export const shortcutsModule: Module<ShortcutsState> = {
  id: SHORTCUTS_MODULE_ID,
  name: 'Shortcuts',
  code: '09',
  schemaVersion: SHORTCUTS_SCHEMA_VERSION,
  priority: 25,

  getInitialState: () => structuredClone(INITIAL_SHORTCUTS),

  serialize: (state) => ({ settings: state.settings, shortcuts: state.shortcuts }),

  deserialize: deserializeShortcutsState,

  transformColumnDefs(defs, state) {
    if (!state.settings.enabled) return defs;
    return applyShortcutsColDefTransforms(defs, state.shortcuts);
  },

  activate: activateShortcuts,

  SettingsPanel: ShortcutsPanel,
  ListPane: ShortcutsList,
  EditorPane: ShortcutsEditor,
};
