import { describe, expect, it } from 'vitest';
import { SsrmSessionWindows } from './SsrmSessionWindows.js';
import type { SsrmGetRowsRequest, SsrmTickPayload } from '../ssrm/ssrmTypes.js';

const flat: SsrmGetRowsRequest = { startRow: 0, endRow: 200, sortModel: [], filterModel: {}, rowGroupCols: [], groupKeys: [], valueCols: [] } as never;
const grouped: SsrmGetRowsRequest = { ...flat, rowGroupCols: [{ id: 'desk', field: 'desk' }] } as never;
const tick = (upserts: string[], removals: string[] = []): SsrmTickPayload => ({
  kind: 'rowDelta',
  upserts: upserts.map((id) => ({ id, px: 1 })),
  removals,
});
const keysOf = (t: SsrmTickPayload) => (t.upserts ?? []).map((r) => String(r.id));

describe('SsrmSessionWindows — per-session tick trimming', () => {
  it('leaves a session that never read a block on full ticks', () => {
    const w = new SsrmSessionWindows();
    const t = tick(['a', 'b']);
    expect(w.trim('s1', t, keysOf(t))).toBe(t);
    expect(w.isTrimmed('s1')).toBe(false);
  });

  it('after a flat block read, trims upserts and removals to loaded keys and counts the rest', () => {
    const w = new SsrmSessionWindows();
    w.noteBlock('s1', flat, ['a', 'b', null]);
    expect(w.isTrimmed('s1')).toBe(true);
    const t = tick(['a', 'x', 'y'], ['b', 'z']);
    const out = w.trim('s1', t, keysOf(t))!;
    expect(out.upserts).toEqual([{ id: 'a', px: 1 }]);
    expect(out.removals).toEqual(['b']);
    expect(out.unloaded).toEqual({ upserts: 2, removals: 1 });
    // The removed key is forgotten: a later upsert of it is unloaded now.
    const t2 = tick(['b']);
    expect(w.trim('s1', t2, keysOf(t2))).toEqual({ kind: 'rowDelta', upserts: [], removals: [], unloaded: { upserts: 1, removals: 0 } });
  });

  it('says nothing when a tick touches neither loaded nor unloaded rows', () => {
    const w = new SsrmSessionWindows();
    w.noteBlock('s1', flat, ['a']);
    const empty: SsrmTickPayload = { kind: 'rowDelta', upserts: [], removals: [] };
    expect(w.trim('s1', empty, [])).toBeNull();
  });

  it('passes resets, group deltas and view deltas through untouched', () => {
    const w = new SsrmSessionWindows();
    w.noteBlock('s1', flat, ['a']);
    const reset: SsrmTickPayload = { kind: 'rowDelta', reset: true, upserts: [{ id: 'q' }] };
    expect(w.trim('s1', reset, ['q'])).toBe(reset);
    const group: SsrmTickPayload = { kind: 'groupDelta', groups: [{ k: 1 }] };
    expect(w.trim('s1', group, [])).toBe(group);
    const view: SsrmTickPayload = { kind: 'viewDelta', ruleId: 'r', entered: ['a'] };
    expect(w.trim('s1', view, [])).toBe(view);
  });

  it('a grouped read switches the session to full ticks; a flat read switches it back', () => {
    const w = new SsrmSessionWindows();
    w.noteBlock('s1', flat, ['a']);
    w.noteBlock('s1', grouped, [null, null]);
    expect(w.isTrimmed('s1')).toBe(false);
    const t = tick(['zz']);
    expect(w.trim('s1', t, keysOf(t))).toBe(t);
    w.noteBlock('s1', flat, ['a']);
    expect(w.isTrimmed('s1')).toBe(true);
    expect(w.trim('s1', t, keysOf(t))!.unloaded).toEqual({ upserts: 1, removals: 0 });
  });

  it('never guesses evictions: past the key cap the session stays on full ticks', () => {
    const w = new SsrmSessionWindows(2);
    w.noteBlock('s1', flat, ['a', 'b']);
    expect(w.isTrimmed('s1')).toBe(true);
    w.noteBlock('s1', flat, ['c']);
    expect(w.isTrimmed('s1')).toBe(false);
    w.noteBlock('s1', flat, ['a']);
    expect(w.isTrimmed('s1')).toBe(false);
    const t = tick(['zz']);
    expect(w.trim('s1', t, keysOf(t))).toBe(t);
  });

  it('drop forgets the session', () => {
    const w = new SsrmSessionWindows();
    w.noteBlock('s1', flat, ['a']);
    w.drop('s1');
    const t = tick(['zz']);
    expect(w.trim('s1', t, keysOf(t))).toBe(t);
  });

  it('keeps sessions apart', () => {
    const w = new SsrmSessionWindows();
    w.noteBlock('s1', flat, ['a']);
    w.noteBlock('s2', flat, ['b']);
    const t = tick(['a', 'b']);
    expect(w.trim('s1', t, keysOf(t))!.upserts).toEqual([{ id: 'a', px: 1 }]);
    expect(w.trim('s2', t, keysOf(t))!.upserts).toEqual([{ id: 'b', px: 1 }]);
  });
});
