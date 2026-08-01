/**
 * `AppIdentity` plumbing tests for `ConfigManager`.
 *
 * Session 2 of the config-manager redesign: this surface is purely
 * additive — `appId` and `identity` flow into `ConfigManagerOptions`
 * with dev defaults, and `ConfigManager` exposes them via two
 * read-only accessors. No call site is required to pass them yet, so
 * every assertion here is "the option you didn't pass got the dev
 * placeholder, and the option you did pass survived verbatim."
 *
 * Behavior change for write paths (owner / audit stamping) lands in
 * Session 3, which means none of these tests need a populated
 * database — we never call `init()`.
 */

import { describe, it, expect } from 'vitest';
import { createConfigManager } from './ConfigManager';
import type { AppIdentity } from './types';

describe('ConfigManager — AppIdentity plumbing (Session 2)', () => {
  it('falls back to dev placeholders when no options supplied', () => {
    const cm = createConfigManager();

    expect(cm.getAppId()).toBe('dev-app');
    expect(cm.getIdentity()).toEqual({
      userId: 'dev-user',
      displayName: 'Dev User',
    });

    cm.dispose();
  });

  it('returns the supplied appId verbatim', () => {
    const cm = createConfigManager({ appId: 'TradingDesk' });
    expect(cm.getAppId()).toBe('TradingDesk');
    cm.dispose();
  });

  it('returns the supplied identity verbatim, including getAccessToken', () => {
    const getAccessToken = async () => 'tok-1234';
    const identity: AppIdentity = {
      userId: 'alice',
      displayName: 'Alice Liddell',
      getAccessToken,
    };

    const cm = createConfigManager({ appId: 'TradingDesk', identity });

    expect(cm.getIdentity()).toEqual(identity);
    expect(cm.getIdentity().getAccessToken).toBe(getAccessToken);
    expect(cm.getAppId()).toBe('TradingDesk');

    cm.dispose();
  });

  it('uses dev appId when only identity is supplied', () => {
    const cm = createConfigManager({
      identity: { userId: 'bob', displayName: 'Bob' },
    });
    expect(cm.getAppId()).toBe('dev-app');
    expect(cm.getIdentity().userId).toBe('bob');
    cm.dispose();
  });

  it('uses dev identity when only appId is supplied', () => {
    const cm = createConfigManager({ appId: 'TradingDesk' });
    expect(cm.getAppId()).toBe('TradingDesk');
    expect(cm.getIdentity()).toEqual({
      userId: 'dev-user',
      displayName: 'Dev User',
    });
    cm.dispose();
  });
});
