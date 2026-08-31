import type { AdvancedFilterModel } from 'ag-grid-community';
import type { ColumnType, Filter, Scalar } from '@perspective-dev/client';
import type { PerspectiveSchema } from '../schema.js';
import { DerivedColumns, NULL_TAG, literal, numericOperand, quoteColumn } from './derived.js';

export type FilterPlan = {
  /** Native filter terms. Perspective joins these with AND. */
  filter: Filter[];
  /** Derived columns the terms above refer to. */
  expressions: Record<string, string>;
  /** The filter can match nothing at all; the query can be skipped entirely. */
  matchNothing: boolean;
  /** Conditions that could not be represented exactly, described for the log. */
  unsupported: string[];
};

type SimpleModel = {
  filterType?: string;
  type?: string | null;
  filter?: unknown;
  filterTo?: unknown;
  dateFrom?: string | null;
  dateTo?: string | null;
};

type AnyModel = SimpleModel & {
  operator?: 'AND' | 'OR';
  conditions?: SimpleModel[];
  values?: (string | null)[];
  filterModels?: (AnyModel | null)[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * AG Grid sends dates as `YYYY-MM-DD`, or `YYYY-MM-DD HH:mm:ss` when the filter
 * includes time. They describe a date as the user sees it, so they are read in
 * the local zone — the same zone the cells are formatted in.
 */
function parseAgDate(text: string | null | undefined): { ms: number; hasTime: boolean } | null {
  if (!text) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(text);
  if (!match) {
    const parsed = Date.parse(text);
    return Number.isNaN(parsed) ? null : { ms: parsed, hasTime: true };
  }

  const [, year, month, day, hour, minute, second] = match;
  const hasTime = hour !== undefined;
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour ?? 0),
    Number(minute ?? 0),
    Number(second ?? 0),
  );
  return { ms: date.getTime(), hasTime };
}

/** End of the local day containing `ms`, exclusive. */
function endOfDay(ms: number): number {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  return date.getTime() + DAY_MS;
}

function coerce(type: ColumnType, raw: unknown): Scalar | null {
  if (raw === null || raw === undefined || raw === '') return null;
  switch (type) {
    case 'boolean':
      return typeof raw === 'boolean' ? raw : String(raw).toLowerCase() === 'true';
    case 'float':
    case 'integer': {
      const num = Number(raw);
      return Number.isFinite(num) ? num : null;
    }
    case 'date':
    case 'datetime': {
      if (typeof raw === 'number') return raw;
      const text = String(raw);
      /*
       * A group key arrives back from AG Grid as a string, and for a datetime
       * column the value it stringified was epoch milliseconds. `parseAgDate`
       * only understands the `YYYY-MM-DD` form a filter sends, and `Date.parse`
       * rejects a bare millisecond string outright — so without this the key
       * became null, the filter became `== null`, and drilling into any date
       * group returned no rows at all.
       */
      if (/^-?\d+$/.test(text)) return Number(text);
      const parsed = parseAgDate(text);
      return parsed ? parsed.ms : null;
    }
    default:
      return String(raw);
  }
}

function isAdvancedModel(model: unknown): model is AdvancedFilterModel {
  if (!model || typeof model !== 'object') return false;
  const candidate = model as { filterType?: string; colId?: string };
  return candidate.filterType === 'join' || typeof candidate.colId === 'string';
}

/**
 * Escapes a value for use inside a Perspective `match` regex literal, or
 * returns null when the value contains a character no literal can carry.
 */
