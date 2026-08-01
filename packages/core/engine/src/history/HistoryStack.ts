/**
 * HistoryStack — framework-agnostic undo/redo over snapshots of any `T`.
 *
 * Plain class, no React, no store coupling. Hosts the past/future stacks
 * and exposes imperative methods:
 *
 *   - `push(snapshot)` — record the snapshot on the past stack and clear
 *     the redo future (a new action branches the timeline).
 *   - `undo()` — pop past → push current onto future → return the prior
 *     snapshot, or `undefined` if past is empty.
 *   - `redo()` — mirror of `undo()`.
 *   - `reset()` — clear both stacks.
 *
 * Caller responsibility: know what the "current" snapshot is. `undo()` +
 * `redo()` take the current snapshot as an argument so the stack stays
 * oblivious to how state is stored (React state, Zustand, Redux, plain
 * refs — all work equally).
 *
 * Typical usage pattern (React):
 *
 *   const stackRef = useRef(new HistoryStack<T>());
 *   const handler = () => { stackRef.current.push(current); dispatch(next); };
 *   const undo = () => { const prev = stackRef.current.undo(current); if (prev !== undefined) dispatch(prev); };
 *
 * The `useUndoRedo` hook next to this file wraps exactly that shape.
 *
 * Capacity: bounded by `limit` (default 50). Oldest entries roll off
 * when the stack exceeds the cap so memory stays predictable under a
 * long editing session.
 */

export interface HistoryStackOptions {
  /** Maximum number of entries per stack (past AND future independently).
   *  Default 50. Older entries are discarded once this cap is reached. */
  limit?: number;
}

export class HistoryStack<T> {
  private past: T[] = [];
  private future: T[] = [];
  private readonly limit: number;

  constructor(options: HistoryStackOptions = {}) {
    this.limit = options.limit ?? 50;
  }

  /** Push `snapshot` onto the past stack and clear the future. Call
   *  BEFORE dispatching a mutation so the snapshot captures the state
   *  prior to the change. */
  push(snapshot: T): void {
    this.past.push(snapshot);
    if (this.past.length > this.limit) {
      this.past = this.past.slice(this.past.length - this.limit);
    }
    this.future = [];
  }

  /** Pop the most recent past snapshot. Caller passes the CURRENT state
   *  so it can be pushed onto the future stack before returning the
   *  previous one. Returns `undefined` when past is empty. */
  undo(current: T): T | undefined {
    if (this.past.length === 0) return undefined;
    const previous = this.past[this.past.length - 1];
    this.past = this.past.slice(0, -1);
    this.future.push(current);
    if (this.future.length > this.limit) {
      this.future = this.future.slice(this.future.length - this.limit);
    }
    return previous;
  }

  /** Pop the most recent future snapshot. Caller passes the CURRENT
   *  state so it can be pushed onto the past stack before returning the
   *  next one. Returns `undefined` when future is empty. */
  redo(current: T): T | undefined {
    if (this.future.length === 0) return undefined;
    const next = this.future[this.future.length - 1];
    this.future = this.future.slice(0, -1);
    this.past.push(current);
    if (this.past.length > this.limit) {
      this.past = this.past.slice(this.past.length - this.limit);
    }
    return next;
  }

  /** Clear both stacks. Does not touch the "current" state — callers
   *  that want to revert state too must do so separately. */
  reset(): void {
    this.past = [];
    this.future = [];
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  /** Read-only snapshot counts — useful for debugging + UI badges
   *  ("42 steps back"). */
  get pastSize(): number {
    return this.past.length;
  }

  get futureSize(): number {
    return this.future.length;
  }
}
