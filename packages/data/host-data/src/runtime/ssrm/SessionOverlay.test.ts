/**
 * The per-session query layer.
 *
 * Four roadmap findings were the same missing thing: the plane had sessions
 * for enrichment (after paging) and none for the query itself. These cases pin
 * the two properties that make adding one safe — a clean session still shares
 * the cache, and a session's private state never reaches another session — and
 * the one that makes it correct: the source wins.
 */
import { describe, expect, it } from 'vitest';
import { QueryEngine } from './QueryEngine.js';
import { RowStore } from './RowStore.js';
import { SessionOverlay } from './SessionOverlay.js';
import type { Row } from './types.js';

const KEY = 'id';

function makeEngine(rows: Row[]) {
  const store = new RowStore({ keyColumn: KEY });
  store.replaceSnapshot(rows);
  return { store, engine: new QueryEngine({ store }) };
}

const baseReq = {
  startRow: 0,
  endRow: 100,
  filterModel: {},
  sortModel: [],
  groupKeys: [],
  rowGroupCols: [],
  valueCols: [],
  pivotCols: [],
  pivotMode: false,
} as const;

const SEED: Row[] = [
  { id: 'A', book: 'ALPHA', px: 10, note: 'a' },
  { id: 'B', book: 'BETA', px: 20, note: 'b' },
  { id: 'C', book: 'ALPHA', px: 30, note: 'c' },
];

const ids = (r: { rowData: Row[] }) => r.rowData.map((x) => x[KEY]);

describe('session patches', () => {
  it('shows an edit to the session that made it, and only that session', () => {
    const { engine } = makeEngine(SEED);
    engine.setSessionPatches('s1', [{ key: 'B', fields: { px: 999 } }]);

    const mine = engine.getRows({ ...baseReq }, 's1');
    expect(mine.rowData.find((r) => r.id === 'B')?.px).toBe(999);

    const theirs = engine.getRows({ ...baseReq }, 's2');
    expect(theirs.rowData.find((r) => r.id === 'B')?.px).toBe(20);

    // …and the shared store is untouched: an edit written into it would show
    // up in every window attached to the provider.
    const anonymous = engine.getRows({ ...baseReq });
    expect(anonymous.rowData.find((r) => r.id === 'B')?.px).toBe(20);
  });

  // The point of the whole layer: an edited value has to be visible to the
  // FILTER, not merely painted after paging, or the row is counted in a set it
  // no longer belongs to.
  it('filters on the edited value, not the stored one', () => {
    const { engine } = makeEngine(SEED);
    const filterModel = {
      px: { filterType: 'number', type: 'greaterThan', filter: 25 },
    };
    expect(ids(engine.getRows({ ...baseReq, filterModel }, 's1'))).toEqual(['C']);

    engine.setSessionPatches('s1', [{ key: 'A', fields: { px: 100 } }]);
    expect(ids(engine.getRows({ ...baseReq, filterModel }, 's1'))).toEqual(['A', 'C']);
    // Another session still sees the unedited world.
    expect(ids(engine.getRows({ ...baseReq, filterModel }, 's2'))).toEqual(['C']);
  });

  it('sorts on the edited value', () => {
    const { engine } = makeEngine(SEED);
    const sortModel = [{ colId: 'px', sort: 'asc' }];
    expect(ids(engine.getRows({ ...baseReq, sortModel }, 's1'))).toEqual(['A', 'B', 'C']);

    engine.setSessionPatches('s1', [{ key: 'A', fields: { px: 999 } }]);
    expect(ids(engine.getRows({ ...baseReq, sortModel }, 's1'))).toEqual(['B', 'C', 'A']);
  });

  it('merges successive edits to different fields of one row', () => {
    const { engine } = makeEngine(SEED);
    engine.setSessionPatches('s1', [{ key: 'A', fields: { px: 111 } }]);
    engine.setSessionPatches('s1', [{ key: 'A', fields: { note: 'edited' } }]);
    const row = engine.getRows({ ...baseReq }, 's1').rowData.find((r) => r.id === 'A');
    expect(row).toMatchObject({ px: 111, note: 'edited' });
  });

  it('re-matches the quick filter against the edited value', () => {
    const { engine } = makeEngine(SEED);
    // 'zulu' is in no stored row, so the store's cached aggregate cannot
    // contain it — the patched row's text has to be rebuilt, not prefiltered
    // through a stale cache.
    expect(ids(engine.getRows({ ...baseReq, quickFilterText: 'zulu' }, 's1'))).toEqual([]);
    engine.setSessionPatches('s1', [{ key: 'C', fields: { note: 'zulu' } }]);
    expect(ids(engine.getRows({ ...baseReq, quickFilterText: 'zulu' }, 's1'))).toEqual(['C']);
  });
});

