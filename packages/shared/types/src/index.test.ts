import { describe, expect, it } from 'vitest';
import {
  LOGGED_IN_USER_ID, THEME_BROADCAST_CHANNEL, THEME_STORAGE_KEY,
} from './index.js';

/**
 * The barrel is almost entirely types, which erase at runtime. The three
 * runtime constants are cross-window contracts — the storage key and channel
 * name are read by other packages and by already-deployed windows, so changing
 * a value silently breaks theme sync rather than failing to compile.
 */
describe('@wellsfargo-starui/types constants', () => {
  it('pins the theme storage key', () => {
    expect(THEME_STORAGE_KEY).toBe('starui:theme');
  });

  it('pins the theme broadcast channel name', () => {
    expect(THEME_BROADCAST_CHANNEL).toBe('starui:theme');
  });

  it('exposes the deprecated dev user id fallback', () => {
    expect(LOGGED_IN_USER_ID).toBe('dev1');
  });
});
