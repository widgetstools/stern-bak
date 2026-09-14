/**
 * PlatformServicesHost — the platform-services worker's brain: config
 * catalog RPCs + AppData, nothing of the data plane. These cases used to
 * run against the data hub; they moved here with the behaviour
 * (worker-split W1c).
 */

import { describe, expect, it } from 'vitest';
import type { ConfigManager, AppConfigRow } from '@wellsfargo-starui/core/host/config';
import { PlatformServicesHost } from './PlatformServicesHost.js';
import type { PortLike } from './hubTypes.js';
import type { AppDataRow } from '../protocol.js';

interface CapturedPort extends PortLike {
  messages: unknown[];
}

function makePort(): CapturedPort {
  const messages: unknown[] = [];
  return {
    messages,
    postMessage(m: unknown) {
      messages.push({ ...(m as object) });
    },
  };
}

function appDataRow(configId: string, name: string, values: Record<string, unknown> = {}): AppDataRow {
  return { configId, name, isPublic: true, values, userId: 'system' };
}

function mockProviderRow(id: string): AppConfigRow {
  return {
    configId: id,
    appId: 'TestApp',
    userId: 'system',
    componentType: 'data-provider',
    componentSubType: 'mock',
    isTemplate: false,
    displayText: id,
    payload: { providerType: 'mock', keyColumn: 'id', __providerMeta: { public: true } },
    createdBy: 'dev1',
    updatedBy: 'dev1',
    creationTime: '2026-01-01T00:00:00.000Z',
    updatedTime: '2026-01-01T00:00:00.000Z',
  };
}

function mockAppDataProviderRow(id: string, name: string, values: Record<string, string>): AppConfigRow {
  const variables: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    variables[key] = { key, value, type: 'string', durability: 'volatile' };
  }
  return {
    configId: id,
    appId: 'TestApp',
    userId: 'dev1',
    componentType: 'data-provider',
    componentSubType: 'appdata',
    isTemplate: false,
    displayText: name,
    payload: { providerType: 'appdata', variables, __providerMeta: {} },
    createdBy: 'dev1',
    updatedBy: 'dev1',
    creationTime: '2026-01-01T00:00:00.000Z',
    updatedTime: '2026-01-01T00:00:00.000Z',
  };
}

