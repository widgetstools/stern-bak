import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfigRow } from '@wellsfargo-starui/core/host/config';
import type { TransportConfig } from '@wellsfargo-starui/types';
import { createInPageWiring, SharedWorkerDataServicesClient } from '../runtime/client/SharedWorkerDataServicesClient.js';
import { SharedWorkerDataServicesHub, type PortLike } from '../runtime/worker/SharedWorkerDataServicesHub.js';
import { registerProvider } from '../runtime/providers/registry.js';
import { isAppDataRequest, isRequest } from '../runtime/protocol.js';
import type { ProviderHandle, ProviderEmit } from '../runtime/providers/Provider.js';
import { ConfigCatalogCache } from '../hub/ConfigCatalogCache.js';
import { ProviderClientAdapter, resolveProviderCapabilities } from './ProviderClientAdapter.js';

interface TestController {
  emit: ProviderEmit;
  stops: number;
  restarts: Array<Record<string, unknown> | undefined>;
}

const controllers = new Map<string, TestController>();

beforeEach(() => {
  controllers.clear();
  registerProvider('mock' as TransportConfig['providerType'], (cfg, emit) => {
    const ctrl: TestController = { emit, stops: 0, restarts: [] };
    const key = (cfg as unknown as { __testKey?: string }).__testKey ?? 'default';
    controllers.set(key, ctrl);
    const handle: ProviderHandle = {
      stop() { ctrl.stops += 1; },
      restart(extra) { ctrl.restarts.push(extra); },
    };
    return handle;
  });
});

const cfg = (testKey = 'default'): TransportConfig => ({
  providerType: 'mock',
  __testKey: testKey,
  keyColumn: 'id',
  columnDefinitions: [{ field: 'id', headerName: 'ID' }],
} as unknown as TransportConfig);

function mockProviderRow(id: string, testKey = 'default'): AppConfigRow {
  return {
    configId: id,
    appId: 'TestApp',
    userId: 'system',
    componentType: 'data-provider',
    componentSubType: 'mock',
    isTemplate: false,
    displayText: id,
    payload: {
      providerType: 'mock',
      keyColumn: 'id',
      __testKey: testKey,
      columnDefinitions: [{ field: 'id', headerName: 'ID' }],
      __providerMeta: { public: true },
    },
    createdBy: 'dev1',
    updatedBy: 'dev1',
    creationTime: '2026-01-01T00:00:00.000Z',
    updatedTime: '2026-01-01T00:00:00.000Z',
  };
}

function mockConfigManager(rows: AppConfigRow[]) {
  const map = new Map(rows.map((r) => [r.configId, r]));
  return {
    getAppId() { return 'TestApp'; },
    async getAllConfigsUnfiltered() { return [...map.values()]; },
    async getConfigsByComponentTypesUnfiltered(types: string[]) { return [...map.values()].filter((r) => types.includes(r.componentType)); },
    async getConfig(id: string) { return map.get(id); },
  };
}

interface Wiring {
  hub: SharedWorkerDataServicesHub;
  client: SharedWorkerDataServicesClient;
  close(): void;
}

function wireCatalog(rows: AppConfigRow[], opts: { preload?: boolean } = {}): Wiring {
  const { preload = true } = opts;
  const cm = mockConfigManager(rows);
  const cache = new ConfigCatalogCache(cm as never);
  const hub = new SharedWorkerDataServicesHub({ configCatalog: cache });
  if (preload) void cache.loadAll();
  const wiring = createInPageWiring((port) => {
    const portLike: PortLike = { postMessage: (m) => port.postMessage(m) };
    port.addEventListener('message', (ev: MessageEvent) => {
      if (isRequest(ev.data)) hub.handleRequest(portLike, ev.data);
      else if (isAppDataRequest(ev.data)) hub.handleAppDataRequest(portLike, ev.data);
    });
    port.start();
  }, { disablePageHideClose: true });
  return {
    hub,
    client: wiring.client,
    close: () => {
      wiring.close();
      void hub.dispose();
    },
  };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await new Promise<void>((r) => setTimeout(r, 0));
  }
}

