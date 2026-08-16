/**
 * AG Grid filter-model evaluation for the SSRM query plane.
 *
 * TWO SHAPES arrive here, both under `request.filterModel`:
 *
 *  - the COLUMN MAP (`{ [colId]: model }`) AG Grid sends for column filters;
 *  - the ADVANCED FILTER TREE (`{ filterType: 'join', … }`) it sends *instead*
 *    when Advanced Filter is enabled — ag-grid-enterprise builds the request
 *    with `isAdvFilterEnabled() ? getAdvFilterModel() : getFilterModel()`, so
 *    the two are mutually exclusive, never merged.
 *
 * NOTHING FALLS THROUGH. An operator this file cannot evaluate raises
 * {@link UnsupportedQueryError} instead of substituting a different one: a
 * query that quietly widens to "every row" or narrows to "no rows" is the
 * defect class this module exists to remove.
 *
 * Evaluation and validation are ONE walk, not two that can drift:
 * {@link evaluateModel} takes `row === null` to mean "resolve every operator,
 * evaluate nothing". {@link assertFilterModelSupported} is that call, and
 * {@link rowPassesFilter} is the same walk with a row. The combinators are
 * deliberately NON-short-circuiting so an unsupported leaf is reached — and
 * therefore rejected — whatever the data says about the leaf beside it.
 *
 * Values are read with the repo's `getPathAccessor` (the compiled sibling of
 * `getValueByPath`, same semantics, cached per path), so a column whose field
 * is a dot path into a nested object filters on the value the projector
 * actually kept — see `providers/fieldProjection.ts`.
 */
import { getPathAccessor } from "@wellsfargo-starui/types";
import type { Row } from "./types.js";
import { UnsupportedQueryError } from "./UnsupportedQueryError.js";

type FilterModel = Record<string, unknown>;
type Condition = Record<string, unknown>;

/** How a single condition is evaluated, once its shape has been read. */
type SimpleKind = "set" | "number" | "date" | "boolean" | "text";

/**
 * The operator matrices AG Grid's own filters emit, per kind.
 *
 * `empty` is AG Grid's placeholder for a condition the user has not finished
 * filling in. The grid does not apply one, so it restricts nothing here —
 * listed explicitly because "restricts nothing" must be a decision, never a
 * default arm.
 *
 * Absent on purpose: AG Grid's relative-date PRESETS (`today`, `last7Days`,
 * `thisQuarter`, … — `ISimpleFilterModelPresetType`). They are not in
 * `DEFAULT_DATE_FILTER_OPTIONS`, so a column opts into them, and evaluating
 * them here would mean re-deriving week/quarter boundaries the grid resolves
 * with its own calendar. They are rejected with copy naming the alternative.
 */
const TEXT_OPS: ReadonlySet<string> = new Set([
  "contains",
  "notContains",
  "equals",
  "notEqual",
  "startsWith",
  "endsWith",
  "blank",
  "notBlank",
  "empty",
]);
const SCALAR_OPS: ReadonlySet<string> = new Set([
  "equals",
  "notEqual",
  "lessThan",
  "lessThanOrEqual",
  "greaterThan",
  "greaterThanOrEqual",
  "inRange",
  "blank",
  "notBlank",
  "empty",
]);
const BOOLEAN_OPS: ReadonlySet<string> = new Set([
  "true",
  "false",
  "blank",
  "notBlank",
  "empty",
]);

const OPS: Record<SimpleKind, ReadonlySet<string>> = {
  set: new Set(),
  text: TEXT_OPS,
  number: SCALAR_OPS,
  date: SCALAR_OPS,
  boolean: BOOLEAN_OPS,
};

/** Relative-date options, named in the rejection so the copy is specific. */
const DATE_PRESETS: ReadonlySet<string> = new Set([
  "today", "yesterday", "tomorrow",
  "thisWeek", "lastWeek", "nextWeek",
  "thisMonth", "lastMonth", "nextMonth",
  "thisQuarter", "lastQuarter", "nextQuarter",
  "thisYear", "lastYear", "nextYear",
  "yearToDate",
  "last7Days", "last30Days", "last90Days",
  "last6Months", "last12Months", "last24Months",
]);

function asNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) {
    return Number(v);
  }
  return null;
}

function textMatch(value: unknown, filter: string, type: string): boolean {
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
    case "contains":
      return s.includes(f);
    case "blank":
      return s === "";
    case "notBlank":
      return s !== "";
    case "empty":
      return true;
    default:
      throw unsupportedOperator("text", type);
  }
}

function numberMatch(
  value: unknown,
  filter: number | null | undefined,
  filterTo: number | null | undefined,
  type: string,
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
    case "empty":
      return true;
    default:
      throw unsupportedOperator("number", type);
  }
}

