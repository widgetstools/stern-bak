import * as React from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SSRM_COUNT_REFRESH_MS,
  SsrmTickProvider,
  useSsrmFilterCounts,
  type SsrmTickSubscribe,
} from './useSsrmFilterCounts';
import type { SavedFilter } from './types';

function pill(id: string, filterModel: Record<string, unknown> = {}): SavedFilter {
  return { id, label: id, active: false, filterModel };
}

/**
 * Advance the polling clock. Fake timers on purpose — the hook's whole job is
 * to space its queries out, so the interval is the thing under test. RTL's
 * `waitFor` can't be used alongside them (it schedules on the same clock).
 */
async function tick(ms = 0): Promise<void> {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}

describe('useSsrmFilterCounts', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('counts each pill against its own filter model', async () => {
    const counter = vi.fn(async (m: Record<string, unknown>) => (m.desk ? 4200 : 7));
    const filters = [pill('a', { desk: { values: ['Govies'] } }), pill('b')];

    const { result } = renderHook(() => useSsrmFilterCounts(filters, counter));
    await tick();

    expect(result.current).toEqual({ a: 4200, b: 7 });
    expect(counter).toHaveBeenCalledWith({ desk: { values: ['Govies'] } });
  });

  it('re-reads on an interval, since the feed is live', async () => {
    let n = 1;
    const counter = vi.fn(async () => n++);

    const { result } = renderHook(() => useSsrmFilterCounts([pill('a')], counter));
    await tick();
    expect(result.current).toEqual({ a: 1 });

    await tick(SSRM_COUNT_REFRESH_MS);
    expect(result.current).toEqual({ a: 2 });
  });

  it('does not stack queries slower than the interval', async () => {
    let release!: (n: number) => void;
    const counter = vi.fn(() => new Promise<number>((res) => { release = res; }));

    renderHook(() => useSsrmFilterCounts([pill('a')], counter));
    await tick(SSRM_COUNT_REFRESH_MS * 3);
    expect(counter).toHaveBeenCalledTimes(1);

    await act(async () => { release(5); });
    await tick(SSRM_COUNT_REFRESH_MS);
    expect(counter).toHaveBeenCalledTimes(2);
  });

  it('keeps the last known count when a query fails', async () => {
    const counter = vi.fn()
      .mockResolvedValueOnce(12)
      .mockRejectedValue(new Error('worker gone'));

    const { result } = renderHook(() => useSsrmFilterCounts([pill('a')], counter));
    await tick();
    expect(result.current).toEqual({ a: 12 });

    await tick(SSRM_COUNT_REFRESH_MS);
    expect(result.current).toEqual({ a: 12 });
  });

  it('stays idle under CSRM and with no pills', async () => {
    const counter = vi.fn(async () => 1);

    const { result: csrm } = renderHook(() => useSsrmFilterCounts([pill('a')], null));
    const { result: empty } = renderHook(() => useSsrmFilterCounts([], counter));
    await tick(SSRM_COUNT_REFRESH_MS * 2);

    expect(csrm.current).toEqual({});
    expect(empty.current).toEqual({});
    expect(counter).not.toHaveBeenCalled();
  });

  it('stops querying once unmounted', async () => {
    const counter = vi.fn(async () => 1);
    const { unmount } = renderHook(() => useSsrmFilterCounts([pill('a')], counter));
    await tick();
    expect(counter).toHaveBeenCalledTimes(1);

    unmount();
    await tick(SSRM_COUNT_REFRESH_MS * 3);
    expect(counter).toHaveBeenCalledTimes(1);
  });

  it('with a tick source, re-reads only after the engine moved — idle costs zero RPCs', async () => {
    let n = 1;
    const counter = vi.fn(async () => n++);
    let fireTick: () => void = () => undefined;
    const subscribe: SsrmTickSubscribe = (handler) => {
      fireTick = handler;
      return () => undefined;
    };
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(SsrmTickProvider, { value: subscribe }, children);

    const { result } = renderHook(() => useSsrmFilterCounts([pill('a')], counter), { wrapper });
    await tick();
    expect(result.current).toEqual({ a: 1 });

    // Idle: intervals elapse, no tick arrived — no RPC.
    await tick(SSRM_COUNT_REFRESH_MS * 3);
    expect(counter).toHaveBeenCalledTimes(1);

    // A tick arms exactly the next interval read.
    act(() => { fireTick(); });
    await tick(SSRM_COUNT_REFRESH_MS);
    expect(result.current).toEqual({ a: 2 });
    await tick(SSRM_COUNT_REFRESH_MS * 2);
    expect(counter).toHaveBeenCalledTimes(2);
  });
});
