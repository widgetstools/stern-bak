/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { subscribeActiveThemeMode } from './useActiveThemeMode.js';

describe('subscribeActiveThemeMode (node)', () => {
  it('returns noop cleanup when document is unavailable', () => {
    const cleanup = subscribeActiveThemeMode(() => {});
    expect(typeof cleanup).toBe('function');
    expect(cleanup()).toBeUndefined();
  });
});
