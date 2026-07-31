import { describe, expect, it } from 'vitest';
import {
  DATA_CHANGE_HISTORY_MODULE_ID,
  deserializeDataChangeHistoryState,
  INITIAL_DATA_CHANGE_HISTORY,
  recordSourceKey,
} from './state.js';

describe('data-change-history state', () => {
  it('exports stable module id', () => {
    expect(DATA_CHANGE_HISTORY_MODULE_ID).toBe('data-change-history');
  });

  it('deserializes empty input to defaults', () => {
    expect(deserializeDataChangeHistoryState(null)).toEqual(INITIAL_DATA_CHANGE_HISTORY);
  });

  it('merges partial settings and recordSources', () => {
    const state = deserializeDataChangeHistoryState({
      settings: {
        maxEntries: 20,
        recordSources: { cellEditor: true, stream: true },
      },
    });
    expect(state.settings.maxEntries).toBe(20);
    expect(state.settings.recordSources.cellEditor).toBe(true);
    expect(state.settings.recordSources.stream).toBe(true);
    expect(state.settings.recordSources.smartEdit).toBe(true);
  });

  it('maps edit sources to recordSources keys', () => {
    expect(recordSourceKey('smart-edit')).toBe('smartEdit');
    expect(recordSourceKey('cell-editor')).toBe('cellEditor');
  });
});
