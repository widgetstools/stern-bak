import type { Row } from "./types.js";

type FilterModel = Record<string, unknown>;

function asNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) {
    return Number(v);
  }
  return null;
}

function textMatch(
  value: unknown,
  filter: string,
  type: string | undefined,
): boolean {
  const s = value == null ? "" : String(value).toLowerCase();
  const f = (filter ?? "").toLowerCase();
  switch (type) {
    case "equals":
      return s === f;
    case "notEqual":
      return s !== f;
    case "startsWith":
      return s.startsWith(f);
    case "endsWith":
      return s.endsWith(f);
    case "notContains":
      return !s.includes(f);
    case "blank":
      return s === "";
    case "notBlank":
      return s !== "";
    case "contains":
    default:
      return s.includes(f);
  }
}

function numberMatch(
  value: unknown,
  filter: number | null | undefined,
  filterTo: number | null | undefined,
  type: string | undefined,
): boolean {
  const n = asNum(value);
  switch (type) {
    case "blank":
      return n == null;
    case "notBlank":
      return n != null;
    case "equals":
      return n != null && filter != null && n === filter;
    case "notEqual":
      return n == null || filter == null || n !== filter;
    case "lessThan":
      return n != null && filter != null && n < filter;
    case "lessThanOrEqual":
      return n != null && filter != null && n <= filter;
    case "greaterThan":
      return n != null && filter != null && n > filter;
    case "greaterThanOrEqual":
      return n != null && filter != null && n >= filter;
    case "inRange":
      return (
        n != null &&
        filter != null &&
        filterTo != null &&
        n >= filter &&
        n <= filterTo
      );
    default:
      return n != null && filter != null && n === filter;
  }
}

/**
 * AG Grid set filter:
 * - missing / null values ⇒ treat as no restriction (shouldn't happen for active model)
 * - empty array `[]` ⇒ nothing selected ⇒ match NO rows
 * - non-empty ⇒ row value must be in the list
 */
function setMatch(value: unknown, values: unknown[] | null | undefined): boolean {
  if (values == null) return true;
  if (values.length === 0) return false;
  const s = value == null ? null : String(value);
  // AG Grid may include null for blanks
  return values.some((v) => {
    if (v == null || v === "") return s == null || s === "";
    return String(v) === s;
  });
}

function asDateMs(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) {
    const t = v.getTime();
    return Number.isNaN(t) ? null : t;
  }
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = String(v).trim();
  if (!s) return null;
  // Prefer ISO / `YYYY-MM-DD` prefix (AG Grid dateFrom often includes time).
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return t;
  return null;
}

/** Calendar day key in local time for CSRM-like date equals/inRange. */
function dayKey(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dateMatch(
  value: unknown,
  dateFrom: unknown,
  dateTo: unknown,
  type: string | undefined,
): boolean {
  const n = asDateMs(value);
  const from = asDateMs(dateFrom);
  const to = asDateMs(dateTo);
  switch (type) {
    case "blank":
      return n == null;
    case "notBlank":
      return n != null;
    case "equals":
      return n != null && from != null && dayKey(n) === dayKey(from);
    case "notEqual":
      return n == null || from == null || dayKey(n) !== dayKey(from);
    case "lessThan":
      return n != null && from != null && n < from;
    case "lessThanOrEqual":
      return n != null && from != null && n <= from;
    case "greaterThan":
      return n != null && from != null && n > from;
    case "greaterThanOrEqual":
      return n != null && from != null && n >= from;
    case "inRange": {
      if (n == null || from == null || to == null) return false;
      // Inclusive range on calendar days (CSRM date filter feel).
      return dayKey(n) >= dayKey(from) && dayKey(n) <= dayKey(to);
    }
    default:
      return n != null && from != null && dayKey(n) === dayKey(from);
  }
}

function matchSimple(row: Row, colId: string, model: Record<string, unknown>): boolean {
  const value = row[colId];

  if (model.filterType === "set" || Array.isArray(model.values)) {
    return setMatch(value, model.values as unknown[]);
  }

  if (model.filterType === "number" || typeof model.filter === "number") {
    return numberMatch(
      value,
      asNum(model.filter),
      asNum(model.filterTo),
      model.type as string | undefined,
    );
  }

  if (model.filterType === "date") {
    return dateMatch(
      value,
      model.dateFrom ?? model.filter,
      model.dateTo ?? model.filterTo,
      model.type as string | undefined,
    );
  }

  if (
    model.filterType === "text" ||
    typeof model.filter === "string" ||
    model.type === "blank" ||
    model.type === "notBlank"
  ) {
    return textMatch(
      value,
      String(model.filter ?? ""),
      model.type as string | undefined,
    );
  }

  return true;
}

function matchOne(row: Row, colId: string, model: unknown): boolean {
  if (model == null || typeof model !== "object") return true;
  const m = model as Record<string, unknown>;

  // Join / multi / combined filters (AG Grid 28+)
  if (
    (m.filterType === "multi" || m.filterType === "join") &&
    Array.isArray(m.filterModels ?? m.conditions)
  ) {
    const parts = (m.filterModels ?? m.conditions) as unknown[];
    const models = parts.filter(Boolean);
    if (models.length === 0) return true;
    const op = (m.operator as string | undefined)?.toUpperCase() === "OR" ? "OR" : "AND";
    return op === "OR"
      ? models.some((fm) => matchOne(row, colId, fm))
      : models.every((fm) => matchOne(row, colId, fm));
  }

  // Simple filter with multiple conditions (text/number)
  if (Array.isArray(m.conditions) && m.conditions.length > 0) {
    const op = (m.operator as string | undefined)?.toUpperCase() === "OR" ? "OR" : "AND";
    return op === "OR"
      ? m.conditions.some((fm) => matchOne(row, colId, fm))
      : m.conditions.every((fm) => matchOne(row, colId, fm));
  }

  return matchSimple(row, colId, m);
}

/** Evaluate an AG Grid filterModel against a row. */
export function rowPassesFilter(
  row: Row,
  filterModel: FilterModel | null | undefined,
): boolean {
  if (!filterModel) return true;
  for (const [colId, model] of Object.entries(filterModel)) {
    if (!matchOne(row, colId, model)) return false;
  }
  return true;
}

export function compareValues(
  a: unknown,
  b: unknown,
  dir: "asc" | "desc",
): number {
  const mul = dir === "asc" ? 1 : -1;
  if (a == null && b == null) return 0;
  if (a == null) return -1 * mul;
  if (b == null) return 1 * mul;
  const na = asNum(a);
  const nb = asNum(b);
  if (na != null && nb != null) return (na - nb) * mul;
  const da = asDateMs(a);
  const db = asDateMs(b);
  if (da != null && db != null) return (da - db) * mul;
  return String(a).localeCompare(String(b)) * mul;
}
