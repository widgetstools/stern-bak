import { describe, expect, it, vi } from 'vitest';
import type { IServerSideGetRowsParams } from 'ag-grid-community';
import type { ISsrmDataProvider } from '@wellsfargo-starui/data';
import { createSsrmDatasource } from './createSsrmDatasource.js';

type ViewportCall = Parameters<ISsrmDataProvider['setViewport']>;

function harness(rowData: Record<string, unknown>[] = [{ id: 'a' }]) {
  const viewportCalls: ViewportCall[] = [];
  const provider = {
    getRows: vi.fn(async () => ({ rowData, rowCount: rowData.length })),
    setViewport: vi.fn(async (...args: ViewportCall) => {
      viewportCalls.push(args);
    }),
  } as unknown as ISsrmDataProvider;

  const ds = createSsrmDatasource(provider, { keyColumn: 'id' });

  const load = (request: Record<string, unknown>) => {
    const params = {
      request,
      api: { isDestroyed: () => false },
      success: vi.fn(),
      fail: vi.fn(),
    } as unknown as IServerSideGetRowsParams;
    ds.getRows(params);
    // Let the provider promise settle.
    return new Promise((r) => setTimeout(r, 0));
  };

  return { provider, viewportCalls, load };
}

const baseRequest = {
  startRow: 0,
  endRow: 100,
  filterModel: {},
  sortModel: [],
  groupKeys: [],
  rowGroupCols: [],
  valueCols: [],
  pivotCols: [],
  pivotMode: false,
};

describe('createSsrmDatasource viewport scope', () => {
  it('identifies each block so interest accumulates instead of replacing', async () => {
    const { viewportCalls, load } = harness();

    await load({ ...baseRequest, startRow: 0, endRow: 100 });
    await load({ ...baseRequest, startRow: 100, endRow: 200 });

    expect(viewportCalls).toHaveLength(2);
    const [, firstScope] = viewportCalls[0];
    const [, secondScope] = viewportCalls[1];
    expect(firstScope?.blockKey).toBeDefined();
    expect(secondScope?.blockKey).toBeDefined();
    // Different blocks of the same query.
    expect(firstScope?.blockKey).not.toBe(secondScope?.blockKey);
    expect(firstScope?.queryId).toBe(secondScope?.queryId);
  });

  it('changes the query id when the filter model changes', async () => {
    const { viewportCalls, load } = harness();

    await load({ ...baseRequest });
    await load({
      ...baseRequest,
      filterModel: { book: { filterType: 'text', type: 'equals', filter: 'A' } },
    });

    expect(viewportCalls[0][1]?.queryId).not.toBe(viewportCalls[1][1]?.queryId);
  });

  it('changes the query id when the sort model changes', async () => {
    const { viewportCalls, load } = harness();

    await load({ ...baseRequest });
    await load({ ...baseRequest, sortModel: [{ colId: 'pnl', sort: 'desc' }] });

    expect(viewportCalls[0][1]?.queryId).not.toBe(viewportCalls[1][1]?.queryId);
  });

  it('keeps the same query id when only the block range moves', async () => {
    const { viewportCalls, load } = harness();

    await load({ ...baseRequest, startRow: 0, endRow: 100 });
    await load({ ...baseRequest, startRow: 200, endRow: 300 });

    expect(viewportCalls[0][1]?.queryId).toBeDefined();
    expect(viewportCalls[0][1]?.queryId).toBe(viewportCalls[1][1]?.queryId);
  });

  it('reports no filter for an unfiltered query', async () => {
    const { viewportCalls, load } = harness();

    await load({ ...baseRequest });

    expect(viewportCalls[0][1]?.hasFilter).toBe(false);
  });

  it('reports a filter when a column filter is set', async () => {
    const { viewportCalls, load } = harness();

    await load({
      ...baseRequest,
      filterModel: { book: { filterType: 'text', type: 'equals', filter: 'A' } },
    });

    expect(viewportCalls[0][1]?.hasFilter).toBe(true);
  });

  it('reports a filter when only the quick filter is set', async () => {
    const provider = {
      getRows: vi.fn(async () => ({ rowData: [{ id: 'a' }], rowCount: 1 })),
      setViewport: vi.fn(async () => {}),
    } as unknown as ISsrmDataProvider;
    const ds = createSsrmDatasource(provider, {
      keyColumn: 'id',
      getQuickFilterText: () => 'abc',
    });

    ds.getRows({
      request: baseRequest,
      api: { isDestroyed: () => false },
      success: vi.fn(),
      fail: vi.fn(),
    } as unknown as IServerSideGetRowsParams);
    await new Promise((r) => setTimeout(r, 0));

    const scope = (provider.setViewport as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0][1] as { hasFilter?: boolean };
    expect(scope.hasFilter).toBe(true);
  });

  it('scopes group-level blocks by their group keys', async () => {
    const { viewportCalls, load } = harness();

    await load({ ...baseRequest, groupKeys: ['A'] });
    await load({ ...baseRequest, groupKeys: ['B'] });

    expect(viewportCalls[0][1]?.blockKey).not.toBe(
      viewportCalls[1][1]?.blockKey,
    );
  });
});
