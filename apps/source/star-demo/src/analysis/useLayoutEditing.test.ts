/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReportSpec } from '@wellsfargo-starui/data';
import { useLayoutEditing, clampHeight, MIN_BLOCK_HEIGHT, MAX_BLOCK_HEIGHT } from './useLayoutEditing';

function spec(...regions: Array<'left' | 'main' | 'right'>): ReportSpec {
  return {
    title: 'R',
    blocks: regions.map((region, i) => ({
      kind: 'table',
      region,
      title: `B${i}`,
      query: {},
    })),
  } as unknown as ReportSpec;
}

describe('clampHeight', () => {
  it('keeps a block tall enough to show something', () => {
    expect(clampHeight(10)).toBe(MIN_BLOCK_HEIGHT);
  });

  /** Taller than any screen pushes the rest of the dashboard out of view. */
  it('keeps a block short enough not to swallow the page', () => {
    expect(clampHeight(5000)).toBe(MAX_BLOCK_HEIGHT);
  });

  it('rounds to whole pixels', () => {
    expect(clampHeight(240.6)).toBe(241);
  });
});

describe('useLayoutEditing', () => {
  it('starts clean, showing the spec as-is', () => {
    const { result } = renderHook(() => useLayoutEditing(spec('main', 'main')));
    expect(result.current.dirty).toBe(false);
    expect(result.current.pending).toBeNull();
    expect(result.current.blocks).toHaveLength(2);
  });

  it('reorders within a region', () => {
    const { result } = renderHook(() => useLayoutEditing(spec('main', 'main', 'main')));
    act(() => result.current.move(2, 0));
    expect(result.current.blocks.map((b) => b.title)).toEqual(['B2', 'B0', 'B1']);
    expect(result.current.dirty).toBe(true);
  });

  /** Dropping a card into a different rail is one gesture, not two. */
  it('changes region and position together', () => {
    const { result } = renderHook(() => useLayoutEditing(spec('main', 'right')));
    act(() => result.current.move(0, 1, 'right'));
    expect(result.current.blocks[1]).toMatchObject({ title: 'B0', region: 'right' });
  });

  it('leaves the region alone when the drop lands in the same one', () => {
    const { result } = renderHook(() => useLayoutEditing(spec('main', 'main')));
    act(() => result.current.move(0, 1, 'main'));
    expect(result.current.blocks[1].region).toBe('main');
  });

  it('resizes one block, clamped', () => {
    const { result } = renderHook(() => useLayoutEditing(spec('main', 'main')));
    act(() => result.current.resize(1, 5000));
    expect((result.current.blocks[1] as { height?: number }).height).toBe(MAX_BLOCK_HEIGHT);
    expect((result.current.blocks[0] as { height?: number }).height).toBeUndefined();
  });

  it('ignores an out-of-range index rather than corrupting the layout', () => {
    const { result } = renderHook(() => useLayoutEditing(spec('main')));
    act(() => result.current.move(9, 0));
    act(() => result.current.resize(-1, 300));
    expect(result.current.dirty).toBe(false);
  });

  /**
   * A layout change is a PROPOSAL. Dragging a card by accident must not
   * silently rewrite a dashboard other people open.
   */
  it('never writes on its own — the change is only ever pending', () => {
    const { result } = renderHook(() => useLayoutEditing(spec('main', 'main')));
    act(() => result.current.move(1, 0));
    expect(result.current.pending).toHaveLength(2);
    act(() => result.current.reset());
    expect(result.current.dirty).toBe(false);
    expect(result.current.blocks.map((b) => b.title)).toEqual(['B0', 'B1']);
  });

  it('stops being dirty once the change is committed', () => {
    const { result } = renderHook(() => useLayoutEditing(spec('main', 'main')));
    act(() => result.current.move(1, 0));
    expect(result.current.dirty).toBe(true);
    act(() => result.current.commit());
    expect(result.current.dirty).toBe(false);
    // The arrangement stays; only the "unsaved" state clears.
    expect(result.current.blocks.map((b) => b.title)).toEqual(['B1', 'B0']);
  });

  it('copes with no spec at all', () => {
    const { result } = renderHook(() => useLayoutEditing(null));
    expect(result.current.blocks).toEqual([]);
    expect(result.current.dirty).toBe(false);
  });
});