/**
 * AG Grid set filter:
 * - missing / null values ⇒ no restriction (a `{ filterType: 'set' }` with no
 *   `values` key is a shape AG Grid itself can hand back mid-edit — see
 *   `agGridSetFilterValidateGuard.ts`)
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
  type: string,
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
    case "empty":
      return true;
    default:
      throw unsupportedOperator("date", type);
  }
}

/**
 * Advanced Filter's boolean column condition. `1`/`0` and the strings
 * `'true'`/`'false'` count as booleans — flag columns on a markets feed
 * arrive as either, and a column the user sees as a tick box must filter
 * like one.
 */
function asBool(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return Number.isFinite(v) ? v !== 0 : null;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true") return true;
    if (s === "false") return false;
  }
  return null;
}

function booleanMatch(value: unknown, type: string): boolean {
  switch (type) {
    case "true":
      return asBool(value) === true;
    case "false":
      return asBool(value) === false;
    case "blank":
      return value == null || value === "";
    case "notBlank":
      return !(value == null || value === "");
    case "empty":
      return true;
    default:
      throw unsupportedOperator("boolean", type);
  }
}

// ─── Rejections ───────────────────────────────────────────────────────────

function unsupportedOperator(kind: string, type: unknown): UnsupportedQueryError {
  const named = typeof type === "string" && type ? `“${type}”` : "an unnamed option";
  if (typeof type === "string" && DATE_PRESETS.has(type)) {
    return new UnsupportedQueryError(
      `This grid filters on the server, which cannot evaluate the relative date ` +
        `option ${named}. Pick an explicit date or date range instead.`,
    );
  }
  return new UnsupportedQueryError(
    `This grid filters on the server, which does not support the ${kind} filter ` +
      `option ${named}. Choose one of the standard ${kind} filter options.`,
  );
}

function unsupportedShape(colId: string, model: Condition): UnsupportedQueryError {
  const ft = typeof model.filterType === "string" ? `“${model.filterType}”` : "no type";
  return new UnsupportedQueryError(
    `This grid filters on the server, which does not recognise the filter on ` +
      `“${colId}” (${ft}). Clear that column's filter, or use one of the ` +
      `standard text, number, date or set filters.`,
  );
}

// ─── The walk ─────────────────────────────────────────────────────────────

/**
 * Resolve the operator a condition names, rejecting anything outside the
 * kind's matrix. Every leaf goes through here, so a missing `type` is a
 * rejection too — an operator-less condition has no defensible reading, and
 * guessing one is exactly the substitution this module removes.
 */
function operatorOf(colId: string, kind: SimpleKind, model: Condition): string {
  const type = model.type;
  if (typeof type === "string" && OPS[kind].has(type)) return type;
  if (typeof type === "string") throw unsupportedOperator(kind, type);
  throw unsupportedShape(colId, model);
}

/**
 * Which matcher a single condition belongs to. Explicit `filterType` first
 * (AG Grid always sets it, including the Advanced Filter's `bigint`,
 * `dateString`, `dateTime`, `dateTimeString` and `object` variants), then the
 * payload-shape inference this engine has always applied to hand-built and
 * older persisted models.
 */
function kindOf(model: Condition): SimpleKind | null {
  const ft = model.filterType;
  if (ft === "set" || Array.isArray(model.values)) return "set";
  // `bigint` filters carry their value as a string; `asNum` reads it. Values
  // beyond IEEE-754 range lose precision — the alternative is a second
  // numeric path, and no feed in this repo emits one.
  if (ft === "number" || ft === "bigint") return "number";
  if (ft === "date" || ft === "dateString" || ft === "dateTime" || ft === "dateTimeString") {
    return "date";
  }
  if (ft === "boolean") return "boolean";
  if (ft === "text" || ft === "object") return "text";
  if (ft !== undefined) return null;
  if (typeof model.filter === "number") return "number";
  if (model.dateFrom !== undefined || model.dateTo !== undefined) return "date";
  if (typeof model.filter === "string") return "text";
  if (model.type === "blank" || model.type === "notBlank") return "text";
  return null;
}

/**
 * Evaluate one leaf condition against `row`, or — when `row` is `null` —
 * resolve its shape and operator and evaluate nothing. Validation and
 * evaluation therefore reject exactly the same inputs, because they are the
 * same code path.
 */
function evaluateSimple(row: Row | null, colId: string, model: Condition): boolean {
  const kind = kindOf(model);
  if (kind === null) throw unsupportedShape(colId, model);
  if (kind === "set") {
    // A set filter carries values, never an operator.
    if (row === null) return true;
    return setMatch(getPathAccessor(colId)(row), model.values as unknown[]);
  }
  const type = operatorOf(colId, kind, model);
  if (row === null) return true;
  const value = getPathAccessor(colId)(row);
  switch (kind) {
    case "number":
      return numberMatch(value, asNum(model.filter), asNum(model.filterTo), type);
    case "date":
      return dateMatch(
        value,
        model.dateFrom ?? model.filter,
        model.dateTo ?? model.filterTo,
        type,
      );
    case "boolean":
      return booleanMatch(value, type);
    case "text":
      return textMatch(value, String(model.filter ?? ""), type);
  }
}

