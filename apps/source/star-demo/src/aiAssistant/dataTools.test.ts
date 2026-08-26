import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ConfigManager } from '@wellsfargo-starui/core/host/config';
import type { DataProviderConfigStore } from '@wellsfargo-starui/data';
import { dispatchTool, type ToolExecutionContext } from './useToolExecutor';
import { DATA_CELL, type DataCellPayload } from './dataTools';

vi.mock('@wellsfargo-starui/react/data/runtime', () => ({ useDataServices: vi.fn() }));

const mockLoadRegistryConfig = vi.fn();
vi.mock('@wellsfargo-starui/openfin/config', () => ({
  loadRegistryConfig: (...args: unknown[]) => mockLoadRegistryConfig(...args),
  deriveTemplateConfigId: (type: string, sub: string) => `${type}-${sub}`.toLowerCase(),
}));

const GRID_ENTRY = {
  id: 'grid-test', configId: 'grid-test', componentType: 'grid', componentSubType: 'test',
  displayName: 'TestGrid', hostUrl: '/#/blotters/marketsgrid', iconId: '', createdAt: '',
  type: 'internal' as const, usesHostConfig: true, appId: 'Star-Demo', configServiceUrl: '',
  singleton: true, asWindow: false,
};

const ROWS = [
  { ticker: 'AAPL', sector: 'Tech', marketValue: 100 },
  { ticker: 'MSFT', sector: 'Tech', marketValue: 200 },
  { ticker: 'JPM', sector: 'Financials', marketValue: 700 },
];

function ctxWith(opts: { running?: boolean; rows?: unknown[] } = {}) {
  const unsubscribe = vi.fn();
  const client = {
    isProviderRunning: vi.fn().mockResolvedValue(opts.running ?? true),
    subscribe: vi.fn().mockReturnValue({ snapshot: Promise.resolve(opts.rows ?? ROWS), unsubscribe }),
  };
  const ctx: ToolExecutionContext = {
    configManager: {
      profiles: {
        list: vi.fn().mockResolvedValue([]),
        save: vi.fn().mockResolvedValue(undefined),
        loadGridLevelData: vi.fn().mockResolvedValue({ provider: { liveProviderId: 'p1' } }),
        saveGridLevelData: vi.fn().mockResolvedValue(undefined),
      },
      findByComponentType: vi.fn().mockResolvedValue([]),
    } as unknown as ConfigManager,
    configStore: {
      get: vi.fn().mockResolvedValue({
        providerId: 'p1', name: 'Positions Feed', providerType: 'mock',
        config: { columnDefinitions: [
          { field: 'ticker', headerName: 'Ticker' },
          { field: 'sector', headerName: 'Sector' },
          { field: 'marketValue', headerName: 'Market Value' },
        ] },
      }),
      list: vi.fn().mockResolvedValue([]),
    } as unknown as DataProviderConfigStore,
    client,
    appId: 'Star-Demo',
  };
  return { ctx, client, unsubscribe };
}

function cell(result: unknown): DataCellPayload {
  return result as DataCellPayload;
}

beforeEach(() => {
  mockLoadRegistryConfig.mockReset().mockResolvedValue({ version: 2, entries: [GRID_ENTRY] });
});

