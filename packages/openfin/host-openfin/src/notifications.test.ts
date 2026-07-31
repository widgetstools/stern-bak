import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  dispatchOpenFinNotification, loadOpenFinNotificationsApi,
  type OpenFinNotificationsApi,
} from './notifications.js';

/**
 * This is the only place in the platform allowed to touch
 * `@openfin/workspace/notifications` (docs/ARCHITECTURE.md). Both functions are
 * deliberately failure-tolerant: a non-OpenFin host has no package at all, and
 * a flaky notification centre must never take the host app down.
 */

afterEach(() => vi.restoreAllMocks());

function api(over: Partial<OpenFinNotificationsApi> = {}): OpenFinNotificationsApi {
  return { create: vi.fn(async () => undefined), ...over };
}

describe('loadOpenFinNotificationsApi', () => {
  afterEach(() => { vi.doUnmock('@openfin/workspace/notifications'); vi.resetModules(); });

  it('returns the api when the package resolves and exposes create', async () => {
    // @openfin/* are optional peers and ARE installed in this workspace, so the
    // dynamic import succeeds here.
    const loaded = await loadOpenFinNotificationsApi();
    expect(loaded).not.toBeNull();
    expect(typeof loaded?.create).toBe('function');
  });

  it('returns null when the package is absent — the non-OpenFin host', async () => {
    vi.resetModules();
    vi.doMock('@openfin/workspace/notifications', () => { throw new Error('not installed'); });
    const { loadOpenFinNotificationsApi: load } = await import('./notifications.js');
    await expect(load()).resolves.toBeNull();
  });

  it('returns null when the module resolves but has no create', async () => {
    vi.resetModules();
    vi.doMock('@openfin/workspace/notifications', () => ({ somethingElse: true }));
    const { loadOpenFinNotificationsApi: load } = await import('./notifications.js');
    await expect(load()).resolves.toBeNull();
  });
});

describe('dispatchOpenFinNotification', () => {
  const input = {
    platformUuid: 'star-demo',
    title: 'Limit breached',
    body: 'DV01 above threshold',
    category: 'warning',
    customData: { ruleId: 'r-1' },
  };

  it('maps the payload onto the OpenFin notification shape', async () => {
    const notifications = api();
    await dispatchOpenFinNotification(notifications, input);

    expect(notifications.create).toHaveBeenCalledWith({
      platform: 'star-demo',
      title: 'Limit breached',
      body: 'DV01 above threshold',
      toast: 'transient',
      category: 'warning',
      template: 'markdown',
      customData: { ruleId: 'r-1' },
    });
  });

  it('passes platform through as undefined when no uuid is given', async () => {
    const notifications = api();
    await dispatchOpenFinNotification(notifications, {
      title: 't', body: 'b', category: 'info',
    });
    expect((notifications.create as ReturnType<typeof vi.fn>).mock.calls[0][0].platform)
      .toBeUndefined();
  });

  it('swallows a rejecting create and warns instead of throwing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const notifications = api({ create: vi.fn(async () => { throw new Error('centre down'); }) });

    await expect(dispatchOpenFinNotification(notifications, input)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });

  it('swallows a synchronously throwing create', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const notifications = api({
      create: vi.fn(() => { throw new Error('boom'); }) as unknown as OpenFinNotificationsApi['create'],
    });
    await expect(dispatchOpenFinNotification(notifications, input)).resolves.toBeUndefined();
  });

  it('resolves once create resolves', async () => {
    const notifications = api();
    await expect(dispatchOpenFinNotification(notifications, input)).resolves.toBeUndefined();
    expect(notifications.create).toHaveBeenCalledTimes(1);
  });
});
