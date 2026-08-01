import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTickingStore } from './useTickingStore';

describe('useTickingStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts with seeded state and default live/interval', () => {
    const { result } = renderHook(() => useTickingStore());
    expect(result.current.state.instruments.length).toBeGreaterThan(0);
    expect(result.current.live).toBe(true);
    expect(result.current.intervalMs).toBe(1200);
  });

  it('respects initial options', () => {
    const { result } = renderHook(() => useTickingStore({ live: false, intervalMs: 500 }));
    expect(result.current.live).toBe(false);
    expect(result.current.intervalMs).toBe(500);
  });

  it('ticks state on interval when live', () => {
    const { result } = renderHook(() => useTickingStore({ intervalMs: 1000 }));
    const firstMid = result.current.state.quotes[result.current.state.instruments[0].id].mid;
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    const nextMid = result.current.state.quotes[result.current.state.instruments[0].id].mid;
    expect(nextMid).not.toBe(firstMid);
  });

  it('pauses ticking when live is false', () => {
    const { result } = renderHook(() => useTickingStore({ intervalMs: 1000 }));
    act(() => result.current.setLive(false));
    const mid = result.current.state.quotes[result.current.state.instruments[0].id].mid;
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.state.quotes[result.current.state.instruments[0].id].mid).toBe(mid);
  });

  it('updates intervalMs via setter', () => {
    const { result } = renderHook(() => useTickingStore());
    act(() => result.current.setIntervalMs(2000));
    expect(result.current.intervalMs).toBe(2000);
  });
});
