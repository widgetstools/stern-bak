import { describe, expect, it, vi } from 'vitest';
import type { AppConfigRow, ConfigManager } from '@wellsfargo-starui/core/host/config';
import {
  COMPONENT_TYPE_APPDATA,
  COMPONENT_TYPE_DATA_PROVIDER,
  PUBLIC_USER_ID,
} from '../../config/componentTypes.js';
import { AppDataConfigStore } from './store.js';

function row(over: Partial<AppConfigRow> = {}): AppConfigRow {
  return {
    configId: 'ad-1',
    appId: 'TestApp',
    userId: 'dev1',
    componentType: COMPONENT_TYPE_APPDATA,
    componentSubType: 'appdata',
    isTemplate: false,
    displayText: 'App1Data',
    payload: { description: 'desc', values: { userId: 'u1' } },
    createdBy: 'dev1',
    updatedBy: 'dev1',
    creationTime: '2026-01-01T00:00:00.000Z',
    updatedTime: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

function mockCm(rows: AppConfigRow[]): ConfigManager {
  const map = new Map(rows.map((r) => [r.configId, r]));
  return {
    getAppId: () => 'TestApp',
    getConfig: vi.fn(async (id: string) => map.get(id) ?? null),
    getConfigsByComponentTypesUnfiltered: vi.fn(async () => [...map.values()]),
    saveConfig: vi.fn(async (r: AppConfigRow) => { map.set(r.configId, r); }),
    deleteConfig: vi.fn(async (id: string) => { map.delete(id); }),
  } as unknown as ConfigManager;
}

describe('AppDataConfigStore', () => {
  it('list() merges legacy appdata rows and unified data-provider/appdata rows', async () => {
    const legacy = row({ configId: 'ad-legacy' });
    const unified = row({
      configId: 'ad-unified',
      componentType: COMPONENT_TYPE_DATA_PROVIDER,
      componentSubType: 'appdata',
      displayText: 'Unified',
      payload: {
        __providerMeta: { description: 'unified desc' },
        variables: { token: { value: 'abc' } },
      },
    });
    const grid = row({
      configId: 'grid-1',
      componentType: 'grid',
      componentSubType: 'test',
    });
    const store = new AppDataConfigStore(mockCm([legacy, unified, grid]));

    const listed = await store.list('dev1');

    expect(listed).toHaveLength(2);
    expect(listed.find((c) => c.configId === 'ad-legacy')?.values).toEqual({ userId: 'u1' });
    expect(listed.find((c) => c.configId === 'ad-unified')?.values).toEqual({ token: 'abc' });
  });

  it('get() returns null for non-appdata rows', async () => {
    const store = new AppDataConfigStore(
      mockCm([row({ configId: 'grid-1', componentType: 'grid', componentSubType: 'x' })]),
    );

    expect(await store.get('grid-1')).toBeNull();
  });

  it('get() unwraps unified provider-shaped rows', async () => {
    const unified = row({
      configId: 'ad-unified',
      componentType: COMPONENT_TYPE_DATA_PROVIDER,
      componentSubType: 'appdata',
      payload: {
        __providerMeta: { description: 'meta' },
        variables: { key: { value: 42 } },
      },
    });
    const store = new AppDataConfigStore(mockCm([unified]));

    const got = await store.get('ad-unified');

    expect(got?.values).toEqual({ key: 42 });
    expect(got?.description).toBe('meta');
  });

  it('save() stamps public rows with PUBLIC_USER_ID and remove() deletes', async () => {
    const cm = mockCm([]);
    const store = new AppDataConfigStore(cm);

    const saved = await store.save(
      {
        configId: '',
        name: 'PublicBag',
        isPublic: true,
        values: { x: 1 },
        userId: 'dev1',
      },
      'dev1',
    );

    expect(saved.userId).toBe(PUBLIC_USER_ID);
    expect(cm.saveConfig).toHaveBeenCalledWith(
      expect.objectContaining({ userId: PUBLIC_USER_ID, componentType: COMPONENT_TYPE_APPDATA }),
    );

    await store.remove(saved.configId);
    expect(cm.deleteConfig).toHaveBeenCalledWith(saved.configId);
  });
});
