import { describe, expect, it } from 'vitest';
import {
  ICON_CATEGORIES, ICON_CATEGORY_NAMES, ICON_META, ICON_NAMES, ICON_PATHS,
  getIconsByCategory, type IconCategory,
} from './index.js';

/**
 * This barrel is generated from `svg/`, so the tests target its invariants —
 * the registry, metadata and categories staying in agreement — rather than any
 * specific icon, which would churn on every regeneration.
 */

describe('ICON_PATHS / ICON_NAMES', () => {
  it('exposes a non-empty registry', () => {
    expect(ICON_NAMES.length).toBeGreaterThan(0);
  });

  it('ICON_NAMES matches the keys of ICON_PATHS exactly', () => {
    expect([...ICON_NAMES].sort()).toEqual(Object.keys(ICON_PATHS).sort());
  });

  it('every path is a non-empty string', () => {
    for (const name of ICON_NAMES) {
      expect(typeof ICON_PATHS[name], name).toBe('string');
      expect(ICON_PATHS[name].length, name).toBeGreaterThan(0);
    }
  });
});

describe('ICON_META', () => {
  it('has an entry for every icon', () => {
    const missing = ICON_NAMES.filter((n) => !ICON_META[n]);
    expect(missing).toEqual([]);
  });

  it('has no metadata for icons that do not exist', () => {
    const orphans = Object.keys(ICON_META).filter((n) => !(n in ICON_PATHS));
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
    for (const c of ICON_CATEGORY_NAMES) expect(Array.isArray(ICON_CATEGORIES[c]), c).toBe(true);
  });

  it('partitions the icon set — every icon appears exactly once', () => {
    const flat = ICON_CATEGORY_NAMES.flatMap((c) => ICON_CATEGORIES[c]);
    expect(flat.sort()).toEqual([...ICON_NAMES].sort());
    expect(new Set(flat).size).toBe(flat.length);
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
    for (const c of ICON_CATEGORY_NAMES) {
      expect(getIconsByCategory(c)).toEqual(ICON_CATEGORIES[c]);
    }
  });

  it('returns an empty array for an unknown category rather than undefined', () => {
    expect(getIconsByCategory('not-a-category' as IconCategory)).toEqual([]);
  });
});