describe('summarize_grid_data', () => {
  it('summarizes the live rows and returns a data cell', async () => {
    const { ctx } = ctxWith();

    const result = await dispatchTool('summarize_grid_data', ctx, { targetGridId: 'grid-test' });

    expect(result.ok).toBe(true);
    const payload = cell(result.data);
    expect(payload.kind).toBe(DATA_CELL);
    expect(payload.source).toBe('live');
    expect(payload.rowCount).toBe(3);
    const marketValue = payload.digest?.columns.find((c) => c.colId === 'marketValue');
    expect(marketValue).toMatchObject({ kind: 'number', sum: 1000, mean: 333.33 });
  });

  /** The numbers only mean anything if the answer says where they came from. */
  it('puts the provenance in the summary the model reads', async () => {
    const { ctx } = ctxWith();
    const result = await dispatchTool('summarize_grid_data', ctx, { targetGridId: 'grid-test' });
    expect(result.summary).toContain('Positions Feed');
    expect(result.summary).toContain('on screen');
  });

  it('takes column names the way the user says them', async () => {
    const { ctx } = ctxWith();

    const result = await dispatchTool('summarize_grid_data', ctx, {
      targetGridId: 'grid-test', columns: ['Market Value'], groupBy: 'Sector',
    });

    expect(result.ok).toBe(true);
    const payload = cell(result.data);
    expect(payload.digest?.columns.map((c) => c.colId)).toEqual(['marketValue']);
    expect(payload.digest?.groups?.by).toBe('sector');
    expect(payload.digest?.groups?.buckets.find((b) => b.value === 'Tech')).toMatchObject({ rowCount: 2 });
  });

  it('rejects a column the grid does not have, with the near misses', async () => {
    const { ctx } = ctxWith();
    const result = await dispatchTool('summarize_grid_data', ctx, { targetGridId: 'grid-test', groupBy: 'secotr' });
    expect(result.ok).toBe(false);
    expect(result.summary).toContain('sector');
  });

  it('refuses when the blotter is closed rather than inventing numbers', async () => {
    const { ctx, client } = ctxWith({ running: false });

    const result = await dispatchTool('summarize_grid_data', ctx, { targetGridId: 'grid-test' });

    expect(result.ok).toBe(false);
    expect(result.summary).toContain('Open the blotter');
    expect(client.subscribe).not.toHaveBeenCalled();
  });

  it('labels an opted-in generated sample as not the user\'s data', async () => {
    const { ctx } = ctxWith({ running: false });

    const result = await dispatchTool('summarize_grid_data', ctx, { targetGridId: 'grid-test', allowSample: true });

    expect(result.ok).toBe(true);
    expect(cell(result.data).source).toBe('sample');
    expect(result.summary).toContain('GENERATED');
  });
});

describe('query_grid_data', () => {
  it('runs a top-N query and returns a table', async () => {
    const { ctx } = ctxWith();

    const result = await dispatchTool('query_grid_data', ctx, {
      targetGridId: 'grid-test',
      columns: ['Ticker', 'Market Value'],
      sortBy: { column: 'Market Value' },
      limit: 2,
    });

    expect(result.ok).toBe(true);
    const table = cell(result.data).table;
    expect(table?.columns).toEqual(['ticker', 'marketValue']);
    expect(table?.rows.map((r) => r.ticker)).toEqual(['JPM', 'MSFT']);
    expect(table).toMatchObject({ matched: 3, scanned: 3, truncated: true });
  });

  it('groups and aggregates, resolving every column name it was given', async () => {
    const { ctx } = ctxWith();

    const result = await dispatchTool('query_grid_data', ctx, {
      targetGridId: 'grid-test',
      groupBy: ['Sector'],
      aggregate: [{ column: 'Market Value', fn: 'sum' }],
    });

    expect(result.ok).toBe(true);
    const table = cell(result.data).table;
    expect(table?.columns).toEqual(['sector', 'sum_marketValue']);
    expect(table?.rows.find((r) => r.sector === 'Tech')?.sum_marketValue).toBe(300);
  });

  it('resolves column names inside filter clauses', async () => {
    const { ctx } = ctxWith();

    const result = await dispatchTool('query_grid_data', ctx, {
      targetGridId: 'grid-test',
      filter: [{ column: 'Sector', op: 'eq', value: 'Tech' }],
    });

    expect(result.ok).toBe(true);
    expect(cell(result.data).table?.matched).toBe(2);
  });

  it('passes a malformed query back as an explanation', async () => {
    const { ctx } = ctxWith();
    const result = await dispatchTool('query_grid_data', ctx, {
      targetGridId: 'grid-test', filter: [{ column: 'sector', op: 'like', value: 'x' }],
    });
    expect(result.ok).toBe(false);
    expect(result.summary).toContain('contains');
  });

  it('says honestly how much it showed of what matched', async () => {
    const { ctx } = ctxWith();
    const result = await dispatchTool('query_grid_data', ctx, { targetGridId: 'grid-test', limit: 1 });
    expect(result.summary).toContain('3 result row(s) from 3 scanned');
    expect(result.summary).toContain('showing the first 1');
  });
});

/** Without a hub there is no live data — the tools have to degrade to an
 *  explanation, never to a throw. */
describe('with no data hub in the window', () => {
  it('explains rather than crashing', async () => {
    const { ctx } = ctxWith();
    const result = await dispatchTool('summarize_grid_data', { ...ctx, client: undefined }, { targetGridId: 'grid-test' });
    expect(result.ok).toBe(false);
    expect(result.summary).toContain('isn\'t streaming');
  });
});
