import { beforeEach, describe, expect, it, vi } from 'vitest';

const register = vi.fn();

vi.mock('@openfin/workspace/notifications', () => ({
  register: (...args: unknown[]) => register(...args),
}));

const { registerNotifications } = await import('./notifications.js');

describe('registerNotifications', () => {
  beforeEach(() => {
    register.mockReset();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('returns the registration meta on success', async () => {
    const meta = { clientId: 'n1' };
    register.mockResolvedValue(meta);
    await expect(registerNotifications()).resolves.toBe(meta);
    expect(register).toHaveBeenCalledTimes(1);
  });

  it('swallows register failures and returns undefined', async () => {
    register.mockRejectedValue(new Error('notifications unavailable'));
    await expect(registerNotifications()).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});
