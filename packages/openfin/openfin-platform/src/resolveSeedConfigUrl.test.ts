import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveSeedConfigUrl } from './resolveSeedConfigUrl';

describe('resolveSeedConfigUrl', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves relative path against providerUrl origin', async () => {
    const url = await resolveSeedConfigUrl(
      '/seed.json',
      'http://localhost:5175/platform/provider',
    );
    expect(url).toBe('http://localhost:5175/seed.json');
  });

  it('prefixes a relative path that lacks a leading slash', async () => {
    const url = await resolveSeedConfigUrl(
      'seed.json',
      'http://localhost:5175/platform/provider',
    );
    expect(url).toBe('http://localhost:5175/seed.json');
  });

  it('passes through absolute http URLs', async () => {
    const url = await resolveSeedConfigUrl(
      'https://cdn.example.com/seed.json',
      'http://localhost:5175/platform/provider',
    );
    expect(url).toBe('https://cdn.example.com/seed.json');
  });

  it('returns empty string for blank input', async () => {
    expect(await resolveSeedConfigUrl('', 'http://localhost:5175/')).toBe('');
    expect(await resolveSeedConfigUrl('  ', undefined)).toBe('');
  });

  it('reads providerUrl from the OpenFin manifest when none is passed', async () => {
    vi.stubGlobal('fin', {
      Application: {
        getCurrent: vi.fn().mockResolvedValue({
          getManifest: vi.fn().mockResolvedValue({
            platform: { providerUrl: 'http://host.example/provider' },
          }),
        }),
      },
    });
    await expect(resolveSeedConfigUrl('/seed.json')).resolves.toBe(
      'http://host.example/seed.json',
    );
  });

  it('returns the trimmed relative URL when the manifest read fails', async () => {
    vi.stubGlobal('fin', {
      Application: {
        getCurrent: vi.fn().mockRejectedValue(new Error('no runtime')),
      },
    });
    await expect(resolveSeedConfigUrl('/seed.json')).resolves.toBe('/seed.json');
  });

  it('returns the trimmed relative URL when the base URL is invalid', async () => {
    await expect(
      resolveSeedConfigUrl('/seed.json', 'not a url'),
    ).resolves.toBe('/seed.json');
  });
});
