/**
 * SharedWorkerDataServicesClient tests — wires a real MessageChannel between the
 * client and a Hub instance running in the same process. End-to-end
 * coverage of the round-trip: client.attach → Hub → emit → port →
 * client.handleMessage → listener.onDelta.
 *
 * The Mock provider is registered for these tests since it's the
 * only one that doesn't need an external transport.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInPageWiring, SharedWorkerDataServicesClient } from './SharedWorkerDataServicesClient';
import { SharedWorkerDataServicesHub, type PortLike } from '../worker/SharedWorkerDataServicesHub';
import { registerProvider } from '../providers/registry';
import { isAppDataRequest, isRequest } from '../protocol';
import type { TransportConfig } from '@wellsfargo-starui/types';
import type { ProviderEmit, ProviderHandle } from '../providers/Provider';
import type { ProviderStats, ProviderStatus } from '../protocol';
import type { ConfigManager, AppConfigRow } from '@wellsfargo-starui/core/host/config';
import { DataProviderConfigStore } from '../config/store.js';

interface TestController {
  emit: ProviderEmit;
  stops: number;
  restarts: Array<Record<string, unknown> | undefined>;
}

const controllers = new Map<string, TestController>();
let nextId = 1;

beforeEach(() => {
  controllers.clear();
  nextId = 1;
  registerProvider('mock' as TransportConfig['providerType'], (cfg, emit) => {
    const ctrl: TestController = { emit, stops: 0, restarts: [] };
    const key = (cfg as unknown as { __key?: string }).__key ?? `c-${nextId++}`;
    controllers.set(key, ctrl);
    const handle: ProviderHandle = {
      stop() { ctrl.stops += 1; },
      restart(extra) { ctrl.restarts.push(extra); },
    };
    return handle;
  });
});

const cfg = (key = 'c-1', overrides: Record<string, unknown> = {}): TransportConfig => ({
  providerType: 'mock',
  __key: key,
  keyColumn: 'id',
  ...overrides,
} as unknown as TransportConfig);

interface Captured {
  deltas: Array<{ rows: readonly unknown[]; replace: boolean }>;
  statuses: Array<{ status: ProviderStatus; error?: string }>;
  stats: ProviderStats[];
}

function makeListener(): { listener: { onDelta: (rows: readonly unknown[], replace: boolean) => void; onStatus: (status: ProviderStatus, error?: string) => void }; captured: Captured } {
  const captured: Captured = { deltas: [], statuses: [], stats: [] };
  return {
    captured,
    listener: {
      onDelta: (rows, replace) => captured.deltas.push({ rows, replace }),
      onStatus: (status, error) => captured.statuses.push({ status, error }),
    },
  };
}

interface Wiring {
  hub: SharedWorkerDataServicesHub;
  client: SharedWorkerDataServicesClient;
  close(): void;
}

function attachPortToHub(hub: SharedWorkerDataServicesHub): (port: MessagePort) => void {
  return (port) => {
    const portLike: PortLike = { postMessage: (m) => port.postMessage(m) };
    port.addEventListener('message', (ev: MessageEvent) => {
      if (isRequest(ev.data)) hub.handleRequest(portLike, ev.data);
      else if (isAppDataRequest(ev.data)) hub.handleAppDataRequest(portLike, ev.data);
    });
    port.start();
  };
}

function wire(opts: { configManager?: ConfigManager } = {}): Wiring {
  const hub = new SharedWorkerDataServicesHub({
    ...(opts.configManager ? { configManager: opts.configManager } : {}),
  });
  const wiring = createInPageWiring(attachPortToHub(hub), { disablePageHideClose: true });
  return {
    hub,
    client: wiring.client,
    close: () => {
      wiring.close();
      void hub.dispose();
    },
  };
}

interface DualClientWiring {
  hub: SharedWorkerDataServicesHub;
  clientA: SharedWorkerDataServicesClient;
  clientB: SharedWorkerDataServicesClient;
  close(): void;
}

/** Two MessagePort clients wired to the same in-process hub (OpenFin multi-view shape). */
function wireTwoClients(opts: { configManager?: ConfigManager } = {}): DualClientWiring {
  const hub = new SharedWorkerDataServicesHub({
    ...(opts.configManager ? { configManager: opts.configManager } : {}),
  });
  const attach = attachPortToHub(hub);
  const wiringA = createInPageWiring(attach, { disablePageHideClose: true });
  const wiringB = createInPageWiring(attach, { disablePageHideClose: true });
  return {
    hub,
    clientA: wiringA.client,
    clientB: wiringB.client,
    close: () => {
      wiringA.close();
      wiringB.close();
      void hub.dispose();
    },
  };
}

describe('port-close protocol — clean window close releases the hub-side port', () => {
  it('client.close() sends port-close; the hub drops the port from connectedPorts', async () => {
    const hub = new SharedWorkerDataServicesHub({});
    const attach = attachPortToHub(hub);
    const wiringA = createInPageWiring(attach, { disablePageHideClose: true });
    const wiringB = createInPageWiring(attach, { disablePageHideClose: true });

    // Both ports register on first traffic.
    await wiringA.client.isCatalogReady();
    await wiringB.client.isCatalogReady();
    expect(hub.buildIntrospectSnapshot().connectedPorts).toBe(2);

    // Clean close: without the explicit port-close goodbye the hub can
    // never learn (dead-port postMessage is a silent no-op), and
    // connectedPorts grew forever across a day of window cycles.
    wiringA.client.close();
    await flush();
    expect(hub.buildIntrospectSnapshot().connectedPorts).toBe(1);

    wiringB.client.close();
    await flush();
    expect(hub.buildIntrospectSnapshot().connectedPorts).toBe(0);
    await hub.dispose();
  });

  it('port-close also releases AppData listeners (no heartbeat covers them)', async () => {
    const hub = new SharedWorkerDataServicesHub({});
    const attach = attachPortToHub(hub);
    const wiring = createInPageWiring(attach, { disablePageHideClose: true });

    const mirror = wiring.client.attachAppData({ userId: 'u1' });
    await mirror.attach();
    await flush();
    expect(hub.buildIntrospectSnapshot().appData.listenerCount).toBe(1);

    wiring.client.close();
    await flush();
    expect(hub.buildIntrospectSnapshot().appData.listenerCount).toBe(0);
    await hub.dispose();
  });
});