function mockConfigManager(rows: Map<string, AppConfigRow>, listeners: Array<(id: string) => void> = []): ConfigManager {
  return {
    getAppId() { return 'TestApp'; },
    onConfigChanged(fn: (id: string) => void) { listeners.push(fn); return () => { listeners.splice(listeners.indexOf(fn), 1); }; },
    async getAllConfigsUnfiltered() { return [...rows.values()]; },
    async getConfigsByComponentTypesUnfiltered(types: string[]) {
      return [...rows.values()].filter((r) => types.includes(r.componentType));
    },
    async getConfig(id: string) { return rows.get(id); },
    async saveConfig(row: AppConfigRow) { rows.set(row.configId, row); },
    async deleteConfig(id: string) { rows.delete(id); },
  } as unknown as ConfigManager;
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const byReqId = (port: CapturedPort, reqId: string) =>
  port.messages.find((m) => (m as { reqId?: string }).reqId === reqId);

describe('PlatformServicesHost — AppData', () => {
  it('snapshot delivered on attach reflects the seed', () => {
    const host = new PlatformServicesHost();
    const port = makePort();
    host.handleAppDataRequest(port, {
      kind: 'appdata-attach',
      subId: 'a',
      seed: [appDataRow('a', 'positions', { asOfDate: '2026-04-01' })],
    });
    expect(port.messages).toHaveLength(1);
    expect(port.messages[0]).toMatchObject({
      kind: 'appdata-snapshot',
      subId: 'a',
      rows: [{ configId: 'a', name: 'positions' }],
    });
  });

  it('second attacher sees the previously-seeded snapshot (no double-hydrate)', async () => {
    const host = new PlatformServicesHost();
    const portA = makePort();
    const portB = makePort();
    host.handleAppDataRequest(portA, {
      kind: 'appdata-attach',
      subId: 'a',
      seed: [appDataRow('a', 'positions', { asOfDate: '2026-04-01' })],
    });
    host.handleAppDataRequest(portB, {
      kind: 'appdata-attach',
      subId: 'b',
      seed: [appDataRow('z', 'wouldOverwrite')],
    });
    await Promise.resolve();
    expect(portB.messages[0]).toMatchObject({
      kind: 'appdata-snapshot',
      rows: [{ configId: 'a', name: 'positions' }],
    });
  });

  it('attach is throttled to the hydrate read; config-invalidate resyncs persisted rows', async () => {
    const rows = new Map<string, AppConfigRow>([
      ['ad-1', mockAppDataProviderRow('ad-1', 'App1Data', { userId: 'alice' })],
    ]);
    const host = new PlatformServicesHost({ configManager: mockConfigManager(rows) });
    await host.hydrateAppData();

    const portA = makePort();
    host.handleAppDataRequest(portA, { kind: 'appdata-attach', subId: 'a' });
    await tick();
    expect(portA.messages[0]).toMatchObject({
      kind: 'appdata-snapshot',
      rows: [expect.objectContaining({ name: 'App1Data' })],
    });

    rows.set('ad-2', mockAppDataProviderRow('ad-2', 'App2Data', { clientId: 'desk-1' }));

    // Attach alone must NOT rescan IndexedDB — a burst of opening windows
    // would serialize one table scan per window in front of every
    // snapshot reply. The row persisted out-of-band stays invisible until
    // the next resync trigger.
    const portB = makePort();
    host.handleAppDataRequest(portB, { kind: 'appdata-attach', subId: 'b' });
    await tick();
    expect(portB.messages[0]).toMatchObject({
      kind: 'appdata-snapshot',
      rows: [expect.objectContaining({ name: 'App1Data' })],
    });

    // `config-invalidate` (the editor-save path) resyncs from the store
    // and fans the new row out to attached mirrors.
    host.handleRequest(portB, { kind: 'config-invalidate', reqId: 'inv1' });
    await tick();
    expect(portB.messages).toContainEqual(
      expect.objectContaining({
        kind: 'appdata-delta',
        op: 'upsert',
        row: expect.objectContaining({ name: 'App2Data' }),
      }),
    );

    const portC = makePort();
    host.handleAppDataRequest(portC, { kind: 'appdata-attach', subId: 'c' });
    await tick();
    expect(portC.messages[0]).toMatchObject({
      kind: 'appdata-snapshot',
      rows: expect.arrayContaining([
        expect.objectContaining({ name: 'App1Data' }),
        expect.objectContaining({ name: 'App2Data' }),
      ]),
    });
  });

  it('set fans out a delta to every attached subscriber including originator', () => {
    const host = new PlatformServicesHost();
    const portA = makePort();
    const portB = makePort();
    host.handleAppDataRequest(portA, { kind: 'appdata-attach', subId: 'a', seed: [] });
    host.handleAppDataRequest(portB, { kind: 'appdata-attach', subId: 'b' });

    const next = appDataRow('a1', 'positions', { asOfDate: '2026-05-08' });
    host.handleAppDataRequest(portA, { kind: 'appdata-set', reqId: 'r1', row: next });

    // A: snapshot, delta, ack (broadcast happens before ack). B: snapshot, delta.
    expect(portA.messages).toHaveLength(3);
    expect(portB.messages).toHaveLength(2);
    expect(portA.messages[1]).toMatchObject({ kind: 'appdata-delta', subId: 'a', op: 'upsert', row: { configId: 'a1' } });
    expect(portA.messages[2]).toMatchObject({ kind: 'appdata-ack', reqId: 'r1', ok: true });
    expect(portB.messages[1]).toMatchObject({ kind: 'appdata-delta', subId: 'b', op: 'upsert' });
  });

  it('remove fans out a remove delta + ack', () => {
    const host = new PlatformServicesHost();
    const port = makePort();
    host.handleAppDataRequest(port, {
      kind: 'appdata-attach', subId: 'a',
      seed: [appDataRow('a1', 'positions')],
    });
    host.handleAppDataRequest(port, { kind: 'appdata-remove', reqId: 'r1', configId: 'a1' });
    const lastTwo = port.messages.slice(-2);
    expect(lastTwo[0]).toMatchObject({ kind: 'appdata-delta', op: 'remove' });
    expect(lastTwo[1]).toMatchObject({ kind: 'appdata-ack', reqId: 'r1', ok: true });
  });

  it('detach stops further deltas reaching the listener', () => {
    const host = new PlatformServicesHost();
    const portA = makePort();
    const portB = makePort();
    host.handleAppDataRequest(portA, { kind: 'appdata-attach', subId: 'a', seed: [] });
    host.handleAppDataRequest(portB, { kind: 'appdata-attach', subId: 'b' });
    host.handleAppDataRequest(portA, { kind: 'appdata-detach', subId: 'a' });

    portA.messages.length = 0;
    portB.messages.length = 0;
    host.handleAppDataRequest(portB, { kind: 'appdata-set', reqId: 'r2', row: appDataRow('a2', 'trades') });
    expect(portA.messages).toHaveLength(0);
    expect(portB.messages).toHaveLength(2);
  });

  it('onPortClosed cleans up appdata listeners', () => {
    const host = new PlatformServicesHost();
    const portA = makePort();
    const portB = makePort();
    host.handleAppDataRequest(portA, { kind: 'appdata-attach', subId: 'a', seed: [] });
    host.handleAppDataRequest(portB, { kind: 'appdata-attach', subId: 'b' });
    host.onPortClosed(portA);

    portA.messages.length = 0;
    portB.messages.length = 0;
    host.handleAppDataRequest(portB, { kind: 'appdata-set', reqId: 'r3', row: appDataRow('a3', 'orders') });
    expect(portA.messages).toHaveLength(0);
    expect(portB.messages).toHaveLength(2);
  });
});

describe('PlatformServicesHost — config catalog RPCs', () => {
  it('hub-ready, get-config, and list-configs respond from the hydrated catalog', async () => {
    const rows = new Map([['p1', mockProviderRow('p1')], ['p2', mockProviderRow('p2')]]);
    const host = new PlatformServicesHost({ configManager: mockConfigManager(rows) });
    await host.hydrateCatalog();
    const port = makePort();

    host.handleRequest(port, { kind: 'hub-ready', reqId: 'ready-1' });
    host.handleRequest(port, { kind: 'get-config', reqId: 'get-1', providerId: 'p1' });
    host.handleRequest(port, { kind: 'list-configs', reqId: 'list-1' });
    await tick();

    expect(byReqId(port, 'ready-1')).toMatchObject({ kind: 'config-snapshot', ok: true, ready: true });
    expect(byReqId(port, 'get-1')).toMatchObject({ kind: 'config-snapshot', ok: true, config: { providerId: 'p1' } });
    expect(byReqId(port, 'list-1')).toMatchObject({
      kind: 'config-snapshot',
      ok: true,
      configs: expect.arrayContaining([
        expect.objectContaining({ providerId: 'p1' }),
        expect.objectContaining({ providerId: 'p2' }),
      ]),
    });
  });

  it('get-config resolves a provider on demand before the catalog preloads', async () => {
    const rows = new Map([['p1', mockProviderRow('p1')]]);
    const host = new PlatformServicesHost({ configManager: mockConfigManager(rows) });
    const port = makePort();

    host.handleRequest(port, { kind: 'hub-ready', reqId: 'ready-0' });
    host.handleRequest(port, { kind: 'get-config', reqId: 'get-od', providerId: 'p1' });
    await tick();

    expect(byReqId(port, 'ready-0')).toMatchObject({ ok: true, ready: false });
    expect(byReqId(port, 'get-od')).toMatchObject({ kind: 'config-snapshot', ok: true, config: { providerId: 'p1' } });
  });

  it('config-invalidate reloads a single catalog row and broadcasts catalog-ready', async () => {
    const rows = new Map([['p1', { ...mockProviderRow('p1'), displayText: 'Original' }]]);
    const host = new PlatformServicesHost({ configManager: mockConfigManager(rows) });
    await host.hydrateCatalog();
    const port = makePort();

    rows.set('p1', { ...mockProviderRow('p1'), displayText: 'Updated' });
    host.handleRequest(port, { kind: 'config-invalidate', reqId: 'inv-1', providerId: 'p1' });
    await tick();

    expect(byReqId(port, 'inv-1')).toMatchObject({ kind: 'config-snapshot', ok: true });
    expect(port.messages).toContainEqual(expect.objectContaining({ kind: 'catalog-ready', providerId: 'p1' }));
    port.messages.length = 0;
    host.handleRequest(port, { kind: 'get-config', reqId: 'get-2', providerId: 'p1' });
    await tick();
    expect(byReqId(port, 'get-2')).toMatchObject({ ok: true, config: { providerId: 'p1', name: 'Updated' } });
  });

  it('answers "not available" when no ConfigManager backs the host', () => {
    const host = new PlatformServicesHost();
    const port = makePort();
    host.handleRequest(port, { kind: 'list-configs', reqId: 'list-x' });
    expect(byReqId(port, 'list-x')).toMatchObject({ ok: false, error: expect.stringContaining('not available') });
  });

  it('ignores data-plane requests instead of faking a hub', () => {
    const host = new PlatformServicesHost();
    const port = makePort();
    host.handleRequest(port, { kind: 'attach', subId: 's1', providerId: 'p1', mode: 'data' });
    host.handleRequest(port, { kind: 'stop', providerId: 'p1' });
    expect(port.messages).toHaveLength(0);
  });
});

describe('PlatformServicesHost — introspection', () => {
  it('hub-introspect reports catalog rows as idle and AppData, with zero providers running', async () => {
    const rows = new Map([['p1', mockProviderRow('p1')], ['p2', mockProviderRow('p2')]]);
    const host = new PlatformServicesHost({ configManager: mockConfigManager(rows) });
    await host.hydrateCatalog();
    const port = makePort();
    host.handleAppDataRequest(port, { kind: 'appdata-attach', subId: 'appdata-1' });
    host.handleAppDataRequest(port, {
      kind: 'appdata-upsert',
      reqId: 'upsert-1',
      row: appDataRow('cfg-positions', 'positions', { asOfDate: '2026-05-28' }),
    });
    await tick();

    host.handleRequest(port, { kind: 'hub-introspect', reqId: 'intro-1' });
    const snap = byReqId(port, 'intro-1') as { ok: boolean; introspect?: ReturnType<PlatformServicesHost['buildIntrospectSnapshot']> };
    expect(snap).toMatchObject({ kind: 'config-snapshot', ok: true });
    expect(snap.introspect?.runningProviderCount).toBe(0);
    expect(snap.introspect?.catalogReady).toBe(true);
    expect(snap.introspect?.catalogProviderCount).toBe(2);
    expect(snap.introspect?.providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ providerId: 'p1', name: 'p1', running: false }),
        expect.objectContaining({ providerId: 'p2', name: 'p2', running: false }),
      ]),
    );
    expect(snap.introspect?.appData.listenerCount).toBe(1);
    expect(snap.introspect?.appData.rows).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'positions', keyCount: 1, values: { asOfDate: '2026-05-28' } })]),
    );
  });

  it('provider-running is always false — no provider ever runs here', () => {
    const host = new PlatformServicesHost();
    const port = makePort();
    host.handleRequest(port, { kind: 'provider-running', reqId: 'pr-1', providerId: 'p1' });
    expect(byReqId(port, 'pr-1')).toMatchObject({ ok: true, running: false });
  });
});

