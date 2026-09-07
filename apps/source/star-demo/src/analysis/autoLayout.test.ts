import { describe, expect, it } from 'vitest';
import type { ReportBlock } from '@wellsfargo-starui/data';
import {
  applyLayoutToBlocks,
  deriveLayout,
  layoutSignature,
  pxToRows,
  regionColumns,
  rowsToPx,
  ROW_HEIGHT,
} from './autoLayout';

const block = (over: Partial<ReportBlock> = {}): ReportBlock =>
  ({ kind: 'commentary', text: 'x', ...over }) as ReportBlock;

describe('the columns each region occupies', () => {
  /** A main-only report should be full width, not six columns with two empty
   *  gutters where rails would have been. */
  it('gives main the whole grid when there are no rails', () => {
    expect(regionColumns([block()]).main).toEqual({ x: 0, w: 12 });
  });

  it('opens a rail only for a region that holds something', () => {
    const withLeft = regionColumns([block({ region: 'left' }), block()]);
    expect(withLeft.main).toEqual({ x: 3, w: 9 });

    const both = regionColumns([block({ region: 'left' }), block(), block({ region: 'right' })]);
    expect(both.left).toEqual({ x: 0, w: 3 });
    expect(both.main).toEqual({ x: 3, w: 6 });
    expect(both.right).toEqual({ x: 9, w: 3 });
  });
});

describe('placing blocks that have never been arranged', () => {
  it('stacks each region down its own column', () => {
    const layout = deriveLayout([block(), block(), block()]);
    expect(layout.map((l) => l.x)).toEqual([0, 0, 0]);
    // Each one starts below the last, with no overlap.
    expect(layout[1].y).toBe(layout[0].y + layout[0].h);
    expect(layout[2].y).toBe(layout[1].y + layout[1].h);
  });

  it('starts every region at the top, independently of the others', () => {
    const layout = deriveLayout([block({ region: 'left' }), block(), block({ region: 'right' })]);
    expect(layout.map((l) => l.y)).toEqual([0, 0, 0]);
  });

  /** A chart given a commentary's height is a slot, not a chart — the axis
   *  labels alone eat it. */
  it('opens a chart taller than a line of prose', () => {
    const [chart, prose] = deriveLayout([
      block({ kind: 'chart', query: {} } as Partial<ReportBlock>),
      block(),
    ]);
    expect(chart.h).toBeGreaterThan(prose.h);
  });

  it('keys each item by its block index, which is how the layout is folded back', () => {
    expect(deriveLayout([block(), block()]).map((l) => l.i)).toEqual(['0', '1']);
  });
});

/**
 * The regression that would make dragging pointless: re-deriving a saved
 * position on every load silently undoes every arrangement.
 */
describe('a position someone actually chose', () => {
  it('is kept verbatim, never re-derived', () => {
    const arranged = { x: 7, y: 3, w: 5, h: 11 };
    const [only] = deriveLayout([block({ layout: arranged })]);
    expect(only).toMatchObject(arranged);
  });

  it('does not let auto-placed blocks open underneath it', () => {
    const layout = deriveLayout([block({ layout: { x: 0, y: 0, w: 12, h: 9 } }), block()]);
    expect(layout[1].y).toBeGreaterThanOrEqual(9);
  });

  /** Mixed is the normal state after one drag: one block placed, the rest not. */
  it('places the rest around it rather than refusing to mix', () => {
    const layout = deriveLayout([block(), block({ layout: { x: 4, y: 0, w: 4, h: 5 } }), block()]);
    expect(layout[1]).toMatchObject({ x: 4, w: 4 });
    expect(layout[0].h).toBeGreaterThan(0);
    expect(layout[2].y).toBeGreaterThan(0);
  });
});

describe('an old px height', () => {
  /** Dashboards arranged before the grid existed carry a px height. They must
   *  open at the size they were left at, not snap back to a default. */
  it('opens at the height it was left at', () => {
    const tall = deriveLayout([block({ height: 600 } as Partial<ReportBlock>)])[0];
    const plain = deriveLayout([block()])[0];
    expect(tall.h).toBeGreaterThan(plain.h);
    expect(rowsToPx(tall.h)).toBeGreaterThan(500);
    expect(rowsToPx(tall.h)).toBeLessThan(700);
  });

  it('round-trips through the grid without drifting', () => {
    for (const px of [200, 320, 480, 640]) {
      expect(Math.abs(rowsToPx(pxToRows(px)) - px)).toBeLessThanOrEqual(ROW_HEIGHT);
    }
  });

  it('clamps a height that would hide the block or swallow the page', () => {
    expect(pxToRows(10)).toBe(3);
    expect(pxToRows(50_000)).toBe(40);
  });
});

describe('folding the engine’s layout back onto the blocks', () => {
  it('writes each position onto the block it belongs to', () => {
    const blocks = [block({ title: 'A' }), block({ title: 'B' })];
    const next = applyLayoutToBlocks(blocks, [
      { i: '0', x: 0, y: 0, w: 6, h: 4 },
      { i: '1', x: 6, y: 0, w: 6, h: 4 },
    ]);
    expect(next[0]).toMatchObject({ title: 'A', layout: { x: 0, y: 0, w: 6, h: 4 } });
    expect(next[1]).toMatchObject({ title: 'B', layout: { x: 6, y: 0, w: 6, h: 4 } });
  });

  /** An item naming a block that no longer exists is from a stale render, and
   *  must not be written somewhere arbitrary. */
  it('ignores an item that addresses no block', () => {
    const next = applyLayoutToBlocks([block()], [{ i: '7', x: 1, y: 1, w: 1, h: 3 }]);
    expect(next[0].layout).toBeUndefined();
  });

  it('leaves a block the layout does not mention alone', () => {
    const next = applyLayoutToBlocks([block(), block()], [{ i: '0', x: 2, y: 0, w: 4, h: 5 }]);
    expect(next[0].layout).toMatchObject({ x: 2 });
    expect(next[1].layout).toBeUndefined();
  });
});

describe('the change signature', () => {
  it('is stable regardless of the order items arrive in', () => {
    const a = [{ i: '0', x: 0, y: 0, w: 6, h: 4 }, { i: '1', x: 6, y: 0, w: 6, h: 4 }];
    expect(layoutSignature(a)).toBe(layoutSignature([...a].reverse()));
  });

  it('changes when anything about a position changes', () => {
    const base = [{ i: '0', x: 0, y: 0, w: 6, h: 4 }];
    for (const change of [{ x: 1 }, { y: 1 }, { w: 7 }, { h: 5 }]) {
      expect(layoutSignature([{ ...base[0], ...change }])).not.toBe(layoutSignature(base));
    }
  });
});
