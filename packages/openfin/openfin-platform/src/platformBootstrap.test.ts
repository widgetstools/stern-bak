import { describe, expect, it, vi, afterEach } from 'vitest';
import { DEV_PLATFORM_BOOTSTRAP } from '@wellsfargo-starui/host-data';
import {
  DEFAULT_MANIFEST_USER_ID,
  resolvePlatformBootstrapFromCustomSettings,
  resolvePlatformBootstrapFromManifest,
} from './platformBootstrap.js';

describe('resolvePlatformBootstrapFromCustomSettings', () => {
  it('maps customSettings to PlatformBootstrapConfig', () => {
    expect(
      resolvePlatformBootstrapFromCustomSettings({
        appId: 'markets-ui-react-reference',
        userId: 'dev1',
        useRest: false,
        configServiceRestUrl: 'http://localhost:3001/api/v1',
        seedConfigUrl: 'http://localhost:5174/seed-config.json',
      }),
    ).toEqual({
      appId: 'markets-ui-react-reference',
      userId: 'dev1',
      useRest: false,
      configServiceRestUrl: 'http://localhost:3001/api/v1',
      seedConfigUrl: 'http://localhost:5174/seed-config.json',
    });
  });

  it('defaults userId to dev1 when omitted', () => {
    expect(
      resolvePlatformBootstrapFromCustomSettings({
        appId: 'TestApp',
      }).userId,
    ).toBe(DEFAULT_MANIFEST_USER_ID);
  });

  it('throws when appId is missing', () => {
    expect(() =>
      resolvePlatformBootstrapFromCustomSettings({ userId: 'dev1' }),
    ).toThrow(/appId/);
  });
});

describe('resolvePlatformBootstrapFromManifest', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns DEV_PLATFORM_BOOTSTRAP outside OpenFin', async () => {
    await expect(resolvePlatformBootstrapFromManifest()).resolves.toEqual(
      DEV_PLATFORM_BOOTSTRAP,
    );
  });

  it('reads customSettings from the current OpenFin manifest', async () => {
    const getManifest = vi.fn().mockResolvedValue({
      customSettings: {
        appId: 'openfin-platform',
        userId: 'alice',
        useRest: true,
        configServiceRestUrl: 'http://localhost:3001/api/v1',
      },
    });

    vi.stubGlobal('fin', {
      Application: {
        getCurrent: vi.fn().mockResolvedValue({ getManifest }),
      },
    });

    await expect(resolvePlatformBootstrapFromManifest()).resolves.toEqual({
      appId: 'openfin-platform',
      userId: 'alice',
      useRest: true,
      configServiceRestUrl: 'http://localhost:3001/api/v1',
      seedConfigUrl: undefined,
    });
  });
});
