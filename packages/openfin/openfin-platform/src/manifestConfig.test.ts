import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getConfigServiceRestUrlFromManifest,
  resolveRestUrl,
} from './manifestConfig.js';

describe('resolveRestUrl', () => {
  it('returns undefined when useRest is off', () => {
    expect(
      resolveRestUrl({
        appId: 'x',
        useRest: false,
        configServiceRestUrl: 'http://localhost:3001/api/v1',
      }),
    ).toBeUndefined();
  });

  it('returns undefined when the URL is empty', () => {
    expect(
      resolveRestUrl({ appId: 'x', useRest: true, configServiceRestUrl: '' }),
    ).toBeUndefined();
  });

  it('returns the URL when REST mode is enabled', () => {
    expect(
      resolveRestUrl({
        appId: 'x',
        useRest: true,
        configServiceRestUrl: 'http://localhost:3001/api/v1',
      }),
    ).toBe('http://localhost:3001/api/v1');
  });

  it('returns undefined for missing customSettings', () => {
    expect(resolveRestUrl(undefined)).toBeUndefined();
  });
});

describe('getConfigServiceRestUrlFromManifest', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns undefined outside OpenFin', async () => {
    vi.stubGlobal('fin', undefined);
    await expect(getConfigServiceRestUrlFromManifest()).resolves.toBeUndefined();
  });

  it('reads customSettings from the current manifest', async () => {
    vi.stubGlobal('fin', {
      Application: {
        getCurrent: vi.fn().mockResolvedValue({
          getManifest: vi.fn().mockResolvedValue({
            customSettings: {
              useRest: true,
              configServiceRestUrl: 'http://localhost:3001/api/v1',
            },
          }),
        }),
      },
    });
    await expect(getConfigServiceRestUrlFromManifest()).resolves.toBe(
      'http://localhost:3001/api/v1',
    );
  });

  it('swallows manifest read failures', async () => {
    vi.stubGlobal('fin', {
      Application: {
        getCurrent: vi.fn().mockRejectedValue(new Error('no runtime')),
      },
    });
    await expect(getConfigServiceRestUrlFromManifest()).resolves.toBeUndefined();
  });
});
