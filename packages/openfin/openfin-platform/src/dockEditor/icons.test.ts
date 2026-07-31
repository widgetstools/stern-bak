import { describe, expect, it } from 'vitest';
import { DEFAULT_ICON, ICON_OPTIONS, findIconById, findIconByName } from './icons.js';

describe('ICON_OPTIONS', () => {
  it('is a non-empty list of name/icon pairs', () => {
    expect(ICON_OPTIONS.length).toBeGreaterThan(0);
    for (const opt of ICON_OPTIONS) {
      expect(opt.name.length).toBeGreaterThan(0);
      expect(opt.icon).toMatch(/^(mkt|lucide):/);
    }
  });

  it('DEFAULT_ICON is the first option', () => {
    expect(DEFAULT_ICON).toBe(ICON_OPTIONS[0]);
  });

  it('includes both market and lucide icons', () => {
    expect(ICON_OPTIONS.some((o) => o.icon.startsWith('mkt:'))).toBe(true);
    expect(ICON_OPTIONS.some((o) => o.icon.startsWith('lucide:'))).toBe(true);
  });
});

describe('findIconByName / findIconById', () => {
  it('finds by display name', () => {
    expect(findIconByName('Bond')?.icon).toBe('mkt:bond');
  });

  it('finds by icon id', () => {
    expect(findIconById('mkt:bond')?.name).toBe('Bond');
  });

  it('returns undefined for misses', () => {
    expect(findIconByName('not-real')).toBeUndefined();
    expect(findIconById('mkt:not-real')).toBeUndefined();
  });
});
