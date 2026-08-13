/**
 * SSRM loading-row renderer that renders NOTHING.
 *
 * AG Grid's default (`agLoadingCellRenderer`) paints a spinner plus
 * "Loading..." in the first column of every block still in flight — under a
 * fast scrollbar-thumb drag that is a wall of flicker. Trading UIs show
 * blank rows until data lands; the windowed worker plane answers blocks in
 * single-digit ms, so the blank state is fleeting.
 */
export function BlankLoadingCellRenderer(): null {
  return null;
}
