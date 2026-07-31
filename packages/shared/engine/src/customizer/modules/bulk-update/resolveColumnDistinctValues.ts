import type { BulkUpdateGridReader } from './collectBulkUpdateTargets.js';

export interface DistinctValuesReader extends BulkUpdateGridReader {
  getDisplayedRowCount(): number;
}

function compareValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
}

/** Distinct values currently displayed in one column (for dropdown). */
export function resolveColumnDistinctValues(
  api: DistinctValuesReader,
  colId: string,
  limit: number,
): unknown[] {
  const seen = new Set<string>();
  const values: unknown[] = [];
  const rowCount = api.getDisplayedRowCount();

  for (let i = 0; i < rowCount; i += 1) {
    const rowNode = api.getDisplayedRowAtIndex(i);
    if (!rowNode) continue;
    const value = api.getCellValue({ rowNode, colKey: colId });
    const key = JSON.stringify(value);
    if (seen.has(key)) continue;
    seen.add(key);
    values.push(value);
    if (values.length >= limit) break;
  }

  return values.sort(compareValues);
}
