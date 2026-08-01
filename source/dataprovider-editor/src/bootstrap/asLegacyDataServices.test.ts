import { describe, expect, it, vi } from 'vitest';
import type { DataServices } from '@wellsfargo-starui/data/runtime';
import { asLegacyDataServices } from './asLegacyDataServices';

describe('asLegacyDataServices', () => {
  it('maps hub bundle fields onto legacy DataServices shape', async () => {
    const dispose = vi.fn();
    const ready = Promise.resolve();
    // The bridge passes these three services through by reference, so opaque
    // tokens standing in for the real classes are the point of the mock.
    const bundle = {
      client: { id: 'client' } as unknown as DataServices['client'],
      appData: { id: 'appData' } as unknown as DataServices['appData'],
      configManager: { id: 'configManager' } as unknown as DataServices['configManager'],
      ready,
      dispose,
    };

    const legacy = asLegacyDataServices(bundle);

    expect(legacy.client).toBe(bundle.client);
    expect(legacy.appData).toBe(bundle.appData);
    expect(legacy.configManager).toBe(bundle.configManager);
    expect(legacy.ready).toBe(ready);
    expect(legacy.dispose).not.toBe(dispose);

    legacy.dispose();
    expect(dispose).toHaveBeenCalledOnce();
  });
});
