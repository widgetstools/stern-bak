import type { Row } from "./types.js";

/**
 * CSRM-parity quick filter helpers.
 *
 * AG Grid CSRM splits the input on whitespace and requires every word to appear
 * (case-insensitive) in a per-row aggregate string. With `cacheQuickFilter`,
 * that string is precomputed — we do the same in {@link RowStore}.
 */

/** Split / normalize quick-filter input into lowercase words. */
export function parseQuickFilter(
  text: string | null | undefined,
): string[] {
  if (text == null) return [];
  const trimmed = text.trim().toLowerCase();
  if (!trimmed) return [];
  return trimmed.split(/\s+/).filter(Boolean);
}

/**
 * Build the searchable aggregate text for a row (lowercase, space-joined).
 * Skips internal `__*` fields and non-primitive values.
 */
export function buildQuickFilterText(
  row: Row,
  columns?: readonly string[],
): string {
  const parts: string[] = [];
  if (columns) {
    for (const col of columns) {
      appendQuickFilterValue(parts, col, row[col]);
    }
  } else {
    for (const [col, value] of Object.entries(row)) {
      appendQuickFilterValue(parts, col, value);
    }
  }
  return parts.join(" ");
}

function appendQuickFilterValue(
  parts: string[],
  col: string,
  value: unknown,
): void {
  if (!col || col.startsWith("__")) return;
  if (value == null) return;
  const t = typeof value;
  if (t === "string") {
    if (value) parts.push((value as string).toLowerCase());
    return;
  }
  if (t === "number" || t === "boolean" || t === "bigint") {
    parts.push(String(value).toLowerCase());
  }
}

/** CSRM default matcher: every word must be a substring of the aggregate text. */
export function rowPassesQuickFilter(
  cachedText: string,
  parts: readonly string[],
): boolean {
  if (parts.length === 0) return true;
  // Hot path: avoid closures / extra allocations.
  for (let i = 0; i < parts.length; i++) {
    if (!cachedText.includes(parts[i]!)) return false;
  }
  return true;
}
