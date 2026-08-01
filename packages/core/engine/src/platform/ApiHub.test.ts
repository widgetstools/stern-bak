import { describe, expect, it, vi } from 'vitest';
import { ApiHub } from './ApiHub';

function makeFakeApi() {
  const listeners = new Map<string, Set<(e?: unknown) => void>>();
  return {
    api: {
      addEventListener: (evt: string, fn: (e?: unknown) => void) => {
        const set = listeners.get(evt) ?? new Set();
        set.add(fn);
        listeners.set(evt, set);
      },
      removeEventListener: (evt: string, fn: (e?: unknown) => void) => {
        listeners.get(evt)?.delete(fn);
      },
      isDestroyed: () => false,
    },
    fire: (evt: string, payload?: unknown) => {
      for (const fn of [...(listeners.get(evt) ?? [])]) fn(payload);
    },
  } as const;
}

describe('ApiHub', () => {
  it('whenReady resolves immediately when api is already attached', async () => {
    const hub = new ApiHub();
    const { api } = makeFakeApi();
    hub.attach(api);
    await expect(hub.whenReady()).resolves.toBe(api);
  });

  it('whenReady resolves after attach when called early', async () => {
    const hub = new ApiHub();
    const { api } = makeFakeApi();
    const pending = hub.whenReady();
    hub.attach(api);
    await expect(pending).resolves.toBe(api);
  });

  it('onReady fires immediately for late subscribers and supports unsubscribe', () => {
    const hub = new ApiHub();
    const { api } = makeFakeApi();
    hub.attach(api);
    const fn = vi.fn();
    const off = hub.onReady(fn);
    expect(fn).toHaveBeenCalledWith(api);
    off();
    hub.onReady(vi.fn());
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('on attaches listeners and detach tears them down', () => {
    const hub = new ApiHub();
    const { api, fire } = makeFakeApi();
    hub.attach(api);
    const handler = vi.fn();
    const off = hub.on('sortChanged', handler);
    fire('sortChanged', { source: 'test' });
    expect(handler).toHaveBeenCalledWith({ source: 'test' });
    off();
    hub.detach();
    fire('sortChanged');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('use returns fallback when api is missing or callback throws', () => {
    const hub = new ApiHub();
    expect(hub.use(() => 42, 0)).toBe(0);
    const { api } = makeFakeApi();
    hub.attach(api);
    expect(
      hub.use(() => {
        throw new Error('boom');
      }, 'fallback'),
    ).toBe('fallback');
  });
});
