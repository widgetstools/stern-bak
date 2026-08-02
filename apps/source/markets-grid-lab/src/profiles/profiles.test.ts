import { describe, expect, it } from 'vitest';
import * as catalogs from './catalogs';
import { PRESETS } from './presets';
import {
  buildLabDemoBundle,
  serializeTabSeed,
  toExportedProfilePayload,
} from './labProfileKit';
import { toExportedProfilePayload as alertExport } from './alertDemoCatalog';
import {
  ALERTS_DEMO_PROFILES,
  ALERTS_GRID_ID,
  OVERVIEW_DEMO_PROFILES,
  OVERVIEW_GRID_ID,
} from './catalogs';

describe('profile catalogs', () => {
  it('exports grid ids and demo profiles for every feature', () => {
    expect(catalogs.OVERVIEW_GRID_ID).toBeTruthy();
    expect(catalogs.OVERVIEW_DEMO_PROFILES.length).toBeGreaterThan(0);
    expect(catalogs.FORMATTING_DEMO_PROFILES.length).toBeGreaterThan(0);
    expect(catalogs.RENDERERS_DEMO_PROFILES.length).toBeGreaterThan(0);
    expect(catalogs.FORMATTER_TOOLBAR_DEMO_PROFILES.length).toBeGreaterThan(0);
    expect(catalogs.COLUMN_GROUPS_DEMO_PROFILES.length).toBeGreaterThan(0);
    expect(catalogs.CALCULATED_DEMO_PROFILES.length).toBeGreaterThan(0);
    expect(catalogs.CONDITIONAL_DEMO_PROFILES.length).toBeGreaterThan(0);
    expect(catalogs.QUICK_FILTERS_DEMO_PROFILES.length).toBeGreaterThan(0);
    expect(catalogs.LIVE_DEMO_PROFILES.length).toBeGreaterThan(0);
    expect(catalogs.ALERTS_DEMO_PROFILES.length).toBeGreaterThan(0);
    expect(catalogs.SMART_EDIT_DEMO_PROFILES.length).toBeGreaterThan(0);
    expect(catalogs.BULK_UPDATE_DEMO_PROFILES.length).toBeGreaterThan(0);
    expect(catalogs.PLUS_MINUS_DEMO_PROFILES.length).toBeGreaterThan(0);
    expect(catalogs.SHORTCUTS_DEMO_PROFILES.length).toBeGreaterThan(0);
    expect(catalogs.EDITING_DEMO_PROFILES.length).toBeGreaterThan(0);
    expect(catalogs.VISUAL_EXCEL_DEMO_PROFILES.length).toBeGreaterThan(0);
  });

  it('each catalog profile has id, name, blurb, and seed', () => {
    for (const entry of catalogs.OVERVIEW_DEMO_PROFILES) {
      expect(entry.id).toBeTruthy();
      expect(entry.name).toBeTruthy();
      expect(entry.blurb).toBeTruthy();
      expect(entry.seed).toBeDefined();
    }
  });
});

describe('labProfileKit', () => {
  it('serializes tab seeds into module state', () => {
    const entry = OVERVIEW_DEMO_PROFILES[0];
    const state = serializeTabSeed(entry.seed);
    expect(Object.keys(state).length).toBeGreaterThan(0);
    expect(state['conditional-styling']?.v).toBe(1);
  });

  it('builds demo bundle with default profile', () => {
    const bundle = buildLabDemoBundle(
      OVERVIEW_GRID_ID,
      OVERVIEW_DEMO_PROFILES.slice(0, 2),
      OVERVIEW_DEMO_PROFILES[0].id,
    );
    expect(bundle.gridId).toBe(OVERVIEW_GRID_ID);
    expect(bundle.profiles.length).toBe(3);
    expect(bundle.activeProfileId).toBe(OVERVIEW_DEMO_PROFILES[0].id);
  });

  it('exports gc-profile payloads', () => {
    const payload = toExportedProfilePayload(OVERVIEW_DEMO_PROFILES[0], OVERVIEW_GRID_ID);
    expect(payload.kind).toBe('gc-profile');
    expect(payload.profile.gridId).toBe(OVERVIEW_GRID_ID);
  });

  it('exports alert profiles with alerts grid id', () => {
    const payload = alertExport(ALERTS_DEMO_PROFILES[0]);
    expect(payload.profile.gridId).toBe(ALERTS_GRID_ID);
  });
});

describe('presets', () => {
  it('builds column defs for every preset', () => {
    for (const preset of PRESETS) {
      const cols = preset.buildColumns();
      expect(cols.length).toBeGreaterThan(0);
      expect(preset.id).toBeTruthy();
      expect(preset.name).toBeTruthy();
    }
  });

  it('exercises formatters and class rules on column defs', () => {
    for (const preset of PRESETS) {
      const cols = preset.buildColumns();
      for (const col of cols) {
        const def = col as Record<string, unknown>;
        if (typeof def.valueFormatter === 'function') {
          const fmt = def.valueFormatter as (p: { value: unknown }) => string;
          expect(fmt({ value: 1234.56 })).toBeTruthy();
          fmt({ value: null });
          fmt({ value: undefined });
        }
        if (def.cellClassRules && typeof def.cellClassRules === 'object') {
          const rules = def.cellClassRules as Record<string, (p: { value: unknown }) => boolean>;
          for (const rule of Object.values(rules)) {
            expect(rule({ value: -1 })).toBeTypeOf('boolean');
            expect(rule({ value: 1 })).toBeTypeOf('boolean');
            expect(rule({ value: 0 })).toBeTypeOf('boolean');
          }
        }
        if (typeof def.valueGetter === 'function') {
          const getter = def.valueGetter as (p: { data?: Record<string, unknown> }) => unknown;
          getter({ data: { bidPrice: 100, askPrice: 101 } });
          getter({ data: undefined });
        }
      }
    }
  });
});
