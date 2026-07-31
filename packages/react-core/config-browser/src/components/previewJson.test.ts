import { describe, expect, it } from 'vitest';
import { previewJson } from './DataGrid';

describe('previewJson — budgeted cell preview', () => {
  it('matches JSON.stringify for values that fit the budget', () => {
    const v = { a: 1, b: 'two', c: [true, null] };
    expect(previewJson(v, 200)).toBe(JSON.stringify(v));
  });

  it('truncates with an ellipsis once the budget is hit', () => {
    const v = { key: 'x'.repeat(500) };
    const out = previewJson(v, 80);
    expect(out.length).toBeLessThanOrEqual(81 + 8); // budget + slack for the last pushed token
    expect(out.endsWith('…')).toBe(true);
    expect(out.startsWith('{"key":"xxx')).toBe(true);
  });

  it('never walks the whole object — deep/wide structures cost O(budget)', () => {
    // Instrument property ACCESS rather than wall-clock time: a timing
    // assertion is inherently flaky (it failed at 53ms against a 50ms
    // bound under parallel CI load, where most of the elapsed time was
    // building the fixture, not running the function).
    //
    // 50k getters, each of which would be read by a full JSON.stringify.
    // A budget-bounded walk must touch only a handful before it fills.
    let reads = 0;
    const wide: Record<string, unknown> = {};
    for (let i = 0; i < 50_000; i++) {
      Object.defineProperty(wide, `k${i}`, {
        enumerable: true,
        get() {
          reads += 1;
          return { nested: 'v'.repeat(50) };
        },
      });
    }

    const out = previewJson(wide, 80);

    expect(out.endsWith('…')).toBe(true);
    // Each visited entry contributes ~60 chars, so an 80-char budget can
    // only afford a couple. Bound generously but far below 50k.
    expect(reads).toBeLessThan(20);
    // Sanity: a full stringify really would read every one of them.
    const before = reads;
    JSON.stringify(wide);
    expect(reads - before).toBe(50_000);
  });

  it('handles primitives, null, and undefined members', () => {
    expect(previewJson(null, 80)).toBe('null');
    expect(previewJson([1, 'a', false, null, undefined], 80)).toBe('[1,"a",false,null,null]');
  });
});
