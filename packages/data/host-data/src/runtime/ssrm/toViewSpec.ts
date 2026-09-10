/**
 * AG Grid SSRM request → the engine's view spec.
 *
 * This translation is where a server-side grid goes silently wrong: every
 * mistake here still renders rows, just not the right ones. So it lives in one
 * pure function with a test per filter shape, and every condition it cannot
 * translate is reported through {@link ToViewSpecResult.unsupported} instead of
 * being dropped — a filter the engine never sees shows MORE rows than the user
 * asked for.
 *
 * The four filter-model grammars AG Grid can send:
 *   - simple      `{ filterType: 'text'|'number'|'date', type, filter|dateFrom }`
 *   - combined    `{ operator: 'AND'|'OR', conditions: [...] }`
 *   - set         `{ filterType: 'set', values: [...] }`
 *   - multi       `{ filterType: 'multi', filterModels: [...] }` (ANDed slots)
 */
import type {
  SsrmFilterCondition,
  SsrmFilterNode,
  SsrmFilterOp,
  SsrmGetRowsRequest,
  SsrmViewSpec,
} from './ssrmTypes.js';

/**
 * AG Grid's text menu → engine operators.
 *
 * Text equality is case-INSENSITIVE in AG Grid and case-sensitive in the
 * engine, so it maps to the folded comparison; contains / startsWith /
 * endsWith are already folded engine-side.
 */
const TEXT_OPS: Record<string, SsrmFilterOp> = {
  contains: 'contains',
  notContains: 'notContains',
  startsWith: 'startsWith',
  endsWith: 'endsWith',
  equals: 'equalsIgnoreCase',
  notEqual: 'notEqualIgnoreCase',
  blank: 'blank',
  notBlank: 'notBlank',
};

/** Number / date menu → engine operators (no case folding). */
const SCALAR_OPS: Record<string, SsrmFilterOp> = {
  equals: 'equals',
  notEqual: 'notEqual',
  greaterThan: 'greaterThan',
  greaterThanOrEqual: 'greaterThanOrEqual',
  lessThan: 'lessThan',
  lessThanOrEqual: 'lessThanOrEqual',
  blank: 'blank',
  notBlank: 'notBlank',
};

const VALUELESS_OPS = new Set<SsrmFilterOp>(['blank', 'notBlank']);

interface FilterModelEntry {
  filterType?: string;
  type?: string;
  operator?: 'AND' | 'OR';
  conditions?: FilterModelEntry[];
  /** `agMultiColumnFilter` — one slot per configured sub-filter, null when unset. */
  filterModels?: (FilterModelEntry | null)[];
  filter?: unknown;
  filterTo?: unknown;
  values?: unknown[];
  dateFrom?: string | null;
  dateTo?: string | null;
}

export interface ToViewSpecOptions {
  /**
   * Columns the quick filter searches. AG Grid never sends a quick filter for
   * SSRM (it has no rows to scan), so the surface forwards the text and it
   * becomes an OR of `contains` across these columns.
   */
  searchColumns?: readonly string[];
}

export interface ToViewSpecResult {
  spec: SsrmViewSpec;
  /** Human-readable descriptions of conditions with no engine translation. */
  unsupported: string[];
}

