/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { createRafCoalescedCallback } from './coalesceGridEvent.js';

describe('createRafCoalescedCallback', () => {
  it('invokes at most once per animation frame', () => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    const fn = vi.fn();
    const { schedule } = createRafCoalescedCallback(fn);
    schedule();
    schedule();
    schedule();
    expect(fn).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('cancel prevents a scheduled callback', () => {
    let pending: FrameRequestCallback | null = null;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      pending = cb;
      return 42;
    });
    const fn = vi.fn();
    const { schedule, cancel } = createRafCoalescedCallback(fn);
    schedule();
    expect(fn).not.toHaveBeenCalled();
    cancel();
    pending?.(0);
    expect(fn).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
