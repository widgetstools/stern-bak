import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPlatformView, closeCurrentWindow } from './platformApi.js';

let originalFin: unknown;

beforeEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  originalFin = (globalThis as any).fin;
});

afterEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).fin = originalFin;
  vi.restoreAllMocks();
});

describe('createPlatformView', () => {
  it('returns false without side effects outside OpenFin', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fin = undefined;
    await expect(createPlatformView({ url: 'http://x/' })).resolves.toBe(false);
  });

  it('creates the view through fin.Platform.getCurrentSync()', async () => {
    const createView = vi.fn(async () => {});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fin = { Platform: { getCurrentSync: () => ({ createView }) } };
    const opts = { url: 'http://x/', customData: { instanceId: 'i1' } };
    await expect(createPlatformView(opts)).resolves.toBe(true);
    expect(createView).toHaveBeenCalledWith(opts);
  });

  it('propagates creation errors', async () => {
    const createView = vi.fn(async () => { throw new Error('no window'); });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fin = { Platform: { getCurrentSync: () => ({ createView }) } };
    await expect(createPlatformView({ url: 'http://x/' })).rejects.toThrow('no window');
  });
});

describe('closeCurrentWindow', () => {
  it('is a noop outside OpenFin', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fin = undefined;
    await expect(closeCurrentWindow()).resolves.toBeUndefined();
  });

  it('closes the current window inside OpenFin', async () => {
    const close = vi.fn(async () => {});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fin = { Window: { getCurrentSync: () => ({ close }) } };
    await closeCurrentWindow();
    expect(close).toHaveBeenCalled();
  });
});
