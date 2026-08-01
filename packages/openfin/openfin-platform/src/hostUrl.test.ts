import { afterEach, describe, expect, it, vi } from 'vitest';
import { appendLaunchIdentityParams, resolveHostUrl } from './hostUrl';

describe('resolveHostUrl', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves host-relative paths against window.location', () => {
    vi.stubGlobal('window', { location: { href: 'http://localhost:5174/app/' } });
    expect(resolveHostUrl('/blotters/marketsgrid')).toBe(
      'http://localhost:5174/blotters/marketsgrid',
    );
  });

  it('returns the input unchanged when window is unavailable', () => {
    vi.stubGlobal('window', undefined);
    expect(resolveHostUrl('/relative/path')).toBe('/relative/path');
  });

  it('returns the input unchanged when URL construction throws', () => {
    vi.stubGlobal('window', { location: { href: 'http://localhost/' } });
    const original = globalThis.URL;
    vi.stubGlobal('URL', class extends original {
      constructor(input: string, base?: string) {
        if (input === 'bad-url') throw new TypeError('invalid');
        super(input, base);
      }
    });

    expect(resolveHostUrl('bad-url')).toBe('bad-url');
  });
});

describe('appendLaunchIdentityParams', () => {
  it('appends instanceId and id query params to a host-relative url', () => {
    const stamped = appendLaunchIdentityParams('/blotters/marketsgrid', 'dev1grid-test-123');
    const u = new URL(stamped);
    expect(u.pathname).toBe('/blotters/marketsgrid');
    expect(u.searchParams.get('instanceId')).toBe('dev1grid-test-123');
    expect(u.searchParams.get('id')).toBe('dev1grid-test-123');
  });

  it('preserves existing query params', () => {
    const stamped = appendLaunchIdentityParams(
      resolveHostUrl('/blotters/marketsgrid?foo=bar'),
      'abc',
    );
    const u = new URL(stamped);
    expect(u.searchParams.get('foo')).toBe('bar');
    expect(u.searchParams.get('instanceId')).toBe('abc');
    expect(u.searchParams.get('id')).toBe('abc');
  });

  it('returns the url unchanged for empty inputs or invalid URLs', () => {
    expect(appendLaunchIdentityParams('', 'id')).toBe('');
    expect(appendLaunchIdentityParams('/path', '')).toBe('/path');

    const original = globalThis.URL;
    vi.stubGlobal('URL', class extends original {
      constructor(input: string, base?: string) {
        if (input === 'bad-url') throw new TypeError('invalid');
        super(input, base);
      }
    });
    expect(appendLaunchIdentityParams('bad-url', 'id')).toBe('bad-url');
  });
});
