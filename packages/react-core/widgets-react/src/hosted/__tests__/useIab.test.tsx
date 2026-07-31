/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, act } from '@testing-library/react';
import { useIab } from '../useIab.js';

interface FakeIab {
  subscribe: ReturnType<typeof vi.fn>;
  unsubscribe: ReturnType<typeof vi.fn>;
  publish: ReturnType<typeof vi.fn>;
}

function installFin(): FakeIab {
  const iab: FakeIab = {
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    publish: vi.fn().mockResolvedValue(undefined),
  };
  (globalThis as any).fin = { InterApplicationBus: iab };
  return iab;
}

afterEach(() => {
  cleanup();
  delete (globalThis as any).fin;
  vi.restoreAllMocks();
});

describe('useIab — OpenFin runtime', () => {
  let iab: FakeIab;

  beforeEach(() => {
    iab = installFin();
  });

  it('subscribe forwards args to fin.InterApplicationBus.subscribe', () => {
    const { result } = renderHook(() => useIab());
    const handler = vi.fn();
    act(() => {
      result.current.subscribe({ uuid: '*' }, 'topic-a', handler);
    });
    expect(iab.subscribe).toHaveBeenCalledTimes(1);
    const [sender, topic, wrapped] = iab.subscribe.mock.calls[0]!;
    expect(sender).toEqual({ uuid: '*' });
    expect(topic).toBe('topic-a');
    // Wrapped handler dispatches to user handler.
    wrapped({ k: 1 }, { uuid: 'src', name: 'view-1' });
    expect(handler).toHaveBeenCalledWith({ k: 1 }, { uuid: 'src', name: 'view-1' });
  });

  it('explicit unsubscribe call detaches and is idempotent', () => {
    const { result } = renderHook(() => useIab());
    let detach: () => void = () => {};
    act(() => {
      detach = result.current.subscribe({ uuid: '*' }, 'topic-b', () => {});
    });
    detach();
    detach();
    expect(iab.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('unmount detaches every still-active subscription', () => {
    const { result, unmount } = renderHook(() => useIab());
    act(() => {
      result.current.subscribe({ uuid: '*' }, 't1', () => {});
      result.current.subscribe({ uuid: 'app-x' }, 't2', () => {});
    });
    expect(iab.unsubscribe).not.toHaveBeenCalled();
    unmount();
    expect(iab.unsubscribe).toHaveBeenCalledTimes(2);
  });

  it('publish forwards args to fin.InterApplicationBus.publish', async () => {
    const { result } = renderHook(() => useIab());
    await act(async () => {
      await result.current.publish('topic-c', { hello: 'world' });
    });
    expect(iab.publish).toHaveBeenCalledWith('topic-c', { hello: 'world' });
  });

  it('subscribe and publish identities are stable across renders', () => {
    const { result, rerender } = renderHook(() => useIab());
    const sub1 = result.current.subscribe;
    const pub1 = result.current.publish;
    rerender();
    expect(result.current.subscribe).toBe(sub1);
    expect(result.current.publish).toBe(pub1);
  });

  it('subscribe failures do not throw', () => {
    iab.subscribe.mockImplementation(() => {
      throw new Error('boom');
    });
    const { result } = renderHook(() => useIab());
    expect(() => {
      act(() => {
        result.current.subscribe({ uuid: '*' }, 't', () => {});
      });
    }).not.toThrow();
  });
});

describe('useIab — non-OpenFin runtime', () => {
  it('subscribe returns a noop cleanup and does not throw', () => {
    const { result } = renderHook(() => useIab());
    let detach: () => void = () => {};
    act(() => {
      detach = result.current.subscribe({ uuid: '*' }, 't', () => {});
    });
    expect(() => detach()).not.toThrow();
  });

  it('publish resolves immediately', async () => {
    const { result } = renderHook(() => useIab());
    await expect(result.current.publish('t', {})).resolves.toBeUndefined();
  });
});
