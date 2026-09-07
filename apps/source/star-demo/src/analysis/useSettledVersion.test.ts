/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSettledVersion } from './useSettledVersion';

/**
 * This is the whole of the drag-performance fix, so it is worth pinning
 * precisely. Measured on a five-block live dashboard at 6x CPU throttle:
 * 58 of 144 frames dropped before, 4 of 157 after, with the query engine
 * falling from ~22% of the gesture to under 1%.
 */
describe('holding the numbers still during a gesture', () => {
  const render = (version: number, frozen: boolean) =>
    renderHook(({ v, f }) => useSettledVersion(v, f), { initialProps: { v: version, f: frozen } });

  it('passes the version straight through when nothing is being dragged', () => {
    const { result, rerender } = render(1, false);
    expect(result.current).toBe(1);
    rerender({ v: 2, f: false });
    expect(result.current).toBe(2);
  });

  /** The point of the whole exercise: ticks arriving mid-drag must not
   *  re-run every block's query. */
  it('ignores every tick that arrives while the layout is being moved', () => {
    const { result, rerender } = render(5, false);
    rerender({ v: 5, f: true });
    for (const v of [6, 7, 8, 9]) {
      rerender({ v, f: true });
      expect(result.current).toBe(5);
    }
  });

  /**
   * And it must catch up to what is CURRENT when the gesture ends, not replay
   * the value it was frozen at — a report that stays stale after a drag would
   * be a worse bug than the one being fixed.
   */
  it('jumps to the latest version the moment the gesture ends', () => {
    const { result, rerender } = render(5, false);
    rerender({ v: 5, f: true });
    rerender({ v: 9, f: true });
    expect(result.current).toBe(5);
    rerender({ v: 9, f: false });
    expect(result.current).toBe(9);
  });

  it('freezes again for the next gesture, from wherever it now is', () => {
    const { result, rerender } = render(1, false);
    rerender({ v: 4, f: false });
    rerender({ v: 4, f: true });
    rerender({ v: 12, f: true });
    expect(result.current).toBe(4);
    rerender({ v: 12, f: false });
    expect(result.current).toBe(12);
  });

  /** A static report has no ticks at all; freezing must be a no-op there. */
  it('changes nothing when the version never moves', () => {
    const { result, rerender } = render(0, false);
    rerender({ v: 0, f: true });
    expect(result.current).toBe(0);
    rerender({ v: 0, f: false });
    expect(result.current).toBe(0);
  });
});
