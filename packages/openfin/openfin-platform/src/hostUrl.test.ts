import { describe, expect, it } from 'vitest';
import { appendLaunchIdentityParams, resolveHostUrl } from './hostUrl';

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
});
