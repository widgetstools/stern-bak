import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createOpenFinViewProfileSource } from './openfinViewProfile';

describe('createOpenFinViewProfileSource', () => {
  const originalFin = globalThis.fin;

  afterEach(() => {
    if (originalFin === undefined) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (globalThis as any).fin;
    } else {
      globalThis.fin = originalFin;
    }
  });

  it('returns null when fin.me is unavailable', () => {
    expect(createOpenFinViewProfileSource()).toBeNull();
  });

  it('reads activeProfileId from view customData', async () => {
    const getOptions = vi.fn(async () => ({ customData: { activeProfileId: 'profile-a' } }));
    globalThis.fin = { me: { getOptions, updateOptions: vi.fn() } } as typeof globalThis.fin;

    const source = createOpenFinViewProfileSource();
    expect(await source!.read()).toBe('profile-a');
  });

  it('swallows read errors and returns null', async () => {
    globalThis.fin = {
      me: {
        getOptions: vi.fn(async () => { throw new Error('boom'); }),
        updateOptions: vi.fn(),
      },
    } as typeof globalThis.fin;

    expect(await createOpenFinViewProfileSource()!.read()).toBeNull();
  });

  it('writes activeProfileId and skips no-op updates', async () => {
    const updateOptions = vi.fn(async () => {});
    const getOptions = vi.fn(async () => ({ customData: { activeProfileId: 'same' } }));
    globalThis.fin = { me: { getOptions, updateOptions } } as typeof globalThis.fin;

    await createOpenFinViewProfileSource()!.write('same');
    expect(updateOptions).not.toHaveBeenCalled();

    getOptions.mockResolvedValue({ customData: { foo: 1 } });
    await createOpenFinViewProfileSource()!.write('next');
    expect(updateOptions).toHaveBeenCalledWith({
      customData: { foo: 1, activeProfileId: 'next' },
    });
  });

  it('swallows write errors', async () => {
    globalThis.fin = {
      me: {
        getOptions: vi.fn(async () => ({ customData: {} })),
        updateOptions: vi.fn(async () => { throw new Error('write failed'); }),
      },
    } as typeof globalThis.fin;

    await expect(createOpenFinViewProfileSource()!.write('x')).resolves.toBeUndefined();
  });
});
