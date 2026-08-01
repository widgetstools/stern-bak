import { describe, expect, it } from 'vitest';
import { THEME_BROADCAST_CHANNEL, THEME_STORAGE_KEY } from './theme.js';

/**
 * These two strings are a cross-package contract, not implementation
 * detail: `host-openfin`'s OpenFinRuntime writes `THEME_STORAGE_KEY` to
 * localStorage while `host-browser` and the design-system read it back,
 * and separate windows rendezvous on `THEME_BROADCAST_CHANNEL`. Changing
 * either value silently de-syncs theme across an already-deployed app,
 * so the literals are pinned here.
 */
describe('theme constants', () => {
  it('pins the localStorage key used to persist the chosen theme', () => {
    expect(THEME_STORAGE_KEY).toBe('starui:theme');
  });

  it('pins the BroadcastChannel name peer windows rendezvous on', () => {
    expect(THEME_BROADCAST_CHANNEL).toBe('starui:theme');
  });
});
