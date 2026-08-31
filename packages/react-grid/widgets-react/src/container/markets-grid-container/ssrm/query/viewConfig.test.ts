import { describe, expect, it } from 'vitest';
import type { IServerSideGetRowsRequest } from 'ag-grid-community';
import { CHILD_COUNT_FIELD } from '../rows.js';
import type { PerspectiveSchema } from '../schema.js';
import { buildQuery, viewCacheKey } from './viewConfig.js';

const schema: PerspectiveSchema = {
  desk: 'string',
  region: 'string',
  pnl: 'float',
  qty: 'float',
  when: 'datetime',
  __pspIndex: 'string',
};
const leafColumns = Object.keys(schema);

function request(over: Partial<IServerSideGetRowsRequest> = {}): IServerSideGetRowsRequest {
  return {
    startRow: 0,
    endRow: 200,
    rowGroupCols: [],
    valueCols: [],
    pivotCols: [],
    pivotMode: false,
    groupKeys: [],
    filterModel: null,
    sortModel: [],
    ...over,
  } as unknown as IServerSideGetRowsRequest;
}

const groupCol = (id: string, aggFunc?: string) => ({ id, displayName: id, field: id, aggFunc });

describe('buildQuery — leaf', () => {
  it('serves an ungrouped request as a leaf query over every leaf column', () => {
    const q = buildQuery({ request: request(), schema, leafColumns });
    expect(q.shape).toEqual({ kind: 'leaf' });
    expect(q.config.columns).toEqual(leafColumns);
    expect(q.matchNothing).toBe(false);
  });

  it('keeps only sortable (known leaf) sort entries', () => {
    const q = buildQuery({
      request: request({ sortModel: [{ colId: 'pnl', sort: 'desc' }, { colId: 'ghost', sort: 'asc' }] }),
      schema,
      leafColumns,
    });
    expect(q.config.sort).toEqual([['pnl', 'desc']]);
  });
});

describe('buildQuery — group levels', () => {
  it('builds a flat-rollup group level with an engine-computed child count', () => {
    const q = buildQuery({
      request: request({ rowGroupCols: [groupCol('desk')], valueCols: [groupCol('pnl', 'sum')] }),
      schema,
      leafColumns,
    });
    expect(q.shape).toEqual({ kind: 'group', groupColumn: 'desk' });
    expect(q.config.group_by).toEqual(['desk']);
    expect(q.config.group_rollup_mode).toBe('flat');
    expect(q.config.columns).toContain(CHILD_COUNT_FIELD);
    expect(q.config.expressions?.[CHILD_COUNT_FIELD]).toBe('1');
    expect(q.config.aggregates?.[CHILD_COUNT_FIELD]).toBe('sum');
    expect(q.config.aggregates?.pnl).toBe('sum');
    expect(q.valueColumns).toEqual(['pnl']);
  });

  it('descends past the last group column into a leaf query filtered on the group path', () => {
    const q = buildQuery({
      request: request({ rowGroupCols: [groupCol('desk')], groupKeys: ['Rates'] }),
      schema,
      leafColumns,
    });
    expect(q.shape).toEqual({ kind: 'leaf' });
    expect(q.config.filter).toContainEqual(['desk', '==', 'Rates']);
  });

  it('prefers typedGroupKeys for filtering while leveling off request.groupKeys length', () => {
    const q = buildQuery({
      request: request({ rowGroupCols: [groupCol('when'), groupCol('desk')], groupKeys: ['1700000000000'] }),
      schema,
      leafColumns,
      typedGroupKeys: [1700000000000],
    });
    expect(q.shape).toEqual({ kind: 'group', groupColumn: 'desk' });
    expect(q.config.filter).toContainEqual(['when', '==', 1700000000000]);
  });

  it('drops an unknown group column and its key in step, so later keys stay aligned', () => {
    const q = buildQuery({
      request: request({
        rowGroupCols: [groupCol('ghost'), groupCol('desk')],
        groupKeys: ['phantom', 'Rates'],
      }),
      schema,
      leafColumns,
    });
    // ghost dropped: one real group column, one aligned key → leaf under desk='Rates'.
    expect(q.shape).toEqual({ kind: 'leaf' });
    expect(q.config.filter).toContainEqual(['desk', '==', 'Rates']);
    expect(q.config.filter).not.toContainEqual(['desk', '==', 'phantom']);
  });

  it('gives an unsortable-on-groups sort column a representative "any" aggregate', () => {
    const q = buildQuery({
      request: request({
        rowGroupCols: [groupCol('desk')],
        sortModel: [{ colId: 'qty', sort: 'asc' }],
      }),
      schema,
      leafColumns,
    });
    expect(q.config.aggregates?.qty).toBe('any');
    expect(q.config.columns).toContain('qty');
    expect(q.config.sort).toEqual([['qty', 'asc']]);
  });
});

