/**
 * Where a block sits before anyone has dragged it.
 *
 * A dashboard is composed in a semantic vocabulary — "this is context, put it
 * on the left"; "this is the headline" — because that is what a model can
 * author well and what a person can read back. A layout engine wants numbers.
 * This is the one-way translation between them.
 *
 * One-way is the whole point. Coordinates are derived only for blocks that
 * have none; a block carrying a saved `layout` keeps it untouched. Re-deriving
 * would silently undo every arrangement on the next load, which is the failure
 * mode that makes draggable dashboards feel broken.
 *
 * The grid is 12 columns. Rails take three each when they hold anything, and
 * the main region takes whatever is left — so a main-only report is twelve
 * columns wide rather than six with two empty gutters.
 */
import {
  REPORT_GRID_COLUMNS,
  MIN_BLOCK_ROWS,
  MAX_BLOCK_ROWS,
  type BlockLayout,
  type ReportBlock,
} from '@wellsfargo-starui/data';

/** One row unit, in px. Small enough that heights land where they are dropped. */
export const ROW_HEIGHT = 30;
/** Gap between blocks, in px, horizontally and vertically. */
export const GRID_MARGIN: [number, number] = [16, 16];

const RAIL_COLUMNS = 3;

/**
 * Opening height per kind, in row units.
 *
 * A chart given a commentary's height is a slot, not a chart — the axis labels
 * alone eat it. These are the heights each block reads well at, and they are a
 * starting point: the first drag overrides them for good.
 */
const DEFAULT_ROWS: Record<string, number> = {
  kpis: 4,
  commentary: 4,
  chart: 9,
  lanes: 8,
  table: 10,
  pivot: 10,
};

/** Grid rows ⇄ pixels. `n` rows span the rows plus the margins between them. */
export function rowsToPx(rows: number): number {
  return rows * ROW_HEIGHT + (rows - 1) * GRID_MARGIN[1];
}

export function pxToRows(px: number): number {
  const rows = Math.round((px + GRID_MARGIN[1]) / (ROW_HEIGHT + GRID_MARGIN[1]));
  return Math.max(MIN_BLOCK_ROWS, Math.min(MAX_BLOCK_ROWS, rows));
}

function defaultRows(block: ReportBlock): number {
  // A height set by the OLD px-based resize is honoured, so a dashboard
  // arranged before the grid existed opens at the sizes it was left at.
  const px = (block as { height?: number }).height;
  if (typeof px === 'number' && Number.isFinite(px)) return pxToRows(px);
  return DEFAULT_ROWS[block.kind] ?? 6;
}

/**
 * How many columns a block would LIKE, as a fraction of the width available.
 *
 * A dashboard that gives every block the full width is a single tall column of
 * bands, and one that halves everything squeezes a headline row into a corner.
 * What each block actually needs is different, and knowable:
 *
 *  - **KPIs and lanes read across.** A headline row of figures, or a stack of
 *    time-aligned tracks, both want the full width and very little height.
 *  - **Charts pair.** Two charts side by side is the shape people read a
 *    dashboard in; one chart alone across twelve columns is mostly whitespace.
 *  - **Tables are sized by their COLUMNS.** This is the one that cannot be
 *    guessed from the kind — a two-column summary pairs happily, and a
 *    twelve-column detail table put in half the width shows its first three
 *    and clips the rest.
 */
function estimatedColumns(block: ReportBlock): number {
  const q = (block as { query?: Record<string, unknown> }).query;
  if (!q) return 0;
  const listed = (q.columns as string[] | undefined)?.length;
  if (listed) return listed;
  const groupBy = (q.groupBy as string[] | undefined)?.length ?? 0;
  const pivotBy = (q.pivotBy as string[] | undefined)?.length ?? 0;
  const aggs = (q.aggregate as unknown[] | undefined)?.length ?? 0;
  // A pivot fans out one column per value of its pivot dimension; the count is
  // not knowable here, so it is treated as wide on principle.
  if (pivotBy > 0) return WIDE_COLUMN_COUNT;
  // Naming nothing is not asking for nothing — a query with no projection at
  // all returns the provider's raw rows, every column of them, which is the
  // widest case there is. Counting that as zero put a full position blotter
  // in half the width.
  if (groupBy + aggs === 0) return WIDE_COLUMN_COUNT;
  return groupBy + aggs;
}

/** Past this many columns a table needs the whole width to be readable. */
const WIDE_COLUMN_COUNT = 7;

/** Whether a block wants all of its region's width, or will share a row. */
function wantsFullWidth(block: ReportBlock): boolean {
  if (block.kind === 'kpis' || block.kind === 'lanes') return true;
  if (block.kind === 'table' || block.kind === 'pivot') {
    return estimatedColumns(block) >= WIDE_COLUMN_COUNT;
  }
  return false;
}

/**
 * The column band each region occupies.
 *
 * A rail is 3 columns of prose or stacked figures, and 4 when it holds a
 * table — at 3 columns a table shows its first column and clips every other,
 * and the cure for that is width, not a smaller font.
 */