function stubConfigManager(): ConfigManager & { _rows: Map<string, AppConfigRow> } {
  const rows = new Map<string, AppConfigRow>();
  return {
    _rows: rows,
    getAppId() { return 'TestApp'; },
    async getConfigsByUser(userId: string) {
      return [...rows.values()].filter((r) => r.userId === userId);
    },
    async getAllConfigs() { return [...rows.values()]; },
    async getAllConfigsUnfiltered() { return [...rows.values()]; },
    async getConfigsByComponentTypesUnfiltered(types: string[]) { return [...rows.values()].filter((r) => types.includes(r.componentType)); },
    async getConfig(id: string) { return rows.get(id); },
    async saveConfig(row: AppConfigRow) { rows.set(row.configId, row); },
    async deleteConfig(id: string) { rows.delete(id); },
  } as unknown as ConfigManager & { _rows: Map<string, AppConfigRow> };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await new Promise<void>((r) => setTimeout(r, 0));
  }
}

describe('SharedWorkerDataServicesClient', () => {
  let w: Wiring;

  beforeEach(() => { w = wire(); });
  afterEach(() => w.close());

  it('attach() routes the first replace + status back to the listener', async () => {
    const { listener, captured } = makeListener();
    w.client.attach('p1', cfg(), listener);

    await flush();

    expect(captured.deltas).toHaveLength(1);
    expect(captured.deltas[0]).toMatchObject({ rows: [], replace: true });
    expect(captured.statuses[0]).toMatchObject({ status: 'loading' });
  });

  it('subsequent rows from the provider reach every attached listener', async () => {
    const a = makeListener();
    const b = makeListener();
    w.client.attach('p1', cfg(), a.listener);
    w.client.attach('p1', undefined, b.listener);
    await flush();

    a.captured.deltas.length = 0;
    b.captured.deltas.length = 0;
    controllers.get('c-1')!.emit({ rows: [{ id: 'r1', x: 1 }] });
    await flush();

    expect(a.captured.deltas).toHaveLength(1);
    expect(b.captured.deltas).toHaveLength(1);
    expect(a.captured.deltas[0].rows).toEqual([{ id: 'r1', x: 1 }]);
  });

  it('detach() stops further deliveries to that listener only', async () => {
    const a = makeListener();
    const b = makeListener();
    const subA = w.client.attach('p1', cfg(), a.listener);
    w.client.attach('p1', undefined, b.listener);
    await flush();

    w.client.detach(subA);
    await flush();
    a.captured.deltas.length = 0;
    b.captured.deltas.length = 0;
    controllers.get('c-1')!.emit({ rows: [{ id: 'r2' }] });
    await flush();

    expect(a.captured.deltas).toHaveLength(0);
    expect(b.captured.deltas).toHaveLength(1);
  });

  it('attach with extra triggers provider.restart on a running provider', async () => {
    const { listener } = makeListener();
    w.client.attach('p1', cfg(), listener);
    await flush();

    const { listener: l2 } = makeListener();
    w.client.attach('p1', undefined, l2, { extra: { asOfDate: '2026-04-01' } });
    await flush();

    expect(controllers.get('c-1')!.restarts).toEqual([{ asOfDate: '2026-04-01' }]);
  });

  it('attach with the same extra overlay late-joins without a second restart', async () => {
    const { listener } = makeListener();
    w.client.attach('p1', cfg(), listener, { extra: { asOfDate: '2026-04-01' } });
    await flush();
    const ctrl = controllers.get('c-1')!;
    expect(ctrl.restarts).toEqual([{ asOfDate: '2026-04-01' }]);

    const { listener: l2 } = makeListener();
    w.client.attach('p1', undefined, l2, { extra: { asOfDate: '2026-04-01' } });
    await flush();

    expect(ctrl.restarts).toEqual([{ asOfDate: '2026-04-01' }]);
  });

  it('waitForProviderRunning resolves true once a peer window starts the provider', async () => {
    const waitP = w.client.waitForProviderRunning('p1', { timeoutMs: 1000, intervalMs: 20 });
    await new Promise<void>((r) => setTimeout(r, 30));
    w.client.attach('p1', cfg(), makeListener().listener);
    await flush();
    expect(await waitP).toBe(true);
  });

  it('subscribe with extra waits for fresh snapshot instead of stale cache replay', async () => {
    const primer = w.client.subscribe('p1', cfg());
    await flush();
    controllers.get('c-1')!.emit({ rows: [{ id: 'stale', x: 1 }], replace: true });
    controllers.get('c-1')!.emit({ status: 'ready' });
    await primer.snapshot;

    const commits: Array<readonly { id: string; x: number }[]> = [];
    const handle = w.client.subscribe<{ id: string; x: number }>(
      'p1',
      undefined,
      { extra: { __refresh: 1 } },
    );
    handle.onSnapshotCommit((rows) => commits.push(rows));
    await flush();

    expect(commits).toHaveLength(0);

    controllers.get('c-1')!.emit({ status: 'loading' });
    controllers.get('c-1')!.emit({ rows: [{ id: 'fresh', x: 2 }], replace: true });
    controllers.get('c-1')!.emit({ status: 'ready' });

    const snapshot = await handle.snapshot;
    expect(snapshot).toEqual([{ id: 'fresh', x: 2 }]);
    expect(commits).toEqual([[{ id: 'fresh', x: 2 }]]);
    handle.unsubscribe();
    primer.unsubscribe();
  });

  it('onSnapshotCommit fires again when the provider re-snapshots on an existing subId', async () => {
    const handle = w.client.subscribe<{ id: string; x: number }>('p1', cfg());
    const commits: Array<readonly { id: string; x: number }[]> = [];
    handle.onSnapshotCommit((rows) => commits.push(rows));
    await flush();

    controllers.get('c-1')!.emit({ rows: [{ id: 'r1', x: 1 }], replace: true });
    controllers.get('c-1')!.emit({ status: 'ready' });
    await handle.snapshot;
    expect(commits).toEqual([[{ id: 'r1', x: 1 }]]);

    controllers.get('c-1')!.emit({ status: 'loading' });
    controllers.get('c-1')!.emit({ rows: [{ id: 'r1', x: 99 }], replace: true });
    controllers.get('c-1')!.emit({ status: 'ready' });
    await flush();

    expect(commits).toEqual([
      [{ id: 'r1', x: 1 }],
      [{ id: 'r1', x: 99 }],
    ]);
    handle.unsubscribe();
  });

  it('subscribe() resolves the snapshot promise when the provider becomes ready, then routes updates to onUpdate', async () => {
    const handle = w.client.subscribe<{ id: string; x: number }>('p1', cfg());
    const updates: Array<readonly { id: string; x: number }[]> = [];
    handle.onUpdate((rows) => { updates.push(rows); });
    await flush();

    // Provider's snapshot phase: rows arrive as replace=true, then
    // status flips to ready.
    controllers.get('c-1')!.emit({
      rows: [{ id: 'r1', x: 1 }, { id: 'r2', x: 2 }],
      replace: true,
    });
    controllers.get('c-1')!.emit({ status: 'ready' });

    const snapshot = await handle.snapshot;
    expect(snapshot).toHaveLength(2);
    expect(snapshot[0]).toEqual({ id: 'r1', x: 1 });

    // Subsequent live tick lands in onUpdate, NOT in the snapshot.
    controllers.get('c-1')!.emit({ rows: [{ id: 'r2', x: 99 }] });
    await flush();

    expect(updates).toHaveLength(1);
    expect(updates[0]).toEqual([{ id: 'r2', x: 99 }]);

    handle.unsubscribe();
  });

  it('subscribe() buffers updates that arrive before onUpdate is registered, flushes on registration', async () => {
    const handle = w.client.subscribe<{ id: string; x: number }>('p1', cfg());
    await flush();

    // Snapshot delivery: rows + ready status.
    controllers.get('c-1')!.emit({ rows: [{ id: 'r1', x: 1 }], replace: true });
    controllers.get('c-1')!.emit({ status: 'ready' });
    await handle.snapshot;

    // Now a couple of live updates BEFORE onUpdate is registered.
    controllers.get('c-1')!.emit({ rows: [{ id: 'r1', x: 2 }] });
    controllers.get('c-1')!.emit({ rows: [{ id: 'r1', x: 3 }] });
    await flush();

    // Register the handler — the whole backlog flushes as ONE
    // coalesced call (one grid transaction), arrival order preserved
    // so keyed last-write-wins yields the same final state.
    const seen: Array<readonly { id: string; x: number }[]> = [];
    handle.onUpdate((rows) => { seen.push(rows); });

    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual([
      { id: 'r1', x: 2 },
      { id: 'r1', x: 3 },
    ]);

    handle.unsubscribe();
  });

  it('subscribe() resolves chunked late-join replay into a full assembled snapshot', async () => {
    const rows = Array.from({ length: 1200 }, (_, i) => ({ id: `r${i}` }));
    const primer = w.client.subscribe('p1', cfg());
    await flush();
    controllers.get('c-1')!.emit({ rows, replace: true });
    controllers.get('c-1')!.emit({ status: 'ready' });
    await primer.snapshot;

    const counts: number[] = [];
    const late = w.client.subscribe<{ id: string }>('p1');
    late.onRowsReceived((n) => counts.push(n));
    const snapshot = await late.snapshot;
    expect(snapshot).toHaveLength(1200);
    expect(snapshot[0]).toEqual({ id: 'r0' });
    expect(snapshot[1199]).toEqual({ id: 'r1199' });
    expect(counts.length).toBeGreaterThan(0);
    expect(counts[counts.length - 1]).toBe(1200);
    late.unsubscribe();
    primer.unsubscribe();
  });

  it('subscribe() to an already-ready provider resolves immediately with the cached snapshot', async () => {
    // Provider 1: a primer subscriber that drives the cache to ready.
    const primer = w.client.subscribe('p1', cfg());
    await flush();
    controllers.get('c-1')!.emit({ rows: [{ id: 'r1', x: 1 }, { id: 'r2', x: 2 }], replace: true });
    controllers.get('c-1')!.emit({ status: 'ready' });
    await primer.snapshot;

    // Provider 2: a fresh subscriber attaching AFTER ready while the
    // provider is still warm. The Hub replays the cache + ready status;
    // the subscribe handle's snapshot promise should resolve without
    // any further provider events.
    const late = w.client.subscribe<{ id: string; x: number }>('p1');
    const snapshot = await late.snapshot;
    expect(snapshot).toHaveLength(2);
    late.unsubscribe();
    primer.unsubscribe();
  });

  it('subscribe().refresh() replays hub cache without provider.restart', async () => {
    const handle = w.client.subscribe<{ id: string; x: number }>('p1', cfg());
    await flush();
    controllers.get('c-1')!.emit({ rows: [{ id: 'r1', x: 1 }, { id: 'r2', x: 2 }], replace: true });
    controllers.get('c-1')!.emit({ status: 'ready' });
    await handle.snapshot;

    controllers.get('c-1')!.restarts.length = 0;
    const replayed = await handle.refresh();
    expect(replayed).toHaveLength(2);
    expect(replayed[0]).toEqual({ id: 'r1', x: 1 });
    expect(controllers.get('c-1')!.restarts).toHaveLength(0);

    handle.unsubscribe();
  });

  it('subscribe() surfaces upstream rows-received before chunked hub deltas land', async () => {
    const handle = w.client.subscribe('p1', cfg());
    await flush();
    const counts: number[] = [];
    handle.onRowsReceived((n) => counts.push(n));

    controllers.get('c-1')!.emit({ rowsReceived: 50 });
    controllers.get('c-1')!.emit({ rowsReceived: 120 });
    await flush();
    expect(counts).toEqual([0, 50, 120]);

    controllers.get('c-1')!.emit({
      rows: Array.from({ length: 120 }, (_, i) => ({ id: `r${i}` })),
      replace: true,
    });
    controllers.get('c-1')!.emit({ status: 'ready' });
    await handle.snapshot;
    expect(counts[counts.length - 1]).toBe(120);

    handle.unsubscribe();
  });

  it('subscribe() rejects the snapshot promise when the provider emits an error before snapshot lands', async () => {
    const handle = w.client.subscribe('p1', cfg());
    await flush();

    controllers.get('c-1')!.emit({ status: 'error', error: 'upstream blew up' });

    await expect(handle.snapshot).rejects.toThrow(/upstream blew up/);
    handle.unsubscribe();
  });

  it('subscribe().unsubscribe() rejects a pending snapshot promise so awaiters do not hang', async () => {
    const handle = w.client.subscribe('p1', cfg());
    await flush();
    // Don't emit anything; just unsubscribe.
    handle.unsubscribe();
    await expect(handle.snapshot).rejects.toThrow(/cancelled/);
  });

  it('stop() tears the provider down and surfaces error to subscribers', async () => {
    const { listener, captured } = makeListener();
    w.client.attach('p1', cfg(), listener);
    await flush();

    w.client.stop('p1');
    await flush();

    expect(controllers.get('c-1')!.stops).toBe(1);
    const err = captured.statuses.find((s) => s.status === 'error');
    expect(err).toBeTruthy();
  });

  it('attachStats() delivers stats events at the sampler cadence', async () => {
    const captured: ProviderStats[] = [];
    w.client.attach('p1', cfg(), makeListener().listener);
    w.client.attachStats('p1', { onStats: (s) => captured.push(s) });
    await flush();

    expect(captured.length).toBeGreaterThan(0);
    expect(captured[0]).toMatchObject({ rowCount: 0, subscriberCount: 1 });
  });

  it('close() detaches all listeners and ignores subsequent calls', () => {
    const { listener } = makeListener();
    w.client.attach('p1', cfg(), listener);
    w.client.close();
    expect(() => w.client.attach('p2', cfg('c-2'), listener)).toThrow();
    // Idempotent.
    w.client.close();
  });
});

