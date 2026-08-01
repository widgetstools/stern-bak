import { describe, it, expect } from 'vitest';
import {
  buildDeployExport,
  collectReferencedInstanceIds,
  instanceIdsFromOpenFinSnapshot,
  validateDeployExport,
  type DeployExportInput,
} from './deployExport';
import type { AppConfigRow } from './types';

function baseInput(over: Partial<DeployExportInput> = {}): DeployExportInput {
  return {
    activeAppId: 'StarDemo',
    activeUserId: 'dev1',
    appRegistry: [{ appId: 'StarDemo', displayName: 'Star', manifestUrl: 'http://x/m.json', configServiceEnabled: false, environment: 'dev' }],
    userProfiles: [],
    roles: [],
    permissions: [],
    appConfig: [],
    ...over,
  };
}

function profileRow(configId: string, appId: string, state: Record<string, unknown> = { filters: { data: {} } }): AppConfigRow {
  return {
    configId,
    appId,
    userId: 'dev1',
    isPublic: true,
    displayText: `profiles: ${configId}`,
    componentType: 'markets-grid-profile-set',
    componentSubType: '',
    isTemplate: false,
    payload: {
      version: 1,
      profiles: [{ id: '__default__', gridId: 'g1', name: 'Default', state, createdAt: 1, updatedAt: 1 }],
      gridLevelData: { provider: { liveProviderId: 'dp-1', historicalProviderId: null, mode: 'live' } },
    },
    createdBy: 'dev1',
    updatedBy: 'dev1',
    creationTime: '2026-01-01T00:00:00.000Z',
    updatedTime: '2026-01-01T00:00:00.000Z',
  };
}

describe('instanceIdsFromOpenFinSnapshot', () => {
  it('extracts ?id= from nested view URLs', () => {
    const snap = {
      windows: [{
        views: [{ url: '/blotters/marketsgrid?id=inst-a' }],
      }],
    };
    expect(instanceIdsFromOpenFinSnapshot(snap)).toEqual(['inst-a']);
  });
});

describe('collectReferencedInstanceIds', () => {
  it('unions instanceIds array and snapshot URL ids', () => {
    const appConfig: AppConfigRow[] = [{
      configId: 'WS_1',
      appId: 'StarDemo',
      userId: 'dev1',
      isPublic: true,
      displayText: 'ws',
      componentType: 'workspace',
      componentSubType: 'SNAPSHOT',
      isTemplate: false,
      payload: {
        instanceIds: ['from-list'],
        openfinSnapshot: { windows: [{ views: [{ url: '/x?id=from-url' }] }] },
      },
      createdBy: 'dev1',
      updatedBy: 'dev1',
      creationTime: '2026-01-01T00:00:00.000Z',
      updatedTime: '2026-01-01T00:00:00.000Z',
    }];
    const ids = collectReferencedInstanceIds(appConfig);
    expect(ids.has('from-list')).toBe(true);
    expect(ids.has('from-url')).toBe(true);
  });
});

