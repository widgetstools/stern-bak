import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useUndoRedo } from './useUndoRedo.js';

describe('useUndoRedo', () => {
  it('tracks undo/redo availability across push, undo, redo, reset', () => {
    let state = 1;
    const dispatch = vi.fn((next: number) => {
      state = next;
    });

    const { result, rerender } = renderHook(
      ({ current }) => useUndoRedo(current, dispatch),
      { initialProps: { current: state } },
    );

    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);

    act(() => {
      result.current.push();
      state = 2;
    });
    rerender({ current: state });
    expect(result.current.canUndo).toBe(true);

    act(() => {
      result.current.undo();
    });
    rerender({ current: state });
    expect(dispatch).toHaveBeenCalledWith(1);
    expect(result.current.canRedo).toBe(true);

    act(() => {
      result.current.redo();
    });
    rerender({ current: state });
    expect(dispatch).toHaveBeenCalledWith(2);

    act(() => {
      result.current.reset();
    });
    rerender({ current: state });
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it('no-ops undo/redo when stack is empty', () => {
    const dispatch = vi.fn();
    const { result } = renderHook(() => useUndoRedo(0, dispatch));
    act(() => {
      result.current.undo();
      result.current.redo();
    });
    expect(dispatch).not.toHaveBeenCalled();
  });
});
