import { describe, it, expect, vi } from 'vitest';
import { resolveDefaultPlatformScope } from './platformScope';
import type { ConfigManager } from '@wellsfargo-starui/host-config';

function fakeManager(over: {
  appId?: string;
  userId?: string;
  apps?: Array<{ appId: string; manifestUrl?: string }>;
  profiles?: Array<{ userId: string; appId: string }>;
}): ConfigManager {
  const appId = over.appId ?? '';
  const userId = over.userId ?? '';
  return {
    getAppId: () => appId,
    getIdentity: () => ({ userId, displayName: userId }),
    getAllApps: vi.fn(async () => over.apps ?? []),
    getAllUserProfiles: vi.fn(async () => over.profiles ?? []),
  } as unknown as ConfigManager;
}

describe('resolveDefaultPlatformScope', () => {
  it('prefers ConfigManager identity from seed activeAppId / activeUserId', async () => {
    const scope = await resolveDefaultPlatformScope(
      fakeManager({ appId: 'StarDemo', userId: 'k151344' }),
      { appId: 'manifest-override', userId: 'manifest-user' },
    );
    expect(scope).toEqual({ appId: 'StarDemo', userId: 'k151344' });
  });

  it('falls back to seeded appRegistry when manager appId is empty', async () => {
    const scope = await resolveDefaultPlatformScope(
      fakeManager({
        apps: [{ appId: 'StarDemo', manifestUrl: 'http://localhost:5175/platform/manifest.fin.json' }],
        profiles: [{ userId: 'dev1', appId: 'StarDemo' }],
      }),
      { userId: 'dev1' },
    );
    expect(scope.appId).toBe('StarDemo');
    expect(scope.userId).toBe('dev1');
  });

  it('uses TestApp only when manager, manifest, and registry are empty', async () => {
    const scope = await resolveDefaultPlatformScope(fakeManager({}), null);
    expect(scope).toEqual({ appId: 'TestApp', userId: 'dev1' });
  });
});
