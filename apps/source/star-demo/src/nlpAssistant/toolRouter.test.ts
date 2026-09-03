import { describe, it, expect } from 'vitest';
import { routeToTool } from './toolRouter';
import type { ExtractedEntities } from './entityExtractor';

const ctx = { targetGridId: 'grid-test', numericCols: new Set(['notional', 'marketValue']) };
const ents = (p: Partial<ExtractedEntities>): ExtractedEntities => ({
  columns: [], unresolved: [], aggregations: {}, filters: [], ...p,
});

describe('routeToTool', () => {
  it('group_grid → set_row_grouping with dims minus measures', () => {
    const r = routeToTool('group_grid', ents({ columns: ['desk', 'notional'], aggregations: { notional: 'sum' } }), ctx);
    expect(r).toMatchObject({ ok: true, call: { tool: 'set_row_grouping', args: { targetGridId: 'grid-test', groupBy: ['desk'], aggregations: { notional: 'sum' } } } });
  });

  it('pivot_grid needs two dimensions', () => {
    expect(routeToTool('pivot_grid', ents({ columns: ['desk'] }), ctx)).toMatchObject({ ok: false, needs: 'columns' });
    const r = routeToTool('pivot_grid', ents({ columns: ['desk', 'currency'] }), ctx);
    expect(r).toMatchObject({ ok: true, call: { tool: 'set_row_grouping', args: { groupBy: ['desk'], pivotBy: ['currency'], pivotMode: true } } });
  });

  it('sort_data → set_sort', () => {
    const r = routeToTool('sort_data', ents({ columns: ['notional'], sortDirection: 'desc' }), ctx);
    expect(r).toMatchObject({ ok: true, call: { tool: 'set_sort', args: { sortBy: [{ column: 'notional', direction: 'desc' }] } } });
  });

  it('filter_data → AG-Grid filter model, numeric vs set', () => {
    const r = routeToTool('filter_data', ents({ filters: [
      { column: 'notional', op: 'gt', value: 1e6 },
      { column: 'issuerSector', op: 'eq', value: 'Financials' },
    ] }), ctx);
    expect(r).toMatchObject({ ok: true, call: { tool: 'set_filter_model', args: { filterModel: {
      notional: { filterType: 'number', type: 'greaterThan', filter: 1e6 },
      issuerSector: { filterType: 'set', values: ['Financials'] },
    } } } });
  });

  it('hide/show → set_column_visibility', () => {
    expect(routeToTool('hide_columns', ents({ columns: ['cusip'] }), ctx)).toMatchObject({ ok: true, call: { tool: 'set_column_visibility', args: { hide: ['cusip'] } } });
    expect(routeToTool('show_columns', ents({ columns: ['cusip'] }), ctx)).toMatchObject({ ok: true, call: { tool: 'set_column_visibility', args: { show: ['cusip'] } } });
  });

  it('query with dims + aggs → query_grid_data grouped, limit and sort carried', () => {
    const r = routeToTool('query_data', ents({ columns: ['desk', 'notional'], aggregations: { notional: 'sum' }, limit: 5, sortDirection: 'desc' }), ctx);
    expect(r).toMatchObject({ ok: true, call: { tool: 'query_grid_data', args: {
      groupBy: ['desk'], aggregate: [{ column: 'notional', fn: 'sum' }], limit: 5, sortBy: { column: 'notional', direction: 'desc' },
    } } });
  });

  it('aggregate with no dims → summarize_grid_data', () => {
    const r = routeToTool('aggregate_data', ents({ columns: ['notional'], aggregations: { notional: 'sum' } }), ctx);
    expect(r).toMatchObject({ ok: true, call: { tool: 'summarize_grid_data' } });
  });

  it('create_chart sets chart', () => {
    const r = routeToTool('create_chart', ents({ columns: ['desk', 'notional'], aggregations: { notional: 'sum' }, chartKind: 'pie' }), ctx);
    expect(r).toMatchObject({ ok: true, call: { tool: 'query_grid_data', args: { chart: 'pie' } } });
  });

  it('clear_grouping → empty groupBy', () => {
    expect(routeToTool('clear_grouping', ents({}), ctx)).toMatchObject({ ok: true, call: { tool: 'set_row_grouping', args: { groupBy: [] } } });
  });

  it('unknown → needs intent', () => {
    expect(routeToTool('unknown', ents({}), ctx)).toMatchObject({ ok: false, needs: 'intent' });
  });
});
