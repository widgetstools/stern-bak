import { describe, expect, it, vi } from 'vitest';
import { asLegacyDataServices } from './asLegacyDataServices';

describe('asLegacyDataServices', () => {
  it('maps hub bundle fields onto legacy DataServices shape', async () => {
    const dispose = vi.fn();
    const ready = Promise.resolve();
    const bundle = {
      client: { id: 'client' },
      appData: { id: 'appData' },
      configManager: { id: 'configManager' },
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
