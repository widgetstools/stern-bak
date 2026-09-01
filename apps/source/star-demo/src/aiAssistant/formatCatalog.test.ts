import { describe, expect, it } from 'vitest';
// Reaches the grid package's source directly: this catalogue is internal to
// the FormatterPicker UI and has no public subpath. A test may reach for it;
// `formatCatalog.ts` itself deliberately must not (it would drag the picker's
// React tree into a window with no grid).
import { ALL_PRESETS } from '../../../../../packages/react-grid/grid/src/customizer/ui/FormatterPicker/presetsForDataType';
import {
  FORMAT_PRESETS,
  FORMAT_PRESET_IDS,
  findFormatPreset,
  buildFormatCatalogGuide,
} from './formatCatalog';

/**
 * `formatCatalog.ts` mirrors the formatter picker's catalogue rather than
 * importing it — the real one lives in the grid package's UI layer. This keeps
 * the copy honest: a format the toolbar offers but the model has never heard
 * of is a format the user can only get by hand.
 */
describe('catalogue parity with the formatter picker', () => {
  it('lists exactly the same preset ids', () => {
    expect([...FORMAT_PRESET_IDS].sort()).toEqual(ALL_PRESETS.map((p) => p.id).sort());
  });

  it('agrees on every label, category and template', () => {
    for (const real of ALL_PRESETS) {
      const mirrored = findFormatPreset(real.id);
      expect(mirrored, real.id).toBeDefined();
      expect(mirrored!.label, real.id).toBe(real.label);
      expect(mirrored!.category, real.id).toBe(real.category);
      expect(mirrored!.template, real.id).toEqual(real.template);
    }
  });

  it('has no duplicate ids', () => {
    expect(new Set(FORMAT_PRESET_IDS).size).toBe(FORMAT_PRESET_IDS.length);
  });
});

describe('buildFormatCatalogGuide', () => {
  const guide = buildFormatCatalogGuide();

  it('names every preset, so none is undiscoverable', () => {
    for (const id of FORMAT_PRESET_IDS) {
      expect(guide.includes(`\`${id}\``), `guide never mentions "${id}"`).toBe(true);
    }
  });

  /** The formats the user specifically asked to be reachable. */
  it('covers negative/P&L, currency and tick pricing', () => {
    expect(guide).toContain('num-neg-red-parens');
    expect(guide).toContain('cur-usd-green-red-nosign');
    expect(guide).toContain('tick-32');
  });

  /** Without the grammar the model can read a format but not adapt one. */
  it('explains the Excel format-string grammar it depends on', () => {
    expect(guide).toContain('positive;negative;zero;text');
    expect(guide).toContain('[Red]');
    expect(guide.toLowerCase()).toContain('trailing comma');
  });

  /**
   * `expression` templates run through `new Function`, so under a strict
   * expression policy they silently degrade to an identity formatter — the
   * model should prefer the CSP-safe kinds and know why.
   */
  it('warns that expression templates are not CSP-safe', () => {
    expect(guide).toContain('CSP-safe');
  });
});
