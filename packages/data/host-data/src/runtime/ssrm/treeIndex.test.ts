/**
 * Tree data, server-side — both index modes and the block path over them.
 *
 * "Tree data + master-detail server-side" is one of the roadmap's nine
 * confirmed-parity capabilities, and it had NO test in the tree: the builders
 * were refactored out of `QueryEngine.ts` in Phase 1 with nothing asserting
 * their behaviour. These cases pin what they did before the move, so the next
 * change to them is a decision rather than a discovery.
 */
import { describe, expect, it } from 'vitest';
import { QueryEngine } from './QueryEngine.js';
import { RowStore } from './RowStore.js';
import { buildTreeIndex, rowHasDetail, treeKeyField } from './treeIndex.js';
import type { Row, TreeDataConfig } from './types.js';

// A ── B ── D
//   └─ C
// E (root, no children)
const PARENT_ROWS: Row[] = [
  { id: 'A', name: 'alpha', parentId: null, px: 4 },
  { id: 'B', name: 'bravo', parentId: 'A', px: 3 },
  { id: 'C', name: 'charlie', parentId: 'A', px: 2 },
  { id: 'D', name: 'delta', parentId: 'B', px: 1 },
  { id: 'E', name: 'echo', parentId: '', px: 5 },
];

const PATH_ROWS: Row[] = [
  { id: 'A', orgHierarchy: ['Alpha'], px: 4 },
  { id: 'B', orgHierarchy: ['Alpha', 'Bravo'], px: 3 },
  { id: 'C', orgHierarchy: ['Alpha', 'Charlie'], px: 2 },
  { id: 'D', orgHierarchy: ['Alpha', 'Bravo', 'Delta'], px: 1 },
];

function store(rows: Row[]): RowStore {
  const s = new RowStore({ keyColumn: 'id' });
  s.replaceSnapshot(rows);
  return s;
}

const ids = (rows: Row[] | undefined) => (rows ?? []).map((r) => String(r.id)).sort();

describe('treeKeyField', () => {
  it('prefers the config field and falls back to the store key column', () => {
    const s = store(PARENT_ROWS);
    expect(treeKeyField({ enabled: true, mode: 'parent', keyField: 'name' }, s)).toBe('name');
    expect(treeKeyField({ enabled: true, mode: 'parent' }, s)).toBe('id');
    expect(treeKeyField(null, s)).toBe('id');
  });
});

describe('rowHasDetail', () => {
  it('is true for a non-empty array of objects, and for the explicit stamp', () => {
    expect(rowHasDetail({ id: 'A', trades: [{ qty: 1 }] })).toBe(true);
    expect(rowHasDetail({ id: 'A', __ssrmHasDetail: true })).toBe(true);
  });

  it('is false for scalars, empty arrays, arrays of scalars and internals only', () => {
    expect(rowHasDetail({ id: 'A', px: 1 })).toBe(false);
    expect(rowHasDetail({ id: 'A', trades: [] })).toBe(false);
    expect(rowHasDetail({ id: 'A', tags: ['x'] })).toBe(false);
    expect(rowHasDetail({ __private: [{ qty: 1 }] })).toBe(false);
  });
});

describe('buildTreeIndex — parent mode', () => {
  const config: TreeDataConfig = { enabled: true, mode: 'parent' };

  it('roots rows with no parent and nests the rest', () => {
    const index = buildTreeIndex(store(PARENT_ROWS), config, PARENT_ROWS, 'id');
    expect(ids(index.roots)).toEqual(['A', 'E']);
    expect(ids(index.childrenOf.get('A'))).toEqual(['B', 'C']);
    expect(ids(index.childrenOf.get('B'))).toEqual(['D']);
    expect(index.childrenOf.get('E')).toBeUndefined();
  });

  it('pulls ancestors in for a filtered-to child, so the expand path survives', () => {
    // Only D matched the filter. Without its ancestors it would be unreachable.
    const index = buildTreeIndex(store(PARENT_ROWS), config, [PARENT_ROWS[3]!], 'id');
    expect(ids(index.roots)).toEqual(['A']);
    expect(ids(index.childrenOf.get('A'))).toEqual(['B']);
    expect(ids(index.childrenOf.get('B'))).toEqual(['D']);
  });

  it('exposes ALL store children of a matched parent (expand-after-filter)', () => {
    // A matched; C did not. Expanding A must still show C.
    const index = buildTreeIndex(store(PARENT_ROWS), config, [PARENT_ROWS[0]!], 'id');
    expect(ids(index.childrenOf.get('A'))).toEqual(['B', 'C']);
  });

  it('surfaces a row whose parent is outside the filter as a root', () => {
    const orphan = store([PARENT_ROWS[1]!]); // B alone: parent A is not in the store
    const index = buildTreeIndex(orphan, config, [PARENT_ROWS[1]!], 'id');
    expect(ids(index.roots)).toEqual(['B']);
  });

  it('reads a custom parent field, and a nested one', () => {
    const rows: Row[] = [
      { id: 'A', link: { parent: null } },
      { id: 'B', link: { parent: 'A' } },
    ];
    const index = buildTreeIndex(
      store(rows),
      { enabled: true, mode: 'parent', parentField: 'link.parent' },
      rows,
      'id',
    );
    expect(ids(index.roots)).toEqual(['A']);
    expect(ids(index.childrenOf.get('A'))).toEqual(['B']);
  });

  it('stops walking a parent chain that leaves the store', () => {
    const rows: Row[] = [{ id: 'B', parentId: 'GONE' }];
    const index = buildTreeIndex(store(rows), config, rows, 'id');
    expect(ids(index.roots)).toEqual(['B']);
  });

  it('ignores rows carrying no key', () => {
    const rows: Row[] = [{ parentId: null, px: 1 }];
    const index = buildTreeIndex(store(PARENT_ROWS), config, rows, 'id');
    expect(index.roots).toEqual([]);
  });
});