describe('buildDeployExport', () => {
  it('includes every appConfig row (orphan profile sets are not dropped)', () => {
    const raw = baseInput({
      appConfig: [
        profileRow('inst-live', 'StarDemo'),
        profileRow('orphan-old', 'StarDemo'),
        {
          configId: 'dp-stomp',
          appId: 'StarDemo',
          userId: 'dev1',
          isPublic: false,
          displayText: 'dp',
          componentType: 'data-provider',
          componentSubType: 'stomp',
          isTemplate: false,
          payload: { url: 'wss://x' },
          createdBy: 'dev1',
          updatedBy: 'dev1',
          creationTime: '2026-01-01T00:00:00.000Z',
          updatedTime: '2026-01-01T00:00:00.000Z',
        },
        {
          configId: 'WS_1',
          appId: 'StarDemo',
          userId: 'dev1',
          isPublic: true,
          displayText: 'ws',
          componentType: 'workspace',
          componentSubType: 'SNAPSHOT',
          isTemplate: false,
          payload: { instanceIds: ['inst-live'], openfinSnapshot: {} },
          createdBy: 'dev1',
          updatedBy: 'dev1',
          creationTime: '2026-01-01T00:00:00.000Z',
          updatedTime: '2026-01-01T00:00:00.000Z',
        },
      ],
    });

    const result = buildDeployExport(raw);
    const configIds = result.bundle.appConfig.map((r) => r.configId);
    expect(configIds).toContain('inst-live');
    expect(configIds).toContain('dp-stomp');
    expect(configIds).toContain('WS_1');
    expect(configIds).toContain('orphan-old');
    expect(result.stats.appConfigExcluded).toBe(0);
    expect(result.stats.appConfigIncluded).toBe(raw.appConfig.length);
    expect(result.warnings.some((w) => w.code === 'UNREFERENCED_ROWS')).toBe(true);
  });

  it('re-stamps appRegistry appId to activeAppId in the deploy bundle', () => {
    const raw = baseInput({
      activeAppId: 'Star-Demo',
      appRegistry: [{
        appId: 'StarDemo',
        displayName: 'Star',
        manifestUrl: 'http://x/m.json',
        configServiceEnabled: false,
        environment: 'dev',
      }],
    });
    const result = buildDeployExport(raw);
    expect(result.bundle.appRegistry[0].appId).toBe('Star-Demo');
    expect(result.bundle.activeAppId).toBe('Star-Demo');
  });

  it('re-stamps appId drift in the deploy bundle', () => {
    const raw = baseInput({
      appConfig: [
        profileRow('inst-1', 'TestApp'),
        {
          configId: 'WS_1',
          appId: 'TestApp',
          userId: 'dev1',
          isPublic: true,
          displayText: 'ws',
          componentType: 'workspace',
          componentSubType: 'SNAPSHOT',
          isTemplate: false,
          payload: { instanceIds: ['inst-1'], openfinSnapshot: {} },
          createdBy: 'dev1',
          updatedBy: 'dev1',
          creationTime: '2026-01-01T00:00:00.000Z',
          updatedTime: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    const result = buildDeployExport(raw);
    expect(result.bundle.appConfig.find((r) => r.configId === 'inst-1')?.appId).toBe('StarDemo');
    expect(result.warnings.some((w) => w.code === 'APP_ID_DRIFT')).toBe(true);
  });
});

describe('validateDeployExport', () => {
  it('errors when referenced instance has no row', () => {
    const input = baseInput({
      appConfig: [{
        configId: 'WS_1',
        appId: 'StarDemo',
        userId: 'dev1',
        isPublic: true,
        displayText: 'ws',
        componentType: 'workspace',
        componentSubType: 'SNAPSHOT',
        isTemplate: false,
        payload: { instanceIds: ['missing-inst'], openfinSnapshot: {} },
        createdBy: 'dev1',
        updatedBy: 'dev1',
        creationTime: '2026-01-01T00:00:00.000Z',
        updatedTime: '2026-01-01T00:00:00.000Z',
      }],
    });
    const warnings = validateDeployExport(input);
    expect(warnings.some((w) => w.code === 'MISSING_INSTANCE_ROW' && w.severity === 'error')).toBe(true);
  });

  it('warns on empty profile state for referenced instance', () => {
    const emptyRow = profileRow('inst-1', 'StarDemo', {});
    (emptyRow.payload as { gridLevelData?: unknown }).gridLevelData = undefined;
    const input = baseInput({
      appConfig: [
        emptyRow,
        {
          configId: 'WS_1',
          appId: 'StarDemo',
          userId: 'dev1',
          isPublic: true,
          displayText: 'ws',
          componentType: 'workspace',
          componentSubType: 'SNAPSHOT',
          isTemplate: false,
          payload: { instanceIds: ['inst-1'], openfinSnapshot: {} },
          createdBy: 'dev1',
          updatedBy: 'dev1',
          creationTime: '2026-01-01T00:00:00.000Z',
          updatedTime: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    const warnings = validateDeployExport(input);
    expect(warnings.some((w) => w.code === 'EMPTY_PROFILE_STATE')).toBe(true);
    expect(warnings.some((w) => w.code === 'MISSING_GRID_LEVEL_PROVIDER')).toBe(true);
  });

  it('errors when no activeAppId can be determined', () => {
    const input = baseInput({
      activeAppId: '',
      appRegistry: [],
      userProfiles: [],
    });
    const warnings = validateDeployExport(input);
    expect(warnings.some((w) => w.code === 'NO_ACTIVE_APP_ID' && w.severity === 'error')).toBe(true);
  });

  it('warns on instance IDs mismatch between snapshot and declared list', () => {
    const input = baseInput({
      appConfig: [{
        configId: 'WS_1',
        appId: 'StarDemo',
        userId: 'dev1',
        isPublic: true,
        displayText: 'ws',
        componentType: 'workspace',
        componentSubType: 'SNAPSHOT',
        isTemplate: false,
        payload: {
          instanceIds: ['declared-id'],
          openfinSnapshot: { windows: [{ views: [{ name: 'v1', url: '/x', customData: { instanceId: 'custom-id' } }] }] },
        },
        createdBy: 'dev1',
        updatedBy: 'dev1',
        creationTime: '2026-01-01T00:00:00.000Z',
        updatedTime: '2026-01-01T00:00:00.000Z',
      }],
    });
    const warnings = validateDeployExport(input);
    expect(warnings.some((w) => w.code === 'CUSTOM_DATA_INSTANCE_MISMATCH')).toBe(true);
  });

  it('warns when snapshot has instances but declared list is empty', () => {
    const input = baseInput({
      appConfig: [{
        configId: 'WS_1',
        appId: 'StarDemo',
        userId: 'dev1',
        isPublic: true,
        displayText: 'ws',
        componentType: 'workspace',
        componentSubType: 'SNAPSHOT',
        isTemplate: false,
        payload: {
          instanceIds: [],
          openfinSnapshot: { windows: [{ views: [{ url: '/x?id=snap-id' }] }] },
        },
        createdBy: 'dev1',
        updatedBy: 'dev1',
        creationTime: '2026-01-01T00:00:00.000Z',
        updatedTime: '2026-01-01T00:00:00.000Z',
      }],
    });
    const warnings = validateDeployExport(input);
    expect(warnings.some((w) => w.code === 'INSTANCE_IDS_EMPTY')).toBe(true);
  });

  it('detects custom data instance ids from nested windows', () => {
    const snap = {
      windows: [{
        views: [{
          customData: { instanceId: 'inst-a' },
        }],
      }],
    };
    const input = baseInput({
      appConfig: [
        profileRow('inst-a', 'StarDemo'),
        {
          configId: 'WS_1',
          appId: 'StarDemo',
          userId: 'dev1',
          isPublic: true,
          displayText: 'ws',
          componentType: 'workspace',
          componentSubType: 'SNAPSHOT',
          isTemplate: false,
          payload: { instanceIds: ['inst-a'], openfinSnapshot: snap },
          createdBy: 'dev1',
          updatedBy: 'dev1',
          creationTime: '2026-01-01T00:00:00.000Z',
          updatedTime: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    const warnings = validateDeployExport(input);
    expect(warnings.some((w) => w.code === 'MISSING_INSTANCE_ROW')).toBe(false);
  });

  it('handles non-empty custom data list without mismatch', () => {
    const snap = {
      windows: [{
        views: [{
          customData: { instanceId: 'inst-a' },
        }],
      }],
    };
    const input = baseInput({
      appConfig: [
        profileRow('inst-a', 'StarDemo'),
        {
          configId: 'WS_1',
          appId: 'StarDemo',
          userId: 'dev1',
          isPublic: true,
          displayText: 'ws',
          componentType: 'workspace',
          componentSubType: 'SNAPSHOT',
          isTemplate: false,
          payload: { instanceIds: ['inst-a'], openfinSnapshot: snap },
          createdBy: 'dev1',
          updatedBy: 'dev1',
          creationTime: '2026-01-01T00:00:00.000Z',
          updatedTime: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    const warnings = validateDeployExport(input);
    expect(warnings.some((w) => w.code === 'CUSTOM_DATA_INSTANCE_MISMATCH')).toBe(false);
  });

  it('handles hasErrors flag correctly', () => {
    const input = baseInput({
      activeAppId: '',
      appRegistry: [],
    });
    const result = buildDeployExport(input);
    expect(result.hasErrors).toBe(true);
  });
});
