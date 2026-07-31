import { describe, expect, it } from 'vitest';
import { LOGGED_IN_USER_ID } from '@wellsfargo-starui/types';
import { resolveBrowserIdentity } from './identity.js';

describe('resolveBrowserIdentity', () => {
  it('reads appId and instanceId from URL params', () => {
    const id = resolveBrowserIdentity('appId=blotter&instanceId=inst-1', {}, () => 'uuid');
    expect(id.appId).toBe('blotter');
    expect(id.instanceId).toBe('inst-1');
    expect(id.userId).toBe(LOGGED_IN_USER_ID);
  });

  it('mints a browser-prefixed instanceId when absent', () => {
    const id = resolveBrowserIdentity('', {}, () => 'fixed-uuid');
    expect(id.instanceId).toBe('browser-fixed-uuid');
  });

  it('merges customData from URL over overrides', () => {
    const encoded = btoa(JSON.stringify({ gridId: 'g1' }));
    const id = resolveBrowserIdentity(
      `data=${encodeURIComponent(encoded)}`,
      { customData: { theme: 'dark' } },
      () => 'u',
    );
    expect(id.customData).toEqual({ theme: 'dark', gridId: 'g1' });
  });

  it('parses roles from comma-delimited param', () => {
    const id = resolveBrowserIdentity('roles=admin,trader', {}, () => 'u');
    expect(id.roles).toEqual(['admin', 'trader']);
  });
});
