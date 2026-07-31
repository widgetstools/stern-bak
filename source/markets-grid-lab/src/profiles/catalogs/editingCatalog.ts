import type { LabDemoProfileEntry } from '../labProfileKit';
import {
  defaultPlusMinusNudge,
  defaultShortcut,
  INITIAL_BULK_UPDATE,
  INITIAL_DATA_CHANGE_HISTORY,
  INITIAL_PLUS_MINUS,
  INITIAL_SHORTCUTS,
  INITIAL_SMART_EDIT,
  type BulkUpdateSettings,
  type BulkUpdateState,
  type DataChangeHistoryState,
  type PlusMinusNudge,
  type PlusMinusSettings,
  type PlusMinusState,
  type ShortcutDefinition,
  type ShortcutsSettings,
  type ShortcutsState,
  type SmartEditSettings,
  type SmartEditState,
} from '@wellsfargo-starui/engine';
import { SMART_EDIT_TAB_STATE } from '../../seeds/smartEdit';

export const EDITING_GRID_ID = 'lab-editing';

function smartEditState(settings: Partial<SmartEditSettings> = {}): SmartEditState {
  return { settings: { ...INITIAL_SMART_EDIT.settings, ...settings } };
}

function bulkUpdateState(settings: Partial<BulkUpdateSettings> = {}): BulkUpdateState {
  return { settings: { ...INITIAL_BULK_UPDATE.settings, ...settings } };
}

function plusMinusState(
  nudges: PlusMinusNudge[],
  settings: Partial<PlusMinusSettings> = {},
): PlusMinusState {
  return { settings: { ...INITIAL_PLUS_MINUS.settings, ...settings }, nudges };
}

function shortcutsState(
  shortcuts: ShortcutDefinition[],
  settings: Partial<ShortcutsSettings> = {},
): ShortcutsState {
  return { settings: { ...INITIAL_SHORTCUTS.settings, ...settings }, shortcuts };
}

function historyState(settings: Partial<DataChangeHistoryState['settings']> = {}): DataChangeHistoryState {
  return {
    settings: {
      ...structuredClone(INITIAL_DATA_CHANGE_HISTORY.settings),
      ...settings,
    },
  };
}

const CELL_SELECTION = { cellSelection: true } as const;

const qtyStep100: PlusMinusNudge = {
  ...defaultPlusMinusNudge('Qty ±100'),
  scope: { columnIds: ['quantityFace'] },
  incrementStep: 100,
  decrementStep: 100,
};

const midStep1: PlusMinusNudge = {
  ...defaultPlusMinusNudge('Mid ±0.01'),
  scope: { columnIds: ['midPrice'] },
  incrementStep: 0.01,
  decrementStep: 0.01,
};

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

const ALL_MODULES_ON = {
  'smart-edit': SMART_EDIT_TAB_STATE,
  'bulk-update': bulkUpdateState({ showDistinctValues: true }),
  'plus-minus': plusMinusState([qtyStep100, midStep1]),
  shortcuts: shortcutsState([multiplyQty100, addQty1000, subtractQty500]),
  'data-change-history': historyState(),
  'general-settings': CELL_SELECTION,
};

