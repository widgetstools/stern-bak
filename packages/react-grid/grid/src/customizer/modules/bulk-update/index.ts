/**
 * Bulk Update — replace all selected cells in one column with the same value.
 */

import type { Module } from '@wellsfargo-starui/core';
import {
  BULK_UPDATE_MODULE_ID,
  BULK_UPDATE_SCHEMA_VERSION,
  deserializeBulkUpdateState,
  INITIAL_BULK_UPDATE,
  type BulkUpdateState,
} from '@wellsfargo-starui/core';
import { BulkUpdatePanel } from './BulkUpdatePanel';
import { BulkUpdateToolbarBody } from './BulkUpdateToolbarBody';

export { BULK_UPDATE_MODULE_ID };

export const bulkUpdateModule: Module<BulkUpdateState> = {
  id: BULK_UPDATE_MODULE_ID,
  name: 'Bulk Update',
  code: '07',
  schemaVersion: BULK_UPDATE_SCHEMA_VERSION,
  priority: 23,

  getInitialState: () => structuredClone(INITIAL_BULK_UPDATE),

  serialize: (state) => ({ settings: state.settings }),

  deserialize: deserializeBulkUpdateState,

  SettingsPanel: BulkUpdatePanel,
};

export { BulkUpdateToolbarBody };
export { useBulkUpdateSelection } from './useBulkUpdateSelection';
