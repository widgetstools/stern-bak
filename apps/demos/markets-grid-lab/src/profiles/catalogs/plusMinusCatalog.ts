import type { LabDemoProfileEntry } from '../labProfileKit';
import {
  defaultPlusMinusNudge,
  INITIAL_DATA_CHANGE_HISTORY,
  INITIAL_PLUS_MINUS,
  INITIAL_SMART_EDIT,
  type PlusMinusNudge,
  type PlusMinusState,
} from '@wellsfargo-starui/engine';

export const PLUS_MINUS_GRID_ID = 'lab-plus-minus';

function plusMinusState(
  nudges: PlusMinusNudge[],
  settings: Partial<PlusMinusState['settings']> = {},
): PlusMinusState {
  return {
    settings: { ...INITIAL_PLUS_MINUS.settings, ...settings },
    nudges,
  };
}

const HISTORY = structuredClone(INITIAL_DATA_CHANGE_HISTORY);

const qtyStep1000: PlusMinusNudge = {
  ...defaultPlusMinusNudge('Qty ±1000'),
  scope: { columnIds: ['quantityFace'] },
  incrementStep: 1000,
  decrementStep: 1000,
};

const qtyStep100: PlusMinusNudge = {
  ...defaultPlusMinusNudge('Qty ±100'),
  scope: { columnIds: ['quantityFace'] },
  incrementStep: 100,
};

const midStep1: PlusMinusNudge = {
  ...defaultPlusMinusNudge('Mid ±0.01'),
  scope: { columnIds: ['midPrice'] },
  incrementStep: 0.01,
  decrementStep: 0.01,
};

const longOnlyQty: PlusMinusNudge = {
  ...defaultPlusMinusNudge('Long-only qty'),
  scope: { columnIds: ['quantityFace'] },
  incrementStep: 500,
  expression: '[side] == "Long"',
};

export const PLUS_MINUS_DEMO_PROFILES: LabDemoProfileEntry[] = [
  {
    id: 'pm-00-global-step',
    name: '00 · Global step',
    blurb: 'quantityFace nudge ±1000; +/- keys with edit history.',
    seed: {
      'plus-minus': plusMinusState([qtyStep1000]),
      'data-change-history': HISTORY,
      'smart-edit': { settings: { ...INITIAL_SMART_EDIT.settings, enabled: true } },
      'general-settings': { cellSelection: true },
    },
  },
  {
    id: 'pm-01-column-rules',
    name: '01 · Column rules',
    blurb: 'Different steps per column — qty ±100, mid ±0.01.',
    seed: {
      'plus-minus': plusMinusState([qtyStep100, midStep1]),
      'data-change-history': HISTORY,
      'general-settings': { cellSelection: true },
    },
  },
  {
    id: 'pm-02-expression-gate',
    name: '02 · Expression gate',
    blurb: 'Nudge qty only when [side] == "Long".',
    seed: {
      'plus-minus': plusMinusState([longOnlyQty]),
      'data-change-history': HISTORY,
      'general-settings': { cellSelection: true },
    },
  },
];

export const PLUS_MINUS_ACTIVE_PROFILE_ID = 'pm-00-global-step';
