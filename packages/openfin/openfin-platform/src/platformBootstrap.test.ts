import { describe, expect, it, vi, afterEach } from 'vitest';
import { DEV_PLATFORM_BOOTSTRAP, PlatformBootstrapConfigError } from '@wellsfargo-starui/host-data';

const resolveActiveIdentityFromSeedUrl = vi.fn();
const resolveSeedConfigUrl = vi.fn(async (u: string) => u);
const resolvePlatformBootstrapFromJson = vi.fn();

vi.mock('@wellsfargo-starui/host-config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@wellsfargo-starui/host-config')>();
  return {
    ...actual,
    resolveActiveIdentityFromSeedUrl: (...a: unknown[]) =>
      resolveActiveIdentityFromSeedUrl(...a),
  };
});

vi.mock('@wellsfargo-starui/host-data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@wellsfargo-starui/host-data')>();
  return {
    ...actual,
    resolvePlatformBootstrapFromJson: (...a: unknown[]) =>
      resolvePlatformBootstrapFromJson(...a),
  };
});

vi.mock('./resolveSeedConfigUrl.js', () => ({
  resolveSeedConfigUrl: (...a: unknown[]) => resolveSeedConfigUrl(...a),
}));

const {
  DEFAULT_MANIFEST_USER_ID,
  resolveBootstrapManifestScope,
  resolveDeploymentIdentity,
  resolvePlatformBootstrapFromCustomSettings,
  resolvePlatformBootstrapFromManifest,
} = await import('./platformBootstrap.js');

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

  it('uses manifest identity when seedConfigUrl is present with appId+userId', async () => {
    resolveSeedConfigUrl.mockResolvedValueOnce('http://host/seed.json');
    vi.stubGlobal('fin', {
      Application: {
        getCurrent: vi.fn().mockResolvedValue({
          getManifest: vi.fn().mockResolvedValue({
            platform: { providerUrl: 'http://host/provider' },
            customSettings: {
              appId: 'manifest-app',
              userId: 'manifest-user',
              seedConfigUrl: '/seed.json',
              seedConfigReload: 'when-changed',
            },
          }),
        }),
      },
    });
    await expect(resolvePlatformBootstrapFromManifest()).resolves.toEqual({
      appId: 'manifest-app',
      userId: 'manifest-user',
      useRest: undefined,
      configServiceRestUrl: undefined,
      seedConfigUrl: 'http://host/seed.json',
      seedConfigReload: 'when-changed',
    });
  });

  it('falls back to seed identity when manifest omits appId/userId', async () => {
    resolveSeedConfigUrl.mockResolvedValueOnce('http://host/seed.json');
    resolveActiveIdentityFromSeedUrl.mockResolvedValueOnce({
      activeAppId: 'seed-app',
      activeUserId: 'seed-user',
    });
    vi.stubGlobal('fin', {
      Application: {
        getCurrent: vi.fn().mockResolvedValue({
          getManifest: vi.fn().mockResolvedValue({
            customSettings: { seedConfigUrl: '/seed.json' },
          }),
        }),
      },
    });
    await expect(resolvePlatformBootstrapFromManifest()).resolves.toMatchObject({
      appId: 'seed-app',
      userId: 'seed-user',
      seedConfigUrl: 'http://host/seed.json',
    });
  });

  it('throws PlatformBootstrapConfigError when seed identity is missing', async () => {
    resolveSeedConfigUrl.mockResolvedValueOnce('http://host/seed.json');
    resolveActiveIdentityFromSeedUrl.mockResolvedValueOnce(null);
    vi.stubGlobal('fin', {
      Application: {
        getCurrent: vi.fn().mockResolvedValue({
          getManifest: vi.fn().mockResolvedValue({
            customSettings: { seedConfigUrl: '/seed.json' },
          }),
        }),
      },
    });
    await expect(resolvePlatformBootstrapFromManifest()).rejects.toBeInstanceOf(
      PlatformBootstrapConfigError,
    );
  });

  it('rewraps non-PlatformBootstrapConfigError failures', async () => {
    vi.stubGlobal('fin', {
      Application: {
        getCurrent: vi.fn().mockRejectedValue(new Error('runtime down')),
      },
    });
    await expect(resolvePlatformBootstrapFromManifest()).rejects.toThrow(
      /Failed to read OpenFin manifest/,
    );
  });
});

describe('resolveDeploymentIdentity / resolveBootstrapManifestScope', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resolveActiveIdentityFromSeedUrl.mockReset();
    resolveSeedConfigUrl.mockReset().mockImplementation(async (u: string) => u);
    resolvePlatformBootstrapFromJson.mockReset();
  });

  it('reads identity from seed when seedConfigUrl is provided', async () => {
    resolveSeedConfigUrl.mockResolvedValueOnce('http://host/seed.json');
    resolveActiveIdentityFromSeedUrl.mockResolvedValueOnce({
      activeAppId: 'seed-app',
      activeUserId: 'seed-user',
    });
    await expect(
      resolveDeploymentIdentity({ seedConfigUrl: '/seed.json' }, 'http://host/p'),
    ).resolves.toEqual({ appId: 'seed-app', userId: 'seed-user' });
  });

  it('throws when seed identity is incomplete', async () => {
    resolveSeedConfigUrl.mockResolvedValueOnce('http://host/seed.json');
    resolveActiveIdentityFromSeedUrl.mockResolvedValueOnce(null);
    await expect(
      resolveDeploymentIdentity({ seedConfigUrl: '/seed.json' }),
    ).rejects.toBeInstanceOf(PlatformBootstrapConfigError);
  });

  it('falls back to bootstrap scope then manifest then defaults', async () => {
    resolvePlatformBootstrapFromJson.mockResolvedValueOnce({
      appId: 'from-json',
      userId: 'from-json-user',
    });
    await expect(resolveDeploymentIdentity(null)).resolves.toEqual({
      appId: 'from-json',
      userId: 'from-json-user',
    });
  });

  it('resolveBootstrapManifestScope returns null on failure', async () => {
    resolvePlatformBootstrapFromJson.mockRejectedValueOnce(new Error('404'));
    await expect(resolveBootstrapManifestScope()).resolves.toBeNull();
  });

  it('resolveBootstrapManifestScope reads OpenFin bootstrap when fin is present', async () => {
    vi.stubGlobal('fin', {
      Application: {
        getCurrent: vi.fn().mockResolvedValue({
          getManifest: vi.fn().mockResolvedValue({
            customSettings: { appId: 'of-app', userId: 'of-user' },
          }),
        }),
      },
    });
    await expect(resolveBootstrapManifestScope()).resolves.toEqual({
      appId: 'of-app',
      userId: 'of-user',
    });
  });
});
