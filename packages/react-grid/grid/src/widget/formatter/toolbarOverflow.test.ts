import { describe, expect, it } from 'vitest';
import { computeHiddenSegments, type OverflowSpec } from './toolbarOverflow';

const SPEC: OverflowSpec = {
  order: ['font', 'number', 'align', 'borders', 'column', 'templates'],
  collapseOrder: ['templates', 'column', 'borders', 'align', 'number', 'font'],
};

function widths(map: Record<string, number>): ReadonlyMap<string, number> {
  return new Map(Object.entries(map));
}

const ALL_100 = widths({
  font: 100, number: 100, align: 100, borders: 100, column: 100, templates: 100,
});

describe('computeHiddenSegments', () => {
  it('hides nothing when every segment fits', () => {
    // 6×100 + 5×8 = 640
    const hidden = computeHiddenSegments(SPEC, {
      widths: ALL_100, available: 640, gap: 8, overflowTriggerWidth: 36,
    });
    expect(hidden.size).toBe(0);
  });

  it('collapses in the declared order, accounting for the ⋯ trigger', () => {
    // 640 needed; 600 available. Hiding templates leaves 5×100+4×8=532,
    // + trigger 36 + gap 8 = 576 ≤ 600 → only templates hides.
    const hidden = computeHiddenSegments(SPEC, {
      widths: ALL_100, available: 600, gap: 8, overflowTriggerWidth: 36,
    });
    expect([...hidden]).toEqual(['templates']);
  });

  it('keeps collapsing until the row plus trigger fits', () => {
    // 400 available: hide templates (532+44=576 > 400), column
    // (424+44=468 > 400), borders (316+44=360 ≤ 400) → three hidden.
    const hidden = computeHiddenSegments(SPEC, {
      widths: ALL_100, available: 400, gap: 8, overflowTriggerWidth: 36,
    });
    expect([...hidden]).toEqual(['templates', 'column', 'borders']);
  });

  it('hides every collapsible segment when nothing fits', () => {
    const hidden = computeHiddenSegments(SPEC, {
      widths: ALL_100, available: 10, gap: 8, overflowTriggerWidth: 36,
    });
    expect(hidden.size).toBe(SPEC.collapseOrder.length);
  });

  it('shows everything when the container is unmeasured (jsdom guard)', () => {
    expect(
      computeHiddenSegments(SPEC, {
        widths: ALL_100, available: 0, gap: 8, overflowTriggerWidth: 36,
      }).size,
    ).toBe(0);
    expect(
      computeHiddenSegments(SPEC, {
        widths: ALL_100, available: Number.NaN, gap: 8, overflowTriggerWidth: 36,
      }).size,
    ).toBe(0);
  });

  it('treats never-measured segments as zero width (stay visible)', () => {
    const hidden = computeHiddenSegments(SPEC, {
      widths: widths({ font: 100 }), available: 200, gap: 8, overflowTriggerWidth: 36,
    });
    // font 100 + five zero-width segments + 5 gaps = 140 ≤ 200.
    expect(hidden.size).toBe(0);
  });

  it('only counts ids from `order` toward the row width', () => {
    const hidden = computeHiddenSegments(
      { order: ['a', 'b'], collapseOrder: ['b', 'a'] },
      {
        widths: widths({ a: 50, b: 50, ghost: 5000 }),
        available: 108,
        gap: 8,
        overflowTriggerWidth: 36,
      },
    );
    expect(hidden.size).toBe(0);
  });
});
