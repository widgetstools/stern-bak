import './testSetupMocks';
import { describe, expect, it, vi } from 'vitest';
import { ensurePlatformReady, resolvePlatformBootstrapFromJson } from '@wellsfargo-starui/data';
import { initPlatformBootstrap } from './platformBootstrap';
import { asLegacyDataServices } from './bootstrap/asLegacyDataServices';

describe('platformBootstrap', () => {
  it('loads config and initializes the data hub', async () => {
    const result = await initPlatformBootstrap();

    expect(resolvePlatformBootstrapFromJson).toHaveBeenCalledWith('/app-config.json');
    expect(ensurePlatformReady).toHaveBeenCalled();
    expect(result.config.userId).toBe('lab-user');
    expect(result.dataServices.client).toBeDefined();
  });
});

describe('asLegacyDataServices', () => {
  it('bridges hub bundle to legacy DataServices shape', async () => {
    const dispose = vi.fn();
    const legacy = asLegacyDataServices({
      client: { id: 'c' },
      appData: {},
      configManager: {},
      ready: Promise.resolve(),
      dispose,
    } as never);

    expect(legacy.client).toEqual({ id: 'c' });
    legacy.dispose();
    expect(dispose).toHaveBeenCalled();
  });
});
