import { getValueByPath } from "@wellsfargo-starui/types";
import type { Row } from "./types.js";

/**
 * CSRM-parity quick filter helpers.
 *
 * AG Grid CSRM splits the input on whitespace and requires every word to appear
 * (case-insensitive) in a per-row aggregate string. With `cacheQuickFilter`,
 * that string is precomputed — we do the same in {@link RowStore}.
 *
 * CSRM searches the grid's COLUMNS, and excludes hidden ones unless
 * `includeHiddenColumnsInQuickFilter` is set. The cached aggregate here covers
 * every field on the row, so a query narrows it with
 * {@link rowPassesQuickFilterScoped}: the cache stays one string per row (one
 * plane serves every grid on the provider, and their column sets differ), and
 * the scoped confirmation only runs for rows the cache already admitted.
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
 * How deep the all-fields aggregate walks into nested row objects. The
 * projector keeps real sub-objects for dot-path columns
 * (`providers/fieldProjection.ts`), so their leaves have to reach the cache or
 * a scoped query could match a value the cache says the row does not have.
 * Three levels covers every column shape this repo's providers declare.
 */
const MAX_NESTED_DEPTH = 3;

/**
 * Build the searchable aggregate text for a row (lowercase, space-joined).
 * Skips internal `__*` fields and non-primitive values.
 *
 * With `columns`, values are read by path — a column whose field is
 * `quote.bid` contributes the nested value. Without them, every field is
 * walked, nested objects included, so the result is a SUPERSET of any scoped
 * build. {@link rowPassesQuickFilterScoped} relies on that.
 */
export function buildQuickFilterText(
  row: Row,
  columns?: readonly string[],
): string {
  const parts: string[] = [];
  if (columns) {
    for (const col of columns) {
      appendQuickFilterValue(parts, col, getValueByPath(row, col));
    }
  } else {
    appendAllValues(parts, row, 0);
  }
  return parts.join(" ");
}

function appendAllValues(parts: string[], row: Row, depth: number): void {
  for (const [col, value] of Object.entries(row)) {
    if (!col || col.startsWith("__")) continue;
    if (
      depth < MAX_NESTED_DEPTH &&
      value != null &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      appendAllValues(parts, value as Row, depth + 1);
      continue;
    }
    appendQuickFilterValue(parts, col, value);
  }
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

/**
 * Quick-filter match limited to the columns a grid is actually searching.
 *
 * Two steps, and the order is the point. The cached all-fields aggregate is a
 * superset of any scoped one — a search word never spans two columns, because
 * words carry no whitespace and column values are joined with it — so a row
 * the cache rejects cannot match a narrower set either. Only the rows the
 * cache admits pay for a scoped build, which keeps the common case (a
 * selective search over 100k rows) at one cache lookup per row.
 *
 * `columns` empty or omitted ⇒ the cached answer stands: the caller could not
 * tell us which columns the grid is showing, and every field is the same
 * behaviour this engine has always had.
 */
export function rowPassesQuickFilterScoped(
  cachedText: string,
  row: Row,
  parts: readonly string[],
  columns: readonly string[] | null | undefined,
): boolean {
  if (parts.length === 0) return true;
  if (!rowPassesQuickFilter(cachedText, parts)) return false;
  if (!columns || columns.length === 0) return true;
  return rowPassesQuickFilter(buildQuickFilterText(row, columns), parts);
}
