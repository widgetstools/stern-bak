import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PlatformBootstrapConfigError,
  resolvePlatformBootstrapFromJson,
  resolvePlatformBootstrapFromObject,
} from './resolvePlatformBootstrap.js';

describe('resolvePlatformBootstrapFromObject', () => {
  it('parses a valid object', () => {
    expect(
      resolvePlatformBootstrapFromObject({
        appId: 'markets-ui-dev',
        userId: 'dev1',
        useRest: false,
        configServiceRestUrl: 'http://localhost:3001/api/v1',
        seedConfigUrl: '/seed-config.json',
      }),
    ).toEqual({
      appId: 'markets-ui-dev',
      userId: 'dev1',
      useRest: false,
      configServiceRestUrl: 'http://localhost:3001/api/v1',
      seedConfigUrl: '/seed-config.json',
    });
  });

  it('trims appId and userId', () => {
    expect(
      resolvePlatformBootstrapFromObject({
        appId: '  TestApp  ',
        userId: ' dev1 ',
      }),
    ).toEqual({
      appId: 'TestApp',
      userId: 'dev1',
      useRest: undefined,
      configServiceRestUrl: undefined,
      seedConfigUrl: undefined,
    });
  });

  it('rejects non-objects', () => {
    expect(() => resolvePlatformBootstrapFromObject(null)).toThrow(
      PlatformBootstrapConfigError,
    );
    expect(() => resolvePlatformBootstrapFromObject([])).toThrow(
      /JSON object/,
    );
  });

  it('rejects missing appId', () => {
    expect(() =>
      resolvePlatformBootstrapFromObject({ userId: 'dev1' }),
    ).toThrow(/appId/);
  });

  it('rejects empty userId after trim', () => {
    expect(() =>
      resolvePlatformBootstrapFromObject({ appId: 'x', userId: '   ' }),
    ).toThrow(PlatformBootstrapConfigError);
  });

  it('parses appDataBootstrap manifest from JSON object', () => {
    expect(
      resolvePlatformBootstrapFromObject({
        appId: 'platform-hooks-demo',
        userId: 'dev1',
        appDataBootstrap: {
          onHubReady: ['session-context', 'desk-defaults'],
          runPolicy: 'if-missing',
          targets: {
            'session-context': ['SessionContext'],
            'desk-defaults': ['DeskDefaults', 'positions'],
          },
        },
      }),
    ).toEqual({
      appId: 'platform-hooks-demo',
      userId: 'dev1',
      useRest: undefined,
      configServiceRestUrl: undefined,
      seedConfigUrl: undefined,
      appDataBootstrap: {
        onHubReady: ['session-context', 'desk-defaults'],
        runPolicy: 'if-missing',
        targets: {
          'session-context': ['SessionContext'],
          'desk-defaults': ['DeskDefaults', 'positions'],
        },
      },
    });
  });
});

describe('resolvePlatformBootstrapFromJson', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches and parses config', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          appId: 'markets-ui-dev',
          userId: 'dev1',
          useRest: false,
        }),
      }),
    );

    await expect(
      resolvePlatformBootstrapFromJson('/app-config.json'),
    ).resolves.toEqual({
      appId: 'markets-ui-dev',
      userId: 'dev1',
      useRest: false,
      configServiceRestUrl: undefined,
      seedConfigUrl: undefined,
    });
  });

  it('throws on HTTP error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 404 }),
    );

    await expect(
      resolvePlatformBootstrapFromJson('/missing.json'),
    ).rejects.toThrow(/HTTP 404/);
  });

  it('throws on invalid JSON body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => {
          throw new SyntaxError('bad json');
        },
      }),
    );

    await expect(
      resolvePlatformBootstrapFromJson('/app-config.json'),
    ).rejects.toThrow(/not valid JSON/);
  });

  it('throws on network failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    );

    await expect(
      resolvePlatformBootstrapFromJson('/app-config.json'),
    ).rejects.toThrow(/Failed to fetch platform bootstrap config/);
  });

  it('resolves appId and userId from seed activeAppId / activeUserId', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string) => {
        if (String(url).includes('seed')) {
          return {
            ok: true,
            json: async () => ({
              activeAppId: 'star-demo',
              activeUserId: 'k151344',
              appRegistry: [{
                appId: 'star-demo',
                displayName: 'Star',
                manifestUrl: 'http://x/m.json',
                configServiceEnabled: false,
                environment: 'dev',
              }],
              userProfiles: [],
              roles: [],
              permissions: [],
            }),
          };
        }
        return {
          ok: true,
          json: async () => ({
            seedConfigUrl: '/seed.json',
            useRest: false,
          }),
        };
      }),
    );

    await expect(
      resolvePlatformBootstrapFromJson('/app-config.json'),
    ).resolves.toEqual({
      appId: 'star-demo',
      userId: 'k151344',
      useRest: false,
      configServiceRestUrl: undefined,
      seedConfigUrl: '/seed.json',
    });
  });
});
