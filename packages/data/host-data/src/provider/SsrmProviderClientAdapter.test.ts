import { describe, expect, it, vi } from 'vitest';
import type { ProviderConfig } from '@wellsfargo-starui/types';
import { SsrmProviderClientAdapter } from './SsrmProviderClientAdapter.js';

function mockClient() {
  const ticks = new Map<string, (payload: unknown) => void>();
  let lastListeners: {
    onStatus: (s: string, e?: string) => void;
    onRowsReceived: (n: number) => void;
  } | undefined;
  return {
    lastListeners: () => lastListeners,
    attachSsrm: vi.fn((
      id: string,
      _cfg: unknown,
      listeners: {
        onStatus: (s: string, e?: string) => void;
        onRowsReceived: (n: number) => void;
      },
    ) => {
      lastListeners = listeners;
      return `sub-${id}`;
    }),
    detach: vi.fn(),
    getProviderConfig: vi.fn(),
    ssrmGetRows: vi.fn(async () => ({ rowData: [{ id: '1' }], rowCount: 1 })),
    ssrmColumnValues: vi.fn(async () => ({ column: 'desk', values: ['A'], truncated: false })),
    ssrmRowCount: vi.fn(async () => ({ rowCount: 4200 })),
    ssrmAggregates: vi.fn(async () => ({ values: { marketValue_sum: 10 } })),
    ssrmWatchGroups: vi.fn(async () => undefined),
    onSsrmTick: vi.fn((subId: string, handler: (payload: unknown) => void) => {
      ticks.set(subId, handler);
      return () => { ticks.delete(subId); };
    }),
    emitTick(subId: string, payload: unknown) {
      ticks.get(subId)?.(payload);
    },
  };
}

const inlineCfg = {
  providerType: 'stomp-ssrm',
  websocketUrl: 'ws://x',
  listenerTopic: '/t',
  snapshotEndToken: 'Success',
  requestBody: '',
  keyColumn: 'id',
  columnDefinitions: [{ field: 'id' }, { field: 'desk' }],
} as unknown as ProviderConfig;

