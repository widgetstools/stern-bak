import { describe, expect, it } from 'vitest';
import { migrateRegistryToV2 } from './registryMigrate.js';
import { REGISTRY_CONFIG_VERSION } from './registryConfigTypes.js';

const hostEnv = {
  appId: 'TestApp',
  userId: 'dev1',
  configServiceUrl: 'http://localhost:3001/api/v1',
};

describe('migrateRegistryToV2', () => {
  it('returns an empty v2 config when input is null', () => {
    expect(migrateRegistryToV2(null, hostEnv)).toEqual({
      version: REGISTRY_CONFIG_VERSION,
      entries: [],
    });
  });

  it('migrates v1 entries with internal defaults', () => {
    const v1 = {
      version: 1 as const,
      entries: [{
        id: 'grid-test',
        hostUrl: '/grid',
        iconId: 'lucide:grid',
        componentType: 'grid',
        componentSubType: 'test',
        configId: 'grid-test',
        displayName: 'Test Grid',
        createdAt: '2026-01-01T00:00:00.000Z',
      }],
    };

    const v2 = migrateRegistryToV2(v1, hostEnv);

    expect(v2.version).toBe(REGISTRY_CONFIG_VERSION);
    expect(v2.entries[0]).toMatchObject({
      type: 'internal',
      usesHostConfig: true,
      singleton: false,
      appId: 'TestApp',
      configServiceUrl: hostEnv.configServiceUrl,
    });
  });

  it('normalizes partial v2 entries and derives ids from type/subtype', () => {
    const partial = {
      version: 2 as const,
      entries: [{
        hostUrl: '/x',
        iconId: 'lucide:box',
        componentType: 'grid',
        componentSubType: 'demo',
        displayName: 'Demo',
        createdAt: '2026-01-01T00:00:00.000Z',
      }],
    };

    const v2 = migrateRegistryToV2(partial as never, hostEnv);

    expect(v2.entries[0].id).toBe('grid-demo');
    expect(v2.entries[0].configId).toBe('grid-demo');
    expect(v2.entries[0].appId).toBe('TestApp');
  });

  it('is idempotent for already-v2 configs', () => {
    const existing = {
      version: 2 as const,
      entries: [{
        id: 'grid-test',
        hostUrl: '/grid',
        iconId: 'lucide:grid',
        componentType: 'grid',
        componentSubType: 'test',
        configId: 'grid-test',
        displayName: 'Test',
        createdAt: '2026-01-01T00:00:00.000Z',
        type: 'internal' as const,
        usesHostConfig: true,
        singleton: false,
        appId: 'TestApp',
        configServiceUrl: hostEnv.configServiceUrl,
      }],
    };

    const again = migrateRegistryToV2(existing, hostEnv);

    expect(again.entries[0].id).toBe('grid-test');
    expect(again.version).toBe(REGISTRY_CONFIG_VERSION);
  });
});
