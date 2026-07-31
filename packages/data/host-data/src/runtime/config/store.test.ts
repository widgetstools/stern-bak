import { describe, expect, it, vi } from 'vitest';
import type { ConfigManager, AppConfigRow } from '@wellsfargo-starui/host-config';
import type { DataProviderConfig } from '@wellsfargo-starui/types';
import { DataProviderConfigStore } from './store.js';

function mockRow(id: string, name = id): AppConfigRow {
  return {
    configId: id,
    appId: 'TestApp',
    userId: 'system',
    componentType: 'data-provider',
    componentSubType: 'mock',
    isTemplate: false,
    displayText: name,
    payload: {
      providerType: 'mock',
      keyColumn: 'id',
      __providerMeta: { public: true },
    },
    createdBy: 'dev1',
    updatedBy: 'dev1',
    creationTime: '2026-01-01T00:00:00.000Z',
    updatedTime: '2026-01-01T00:00:00.000Z',
  };
}

function mockConfigManager(rows: AppConfigRow[] = [], appId = 'StarDemo'): ConfigManager {
  const map = new Map(rows.map((r) => [r.configId, r]));
  return {
    getAppId() { return appId; },
    async getAllConfigsUnfiltered() { return [...map.values()]; },
    async getConfigsByComponentTypesUnfiltered(types: string[]) { return [...map.values()].filter((r) => types.includes(r.componentType)); },
    async getConfig(id: string) { return map.get(id); },
    async saveConfig(row: AppConfigRow) { map.set(row.configId, row); },
    async deleteConfig(id: string) { map.delete(id); },
  } as unknown as ConfigManager;
}

const mockProvider = (id: string, name: string): DataProviderConfig => ({
  providerId: id,
  name,
  providerType: 'mock',
  config: { providerType: 'mock', keyColumn: 'id' } as never,
  userId: 'system',
  public: true,
});

describe('DataProviderConfigStore — hub catalog invalidation', () => {
  it('save() stamps the ConfigManager appId on new rows', async () => {
    const cm = mockConfigManager([], 'StarDemo');
    const store = new DataProviderConfigStore(cm);
    const savedRows: AppConfigRow[] = [];
    (cm as { saveConfig: (row: AppConfigRow) => Promise<void> }).saveConfig = async (row) => {
      savedRows.push(row);
    };

    await store.save({
      name: 'positions-live',
      providerType: 'stomp',
      config: { providerType: 'stomp' } as never,
      public: true,
    }, 'dev1');

    expect(savedRows[0]?.appId).toBe('StarDemo');
  });

  it('save() re-stamps appId when updating a row that drifted to TestApp', async () => {
    const drifted = mockRow('p1', 'Drifted');
    drifted.appId = 'TestApp';
    const cm = mockConfigManager([drifted], 'StarDemo');
    const store = new DataProviderConfigStore(cm);

    await store.save(mockProvider('p1', 'Drifted'), 'dev1');

    const row = await cm.getConfig('p1');
    expect(row?.appId).toBe('StarDemo');
  });

  it('save() notifies invalidateCatalog with the saved provider id', async () => {
    const invalidate = vi.fn();
    const store = new DataProviderConfigStore(mockConfigManager(), invalidate);

    await store.save(mockProvider('p1', 'First'), 'dev1');

    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith('p1');
  });

  it('remove() notifies invalidateCatalog with the removed id', async () => {
    const invalidate = vi.fn();
    const cm = mockConfigManager([mockRow('p1')]);
    const store = new DataProviderConfigStore(cm, invalidate);

    await store.remove('p1');

    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith('p1');
  });

  it('does not throw when invalidateCatalog rejects', async () => {
    const invalidate = vi.fn().mockRejectedValue(new Error('hub offline'));
    const store = new DataProviderConfigStore(mockConfigManager(), invalidate);

    await expect(store.save(mockProvider('p1', 'First'), 'dev1')).resolves.toBeDefined();
  });

  it('list(includeAppData) returns unified and legacy AppData rows', async () => {
    const stompRow: AppConfigRow = {
      configId: 'stomp-1',
      appId: 'TestApp',
      userId: 'system',
      componentType: 'data-provider',
      componentSubType: 'stomp',
      isTemplate: false,
      displayText: 'positions-live',
      payload: { providerType: 'stomp', __providerMeta: { public: true } },
      createdBy: 'dev1',
      updatedBy: 'dev1',
      creationTime: '2026-01-01T00:00:00.000Z',
      updatedTime: '2026-01-01T00:00:00.000Z',
    };
    const rows: AppConfigRow[] = [
      stompRow,
      {
        configId: 'ad-legacy',
        appId: 'TestApp',
        userId: 'dev1',
        componentType: 'appdata',
        componentSubType: 'appdata',
        isTemplate: false,
        displayText: 'LegacyAppData',
        payload: { values: { asOfDate: '2026-05-01' } },
        createdBy: 'dev1',
        updatedBy: 'dev1',
        creationTime: '2026-01-01T00:00:00.000Z',
        updatedTime: '2026-01-01T00:00:00.000Z',
      },
      {
        configId: 'ad-unified',
        appId: 'TestApp',
        userId: 'dev1',
        componentType: 'data-provider',
        componentSubType: 'appdata',
        isTemplate: false,
        displayText: 'UnifiedAppData',
        payload: {
          providerType: 'appdata',
          variables: {
            asOfDate: { key: 'asOfDate', value: '2026-05-02', type: 'string', durability: 'volatile' },
          },
          __providerMeta: { public: false },
        },
        createdBy: 'dev1',
        updatedBy: 'dev1',
        creationTime: '2026-01-01T00:00:00.000Z',
        updatedTime: '2026-01-01T00:00:00.000Z',
      },
    ];

    const store = new DataProviderConfigStore(mockConfigManager(rows));
    const listed = await store.list('dev1', { includeAppData: true });

    expect(listed.map((c) => c.name).sort()).toEqual([
      'LegacyAppData',
      'UnifiedAppData',
      'positions-live',
    ]);
    expect(listed.find((c) => c.name === 'UnifiedAppData')?.providerType).toBe('appdata');
  });
});
