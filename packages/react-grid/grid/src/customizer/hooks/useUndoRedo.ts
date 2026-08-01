/**
 * useUndoRedo — React wrapper around the framework-agnostic
 * `HistoryStack` class. Callers get `{ canUndo, canRedo, undo, redo,
 * reset, push }` handlers that close over the stack + dispatcher.
 *
 * Action model: callers `push(currentState)` BEFORE dispatching a
 * mutation, then call their reducer / setter. `undo()` pops the prior
 * snapshot and calls `dispatch(prev)` to restore it. `redo()` replays
 * a previously-undone snapshot forward.
 *
 * Why explicit push instead of auto-capture via effect:
 *   - Modules bootstrap state in stages (undefined → initial → first
 *     write). An auto-capturing effect would record each transition,
 *     bloating history with non-user snapshots (one click = N undos).
 *   - Batched renders can re-fire an effect in surprising ways.
 *   - Explicit push guarantees one history entry per user action.
 *
 * The underlying stack lives in a `useRef`, so hook re-renders don't
 * rebuild it. Only `canUndo` / `canRedo` flow through `useState` (via a
 * version counter) so the UI re-renders when availability flips.
 */

import { useCallback, useRef, useState } from 'react';
import { HistoryStack, type HistoryStackOptions } from '@wellsfargo-starui/core';

export interface UseUndoRedoResult {
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  reset: () => void;
  /** Push the current state onto the past stack and clear the redo
   *  future. Call BEFORE dispatching a mutation. */
  push: () => void;
}

export function useUndoRedo<T>(
  current: T,
  dispatch: (next: T) => void,
  options?: HistoryStackOptions,
): UseUndoRedoResult {
  // Stack lives for the hook's lifetime. useRef so identity is stable
  // across renders.
  const stackRef = useRef<HistoryStack<T>>(null as unknown as HistoryStack<T>);
  if (stackRef.current === null) {
    stackRef.current = new HistoryStack<T>(options);
  }

  // `current` captured in a ref so callbacks stay stable across renders
  // — the handlers always read the latest value without needing to be
  // recreated.
  const currentRef = useRef<T>(current);
  currentRef.current = current;

  // Version bump on stack-shape changes so canUndo / canRedo flip in
  // React. The stack is mutable; React won't notice changes without
  // a state signal.
  const [, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const push = useCallback(() => {
    stackRef.current.push(currentRef.current);
    bump();
  }, [bump]);

  const undo = useCallback(() => {
    const previous = stackRef.current.undo(currentRef.current);
    if (previous !== undefined) dispatch(previous);
    bump();
  }, [dispatch, bump]);

  const redo = useCallback(() => {
    const next = stackRef.current.redo(currentRef.current);
    if (next !== undefined) dispatch(next);
    bump();
  }, [dispatch, bump]);

  const reset = useCallback(() => {
    stackRef.current.reset();
    bump();
  }, [bump]);

  return {
    canUndo: stackRef.current.canUndo,
    canRedo: stackRef.current.canRedo,
    undo,
    redo,
    reset,
    push,
  };
}
