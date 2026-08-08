import { describe, expect, it } from 'vitest';
import {
  ALERTS_FEATURE,
  BULK_UPDATE_FEATURE,
  CALCULATED_FEATURE,
  COLUMN_GROUPS_FEATURE,
  CONDITIONAL_FEATURE,
  EDITING_FEATURE,
  FORMATTER_TOOLBAR_FEATURE,
  FORMATTING_FEATURE,
  LIVE_FEATURE,
  OVERVIEW_FEATURE,
  PLUS_MINUS_FEATURE,
  QUICK_FILTERS_FEATURE,
  RENDERERS_FEATURE,
  SHORTCUTS_FEATURE,
  SMART_EDIT_FEATURE,
  VISUAL_EXCEL_FEATURE,
} from './labFeatureConfigs';

const FEATURES = [
  OVERVIEW_FEATURE,
  FORMATTING_FEATURE,
  VISUAL_EXCEL_FEATURE,
  RENDERERS_FEATURE,
  FORMATTER_TOOLBAR_FEATURE,
  COLUMN_GROUPS_FEATURE,
  CALCULATED_FEATURE,
  CONDITIONAL_FEATURE,
  QUICK_FILTERS_FEATURE,
  LIVE_FEATURE,
  ALERTS_FEATURE,
  EDITING_FEATURE,
  BULK_UPDATE_FEATURE,
  PLUS_MINUS_FEATURE,
  SHORTCUTS_FEATURE,
  SMART_EDIT_FEATURE,
];

describe('labFeatureConfigs', () => {
  it('defines configs for every feature tab', () => {
    for (const config of FEATURES) {
      expect(config.tabId).toBeTruthy();
      expect(config.gridId).toBeTruthy();
      expect(config.profiles.length).toBeGreaterThan(0);
      expect(config.activeProfileId).toBeTruthy();
      expect(config.help.length).toBeGreaterThan(0);
    }
  });

  it('builds column defs for each feature', () => {
    for (const config of FEATURES) {
      const cols = config.getColumnDefs();
      expect(cols.length).toBeGreaterThan(0);
      if (config.defaultColDef) {
        expect(config.defaultColDef).toBeDefined();
      }
    }
  });

  it('covers editing-specific editable columns', () => {
    const cols = EDITING_FEATURE.getColumnDefs();
    const currency = cols.find((c) => c.field === 'currency');
    const qty = cols.find((c) => c.field === 'quantityFace');
    const maturity = cols.find((c) => c.field === 'maturityDate');
    expect(currency?.editable).toBe(true);
    expect(qty?.editable).toBe(true);
    expect(maturity?.editable).toBe(true);
  });

  it('includes tick subtitle flag on live feature', () => {
    expect(LIVE_FEATURE.subtitleIncludesTickMs).toBe(true);
  });
});
