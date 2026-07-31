import { afterEach, describe, expect, it } from 'vitest';
import {
  getPathAccessor,
  getPathSetter,
  __resetPathAccessorCaches,
} from '@wellsfargo-starui/types';
import { defaultNullSafeComparator, nestedField } from './nestedField';

afterEach(() => {
  __resetPathAccessorCaches();
});

// ─── Compiled accessor cache ──────────────────────────────────────────

describe('getPathAccessor', () => {
  it('reads single-segment paths', () => {
    const get = getPathAccessor('price');
    expect(get({ price: 42 })).toBe(42);
  });

  it('reads nested paths via dot-walk', () => {
    const get = getPathAccessor('trade.price.last');
    expect(get({ trade: { price: { last: 105.5 } } })).toBe(105.5);
  });

  it('honours literal-flat-key priority on the root', () => {
    const get = getPathAccessor('weird.key');
    expect(get({ 'weird.key': 1, weird: { key: 2 } })).toBe(1);
  });

  it('does NOT honour literal-flat-key priority on nested segments', () => {
    // The literal-flat-key rule applies to the ROOT only. A row like
    // `{ trade: { "price.last": 1, price: { last: 2 } } }` resolves
    // to 2 (dot-walks past the nested literal). Documented in
    // dataProvider.ts and design doc.
    const get = getPathAccessor('trade.price.last');
    const row = { trade: { 'price.last': 1, price: { last: 2 } } };
    expect(get(row)).toBe(2);
  });

  it('returns undefined for missing intermediate', () => {
    const get = getPathAccessor('trade.price.last');
    expect(get({ trade: null })).toBeUndefined();
    expect(get({ trade: { price: undefined } })).toBeUndefined();
    expect(get({})).toBeUndefined();
  });

  it('returns undefined for non-object root', () => {
    const get = getPathAccessor('a.b');
    expect(get(null)).toBeUndefined();
    expect(get(undefined)).toBeUndefined();
    expect(get(42)).toBeUndefined();
    expect(get('string')).toBeUndefined();
  });

  it('returns stable closure identity for the same path', () => {
    const a = getPathAccessor('trade.price.last');
    const b = getPathAccessor('trade.price.last');
    expect(a).toBe(b);
  });

  it('returns distinct closures for different paths', () => {
    expect(getPathAccessor('a')).not.toBe(getPathAccessor('a.b'));
    expect(getPathAccessor('a.b')).not.toBe(getPathAccessor('b.a'));
  });
});

// ─── Compiled setter cache ────────────────────────────────────────────

describe('getPathSetter', () => {
  it('writes single-segment paths', () => {
    const set = getPathSetter('price');
    const row: Record<string, unknown> = { price: 100 };
    expect(set(row, 105)).toBe(true);
    expect(row.price).toBe(105);
  });

  it('returns false for no-op writes', () => {
    const set = getPathSetter('price');
    const row = { price: 100 };
    expect(set(row, 100)).toBe(false);
  });

  it('writes nested paths through existing intermediates', () => {
    const set = getPathSetter('trade.price.last');
    const row: Record<string, unknown> = {
      trade: { price: { last: 100 } },
    };
    expect(set(row, 105)).toBe(true);
    expect((row.trade as { price: { last: number } }).price.last).toBe(105);
  });

  it('creates intermediate objects on write into a sparse row', () => {
    const set = getPathSetter('trade.price.last');
    const row: Record<string, unknown> = {};
    expect(set(row, 42)).toBe(true);
    expect(row).toEqual({ trade: { price: { last: 42 } } });
  });

  it('replaces non-object intermediates with new objects', () => {
    const set = getPathSetter('trade.price.last');
    const row: Record<string, unknown> = { trade: null };
    expect(set(row, 7)).toBe(true);
    expect(row).toEqual({ trade: { price: { last: 7 } } });
  });

  it('returns false for non-object roots', () => {
    const set = getPathSetter('a.b');
    expect(set(null, 1)).toBe(false);
    expect(set(undefined, 1)).toBe(false);
  });

  it('uses Object.is semantics (NaN === NaN counts as no-op)', () => {
    const set = getPathSetter('value');
    const row = { value: Number.NaN };
    expect(set(row, Number.NaN)).toBe(false);
  });

  it('returns stable closure identity for the same path', () => {
    expect(getPathSetter('a.b')).toBe(getPathSetter('a.b'));
  });
});

