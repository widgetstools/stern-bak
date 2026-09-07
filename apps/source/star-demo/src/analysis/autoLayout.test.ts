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
  it('pairs blocks that will share a row, then wraps to the next', () => {
    const layout = deriveLayout([block(), block(), block()]);
    // Two across, then wrap — not three full-width bands down one column.
    expect(layout.map((l) => l.x)).toEqual([0, 6, 0]);
    expect(layout[0].y).toBe(layout[1].y);
    expect(layout[2].y).toBeGreaterThan(layout[0].y);
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

/**
 * The intelligence the auto-layout is supposed to carry. Before this, every
 * block took its whole region's width, so a six-block dashboard was six
 * full-width bands down one very tall column, and every rail was three
 * columns wide whether it held a sentence or a twelve-column table.
 */
describe('how much room each block asks for', () => {
  const q = (over: Record<string, unknown>) => ({ query: over }) as Partial<ReportBlock>;

  /** A headline row of figures reads across; halving it puts four numbers in
   *  a corner. Same for a stack of time-aligned tracks. */
  it('gives a headline row and a lane stack the full width', () => {
    const [kpis, lanes] = deriveLayout([
      block({ kind: 'kpis', ...q({}) } as Partial<ReportBlock>),
      block({ kind: 'lanes', ...q({}) } as Partial<ReportBlock>),
    ]);
    expect(kpis.w).toBe(12);
    expect(lanes.w).toBe(12);
    expect(lanes.y).toBeGreaterThan(kpis.y);
  });

  /** Two charts side by side is the shape people read a dashboard in. */
  it('pairs two charts across one row', () => {
    const layout = deriveLayout([
      block({ kind: 'chart', ...q({ groupBy: ['a'], aggregate: [{}] }) } as Partial<ReportBlock>),
      block({ kind: 'chart', ...q({ groupBy: ['b'], aggregate: [{}] }) } as Partial<ReportBlock>),
    ]);
    expect(layout.map((l) => l.w)).toEqual([6, 6]);
    expect(layout[0].y).toBe(layout[1].y);
    expect(layout.map((l) => l.x)).toEqual([0, 6]);
  });

  /**
   * The one that cannot be guessed from the kind. A two-column summary pairs
   * happily; a twelve-column detail table in half the width shows its first
   * three and clips the rest.
   */
  /** Naming nothing is not asking for nothing: a query with no projection
   *  returns the provider's raw rows, every column of them. Counting that as
   *  zero put a full position blotter in half the width. */
  it('treats a raw row dump as the widest case, not the narrowest', () => {
    const [only] = deriveLayout([block({ kind: 'table', ...q({ limit: 500 }) } as Partial<ReportBlock>)]);
    expect(only.w).toBe(12);
  });

  it('sizes a table by its column count, not its kind', () => {
    const narrow = deriveLayout([block({ kind: 'table', ...q({ groupBy: ['desk'], aggregate: [{}] }) } as Partial<ReportBlock>)]);
    const wide = deriveLayout([
      block({ kind: 'table', ...q({ columns: ['a','b','c','d','e','f','g','h','i'] }) } as Partial<ReportBlock>),
    ]);
    expect(narrow[0].w).toBe(6);
    expect(wide[0].w).toBe(12);
  });

  /** A pivot fans out one column per value of its pivot dimension, and the
   *  count is not knowable at layout time — so it is treated as wide. */
  it('treats a pivot as wide on principle', () => {
    const [only] = deriveLayout([block({ kind: 'pivot', ...q({ pivotBy: ['ccy'], aggregate: [{}] }) } as Partial<ReportBlock>)]);
    expect(only.w).toBe(12);
  });

  /** Reading order is the author's; a prettier layout that no longer reads
   *  top-to-bottom is a worse dashboard. */
  it('keeps blocks in the order they were written', () => {
    const layout = deriveLayout([
      block({ kind: 'chart', ...q({ groupBy: ['a'], aggregate: [{}] }) } as Partial<ReportBlock>),
      block({ kind: 'kpis', ...q({}) } as Partial<ReportBlock>),
      block({ kind: 'chart', ...q({ groupBy: ['b'], aggregate: [{}] }) } as Partial<ReportBlock>),
    ]);
    // The full-width KPI row closes the chart's row rather than jumping it.
    expect(layout[1].y).toBeGreaterThan(layout[0].y);
    expect(layout[2].y).toBeGreaterThan(layout[1].y);
  });
});

describe('how wide a rail gets', () => {
  it('stays narrow for prose and stacked figures', () => {
    expect(regionColumns([block({ region: 'left' }), block()]).left.w).toBe(3);
  });

  /** At three columns a table shows its first column and clips every other;
   *  the cure is width, not a smaller font. */
  it('widens for a rail holding a table', () => {
    const cols = regionColumns([block({ region: 'left', kind: 'table', query: {} } as Partial<ReportBlock>), block()]);
    expect(cols.left.w).toBe(4);
    expect(cols.main.x).toBe(4);
  });

  /** A rail is too narrow to split in two, whatever is in it. */
  it('never pairs blocks inside a rail', () => {
    const layout = deriveLayout([block({ region: 'right' }), block({ region: 'right' }), block()]);
    expect(layout[0].w).toBe(layout[1].w);
    expect(layout[1].y).toBeGreaterThan(layout[0].y);
  });
});

/**
 * The regression this pins was visible on screen: with a left rail of prose
 * and a right rail holding a table, both rails took their preferred width and
 * the middle was left five of twelve columns — narrower than the gutters
 * around it, and below the threshold at which two charts will pair, so a
 * six-block dashboard collapsed into one tall stack down the middle.
 */
describe('the middle keeps its share', () => {
  const left = block({ region: 'left' });
  const rightTable = block({ region: 'right', kind: 'table', query: {} } as Partial<ReportBlock>);

  it('never lets two rails squeeze main below half the grid', () => {
    const cols = regionColumns([left, block(), rightTable]);
    expect(cols.main.w).toBeGreaterThanOrEqual(6);
    expect(cols.left.w + cols.main.w + cols.right.w).toBe(12);
  });

  it('still pairs charts in the middle when both rails are open', () => {
    const chart = (k: string) =>
      block({ kind: 'chart', query: { groupBy: [k], aggregate: [{}] } } as Partial<ReportBlock>);
    const layout = deriveLayout([left, chart('a'), chart('b'), rightTable]);
    expect(layout[1].y).toBe(layout[2].y);
    expect(layout[1].x).toBeLessThan(layout[2].x);
  });

  /** A single rail is under the budget, so it keeps the extra width it asked
   *  for — the constraint only bites when both are open. */
  it('leaves a lone table rail at its full width', () => {
    expect(regionColumns([rightTable, block()]).right.w).toBe(4);
  });
});