describe('SharedWorkerDataServicesClient — attachAppData', () => {
  let w: Wiring;
  let cm: ReturnType<typeof stubConfigManager>;
  beforeEach(() => {
    cm = stubConfigManager();
    w = wire({ configManager: cm });
  });
  afterEach(() => w.close());

  it('hub-hydrated state surfaces through mirror sync get on attach', async () => {
    cm._rows.set('ad-1', {
      configId: 'ad-1', appId: 'TestApp', userId: 'alice',
      componentType: 'appdata', componentSubType: 'appdata',
      isTemplate: false, displayText: 'positions',
      payload: { values: { asOfDate: '2026-04-01' } },
      createdBy: 'alice', updatedBy: 'alice',
      creationTime: '0', updatedTime: '0',
    } as AppConfigRow);
    await w.hub.hydrateAppData('alice');

    const mirror = w.client.attachAppData({ userId: 'alice' });
    await mirror.attach();
    await mirror.ready();

    expect(mirror.get('positions', 'asOfDate')).toBe('2026-04-01');
  });

  it('two mirrors converge on a write', async () => {
    await w.hub.hydrateAppData('alice');
    const a = w.client.attachAppData({ userId: 'alice', subId: 'a' });
    const b = w.client.attachAppData({ userId: 'alice', subId: 'b' });
    await a.attach();
    await b.attach();
    await Promise.all([a.ready(), b.ready()]);

    await a.set('positions', 'asOfDate', '2026-05-08');
    expect(b.get('positions', 'asOfDate')).toBe('2026-05-08');
  });

  it('detachAppData stops further deltas reaching the mirror', async () => {
    await w.hub.hydrateAppData('alice');
    const a = w.client.attachAppData({ userId: 'alice', subId: 'a' });
    const b = w.client.attachAppData({ userId: 'alice', subId: 'b' });
    await a.attach();
    await b.attach();
    await Promise.all([a.ready(), b.ready()]);

    w.client.detachAppData(a);
    await b.set('positions', 'asOfDate', '2026-05-08');

    // a stayed pre-detach; its sync state is whatever the snapshot held.
    expect(a.get('positions', 'asOfDate')).toBeUndefined();
    expect(b.get('positions', 'asOfDate')).toBe('2026-05-08');
  });

  it('close() clears AppData mirror routing', async () => {
    await w.hub.hydrateAppData('alice');
    const a = w.client.attachAppData({ userId: 'alice', subId: 'a' });
    await a.attach();
    await a.ready();
    w.client.close();

    // After close, set() resolves but the underlying postMessage is a
    // no-op (port closed). The mirror's pending ack stays unresolved
    // unless the client surfaces an error. Verify no throw.
    // The ack-resolution path is exercised in the AppDataMirror tests
    // (in-process, no port).
    expect(() => w.client.detachAppData(a)).not.toThrow();
  });
});