describe('resolveProviderCapabilities', () => {
  it('maps provider types to streaming/restart capabilities', () => {
    expect(resolveProviderCapabilities('rest')).toMatchObject({
      streaming: false,
      realtime: false,
      supportsRefresh: true,
    });
    expect(resolveProviderCapabilities('appdata')).toMatchObject({
      streaming: false,
      supportsRefresh: false,
      supportsRestart: false,
    });
    expect(resolveProviderCapabilities('custom' as never)).toMatchObject({
      providerType: 'custom',
      supportsRefresh: true,
    });
  });
});

describe('ProviderClientAdapter', () => {
  let w: Wiring;

  beforeEach(async () => {
    w = wireCatalog([mockProviderRow('p1')]);
    await w.client.waitForCatalogReady();
  });

  afterEach(() => w.close());

  it('start() resolves the provider on demand when the catalog never preloaded', async () => {
    // Phase 3: no loadAll() — start() must resolve the one provider via the
    // worker's on-demand single-row read instead of gating on the full catalog.
    const local = wireCatalog([mockProviderRow('p1')], { preload: false });
    try {
      const adapter = new ProviderClientAdapter<{ id: string; x: number }>({
        client: local.client,
        providerId: 'p1',
      });
      const startPromise = adapter.start();
      await flush();
      controllers.get('default')!.emit({ rows: [{ id: 'r1', x: 1 }], replace: true });
      controllers.get('default')!.emit({ status: 'ready' });
      await startPromise;

      expect(adapter.getData()).toEqual([{ id: 'r1', x: 1 }]);
      expect(adapter.getConfig().providerType).toBe('mock');
      await adapter.stop();
    } finally {
      local.close();
    }
  });

  it('maps hub snapshot to onSnapshotData and getData()', async () => {
    const adapter = new ProviderClientAdapter<{ id: string; x: number }>({
      client: w.client,
      providerId: 'p1',
    });
    const snapshots: Array<readonly { id: string; x: number }[]> = [];
    adapter.onSnapshotData((rows) => snapshots.push(rows));

    const startPromise = adapter.start();
    await flush();
    controllers.get('default')!.emit({
      rows: [{ id: 'r1', x: 1 }, { id: 'r2', x: 2 }],
      replace: true,
    });
    controllers.get('default')!.emit({ status: 'ready' });
    await startPromise;

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toHaveLength(2);
    expect(adapter.getData()).toBe(snapshots[0]);
    expect(adapter.getData()).toEqual([{ id: 'r1', x: 1 }, { id: 'r2', x: 2 }]);
    expect(adapter.getConfig().providerType).toBe('mock');
    expect(adapter.getColumnDefs()).toEqual([{ field: 'id', headerName: 'ID' }]);
    expect(adapter.capabilities.realtime).toBe(true);

    await adapter.stop();
  });

  it('fires onRowsReceived during chunked late-join replay', async () => {
    const rows = Array.from({ length: 1200 }, (_, i) => ({ id: `r${i}`, x: i }));
    const primer = w.client.subscribe('p1', cfg());
    await flush();
    controllers.get('default')!.emit({ rows, replace: true });
    controllers.get('default')!.emit({ status: 'ready' });
    await primer.snapshot;

    const adapter = new ProviderClientAdapter<{ id: string; x: number }>({
      client: w.client,
      providerId: 'p1',
    });
    const counts: number[] = [];
    adapter.onRowsReceived((n) => counts.push(n));

    const startPromise = adapter.start();
    await startPromise;

    expect(adapter.getData()).toHaveLength(1200);
    expect(counts.length).toBeGreaterThan(0);
    expect(counts[counts.length - 1]).toBe(1200);
    await adapter.stop();
    await flush();
    primer.unsubscribe();
  });

  it('routes live ticks to onTick after snapshot', async () => {
    const adapter = new ProviderClientAdapter<{ id: string; x: number }>({
      client: w.client,
      providerId: 'p1',
    });
    const ticks: Array<readonly { id: string; x: number }[]> = [];
    adapter.onTick((rows) => ticks.push(rows));

    const startPromise = adapter.start();
    await flush();
    controllers.get('default')!.emit({ rows: [{ id: 'r1', x: 1 }], replace: true });
    controllers.get('default')!.emit({ status: 'ready' });
    await startPromise;

    controllers.get('default')!.emit({ rows: [{ id: 'r1', x: 99 }] });
    await flush();

    expect(ticks).toHaveLength(1);
    expect(ticks[0]).toEqual([{ id: 'r1', x: 99 }]);
    expect(adapter.getData()).toEqual([{ id: 'r1', x: 1 }]);
    await adapter.stop();
  });

  it('stop() detaches; hub stops upstream when this was the last subscriber', async () => {
    const adapter = new ProviderClientAdapter({ client: w.client, providerId: 'p1' });
    const startPromise = adapter.start();
    await flush();
    controllers.get('default')!.emit({ rows: [{ id: 'r1' }], replace: true });
    controllers.get('default')!.emit({ status: 'ready' });
    await startPromise;
    await adapter.stop();
    await flush();

    expect(controllers.get('default')!.stops).toBe(1);

    const other = w.client.subscribe('p1', cfg());
    await flush();
    controllers.get('default')!.emit({ rows: [{ id: 'r2' }], replace: true });
    controllers.get('default')!.emit({ status: 'ready' });
    await other.snapshot;
    other.unsubscribe();
  });

  it('restart() re-attaches with extra and delivers a fresh snapshot', async () => {
    const adapter = new ProviderClientAdapter<{ id: string }>({
      client: w.client,
      providerId: 'p1',
    });
    const snapshots: number[] = [];
    adapter.onSnapshotData((rows) => snapshots.push(rows.length));

    const startPromise = adapter.start();
    await flush();
    controllers.get('default')!.emit({ rows: [{ id: 'r1' }], replace: true });
    controllers.get('default')!.emit({ status: 'ready' });
    await startPromise;

    const restartPromise = adapter.restart({ __refresh: 1 });
    await flush();
    expect(controllers.get('default')!.restarts).toEqual([{ __refresh: 1 }]);

    controllers.get('default')!.emit({ status: 'loading' });
    controllers.get('default')!.emit({ rows: [{ id: 'r2' }], replace: true });
    controllers.get('default')!.emit({ status: 'ready' });
    await restartPromise;

    expect(snapshots).toEqual([1, 1]);
    expect(adapter.getData()).toEqual([{ id: 'r2' }]);
  });

  it('refresh() replays hub cache through onSnapshotData', async () => {
    const adapter = new ProviderClientAdapter<{ id: string }>({
      client: w.client,
      providerId: 'p1',
    });
    const snapshots: number[] = [];
    adapter.onSnapshotData((rows) => snapshots.push(rows.length));

    const startPromise = adapter.start();
    await flush();
    controllers.get('default')!.emit({ rows: [{ id: 'r1' }, { id: 'r2' }], replace: true });
    controllers.get('default')!.emit({ status: 'ready' });
    await startPromise;

    controllers.get('default')!.restarts.length = 0;
    snapshots.length = 0;
    await adapter.refresh();
    expect(snapshots).toEqual([2]);
    expect(adapter.getData()).toHaveLength(2);
    expect(controllers.get('default')!.restarts).toHaveLength(0);
  });

  it('surfaces provider errors through onError', async () => {
    const adapter = new ProviderClientAdapter({ client: w.client, providerId: 'p1' });
    const errors: string[] = [];
    adapter.onError((err) => errors.push(err.message));

    const startPromise = adapter.start();
    await flush();
    controllers.get('default')!.emit({ status: 'error', error: 'upstream blew up' });

    await expect(startPromise).rejects.toThrow();
    expect(errors.some((m) => m.includes('upstream blew up'))).toBe(true);
  });

  it('supports inline cfg for drafts not yet in the catalog', async () => {
    const adapter = new ProviderClientAdapter({
      client: w.client,
      providerId: 'draft-1',
      inlineCfg: cfg('draft'),
    });

    const startPromise = adapter.start();
    await flush();
    controllers.get('draft')!.emit({ rows: [{ id: 'x' }], replace: true });
    controllers.get('draft')!.emit({ status: 'ready' });
    await startPromise;

    expect(adapter.getData()).toEqual([{ id: 'x' }]);
    await adapter.stop();
  });

  it('getConfig throws before start and refresh throws after stop', async () => {
    const adapter = new ProviderClientAdapter({ client: w.client, providerId: 'p1' });

    expect(() => adapter.getConfig()).toThrow(/before start/i);

    const startPromise = adapter.start();
    await flush();
    controllers.get('default')!.emit({ rows: [{ id: 'r1' }], replace: true });
    controllers.get('default')!.emit({ status: 'ready' });
    await startPromise;

    expect(adapter.getConfig().providerType).toBe('mock');
    await adapter.stop();
    await expect(adapter.refresh()).rejects.toThrow(/requires start/i);
  });

  it('delivers status updates to onStatus subscribers', async () => {
    const adapter = new ProviderClientAdapter({ client: w.client, providerId: 'p1' });
    const statuses: string[] = [];
    const off = adapter.onStatus((status) => statuses.push(status));

    const startPromise = adapter.start();
    await flush();
    controllers.get('default')!.emit({ rows: [{ id: 'r1' }], replace: true });
    controllers.get('default')!.emit({ status: 'ready' });
    await startPromise;

    controllers.get('default')!.emit({ status: 'loading' });
    await flush();

    expect(statuses).toContain('ready');
    expect(statuses).toContain('loading');
    off();
  });

  it('restart() without extra re-fetches config after stop cleared state', async () => {
    const adapter = new ProviderClientAdapter<{ id: string }>({
      client: w.client,
      providerId: 'p1',
    });

    const startPromise = adapter.start();
    await flush();
    controllers.get('default')!.emit({ rows: [{ id: 'r1' }], replace: true });
    controllers.get('default')!.emit({ status: 'ready' });
    await startPromise;
    await adapter.stop();

    const restartPromise = adapter.restart();
    await flush();
    controllers.get('default')!.emit({ rows: [{ id: 'r2' }], replace: true });
    controllers.get('default')!.emit({ status: 'ready' });
    await restartPromise;

    expect(adapter.getData()).toEqual([{ id: 'r2' }]);
  });

  it('routes onReset through onSnapshotData and default column defs', async () => {
    w.close();
    w = wireCatalog([{
      ...mockProviderRow('p1'),
      payload: {
        providerType: 'mock',
        keyColumn: 'id',
        __testKey: 'default',
        __providerMeta: { public: true },
      },
    }]);
    await w.client.waitForCatalogReady();

    const adapter = new ProviderClientAdapter<{ id: string }>({
      client: w.client,
      providerId: 'p1',
    });
    const snapshots: Array<readonly { id: string }[]> = [];
    adapter.onSnapshotData((rows) => snapshots.push(rows));

    const startPromise = adapter.start();
    await flush();
    controllers.get('default')!.emit({ rows: [{ id: 'r1' }], replace: true });
    controllers.get('default')!.emit({ status: 'ready' });
    await startPromise;

    expect(adapter.getColumnDefs()).toEqual([]);

    controllers.get('default')!.emit({ rows: [{ id: 'reset' }], replace: true });
    await flush();

    expect(snapshots.some((rows) => rows[0]?.id === 'reset')).toBe(true);
    await adapter.stop();
  });

  it('routes snapshot rejection to onError with a synthesized message', async () => {
    const adapter = new ProviderClientAdapter({ client: w.client, providerId: 'p1' });
    const errors: string[] = [];
    adapter.onError((err) => errors.push(err.message));

    const startPromise = adapter.start();
    await flush();
    controllers.get('default')!.emit({ status: 'error' });

    await expect(startPromise).rejects.toThrow();
    expect(errors.some((m) => m.includes('Provider error') || m.length > 0)).toBe(true);
  });
});
