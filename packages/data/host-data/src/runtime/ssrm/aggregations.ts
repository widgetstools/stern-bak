import type { AggFunc, Row } from "./types.js";

export interface AggSpec {
  field: string;
  aggFunc: AggFunc;
}

interface AggState {
  sum: number;
  count: number;
  min: number;
  max: number;
  nonNull: number;
}

function emptyState(): AggState {
  return {
    sum: 0,
    count: 0,
    min: Number.POSITIVE_INFINITY,
    max: Number.NEGATIVE_INFINITY,
    nonNull: 0,
  };
}

function toNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) {
    return Number(v);
  }
  return null;
}

function normalizeAgg(raw: string | null | undefined): AggFunc {
  const s = (raw ?? "sum").toLowerCase();
  if (s === "min" || s === "max" || s === "avg" || s === "average" || s === "count") {
    return s === "average" ? "avg" : (s as AggFunc);
  }
  return "sum";
}

/**
 * Incremental aggregation helper for grand totals and group nodes.
 * Rebuilds from a row iterable when filter/group context changes;
 * applies delta updates for live ticks on the unfiltered universe.
 */
export class AggregationEngine {
  private specs: AggSpec[] = [];
  private grand = new Map<string, AggState>();
  /** groupPath (joined by \0) → field → state */
  private groups = new Map<string, Map<string, AggState>>();

  setSpecs(specs: AggSpec[]): void {
    this.specs = specs.map((s) => ({
      field: s.field,
      aggFunc: normalizeAgg(s.aggFunc),
    }));
  }

  clear(): void {
    this.grand.clear();
    this.groups.clear();
  }

  private ensureField(
    map: Map<string, AggState>,
    field: string,
  ): AggState {
    let s = map.get(field);
    if (!s) {
      s = emptyState();
      map.set(field, s);
    }
    return s;
  }

  private applyValue(state: AggState, value: unknown, sign: 1 | -1): void {
    state.count += sign;
    const n = toNum(value);
    if (n == null) return;
    state.nonNull += sign;
    state.sum += sign * n;
    if (sign === 1) {
      if (n < state.min) state.min = n;
      if (n > state.max) state.max = n;
    }
    // On remove, min/max may be stale — callers should rebuild for correctness
    // when removals matter. Live ticks are mostly value changes via rebuildRow.
  }

  /** Full rebuild of grand totals from rows. */
  rebuildGrand(rows: Iterable<Row>): Row {
    this.grand.clear();
    for (const spec of this.specs) {
      this.grand.set(spec.field, emptyState());
    }
    for (const row of rows) {
      for (const spec of this.specs) {
        this.applyValue(this.ensureField(this.grand, spec.field), row[spec.field], 1);
      }
    }
    return this.grandAsRow();
  }

  /**
   * Rebuild aggregations for a single group path from matching rows.
   * `groupPath` is `groupKeys.join('\0')`.
   */
  rebuildGroup(groupPath: string, rows: Iterable<Row>): Row {
    const map = new Map<string, AggState>();
    for (const spec of this.specs) map.set(spec.field, emptyState());
    for (const row of rows) {
      for (const spec of this.specs) {
        this.applyValue(this.ensureField(map, spec.field), row[spec.field], 1);
      }
    }
    this.groups.set(groupPath, map);
    return this.mapAsRow(map);
  }

  grandAsRow(): Row {
    return this.mapAsRow(this.grand);
  }

  groupAsRow(groupPath: string): Row {
    const map = this.groups.get(groupPath);
    return map ? this.mapAsRow(map) : {};
  }

  private mapAsRow(map: Map<string, AggState>): Row {
    const out: Row = {};
    for (const spec of this.specs) {
      const s = map.get(spec.field) ?? emptyState();
      out[spec.field] = finalize(s, spec.aggFunc);
    }
    return out;
  }
}

/**
 * `null` (blank) rather than `0` when nothing contributed a value: in a
 * markets grid a 0 price or 0 spread reads as data, not as "no values here".
 * `count` legitimately counts to 0, and `sum` keeps its additive identity.
 */
function finalize(s: AggState, fn: AggFunc): number | null {
  switch (fn) {
    case "count":
      return s.count;
    case "min":
      return s.nonNull ? s.min : null;
    case "max":
      return s.nonNull ? s.max : null;
    case "avg":
      return s.nonNull ? s.sum / s.nonNull : null;
    case "sum":
    default:
      return s.sum;
  }
}

export function aggregateRows(rows: Iterable<Row>, specs: AggSpec[]): Row {
  const eng = new AggregationEngine();
  eng.setSpecs(specs);
  return eng.rebuildGrand(rows);
}

export { normalizeAgg };