describe('buildTreeIndex — path mode', () => {
  const config: TreeDataConfig = { enabled: true, mode: 'path' };

  it('roots single-segment paths and nests by path prefix', () => {
    const index = buildTreeIndex(store(PATH_ROWS), config, PATH_ROWS, 'id');
    expect(ids(index.roots)).toEqual(['A']);
    expect(ids(index.childrenOf.get('A'))).toEqual(['B', 'C']);
    expect(ids(index.childrenOf.get('B'))).toEqual(['D']);
  });

  it('keeps every ancestor of a match, and only them', () => {
    const index = buildTreeIndex(store(PATH_ROWS), config, [PATH_ROWS[3]!], 'id');
    // D matched; A and B are its path prefixes. C is neither, and reaches the
    // tree only because B's parent A is a MATCHED-parent expansion of nothing —
    // it is not kept.
    expect(ids(index.roots)).toEqual(['A']);
    expect(ids(index.childrenOf.get('A'))).toEqual(['B']);
    expect(ids(index.childrenOf.get('D'))).toEqual([]);
  });

  it('exposes all store children under a matched parent path', () => {
    const index = buildTreeIndex(store(PATH_ROWS), config, [PATH_ROWS[0]!], 'id');
    expect(ids(index.childrenOf.get('A'))).toEqual(['B', 'C']);
  });

  it('roots a row whose path has no parent node in the tree', () => {
    const rows: Row[] = [{ id: 'X', orgHierarchy: ['Missing', 'X'] }];
    const index = buildTreeIndex(store(rows), config, rows, 'id');
    expect(ids(index.roots)).toEqual(['X']);
  });

  it('reads a custom path field', () => {
    const rows: Row[] = [
      { id: 'A', route: ['Alpha'] },
      { id: 'B', route: ['Alpha', 'Bravo'] },
    ];
    const index = buildTreeIndex(
      store(rows),
      { enabled: true, mode: 'path', pathField: 'route' },
      rows,
      'id',
    );
    expect(ids(index.roots)).toEqual(['A']);
    expect(ids(index.childrenOf.get('A'))).toEqual(['B']);
  });
});