function mockProviderRow(id: string, testKey = 'c-1'): AppConfigRow {
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
      __key: testKey,
      __providerMeta: { public: true },
    },
    createdBy: 'dev1',
    updatedBy: 'dev1',
    creationTime: '2026-01-01T00:00:00.000Z',
    updatedTime: '2026-01-01T00:00:00.000Z',
  };
}

describe('SharedWorkerDataServicesClient — config catalog RPC', () => {
  it('waitForCatalogReady resolves when the hub catalog is hydrated', async () => {
    const cm = stubConfigManager();
    cm._rows.set('p1', mockProviderRow('p1'));
    const w = wire({ configManager: cm });
    await w.hub.hydrateCatalog();
    await w.client.waitForCatalogReady();
    w.close();
  });

  it('onCatalogChange fires with scoped detail after row invalidate', async () => {
    const cm = stubConfigManager();
    cm._rows.set('p1', mockProviderRow('p1'));
    const w = wire({ configManager: cm });
    await w.hub.hydrateCatalog();

    const details: Array<{ providerId?: string; full?: boolean }> = [];
    const off = w.client.onCatalogChange((detail) => { details.push(detail); });
    await w.client.invalidateConfig('p1');
    await flush();
    expect(details).toEqual([{ providerId: 'p1', full: false }]);
    off();
    w.close();
  });

  it('getProviderConfig and listProviderConfigs round-trip through the hub', async () => {
    const cm = stubConfigManager();
    cm._rows.set('p1', mockProviderRow('p1'));
    cm._rows.set('p2', mockProviderRow('p2', 'c-2'));
    const w = wire({ configManager: cm });
    await w.hub.hydrateCatalog();

    const one = await w.client.getProviderConfig('p1');
    expect(one?.providerId).toBe('p1');

    const all = await w.client.listProviderConfigs();
    expect(all.map((p) => p.providerId).sort()).toEqual(['p1', 'p2']);

    w.close();
  });

  it('cfg-free subscribe starts a provider from the worker catalog', async () => {
    const cm = stubConfigManager();
    cm._rows.set('p1', mockProviderRow('p1'));
    const w = wire({ configManager: cm });
    await w.hub.hydrateCatalog();

    const handle = w.client.subscribe<{ id: string }>('p1');
    await flush();

    expect(handle).toBeTruthy();
    controllers.get('c-1')!.emit({ rows: [{ id: 'r1' }], replace: true });
    controllers.get('c-1')!.emit({ status: 'ready' });
    const snapshot = await handle.snapshot;
    expect(snapshot).toEqual([{ id: 'r1' }]);
    handle.unsubscribe();
    w.close();
  });

  it('second hub client cfg-free attach receives snapshot cached by the first client', async () => {
    const cm = stubConfigManager();
    cm._rows.set('p1', mockProviderRow('p1'));
    const dual = wireTwoClients({ configManager: cm });
    await dual.hub.hydrateCatalog();
    await dual.clientA.waitForCatalogReady();
    await dual.clientB.waitForCatalogReady();

    const primer = dual.clientA.subscribe('p1', cfg());
    await flush();
    controllers.get('c-1')!.emit({
      rows: [{ id: 'r1' }, { id: 'r2' }],
      replace: true,
    });
    controllers.get('c-1')!.emit({ status: 'ready' });
    await primer.snapshot;

    const late = dual.clientB.subscribe<{ id: string }>('p1');
    const snapshot = await late.snapshot;
    expect(snapshot).toEqual([{ id: 'r1' }, { id: 'r2' }]);
    expect(controllers.get('c-1')!.restarts).toHaveLength(0);

    primer.unsubscribe();
    late.unsubscribe();
    dual.close();
  });

  it('live ticks reach every settled subscriber across two hub clients', async () => {
    const dual = wireTwoClients();
    const handleA = dual.clientA.subscribe<{ id: string; x: number }>('p1', cfg());
    const handleB = dual.clientB.subscribe<{ id: string; x: number }>('p1');
    await flush();
    controllers.get('c-1')!.emit({
      rows: [{ id: 'r1', x: 1 }],
      replace: true,
    });
    controllers.get('c-1')!.emit({ status: 'ready' });
    await handleA.snapshot;
    await handleB.snapshot;

    const updatesA: Array<readonly { id: string; x: number }[]> = [];
    const updatesB: Array<readonly { id: string; x: number }[]> = [];
    handleA.onUpdate((rows) => updatesA.push(rows));
    handleB.onUpdate((rows) => updatesB.push(rows));

    controllers.get('c-1')!.emit({ rows: [{ id: 'r1', x: 42 }] });
    await flush();

    expect(updatesA).toEqual([[{ id: 'r1', x: 42 }]]);
    expect(updatesB).toEqual([[{ id: 'r1', x: 42 }]]);

    handleA.unsubscribe();
    handleB.unsubscribe();
    dual.close();
  });

  it('configStore.save() invalidates the worker catalog so getProviderConfig sees updates', async () => {
    const cm = stubConfigManager();
    cm._rows.set('p1', mockProviderRow('p1'));
    const w = wire({ configManager: cm });
    await w.hub.hydrateCatalog();

    const store = new DataProviderConfigStore(
      cm,
      (providerId) => w.client.invalidateConfig(providerId),
    );

    await store.save({
      providerId: 'p1',
      name: 'Renamed',
      providerType: 'mock',
      config: { providerType: 'mock', keyColumn: 'id', __key: 'c-1' } as never,
      userId: 'system',
      public: true,
    }, 'dev1');
    await flush();

    const cfg = await w.client.getProviderConfig('p1');
    expect(cfg?.name).toBe('Renamed');
    w.close();
  });
});

