import { describe, it, expect, afterEach } from 'vitest';
import { THEME_STORAGE_KEY } from '@wellsfargo-starui/types';
import { readThemePayload, subscribeThemeBroadcast } from './themeBroadcast.js';

describe('readThemePayload', () => {
  it('reads the explicit { theme } shape', () => {
    expect(readThemePayload({ theme: 'dark' })).toBe('dark');
    expect(readThemePayload({ theme: 'light' })).toBe('light');
  });

  it('falls back to the legacy { isDark } shape', () => {
    expect(readThemePayload({ isDark: true })).toBe('dark');
    expect(readThemePayload({ isDark: false })).toBe('light');
  });

  it('returns null for unrecognised payloads', () => {
    expect(readThemePayload(null)).toBeNull();
    expect(readThemePayload('dark')).toBeNull();
    expect(readThemePayload({ theme: 'blue' })).toBeNull();
    expect(readThemePayload({})).toBeNull();
  });
});

describe('subscribeThemeBroadcast', () => {
  const originalFin = (globalThis as { fin?: unknown }).fin;

  afterEach(() => {
    (globalThis as { fin?: unknown }).fin = originalFin;
  });

  it('fires on same-origin storage events for the canonical key', () => {
    (globalThis as { fin?: unknown }).fin = undefined;
    const seen: string[] = [];
    const dispose = subscribeThemeBroadcast((t) => seen.push(t));

    window.dispatchEvent(
      new StorageEvent('storage', { key: THEME_STORAGE_KEY, newValue: 'dark' }),
    );
    window.dispatchEvent(
      new StorageEvent('storage', { key: THEME_STORAGE_KEY, newValue: 'light' }),
    );
    // unrelated keys / values are ignored
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'other', newValue: 'dark' }),
    );
    window.dispatchEvent(
      new StorageEvent('storage', { key: THEME_STORAGE_KEY, newValue: 'purple' }),
    );

    expect(seen).toEqual(['dark', 'light']);

    dispose();
    window.dispatchEvent(
      new StorageEvent('storage', { key: THEME_STORAGE_KEY, newValue: 'dark' }),
    );
    expect(seen).toEqual(['dark', 'light']);
  });

  it('subscribes to IAB theme-changed with a wildcard sender uuid and cleans up', () => {
    const subs: Array<{ id: unknown; topic: string; fn: (m: unknown) => void }> = [];
    let unsubscribed = false;
    (globalThis as { fin?: unknown }).fin = {
      InterApplicationBus: {
        subscribe: (id: unknown, topic: string, fn: (m: unknown) => void) => {
          subs.push({ id, topic, fn });
        },
        unsubscribe: () => {
          unsubscribed = true;
        },
      },
    };

    const seen: string[] = [];
    const dispose = subscribeThemeBroadcast((t) => seen.push(t));

    expect(subs).toHaveLength(1);
    expect(subs[0]?.id).toEqual({ uuid: '*' });
    expect(subs[0]?.topic).toBe('theme-changed');

    subs[0]?.fn({ isDark: true });
    subs[0]?.fn({ theme: 'light' });
    expect(seen).toEqual(['dark', 'light']);

    dispose();
    expect(unsubscribed).toBe(true);
  });
});
