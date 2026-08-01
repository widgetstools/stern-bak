import type { LabDemoProfileEntry } from '../labProfileKit';
import {
  defaultShortcut,
  INITIAL_DATA_CHANGE_HISTORY,
  INITIAL_SHORTCUTS,
  type ShortcutDefinition,
  type ShortcutsState,
} from '@wellsfargo-starui/core';

export const SHORTCUTS_GRID_ID = 'lab-shortcuts';

function shortcutsState(
  shortcuts: ShortcutDefinition[],
  settings: Partial<ShortcutsState['settings']> = {},
): ShortcutsState {
  return {
    settings: { ...INITIAL_SHORTCUTS.settings, ...settings },
    shortcuts,
  };
}

const HISTORY = structuredClone(INITIAL_DATA_CHANGE_HISTORY);

const multiplyQty100: ShortcutDefinition = {
  ...defaultShortcut('H ×100 qty'),
  shortcutKey: 'h',
  operation: 'multiply',
  shortcutValue: 100,
  scope: { columnIds: ['quantityFace'] },
};

const addQty1000: ShortcutDefinition = {
  ...defaultShortcut('M +1000 qty'),
  shortcutKey: 'm',
  operation: 'add',
  shortcutValue: 1000,
  scope: { columnIds: ['quantityFace'] },
};

const subtractQty500: ShortcutDefinition = {
  ...defaultShortcut('L −500 qty'),
  shortcutKey: 'l',
  operation: 'subtract',
  shortcutValue: 500,
  scope: { columnIds: ['quantityFace'] },
};

export const SHORTCUTS_DEMO_PROFILES: LabDemoProfileEntry[] = [
  {
    id: 'sc-00-curriculum',
    name: '00 · Curriculum',
    blurb: 'H ×100, M +1000, L −500 on quantityFace with undo.',
    seed: {
      shortcuts: shortcutsState([multiplyQty100, addQty1000, subtractQty500]),
      'data-change-history': HISTORY,
      'general-settings': { cellSelection: true },
    },
  },
  {
    id: 'sc-01-multiply-shortcut',
    name: '01 · Multiply shortcut',
    blurb: 'Press H to multiply qty by 100.',
    seed: {
      shortcuts: shortcutsState([multiplyQty100]),
      'data-change-history': HISTORY,
      'general-settings': { cellSelection: true },
    },
  },
  {
    id: 'sc-02-suspended',
    name: '02 · Module off',
    blurb: 'Shortcuts disabled — letter keys do not apply edits.',
    seed: {
      shortcuts: shortcutsState([multiplyQty100], { enabled: false }),
      'data-change-history': HISTORY,
      'general-settings': { cellSelection: true },
    },
  },
];

export const SHORTCUTS_ACTIVE_PROFILE_ID = 'sc-01-multiply-shortcut';
