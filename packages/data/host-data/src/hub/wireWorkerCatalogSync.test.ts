import { describe, expect, it, vi } from 'vitest';
import type { AppConfigRow, ConfigManager } from '@wellsfargo-starui/core/host/config';
import type { SharedWorkerDataServicesClient } from '../runtime/client/SharedWorkerDataServicesClient.js';
import { wireWorkerCatalogSync } from './wireWorkerCatalogSync.js';

function makeRow(over: Partial<AppConfigRow>): AppConfigRow {
  return {
    configId: 'cfg-1',
    appId: 'app',
    userId: 'user',
    displayText: 'row',
    componentType: 'data-provider',
    componentSubType: 'stomp',
    isTemplate: false,
    payload: {},
    createdBy: 'user',
    updatedBy: 'user',
    creationTime: '2026-01-01T00:00:00.000Z',
    updatedTime: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

describe('wireWorkerCatalogSync', () => {
  it('invalidates only data-provider and appdata rows', async () => {
    const invalidateConfig = vi.fn().mockResolvedValue(undefined);
    const client = { invalidateConfig } as unknown as SharedWorkerDataServicesClient;
    const listeners: Array<(configId: string) => void> = [];
    const cm = {
      getConfig: vi.fn(async (id: string) => {
        if (id === 'dp-1') return makeRow({ configId: 'dp-1' });
        if (id === 'appdata-1') return makeRow({ configId: 'appdata-1', componentType: 'appdata', componentSubType: 'appdata' });
        if (id === 'grid-1') return makeRow({ configId: 'grid-1', componentType: 'markets-grid-profile-set', componentSubType: '' });
        return undefined;
      }),
      onConfigChanged: vi.fn((fn: (configId: string) => void) => {
        listeners.push(fn);
        return () => {};
      }),
    } as unknown as ConfigManager;

    wireWorkerCatalogSync(cm, client);

    listeners[0]!('dp-1');
    listeners[0]!('appdata-1');
    listeners[0]!('grid-1');
    listeners[0]!('missing-deleted');

    await Promise.resolve();
    await Promise.resolve();

    expect(invalidateConfig).toHaveBeenCalledTimes(2);
    expect(invalidateConfig).toHaveBeenCalledWith('dp-1');
    expect(invalidateConfig).toHaveBeenCalledWith('appdata-1');
  });
});
