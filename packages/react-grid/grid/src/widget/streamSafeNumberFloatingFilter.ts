import type { IFloatingFilterComp } from 'ag-grid-community';
import { BaseStreamSafeFilter } from './streamSafeFloatingFilterBase';

/**
 * Stream-safe NUMBER floating filter — typeable input with parser
 * support for the syntax users actually want when filtering numeric
 * columns. Pairs with `streamSafeText` (its sibling for text/string
 * columns) and shares the same DOM scaffolding, focus-aware skip,
 * clear button, and column-level mounting strategy.
 *
 * **Supported input syntax:**
 *
 * | Input              | Meaning                                          |
 * |--------------------|--------------------------------------------------|
 * | `100`              | equals 100                                       |
 * | `=100`             | equals 100 (explicit)                            |
 * | `>100`             | greater than 100                                 |
 * | `>=100`            | greater than or equal to 100                     |
 * | `<100`             | less than 100                                    |
 * | `<=100`            | less than or equal to 100                        |
 * | `100-150`          | between 100 and 150 (inclusive — AG-Grid inRange) |
 * | `>100 and <150`    | both conditions (compound AND)                   |
 * | `=100 or =150`     | either condition (compound OR)                   |
 * | `1,34,66,77`       | equals any (set sub-filter values when present,  |
 * |                    | else compound OR of equals)                      |
 * | `>100, <0`         | OR of two conditions (comma = OR shorthand)      |
 * | `(blank)`          | clear filter                                     |
 *
 * **Routing.** Bare-number CSV (no operators) routes to the set
 * sub-filter when the column is `agMultiColumnFilter` with a set
 * sub-filter (cleaner popup — checkbox list rather than N OR'd
 * compound conditions). Everything else uses AG-Grid's number filter
 * compound shape on the number sub-filter slot.
 *
 * **Streaming clobber defense.** Same as streamSafeText: skip
 * `onParentModelChanged` writes while the input has focus. AG-Grid's
 * set sub-filter `syncAfterDataChange` cascade still fires on every
 * `applyTransactionAsync` tick, but our floating filter ignores
 * mid-typing model writes.
 *
 * Registered as `streamSafeNumber` in `gridOptions.components`.
 * Auto-applied at the column level when the user picks the
 * `streamSafeMultiNumberColumnFilter` kind in column-customization.
 */
export class StreamSafeNumberFloatingFilter extends BaseStreamSafeFilter implements IFloatingFilterComp {
  protected placeholder(): string {
    return '>100, 1,2,3, 100-150, >0 and <50';
  }

  protected trackLastTyped(): boolean {
    return true;
  }

  /**
   * Parse the user's input and route it to the right sub-filter slot.
   * Bare-number CSV → set sub-filter (when present). Everything else
   * → number sub-filter with single or compound model.
   */
  protected applyValue(rawValue: string): void {
    const trimmed = rawValue.trim();
    const ctx = this.getColumnContext();
    const numIdx = ctx.primaryIdx('agNumberColumnFilter', 'agTextColumnFilter');

    // Empty → clear
    if (trimmed === '') {
      if (ctx.isInsideMulti) {
        this.pushColumnModel(ctx.colId, this.buildMultiEnvelope(ctx.subFilters, {}));
      } else {
        this.pushStandaloneClear();
      }
      return;
    }

    // Bare-number CSV detection — no operators, no and/or, just numbers
    // with commas. Route to set sub-filter if available.
    const isBareNumberCsv =
      trimmed.includes(',') &&
      !/[<>=-]/.test(trimmed.replace(/(?<=\d)-(?=\d)/g, '')) && // strip range hyphens before testing
      !/\b(and|or)\b/i.test(trimmed);
    // Re-test more precisely: every comma-token is a plain finite number
    if (isBareNumberCsv) {
      const tokens = trimmed.split(',').map((t) => t.trim()).filter((t) => t !== '');
      const numbers = tokens
        .map((t) => Number(t))
        .filter((n) => Number.isFinite(n));
      if (numbers.length === 0) {
        // Fall through to parser-based route
      } else if (numbers.length === tokens.length && ctx.isInsideMulti && ctx.setIdx >= 0) {
        // All tokens parse, set sub-filter available → set values path
        const setModel = { filterType: 'set', values: numbers.map((n) => String(n)) };
        this.pushColumnModel(
          ctx.colId,
          this.buildMultiEnvelope(ctx.subFilters, { [ctx.setIdx]: setModel }),
        );
        return;
      } else if (numbers.length === tokens.length) {
        // All tokens parse, no set sub-filter → compound OR equals
        const conditions = numbers.map((n) => ({
          filterType: 'number' as const,
          type: 'equals' as const,
          filter: n,
        }));
        const compound = { filterType: 'number', operator: 'OR', conditions };
        if (ctx.isInsideMulti && numIdx >= 0) {
          this.pushColumnModel(
            ctx.colId,
            this.buildMultiEnvelope(ctx.subFilters, { [numIdx]: compound }),
          );
        } else {
          this.pushColumnModel(ctx.colId, compound);
        }
        return;
      }
      // Else: some tokens didn't parse as bare numbers — fall through
      // to the operator parser (handles `>100, <0` style inputs).
    }

    // Parse the expression as a number filter model
    const model = parseNumberExpression(trimmed);
    if (model == null) {
      // Couldn't parse — leave the previous filter in place. Don't
      // emit anything (avoids clearing on transient typo). Future:
      // surface a non-blocking parse-error indicator.
      return;
    }

    if (ctx.isInsideMulti) {
      const targetIdx = numIdx >= 0 ? numIdx : 0;
      this.pushColumnModel(
        ctx.colId,
        this.buildMultiEnvelope(ctx.subFilters, { [targetIdx]: model }),
      );
    } else {
      this.pushColumnModel(ctx.colId, model);
    }
  }

