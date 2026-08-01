import { describe, expect, it } from 'vitest';
import { INITIAL_GENERAL_SETTINGS } from './state.js';

describe('general-settings state', () => {
  it('ships compact density and cell-change flash on by default', () => {
    expect(INITIAL_GENERAL_SETTINGS.gridDensity).toBe('compact');
    expect(INITIAL_GENERAL_SETTINGS.enableCellChangeFlash).toBe(true);
    expect(INITIAL_GENERAL_SETTINGS.cellChangeFlashColor).toBe('emerald');
  });

  it('enables sidebar and status bar out of the box', () => {
    expect(INITIAL_GENERAL_SETTINGS.sideBar).toBe(true);
    expect(INITIAL_GENERAL_SETTINGS.statusBar).toBe(true);
    expect(INITIAL_GENERAL_SETTINGS.statusBarShowTotalAndFilteredCount).toBe(true);
  });
});