function joinOf(model: Condition): "AND" | "OR" {
  return String(model.operator ?? model.type ?? "AND").toUpperCase() === "OR"
    ? "OR"
    : "AND";
}

/**
 * Combine branch results WITHOUT short-circuiting: every branch is evaluated,
 * so an unsupported condition sitting beside a satisfied one is still
 * reached, and still rejected. Condition arrays hold one or two entries —
 * evaluating both costs nothing measurable and buys a rejection that does not
 * depend on the data.
 */
function combine(join: "AND" | "OR", results: boolean[]): boolean {
  if (results.length === 0) return true;
  return join === "OR" ? results.some(Boolean) : results.every(Boolean);
}

/**
 * One column's entry in the column map: a multi-filter envelope, a combined
 * condition list, or a single condition.
 */
function evaluateModel(row: Row | null, colId: string, model: unknown): boolean {
  // A cleared column. AG Grid drops the key rather than nulling it, but a
  // profile persisted by an older build can still carry one, and "no filter"
  // is the only reading it has — persisted state keeps loading.
  if (model == null) return true;
  if (typeof model !== "object") throw unsupportedShape(colId, { filterType: model });
  const m = model as Condition;

  // Join / multi / combined filters (AG Grid 28+)
  if (
    (m.filterType === "multi" || m.filterType === "join") &&
    Array.isArray(m.filterModels ?? m.conditions)
  ) {
    const parts = (m.filterModels ?? m.conditions) as unknown[];
    const models = parts.filter((p) => p != null);
    if (models.length === 0) return true;
    return combine(
      joinOf(m),
      models.map((fm) => evaluateModel(row, colId, fm)),
    );
  }

  // Simple filter with multiple conditions (text/number/date).
  const conditions = conditionListOf(m);
  if (conditions) {
    return combine(
      joinOf(m),
      conditions.map((fm) => evaluateModel(row, colId, fm)),
    );
  }

  return evaluateSimple(row, colId, m);
}

/**
 * A combined filter's condition list. Modern AG Grid sends `conditions`;
 * models persisted by older versions carry only `condition1` / `condition2`.
 * Both keep working — persisted user state always keeps loading.
 */
function conditionListOf(m: Condition): Condition[] | null {
  if (Array.isArray(m.conditions) && m.conditions.length > 0) {
    return m.conditions as Condition[];
  }
  const legacy = [m.condition1, m.condition2].filter(
    (c): c is Condition => c != null && typeof c === "object",
  );
  return legacy.length > 0 ? legacy : null;
}

/**
 * Whether the top-level model is an Advanced Filter tree rather than the
 * column map. The two are mutually exclusive in the request AG Grid builds,
 * and only the tree carries `filterType` (or `colId`) at its root — a column
 * map's own keys are column ids.
 */
function isAdvancedFilterModel(model: FilterModel): boolean {
  if (model.filterType === "join") return true;
  return typeof model.colId === "string" && typeof model.filterType === "string";
}

function evaluateAdvanced(row: Row | null, model: Condition): boolean {
  if (model.filterType === "join") {
    const conditions = Array.isArray(model.conditions)
      ? (model.conditions as unknown[])
      : [];
    const branches = conditions.filter((c) => c != null && typeof c === "object");
    if (branches.length === 0) return true;
    return combine(
      joinOf(model),
      branches.map((c) => evaluateAdvanced(row, c as Condition)),
    );
  }
  const colId = typeof model.colId === "string" ? model.colId : "";
  if (!colId) throw unsupportedShape("(no column)", model);
  return evaluateSimple(row, colId, model);
}

/**
 * Evaluate an AG Grid filterModel — column map or Advanced Filter tree —
 * against a row. Throws {@link UnsupportedQueryError} for input it cannot
 * evaluate; callers that scan should
 * {@link assertFilterModelSupported} first so the rejection is raised once,
 * before the scan, rather than on whichever row happens to reach the leaf.
 */
export function rowPassesFilter(
  row: Row,
  filterModel: FilterModel | null | undefined,
): boolean {
  if (!filterModel) return true;
  if (isAdvancedFilterModel(filterModel)) return evaluateAdvanced(row, filterModel);
  for (const [colId, model] of Object.entries(filterModel)) {
    if (!evaluateModel(row, colId, model)) return false;
  }
  return true;
}

/**
 * Reject a filter model this engine cannot evaluate, BEFORE any row is
 * scanned — so the answer never depends on which rows the store happens to
 * hold, and an empty store rejects exactly what a full one does.
 */
export function assertFilterModelSupported(
  filterModel: FilterModel | null | undefined,
): void {
  if (!filterModel) return;
  if (isAdvancedFilterModel(filterModel)) {
    evaluateAdvanced(null, filterModel);
    return;
  }
  for (const [colId, model] of Object.entries(filterModel)) {
    evaluateModel(null, colId, model);
  }
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