/** One column's filter model → engine nodes (ANDed unless an `or` node). */
export function filterModelToNodes(
  colId: string,
  model: FilterModelEntry | null | undefined,
  unsupported: string[],
): SsrmFilterNode[] {
  if (!model || typeof model !== 'object') return [];

  // Multi filter: independent slots that AG Grid ANDs. Absent slots are null.
  // Our stream-safe floating filters emit exactly this envelope for
  // `agMultiColumnFilter` columns (see buildMultiEnvelope).
  if (Array.isArray(model.filterModels)) {
    return model.filterModels.flatMap((slot) => filterModelToNodes(colId, slot, unsupported));
  }

  if (model.operator || Array.isArray(model.conditions)) {
    const parts = (model.conditions ?? []).flatMap(
      (c) => filterModelToNodes(colId, c, unsupported),
    );
    // AND flattens into the top-level list, which is ANDed anyway. OR cannot.
    if (model.operator !== 'OR') return parts;
    return parts.length > 0 ? [{ op: 'or', conditions: parts }] : [];
  }

  const kind = model.filterType ?? 'text';

  if (kind === 'set') {
    const values = model.values ?? [];
    // An empty selection means NOTHING, not everything — the difference
    // between an empty grid and an unfiltered one.
    if (values.length === 0) return [{ column: colId, op: 'in', value: [] }];
    // A grouped view in the engine applies `in` to the group rows (which
    // don't carry the filtered column), so the root request comes back
    // empty. `equals` is evaluated on the leaves before grouping.
    const eq = (value: unknown): SsrmFilterCondition => ({
      column: colId,
      op: typeof value === 'string' ? 'equalsIgnoreCase' : 'equals',
      value,
    });
    if (values.length === 1) return [eq(values[0])];
    return [{ op: 'or', conditions: values.map(eq) }];
  }

  if (model.type === 'inRange') {
    const isDate = kind === 'date';
    return [{
      column: colId,
      op: 'inRange',
      value: isDate ? model.dateFrom : model.filter,
      valueTo: isDate ? model.dateTo : model.filterTo,
    }];
  }

  const op = model.type ? (kind === 'text' ? TEXT_OPS : SCALAR_OPS)[model.type] : undefined;
  if (!op) {
    unsupported.push(`${colId}: ${String(model.type)} (${kind})`);
    return [];
  }
  if (VALUELESS_OPS.has(op)) return [{ column: colId, op }];

  return [{
    column: colId,
    op,
    value: kind === 'date' ? model.dateFrom : model.filter,
  }];
}

/**
 * Build the view spec for one `getRows` request.
 *
 * Grouping is the subtle rule: AG Grid asks for ONE level at a time.
 * `groupKeys` is the path already expanded, so its length is the depth and the
 * next level is the row-group column at that index.
 */
export function toViewSpecResult(
  req: SsrmGetRowsRequest,
  opts: ToViewSpecOptions = {},
): ToViewSpecResult {
  const unsupported: string[] = [];
  const filter: SsrmFilterNode[] = [];
  const groupKeys = req.groupKeys ?? [];
  const rowGroupCols = req.rowGroupCols ?? [];

  // The expanded path becomes one equality filter per level.
  groupKeys.forEach((value, i) => {
    const col = rowGroupCols[i];
    if (col) filter.push({ column: col.id, op: 'equals', value });
  });

  for (const [colId, model] of Object.entries(req.filterModel ?? {})) {
    filter.push(...filterModelToNodes(colId, model as FilterModelEntry, unsupported));
  }

  const text = req.quickFilterText?.trim();
  if (text) {
    const cols = opts.searchColumns ?? [];
    if (cols.length === 0) {
      unsupported.push(`quick filter "${text}" (no searchColumns configured)`);
    } else {
      filter.push({
        op: 'or',
        conditions: cols.map((column) => ({ column, op: 'contains' as const, value: text })),
      });
    }
  }

  const spec: SsrmViewSpec = {
    filter,
    sort: (req.sortModel ?? []).map((s) => ({ column: s.colId, dir: s.sort })),
  };

  const next = rowGroupCols[groupKeys.length];
  if (next) {
    spec.groupBy = [next.id];
    spec.aggregates = {};
    for (const v of req.valueCols ?? []) spec.aggregates[v.id] = v.aggFunc ?? 'sum';
    spec.depth = 1;
  }

  if (req.pivotMode && (req.pivotCols ?? []).length > 0) {
    spec.splitBy = req.pivotCols!.map((c) => c.id);
    spec.columns = (req.valueCols ?? []).map((c) => c.id);
  }

  return { spec, unsupported };
}

/** Spec only — callers that don't report unsupported conditions. */
export function toViewSpec(
  req: SsrmGetRowsRequest,
  opts: ToViewSpecOptions = {},
): SsrmViewSpec {
  return toViewSpecResult(req, opts).spec;
}
