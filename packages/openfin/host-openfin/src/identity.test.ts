import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LOGGED_IN_USER_ID } from '@wellsfargo-starui/types';
import { resolveOpenFinIdentity, isOpenFin, getCurrentView } from './identity.js';

/**
 * Tests run under jsdom; we control the `fin` global directly to
 * simulate an OpenFin context without pulling in the full runtime.
 */

describe('resolveOpenFinIdentity', () => {
  let originalFin: unknown;

  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    originalFin = (globalThis as any).fin;
  });

  afterEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fin = originalFin;
  });

  it('falls back to URL+overrides when no view is available', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fin = undefined;
    const id = await resolveOpenFinIdentity({
      url: 'http://localhost/?appId=app-from-url',
      overrides: { userId: 'u-default' },
    });
    expect(id.appId).toBe('app-from-url');
    // userId is single-user-pinned regardless of overrides.
    expect(id.userId).toBe(LOGGED_IN_USER_ID);
    expect(id.instanceId).toMatch(/^browser-/);
  });

  it('uses view customData when present (wins over URL/overrides)', async () => {
    const fakeView = {
      identity: { name: 'view-name-1' },
      getOptions: async () => ({
        customData: {
          appId: 'app-from-cd',
          userId: 'u-from-cd',
          componentType: 'MarketsGrid',
          isTemplate: true,
          singleton: false,
          roles: ['trader'],
        },
      }),
    };

    const id = await resolveOpenFinIdentity({
      view: fakeView,
      url: 'http://localhost/?appId=app-from-url',
      overrides: { userId: 'u-override' },
    });

    expect(id.appId).toBe('app-from-cd');
    expect(id.userId).toBe('u-from-cd');
    expect(id.componentType).toBe('MarketsGrid');
    expect(id.isTemplate).toBe(true);
    expect(id.singleton).toBe(false);
    expect(id.roles).toEqual(['trader']);
    expect(id.instanceId).toBe('view-name-1');
  });

  it('view.identity.name is used when customData lacks instanceId', async () => {
    const fakeView = {
      identity: { name: 'view-iid' },
      getOptions: async () => ({ customData: { appId: 'a' } }),
    };
    const id = await resolveOpenFinIdentity({ view: fakeView, url: 'http://localhost/' });
    expect(id.instanceId).toBe('view-iid');
  });

  it('handles a view whose getOptions throws — degrades to URL+overrides', async () => {
    const fakeView = {
      identity: { name: 'view-iid' },
      getOptions: async () => { throw new Error('oops'); },
    };
    const id = await resolveOpenFinIdentity({
      view: fakeView,
      url: 'http://localhost/?appId=app-x',
    });
    expect(id.appId).toBe('app-x');
    expect(id.instanceId).toBe('view-iid');
  });

  it('rejects non-string/non-bool customData fields (falls through to URL/override layer)', async () => {
    const fakeView = {
      identity: { name: 'v' },
      getOptions: async () => ({
        customData: {
          appId: 42,            // not a string — ignored
          userId: { x: 1 },     // not a string — ignored
          isTemplate: 'yes',    // not a boolean — ignored
          roles: [1, 2, 3],     // not strings — ignored
        },
      }),
    };
    const id = await resolveOpenFinIdentity({
      view: fakeView,
      url: 'http://localhost/?appId=app-x',
      overrides: { userId: 'u-override', isTemplate: false },
    });
    expect(id.appId).toBe('app-x');
    // userId is single-user-pinned — overrides are intentionally ignored.
    expect(id.userId).toBe(LOGGED_IN_USER_ID);
    expect(id.isTemplate).toBe(false);
    expect(id.roles).toEqual([]);
  });
});

describe('isOpenFin / getCurrentView', () => {
  let originalFin: unknown;
  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    originalFin = (globalThis as any).fin;
  });
  afterEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fin = originalFin;
  });

  it('returns false / null when fin is missing', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fin = undefined;
    expect(isOpenFin()).toBe(false);
    expect(getCurrentView()).toBe(null);
  });

  it('returns true / view when fin.View.getCurrentSync is wired', () => {
    const fakeView = { identity: { name: 'v' }, getOptions: async () => ({}) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fin = { View: { getCurrentSync: () => fakeView } };
    expect(isOpenFin()).toBe(true);
    expect(getCurrentView()).toBe(fakeView);
  });
});
