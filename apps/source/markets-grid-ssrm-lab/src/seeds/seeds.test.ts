import { describe, expect, it } from 'vitest';
import * as seeds from './index';
import { ALERTS_TAB_STATE } from './alerts';
import { CALCULATED_TAB_VIRTUAL, OVERVIEW_CALC_COLUMNS } from './calculatedColumns';
import {
  FORMATTING_CC_STATE,
  FORMATTING_ASSIGNMENTS,
  OVERVIEW_CC_STATE,
} from './columnCustomization';
import { OVERVIEW_COLUMN_GROUPS } from './columnGroups';
import { FORMATTER_TOOLBAR_FULL_STATE } from './formatterToolbar';
import { FAST_FLASH, HEAVY_FLASH, STORM_FLASH } from './generalSettings';
import {
  RENDERERS_FULL_ASSIGNMENTS,
  RENDERERS_FULL_STATE,
  RATING_PILL_CONFIG,
} from './renderers';
import { QUICK_FILTERS_CURRICULUM, QUICK_FILTERS_EMPTY } from './savedFilters';
import { bgText } from './styleHelpers';
import {
  CONDITIONAL_TAB_CS_RULES,
  LIVE_TAB_CS_RULES,
  OVERVIEW_CS_RULES,
} from './conditionalStyling';

describe('seeds', () => {
  it('re-exports seed modules from index', () => {
    expect(seeds.OVERVIEW_CS_RULES.length).toBeGreaterThan(0);
    expect(seeds.FORMATTER_TOOLBAR_FULL_STATE).toBeDefined();
    expect(seeds.QUICK_FILTERS_CURRICULUM.filters.length).toBeGreaterThan(0);
  });

  it('defines alert tab state', () => {
    expect(ALERTS_TAB_STATE.rules.length).toBeGreaterThan(0);
    expect(ALERTS_TAB_STATE.settings).toBeDefined();
  });

  it('defines calculated column seeds', () => {
    expect(OVERVIEW_CALC_COLUMNS.length).toBeGreaterThan(0);
    expect(CALCULATED_TAB_VIRTUAL.length).toBeGreaterThan(0);
  });

  it('defines column customization assignments', () => {
    expect(OVERVIEW_CC_STATE.assignments.bidPrice).toBeDefined();
    expect(FORMATTING_CC_STATE.assignments).toBeDefined();
    expect(FORMATTING_ASSIGNMENTS.bidPrice).toBeDefined();
  });

  it('defines column groups and general settings', () => {
    expect(OVERVIEW_COLUMN_GROUPS.length).toBeGreaterThan(0);
    expect(FAST_FLASH.cellFlashDuration).toBeDefined();
    expect(HEAVY_FLASH.cellFlashDuration).toBeDefined();
    expect(STORM_FLASH.enableCellChangeFlash).toBe(true);
  });

  it('defines formatter toolbar and renderer seeds', () => {
    expect(FORMATTER_TOOLBAR_FULL_STATE.assignments.cusip).toBeDefined();
    expect(RENDERERS_FULL_STATE.assignments.compositeRating).toBeDefined();
    expect(RENDERERS_FULL_ASSIGNMENTS.compositeRating.cellRendererId).toBeDefined();
    expect(RATING_PILL_CONFIG.rules.length).toBeGreaterThan(5);
  });

  it('defines quick filter pill sets', () => {
    // SavedFiltersState.filters is unknown[] by design (filter models are
    // opaque to core) — narrow to the pill contract the seed writes.
    expect(
      QUICK_FILTERS_CURRICULUM.filters.some((p) => (p as { active: boolean }).active),
    ).toBe(true);
    expect(QUICK_FILTERS_EMPTY.filters).toEqual([]);
  });

  it('defines conditional styling rule sets', () => {
    expect(OVERVIEW_CS_RULES.length).toBeGreaterThan(0);
    expect(CONDITIONAL_TAB_CS_RULES.length).toBeGreaterThan(0);
    expect(LIVE_TAB_CS_RULES.length).toBeGreaterThan(0);
  });

  it('builds themed style overrides', () => {
    const themed = bgText('#111', '#eee', '#aaa', '#333');
    expect(themed.dark?.colors?.background).toBe('#111');
    expect(themed.light?.colors?.text).toBe('#333');
  });
});
