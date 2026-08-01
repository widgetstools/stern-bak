import { describe, expect, it } from 'vitest';
import { nestedField, defaultNullSafeComparator } from './nestedField';

describe('defaultNullSafeComparator', () => {
  it('sorts nulls last and compares numbers numerically', () => {
    expect(defaultNullSafeComparator(null, 1)).toBe(1);
    expect(defaultNullSafeComparator(2, 10)).toBe(-8);
  });

  it('compares strings case-insensitively', () => {
    expect(defaultNullSafeComparator('b', 'A')).toBeGreaterThan(0);
  });
});

describe('nestedField', () => {
  it('wires getter, setter, comparator, and stable colId from path', () => {
    const partial = nestedField({ path: 'trade.price.last' });
    expect(partial.colId).toBe('trade.price.last');
    expect(partial.field).toBe('trade.price.last');

    const row = { trade: { price: { last: 42 } } };
    expect(partial.valueGetter?.({ data: row } as never)).toBe(42);
    expect(partial.valueSetter?.({ data: row, newValue: 50 } as never)).toBe(true);
    expect(row.trade.price.last).toBe(50);
    expect(partial.tooltipValueGetter?.({ data: row } as never)).toBe('50');
  });

  it('honours colId override and read-only mode', () => {
    const readOnly = nestedField({ path: 'a.b', colId: 'legacy-id', writable: false });
    expect(readOnly.colId).toBe('legacy-id');
    expect(readOnly.valueSetter).toBeUndefined();
  });
});