function regexLiteral(value: string): string | null {
  if (value.includes("'") || value.includes('$')) return null;
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

class FilterBuilder {
  private readonly derived = new DerivedColumns();
  private readonly filters: Filter[] = [];
  private readonly unsupported: string[] = [];
  private matchNothing = false;
  private conditionCount = 0;
  private readonly schema: PerspectiveSchema;

  constructor(schema: PerspectiveSchema) {
    this.schema = schema;
  }

  plan(): FilterPlan {
    return {
      filter: this.filters,
      expressions: this.derived.expressions,
      matchNothing: this.matchNothing,
      unsupported: this.unsupported,
    };
  }

  /**
   * Restricts a query to one group's rows, e.g. `['EMEA', 'Rates']`.
   *
   * A key that still has its original type is used as it is. Only a key that
   * has been through AG Grid as a string needs guessing at, and guessing is
   * lossy: the empty string, the text "null" and a real null are three
   * different groups in the data but only one of them once stringified.
   */
  addGroupPath(columns: string[], keys: readonly unknown[]): void {
    for (let i = 0; i < keys.length && i < columns.length; i++) {
      const column = columns[i];
      const type = this.schema[column];
      if (!type) continue;
      const key = keys[i];
      if (key === null || key === undefined) {
        this.filters.push([column, 'is null', null]);
        continue;
      }
      if (typeof key !== 'string') {
        this.filters.push([column, '==', key as Scalar]);
        continue;
      }
      /*
       * A string key on a string column is used verbatim, empty string
       * included. Folding `''` into `is null` used to send anyone who expanded
       * an empty-string group into the null group's rows instead — they are
       * different groups in the data, and only a real null means null.
       */
      if (type === 'string') {
        this.filters.push([column, '==', key]);
        continue;
      }
      const value = coerce(type, key);
      if (value === null) {
        this.unsupported.push(`${column} group key ${JSON.stringify(key)} (not a ${type})`);
        this.matchNothing = true;
        continue;
      }
      this.filters.push([column, '==', value]);
    }
  }

  addModel(model: unknown): void {
    if (!model) return;
    if (isAdvancedModel(model)) {
      const expression = this.advancedToExpression(model);
      if (expression === null) {
        this.unsupported.push('advanced filter');
        return;
      }
      this.addBooleanExpression(expression);
      return;
    }
    for (const [colId, columnModel] of Object.entries(model as Record<string, AnyModel>)) {
      this.addColumnModel(colId, columnModel);
    }
  }

  private addColumnModel(colId: string, model: AnyModel | null): void {
    if (!model) return;
    const type = this.schema[colId];
    if (!type) {
      this.unsupported.push(`${colId} (no such column in the Perspective table)`);
      return;
    }
    if (model.filterType === 'multi') {
      for (const sub of model.filterModels ?? []) this.addColumnModel(colId, sub);
      return;
    }
    if (model.filterType === 'set') {
      this.addSetFilter(colId, type, model.values ?? []);
      return;
    }
    if (Array.isArray(model.conditions)) {
      this.addCombined(colId, type, model.operator ?? 'AND', model.conditions);
      return;
    }
    const native = this.simpleToNative(colId, type, model);
    if (native) {
      this.filters.push(...native);
      return;
    }
    const expression = this.simpleToExpression(colId, type, model);
    if (expression === null) {
      this.unsupported.push(`${colId} ${model.type ?? ''}`.trim());
      return;
    }
    this.addBooleanExpression(expression);
  }

  private addCombined(
    colId: string,
    type: ColumnType,
    operator: 'AND' | 'OR',
    conditions: SimpleModel[],
  ): void {
    if (operator === 'AND') {
      // AND is what Perspective already does with the native term list, so each
      // condition can stay on the fast path independently.
      for (const condition of conditions) this.addColumnModel(colId, condition);
      return;
    }
    // Several `equals` OR'd together is a set membership test, which stays
    // native and so keeps working for values an expression could not quote.
    const allEquals = conditions.length > 0 && conditions.every((c) => c.type === 'equals');
    if (allEquals) {
      const values = conditions.map((condition) =>
        coerce(type, type === 'datetime' || type === 'date' ? condition.dateFrom : condition.filter),
      );
      if (!values.includes(null)) {
        this.filters.push([colId, 'in', values as Scalar[]]);
        return;
      }
    }
    const parts: string[] = [];
    for (const condition of conditions) {
      const expression = this.simpleToExpression(colId, type, condition);
      if (expression === null) {
        this.unsupported.push(`${colId} ${condition.type ?? ''} (OR condition)`.trim());
        return;
      }
      parts.push(`(${expression})`);
    }
    if (parts.length > 0) this.addBooleanExpression(parts.join(' or '));
  }

  private addSetFilter(colId: string, type: ColumnType, rawValues: (string | null)[]): void {
    if (rawValues.length === 0) {
      // Nothing ticked in the set filter, so the result is empty by definition.
      this.matchNothing = true;
      return;
    }
    const values: Scalar[] = [];
    let includesNull = false;
    for (const raw of rawValues) {
      const value = coerce(type, raw);
      if (value === null) includesNull = true;
      else values.push(value);
    }
    if (!includesNull) {
      this.filters.push([colId, 'in', values]);
      return;
    }
    if (values.length === 0) {
      this.filters.push([colId, 'is null', null]);
      return;
    }
    if (type === 'string') {
      // A string column can carry the sentinel in place of null, so blanks and
      // real values are matched by one native `in`.
      this.filters.push([this.derived.nullTagged(colId), 'in', [...values, NULL_TAG]]);
      return;
    }
    // Other column types cannot hold a string sentinel, but their literals are
    // numbers or booleans, which an expression can always quote.
    const operand = numericOperand(colId, type);
    const parts = values.map((value) => `(${operand} == ${literal(value, type)})`);
    this.addBooleanExpression(`is_null(${quoteColumn(colId)}) or ${parts.join(' or ')}`);
  }

  /**
   * Translates one condition into native filter terms, or returns null when it
   * needs the expression path. Text comparisons run against a case-folded
   * derived column, which matches AG Grid's case-insensitive default.
   */
  private simpleToNative(colId: string, type: ColumnType, model: SimpleModel): Filter[] | null {
    const kind = model.type;
    if (!kind || kind === 'empty') return [];
    if (kind === 'blank' || kind === 'notBlank') {
      if (type === 'string') {
        const blankness = this.derived.blankness(colId);
        return [[blankness, kind === 'blank' ? '==' : '>', 0]];
      }
      return [[colId, kind === 'blank' ? 'is null' : 'is not null', null]];
    }
    if (type === 'string') {
      const value = model.filter;
      if (typeof value !== 'string') return [];
      const lowered = this.derived.lower(colId);
      const operand = value.toLowerCase();
      switch (kind) {
        case 'equals':
          return [[lowered, '==', operand]];
        case 'notEqual':
          return [[lowered, '!=', operand]];
        case 'contains':
          return [[lowered, 'contains', operand]];
        case 'notContains':
          return [[lowered, 'not contains', operand]];
        case 'startsWith':
          return [[lowered, 'begins with', operand]];
        case 'endsWith':
          return [[lowered, 'ends with', operand]];
        default:
          return null;
      }
    }
    if (type === 'datetime' || type === 'date') {
      const from = parseAgDate(model.dateFrom);
      if (!from) return [];
      // A date with no time names a whole day, which is how AG Grid's own
      // comparator reads it. With a time it names an instant.
      if (from.hasTime) {
        switch (kind) {
          case 'equals':
            return [[colId, '==', from.ms]];
          case 'notEqual':
            return [[colId, '!=', from.ms]];
          case 'lessThan':
            return [[colId, '<', from.ms]];
          case 'lessThanOrEqual':
            return [[colId, '<=', from.ms]];
          case 'greaterThan':
            return [[colId, '>', from.ms]];
          case 'greaterThanOrEqual':
            return [[colId, '>=', from.ms]];
          case 'inRange': {
            const to = parseAgDate(model.dateTo);
            return to
              ? [
                  [colId, '>=', from.ms],
                  [colId, '<=', to.ms],
                ]
              : [];
          }
          default:
            return null;
        }
      }
      const dayEnd = endOfDay(from.ms);
      switch (kind) {
        case 'equals':
          return [
            [colId, '>=', from.ms],
            [colId, '<', dayEnd],
          ];
        case 'lessThan':
          return [[colId, '<', from.ms]];
        case 'lessThanOrEqual':
          return [[colId, '<', dayEnd]];
        case 'greaterThan':
          return [[colId, '>=', dayEnd]];
        case 'greaterThanOrEqual':
          return [[colId, '>=', from.ms]];
        case 'inRange': {
          const to = parseAgDate(model.dateTo);
          return to
            ? [
                [colId, '>=', from.ms],
                [colId, '<', endOfDay(to.ms)],
              ]
            : [];
        }
        // `notEqual` on a whole day means "before it or after it" — an OR, so
        // it has to go through an expression.
        default:
          return null;
      }
    }
    if (type === 'boolean') {
      const value = coerce(type, model.filter);
      if (value === null) return [];
      return [[colId, kind === 'notEqual' ? '!=' : '==', value]];
    }
    const value = coerce(type, model.filter);
    if (value === null) return [];
    switch (kind) {
      case 'equals':
        return [[colId, '==', value]];
      case 'notEqual':
        return [[colId, '!=', value]];
      case 'lessThan':
        return [[colId, '<', value]];
      case 'lessThanOrEqual':
        return [[colId, '<=', value]];
      case 'greaterThan':
        return [[colId, '>', value]];
      case 'greaterThanOrEqual':
        return [[colId, '>=', value]];
      case 'inRange': {
        const to = coerce(type, model.filterTo);
        if (to === null) return [];
        return [
          [colId, '>=', value],
          [colId, '<=', to],
        ];
      }
      default:
        return null;
    }
  }

  /** The expression form of one condition, used when it sits under an OR. */
  private simpleToExpression(colId: string, type: ColumnType, model: SimpleModel): string | null {
    const kind = model.type;
    if (!kind || kind === 'empty') return 'true';
    const quoted = quoteColumn(colId);
    if (kind === 'blank' || kind === 'notBlank') {
      const blank =
        type === 'string' ? `(is_null(${quoted}) or (length(${quoted}) == 0))` : `is_null(${quoted})`;
      return kind === 'blank' ? blank : `(${blank}) == false`;
    }
    if (type === 'string') {
      const value = model.filter;
      if (typeof value !== 'string') return 'true';
      const lowered = `lower(${quoted})`;
      const operand = literal(value.toLowerCase(), 'string');
      if (operand === null) return null;
      switch (kind) {
        case 'equals':
          return `${lowered} == ${operand}`;
        case 'notEqual':
          return `(${lowered} == ${operand}) == false`;
        case 'contains':
          return `contains(${lowered}, ${operand})`;
        case 'notContains':
          return `contains(${lowered}, ${operand}) == false`;
        case 'startsWith': {
          const pattern = regexLiteral(value.toLowerCase());
          return pattern === null ? null : `match(${lowered}, '^${pattern}')`;
        }
        case 'endsWith': {
          // `$` cannot appear in a Perspective string literal, so a regex
          // cannot anchor the end. Taking the last N characters and comparing
          // them does anchor it, and is null- and short-string-safe.
          const length = value.length;
          return `(length(${quoted}) >= ${length}) and (substring(${lowered}, length(${quoted}) - ${length}, ${length}) == ${operand})`;
        }
        default:
          return null;
      }
    }
    if (type === 'datetime' || type === 'date') {
      const from = parseAgDate(model.dateFrom);
      if (!from) return 'true';
      const start = literal(from.ms, type);
      const end = literal(from.hasTime ? from.ms : endOfDay(from.ms), type);
      switch (kind) {
        case 'equals':
          return from.hasTime
            ? `${quoted} == ${start}`
            : `(${quoted} >= ${start}) and (${quoted} < ${end})`;
        case 'notEqual':
          return from.hasTime
            ? `${quoted} != ${start}`
            : `(${quoted} < ${start}) or (${quoted} >= ${end})`;
        case 'lessThan':
          return `${quoted} < ${start}`;
        case 'lessThanOrEqual':
          return from.hasTime ? `${quoted} <= ${start}` : `${quoted} < ${end}`;
        case 'greaterThan':
          return from.hasTime ? `${quoted} > ${start}` : `${quoted} >= ${end}`;
        case 'greaterThanOrEqual':
          return `${quoted} >= ${start}`;
        case 'inRange': {
          const to = parseAgDate(model.dateTo);
          if (!to) return 'true';
          const upper = literal(to.hasTime ? to.ms : endOfDay(to.ms), type);
          const upperOp = to.hasTime ? '<=' : '<';
          return `(${quoted} >= ${start}) and (${quoted} ${upperOp} ${upper})`;
        }
        default:
          return null;
      }
    }
    if (type === 'boolean') {
      const value = coerce(type, model.filter);
      if (value === null) return 'true';
      return `${quoted} == ${value ? 'true' : 'false'}`;
    }
    const operand = numericOperand(colId, type);
    const value = coerce(type, model.filter);
    if (value === null) return 'true';
    const rendered = literal(value, type);
    if (rendered === null) return null;
    switch (kind) {
      case 'equals':
        return `${operand} == ${rendered}`;
      case 'notEqual':
        return `${operand} != ${rendered}`;
      case 'lessThan':
        return `${operand} < ${rendered}`;
      case 'lessThanOrEqual':
        return `${operand} <= ${rendered}`;
      case 'greaterThan':
        return `${operand} > ${rendered}`;
      case 'greaterThanOrEqual':
        return `${operand} >= ${rendered}`;
      case 'inRange': {
        const to = literal(coerce(type, model.filterTo), type);
        return to === null ? 'true' : `(${operand} >= ${rendered}) and (${operand} <= ${to})`;
      }
      default:
        return null;
    }
  }

  private advancedToExpression(model: AdvancedFilterModel): string | null {
    if (model.filterType === 'join') {
      const parts: string[] = [];
      for (const condition of model.conditions) {
        const expression = this.advancedToExpression(condition);
        if (expression === null) return null;
        parts.push(`(${expression})`);
      }
      if (parts.length === 0) return 'true';
      return parts.join(model.type === 'OR' ? ' or ' : ' and ');
    }
    const colId = model.colId;
    const type = this.schema[colId];
    if (!type) return null;
    if (model.filterType === 'boolean') {
      return `${quoteColumn(colId)} == ${model.type === 'true' ? 'true' : 'false'}`;
    }
    // The advanced filter reuses the column filters' option names, with the
    // value always in `filter` whatever the column type is.
    const value = (model as { filter?: unknown }).filter;
    const isDate =
      model.filterType === 'date' ||
      model.filterType === 'dateString' ||
      model.filterType === 'dateTime' ||
      model.filterType === 'dateTimeString';
    return this.simpleToExpression(colId, type, {
      type: model.type,
      filter: value,
      dateFrom: isDate ? ((value as string | undefined) ?? null) : null,
    });
  }

  private addBooleanExpression(expression: string): void {
    const name = `__psp_cond_${this.conditionCount++}`;
    this.derived.expressions[name] = expression;
    this.filters.push([name, '==', true]);
  }
}

/**
 * Turns a group key back into a value of the column's own type. AG Grid carries
 * group keys as strings whatever the column holds, and a group whose value is
 * null arrives as the empty string or the text "null".
 */
export function coerceGroupKey(
  schema: PerspectiveSchema,
  column: string,
  key: string | null,
): Scalar | null {
  const type = schema[column];
  if (!type) return key;
  if (key === null || key === '' || key === 'null' || key === 'undefined') return null;
  return coerce(type, key);
}

export { FilterBuilder };

export function createFilterBuilder(schema: PerspectiveSchema): FilterBuilder {
  return new FilterBuilder(schema);
}

export function buildFilterPlan(model: unknown, schema: PerspectiveSchema): FilterPlan {
  const builder = new FilterBuilder(schema);
  builder.addModel(model);
  return builder.plan();
}
