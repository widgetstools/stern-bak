import { describe, expect, it, vi } from 'vitest';
import { appDataBootstrapHooks } from './appDataBootstrap.js';

describe('appDataBootstrapHooks', () => {
  it('seeds SessionContext with user and default as-of date', async () => {
    const upsertAppData = vi.fn().mockResolvedValue(undefined);
    const log = vi.fn();
    const userId = 'dev1';

    await appDataBootstrapHooks['session-context']?.({
      userId,
      upsertAppData,
      log,
    } as never);

    expect(upsertAppData).toHaveBeenCalledWith({
      name: 'SessionContext',
      values: {
        userId,
        entitlements: ['desk-a', 'desk-b'],
        'position-asofdate': expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      },
    });
    expect(log).toHaveBeenCalledWith('seeded SessionContext', { userId });
  });
});