describe('SsrmProviderClientAdapter', () => {
  it('starts with inline cfg and fans out ticks / status / rows', async () => {
    const client = mockClient();
    const adapter = new SsrmProviderClientAdapter({
      client: client as never,
      providerId: 'p1',
      inlineCfg,
    });
    const ticks: unknown[] = [];
    const statuses: unknown[] = [];
    const rows: number[] = [];
    const errors: Error[] = [];
    const offTick = adapter.onSsrmTick((p) => { ticks.push(p); });
    adapter.onStatus((s, e) => { statuses.push([s, e]); });
    adapter.onRowsReceived((n) => { rows.push(n); });
    adapter.onError((e) => { errors.push(e); });

    await adapter.start();
    await adapter.start();
    expect(client.attachSsrm).toHaveBeenCalledTimes(1);
    expect(adapter.getConfig()).toBe(inlineCfg);
    expect(adapter.getColumnDefs()).toEqual([{ field: 'id' }, { field: 'desk' }]);

    client.lastListeners()!.onStatus('ready');
    client.lastListeners()!.onStatus('error', 'down');
    client.lastListeners()!.onRowsReceived(12);
    client.emitTick('sub-p1', { kind: 'rowDelta', upserts: [{ id: '1' }] });

    expect(statuses).toEqual([['ready', undefined], ['error', 'down']]);
    expect(errors).toHaveLength(1);
    expect(rows).toEqual([12]);
    expect(ticks).toHaveLength(1);

    await expect(adapter.getRows({ startRow: 0, endRow: 50 })).resolves.toMatchObject({ rowCount: 1 });
    await adapter.watchGroups({ groupBy: ['desk'] });
    expect(client.ssrmWatchGroups).toHaveBeenCalledWith('p1', 'sub-p1', ['desk'], undefined);

    offTick();
    await adapter.stop();
    expect(client.detach).toHaveBeenCalledWith('sub-p1');
  });

  it('loads catalog config when inline cfg is absent', async () => {
    const client = mockClient();
    client.getProviderConfig.mockResolvedValue({ config: inlineCfg });
    const adapter = new SsrmProviderClientAdapter({
      client: client as never,
      providerId: 'p2',
    });
    await adapter.start();
    expect(adapter.getConfig()).toEqual(inlineCfg);
    // The hub must not have to find the row in its own cache — attach carries
    // the config the adapter just read.
    expect(client.attachSsrm).toHaveBeenCalledWith('p2', inlineCfg, expect.any(Object), {});
  });

  it('reports the same capability flags as the CSRM stomp adapter', async () => {
    const client = mockClient();
    const adapter = new SsrmProviderClientAdapter({
      client: client as never,
      providerId: 'p1',
      inlineCfg,
    });
    expect(adapter.capabilities).toEqual({
      providerType: 'stomp-ssrm',
      streaming: true,
      realtime: true,
      supportsRefresh: true,
      supportsRestart: true,
    });
  });

  it('refresh asks bound grids to re-read without touching the hub', async () => {
    const client = mockClient();
    const adapter = new SsrmProviderClientAdapter({
      client: client as never,
      providerId: 'p1',
      inlineCfg,
    });
    const refreshes: number[] = [];
    const off = adapter.onRefresh(() => { refreshes.push(1); });

    await adapter.start();
    await adapter.refresh();
    expect(refreshes).toHaveLength(1);
    expect(client.detach).not.toHaveBeenCalled();
    expect(client.attachSsrm).toHaveBeenCalledTimes(1);

    off();
    await adapter.refresh();
    expect(refreshes).toHaveLength(1);
  });

  it('restart purges bound grids — the reconnect re-boots the worker cache', async () => {
    const client = mockClient();
    const adapter = new SsrmProviderClientAdapter({
      client: client as never,
      providerId: 'p1',
      inlineCfg,
    });
    let refreshed = 0;
    adapter.onRefresh(() => { refreshed += 1; });

    await adapter.start();
    await adapter.restart();
    expect(refreshed).toBe(1);
  });

  it('rejects start / getRows / getConfig when not ready', async () => {
    const client = mockClient();
    client.getProviderConfig.mockResolvedValue(null);
    const adapter = new SsrmProviderClientAdapter({
      client: client as never,
      providerId: 'missing',
    });
    await expect(adapter.start()).rejects.toThrow(/No config/);
    expect(() => adapter.getConfig()).toThrow(/not started/);
    await expect(adapter.getRows({ startRow: 0 })).rejects.toThrow(/not started/);
    await expect(adapter.getColumnValues({ column: 'desk' })).rejects.toThrow(/not started/);
    await expect(adapter.watchGroups({ groupBy: [] })).rejects.toThrow(/not started/);
  });

  it('forwards getColumnValues to the worker for set filter population', async () => {
    const client = mockClient();
    const adapter = new SsrmProviderClientAdapter({
      client: client as never,
      providerId: 'p1',
      inlineCfg,
    });
    await adapter.start();
    await expect(adapter.getColumnValues({ column: 'desk', limit: 50 }))
      .resolves.toMatchObject({ values: ['A'] });
    expect(client.ssrmColumnValues).toHaveBeenCalledWith('p1', 'sub-p1', {
      column: 'desk',
      limit: 50,
    });
  });

  it('forwards getRowCount to the worker for saved-filter pill badges', async () => {
    const client = mockClient();
    const adapter = new SsrmProviderClientAdapter({
      client: client as never,
      providerId: 'p1',
      inlineCfg,
    });
    await expect(adapter.getRowCount({})).rejects.toThrow('not started');

    await adapter.start();
    const filterModel = { desk: { filterType: 'set', values: ['Govies'] } };
    await expect(adapter.getRowCount({ filterModel })).resolves.toEqual({ rowCount: 4200 });
    expect(client.ssrmRowCount).toHaveBeenCalledWith('p1', 'sub-p1', { filterModel });
  });

  it('forwards getAggregates to the worker for the status bar', async () => {
    const client = mockClient();
    const adapter = new SsrmProviderClientAdapter({
      client: client as never,
      providerId: 'p1',
      inlineCfg,
    });
    await expect(adapter.getAggregates({ specs: [] })).rejects.toThrow('not started');
    await adapter.start();
    const req = { specs: [{ column: 'marketValue', fn: 'sum' as const }] };
    await expect(adapter.getAggregates(req)).resolves.toEqual({ values: { marketValue_sum: 10 } });
    expect(client.ssrmAggregates).toHaveBeenCalledWith('p1', 'sub-p1', req);
  });

  it('restart detaches then re-attaches with extra', async () => {
    const client = mockClient();
    const adapter = new SsrmProviderClientAdapter({
      client: client as never,
      providerId: 'p1',
      inlineCfg,
    });
    await adapter.start();
    await adapter.restart({ asOfDate: '2026-01-01' });
    expect(client.detach).toHaveBeenCalled();
    expect(client.attachSsrm).toHaveBeenCalledTimes(2);
    expect(client.attachSsrm.mock.calls[1][3]).toEqual({ extra: { asOfDate: '2026-01-01' } });
  });

  it('restart without a prior start loads config then attaches', async () => {
    const client = mockClient();
    client.getProviderConfig.mockResolvedValue({ config: inlineCfg });
    const adapter = new SsrmProviderClientAdapter({
      client: client as never,
      providerId: 'p3',
    });
    await adapter.restart();
    expect(client.getProviderConfig).toHaveBeenCalledWith('p3');
    expect(client.attachSsrm).toHaveBeenCalledTimes(1);
  });

  it('returns empty column defs when the config has none', async () => {
    const client = mockClient();
    const adapter = new SsrmProviderClientAdapter({
      client: client as never,
      providerId: 'p1',
      inlineCfg: { providerType: 'stomp-ssrm' } as ProviderConfig,
    });
    await adapter.start();
    expect(adapter.getColumnDefs()).toEqual([]);
  });
});
