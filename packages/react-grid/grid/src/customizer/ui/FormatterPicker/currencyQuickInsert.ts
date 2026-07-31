/**
 * Currency-symbol helpers for the FormatterPicker's quick-insert row.
 *
 * The picker offers a row of currency chips above the custom Excel
 * input. Clicking one swaps the symbol in the current format (or
 * seeds a default if the input is empty). Extracted from
 * FormatterPicker.tsx to keep the picker JSX focused on layout.
 */

/**
 * Currency symbols offered by the quick-insert row above the custom
 * input. Ordered by desk frequency. `symbol` is what actually lands
 * in the Excel format string — SSF only recognises `$` and `€` as
 * bare currency characters; every other glyph has to be wrapped in
 * a quoted string literal (`"£"`, `"¥"`, `"₹"`, `"CHF "`) so SSF
 * emits it verbatim without trying to interpret it as a format code.
 */
export const CURRENCY_QUICK_INSERT: ReadonlyArray<{
  label: string;
  symbol: string;
  aria: string;
}> = [
  { label: '$', symbol: '$', aria: 'US dollar' },
  { label: '€', symbol: '€', aria: 'Euro' },
  { label: '£', symbol: '"£"', aria: 'British pound' },
  { label: '¥', symbol: '"¥"', aria: 'Japanese yen' },
  { label: '₹', symbol: '"₹"', aria: 'Indian rupee' },
  { label: 'CHF', symbol: '"CHF "', aria: 'Swiss franc' },
];

/** Regex matching any currency symbol we know about, including quoted
 *  literal variants. The outer alternation tries the quoted forms
 *  first so e.g. `"£"` is consumed as a single token instead of the
 *  inner `£`. */
const CURRENCY_SYMBOL_RE = /("£"|"¥"|"₹"|"[A-Z]{3} ?"|[$€])/;

/**
 * Insert `symbol` into the current Excel format string. Behaviour:
 *   1. Contains a currency symbol we recognise → swap every occurrence.
 *      Excel two-section formats (positive;negative) carry the symbol
 *      in both sections; swapping both keeps the format consistent.
 *   2. Non-empty format, no symbol → prepend the symbol.
 *   3. Empty → seed `${symbol}#,##0.00` as a sensible default.
 *
 * Pure function so the popover's click handler stays short.
 */
export function applyCurrencySymbol(current: string, symbol: string): string {
  const trimmed = current.trim();
  if (!trimmed) return `${symbol}#,##0.00`;
  if (CURRENCY_SYMBOL_RE.test(trimmed)) {
    return trimmed.replace(new RegExp(CURRENCY_SYMBOL_RE.source, 'g'), symbol);
  }
  return `${symbol}${trimmed}`;
}
