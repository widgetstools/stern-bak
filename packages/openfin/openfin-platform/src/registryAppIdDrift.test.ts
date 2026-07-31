import { describe, it, expect, beforeEach } from 'vitest';
import {
  setConfigManager,
  setPlatformDefaultScope,
  migrateRegistryAppIdDrift,
} from './db';
import { COMPONENT_TYPES } from '@wellsfargo-starui/types';
import type { AppConfigRow, ConfigManager } from '@wellsfargo-starui/host-config';

function makeManager(rows: Map<string, AppConfigRow>): ConfigManager {
  return {
    getConfig: async (id: string) => rows.get(id),
    getAllConfigsUnfiltered: async () => [...rows.values()],
    saveConfig: async (row: AppConfigRow) => { rows.set(row.configId, row); },
    deleteConfig: async (id: string) => { rows.delete(id); },
  } as unknown as ConfigManager;
}

describe('migrateRegistryAppIdDrift', () => {
  beforeEach(() => {
    setPlatformDefaultScope({ appId: 'StarDemo', userId: 'dev1' });
  });

  it('relocates TestApp registry row to StarDemo global scope', async () => {
    const rows = new Map<string, AppConfigRow>([
      ['component-registry::TestApp::system', {
        configId: 'component-registry::TestApp::system',
        appId: 'TestApp',
        userId: 'system',
        displayText: 'Component Registry',
        componentType: COMPONENT_TYPES.COMPONENT_REGISTRY,
        componentSubType: '',
        isTemplate: false,
        payload: { version: 2, entries: [] },
        createdBy: 'system',
        updatedBy: 'system',
        creationTime: '2026-01-01T00:00:00.000Z',
        updatedTime: '2026-01-01T00:00:00.000Z',
      }],
    ]);
    setConfigManager(makeManager(rows));

    const result = await migrateRegistryAppIdDrift();

    expect(result.migrated).toBeGreaterThan(0);
    expect(rows.has('component-registry::TestApp::system')).toBe(false);
    const target = rows.get('component-registry::StarDemo::system');
    expect(target?.appId).toBe('StarDemo');
    expect(target?.userId).toBe('system');
  });

  it('deletes stale TestApp row when StarDemo target already exists', async () => {
    const rows = new Map<string, AppConfigRow>([
      ['component-registry::StarDemo::system', {
        configId: 'component-registry::StarDemo::system',
        appId: 'StarDemo',
        userId: 'system',
        displayText: 'Component Registry',
        componentType: COMPONENT_TYPES.COMPONENT_REGISTRY,
        componentSubType: '',
        isTemplate: false,
        payload: { version: 2, entries: [{ id: 'a' }] },
        createdBy: 'system',
        updatedBy: 'system',
        creationTime: '2026-01-02T00:00:00.000Z',
        updatedTime: '2026-01-02T00:00:00.000Z',
      }],
      ['component-registry::TestApp::system', {
        configId: 'component-registry::TestApp::system',
        appId: 'TestApp',
        userId: 'system',
        displayText: 'Component Registry',
        componentType: COMPONENT_TYPES.COMPONENT_REGISTRY,
        componentSubType: '',
        isTemplate: false,
        payload: { version: 2, entries: [] },
        createdBy: 'system',
        updatedBy: 'system',
        creationTime: '2026-01-01T00:00:00.000Z',
        updatedTime: '2026-01-01T00:00:00.000Z',
      }],
    ]);
    setConfigManager(makeManager(rows));

    const result = await migrateRegistryAppIdDrift();

    expect(result.migrated).toBe(1);
    expect(rows.has('component-registry::TestApp::system')).toBe(false);
    expect(rows.get('component-registry::StarDemo::system')?.payload).toEqual({
      version: 2,
      entries: [{ id: 'a' }],
    });
  });
});
