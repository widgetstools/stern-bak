import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  acquireBackgroundFreezeExemption,
  isBackgroundFreezeExemptionHeld,
  FREEZE_EXEMPTION_LOCK_NAME,
  _resetBackgroundFreezeExemptionForTests,
} from './freezeExemptionLock.js';

type LockGrant = (cb: () => Promise<void>) => Promise<void>;

function installLocksMock(impl: (name: string, cb: () => Promise<void>) => Promise<void>) {
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: { request: vi.fn(impl) },
  });
  return navigator.locks.request as ReturnType<typeof vi.fn>;
}

describe('acquireBackgroundFreezeExemption', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    _resetBackgroundFreezeExemptionForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (navigator as any).locks;
  });

  it('latches held only when the grant callback actually runs', async () => {
    let grant!: LockGrant;
    const request = installLocksMock((name, cb) => {
      expect(name).toBe(FREEZE_EXEMPTION_LOCK_NAME);
      return new Promise<void>((resolve) => {
        grant = async (innerCb) => { void innerCb(); resolve(); };
        void cb; // grant later
        grant(cb as unknown as () => Promise<void>);
      });
    });

    acquireBackgroundFreezeExemption();
    await vi.advanceTimersByTimeAsync(0);
    expect(request).toHaveBeenCalledTimes(1);
    expect(isBackgroundFreezeExemptionHeld()).toBe(true);
  });

  it('retries after a rejected request until granted (boot-time not-fully-active)', async () => {
    let calls = 0;
    const request = installLocksMock((name, cb) => {
      calls += 1;
      if (calls < 3) return Promise.reject(new Error('document not fully active'));
      void cb();
      return new Promise<void>(() => {}); // grant held forever
    });

    acquireBackgroundFreezeExemption();
    await vi.advanceTimersByTimeAsync(0);
    expect(isBackgroundFreezeExemptionHeld()).toBe(false);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(isBackgroundFreezeExemptionHeld()).toBe(false);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(request).toHaveBeenCalledTimes(3);
    expect(isBackgroundFreezeExemptionHeld()).toBe(true);
    // No further retries once granted.
    await vi.advanceTimersByTimeAsync(10_000);
    expect(request).toHaveBeenCalledTimes(3);
  });

  it('is a no-op without the Web Locks API and never throws', () => {
    expect(() => acquireBackgroundFreezeExemption()).not.toThrow();
    expect(isBackgroundFreezeExemptionHeld()).toBe(false);
  });

  it('is idempotent — one acquisition chain per document', async () => {
    const request = installLocksMock((_n, cb) => { void cb(); return new Promise<void>(() => {}); });
    acquireBackgroundFreezeExemption();
    acquireBackgroundFreezeExemption();
    acquireBackgroundFreezeExemption();
    await vi.advanceTimersByTimeAsync(0);
    expect(request).toHaveBeenCalledTimes(1);
  });
});
