export const DATA_CHANGE_HISTORY_MODULE_ID = 'data-change-history';
export const DATA_CHANGE_HISTORY_SCHEMA_VERSION = 1;

export interface DataChangeHistoryRecordSources {
  smartEdit: boolean;
  bulkUpdate: boolean;
  plusMinus: boolean;
  shortcuts: boolean;
  cellEditor: boolean;
  /** Live stream / applyTransaction ticks — default off. */
  stream: boolean;
}

export interface DataChangeHistorySettings {
  enabled: boolean;
  /** Max undo/redo stack depth. Default 50. */
  maxEntries: number;
  /** Pause recording without disabling undo of past entries. */
  suspended: boolean;
  /** When true, disable AG Grid built-in undoRedoCellEditing. */
  unifyUndo: boolean;
  recordSources: DataChangeHistoryRecordSources;
}

export interface DataChangeHistoryState {
  settings: DataChangeHistorySettings;
}

export const DEFAULT_RECORD_SOURCES: DataChangeHistoryRecordSources = {
  smartEdit: true,
  bulkUpdate: true,
  plusMinus: true,
  shortcuts: true,
  cellEditor: true,
  stream: false,
};

export const INITIAL_DATA_CHANGE_HISTORY: DataChangeHistoryState = {
  settings: {
    enabled: true,
    maxEntries: 50,
    suspended: false,
    unifyUndo: true,
    recordSources: { ...DEFAULT_RECORD_SOURCES },
  },
};

export function deserializeDataChangeHistoryState(raw: unknown): DataChangeHistoryState {
  if (!raw || typeof raw !== 'object') {
    return structuredClone(INITIAL_DATA_CHANGE_HISTORY);
  }
  const obj = raw as { settings?: Partial<DataChangeHistorySettings> };
  const settings = obj.settings ?? {};
  const recordSources = {
    ...DEFAULT_RECORD_SOURCES,
    ...(settings.recordSources ?? {}),
  };
  return {
    settings: {
      enabled: settings.enabled ?? INITIAL_DATA_CHANGE_HISTORY.settings.enabled,
      maxEntries: settings.maxEntries ?? INITIAL_DATA_CHANGE_HISTORY.settings.maxEntries,
      suspended: settings.suspended ?? INITIAL_DATA_CHANGE_HISTORY.settings.suspended,
      unifyUndo: settings.unifyUndo ?? INITIAL_DATA_CHANGE_HISTORY.settings.unifyUndo,
      recordSources,
    },
  };
}

/** Map journal EditSource to recordSources key. */
export function recordSourceKey(
  source: import('../editing-core/types.js').EditSource,
): keyof DataChangeHistoryRecordSources | null {
  switch (source) {
    case 'smart-edit':
      return 'smartEdit';
    case 'bulk-update':
      return 'bulkUpdate';
    case 'plus-minus':
      return 'plusMinus';
    case 'shortcut':
      return 'shortcuts';
    case 'cell-editor':
      return 'cellEditor';
    default:
      return null;
  }
}
