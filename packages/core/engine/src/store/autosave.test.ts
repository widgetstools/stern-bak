import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startAutoSave } from './autosave';
import type { SerializedState } from '../platform/types';

function makeStore() {
  let listener: (() => void) | null = null;
  return {
    subscribe(fn: () => void) {
      listener = fn;
      return () => { listener = null; };
    },
    notify() {
      listener?.();
    },
  };
}

function makePlatform(snapshot: Record<string, SerializedState> = { m: { v: 1, data: {} } }) {
  return { serializeAll: () => snapshot };
}

describe('startAutoSave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces persist until quiet window elapses', async () => {
    const persist = vi.fn();
    const store = makeStore();
    const handle = startAutoSave({
      platform: makePlatform(),
      store: store as never,
      persist,
      debounceMs: 100,
    });

    store.notify();
    expect(persist).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    expect(persist).toHaveBeenCalledOnce();
    handle.dispose();
  });

  it('coalesces updates during in-flight persist into one follow-up', async () => {
    let resolveFirst: () => void = () => {};
    const persist = vi.fn()
      .mockImplementationOnce(() => new Promise<void>((r) => { resolveFirst = r; }))
      .mockResolvedValue(undefined);

    const store = makeStore();
    const handle = startAutoSave({
      platform: makePlatform(),
      store: store as never,
      persist,
      debounceMs: 10,
    });

    store.notify();
    await vi.advanceTimersByTimeAsync(10);
    expect(persist).toHaveBeenCalledTimes(1);

    store.notify();
    await vi.advanceTimersByTimeAsync(10);
    resolveFirst();
    await Promise.resolve();
    await Promise.resolve();
    expect(persist).toHaveBeenCalledTimes(2);
    handle.dispose();
  });

  it('flushNow cancels debounce and persists immediately', async () => {
    const persist = vi.fn().mockResolvedValue(undefined);
    const store = makeStore();
    const handle = startAutoSave({
      platform: makePlatform(),
      store: store as never,
      persist,
      debounceMs: 500,
    });

    store.notify();
    await handle.flushNow();
    expect(persist).toHaveBeenCalledOnce();
    handle.dispose();
  });

  it('cancelScheduled clears pending debounce without writing', async () => {
    const persist = vi.fn();
    const store = makeStore();
    const handle = startAutoSave({
      platform: makePlatform(),
      store: store as never,
      persist,
      debounceMs: 100,
    });

    store.notify();
    handle.cancelScheduled();
    await vi.advanceTimersByTimeAsync(200);
    expect(persist).not.toHaveBeenCalled();
    handle.dispose();
  });

  it('routes persist errors through onError without rethrowing', async () => {
    const onError = vi.fn();
    const persist = vi.fn().mockRejectedValue(new Error('disk full'));
    const store = makeStore();
    const handle = startAutoSave({
      platform: makePlatform(),
      store: store as never,
      persist,
      debounceMs: 10,
      onError,
    });

    store.notify();
    await vi.advanceTimersByTimeAsync(10);
    await Promise.resolve();
    expect(onError).toHaveBeenCalled();
    handle.dispose();
  });

  it('stops scheduling after dispose', async () => {
    const persist = vi.fn();
    const store = makeStore();
    const handle = startAutoSave({
      platform: makePlatform(),
      store: store as never,
      persist,
      debounceMs: 50,
    });

    handle.dispose();
    store.notify();
    await vi.advanceTimersByTimeAsync(100);
    expect(persist).not.toHaveBeenCalled();
  });
});
