import { describe, expect, it, vi } from 'vitest';
import { defineStarGridPlugin, type StarGridPlugin } from './plugins.js';

/**
 * `defineStarGridPlugin` is an identity function whose value is compile-time
 * type inference. The runtime contract still matters: it must return the very
 * same object, because callers rely on reference identity when registering and
 * de-registering plugins.
 */
describe('defineStarGridPlugin', () => {
  it('returns the same object reference', () => {
    const plugin: StarGridPlugin = { id: 'openfin-workspace' };
    expect(defineStarGridPlugin(plugin)).toBe(plugin);
  });

  it('preserves an optional register hook', async () => {
    const register = vi.fn();
    const plugin = defineStarGridPlugin({ id: 'p', register });

    await plugin.register?.({ appId: 'Star-Demo' });
    expect(register).toHaveBeenCalledWith({ appId: 'Star-Demo' });
  });

  it('accepts a plugin with no register hook', () => {
    const plugin = defineStarGridPlugin({ id: 'inert' });
    expect(plugin.register).toBeUndefined();
    expect(plugin.id).toBe('inert');
  });

  it('supports an async register hook', async () => {
    const plugin = defineStarGridPlugin({
      id: 'async',
      register: async () => { await Promise.resolve(); },
    });
    await expect(plugin.register?.({ appId: 'a' })).resolves.toBeUndefined();
  });
});
