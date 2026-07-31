import { describe, expect, it } from 'vitest';
import {
  buildInitialState,
  computeColumnState,
  filterItems,
  moveToAvailable,
  moveToVisible,
  reorderVisible,
  type ColumnDescriptor,
  type ColumnSelectorState,
} from './columnSelectorModel';

function desc(
  colId: string,
  opts: { hidden?: boolean; locked?: boolean; headerName?: string } = {},
): ColumnDescriptor {
  return {
    colId,
    headerName: opts.headerName ?? colId.toUpperCase(),
    hidden: opts.hidden ?? false,
    locked: opts.locked ?? false,
  };
}

const ids = (items: readonly { colId: string }[]) => items.map((c) => c.colId);

describe('buildInitialState', () => {
  it('splits hidden into available, shown into visible, preserving order', () => {
    const state = buildInitialState([
      desc('a'),
      desc('b', { hidden: true }),
      desc('c'),
      desc('d', { hidden: true }),
    ]);
    expect(ids(state.visible)).toEqual(['a', 'c']);
    expect(ids(state.available)).toEqual(['b', 'd']);
  });

  it('keeps locked columns visible even if hidden flag is set', () => {
    const state = buildInitialState([desc('a', { hidden: true, locked: true })]);
    expect(ids(state.visible)).toEqual(['a']);
    expect(state.available).toHaveLength(0);
  });
});

describe('moveToVisible', () => {
  it('appends moved columns to the end of visible in available order', () => {
    const start = buildInitialState([
      desc('a'),
      desc('b', { hidden: true }),
      desc('c', { hidden: true }),
    ]);
    const next = moveToVisible(start, ['c', 'b']);
    expect(ids(next.visible)).toEqual(['a', 'b', 'c']); // relative available order kept
    expect(next.available).toHaveLength(0);
  });

  it('ignores ids not in available and returns same ref when nothing moves', () => {
    const start = buildInitialState([desc('a'), desc('b', { hidden: true })]);
    expect(moveToVisible(start, ['zzz'])).toBe(start);
  });
});

describe('moveToAvailable', () => {
  it('moves shown columns to available, skipping locked', () => {
    const start = buildInitialState([
      desc('a'),
      desc('b', { locked: true }),
      desc('c'),
    ]);
    const next = moveToAvailable(start, ['a', 'b', 'c']);
    expect(ids(next.visible)).toEqual(['b']); // locked stays
    expect(ids(next.available)).toEqual(['a', 'c']);
  });

  it('no-ops when only locked ids are given', () => {
    const start = buildInitialState([desc('a', { locked: true })]);
    expect(moveToAvailable(start, ['a'])).toBe(start);
  });
});

describe('reorderVisible', () => {
  const base: ColumnSelectorState = buildInitialState([
    desc('a'),
    desc('b'),
    desc('c'),
    desc('d'),
  ]);

  it('moves a single item down (lands after target)', () => {
    const next = reorderVisible(base, ['a'], 'a', 'c');
    expect(ids(next.visible)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('moves a single item up (lands before target)', () => {
    const next = reorderVisible(base, ['d'], 'd', 'b');
    expect(ids(next.visible)).toEqual(['a', 'd', 'b', 'c']);
  });

  it('moves a multi-selection block together preserving relative order', () => {
    // dragging {a,c} downward onto d → block lands after d, order preserved
    const next = reorderVisible(base, ['a', 'c'], 'a', 'd');
    expect(ids(next.visible)).toEqual(['b', 'd', 'a', 'c']);
  });

  it('moves a multi-selection block upward (lands before target)', () => {
    const next = reorderVisible(base, ['b', 'd'], 'd', 'a');
    expect(ids(next.visible)).toEqual(['b', 'd', 'a', 'c']);
  });

  it('is a no-op when dropping onto a selected member', () => {
    expect(reorderVisible(base, ['a', 'b'], 'a', 'b')).toBe(base);
  });
});

describe('filterItems', () => {
  const items = buildInitialState([
    desc('price', { headerName: 'Price' }),
    desc('qty', { headerName: 'Quantity' }),
  ]).visible;

  it('matches on headerName and colId, case-insensitively', () => {
    expect(ids(filterItems(items, 'PRI'))).toEqual(['price']);
    expect(ids(filterItems(items, 'quan'))).toEqual(['qty']);
  });

  it('returns all items for blank query', () => {
    expect(filterItems(items, '   ')).toHaveLength(2);
  });
});

describe('computeColumnState', () => {
  it('orders visible (shown) first then available (hidden)', () => {
    const state = moveToAvailable(
      buildInitialState([desc('a'), desc('b'), desc('c')]),
      ['b'],
    );
    expect(computeColumnState(state)).toEqual([
      { colId: 'a', hide: false },
      { colId: 'c', hide: false },
      { colId: 'b', hide: true },
    ]);
  });
});