describe('SharedWorkerDataServicesClient — thin field-level deltas end-to-end', () => {
  let w: Wiring;
  beforeEach(() => { w = wire(); });
  afterEach(() => w.close());

  /** Subscribe to a thin-delta provider and settle a 1-row snapshot. */
  async function settledThinHandle() {
    const handle = w.client.subscribe<Record<string, unknown>>(
      'p1',
      cfg('c-1', { thinDeltas: true }),
    );
    await flush();
    controllers.get('c-1')!.emit({
      rows: [{ id: 'r1', px: 1, qty: 10, note: 'keep' }],
      replace: true,
    });
    controllers.get('c-1')!.emit({ status: 'ready' });
    await handle.snapshot;
    return handle;
  }

  it('merges a field patch into the previous full row — consumer sees a complete row', async () => {
    const handle = await settledThinHandle();
    const updates: Array<readonly Record<string, unknown>[]> = [];
    handle.onUpdate((rows) => updates.push(rows));

    controllers.get('c-1')!.emit({ rows: [{ id: 'r1', px: 2, qty: 10, note: 'keep' }] });
    await flush();

    expect(updates).toEqual([[{ id: 'r1', px: 2, qty: 10, note: 'keep' }]]);
    handle.unsubscribe();
  });

  it('the merged row is a NEW object — the previous row value is never mutated', async () => {
    const handle = await settledThinHandle();
    const snapshotRow = (await handle.snapshot)[0];
    const updates: Array<readonly Record<string, unknown>[]> = [];
    handle.onUpdate((rows) => updates.push(rows));

    controllers.get('c-1')!.emit({ rows: [{ id: 'r1', px: 2, qty: 10, note: 'keep' }] });
    await flush();

    expect(updates[0][0]).not.toBe(snapshotRow);
    expect(snapshotRow).toEqual({ id: 'r1', px: 1, qty: 10, note: 'keep' });
    handle.unsubscribe();
  });

  it('applies field removals from the patch', async () => {
    const handle = await settledThinHandle();
    const updates: Array<readonly Record<string, unknown>[]> = [];
    handle.onUpdate((rows) => updates.push(rows));

    controllers.get('c-1')!.emit({ rows: [{ id: 'r1', px: 1, qty: 10 }] }); // note removed
    await flush();

    expect(updates).toEqual([[{ id: 'r1', px: 1, qty: 10 }]]);
    expect('note' in (updates[0][0] as object)).toBe(false);
    handle.unsubscribe();
  });

  it('delivers inserts (new keys) as full rows', async () => {
    const handle = await settledThinHandle();
    const updates: Array<readonly Record<string, unknown>[]> = [];
    handle.onUpdate((rows) => updates.push(rows));

    controllers.get('c-1')!.emit({ rows: [{ id: 'r2', px: 5 }] });
    await flush();

    expect(updates).toEqual([[{ id: 'r2', px: 5 }]]);
    handle.unsubscribe();
  });

  it('chains patches across ticks (mirror tracks the merged row)', async () => {
    const handle = await settledThinHandle();
    const updates: Array<readonly Record<string, unknown>[]> = [];
    handle.onUpdate((rows) => updates.push(rows));

    controllers.get('c-1')!.emit({ rows: [{ id: 'r1', px: 2, qty: 10, note: 'keep' }] });
    await flush();
    controllers.get('c-1')!.emit({ rows: [{ id: 'r1', px: 2, qty: 99, note: 'keep' }] });
    await flush();

    expect(updates).toEqual([
      [{ id: 'r1', px: 2, qty: 10, note: 'keep' }],
      [{ id: 'r1', px: 2, qty: 99, note: 'keep' }],
    ]);
    handle.unsubscribe();
  });

  it('a second window attaching mid-stream gets full replay then merges patches', async () => {
    const handle = await settledThinHandle();

    const late = w.client.subscribe<Record<string, unknown>>('p1', undefined);
    await flush();
    const snapshot = await late.snapshot;
    expect(snapshot).toEqual([{ id: 'r1', px: 1, qty: 10, note: 'keep' }]);

    const updates: Array<readonly Record<string, unknown>[]> = [];
    late.onUpdate((rows) => updates.push(rows));
    controllers.get('c-1')!.emit({ rows: [{ id: 'r1', px: 7, qty: 10, note: 'keep' }] });
    await flush();

    expect(updates).toEqual([[{ id: 'r1', px: 7, qty: 10, note: 'keep' }]]);
    handle.unsubscribe();
    late.unsubscribe();
  });
});

