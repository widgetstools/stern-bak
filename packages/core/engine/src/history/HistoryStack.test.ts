/**
 * HistoryStack — framework-free unit tests. Drives the stack
 * imperatively with plain values; no React, no rendering.
 */
import { describe, it, expect } from 'vitest';
import { HistoryStack } from './HistoryStack';

describe('HistoryStack', () => {
  it('starts empty', () => {
    const s = new HistoryStack<number>();
    expect(s.canUndo).toBe(false);
    expect(s.canRedo).toBe(false);
    expect(s.pastSize).toBe(0);
    expect(s.futureSize).toBe(0);
  });

  it('push() records a snapshot + clears the redo future', () => {
    const s = new HistoryStack<number>();
    s.push(0);
    expect(s.canUndo).toBe(true);
    expect(s.canRedo).toBe(false);
    expect(s.pastSize).toBe(1);
  });

  it('undo(current) returns the prior snapshot and pushes current onto future', () => {
    const s = new HistoryStack<number>();
    s.push(0);
    s.push(1);
    const prev = s.undo(2);
    expect(prev).toBe(1);
    expect(s.canUndo).toBe(true);
    expect(s.canRedo).toBe(true);
    expect(s.pastSize).toBe(1);
    expect(s.futureSize).toBe(1);
  });

  it('undo() on empty past returns undefined', () => {
    const s = new HistoryStack<number>();
    expect(s.undo(42)).toBeUndefined();
    expect(s.futureSize).toBe(0); // no ghost push
  });

  it('redo(current) returns the next snapshot and pushes current onto past', () => {
    const s = new HistoryStack<number>();
    s.push(0);
    s.push(1);
    s.undo(2); // past=[0], future=[2]
    const next = s.redo(1);
    expect(next).toBe(2);
    expect(s.canUndo).toBe(true);
    expect(s.canRedo).toBe(false);
    expect(s.pastSize).toBe(2);
    expect(s.futureSize).toBe(0);
  });

  it('redo() on empty future returns undefined', () => {
    const s = new HistoryStack<number>();
    s.push(0);
    expect(s.redo(1)).toBeUndefined();
  });

  it('a new push after undo clears the redo future', () => {
    const s = new HistoryStack<number>();
    s.push(0);
    s.push(1);
    s.undo(2);
    expect(s.canRedo).toBe(true);
    s.push(5);
    expect(s.canRedo).toBe(false);
    expect(s.canUndo).toBe(true);
  });

  it('reset() clears both stacks', () => {
    const s = new HistoryStack<number>();
    s.push(0);
    s.push(1);
    s.undo(2);
    expect(s.canUndo).toBe(true);
    expect(s.canRedo).toBe(true);
    s.reset();
    expect(s.canUndo).toBe(false);
    expect(s.canRedo).toBe(false);
  });

  it('respects the limit by discarding oldest past entries on push', () => {
    const s = new HistoryStack<number>({ limit: 3 });
    for (let i = 0; i < 10; i++) s.push(i);
    // past should hold the 3 most recent (7, 8, 9). Walk back:
    expect(s.undo(10)).toBe(9);
    expect(s.undo(9)).toBe(8);
    expect(s.undo(8)).toBe(7);
    expect(s.canUndo).toBe(false);
  });

  it('respects the limit on the future side via undo/redo cycles', () => {
    const s = new HistoryStack<string>({ limit: 2 });
    s.push('a');
    s.push('b');
    s.push('c');
    // past = [a, b, c]
    s.undo('d'); // past=[a,b], future=[d]
    s.undo('c'); // past=[a],   future=[d,c]
    s.undo('b'); // past=[],    future=[d,c,b] → capped to [c,b]
    expect(s.futureSize).toBe(2);
    expect(s.canUndo).toBe(false);
  });

  it('works with reference-typed snapshots without mutating them', () => {
    interface State { count: number }
    const s = new HistoryStack<State>();
    const a: State = { count: 1 };
    const b: State = { count: 2 };
    s.push(a);
    const prev = s.undo(b);
    expect(prev).toBe(a); // same reference returned, not a clone
    expect(a.count).toBe(1); // not mutated
  });
});