describe('buildQuery — aggregates policy', () => {
  it('drops an engine-illegal aggregate and reports it instead of aborting the read', () => {
    const q = buildQuery({
      request: request({ rowGroupCols: [groupCol('desk')], valueCols: [groupCol('region', 'sum')] }),
      schema,
      leafColumns,
    });
    expect(q.valueColumns).toEqual([]);
    expect(q.unsupported.some((reason) => reason.includes('region'))).toBe(true);
  });

  it('rewrites max through a null-proof derived column and maps the alias back', () => {
    const q = buildQuery({
      request: request({ rowGroupCols: [groupCol('desk')], valueCols: [groupCol('pnl', 'max')] }),
      schema,
      leafColumns,
    });
    const alias = Object.keys(q.maxAliases ?? {})[0];
    expect(alias).toBeDefined();
    expect(q.maxAliases?.[alias]).toBe('pnl');
    expect(q.config.aggregates?.[alias]).toBe('max');
    expect(q.config.expressions?.[alias]).toContain('is_null');
    expect(q.valueColumns).toContain(alias);
  });
});

describe('buildQuery — pivot mode', () => {
  it('collapses to a single total row when pivoting with no row groups', () => {
    const q = buildQuery({
      request: request({ pivotMode: true, pivotCols: [groupCol('region')], valueCols: [groupCol('pnl', 'sum')] }),
      schema,
      leafColumns,
    });
    expect(q.shape).toEqual({ kind: 'total' });
    expect(q.config.group_rollup_mode).toBe('total');
    expect(q.config.split_by).toEqual(['region']);
  });

  it('never adds the child counter or representative sorts under a split_by', () => {
    const q = buildQuery({
      request: request({
        pivotMode: true,
        pivotCols: [groupCol('region')],
        rowGroupCols: [groupCol('desk')],
        sortModel: [{ colId: 'qty', sort: 'asc' }],
        valueCols: [groupCol('pnl', 'sum')],
      }),
      schema,
      leafColumns,
    });
    expect(q.shape).toEqual({ kind: 'group', groupColumn: 'desk' });
    expect(q.config.columns).not.toContain(CHILD_COUNT_FIELD);
    expect(q.config.expressions?.[CHILD_COUNT_FIELD]).toBeUndefined();
    expect(q.config.aggregates?.qty).toBeUndefined();
  });
});

describe('viewCacheKey', () => {
  it('is stable for the same config and distinct for different ones', () => {
    const a = buildQuery({ request: request(), schema, leafColumns }).config;
    const b = buildQuery({ request: request(), schema, leafColumns }).config;
    const c = buildQuery({ request: request({ sortModel: [{ colId: 'pnl', sort: 'asc' }] }), schema, leafColumns }).config;
    expect(viewCacheKey(a)).toBe(viewCacheKey(b));
    expect(viewCacheKey(a)).not.toBe(viewCacheKey(c));
  });
});