export const EDITING_DEMO_PROFILES: LabDemoProfileEntry[] = [
  {
    id: 'ed-00-full-curriculum',
    name: '00 · Full curriculum',
    blurb: 'All editing modules on — toolbars, +/-, letter shortcuts, undo.',
    seed: ALL_MODULES_ON,
  },
  {
    id: 'ed-01-smart-edit-only',
    name: '01 · Smart Edit only',
    blurb: 'Smart Edit toolbar + K/M/B; other editing modules off.',
    seed: {
      'smart-edit': smartEditState({ enabled: true }),
      'bulk-update': bulkUpdateState({ enabled: false }),
      'plus-minus': plusMinusState([], { enabled: false }),
      shortcuts: shortcutsState([], { enabled: false }),
      'data-change-history': historyState(),
      'general-settings': CELL_SELECTION,
    },
  },
  {
    id: 'ed-02-bulk-update-text',
    name: '02 · Bulk text',
    blurb: 'Bulk Update on currency with distinct-value dropdown.',
    seed: {
      'smart-edit': smartEditState({ enabled: false }),
      'bulk-update': bulkUpdateState({ enabled: true, showDistinctValues: true }),
      'plus-minus': plusMinusState([], { enabled: false }),
      shortcuts: shortcutsState([], { enabled: false }),
      'data-change-history': historyState(),
      'general-settings': CELL_SELECTION,
    },
  },
  {
    id: 'ed-03-bulk-update-date',
    name: '03 · Bulk date',
    blurb: 'Bulk Update on maturity date column.',
    seed: {
      'smart-edit': smartEditState({ enabled: false }),
      'bulk-update': bulkUpdateState({ enabled: true, showDistinctValues: false }),
      'plus-minus': plusMinusState([], { enabled: false }),
      shortcuts: shortcutsState([], { enabled: false }),
      'data-change-history': historyState(),
      'general-settings': CELL_SELECTION,
    },
  },
  {
    id: 'ed-04-plus-minus-nudges',
    name: '04 · Plus/Minus nudges',
    blurb: 'Qty ±100 and mid ±0.01 nudge rules.',
    seed: {
      'smart-edit': smartEditState({ enabled: false }),
      'bulk-update': bulkUpdateState({ enabled: false }),
      'plus-minus': plusMinusState([qtyStep100, midStep1]),
      shortcuts: shortcutsState([], { enabled: false }),
      'data-change-history': historyState(),
      'general-settings': CELL_SELECTION,
    },
  },
  {
    id: 'ed-05-shortcuts',
    name: '05 · Letter shortcuts',
    blurb: 'H ×100, M +1000, L −500 on quantityFace.',
    seed: {
      'smart-edit': smartEditState({ enabled: false }),
      'bulk-update': bulkUpdateState({ enabled: false }),
      'plus-minus': plusMinusState([], { enabled: false }),
      shortcuts: shortcutsState([multiplyQty100, addQty1000, subtractQty500]),
      'data-change-history': historyState(),
      'general-settings': CELL_SELECTION,
    },
  },
  {
    id: 'ed-06-history-suspend',
    name: '06 · History suspended',
    blurb: 'Edit history on but recording suspended — edits not journaled.',
    seed: {
      ...ALL_MODULES_ON,
      'data-change-history': historyState({ suspended: true }),
    },
  },
  {
    id: 'ed-07-preview-validation',
    name: '07 · Preview before apply',
    blurb: 'Smart Edit preview dialog before apply.',
    seed: {
      ...ALL_MODULES_ON,
      'smart-edit': smartEditState({ previewBeforeApply: true, recordHistory: true }),
    },
  },
  {
    id: 'ed-08-custom-ops',
    name: '08 · All ops enabled',
    blurb: 'Every Smart Edit op in toolbar (custom ops deferred).',
    seed: {
      ...ALL_MODULES_ON,
      'smart-edit': smartEditState({
        enabledOps: ['multiply', 'divide', 'add', 'subtract', 'set'],
        previewBeforeApply: false,
      }),
    },
  },
  {
    id: 'ed-09-confirm-thresholds',
    name: '09 · Low confirm threshold',
    blurb: 'Confirm when more than 5 cells selected (Smart Edit + Bulk Update).',
    seed: {
      ...ALL_MODULES_ON,
      'smart-edit': smartEditState({ confirmThreshold: 5 }),
      'bulk-update': bulkUpdateState({ confirmThreshold: 5, showDistinctValues: true }),
    },
  },
  {
    id: 'ed-10-shortcuts-off-magnitude-on',
    name: '10 · K/M/B only',
    blurb: 'Smart Edit magnitude parsing; letter shortcuts and +/- nudges off.',
    seed: {
      'smart-edit': smartEditState({ enabled: true, magnitudeShortcutsEnabled: true }),
      'bulk-update': bulkUpdateState({ enabled: false }),
      'plus-minus': plusMinusState([], { enabled: false }),
      shortcuts: shortcutsState([], { enabled: false }),
      'data-change-history': historyState(),
      'general-settings': CELL_SELECTION,
    },
  },
  {
    id: 'ed-11-all-disabled',
    name: '11 · All modules off',
    blurb: 'Editing modules disabled — grid behaves like pre-editing family.',
    seed: {
      'smart-edit': smartEditState({ enabled: false }),
      'bulk-update': bulkUpdateState({ enabled: false }),
      'plus-minus': plusMinusState([], { enabled: false }),
      shortcuts: shortcutsState([], { enabled: false }),
      'data-change-history': historyState({ enabled: false }),
      'general-settings': CELL_SELECTION,
    },
  },
];

export const EDITING_ACTIVE_PROFILE_ID = 'ed-00-full-curriculum';
