import type { ColumnType } from '@perspective-dev/client';

/** Sentinel a null takes on inside a string-typed derived column, so `in` can match it. */
export const NULL_TAG = '__PSP_NULL__';

/*
 * Perspective expressions cannot escape a `'` or a `$` inside a string literal —
 * `\x27` is resolved by the tokeniser and closes the literal early — so any
 * expression carrying a user-supplied value is restricted to values without
 * them. Derived columns exist to keep that restriction off the common path:
 * each one is a pure transform of a single column with no literal in it, and
 * the user's value then travels as the operand of a *native* filter, which has
 * no such restriction.
 */
export class DerivedColumns {
  private readonly byKey = new Map<string, string>();
  readonly expressions: Record<string, string> = {};

  private define(key: string, prefix: string, body: (quoted: string) => string, column: string): string {
    const existing = this.byKey.get(key);
    if (existing) return existing;
    const name = `__psp_${prefix}_${this.byKey.size}`;
    this.byKey.set(key, name);
    this.expressions[name] = body(quoteColumn(column));
    return name;
  }

  /** Case-folded copy of a string column, so text matching can be case-insensitive. */
  lower(column: string): string {
    return this.define(`lower:${column}`, 'lower', (c) => `lower(${c})`, column);
  }

  /**
   * Length of a string column with null folded to 0, so AG Grid's `blank` —
   * which means null *or* empty — is a single native comparison.
   */
  blankness(column: string): string {
    return this.define(
      `blank:${column}`,
      'blank',
      (c) => `if (is_null(${c})) { 0 } else { length(${c}) }`,
      column,
    );
  }

  /**
   * A string column with null replaced by a sentinel. Perspective's `in` never
   * matches null, so a set filter that includes (Blanks) matches the sentinel
   * instead of needing an OR.
   */
  nullTagged(column: string): string {
    return this.define(
      `nulltag:${column}`,
      'nulltag',
      (c) => `if (is_null(${c})) { '${NULL_TAG}' } else { ${c} }`,
      column,
    );
  }
}

export function quoteColumn(column: string): string {
  return `"${column}"`;
}

/**
 * Renders a value as an expression literal, or returns null when Perspective
 * cannot represent it — the caller then reports the condition as unsupported
 * rather than quietly widening the result.
 */
export function literal(value: unknown, type: ColumnType): string | null {
  if (value === null || value === undefined) return null;
  switch (type) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'float':
    case 'integer': {
      const num = Number(value);
      return Number.isFinite(num) ? String(num) : null;
    }
    case 'date':
    case 'datetime': {
      const num = Number(value);
      return Number.isFinite(num) ? `datetime(${num})` : null;
    }
    default: {
      const text = String(value);
      if (text.includes("'") || text.includes('$')) return null;
      return `'${text}'`;
    }
  }
}

/**
 * Numbers stored as `integer` compare as false against every operand inside an
 * expression, so they are widened to float first. Native filters are unaffected.
 */
export function numericOperand(column: string, type: ColumnType): string {
  return type === 'integer' ? `float(${quoteColumn(column)})` : quoteColumn(column);
}