  protected stringifyModel(model: unknown): string {
    return stringifyNumberModel(model);
  }
}

// ─── Parser ──────────────────────────────────────────────────────────────────

interface NumberSingleModel {
  filterType: 'number';
  type: 'equals' | 'notEqual' | 'greaterThan' | 'greaterThanOrEqual' | 'lessThan' | 'lessThanOrEqual' | 'inRange';
  filter: number;
  filterTo?: number;
}

interface NumberCompoundModel {
  filterType: 'number';
  operator: 'AND' | 'OR';
  conditions: NumberSingleModel[];
}

type NumberModel = NumberSingleModel | NumberCompoundModel;

const COMPARATOR_MAP: Record<string, NumberSingleModel['type']> = {
  '>=': 'greaterThanOrEqual',
  '<=': 'lessThanOrEqual',
  '>': 'greaterThan',
  '<': 'lessThan',
  '=': 'equals',
  '!=': 'notEqual',
  '<>': 'notEqual',
};

/**
 * Parse a single condition fragment into an AG-Grid number filter
 * model entry. Returns null if the fragment is empty or unparseable.
 *
 * Supported shapes (whitespace tolerant):
 *   - `>=100` / `<=100` / `>100` / `<100` / `=100` / `!=100` / `<>100`
 *   - `100-150` (inclusive range; first number must not have a sign
 *     prefix when there's also a leading sign elsewhere — `-100-50`
 *     is treated as range from -100 to 50, which is the intuitive read)
 *   - `100` (bare number → equals 100)
 *
 * Edge cases:
 *   - Negative numbers: `>-100` → greater than -100
 *   - Decimal numbers: `>=99.5` → ok
 *   - Whitespace around operators is tolerated: `>= 100` → ok
 */
function parseSingleCondition(s: string): NumberSingleModel | null {
  const t = s.trim();
  if (!t) return null;

  // Range: prefer this match BEFORE comparator matching so `100-150`
  // doesn't get mistaken for "less than 0 minus 150" or similar.
  // Match: optional leading minus, digits[.digits], hyphen, optional
  // leading minus, digits[.digits].
  const rangeMatch = /^(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)$/.exec(t);
  if (rangeMatch) {
    const a = Number(rangeMatch[1]);
    const b = Number(rangeMatch[2]);
    if (Number.isFinite(a) && Number.isFinite(b)) {
      return { filterType: 'number', type: 'inRange', filter: a, filterTo: b };
    }
  }

  // Comparator + number. Order matters — `>=` and `<=` and `<>` must
  // be tested before `>` `<` `=`.
  for (const [op, mapped] of [
    ['>=', COMPARATOR_MAP['>=']] as const,
    ['<=', COMPARATOR_MAP['<=']] as const,
    ['<>', COMPARATOR_MAP['<>']] as const,
    ['!=', COMPARATOR_MAP['!=']] as const,
    ['>',  COMPARATOR_MAP['>']]  as const,
    ['<',  COMPARATOR_MAP['<']]  as const,
    ['=',  COMPARATOR_MAP['=']]  as const,
  ]) {
    if (t.startsWith(op)) {
      const rhs = t.slice(op.length).trim();
      const n = Number(rhs);
      if (Number.isFinite(n)) {
        return { filterType: 'number', type: mapped, filter: n };
      }
      return null;
    }
  }

  // Bare number → equals
  const bare = Number(t);
  if (Number.isFinite(bare)) {
    return { filterType: 'number', type: 'equals', filter: bare };
  }
  return null;
}

