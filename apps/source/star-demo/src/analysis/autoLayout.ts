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

/** The column band each region occupies, given which rails are in use. */
export function regionColumns(blocks: readonly ReportBlock[]): Record<string, { x: number; w: number }> {
  const has = (region: string) => blocks.some((b) => (b.region ?? 'main') === region);
  const left = has('left') ? RAIL_COLUMNS : 0;
  const right = has('right') ? RAIL_COLUMNS : 0;
  return {
    left: { x: 0, w: RAIL_COLUMNS },
    main: { x: left, w: Math.max(1, REPORT_GRID_COLUMNS - left - right) },
    right: { x: REPORT_GRID_COLUMNS - RAIL_COLUMNS, w: RAIL_COLUMNS },
  };
}

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
  const nextRow: Record<string, number> = { left: 0, main: 0, right: 0 };

  return blocks.map((block, index) => {
    const i = String(index);
    if (block.layout) {
      // Keep the region's cursor below a hand-placed block, so the blocks
      // still being auto-placed do not open underneath it.
      const region = block.region ?? 'main';
      nextRow[region] = Math.max(nextRow[region] ?? 0, block.layout.y + block.layout.h);
      return { ...block.layout, i };
    }
    const region = (block.region ?? 'main') in columns ? (block.region ?? 'main') : 'main';
    const { x, w } = columns[region];
    const h = defaultRows(block);
    const y = nextRow[region];
    nextRow[region] = y + h;
    return { i, x, y, w, h };
  });
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
