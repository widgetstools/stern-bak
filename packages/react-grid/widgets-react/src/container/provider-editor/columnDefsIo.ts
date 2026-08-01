/**
 * columnDefsIo — export the Columns-tab column definitions to a portable
 * JSON file and parse one back in.
 *
 * The export is a plain JSON array of {@link ColumnDefinition} objects at
 * full fidelity — every field is preserved, INCLUDING each column's
 * `valueGetter` DSL expression, so an exported file round-trips back through
 * `parseColumnDefsImport` without losing computed-column logic.
 *
 * Import is permissive about the wrapper shape (bare array, `{ columns }`,
 * or the export envelope) but strict about each entry: a column needs a
 * non-empty string `field`. Unknown keys are dropped so a hand-edited or
 * foreign file can't smuggle junk onto a definition.
 */

import type { ColumnDefinition } from '@wellsfargo-starui/shared-types';

const EXPORT_KIND = 'starui.columnDefs';
const EXPORT_VERSION = 1;

/** Envelope written alongside the bare-array body for provenance. */
interface ColumnDefsExport {
  kind: typeof EXPORT_KIND;
  version: number;
  exportedAt: string;
  columns: ColumnDefinition[];
}

const VALID_CELL_TYPES: ReadonlySet<NonNullable<ColumnDefinition['cellDataType']>> = new Set([
  'text', 'number', 'boolean', 'date', 'dateString', 'object',
]);

/**
 * Serialize column definitions to pretty JSON. `structuredClone` avoids
 * mutating or holding a reference to the live array. Full fidelity —
 * `valueGetter` and every other field ride along.
 */
export function serializeColumnDefs(columns: readonly ColumnDefinition[]): string {
  return JSON.stringify(structuredClone(columns as ColumnDefinition[]), null, 2);
}

/** Serialize the current columns and trigger a browser download. */
export function exportColumnDefs(columns: readonly ColumnDefinition[]): void {
  const json = serializeColumnDefs(columns);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'starui-column-defs.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/**
 * Coerce one raw object into a clean {@link ColumnDefinition}, keeping only
 * recognized fields. Returns `null` when there's no usable `field`.
 */
function sanitizeColumnDef(raw: Record<string, unknown>): ColumnDefinition | null {
  const field = typeof raw.field === 'string' ? raw.field.trim() : '';
  if (!field) return null;

  const out: ColumnDefinition = {
    field,
    headerName:
      typeof raw.headerName === 'string' && raw.headerName.trim() ? raw.headerName : field,
  };

  if (
    typeof raw.cellDataType === 'string' &&
    VALID_CELL_TYPES.has(raw.cellDataType as NonNullable<ColumnDefinition['cellDataType']>)
  ) {
    out.cellDataType = raw.cellDataType as ColumnDefinition['cellDataType'];
  }
  if (typeof raw.width === 'number' && Number.isFinite(raw.width)) out.width = raw.width;
  if (typeof raw.filter === 'string' || typeof raw.filter === 'boolean') out.filter = raw.filter;
  if (typeof raw.sortable === 'boolean') out.sortable = raw.sortable;
  if (typeof raw.resizable === 'boolean') out.resizable = raw.resizable;
  if (typeof raw.hide === 'boolean') out.hide = raw.hide;
  if (typeof raw.type === 'string') out.type = raw.type;
  if (typeof raw.valueFormatter === 'string') out.valueFormatter = raw.valueFormatter;
  if (typeof raw.cellRenderer === 'string') out.cellRenderer = raw.cellRenderer;
  // The headline requirement: a `valueGetter` expression round-trips.
  if (typeof raw.valueGetter === 'string' && raw.valueGetter.trim()) {
    out.valueGetter = raw.valueGetter;
  }

  return out;
}

/**
 * Parse an exported (or hand-authored) JSON file into column definitions.
 * Accepts a bare array, `{ columns: [...] }`, or the `{ kind, columns }`
 * envelope. Throws a user-readable Error on anything it can't make sense of.
 */
export function parseColumnDefsImport(text: string): ColumnDefinition[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('File is not valid JSON.');
  }

  const rawColumns: unknown = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.columns)
      ? parsed.columns
      : null;

  if (!rawColumns) {
    throw new Error('File does not contain a column-definitions array.');
  }

  const columns: ColumnDefinition[] = [];
  for (const item of rawColumns as unknown[]) {
    if (!isRecord(item)) continue;
    const def = sanitizeColumnDef(item);
    if (def) columns.push(def);
  }

  if (columns.length === 0) {
    throw new Error('No valid columns found — each entry needs a "field".');
  }

  return columns;
}

export type { ColumnDefsExport };
