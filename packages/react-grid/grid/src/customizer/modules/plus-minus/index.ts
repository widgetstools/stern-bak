/**
 * Plus / Minus — keyboard nudge rules with per-column steps and optional expressions.
 */

import type { Module } from '@wellsfargo-starui/engine';
import {
  PLUS_MINUS_MODULE_ID,
  PLUS_MINUS_SCHEMA_VERSION,
  applyPlusMinusColDefTransforms,
  deserializePlusMinusState,
  INITIAL_PLUS_MINUS,
  type PlusMinusState,
} from '@wellsfargo-starui/engine';
import {
  PlusMinusEditor,
  PlusMinusList,
  PlusMinusPanel,
} from './PlusMinusPanel.js';
import { activatePlusMinus } from './runtime/activate.js';

export { PLUS_MINUS_MODULE_ID };

export const plusMinusModule: Module<PlusMinusState> = {
  id: PLUS_MINUS_MODULE_ID,
  name: 'Plus / Minus',
  code: '08',
  schemaVersion: PLUS_MINUS_SCHEMA_VERSION,
  priority: 24,

  getInitialState: () => structuredClone(INITIAL_PLUS_MINUS),

  serialize: (state) => ({ settings: state.settings, nudges: state.nudges }),

  deserialize: deserializePlusMinusState,

  transformColumnDefs(defs, state) {
    if (!state.settings.enabled) return defs;
    return applyPlusMinusColDefTransforms(defs);
  },

  activate: activatePlusMinus,

  SettingsPanel: PlusMinusPanel,
  ListPane: PlusMinusList,
  EditorPane: PlusMinusEditor,
};
