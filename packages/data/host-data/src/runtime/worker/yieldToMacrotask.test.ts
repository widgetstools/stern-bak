import { yieldToMacrotask } from './yieldToMacrotask';

/**
 * Two paths, and the fallback is the one that matters: a DedicatedWorker in
 * some hosts has no `MessageChannel`, and a replay pass that never yields
 * there would run the whole cache in one macrotask. Both are exercised, plus
 * the channel reuse — the module keeps ONE channel and a queue, so a second
 * call must not build a second channel (each one is an open port pair).
 */
describe('yieldToMacrotask', () => {
  const realMessageChannel = globalThis.MessageChannel;

  afterEach(() => {
    globalThis.MessageChannel = realMessageChannel;
    vi.useRealTimers();
  });

  it('runs the callback on a later macrotask, not synchronously', async () => {
    const order: string[] = [];
    await new Promise<void>((resolve) => {
      yieldToMacrotask(() => {
        order.push('callback');
        resolve();
      });
      order.push('after-call');
    });
    expect(order).toEqual(['after-call', 'callback']);
  });

  it('keeps callbacks in FIFO order across several hops', async () => {
    const seen: number[] = [];
    await new Promise<void>((resolve) => {
      for (const n of [1, 2, 3]) {
        yieldToMacrotask(() => {
          seen.push(n);
          if (seen.length === 3) resolve();
        });
      }
    });
    expect(seen).toEqual([1, 2, 3]);
  });

  it('falls back to setTimeout where MessageChannel is unavailable', () => {
    vi.useFakeTimers();
    // @ts-expect-error — modelling a worker host that ships no MessageChannel.
    delete globalThis.MessageChannel;
    const cb = vi.fn();

    yieldToMacrotask(cb);
    expect(cb).not.toHaveBeenCalled();

    vi.advanceTimersByTime(0);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('reuses one MessageChannel rather than opening a port pair per call', async () => {
    const constructed = vi.fn();
    class CountingChannel extends realMessageChannel {
      constructor() {
        super();
        constructed();
      }
    }
    // The module memoises its channel on first use, so this only counts
    // constructions made after the swap — which is the point: after a
    // channel exists, further calls must not make another.
    globalThis.MessageChannel = CountingChannel as unknown as typeof MessageChannel;

    await new Promise<void>((resolve) => { yieldToMacrotask(resolve); });
    const afterFirst = constructed.mock.calls.length;
    await new Promise<void>((resolve) => { yieldToMacrotask(resolve); });

    expect(constructed.mock.calls.length).toBe(afterFirst);
  });
});