// ─── nestedField factory ──────────────────────────────────────────────

describe('nestedField', () => {
  it('returns a partial ColDef with field, colId, and accessors', () => {
    const col = nestedField({ path: 'trade.price.last' });
    expect(col.field).toBe('trade.price.last');
    expect(col.colId).toBe('trade.price.last');
    expect(typeof col.valueGetter).toBe('function');
    expect(typeof col.valueSetter).toBe('function');
  });

  it('valueGetter reads through the compiled accessor', () => {
    const col = nestedField({ path: 'trade.price.last' });
    const params = { data: { trade: { price: { last: 99.5 } } } } as never;
    expect((col.valueGetter as (p: typeof params) => unknown)(params)).toBe(99.5);
  });

  it('valueGetter handles missing intermediates without throwing', () => {
    const col = nestedField({ path: 'trade.price.last' });
    const params = { data: { trade: null } } as never;
    expect((col.valueGetter as (p: typeof params) => unknown)(params)).toBeUndefined();
  });

  it('valueSetter writes through the compiled setter and creates intermediates', () => {
    const col = nestedField({ path: 'trade.price.last' });
    const row: Record<string, unknown> = {};
    const params = { data: row, newValue: 12 } as never;
    expect((col.valueSetter as (p: typeof params) => boolean)(params)).toBe(true);
    expect(row).toEqual({ trade: { price: { last: 12 } } });
  });

  it('omits valueSetter when writable: false', () => {
    const col = nestedField({ path: 'trade.price.last', writable: false });
    expect(col.valueSetter).toBeUndefined();
  });

  it('allows overriding colId for state-stability migrations', () => {
    const col = nestedField({ path: 'trade.price.last', colId: 'lastPrice' });
    expect(col.field).toBe('trade.price.last');
    expect(col.colId).toBe('lastPrice');
  });

  it('falls back to defaultNullSafeComparator when none supplied', () => {
    const col = nestedField({ path: 'price' });
    expect(col.comparator).toBe(defaultNullSafeComparator);
  });

  it('uses provided comparator when supplied', () => {
    const customComparator = (a: unknown, b: unknown): number =>
      Number(a) - Number(b);
    const col = nestedField({ path: 'price', comparator: customComparator });
    expect(col.comparator).toBe(customComparator);
  });

  it('headerTooltip is the raw path so power-users can see the source', () => {
    const col = nestedField({ path: 'trade.price.last' });
    expect(col.headerTooltip).toBe('trade.price.last');
  });

  it('tooltipValueGetter stringifies the value safely (null → empty)', () => {
    const col = nestedField({ path: 'trade.price.last' });
    const present = { data: { trade: { price: { last: 100 } } } } as never;
    const absent = { data: { trade: null } } as never;
    const getter = col.tooltipValueGetter as (p: typeof present) => string;
    expect(getter(present)).toBe('100');
    expect(getter(absent)).toBe('');
  });
});

// ─── defaultNullSafeComparator ────────────────────────────────────────

describe('defaultNullSafeComparator', () => {
  it('compares numbers numerically', () => {
    expect(defaultNullSafeComparator(1, 2)).toBeLessThan(0);
    expect(defaultNullSafeComparator(2, 1)).toBeGreaterThan(0);
    expect(defaultNullSafeComparator(5, 5)).toBe(0);
  });

  it('compares strings via localeCompare (case-insensitive)', () => {
    expect(defaultNullSafeComparator('apple', 'Banana')).toBeLessThan(0);
    expect(defaultNullSafeComparator('Banana', 'apple')).toBeGreaterThan(0);
  });

  it('sorts null and undefined LAST in ascending order', () => {
    expect(defaultNullSafeComparator(null, 5)).toBeGreaterThan(0);
    expect(defaultNullSafeComparator(5, null)).toBeLessThan(0);
    expect(defaultNullSafeComparator(undefined, 5)).toBeGreaterThan(0);
    expect(defaultNullSafeComparator(null, null)).toBe(0);
    expect(defaultNullSafeComparator(null, undefined)).toBe(0);
  });
});
