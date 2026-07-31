import { describe, expect, it } from 'vitest';
import { CATEGORY_LABELS, categoriesForDataType, type FormatCategory } from './formatCategories';

describe('categoriesForDataType', () => {
  it('returns the numeric family for number columns', () => {
    expect(categoriesForDataType('number')).toEqual([
      'number',
      'negatives',
      'conditional',
      'tick',
      'percent',
    ]);
  });

  it('returns currency-centric categories for currency columns', () => {
    expect(categoriesForDataType('currency')).toEqual(['currency', 'negatives', 'conditional']);
  });

  it('returns percent then number for percent columns', () => {
    expect(categoriesForDataType('percent')).toEqual(['percent', 'number']);
  });

  it('returns only date for date and datetime columns', () => {
    expect(categoriesForDataType('date')).toEqual(['date']);
    expect(categoriesForDataType('datetime')).toEqual(['date']);
  });

  it('returns text for string columns', () => {
    expect(categoriesForDataType('string')).toEqual(['text']);
  });

  it('returns boolean then text for boolean columns', () => {
    expect(categoriesForDataType('boolean')).toEqual(['boolean', 'text']);
  });

  it('never includes a "custom" pseudo-category (the UI appends that tab itself)', () => {
    for (const dt of ['number', 'currency', 'percent', 'date', 'datetime', 'string', 'boolean'] as const) {
      expect(categoriesForDataType(dt)).not.toContain('custom' as FormatCategory);
    }
  });

  it('has a human label for every category it can return', () => {
    const all = new Set<FormatCategory>();
    for (const dt of ['number', 'currency', 'percent', 'date', 'datetime', 'string', 'boolean'] as const) {
      for (const c of categoriesForDataType(dt)) all.add(c);
    }
    for (const c of all) {
      expect(CATEGORY_LABELS[c]).toBeTruthy();
    }
  });
});
