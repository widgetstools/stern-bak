import { describe, expect, it } from 'vitest';
import {
  DATA_CHANGE_HISTORY_MODULE_ID,
  INITIAL_DATA_CHANGE_HISTORY,
} from '@wellsfargo-starui/core';
import { resolveEditRecording } from './recordEdit.js';

describe('resolveEditRecording', () => {
  function platform(historyEnabled = true, suspended = false, smartEdit = true) {
    return {
      gridId: 'g1',
      getModuleState: (id: string) => {
        if (id !== DATA_CHANGE_HISTORY_MODULE_ID) throw new Error('unknown');
        return {
          settings: {
            ...INITIAL_DATA_CHANGE_HISTORY.settings,
            enabled: historyEnabled,
            suspended,
            recordSources: {
              ...INITIAL_DATA_CHANGE_HISTORY.settings.recordSources,
              smartEdit,
            },
          },
        };
      },
    };
  }

  it('records when module wants record and history module absent behavior uses journal', () => {
    const p = { gridId: 'g2' };
    const result = resolveEditRecording(p as never, 'smart-edit', true);
    expect(result.record).toBe(true);
    expect(result.journal).toBeTruthy();
  });

  it('blocks when history suspended', () => {
    const result = resolveEditRecording(platform(true, true) as never, 'smart-edit', true);
    expect(result.record).toBe(false);
  });

  it('blocks when recordSources.smartEdit is false', () => {
    const result = resolveEditRecording(platform(true, false, false) as never, 'smart-edit', true);
    expect(result.record).toBe(false);
  });

  it('blocks when module does not want record', () => {
    const result = resolveEditRecording(platform() as never, 'smart-edit', false);
    expect(result.record).toBe(false);
  });

  it('records cell-editor when enabled by default', () => {
    const result = resolveEditRecording(platform() as never, 'cell-editor', true);
    expect(result.record).toBe(true);
  });
});
