/**
 * bootstrapDataServices() — unit tests.
 *
 * Tests use a real MessageChannel + an in-process
 * SharedWorkerDataServicesHub (same pattern as `hooks.test.tsx`).
 * The "SharedWorker" passed to bootstrap is a minimal stub
 * `{ port: MessagePort }` — bootstrap only reads `worker.port` so a
 * structural cast is safe.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SharedWorkerDataServicesHub, type PortLike } from '../worker/SharedWorkerDataServicesHub.js';
import { isAppDataRequest, isRequest } from '../protocol.js';
import type { ConfigManager, AppConfigRow } from '@wellsfargo-starui/core/host/config';
import { bootstrapDataServices, _resetBootstrapRegistryForTests } from './bootstrap.js';

interface FakeWorker {
  port: MessagePort;
  /** Disconnect the in-process hub side. */
  closeHub(): void;
}

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

/**
 * Build a MessageChannel-backed worker stub wired to an in-process
 * hub. When a ConfigManager is supplied, the hub uses it for
 * persistence + hydration — mirrors how a real SharedWorker entry
 * script constructs its own ConfigManager + awaits hydrateAppData()
 * before installing the connect handler.
 */
async function makeFakeWorker(configManager?: ConfigManager): Promise<FakeWorker> {
  const channel = new MessageChannel();
  const hub = new SharedWorkerDataServicesHub(configManager ? { configManager } : {});
  if (configManager) await hub.hydrateAppData('alice');
  const portLike: PortLike = { postMessage: (m) => channel.port2.postMessage(m) };
  channel.port2.addEventListener('message', (ev: MessageEvent) => {
    if (isRequest(ev.data)) hub.handleRequest(portLike, ev.data);
    else if (isAppDataRequest(ev.data)) hub.handleAppDataRequest(portLike, ev.data);
  });
  channel.port2.start();
  return {
    port: channel.port1,
    closeHub: () => { try { channel.port2.close(); } catch { /* idempotent */ } },
  };
}

afterEach(() => {
  _resetBootstrapRegistryForTests();
});

describe('bootstrapDataServices — idempotency', () => {
  it('first call returns a fresh DataServices instance', async () => {
    const worker = await makeFakeWorker();
    const services = bootstrapDataServices({
      appName: 'appA',
      worker: worker as unknown as SharedWorker,
      configManager: stubConfigManager(),
      userId: 'alice',
    });
    expect(services.client).toBeDefined();
    expect(services.appData).toBeDefined();
    expect(services.configManager).toBeDefined();
    expect(services.ready).toBeInstanceOf(Promise);
    services.dispose();
    worker.closeHub();
  });

  it('second call with the same appName returns the same object reference', async () => {
    const worker = await makeFakeWorker();
    const cm = stubConfigManager();
    const opts = {
      appName: 'appA',
      worker: worker as unknown as SharedWorker,
      configManager: cm,
      userId: 'alice',
    };
    const first = bootstrapDataServices(opts);
    const second = bootstrapDataServices(opts);
    expect(second).toBe(first);
    expect(second.client).toBe(first.client);
    expect(second.appData).toBe(first.appData);
    first.dispose();
    worker.closeHub();
  });

  it('different appName returns a distinct object', async () => {
    const workerA = await makeFakeWorker();
    const workerB = await makeFakeWorker();
    const a = bootstrapDataServices({
      appName: 'appA',
      worker: workerA as unknown as SharedWorker,
      configManager: stubConfigManager(),
      userId: 'alice',
    });
    const b = bootstrapDataServices({
      appName: 'appB',
      worker: workerB as unknown as SharedWorker,
      configManager: stubConfigManager(),
      userId: 'alice',
    });
    expect(b).not.toBe(a);
    expect(b.client).not.toBe(a.client);
    a.dispose();
    b.dispose();
    workerA.closeHub();
    workerB.closeHub();
  });
});

describe('bootstrapDataServices — dispose', () => {
  it('removes the appName from the registry so re-bootstrap returns a NEW object', async () => {
    const workerA = await makeFakeWorker();
    const first = bootstrapDataServices({
      appName: 'appA',
      worker: workerA as unknown as SharedWorker,
      configManager: stubConfigManager(),
      userId: 'alice',
    });
    first.dispose();
    workerA.closeHub();

    const workerA2 = await makeFakeWorker();
    const second = bootstrapDataServices({
      appName: 'appA',
      worker: workerA2 as unknown as SharedWorker,
      configManager: stubConfigManager(),
      userId: 'alice',
    });
    expect(second).not.toBe(first);
    second.dispose();
    workerA2.closeHub();
  });

  it('is idempotent — calling twice does not throw', async () => {
    const worker = await makeFakeWorker();
    const services = bootstrapDataServices({
      appName: 'appA',
      worker: worker as unknown as SharedWorker,
      configManager: stubConfigManager(),
      userId: 'alice',
    });
    expect(() => services.dispose()).not.toThrow();
    expect(() => services.dispose()).not.toThrow();
    worker.closeHub();
  });
});

describe('bootstrapDataServices — ready', () => {
  it('ready resolves once the hub delivers the initial AppData snapshot', async () => {
    const worker = await makeFakeWorker();
    const services = bootstrapDataServices({
      appName: 'appA',
      worker: worker as unknown as SharedWorker,
      configManager: stubConfigManager(),
      userId: 'alice',
    });
    await services.ready;
    expect(services.appData.isReady()).toBe(true);
    services.dispose();
    worker.closeHub();
  });

  it('appData reflects existing ConfigManager rows after ready resolves', async () => {
    const cm = stubConfigManager();
    cm._rows.set('ad-1', {
      configId: 'ad-1', appId: 'TestApp', userId: 'alice',
      componentType: 'appdata', componentSubType: 'appdata',
      isTemplate: false, displayText: 'positions',
      payload: { values: { asOfDate: '2026-04-01' } },
      createdBy: 'alice', updatedBy: 'alice',
      creationTime: '0', updatedTime: '0',
    } as AppConfigRow);

    // The fake worker uses `cm` for hub hydration — mirrors how the
    // production worker entry constructs its own ConfigManager and
    // hydrates the hub before installing the connect handler.
    const worker = await makeFakeWorker(cm);

    const services = bootstrapDataServices({
      appName: 'appA',
      worker: worker as unknown as SharedWorker,
      configManager: cm,
      userId: 'alice',
    });
    await services.ready;
    expect(services.appData.get('positions', 'asOfDate')).toBe('2026-04-01');
    services.dispose();
    worker.closeHub();
  });
});

describe('bootstrapDataServices — configManager exposure', () => {
  it('exposes the configManager passed in', async () => {
    const worker = await makeFakeWorker();
    const cm = stubConfigManager();
    const services = bootstrapDataServices({
      appName: 'appA',
      worker: worker as unknown as SharedWorker,
      configManager: cm,
      userId: 'alice',
    });
    expect(services.configManager).toBe(cm);
    services.dispose();
    worker.closeHub();
  });
});
