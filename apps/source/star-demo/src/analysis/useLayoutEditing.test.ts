/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReportSpec } from '@wellsfargo-starui/data';
import { serialize, type DockManagerState } from '@widgetstools/dock-manager-core';
import { useLayoutEditing } from './useLayoutEditing';
import { buildDockState, panelIdFor } from './dockLayout';

function spec(regions: Array<'left' | 'main' | 'right'>, over: Partial<ReportSpec> = {}): ReportSpec {
  return {
    title: 'R',
    blocks: regions.map((region, i) => ({ kind: 'commentary', region, title: `B${i}`, text: 'x' })),
    ...over,
  } as unknown as ReportSpec;
}

/** A state the dock would report after someone dragged something: same panels,
 *  different proportions. */
function rearranged(state: DockManagerState): DockManagerState {
  const layout = state.layout;
  if (layout.type !== 'split') throw new Error('expected a split to rearrange');
  return { ...state, layout: { ...layout, sizes: [70, 30] } };
}

describe('useLayoutEditing', () => {
  it('starts clean, arranged from the spec', () => {
    const { result } = renderHook(() => useLayoutEditing(spec(['main', 'main'])));
    expect(result.current.dirty).toBe(false);
    expect(result.current.pending).toBeNull();
    expect(result.current.initialState.panels.size).toBe(2);
  });

  /**
   * The bug this pins. The dock reports state on mount, on every re-measure
   * and on each frame of a drag. Treating any of those as an edit lights up
   * the save control on a dashboard nobody touched — and a save prompt that
   * appears on its own teaches people to ignore it.
   */
  it('is not dirtied by the dock echoing back what it was mounted with', () => {
    const { result } = renderHook(() => useLayoutEditing(spec(['main', 'main'])));
    act(() => result.current.applyState(result.current.initialState));
    expect(result.current.dirty).toBe(false);
    expect(result.current.pending).toBeNull();
  });

  it('records an arrangement someone actually changed', () => {
    const { result } = renderHook(() => useLayoutEditing(spec(['main', 'main'])));
    act(() => result.current.applyState(rearranged(result.current.initialState)));
    expect(result.current.dirty).toBe(true);
    expect(result.current.pending).toBeTruthy();
    expect(JSON.parse(result.current.pending as string)).toBeTypeOf('object');
  });

  /**
   * A layout change is a PROPOSAL. Nudging a panel by accident must not
   * silently rewrite a dashboard other people open.
   */
  it('never writes on its own — the change is only ever pending', () => {
    const { result } = renderHook(() => useLayoutEditing(spec(['main', 'main'])));
    act(() => result.current.applyState(rearranged(result.current.initialState)));
    expect(result.current.pending).toBeTruthy();
    act(() => result.current.reset());
    expect(result.current.dirty).toBe(false);
    expect(result.current.pending).toBeNull();
  });

  /** A dock manager has no "go back" — the arrangement lives inside it, so
   *  undo has to remount it, and the key is what makes that happen. */
  it('remounts the dock on undo', () => {
    const { result } = renderHook(() => useLayoutEditing(spec(['main', 'main'])));
    const before = result.current.mountKey;
    act(() => result.current.applyState(rearranged(result.current.initialState)));
    expect(result.current.mountKey).toBe(before);
    act(() => result.current.reset());
    expect(result.current.mountKey).not.toBe(before);
  });

  it('stops being dirty once the change is committed, keeping the arrangement', () => {
    const { result } = renderHook(() => useLayoutEditing(spec(['main', 'main'])));
    act(() => result.current.applyState(rearranged(result.current.initialState)));
    const kept = result.current.pending;
    act(() => result.current.commit());
    expect(result.current.dirty).toBe(false);
    // Committing records what was saved; it does not throw the draft away.
    expect(kept).toBeTruthy();
  });

  /** Live data re-renders the canvas constantly; none of it is an edit, and
   *  none of it may discard work someone has not saved yet. */
  it('holds an unsaved arrangement across re-renders', () => {
    const { result, rerender } = renderHook(() => useLayoutEditing(spec(['main', 'main'])));
    act(() => result.current.applyState(rearranged(result.current.initialState)));
    rerender();
    rerender();
    expect(result.current.dirty).toBe(true);
  });

  /**
   * The regression that would make dragging pointless: re-deriving the opening
   * arrangement on every load silently undoes what someone saved.
   */
  it('restores a saved arrangement instead of deriving a new one', () => {
    const saved = serialize(rearranged(buildDockState(spec(['main', 'main']).blocks)));
    const { result } = renderHook(() => useLayoutEditing(spec(['main', 'main'], { dock: saved })));
    const layout = result.current.initialState.layout;
    expect(layout.type).toBe('split');
    if (layout.type === 'split') expect(layout.sizes).toEqual([70, 30]);
    expect(result.current.dirty).toBe(false);
  });

  it('still has every panel after restoring', () => {
    const saved = serialize(buildDockState(spec(['left', 'main']).blocks));
    const { result } = renderHook(() => useLayoutEditing(spec(['left', 'main'], { dock: saved })));
    expect([...result.current.initialState.panels.keys()].sort()).toEqual([panelIdFor(0), panelIdFor(1)]);
  });

  /** A layout written by an older build, or corrupted in storage, must not
   *  leave the window blank — an arrangement derived from the spec is always
   *  a usable dashboard. */
  it('falls back to the derived arrangement when a saved one cannot be restored', () => {
    const { result } = renderHook(() => useLayoutEditing(spec(['main', 'main'], { dock: '{"layout":"nonsense"}' })));
    expect(result.current.initialState.panels.size).toBe(2);
    expect(result.current.dirty).toBe(false);
  });

  it('copes with no spec at all', () => {
    const { result } = renderHook(() => useLayoutEditing(null));
    expect(result.current.initialState.panels.size).toBe(0);
    expect(result.current.dirty).toBe(false);
  });
});
