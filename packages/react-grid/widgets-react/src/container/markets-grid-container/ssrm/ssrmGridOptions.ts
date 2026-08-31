import type { GridOptions } from 'ag-grid-community';
import type { PerspectiveSsrmDatasource } from './datasource.js';
import { INDEX_COLUMN } from './schema.js';
import { CHILD_COUNT_FIELD, ROW_ID_FIELD } from './rows.js';

export type SsrmGridOptionsConfig = {
  /**
   * Rows per block. Bigger blocks mean fewer block boundaries to cross, and
   * crossing one is what puts a gap on screen; each costs proportionally more
   * to serialise, but that is paid once per boundary instead of twice.
   */
  blockSize?: number;
  /**
   * Not a network debounce, whatever AG Grid's name suggests: how long
   * scrolling has to settle before a *new* block is requested at all — what
   * collapses a fling into one request for the block the user lands on. It
   * only delays an ordinary scroll when a new block is needed.
   */
  blockLoadDebounceMs?: number;
  /**
   * Blocks kept in memory. High enough to hold a whole blotter, so a block
   * loaded once is never fetched again; off-screen rows stop being patched by
   * the live-update path but are patched again within a tick of coming back.
   */
  maxBlocksInCache?: number;
};

/**
 * The grid options that make AG Grid talk to the Perspective datasource, kept
 * together because several of them only make sense as a set. Spread onto the
 * grid surface LAST, so they win over the module pipeline's client-side-row-
 * model defaults at mount (`rowModelType` and `getRowId` are initial-only).
 */
export function createSsrmGridOptions(
  datasource: PerspectiveSsrmDatasource,
  config: SsrmGridOptionsConfig = {},
): Partial<GridOptions> {
  return {
    rowModelType: 'serverSide',
    serverSideDatasource: datasource,
    /*
     * Stable ids are what let the grid keep selection, expansion and cell
     * flashing across a refresh. Group rows carry an id the datasource stamps
     * on them; leaf rows are identified by the table's index column — which is
     * `composeRowId` over the provider's key column(s), i.e. byte-for-byte the
     * id the client-side row model would have used.
     */
    getRowId: ({ data }) =>
      ((data as Record<string, unknown>)[ROW_ID_FIELD] as string | undefined) ??
      String((data as Record<string, unknown>)[INDEX_COLUMN]),
    /*
     * The "(N)" beside a group name. The grid cannot count a group itself when
     * it holds only a block of it, so the engine counts and this reports.
     * Returning 0 is how AG Grid is told to show nothing.
     */
    getChildCount: (data) =>
      ((data as Record<string, unknown> | undefined)?.[CHILD_COUNT_FIELD] as number | undefined) ?? 0,
    /*
     * Pivot result columns are named by the server. Perspective joins a split
     * key to its value column with `|`, so the grid has to split on the same
     * character to recover the pivot keys.
     */
    serverSidePivotResultFieldSeparator: '|',
    cacheBlockSize: config.blockSize ?? 200,
    maxBlocksInCache: config.maxBlocksInCache ?? 100,
    blockLoadDebounceMillis: config.blockLoadDebounceMs ?? 40,
    maxConcurrentDatasourceRequests: 2,
    /*
     * A block that is still loading otherwise replaces its rows with one
     * full-width "loading" row, so every load swaps the entire row layout out
     * and back. Keeping the cells in place, each showing a quiet placeholder,
     * makes an arriving block read as filling in rather than as flickering.
     */
    suppressServerSideFullWidthLoadingRow: true,
    serverSideInitialRowCount: 1,
    /*
     * Sorting is applied by Perspective at every level, so a sort on any column
     * has to reload the groups rather than reorder what is already loaded.
     */
    serverSideSortAllLevels: true,
    serverSideEnableClientSideSort: false,
    // Keep expanded children in memory: reopening a group is then instant, and
    // the live-update path can patch those rows in place.
    purgeClosedRowNodes: false,
  };
}