describe('SharedWorkerDataServicesClient — columnar wire format end-to-end', () => {
  let w: Wiring;
  beforeEach(() => { w = wire(); });
  afterEach(() => w.close());

  it('decodes a columnar snapshot transparently — consumer sees plain rows', async () => {
    const handle = w.client.subscribe<Record<string, unknown>>(
      'p1',
      cfg('c-1', { wireFormat: 'columnar' }),
    );
    await flush();
    controllers.get('c-1')!.emit({
      rows: [
        { id: 'r1', px: 1.25, live: true, note: null },
        { id: 'r2', px: 2.5, live: false, note: 'x' },
      ],
      replace: true,
    });
    controllers.get('c-1')!.emit({ status: 'ready' });

    const snapshot = await handle.snapshot;
    expect(snapshot).toEqual([
      { id: 'r1', px: 1.25, live: true, note: null },
      { id: 'r2', px: 2.5, live: false, note: 'x' },
    ]);
    handle.unsubscribe();
  });

  it('decodes large columnar live ticks through onUpdate', async () => {
    const handle = w.client.subscribe<Record<string, unknown>>(
      'p1',
      cfg('c-1', { wireFormat: 'columnar' }),
    );
    await flush();
    controllers.get('c-1')!.emit({ rows: [{ id: 'seed', x: 0 }], replace: true });
    controllers.get('c-1')!.emit({ status: 'ready' });
    await handle.snapshot;

    const updates: Array<readonly Record<string, unknown>[]> = [];
    handle.onUpdate((rows) => updates.push(rows));
    controllers.get('c-1')!.emit({
      rows: Array.from({ length: 100 }, (_, i) => ({ id: `r${i}`, x: i * 1.5 })),
    });
    await flush();

    expect(updates).toHaveLength(1);
    expect(updates[0]).toHaveLength(100);
    expect(updates[0][99]).toEqual({ id: 'r99', x: 148.5 });
    handle.unsubscribe();
  });
});

