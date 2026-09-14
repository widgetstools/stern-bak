import { describe, expect, it } from 'vitest';
import type { ConfigManager, AppConfigRow } from '@wellsfargo-starui/core/host/config';
import { ProviderLifecycleReads } from './ProviderLifecycleReads.js';

function providerRow(id: string): AppConfigRow {
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

function appDataRow(id: string, name: string, values: Record<string, string>): AppConfigRow {
  return {
    configId: id,
    appId: 'TestApp',
    userId: 'system',
    componentType: 'appdata',
    componentSubType: 'appdata',
    isTemplate: false,
    displayText: name,
    payload: { values },
    createdBy: 'dev1',
    updatedBy: 'dev1',
    creationTime: '2026-01-01T00:00:00.000Z',
    updatedTime: '2026-01-01T00:00:00.000Z',
  };
}

function mockConfigManager(rows: Map<string, AppConfigRow>, calls: string[] = []): ConfigManager {
  return {
    getAppId() { return 'TestApp'; },
    async getConfigsByComponentTypesUnfiltered(types: string[]) {
      calls.push(`list:${types.join('+')}`);
      return [...rows.values()].filter((r) => types.includes(r.componentType));
    },
    async getConfig(id: string) {
      calls.push(`get:${id}`);
      return rows.get(id);
    },
  } as unknown as ConfigManager;
}

describe('ProviderLifecycleReads', () => {
  it('has no store and resolves nothing without a ConfigManager', async () => {
    const reads = new ProviderLifecycleReads();
    expect(reads.hasStore).toBe(false);
    expect(await reads.prepare('p1')).toBeNull();
    expect(reads.lookup('positions', 'asOfDate')).toBeUndefined();
    expect(reads.snapshotRows()).toEqual([]);
  });

  it('prepare resolves the provider cfg from a one-row read and refreshes AppData', async () => {
    const calls: string[] = [];
    const rows = new Map([
      ['p1', providerRow('p1')],
      ['ad-1', appDataRow('ad-1', 'positions', { asOfDate: '2026-04-01' })],
    ]);
    const reads = new ProviderLifecycleReads(mockConfigManager(rows, calls));

    const cfg = await reads.prepare('p1');

    expect(cfg).toMatchObject({ providerType: 'mock', keyColumn: 'id' });
    expect(reads.lookup('positions', 'asOfDate')).toBe('2026-04-01');
    expect(calls).toEqual(expect.arrayContaining(['get:p1', 'list:appdata+data-provider']));
  });

  it('prepare(null) skips the provider read and only refreshes AppData', async () => {
    const calls: string[] = [];
    const reads = new ProviderLifecycleReads(mockConfigManager(new Map(), calls));
    expect(await reads.prepare(null)).toBeNull();
    expect(calls).toEqual(['list:appdata+data-provider']);
  });

  it('every refresh re-reads IndexedDB — an edited row is visible at the next lifecycle moment', async () => {
    const rows = new Map([['ad-1', appDataRow('ad-1', 'positions', { asOfDate: '2026-04-01' })]]);
    const reads = new ProviderLifecycleReads(mockConfigManager(rows));
    await reads.refreshAppData();
    expect(reads.lookup('positions', 'asOfDate')).toBe('2026-04-01');

    rows.set('ad-1', appDataRow('ad-1', 'positions', { asOfDate: '2026-05-08' }));
    rows.set('ad-2', appDataRow('ad-2', 'desk', { id: 'fi-1' }));
    await reads.refreshAppData();

    expect(reads.lookup('positions', 'asOfDate')).toBe('2026-05-08');
    expect(reads.lookup('desk', 'id')).toBe('fi-1');
    expect(reads.snapshotRows().map((r) => r.name).sort()).toEqual(['desk', 'positions']);
  });

  it('a removed row disappears from the lookup after refresh', async () => {
    const rows = new Map([['ad-1', appDataRow('ad-1', 'positions', { asOfDate: '2026-04-01' })]]);
    const reads = new ProviderLifecycleReads(mockConfigManager(rows));
    await reads.refreshAppData();
    rows.delete('ad-1');
    await reads.refreshAppData();
    expect(reads.lookup('positions', 'asOfDate')).toBeUndefined();
  });

  it('concurrent refreshes share one IndexedDB read', async () => {
    const calls: string[] = [];
    const reads = new ProviderLifecycleReads(mockConfigManager(new Map(), calls));
    await Promise.all([reads.refreshAppData(), reads.refreshAppData(), reads.prepare(null)]);
    expect(calls).toEqual(['list:appdata+data-provider']);
    // A later call after settle reads again.
    await reads.refreshAppData();
    expect(calls).toHaveLength(2);
  });

  it('resolveProviderConfig returns null for an unknown id', async () => {
    const reads = new ProviderLifecycleReads(mockConfigManager(new Map()));
    expect(await reads.resolveProviderConfig('missing')).toBeNull();
  });
});
