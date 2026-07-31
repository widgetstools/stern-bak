export const BULK_UPDATE_MODULE_ID = 'bulk-update';
export const BULK_UPDATE_SCHEMA_VERSION = 1;

export interface BulkUpdateSettings {
  /** Master switch — when false, toolbar hidden. */
  enabled: boolean;
  /** Confirm before applying when more than N cells selected (0 = never). */
  confirmThreshold: number;
  /** Offer distinct column values in a dropdown. */
  showDistinctValues: boolean;
  /** Max distinct values in the dropdown. */
  maxDropdownValues: number;
  /** Only one column per bulk apply. */
  enforceSingleColumn: boolean;
  /** Record applies in the shared edit journal. */
  recordHistory: boolean;
}

export interface BulkUpdateState {
  settings: BulkUpdateSettings;
}

export const INITIAL_BULK_UPDATE: BulkUpdateState = {
  settings: {
    enabled: true,
    confirmThreshold: 50,
    showDistinctValues: true,
    maxDropdownValues: 20,
    enforceSingleColumn: true,
    recordHistory: true,
  },
};

export function deserializeBulkUpdateState(raw: unknown): BulkUpdateState {
  if (!raw || typeof raw !== 'object') return structuredClone(INITIAL_BULK_UPDATE);
  const d = raw as { settings?: Partial<BulkUpdateSettings> };
  const s = d.settings ?? {};
  return {
    settings: {
      enabled: typeof s.enabled === 'boolean' ? s.enabled : INITIAL_BULK_UPDATE.settings.enabled,
      confirmThreshold:
        typeof s.confirmThreshold === 'number'
        && Number.isFinite(s.confirmThreshold)
        && s.confirmThreshold >= 0
          ? s.confirmThreshold
          : INITIAL_BULK_UPDATE.settings.confirmThreshold,
      showDistinctValues:
        typeof s.showDistinctValues === 'boolean'
          ? s.showDistinctValues
          : INITIAL_BULK_UPDATE.settings.showDistinctValues,
      maxDropdownValues:
        typeof s.maxDropdownValues === 'number'
        && Number.isFinite(s.maxDropdownValues)
        && s.maxDropdownValues > 0
          ? s.maxDropdownValues
          : INITIAL_BULK_UPDATE.settings.maxDropdownValues,
      enforceSingleColumn:
        typeof s.enforceSingleColumn === 'boolean'
          ? s.enforceSingleColumn
          : INITIAL_BULK_UPDATE.settings.enforceSingleColumn,
      recordHistory:
        typeof s.recordHistory === 'boolean'
          ? s.recordHistory
          : INITIAL_BULK_UPDATE.settings.recordHistory,
    },
  };
}
