import { describe, expect, it } from 'vitest';
import { deserializeVisualExcelState, INITIAL_VISUAL_EXCEL } from './state';

describe('deserializeVisualExcelState', () => {
  it('returns defaults for invalid input', () => {
    const out = deserializeVisualExcelState(null);
    expect(out).toEqual(INITIAL_VISUAL_EXCEL);
    expect(out).not.toBe(INITIAL_VISUAL_EXCEL);
  });

  it('merges partial settings and trims fileNamePrefix', () => {
    expect(
      deserializeVisualExcelState({
        settings: { enabled: false, fileNamePrefix: '  exports  ' },
      }),
    ).toEqual({
      settings: { enabled: false, fileNamePrefix: 'exports' },
    });
  });

  it('falls back when fileNamePrefix is blank', () => {
    expect(
      deserializeVisualExcelState({ settings: { fileNamePrefix: '   ' } }).settings.fileNamePrefix,
    ).toBe('markets-grid');
  });
});
