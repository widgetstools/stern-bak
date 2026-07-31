import { describe, it, expect, beforeEach } from 'vitest';
import { createConfigServiceStorage } from './profileBundle';
import type { AppConfigRow } from './types';
import type { ConfigManager } from './ConfigManager';
import { readProfileSetPayload, isProfileSetRow } from './profileBundle';
import type { ProfileSnapshot } from '@wellsfargo-starui/engine';

function makeRow(over: Partial<AppConfigRow>): AppConfigRow {
  return {
    configId: 'inst-1',
    appId: 'WrongApp',
    userId: 'dev1',
    isPublic: true,
    displayText: 'profiles',
    componentType: 'markets-grid-profile-set',
    componentSubType: '',
    isTemplate: false,
    payload: {
      version: 2,
      profiles: [{
        id: '__default__',
        gridId: 'g1',
        name: 'Default',
        state: { filters: { data: { x: 1 } } },
        createdAt: 1,
        updatedAt: 1,
      }],
    },
    createdBy: 'dev1',
    updatedBy: 'dev1',
    creationTime: '2026-01-01T00:00:00.000Z',
    updatedTime: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

describe('readProfileSetPayload — scope drift', () => {
  it('rejects strict isProfileSetRow but still reads bytes for RMW', () => {
    const row = makeRow({});
    expect(isProfileSetRow(row, 'StarDemo', 'dev1')).toBe(false);
    const payload = readProfileSetPayload(row, { appId: 'StarDemo', userId: 'dev1' });
    expect(payload?.profiles).toHaveLength(1);
    expect(payload?.version).toBe(2);
  });
});

describe('saveGridLevelData — scope drift', () => {
  let rows: Map<string, AppConfigRow>;
  let cm: ConfigManager;

  beforeEach(() => {
    rows = new Map();
    cm = {
      getConfig: async (id: string) => rows.get(id),
      saveConfig: async (row: AppConfigRow) => { rows.set(row.configId, row); },
      profiles: { subscribe: () => () => {} },
    } as unknown as ConfigManager;
    rows.set('inst-1', makeRow({}));
  });

  it('preserves profiles when writing gridLevelData on a drifted row', async () => {
    const factory = createConfigServiceStorage({ configManager: cm });
    const adapter = factory({ instanceId: 'inst-1', appId: 'StarDemo', userId: 'dev1' });

    await adapter.saveGridLevelData('g1', {
      v: 1,
      provider: { liveProviderId: 'dp-1', historicalProviderId: null, mode: 'live' },
    });

    const saved = rows.get('inst-1')!;
    expect(saved.appId).toBe('StarDemo');
    const payload = saved.payload as {
      profiles?: ProfileSnapshot[];
      gridLevelData?: { provider?: { liveProviderId?: string } };
      version?: number;
    };
    expect(payload.profiles).toHaveLength(1);
    expect(payload.profiles![0].state).toEqual({ filters: { data: { x: 1 } } });
    expect(payload.gridLevelData?.provider?.liveProviderId).toBe('dp-1');
    expect(payload.version).toBe(3);
  });
});
