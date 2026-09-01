/**
 * Display formatting for analysis output — result tables, chart tooltips and
 * the computed commentary.
 *
 * These numbers used to go through `compactNumber`, which is right for a
 * cramped axis tick and wrong everywhere else: a bond price of 101.5625 came
 * out as `101.56` (losing the precision the price is quoted in), a DV01 of
 * 1234.5 came out as `1234.5` with no thousands separator, and a P&L of
 * -98765.4 lost both its sign convention and its units. Read down a column of
 * those and you cannot compare two rows at a glance, which is the whole job.
 *
 * Rather than invent a second formatting vocabulary, this reuses the SAME
 * catalogue the grid's Auto Format uses (`matchFieldToCatalog` →
 * `valueFormatterFromTemplate`). A `marketValue` in an analysis table then
 * reads exactly like the `marketValue` column on the blotter behind it —
 * which is the only way the two can be compared without translating in your
 * head.
 */
import { matchFieldToCatalog, valueFormatterFromTemplate } from '@wellsfargo-starui/core';
import type { ValueFormatterTemplate } from '@wellsfargo-starui/core';

/** Cheap: the catalogue match + formatter build are pure and keyed by colId. */
const cache = new Map<string, ((params: { value: unknown }) => string) | null>();

/**
 * A grouped result names its measures `sum_marketValue`, `avg_dv01` and so
 * on. The aggregate of a column should read like that column, so the prefix
 * is stripped before matching — otherwise the catalogue matches the alias
 * fuzzily and picks something unrelated.
 *
 * `count_` is deliberately NOT stripped: a count is a plain integer whatever
 * the counted column is, and inheriting (say) a currency format for it would
 * be actively wrong.
 */
const AGG_PREFIX = /^(sum|avg|mean|min|max|median|first|last)_/;

function baseColumn(colId: string): string | null {
  if (/^count_/.test(colId)) return null; // counts stay plain integers
  return colId.replace(AGG_PREFIX, '');
}

/**
 * A scaling format ("#,##0.0,\"K\"") assumes the column holds large numbers.
 * Applied to a small aggregate it produces `0.7K` for 700 — technically
 * consistent with the blotter, and strictly harder to read than `700`, which
 * is the opposite of the point. Detected on the OUTPUT rather than by parsing
 * format strings: anything that scaled to below one whole unit is rejected.
 */
const SCALED_BELOW_ONE = /^-?0\.\d+\s*[KMB]\b/;

/**
 * A format with too few decimals turns a small non-zero value into `0.00`.
 * On a trading desk that is not merely ugly — it reports a live number as
 * nothing. Any output whose digits are all zero for a value that isn't is
 * rejected in favour of one that shows what is actually there.
 */
function collapsesToZero(out: string, value: number): boolean {
  return value !== 0 && !/[1-9]/.test(out);
}

function isDateTemplate(t: ValueFormatterTemplate | undefined): boolean {
  return t?.kind === 'preset' && (t.preset === 'date' || t.preset === 'datetime');
}

/**
 * The catalogue matches on the column's NAME, which misfires on names that
 * merely contain a date word: `yieldToMaturity` and `timeToMaturity` are
 * numbers, but both match the `maturity` → date entry and would render a
 * yield of 4.3271 as "Jan 1, 1970". Rendering a number as a 1970 date is
 * strictly worse than not formatting it, so a date template is refused for a
 * numeric value and the generic numeric path takes over.
 */
function formatterFor(colId: string): ((params: { value: unknown }) => string) | null {
  if (cache.has(colId)) return cache.get(colId)!;
  let fn: ((params: { value: unknown }) => string) | null = null;
  try {
    const base = baseColumn(colId);
    const template = base ? matchFieldToCatalog(base, undefined, 'number')?.valueFormatterTemplate : undefined;
    if (template && !isDateTemplate(template)) {
      fn = valueFormatterFromTemplate(template) as (params: { value: unknown }) => string;
    }
  } catch {
    fn = null;
  }
  cache.set(colId, fn);
  return fn;
}

/**
 * Thousands-separated, used when the column name tells us nothing.
 *
 * Decimals follow the VALUE's own shape rather than its magnitude: a whole
 * number stays whole (700, not 700.00) and a fraction keeps two places — so
 * two rows of the same column line up instead of one showing `700.00` beside
 * another showing `1,500`. Sub-unit values keep four places, where the
 * decimals are the whole content (a 0.0042 rate).
 */
export function formatNumberFallback(value: number): string {
  const decimals = Number.isInteger(value) ? 0 : Math.abs(value) < 1 ? 4 : 2;
  return value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/**
 * Full display form — result-table cells, chart tooltips, commentary. Uses
 * the column's own format where the catalogue knows it, so the value matches
 * how the blotter renders the same field.
 */
export function formatValue(colId: string, value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'number' || !Number.isFinite(value)) return String(value);

  const fn = formatterFor(colId);
  if (fn) {
    try {
      const out = fn({ value });
      if (
        typeof out === 'string' &&
        out.length > 0 &&
        !SCALED_BELOW_ONE.test(out) &&
        !collapsesToZero(out, value)
      ) {
        return out;
      }
    } catch {
      /* fall through to the generic path */
    }
  }
  return formatNumberFallback(value);
}

/**
 * Short form for axis ticks, where there is room for about six characters and
 * a long exact number is worse than a rounded one. Deliberately NOT used for
 * table cells or commentary.
 */
export function formatCompact(value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return String(value ?? '');
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000) return `${(value / 1_000).toFixed(1)}K`;
  if (Number.isInteger(value)) return value.toLocaleString('en-US');
  return String(Math.round(value * 100) / 100);
}
