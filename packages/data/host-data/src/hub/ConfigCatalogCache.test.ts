import { describe, expect, it, beforeEach } from 'vitest';
import type { ConfigManager, AppConfigRow } from '@wellsfargo-starui/host-config';
import { ConfigCatalogCache } from './ConfigCatalogCache.js';

function stompRow(id: string, name = id): AppConfigRow {
  return {
    configId: id,
    appId: 'TestApp',
    userId: 'system',
    componentType: 'data-provider',
    componentSubType: 'stomp',
    isTemplate: false,
    displayText: name,
    payload: {
      providerType: 'stomp',
      websocketUrl: 'ws://localhost:8080/ws',
      listenerTopic: '/topic/data',
      __providerMeta: { public: true },
    },
    createdBy: 'dev1',
    updatedBy: 'dev1',
    creationTime: '2026-01-01T00:00:00.000Z',
    updatedTime: '2026-01-01T00:00:00.000Z',
  };
}

function mockConfigManager(rows: AppConfigRow[]): ConfigManager {
  const map = new Map(rows.map((r) => [r.configId, r]));
  return {
    getAppId() { return 'TestApp'; },
    async getAllConfigsUnfiltered() {
      return [...map.values()];
    },
    async getConfigsByComponentTypesUnfiltered(types: string[]) {
      return [...map.values()].filter((r) => types.includes(r.componentType));
    },
    async getConfig(id: string) {
      return map.get(id);
    },
  } as unknown as ConfigManager;
}

describe('ConfigCatalogCache', () => {
  let cache: ConfigCatalogCache;

  beforeEach(() => {
    cache = new ConfigCatalogCache(
      mockConfigManager([stompRow('p1'), stompRow('p2', 'Second')]),
    );
  });

  it('preloads from ConfigManager and get() returns config', async () => {
    expect(cache.isReady()).toBe(false);
    await cache.loadAll();
    expect(cache.isReady()).toBe(true);

    const cfg = cache.get('p1');
    expect(cfg).not.toBeNull();
    expect(cfg?.providerId).toBe('p1');
    expect(cfg?.providerType).toBe('stomp');
    expect(cache.getProviderConfig('p1')?.providerType).toBe('stomp');
  });

  it('list() filters by subtype', async () => {
    const mixed = mockConfigManager([
      stompRow('s1'),
      {
        ...stompRow('r1'),
        configId: 'r1',
        componentSubType: 'rest',
        payload: {
          providerType: 'rest',
          url: 'http://localhost/data',
          __providerMeta: {},
        },
      },
    ]);
    cache = new ConfigCatalogCache(mixed);
    await cache.loadAll();

    expect(cache.list({ subtype: 'stomp' }).map((p) => p.providerId)).toEqual(['s1']);
    expect(cache.list().map((p) => p.providerId).sort()).toEqual(['r1', 's1']);
  });

  it('invalidate(id) reloads a single row from ConfigManager', async () => {
    const rows = new Map([['p1', stompRow('p1', 'Original')]]);
    const cm = {
      async getAllConfigsUnfiltered() { return [...rows.values()]; },
    async getConfigsByComponentTypesUnfiltered(types: string[]) { return [...rows.values()].filter((r) => types.includes(r.componentType)); },
      async getConfig(id: string) { return rows.get(id); },
    } as unknown as ConfigManager;
    cache = new ConfigCatalogCache(cm);
    await cache.loadAll();
    expect(cache.get('p1')?.name).toBe('Original');

    rows.set('p1', stompRow('p1', 'Updated'));
    await cache.invalidate('p1');
    expect(cache.get('p1')?.name).toBe('Updated');
  });

  it('ensure() resolves one provider on demand without a full loadAll', async () => {
    // No loadAll — catalog is not ready yet (Phase 3 on-demand path).
    expect(cache.isReady()).toBe(false);
    const cfg = await cache.ensure('p1');
    expect(cfg?.providerId).toBe('p1');
    // Cached so the synchronous attach lookup that follows finds it.
    expect(cache.get('p1')?.providerId).toBe('p1');
    expect(cache.getProviderConfig('p1')?.providerType).toBe('stomp');
    // A single-row resolve does not flip the full-catalog ready flag.
    expect(cache.isReady()).toBe(false);
  });

  it('ensure() returns null for an unknown provider and does not cache it', async () => {
    const cfg = await cache.ensure('nope');
    expect(cfg).toBeNull();
    expect(cache.get('nope')).toBeNull();
  });

  it('ensure() returns the cached row without a second fetch', async () => {
    let fetches = 0;
    const cm = {
      getAppId() { return 'TestApp'; },
      async getAllConfigsUnfiltered() { return [stompRow('p1')]; },
      async getConfigsByComponentTypesUnfiltered(types: string[]) {
        return [stompRow('p1')].filter((r) => types.includes(r.componentType));
      },
      async getConfig(id: string) { fetches += 1; return id === 'p1' ? stompRow('p1') : undefined; },
    } as unknown as ConfigManager;
    cache = new ConfigCatalogCache(cm);
    await cache.ensure('p1');
    await cache.ensure('p1');
    expect(fetches).toBe(1);
  });

  it('upsert() merges without ConfigManager fetch', async () => {
    await cache.loadAll();
    cache.upsert({
      providerId: 'p3',
      name: 'Inline',
      providerType: 'mock',
      config: { providerType: 'mock', rowCount: 10 } as never,
      userId: 'dev1',
      public: false,
    });
    expect(cache.get('p3')?.name).toBe('Inline');
  });

  it('invalidate() without id reloads full catalog', async () => {
    await cache.loadAll();
    const cm = mockConfigManager([stompRow('only')]);
    cache = new ConfigCatalogCache(cm);
    await cache.invalidate();
    expect(cache.list().map((p) => p.providerId)).toEqual(['only']);
  });
});