describe('source wins', () => {
  it('drops a patched field the source re-delivers', () => {
    const { store, engine } = makeEngine(SEED);
    engine.setSessionPatches('s1', [{ key: 'B', fields: { px: 999 } }]);
    expect(engine.getRows({ ...baseReq }, 's1').rowData.find((r) => r.id === 'B')?.px).toBe(999);

    store.upsert([{ id: 'B', book: 'BETA', px: 22, note: 'b' }]);
    expect(engine.getRows({ ...baseReq }, 's1').rowData.find((r) => r.id === 'B')?.px).toBe(22);
  });

  // Per FIELD, not per row — a tick that moves `px` must not silently discard
  // a pending edit to a column it never mentioned.
  it('keeps a patched field the source did not mention', () => {
    const { store, engine } = makeEngine(SEED);
    engine.setSessionPatches('s1', [{ key: 'B', fields: { note: 'mine' } }]);
    store.upsert([{ id: 'B', px: 22 }]);

    const row = engine.getRows({ ...baseReq }, 's1').rowData.find((r) => r.id === 'B');
    expect(row?.note).toBe('mine');
    expect(row?.px).toBe(22);
  });

  it('a snapshot clears every pending edit', () => {
    const { store, engine } = makeEngine(SEED);
    engine.setSessionPatches('s1', [{ key: 'B', fields: { px: 999 } }]);
    store.replaceSnapshot(SEED);
    expect(engine.getRows({ ...baseReq }, 's1').rowData.find((r) => r.id === 'B')?.px).toBe(20);
  });

  it('forgets a session entirely on detach', () => {
    const { engine } = makeEngine(SEED);
    engine.setSessionPatches('s1', [{ key: 'B', fields: { px: 999 } }]);
    engine.clearSessionExpressions('s1');
    expect(engine.getRows({ ...baseReq }, 's1').rowData.find((r) => r.id === 'B')?.px).toBe(20);
  });
});

describe('session row exclusion', () => {
  it('removes rows from the session’s own paging and counts', () => {
    const { engine } = makeEngine(SEED);
    engine.setSessionExclude('s1', '[book] == "ALPHA"');

    const mine = engine.getRows({ ...baseReq }, 's1');
    expect(ids(mine)).toEqual(['B']);
    // The count is what the scrollbar is built from — hiding rows after
    // paging (the client-side external filter) left it wrong.
    expect(mine.rowCount).toBe(1);

    expect(engine.getRows({ ...baseReq }, 's2').rowCount).toBe(3);
  });

  it('excludes before aggregation, so totals agree with the rows shown', () => {
    const { engine } = makeEngine(SEED);
    const req = {
      ...baseReq,
      rowGroupCols: [],
      valueCols: [{ field: 'px', aggFunc: 'sum' }],
    };
    expect(engine.getRows(req, 's2').grandTotalData?.px).toBe(60);

    engine.setSessionExclude('s1', '[book] == "ALPHA"');
    expect(engine.getRows(req, 's1').grandTotalData?.px).toBe(20);
  });

  it('an expression that will not parse excludes nothing rather than emptying the grid', () => {
    const { engine } = makeEngine(SEED);
    engine.setSessionExclude('s1', '[book] ==== ');
    expect(engine.getRows({ ...baseReq }, 's1').rowCount).toBe(3);
  });

  // The compiler answers `null` for an unusable rule, which is not the same as
  // a predicate that always returns false: `null` drops the overlay entirely,
  // so the session goes back to sharing the plane's cache rather than holding
  // a private key for a rule that can never exclude anything.
  it('an unusable rule leaves the session on the shared cache entry', () => {
    const { engine } = makeEngine(SEED);
    const sortModel = [{ colId: 'px', sort: 'desc' }] as const;
    engine.getRows({ ...baseReq, sortModel: [...sortModel] }, 's1');

    engine.setSessionExclude('s2', '[book] ==== ');
    const before = engine.getMemoStats();
    engine.getRows({ ...baseReq, sortModel: [...sortModel] }, 's2');
    expect(engine.getMemoStats().memoMisses).toBe(before.memoMisses);
  });

  it('clearing the predicate restores the shared view', () => {
    const { engine } = makeEngine(SEED);
    engine.setSessionExclude('s1', '[book] == "ALPHA"');
    expect(engine.getRows({ ...baseReq }, 's1').rowCount).toBe(1);
    engine.setSessionExclude('s1', null);
    expect(engine.getRows({ ...baseReq }, 's1').rowCount).toBe(3);
  });
});