describe('tree blocks through the query engine', () => {
  const engineFor = (rows: Row[], tree: TreeDataConfig) =>
    new QueryEngine({ store: store(rows), tree });

  const BASE = { startRow: 0, endRow: 100 };

  it('serves roots with their child counts and group flags', () => {
    const engine = engineFor(PARENT_ROWS, { enabled: true, mode: 'parent' });
    const result = engine.getRows(BASE);
    expect(result.rowCount).toBe(2);
    const a = result.rowData.find((r) => r.id === 'A')!;
    const e = result.rowData.find((r) => r.id === 'E')!;
    expect(a.__ssrmChildCount).toBe(2);
    expect(a.__ssrmTreeGroup).toBe(true);
    expect(a.group).toBe(true);
    expect(a.__ssrmGroupKey).toBe('A');
    expect(e.__ssrmChildCount).toBe(0);
    expect(e.__ssrmTreeGroup).toBe(false);
  });

  it('drills into a node through groupKeys', () => {
    const engine = engineFor(PARENT_ROWS, { enabled: true, mode: 'parent' });
    const result = engine.getRows({ ...BASE, groupKeys: ['A'] });
    expect(result.rowData.map((r) => r.id).sort()).toEqual(['B', 'C']);
    expect(result.rowCount).toBe(2);
  });

  it('sorts nodes by the sort model, and by key when there is none', () => {
    const engine = engineFor(PARENT_ROWS, { enabled: true, mode: 'parent' });
    const sorted = engine.getRows({
      ...BASE,
      groupKeys: ['A'],
      sortModel: [{ colId: 'px', sort: 'desc' }],
    });
    expect(sorted.rowData.map((r) => r.id)).toEqual(['B', 'C']);
    const byKey = engine.getRows({ ...BASE, groupKeys: ['A'] });
    expect(byKey.rowData.map((r) => r.id)).toEqual(['B', 'C']);
  });

  it('pages a level', () => {
    const engine = engineFor(PARENT_ROWS, { enabled: true, mode: 'parent' });
    const page = engine.getRows({ startRow: 1, endRow: 2, groupKeys: ['A'] });
    expect(page.rowData.map((r) => r.id)).toEqual(['C']);
    expect(page.rowCount).toBe(2);
  });

  it('filters, keeping the path to a matching leaf', () => {
    const engine = engineFor(PARENT_ROWS, { enabled: true, mode: 'parent' });
    const roots = engine.getRows({
      ...BASE,
      filterModel: { name: { filterType: 'text', type: 'equals', filter: 'delta' } },
    });
    expect(roots.rowData.map((r) => r.id)).toEqual(['A']);
    expect(
      engine
        .getRows({
          ...BASE,
          groupKeys: ['A'],
          filterModel: { name: { filterType: 'text', type: 'equals', filter: 'delta' } },
        })
        .rowData.map((r) => r.id),
    ).toEqual(['B']);
  });

  it('grand-totals the whole filtered tree at the root level', () => {
    const engine = engineFor(PARENT_ROWS, { enabled: true, mode: 'parent' });
    const result = engine.getRows({ ...BASE, valueCols: [{ id: 'px', field: 'px', aggFunc: 'sum' }] });
    expect(result.grandTotalData?.px).toBe(15);
    // Not at a drilled-in level — that footer belongs to the root request.
    expect(
      engine.getRows({
        ...BASE,
        groupKeys: ['A'],
        valueCols: [{ id: 'px', field: 'px', aggFunc: 'sum' }],
      }).grandTotalData,
    ).toBeUndefined();
  });

  it('serves a path-mode tree the same way', () => {
    const engine = engineFor(PATH_ROWS, { enabled: true, mode: 'path' });
    const roots = engine.getRows(BASE);
    expect(roots.rowData.map((r) => r.id)).toEqual(['A']);
    expect(roots.rowData[0].__ssrmChildCount).toBe(2);
    expect(engine.getRows({ ...BASE, groupKeys: ['A'] }).rowData.map((r) => r.id).sort()).toEqual(
      ['B', 'C'],
    );
  });

  it('turns the tree off again through configureTree', () => {
    const engine = engineFor(PARENT_ROWS, { enabled: true, mode: 'parent' });
    expect(engine.getRows(BASE).rowCount).toBe(2);
    engine.configureTree(null);
    expect(engine.getRows(BASE).rowCount).toBe(5);
  });

  it('refuses a filter it cannot evaluate before building any index', () => {
    const engine = engineFor(PARENT_ROWS, { enabled: true, mode: 'parent' });
    expect(() =>
      engine.getRows({
        ...BASE,
        filterModel: { name: { filterType: 'text', type: 'soundsLike', filter: 'a' } },
      }),
    ).toThrow(/does not support/);
  });
});

describe('master-detail rows', () => {
  it('reads an embedded detail array, including from a nested field', () => {
    const rows: Row[] = [
      { id: 'A', trades: [{ qty: 1 }, { qty: 2 }], book: { fills: [{ qty: 9 }] } },
    ];
    const engine = new QueryEngine({ store: store(rows) });
    expect(engine.getDetailRows({ masterKey: 'A', detailField: 'trades' })).toEqual([
      { qty: 1 },
      { qty: 2 },
    ]);
    expect(engine.getDetailRows({ masterKey: 'A', detailField: 'book.fills' })).toEqual([
      { qty: 9 },
    ]);
  });

  it('is empty for an unknown master or a non-array field', () => {
    const engine = new QueryEngine({ store: store([{ id: 'A', trades: 'nope' }]) });
    expect(engine.getDetailRows({ masterKey: 'ZZ', detailField: 'trades' })).toEqual([]);
    expect(engine.getDetailRows({ masterKey: 'A', detailField: 'trades' })).toEqual([]);
  });

  it('reads related rows by parent field when no detail field is given', () => {
    const engine = new QueryEngine({ store: store(PARENT_ROWS) });
    expect(
      engine.getDetailRows({ masterKey: 'A', detailParentField: 'parentId' }).map((r) => r.id),
    ).toEqual(['B', 'C']);
  });

  it('falls back to the tree config’s parent field', () => {
    const engine = new QueryEngine({
      store: store(PARENT_ROWS),
      tree: { enabled: true, mode: 'parent', parentField: 'parentId' },
    });
    expect(engine.getDetailRows({ masterKey: 'B' }).map((r) => r.id)).toEqual(['D']);
  });
});
