/**
 * Push a quick-filter term to a grid and make it take effect.
 *
 * `setGridOption('quickFilterText', …)` is the whole operation under the
 * client-side row model: AG-Grid re-runs its filter pass over rows it already
 * holds. Under the server-side row model it is half of one — the term travels
 * with the next `getRows` request, but AG-Grid does not re-issue those on a
 * quick-filter change alone, so already-loaded blocks keep showing rows the
 * term excludes until something else purges them.
 *
 * Four call sites set that option, and only ONE of them purged: the toolbar's
 * own debounced push. Profile restore, profile reset, and the replay that runs
 * when the grid api arrives after the user has already typed all set the text
 * and stopped — so a restored search term rendered as a filled-in box over
 * unfiltered rows (roadmap T2-5).
 *
 * The row-model branch lives HERE rather than at those call sites, three of
 * which are inside `customizer/modules/**` where binding constraint 3 forbids
 * a module asking which row model it is running under. A module calling one
 * named operation is not branching; it is asking for the term to be applied.
 * This is deliberately NOT a `platform.data` port method — the port models
 * reading and writing DATA, and this is query invalidation on the grid.
 */
import type { GridApi } from 'ag-grid-community';

/**
 * Returns `true` when the term reached the grid. Never throws: every caller
 * is a restore / replay path where a grid mid-teardown is normal.
 */
export function applyQuickFilterText(
  api: GridApi | null | undefined,
  text: string,
): boolean {
  if (!api) return false;
  try {
    api.setGridOption('quickFilterText', text);
  } catch {
    return false;
  }
  try {
    if (api.getGridOption('rowModelType') === 'serverSide') {
      api.refreshServerSide?.({ purge: true });
    }
  } catch {
    /* the option landed; a grid torn down between the two calls is not an
       error worth reporting to a restore path */
  }
  return true;
}
