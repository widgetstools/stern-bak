import { describe, expect, it } from 'vitest';
import { MARKET_ICON_SVGS } from './allIcons.js';
import {
  ICON_CATEGORIES,
  ICON_CATEGORY_NAMES,
  ICON_META,
  ICON_NAMES,
  getIconsByCategory,
  type IconCategory,
} from './meta.js';

/**
 * Generated-registry invariants — same spirit as
 * packages/design-system/icons-svg/index.test.ts. meta.ts is a curated
 * subset of MARKET_ICON_SVGS (dock system + blotter icons), so every
 * meta entry must resolve to a real SVG and there must be no orphans.
 */

describe('ICON_META / ICON_NAMES', () => {
  it('exposes a non-empty registry', () => {
    expect(ICON_NAMES.length).toBeGreaterThan(0);
  });

  it('ICON_NAMES matches the keys of ICON_META exactly', () => {
    expect([...ICON_NAMES].sort()).toEqual(Object.keys(ICON_META).sort());
  });

  it('every meta entry has an SVG in MARKET_ICON_SVGS', () => {
    const missing = ICON_NAMES.filter((n) => !(n in MARKET_ICON_SVGS));
    expect(missing).toEqual([]);
  });

  it('has no metadata for icons that do not exist', () => {
    const orphans = Object.keys(ICON_META).filter((n) => !(n in MARKET_ICON_SVGS));
    expect(orphans).toEqual([]);
  });

  it('assigns every icon a category drawn from ICON_CATEGORY_NAMES', () => {
    const bad = ICON_NAMES
      .map((n) => [n, ICON_META[n].category] as const)
      .filter(([, c]) => !ICON_CATEGORY_NAMES.includes(c as IconCategory));
    expect(bad).toEqual([]);
  });
});

describe('ICON_CATEGORIES', () => {
  it('has a bucket for every category name', () => {
    for (const c of ICON_CATEGORY_NAMES) {
      expect(Array.isArray(ICON_CATEGORIES[c]), c).toBe(true);
    }
  });

  it('groups each icon under the category its metadata declares', () => {
    for (const c of ICON_CATEGORY_NAMES) {
      const wrong = ICON_CATEGORIES[c].filter((n) => ICON_META[n].category !== c);
      expect(wrong, `icons mis-filed under ${c}`).toEqual([]);
    }
  });
});

describe('getIconsByCategory', () => {
  it('returns the icons for a known category', () => {
    expect(getIconsByCategory('system').length).toBeGreaterThan(0);
    expect(getIconsByCategory('blotters').length).toBeGreaterThan(0);
    expect(getIconsByCategory('trading')).toEqual([]);
  });

  it('returns an empty array for an unknown category rather than undefined', () => {
    expect(getIconsByCategory('not-a-category' as IconCategory)).toEqual([]);
  });
});
