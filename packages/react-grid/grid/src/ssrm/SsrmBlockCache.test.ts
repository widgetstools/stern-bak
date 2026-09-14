import { describe, expect, it } from 'vitest';
import { SsrmBlockCache, ssrmViewKey } from './SsrmBlockCache.js';

const idOf = (row: Record<string, unknown>) => (row.id == null ? undefined : String(row.id));
const block = (ids: string[], rowCount = 100) => ({
  rowData: ids.map((id) => ({ id, px: 1 })),
  rowCount,
});

describe('ssrmViewKey', () => {
  it('ignores the row window and filter key order', () => {
    const a = ssrmViewKey({ startRow: 0, endRow: 200, filterModel: { a: 1, b: 2 }, sortModel: [{ colId: 'x', sort: 'asc' }] });
    const b = ssrmViewKey({ startRow: 400, endRow: 600, filterModel: { b: 2, a: 1 }, sortModel: [{ colId: 'x', sort: 'asc' }] });
    expect(a).toBe(b);
  });

  it('changes with sort, quick filter, group path, value and pivot columns', () => {
    const base = ssrmViewKey({});
    expect(ssrmViewKey({ sortModel: [{ colId: 'x', sort: 'desc' }] })).not.toBe(base);
    expect(ssrmViewKey({ quickFilterText: 'gov' })).not.toBe(base);
    expect(ssrmViewKey({ rowGroupCols: [{ id: 'desk' }], groupKeys: ['A'] })).not.toBe(base);
    expect(ssrmViewKey({ valueCols: [{ id: 'px', aggFunc: 'avg' }] })).not.toBe(base);
    expect(ssrmViewKey({ pivotMode: true, pivotCols: [{ id: 'ccy' }] })).not.toBe(base);
    expect(ssrmViewKey({ pivotMode: false, pivotCols: [{ id: 'ccy' }] })).toBe(base);
  });
});

describe('SsrmBlockCache', () => {
  it('stores and serves blocks by view and start', () => {
    const cache = new SsrmBlockCache();
    cache.set('v', 0, block(['a', 'b']), idOf);
    expect(cache.has('v', 0)).toBe(true);
    expect(cache.has('v', 200)).toBe(false);
    expect(cache.has('other', 0)).toBe(false);
    expect(cache.get('v', 0)?.rowData).toEqual([{ id: 'a', px: 1 }, { id: 'b', px: 1 }]);
  });

  it('patches cached rows by id and reports how many copies it touched', () => {
    const cache = new SsrmBlockCache();
    cache.set('v', 0, block(['a', 'b']), idOf);
    cache.set('w', 0, block(['b', 'c']), idOf);
    expect(cache.patchRows([{ id: 'b', px: 9 }, { id: 'zz', px: 0 }], idOf)).toBe(2);
    expect(cache.get('v', 0)?.rowData[1]).toEqual({ id: 'b', px: 9 });
    expect(cache.get('w', 0)?.rowData[0]).toEqual({ id: 'b', px: 9 });
  });

  it('expires blocks past the ttl and evicts least recently used past the cap', () => {
    let now = 0;
    const cache = new SsrmBlockCache({ maxBlocks: 2, ttlMs: 100, now: () => now });
    cache.set('v', 0, block(['a']), idOf);
    cache.set('v', 200, block(['b']), idOf);
    cache.get('v', 0); // touch → 200 is now least recent
    cache.set('v', 400, block(['c']), idOf);
    expect(cache.has('v', 200)).toBe(false);
    expect(cache.has('v', 0)).toBe(true);
    expect(cache.size).toBe(2);
    now = 101;
    expect(cache.has('v', 0)).toBe(false);
    expect(cache.patchRows([{ id: 'a', px: 2 }], idOf)).toBe(0);
  });

  it('clears everything, including the row index', () => {
    const cache = new SsrmBlockCache();
    cache.set('v', 0, block(['a']), idOf);
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.patchRows([{ id: 'a', px: 2 }], idOf)).toBe(0);
  });
});