describe('SharedWorkerDataServicesClient — edge cases and error paths', () => {
  let w: Wiring;
  beforeEach(() => { w = wire(); });
  afterEach(() => w.close());

  it('detach() is a no-op for unknown subIds', async () => {
    w.client.detach('missing-sub');
    await flush();
    expect(w.client.hasDataSubscription('missing-sub')).toBe(false);
  });

  it('hasDataSubscription reflects attach/detach lifecycle', async () => {
    const { listener } = makeListener();
    const subId = w.client.attach('p1', cfg(), listener);
    expect(w.client.hasDataSubscription(subId)).toBe(true);
    w.client.detach(subId);
    expect(w.client.hasDataSubscription(subId)).toBe(false);
  });

  it('waitForProviderRunning resolves false after timeout', async () => {
    const result = await w.client.waitForProviderRunning('never-started', {
      timeoutMs: 60,
      intervalMs: 20,
    });
    expect(result).toBe(false);
  });

  it('isProviderRunning returns false when the client is closed', async () => {
    w.client.close();
    expect(await w.client.isProviderRunning('p1')).toBe(false);
  });

  it('isCatalogReady returns false when the client is closed', async () => {
    w.client.close();
    expect(await w.client.isCatalogReady()).toBe(false);
  });

  it('getHubIntrospect throws when the hub reports failure', async () => {
    const orig = w.hub.handleRequest.bind(w.hub);
    w.hub.handleRequest = (port, req) => {
      if (req.kind === 'hub-introspect') {
        port.postMessage({
          kind: 'config-snapshot',
          reqId: req.reqId,
          ok: false,
          error: 'introspect denied',
        });
        return;
      }
      return orig(port, req);
    };
    await expect(w.client.getHubIntrospect()).rejects.toThrow(/introspect denied/);
  });

  it('catalog RPC rejects when the hub returns ok:false', async () => {
    const orig = w.hub.handleRequest.bind(w.hub);
    w.hub.handleRequest = (port, req) => {
      if (req.kind === 'get-config') {
        port.postMessage({
          kind: 'config-snapshot',
          reqId: req.reqId,
          ok: false,
          error: 'missing row',
        });
        return;
      }
      return orig(port, req);
    };
    await expect(w.client.getProviderConfig('missing')).rejects.toThrow(/missing row/);
  });

  it('onCatalogChange isolates throwing listeners', async () => {
    const cm = stubConfigManager();
    cm._rows.set('p1', mockProviderRow('p1'));
    const local = wire({ configManager: cm });
    await local.hub.hydrateCatalog();

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const good = vi.fn();
    local.client.onCatalogChange(() => { throw new Error('listener boom'); });
    local.client.onCatalogChange(good);
    await local.client.invalidateConfig('p1');
    await flush();

    expect(good).toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      '[SharedWorkerDataServicesClient] catalog change listener threw',
      expect.any(Error),
    );
    warnSpy.mockRestore();
    local.close();
  });

  it('subscribe onReset flushes buffered reset deltas on registration', async () => {
    const handle = w.client.subscribe<{ id: string; x: number }>('p1', cfg());
    await flush();
    controllers.get('c-1')!.emit({ rows: [{ id: 'r1', x: 1 }], replace: true });
    controllers.get('c-1')!.emit({ status: 'ready' });
    await handle.snapshot;

    controllers.get('c-1')!.emit({ rows: [{ id: 'r1', x: 99 }], replace: true });
    await flush();

    const resets: Array<readonly { id: string; x: number }[]> = [];
    handle.onReset((rows) => resets.push(rows));
    expect(resets).toEqual([[{ id: 'r1', x: 99 }]]);
    handle.unsubscribe();
  });

  it('subscribe refresh rejects before the initial snapshot settles', async () => {
    const handle = w.client.subscribe('p1', cfg());
    await flush();
    await expect(handle.refresh()).rejects.toThrow(/before the initial snapshot/);
    const snapP = handle.snapshot;
    handle.unsubscribe();
    await expect(snapP).rejects.toThrow(/cancelled/);
  });

  it('subscribe refresh rejects when the provider errors during cache replay', async () => {
    const handle = w.client.subscribe('p1', cfg());
    await flush();
    controllers.get('c-1')!.emit({ rows: [{ id: 'r1' }], replace: true });
    controllers.get('c-1')!.emit({ status: 'ready' });
    await handle.snapshot;

    const refreshP = handle.refresh();
    controllers.get('c-1')!.emit({ status: 'error', error: 'refresh failed' });
    await expect(refreshP).rejects.toThrow(/refresh failed/);
    handle.unsubscribe();
  });

  it('subscribe unsubscribe rejects an in-flight cache refresh', async () => {
    const handle = w.client.subscribe('p1', cfg());
    await flush();
    controllers.get('c-1')!.emit({ rows: [{ id: 'r1' }], replace: true });
    controllers.get('c-1')!.emit({ status: 'ready' });
    await handle.snapshot;

    const refreshP = handle.refresh();
    handle.unsubscribe();
    await expect(refreshP).rejects.toThrow(/cache refresh/);
  });

  it('closed client rejects attach, subscribe, and attachStats', async () => {
    const { listener } = makeListener();
    w.client.close();
    expect(() => w.client.attach('p1', cfg(), listener)).toThrow(/closed/);
    expect(() => w.client.subscribe('p1', cfg())).toThrow(/closed/);
    expect(() => w.client.attachStats('p1', { onStats: vi.fn() })).toThrow(/closed/);
  });

  it('stop() is a no-op after close', async () => {
    const { listener } = makeListener();
    w.client.attach('p1', cfg(), listener);
    await flush();
    w.client.close();
    expect(() => w.client.stop('p1')).not.toThrow();
  });
});