describe('the sharing model is preserved', () => {
  // The constraint that makes this layer acceptable: a grid that is neither
  // editing nor excluding — almost all of them — must not fork the cache.
  it('sessions with no overlay share one cache entry', () => {
    const { engine } = makeEngine(SEED);
    const sortModel = [{ colId: 'px', sort: 'desc' }];

    engine.getRows({ ...baseReq, sortModel }, 's1');
    const afterFirst = engine.getMemoStats();
    engine.getRows({ ...baseReq, sortModel }, 's2');
    const afterSecond = engine.getMemoStats();

    // The second session's identical query is a HIT, not a second build.
    expect(afterSecond.memoHits).toBeGreaterThan(afterFirst.memoHits);
    expect(afterSecond.memoMisses).toBe(afterFirst.memoMisses);
  });

  it('only the session with an overlay forks, and it rejoins when cleared', () => {
    const { engine } = makeEngine(SEED);
    const sortModel = [{ colId: 'px', sort: 'desc' }];
    engine.getRows({ ...baseReq, sortModel }, 's1');

    engine.setSessionExclude('s2', '[book] == "ALPHA"');
    const before = engine.getMemoStats();
    engine.getRows({ ...baseReq, sortModel }, 's2');
    expect(engine.getMemoStats().memoMisses).toBeGreaterThan(before.memoMisses);

    // Clearing returns it to the shared entry rather than leaving a private key.
    engine.setSessionExclude('s2', null);
    const rejoined = engine.getMemoStats();
    engine.getRows({ ...baseReq, sortModel }, 's2');
    expect(engine.getMemoStats().memoHits).toBeGreaterThan(rejoined.memoHits);
  });
});

/**
 * `QueryEngine` now compiles the rule from an expression, so the tests above
 * exercise the reachable path. The predicate is still `SessionOverlay`'s
 * primitive, and its fail-open rule is the last thing standing between a
 * throwing evaluation and an empty grid — so it is pinned here directly rather
 * than through a compiler that catches first.
 */
describe('SessionOverlay predicate primitive', () => {
  it('a predicate that throws excludes nothing', () => {
    const overlay = new SessionOverlay(KEY);
    overlay.setExclude('s1', () => {
      throw new Error('boom');
    });
    expect(overlay.stateFor('s1')!.excluded({ id: 'A' })).toBe(false);
  });

  it('a predicate returning a truthy non-boolean does NOT exclude', () => {
    const overlay = new SessionOverlay(KEY);
    // `=== true` on purpose: a rule that answers `'yes'` is a rule that did
    // not answer, and hiding rows on it would be guessing.
    overlay.setExclude('s1', (() => 'yes') as unknown as (row: Row) => boolean);
    expect(overlay.stateFor('s1')!.excluded({ id: 'A' })).toBe(false);
  });
});