describe('PlatformServicesHost — single writer (W2)', () => {
  it('config-save persists a catalog row, refreshes the catalog before replying, and broadcasts catalog-ready', async () => {
    const rows = new Map([['p1', { ...mockProviderRow('p1'), displayText: 'Original' }]]);
    const host = new PlatformServicesHost({ configManager: mockConfigManager(rows) });
    await host.hydrateCatalog();
    const port = makePort();

    host.handleRequest(port, { kind: 'config-save', reqId: 'save-1', row: { ...mockProviderRow('p1'), displayText: 'Renamed' } });
    await tick();

    expect(byReqId(port, 'save-1')).toMatchObject({ ok: true, row: expect.objectContaining({ displayText: 'Renamed' }) });
    expect(port.messages).toContainEqual(expect.objectContaining({ kind: 'catalog-ready', providerId: 'p1' }));
    host.handleRequest(port, { kind: 'list-configs', reqId: 'list-1' });
    expect(byReqId(port, 'list-1')).toMatchObject({ configs: [expect.objectContaining({ providerId: 'p1', name: 'Renamed' })] });
  });

  it('config-delete drops the row from the catalog', async () => {
    const rows = new Map([['p1', mockProviderRow('p1')], ['p2', mockProviderRow('p2')]]);
    const host = new PlatformServicesHost({ configManager: mockConfigManager(rows) });
    await host.hydrateCatalog();
    const port = makePort();

    host.handleRequest(port, { kind: 'config-delete', reqId: 'del-1', configId: 'p1' });
    await tick();

    expect(byReqId(port, 'del-1')).toMatchObject({ ok: true });
    host.handleRequest(port, { kind: 'list-configs', reqId: 'list-2' });
    expect(byReqId(port, 'list-2')).toMatchObject({ configs: [expect.objectContaining({ providerId: 'p2' })] });
  });

  it('a config change from ANOTHER context (change notifier) refreshes the catalog and broadcasts', async () => {
    const listeners: Array<(id: string) => void> = [];
    const rows = new Map([['p1', { ...mockProviderRow('p1'), displayText: 'Original' }]]);
    const host = new PlatformServicesHost({ configManager: mockConfigManager(rows, listeners) });
    await host.hydrateCatalog();
    const port = makePort();
    host.handleRequest(port, { kind: 'hub-ready', reqId: 'touch' });
    port.messages.length = 0;

    rows.set('p1', { ...mockProviderRow('p1'), displayText: 'Edited elsewhere' });
    rows.set('grid-1', { ...mockProviderRow('grid-1'), componentType: 'markets-grid-profile-set', componentSubType: '' });
    for (const fn of listeners) { fn('p1'); fn('grid-1'); }
    await tick();
    await tick();

    expect(port.messages.filter((m) => (m as { kind?: string }).kind === 'catalog-ready')).toEqual([
      expect.objectContaining({ kind: 'catalog-ready', providerId: 'p1' }),
    ]);
    host.handleRequest(port, { kind: 'get-config', reqId: 'get-1', providerId: 'p1' });
    await tick();
    expect(byReqId(port, 'get-1')).toMatchObject({ config: expect.objectContaining({ name: 'Edited elsewhere' }) });
  });

  it('a row deleted in another context leaves the catalog too', async () => {
    const listeners: Array<(id: string) => void> = [];
    const rows = new Map([['p1', mockProviderRow('p1')]]);
    const host = new PlatformServicesHost({ configManager: mockConfigManager(rows, listeners) });
    await host.hydrateCatalog();
    const port = makePort();
    host.handleRequest(port, { kind: 'hub-ready', reqId: 'touch' }); // ports register on first traffic
    rows.delete('p1');
    for (const fn of listeners) fn('p1');
    await tick();
    await tick();
    host.handleRequest(port, { kind: 'list-configs', reqId: 'list-3' });
    expect(byReqId(port, 'list-3')).toMatchObject({ configs: [] });
    expect(port.messages).toContainEqual(expect.objectContaining({ kind: 'catalog-ready', providerId: 'p1' }));
  });

  it('dispose unsubscribes from the change notifier', async () => {
    const listeners: Array<(id: string) => void> = [];
    const host = new PlatformServicesHost({ configManager: mockConfigManager(new Map(), listeners) });
    expect(listeners).toHaveLength(1);
    await host.dispose();
    expect(listeners).toHaveLength(0);
  });
});
