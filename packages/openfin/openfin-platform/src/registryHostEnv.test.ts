import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const resolveBootstrapManifestScope = vi.fn();

vi.mock('./platformBootstrap.js', () => ({
  resolveBootstrapManifestScope: (...args: unknown[]) =>
    resolveBootstrapManifestScope(...args),
}));

const {
  DEFAULT_APP_ID,
  DEFAULT_USER_ID,
  encodeHostEnvForQueryString,
  isHostEnvMissing,
  readHostEnv,
} = await import('./registryHostEnv.js');

describe('isHostEnvMissing', () => {
  it('is true when appId or configServiceUrl is empty', () => {
    expect(isHostEnvMissing({ appId: '', configServiceUrl: 'http://x' })).toBe(true);
    expect(isHostEnvMissing({ appId: 'a', configServiceUrl: '' })).toBe(true);
    expect(isHostEnvMissing({ appId: 'a', configServiceUrl: 'http://x' })).toBe(false);
  });
});

describe('encodeHostEnvForQueryString / readHostEnv query path', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState({}, '', '/');
  });

  beforeEach(() => {
    resolveBootstrapManifestScope.mockReset();
    resolveBootstrapManifestScope.mockResolvedValue(null);
  });

  it('round-trips configServiceUrl via ?hostEnv= (appId/userId pinned)', async () => {
    const encoded = encodeHostEnvForQueryString({
      appId: 'ignored',
      userId: 'ignored',
      configServiceUrl: 'http://cfg.example/api',
    });
    window.history.replaceState({}, '', `/?hostEnv=${encodeURIComponent(encoded)}`);

    await expect(readHostEnv()).resolves.toEqual({
      appId: DEFAULT_APP_ID,
      userId: DEFAULT_USER_ID,
      configServiceUrl: 'http://cfg.example/api',
    });
  });

  it('ignores invalid query payloads', async () => {
    window.history.replaceState({}, '', '/?hostEnv=%%%not-base64%%%');
    resolveBootstrapManifestScope.mockResolvedValue(null);
    await expect(readHostEnv()).resolves.toEqual({
      appId: DEFAULT_APP_ID,
      userId: DEFAULT_USER_ID,
      configServiceUrl: 'http://localhost:0000',
    });
  });

  it('ignores query payload missing configServiceUrl', async () => {
    const encoded = btoa(JSON.stringify({ appId: 'x' }));
    window.history.replaceState({}, '', `/?hostEnv=${encodeURIComponent(encoded)}`);
    await expect(readHostEnv()).resolves.toMatchObject({
      configServiceUrl: 'http://localhost:0000',
    });
  });
});

describe('readHostEnv', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState({}, '', '/');
  });

  beforeEach(() => {
    resolveBootstrapManifestScope.mockReset();
  });

  it('returns DEV_FALLBACK outside OpenFin when bootstrap is unavailable', async () => {
    vi.stubGlobal('fin', undefined);
    resolveBootstrapManifestScope.mockResolvedValue(null);
    await expect(readHostEnv()).resolves.toEqual({
      appId: DEFAULT_APP_ID,
      userId: DEFAULT_USER_ID,
      configServiceUrl: 'http://localhost:0000',
    });
  });

  it('prefers web bootstrap over DEV_FALLBACK', async () => {
    vi.stubGlobal('fin', undefined);
    resolveBootstrapManifestScope.mockResolvedValue({
      appId: 'from-json',
      userId: 'user-json',
    });
    await expect(readHostEnv()).resolves.toEqual({
      appId: 'from-json',
      userId: 'user-json',
      configServiceUrl: 'http://localhost:0000',
    });
  });

  it('reads OpenFin customData and fills gaps from bootstrap', async () => {
    vi.stubGlobal('fin', {
      me: {
        getOptions: vi.fn().mockResolvedValue({
          customData: { configServiceUrl: 'http://of/api' },
        }),
      },
    });
    resolveBootstrapManifestScope.mockResolvedValue({
      appId: 'boot-app',
      userId: 'boot-user',
    });
    await expect(readHostEnv()).resolves.toEqual({
      appId: 'boot-app',
      userId: 'boot-user',
      configServiceUrl: 'http://of/api',
    });
  });

  it('uses customData appId/userId when present', async () => {
    vi.stubGlobal('fin', {
      me: {
        getOptions: vi.fn().mockResolvedValue({
          customData: {
            appId: 'cd-app',
            userId: 'cd-user',
            configServiceUrl: 'http://of/api',
          },
        }),
      },
    });
    await expect(readHostEnv()).resolves.toEqual({
      appId: 'cd-app',
      userId: 'cd-user',
      configServiceUrl: 'http://of/api',
    });
    expect(resolveBootstrapManifestScope).not.toHaveBeenCalled();
  });

  it('falls back when getOptions throws', async () => {
    vi.stubGlobal('fin', {
      me: { getOptions: vi.fn().mockRejectedValue(new Error('gone')) },
    });
    resolveBootstrapManifestScope.mockResolvedValue({
      appId: 'boot',
      userId: 'u',
    });
    await expect(readHostEnv()).resolves.toEqual({
      appId: 'boot',
      userId: 'u',
      configServiceUrl: '',
    });
  });

  it('returns empty configServiceUrl defaults when getOptions throws and bootstrap is null', async () => {
    vi.stubGlobal('fin', {
      me: { getOptions: vi.fn().mockRejectedValue(new Error('gone')) },
    });
    resolveBootstrapManifestScope.mockResolvedValue(null);
    await expect(readHostEnv()).resolves.toEqual({
      appId: DEFAULT_APP_ID,
      userId: DEFAULT_USER_ID,
      configServiceUrl: '',
    });
  });
});
