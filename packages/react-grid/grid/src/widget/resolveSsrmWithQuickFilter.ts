import type { MarketsGridSsrmProps } from './types.js';

/**
 * When SSRM mode is active, wire toolbar quick filter into datasource/ticks
 * unless the caller already supplied `getQuickFilterText`.
 */
export function resolveSsrmWithQuickFilter(
  ssrm: MarketsGridSsrmProps | undefined,
  readQuickFilterText: () => string,
): MarketsGridSsrmProps | undefined {
  if (!ssrm?.provider) return ssrm;
  if (ssrm.getQuickFilterText) return ssrm;
  return { ...ssrm, getQuickFilterText: readQuickFilterText };
}