export function regionColumns(blocks: readonly ReportBlock[]): Record<string, { x: number; w: number }> {
  const inRegion = (region: string) => blocks.filter((b) => (b.region ?? 'main') === region);
  const railWidth = (region: string): number => {
    const entries = inRegion(region);
    if (entries.length === 0) return 0;
    return entries.some((b) => b.kind === 'table' || b.kind === 'pivot')
      ? RAIL_COLUMNS_WIDE
      : RAIL_COLUMNS;
  };
  let left = railWidth('left');
  let right = railWidth('right');

  // The main region is the main region. Two rails at their preferred widths
  // left it five of twelve columns — narrower than the gutters it sat between,
  // and too narrow to put two charts side by side, so a dashboard with both
  // rails open became a single tall stack down the middle. Rails give width
  // back, widest first, until the middle has at least half the grid.
  const railBudget = REPORT_GRID_COLUMNS - MAIN_MIN_COLUMNS;
  while (left + right > railBudget) {
    if (left >= right && left > RAIL_COLUMNS) left -= 1;
    else if (right > RAIL_COLUMNS) right -= 1;
    else break;
  }

  return {
    left: { x: 0, w: left || RAIL_COLUMNS },
    main: { x: left, w: Math.max(1, REPORT_GRID_COLUMNS - left - right) },
    right: { x: REPORT_GRID_COLUMNS - (right || RAIL_COLUMNS), w: right || RAIL_COLUMNS },
  };
}

/** The middle keeps at least half the grid, whatever the rails would like. */
const MAIN_MIN_COLUMNS = 6;

/**
 * Packs a region's blocks into rows, pairing the ones that will share.
 *
 * Greedy and order-preserving: blocks stay in the order the author wrote them,
 * and a block that wants the full width closes whatever row is open. That
 * keeps the reading order intact — a dashboard rearranged into a prettier
 * layout that no longer reads top-to-bottom is a worse dashboard.
 */
function packRegion(
  entries: ReadonlyArray<{ block: ReportBlock; index: number }>,
  band: { x: number; w: number },
  startRow: number,
): Array<BlockLayout & { i: string }> {
  const out: Array<BlockLayout & { i: string }> = [];
  let y = startRow;
  let cursor = 0; // columns used in the row being filled
  let rowHeight = 0;

  const closeRow = () => {
    if (cursor === 0) return;
    y += rowHeight;
    cursor = 0;
    rowHeight = 0;
  };

  for (const { block, index } of entries) {
    const h = defaultRows(block);
    // A rail is too narrow to share; only the main region pairs.
    const full = wantsFullWidth(block) || band.w < PAIRABLE_MIN_COLUMNS;
    const want = full ? band.w : Math.floor(band.w / 2);

    if (full || cursor + want > band.w) closeRow();

    out.push({ i: String(index), x: band.x + cursor, y, w: want, h });
    cursor += want;
    rowHeight = Math.max(rowHeight, h);
    // A full-width block, or one that exactly filled the row, ends it.
    if (cursor >= band.w) closeRow();
  }
  return out;
}

/** Narrower than this and two blocks side by side are both unreadable. */
const PAIRABLE_MIN_COLUMNS = 6;
const RAIL_COLUMNS_WIDE = 4;

/**
 * A grid position for every block, in spec order.
 *
 * Blocks that already carry one keep it verbatim. The rest stack down their
 * region's column, each starting below whatever the region has already used —
 * which is exactly the arrangement the previous three-rail renderer produced,
 * so an existing dashboard opens looking the way it always has.
 */
export function deriveLayout(blocks: readonly ReportBlock[]): Array<BlockLayout & { i: string }> {
  const columns = regionColumns(blocks);
  const placed = new Map<string, BlockLayout & { i: string }>();

  // Hand-placed blocks are kept verbatim and take their region's cursor with
  // them, so the blocks still being auto-placed do not open underneath one.
  const startRow: Record<string, number> = { left: 0, main: 0, right: 0 };
  const toPack: Record<string, Array<{ block: ReportBlock; index: number }>> = {
    left: [],
    main: [],
    right: [],
  };

  blocks.forEach((block, index) => {
    const named = block.region ?? 'main';
    const region = named in columns ? named : 'main';
    if (block.layout) {
      placed.set(String(index), { ...block.layout, i: String(index) });
      startRow[region] = Math.max(startRow[region], block.layout.y + block.layout.h);
      return;
    }
    toPack[region].push({ block, index });
  });

  for (const region of ['left', 'main', 'right'] as const) {
    for (const item of packRegion(toPack[region], columns[region], startRow[region])) {
      placed.set(item.i, item);
    }
  }

  // Returned in spec order, which is the order the caller's children are in.
  return blocks.map((_, index) => placed.get(String(index)) as BlockLayout & { i: string });
}

/**
 * Fold a layout the engine handed back onto the blocks it came from.
 *
 * RGL addresses items by the string key we gave them — the block's index — so
 * an item naming anything else is from a stale render and is ignored rather
 * than written somewhere arbitrary.
 */
export function applyLayoutToBlocks(
  blocks: readonly ReportBlock[],
  layout: ReadonlyArray<{ i: string; x: number; y: number; w: number; h: number }>,
): ReportBlock[] {
  const byIndex = new Map(layout.map((l) => [l.i, l]));
  return blocks.map((block, index) => {
    const l = byIndex.get(String(index));
    if (!l) return block;
    return { ...block, layout: { x: l.x, y: l.y, w: l.w, h: l.h } } as ReportBlock;
  });
}

/** Layout only, so a ticking number never reads as "someone moved something". */
export function layoutSignature(
  layout: ReadonlyArray<{ i: string; x: number; y: number; w: number; h: number }>,
): string {
  return [...layout]
    .sort((a, b) => a.i.localeCompare(b.i))
    .map((l) => `${l.i}:${l.x},${l.y},${l.w},${l.h}`)
    .join('|');
}
