import { describe, expect, it, vi } from 'vitest';
import { createSsrmSelectionContextBuilder } from './ssrmGridContextLink.js';

const KEY = 'positionId';

function api(overrides: Record<string, unknown> = {}) {
  return {
    getSelectedNodes: () => [],
    getServerSideSelectionState: () => null,
    getFilterModel: () => ({}),
    getRowGroupColumns: () => [],
    ...overrides,
  } as never;
}

function provider(values: string[]) {
  return { getSetFilterValues: vi.fn(async () => values) };
}

const OPTS = { instanceId: 'i1', rowIdField: [KEY] as const };

describe('createSsrmSelectionContextBuilder', () => {
  it('publishes leaf selections from loaded data, like CSRM', async () => {
    const p = provider([]);
    const build = createSsrmSelectionContextBuilder({ provider: p, keyColumn: KEY });
    const ctx = await build(api({
      getSelectedNodes: () => [
        { group: false, data: { [KEY]: 'P1' } },
        { group: false, data: { [KEY]: 'P2' } },
      ],
    }), OPTS);
    expect(ctx?.criteria).toEqual({ [KEY]: ['P1', 'P2'] });
    expect(p.getSetFilterValues).not.toHaveBeenCalled();
  });

  it('resolves a selected group through the worker with its group path', async () => {
    const p = provider(['P1', 'P2', 'P3']);
    const build = createSsrmSelectionContextBuilder({ provider: p, keyColumn: KEY });
    const ctx = await build(api({
      getSelectedNodes: () => [{
        group: true,
        getRoute: () => ['A'],
        allLeafChildren: [],
      }],
      getRowGroupColumns: () => [{ getColDef: () => ({ field: 'book' }) }],
      getFilterModel: () => ({ desk: { filterType: 'text', type: 'equals', filter: 'RATES' } }),
    }), OPTS);

    expect(p.getSetFilterValues).toHaveBeenCalledWith({
      column: KEY,
      filterModel: { desk: { filterType: 'text', type: 'equals', filter: 'RATES' } },
      quickFilterText: '',
      groupKeys: ['A'],
      rowGroupCols: [{ field: 'book' }],
    });
    expect(ctx?.criteria).toEqual({ [KEY]: ['P1', 'P2', 'P3'] });
  });

  it('merges leaf and group contributions and de-duplicates', async () => {
    const p = provider(['P2', 'P3']);
    const build = createSsrmSelectionContextBuilder({ provider: p, keyColumn: KEY });
    const ctx = await build(api({
      getSelectedNodes: () => [
        { group: false, data: { [KEY]: 'P2' } },
        { group: true, getRoute: () => ['A'], allLeafChildren: [] },
      ],
      getRowGroupColumns: () => [{ getColDef: () => ({ field: 'book' }) }],
    }), OPTS);
    expect([...(ctx?.criteria[KEY] ?? [])].sort()).toEqual(['P2', 'P3']);
  });

  it('publishes the whole query minus toggled rows on select-all', async () => {
    const p = provider(['P1', 'P2', 'P3', 'P4']);
    const build = createSsrmSelectionContextBuilder({ provider: p, keyColumn: KEY });
    const ctx = await build(api({
      getServerSideSelectionState: () => ({ selectAll: true, toggledNodes: ['P2'] }),
    }), OPTS);

    expect(p.getSetFilterValues).toHaveBeenCalledWith({
      column: KEY,
      filterModel: {},
      quickFilterText: '',
      groupKeys: [],
      rowGroupCols: [],
    });
    expect(ctx?.criteria).toEqual({ [KEY]: ['P1', 'P3', 'P4'] });
  });

  it('publishes empty criteria when nothing is selected (peers clear)', async () => {
    const build = createSsrmSelectionContextBuilder({ provider: provider([]), keyColumn: KEY });
    const ctx = await build(api(), OPTS);
    expect(ctx?.criteria).toEqual({});
  });

  it('includes the quick filter in worker requests', async () => {
    const p = provider(['P1']);
    const build = createSsrmSelectionContextBuilder({
      provider: p, keyColumn: KEY, getQuickFilterText: () => 'alpha',
    });
    await build(api({
      getSelectedNodes: () => [{ group: true, getRoute: () => ['A'], allLeafChildren: [] }],
      getRowGroupColumns: () => [{ getColDef: () => ({ field: 'book' }) }],
    }), OPTS);
    expect(p.getSetFilterValues.mock.calls[0][0].quickFilterText).toBe('alpha');
  });
});
