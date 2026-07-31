import { describe, expect, it } from 'vitest';
import { resolveSeedConfigUrl } from './resolveSeedConfigUrl';

describe('resolveSeedConfigUrl', () => {
  it('resolves relative path against providerUrl origin', async () => {
    const url = await resolveSeedConfigUrl(
      '/seed.json',
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
});
