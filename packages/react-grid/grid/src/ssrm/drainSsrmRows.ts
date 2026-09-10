import type { ISsrmDataProvider } from '@wellsfargo-starui/data';
import type { SsrmGetRowsRequest } from '@wellsfargo-starui/data/runtime';
import type { GridApi } from 'ag-grid-community';

/** Refuse an unbounded pull that would OOM the tab. */
export const SSRM_EXPORT_MAX_ROWS = 250_000;

const CHUNK = 5_000;

export class SsrmExportTooLargeError extends Error {
  readonly rowCount: number;

  constructor(rowCount: number) {
    super(
      `SSRM export refused: ${rowCount} filtered rows exceeds ${SSRM_EXPORT_MAX_ROWS}. Narrow the filter or export a selection.`,
    );
    this.name = 'SsrmExportTooLargeError';
    this.rowCount = rowCount;
  }
}

/** Flat filtered/sorted request — no grouping, so the file is the book. */
export function ssrmExportRequestFromApi(api: GridApi): SsrmGetRowsRequest {
  const filterModel = (api.getFilterModel?.() ?? null) as Record<string, unknown> | null;
  const sortModel = (api.getColumnState?.() ?? [])
    .filter((c) => c.sort === 'asc' || c.sort === 'desc')
    .sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0))
    .map((c) => ({ colId: c.colId, sort: c.sort as 'asc' | 'desc' }));
  const raw = api.getGridOption?.('quickFilterText');
  const quickFilterText = typeof raw === 'string' && raw ? raw : undefined;
  return {
    filterModel,
    sortModel,
    ...(quickFilterText ? { quickFilterText } : {}),
  };
}

export async function drainSsrmRows(
  provider: ISsrmDataProvider,
  req: SsrmGetRowsRequest,
  maxRows: number = SSRM_EXPORT_MAX_ROWS,
): Promise<Record<string, unknown>[]> {
  const counted = await provider.getRowCount({
    filterModel: req.filterModel,
    quickFilterText: req.quickFilterText,
  }).catch(() => ({ rowCount: 0 }));
  if (counted.rowCount > maxRows) {
    throw new SsrmExportTooLargeError(counted.rowCount);
  }

  const rows: Record<string, unknown>[] = [];
  let start = 0;
  let total = Number.POSITIVE_INFINITY;
  while (start < total && rows.length < maxRows) {
    const end = start + CHUNK;
    const page = await provider.getRows({ ...req, startRow: start, endRow: end });
    total = typeof page.rowCount === 'number' ? page.rowCount : start + page.rowData.length;
    if (total > maxRows) throw new SsrmExportTooLargeError(total);
    if (page.rowData.length === 0) break;
    for (const row of page.rowData) rows.push(row as Record<string, unknown>);
    start += page.rowData.length;
  }
  return rows;
}
