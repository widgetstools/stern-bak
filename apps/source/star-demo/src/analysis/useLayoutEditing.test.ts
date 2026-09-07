/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReportSpec } from '@wellsfargo-starui/data';
import { useLayoutEditing, type GridLayoutItem } from './useLayoutEditing';

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

/** What the engine hands back: the rendered layout with one item changed. */
function moved(layout: readonly GridLayoutItem[], i: string, to: Partial<GridLayoutItem>): GridLayoutItem[] {
  return layout.map((l) => (l.i === i ? { ...l, ...to } : l));
}

describe('useLayoutEditing', () => {
  it('starts clean, showing the spec as-is', () => {
    const { result } = renderHook(() => useLayoutEditing(spec('main', 'main')));
    expect(result.current.dirty).toBe(false);
    expect(result.current.pending).toBeNull();
    expect(result.current.blocks).toHaveLength(2);
  });

  it('gives every block a position, whether or not one was ever saved', () => {
    const { result } = renderHook(() => useLayoutEditing(spec('left', 'main', 'right')));
    expect(result.current.layout.map((l) => l.i)).toEqual(['0', '1', '2']);
    expect(result.current.layout.every((l) => l.w > 0 && l.h > 0)).toBe(true);
  });

  /**
   * The bug this pins. react-grid-layout fires `onLayoutChange` on mount, on
   * every re-measure and on each frame of a drag. Treating any of those as an
   * edit lights up the save control on a dashboard nobody touched — and a save
   * prompt that appears on its own teaches people to ignore it.
   */
  it('is not dirtied by the engine echoing back what it was given', () => {
    const { result } = renderHook(() => useLayoutEditing(spec('main', 'main')));
    act(() => result.current.applyLayout(result.current.layout));
    expect(result.current.dirty).toBe(false);
    expect(result.current.pending).toBeNull();
  });

  it('records a block dragged somewhere new', () => {
    const { result } = renderHook(() => useLayoutEditing(spec('main', 'main')));
    act(() => result.current.applyLayout(moved(result.current.layout, '1', { x: 6, y: 0 })));
    expect(result.current.dirty).toBe(true);
    expect(result.current.blocks[1].layout).toMatchObject({ x: 6, y: 0 });
    // The block that did not move keeps whatever it had.
    expect(result.current.blocks[0].layout?.x).toBe(0);
  });

  it('records a resize the same way a move is recorded', () => {
    const { result } = renderHook(() => useLayoutEditing(spec('main', 'main')));
    act(() => result.current.applyLayout(moved(result.current.layout, '0', { w: 4, h: 14 })));
    expect(result.current.blocks[0].layout).toMatchObject({ w: 4, h: 14 });
    expect(result.current.dirty).toBe(true);
  });

  /**
   * A layout change is a PROPOSAL. Dragging a card by accident must not
   * silently rewrite a dashboard other people open.
   */
  it('never writes on its own — the change is only ever pending', () => {
    const { result } = renderHook(() => useLayoutEditing(spec('main', 'main')));
    act(() => result.current.applyLayout(moved(result.current.layout, '1', { y: 20 })));
    expect(result.current.pending).toHaveLength(2);
    act(() => result.current.reset());
    expect(result.current.dirty).toBe(false);
    expect(result.current.blocks[1].layout).toBeUndefined();
  });

  it('stops being dirty once the change is committed, keeping the arrangement', () => {
    const { result } = renderHook(() => useLayoutEditing(spec('main', 'main')));
    act(() => result.current.applyLayout(moved(result.current.layout, '1', { x: 8 })));
    expect(result.current.dirty).toBe(true);
    act(() => result.current.commit());
    expect(result.current.dirty).toBe(false);
    expect(result.current.blocks[1].layout).toMatchObject({ x: 8 });
  });

  /** Live data re-renders the canvas constantly; none of it is an edit, and
   *  none of it may discard work someone has not saved yet. */
  it('holds an unsaved arrangement across re-renders', () => {
    const { result, rerender } = renderHook(() => useLayoutEditing(spec('main', 'main')));
    act(() => result.current.applyLayout(moved(result.current.layout, '0', { h: 12 })));
    rerender();
    rerender();
    expect(result.current.dirty).toBe(true);
    expect(result.current.blocks[0].layout).toMatchObject({ h: 12 });
  });

  it('copes with no spec at all', () => {
    const { result } = renderHook(() => useLayoutEditing(null));
    expect(result.current.blocks).toEqual([]);
    expect(result.current.layout).toEqual([]);
    expect(result.current.dirty).toBe(false);
  });
});
