import { describe, it, expect } from 'vitest';
import { buildPlatformChildUrl } from './buildPlatformChildUrl';

describe('buildPlatformChildUrl', () => {
  it('builds plain path URLs when the manifest is path-routed (BrowserRouter)', () => {
    expect(buildPlatformChildUrl('http://localhost:5197/platform/provider', '/config-browser')).toBe(
      'http://localhost:5197/config-browser',
    );
  });

  it('builds fragment URLs when the manifest is hash-routed (HashRouter)', () => {
    expect(buildPlatformChildUrl('http://localhost:5175/#/platform/provider', '/config-browser')).toBe(
      'http://localhost:5175/#/config-browser',
    );
  });

  it('keeps the query inside the fragment under hash mode (read via useSearchParams)', () => {
    expect(
      buildPlatformChildUrl('http://localhost:5175/#/platform/provider', '/dataproviders?id=abc'),
    ).toBe('http://localhost:5175/#/dataproviders?id=abc');
  });

  it('only uses the origin of the manifest URL, ignoring its path/search', () => {
    expect(
      buildPlatformChildUrl('http://localhost:5197/platform/provider?e2eBridge=1', '/dataproviders'),
    ).toBe('http://localhost:5197/dataproviders');
  });

  it('returns null for an empty / unparseable providerUrl so callers can early-return', () => {
    expect(buildPlatformChildUrl('', '/x')).toBeNull();
    expect(buildPlatformChildUrl('not a url', '/x')).toBeNull();
  });
});