describe('SharedWorkerDataServicesClient — direct port events', () => {
  function wireDirect(subId = 'direct-sub'): {
    client: SharedWorkerDataServicesClient;
    inject: (event: unknown) => Promise<void>;
    close: () => void;
  } {
    const channel = new MessageChannel();
    channel.port2.start();
    const client = new SharedWorkerDataServicesClient(channel.port1, {
      disablePageHideClose: true,
      generateSubId: () => subId,
    });
    return {
      client,
      inject: async (event) => {
        channel.port2.postMessage(event);
        await flush();
      },
      close: () => {
        client.close();
        try { channel.port2.close(); } catch { /* idempotent */ }
      },
    };
  }

  it('ignores delta events for detached subIds', async () => {
    const { client, inject, close } = wireDirect();
    const { listener, captured } = makeListener();
    client.attach('p1', cfg(), listener);
    client.detach('direct-sub');
    await inject({ kind: 'delta', subId: 'direct-sub', rows: [{ id: 'x' }], replace: false });
    expect(captured.deltas).toHaveLength(0);
    close();
  });

  it('surfaces postMessage failures via onStatus error', () => {
    const channel = new MessageChannel();
    const client = new SharedWorkerDataServicesClient(channel.port1, {
      disablePageHideClose: true,
      generateSubId: () => 'err-sub',
    });
    client.attach('p1', cfg(), makeListener().listener);
    vi.spyOn(channel.port1, 'postMessage').mockImplementation(() => {
      throw new Error('port dead');
    });
    const failing = makeListener();
    client.attach('p2', cfg('c-2'), failing.listener);
    expect(failing.captured.statuses.some((s) => s.status === 'error' && s.error === 'port dead')).toBe(true);
    client.close();
  });

  it('logs delta-bin decode failures without crashing', async () => {
    const { client, inject, close } = wireDirect();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    client.attach('p1', cfg(), makeListener().listener);
    await inject({
      kind: 'delta-bin',
      subId: 'direct-sub',
      buf: new TextEncoder().encode('not-json').buffer,
      replace: false,
    });
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining('delta-bin decode failed'),
      'direct-sub',
      'json',
      expect.any(SyntaxError),
    );
    errSpy.mockRestore();
    close();
  });

  it('delta-patch without sub-init is ignored safely', async () => {
    const { client, inject, close } = wireDirect();
    const { listener, captured } = makeListener();
    client.attach('p1', cfg(), listener);
    await inject({
      kind: 'delta-patch',
      subId: 'direct-sub',
      patches: [{ k: 'r1', s: { px: 2 } }],
    });
    expect(captured.deltas).toHaveLength(0);
    close();
  });

  it('merges delta-patch inserts and field updates after sub-init', async () => {
    const { client, inject, close } = wireDirect();
    const { listener, captured } = makeListener();
    client.attach('p1', cfg(), listener);
    await inject({ kind: 'sub-init', subId: 'direct-sub', keyColumn: 'id' });
    await inject({
      kind: 'delta',
      subId: 'direct-sub',
      rows: [{ id: 'r1', px: 1 }],
      replace: true,
    });
    await inject({
      kind: 'delta-patch',
      subId: 'direct-sub',
      patches: [
        { k: 'r1', s: { px: 2 } },
        { k: 'r2', f: { id: 'r2', px: 5 } },
      ],
    });
    expect(captured.deltas).toHaveLength(2);
    expect(captured.deltas[1].rows).toEqual([
      { id: 'r1', px: 2 },
      { id: 'r2', px: 5 },
    ]);
    close();
  });

  it('routes appdata-ack events to every attached mirror', async () => {
    const cm = stubConfigManager();
    const local = wire({ configManager: cm });
    await local.hub.hydrateAppData('alice');
    const a = local.client.attachAppData({ userId: 'alice', subId: 'a' });
    const b = local.client.attachAppData({ userId: 'alice', subId: 'b' });
    await a.attach();
    await b.attach();
    await Promise.all([a.ready(), b.ready()]);

    await a.set('positions', 'asOfDate', '2026-05-08');
    expect(b.get('positions', 'asOfDate')).toBe('2026-05-08');
    local.close();
  });
});

describe('SharedWorkerDataServicesClient — subscription-lost recovery', () => {
  it('re-sends attach when subscription-lost arrives for a data subscription', async () => {
    const channel = new MessageChannel();
    channel.port2.start();
    const posts: unknown[] = [];
    const origPost = channel.port1.postMessage.bind(channel.port1);
    vi.spyOn(channel.port1, 'postMessage').mockImplementation((msg, transfer) => {
      posts.push(msg);
      return origPost(msg, transfer);
    });
    const client = new SharedWorkerDataServicesClient(channel.port1, {
      disablePageHideClose: true,
      generateSubId: () => 's-lost',
    });
    client.attach('p1', cfg(), makeListener().listener);
    posts.length = 0;
    channel.port2.postMessage({ kind: 'subscription-lost', subId: 's-lost' });
    await flush();
    expect(posts.some((m) => (m as { kind?: string; mode?: string }).kind === 'attach'
      && (m as { mode?: string }).mode === 'data')).toBe(true);
    client.close();
  });

  it('re-sends attach when subscription-lost arrives for a stats subscription', async () => {
    const channel = new MessageChannel();
    channel.port2.start();
    const posts: unknown[] = [];
    const origPost = channel.port1.postMessage.bind(channel.port1);
    vi.spyOn(channel.port1, 'postMessage').mockImplementation((msg, transfer) => {
      posts.push(msg);
      return origPost(msg, transfer);
    });
    const client = new SharedWorkerDataServicesClient(channel.port1, {
      disablePageHideClose: true,
      generateSubId: () => 'stats-lost',
    });
    client.attachStats('p1', { onStats: vi.fn() });
    posts.length = 0;
    channel.port2.postMessage({ kind: 'subscription-lost', subId: 'stats-lost' });
    await flush();
    expect(posts.some((m) => (m as { kind?: string; mode?: string }).kind === 'attach'
      && (m as { mode?: string }).mode === 'stats')).toBe(true);
    client.close();
  });
});

