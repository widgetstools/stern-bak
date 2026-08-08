import type { LabDemoProfileEntry } from '../labProfileKit';
import type { BulkUpdateSettings, BulkUpdateState } from '@wellsfargo-starui/core';
import {
  INITIAL_BULK_UPDATE,
  INITIAL_DATA_CHANGE_HISTORY,
} from '@wellsfargo-starui/core';

export const BULK_UPDATE_GRID_ID = 'lab-bulk-update';

function bulkUpdateState(settings: Partial<BulkUpdateSettings> = {}): BulkUpdateState {
  return {
    settings: {
      ...INITIAL_BULK_UPDATE.settings,
      ...settings,
    },
  };
}

const HISTORY = structuredClone(INITIAL_DATA_CHANGE_HISTORY);

export const BULK_UPDATE_DEMO_PROFILES: LabDemoProfileEntry[] = [
  {
    id: 'bu-00-curriculum',
    name: '00 · Curriculum',
    blurb: 'Editable currency + qty + maturity; distinct-value dropdown.',
    seed: {
      'bulk-update': bulkUpdateState({ showDistinctValues: false }),
      'data-change-history': HISTORY,
      'general-settings': { cellSelection: true },
    },
  },
  {
    id: 'bu-01-text-column',
    name: '01 · Text column',
    blurb: 'Currency bulk set — distinct-value dropdown enabled.',
    seed: {
      'bulk-update': bulkUpdateState({ showDistinctValues: true }),
      'data-change-history': HISTORY,
      'general-settings': { cellSelection: true },
    },
  },
  {
    id: 'bu-02-date-column',
    name: '02 · Date column',
    blurb: 'Maturity date bulk set with date input.',
    seed: {
      'bulk-update': bulkUpdateState({ showDistinctValues: false }),
      'data-change-history': HISTORY,
      'general-settings': { cellSelection: true },
    },
  },
  {
    id: 'bu-03-confirm-low',
    name: '03 · Confirm threshold',
    blurb: 'Confirm when more than 5 cells selected.',
    seed: {
      'bulk-update': bulkUpdateState({ confirmThreshold: 5 }),
      'data-change-history': HISTORY,
      'general-settings': { cellSelection: true },
    },
  },
];

export const BULK_UPDATE_ACTIVE_PROFILE_ID = 'bu-00-curriculum';