/**
 * Parse a full number-filter expression. Returns the AG-Grid model
 * (single or compound) or null if the input didn't yield a valid
 * filter.
 *
 * Mixed `and` + `or` combinators in one expression aren't supported —
 * AG-Grid's compound filter shape uses a single operator across all
 * conditions, and inferring user precedence from a mix is brittle.
 * Mixed input falls back to single-best-effort parse on the first
 * fragment so the user gets *something* applied while they edit.
 */
function parseNumberExpression(input: string): NumberModel | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const lower = trimmed.toLowerCase();
  const hasAnd = /\band\b/.test(lower);
  const hasOr = /\bor\b/.test(lower);

  // Mixed and/or — bail to the first parseable fragment.
  if (hasAnd && hasOr) {
    const parts = trimmed.split(/\s+(?:and|or)\s+/i);
    for (const p of parts) {
      const single = parseSingleCondition(p);
      if (single) return single;
    }
    return null;
  }

  if (hasAnd || hasOr) {
    const splitter = hasAnd ? /\s+and\s+/i : /\s+or\s+/i;
    const op = hasAnd ? 'AND' : 'OR';
    const parts = trimmed.split(splitter);
    const conditions = parts
      .map((p) => parseSingleCondition(p))
      .filter((c): c is NumberSingleModel => c != null);
    if (conditions.length === 0) return null;
    if (conditions.length === 1) return conditions[0];
    return { filterType: 'number', operator: op as 'AND' | 'OR', conditions };
  }

  // Comma → OR shorthand for compound conditions
  if (trimmed.includes(',')) {
    const parts = trimmed.split(',').map((p) => p.trim()).filter((p) => p !== '');
    const conditions = parts
      .map((p) => parseSingleCondition(p))
      .filter((c): c is NumberSingleModel => c != null);
    if (conditions.length === 0) return null;
    if (conditions.length === 1) return conditions[0];
    return { filterType: 'number', operator: 'OR', conditions };
  }

  return parseSingleCondition(trimmed);
}

/**
 * Reverse-engineer a friendly string from an applied number filter
 * model. Only used as a fallback when the user hasn't typed anything
 * recently (e.g. model was set from the popup) — the typed-input
 * round-trip preserves the original string in `lastTyped`.
 */
function stringifyNumberModel(model: unknown): string {
  if (model == null) return '';
  const m = model as Partial<NumberSingleModel & NumberCompoundModel>;
  // Multi-filter envelope walk
  if ((model as { filterType?: string }).filterType === 'multi') {
    const envelope = model as { filterModels?: unknown[] };
    for (const sub of envelope.filterModels ?? []) {
      if (!sub) continue;
      const s = stringifyNumberModel(sub);
      if (s) return s;
    }
    return '';
  }
  // Set sub-filter values
  if ((model as { filterType?: string; values?: unknown[] }).filterType === 'set') {
    const values = (model as { values?: unknown[] }).values;
    return Array.isArray(values) ? values.join(', ') : '';
  }
  // Compound number
  if (Array.isArray(m.conditions) && m.conditions.length > 0) {
    const sep = m.operator === 'AND' ? ' and ' : ', ';
    return m.conditions.map((c) => stringifySingle(c)).join(sep);
  }
  return stringifySingle(m as NumberSingleModel);
}

function stringifySingle(m: NumberSingleModel): string {
  if (!m || typeof m.filter !== 'number') return '';
  switch (m.type) {
    case 'greaterThan':         return `>${m.filter}`;
    case 'greaterThanOrEqual':  return `>=${m.filter}`;
    case 'lessThan':            return `<${m.filter}`;
    case 'lessThanOrEqual':     return `<=${m.filter}`;
    case 'equals':              return String(m.filter);
    case 'notEqual':            return `!=${m.filter}`;
    case 'inRange':             return `${m.filter}-${m.filterTo ?? ''}`;
    default:                    return String(m.filter);
  }
}
