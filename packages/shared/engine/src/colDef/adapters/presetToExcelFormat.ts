import type { ValueFormatterTemplate } from '../types';

/**
 * Best-effort mapping from a `ValueFormatterTemplate` to its equivalent Excel
 * format string. Used by the FormattingToolbar's text input to show the user
 * "what would the Excel equivalent be" when a preset is currently applied,
 * so clicking into the input gives them a sensible starting point instead
 * of a blank box.
 *
 * NOT a bijection:
 *   - `kind: 'excelFormat'` → returns its own format (identity).
 *   - `kind: 'preset'`      → returns the Excel-string approximation.
 *   - `kind: 'expression'`  → returns '' (no sensible equivalent; expressions
 *                             are arbitrary JS and can't be represented as
 *                             a format string).
 *   - No template           → returns ''.
 *
 * Currency maps to the common Excel pattern with negatives in parentheses
 * (e.g. `$#,##0.00;($#,##0.00)`) which reads more naturally than a bare
 * `$0.00` and matches what Excel emits when you pick Accounting in its
 * format dialog.
 */
export function presetToExcelFormat(t: ValueFormatterTemplate | undefined): string {
  if (!t) return '';
  if (t.kind === 'excelFormat') return t.format;
  if (t.kind === 'expression') return '';
  if (t.kind !== 'preset') return '';

  const opts = (t.options ?? {}) as Record<string, unknown>;
  const decimalsRaw = typeof opts.decimals === 'number' ? opts.decimals : undefined;
  const decimals = Math.max(0, Math.min(10, decimalsRaw ?? defaultDecimalsFor(t.preset)));
  const dot = decimals > 0 ? '.' + '0'.repeat(decimals) : '';
  const thousands = opts.thousands !== false;
  const groupedBody = thousands ? `#,##0${dot}` : `0${dot}`;

  switch (t.preset) {
    case 'currency': {
      const code = String(opts.currency ?? 'USD').toUpperCase();
      const sign =
        code === 'USD' ? '$' :
        code === 'EUR' ? '€' :
        code === 'GBP' ? '£' :
        code === 'JPY' ? '¥' : '';
      // Standard Excel currency with parens-for-negative.
      return `${sign}#,##0${dot};(${sign}#,##0${dot})`;
    }
    case 'percent':
      return `0${dot}%`;
    case 'number':
      return groupedBody;
    case 'date':
      return 'yyyy-mm-dd';
    case 'datetime':
      return 'yyyy-mm-dd hh:mm:ss';
    case 'duration':
      return '[hh]:mm:ss';
    default:
      return '';
  }
}

function defaultDecimalsFor(preset: string): number {
  // Match the adapter's preset defaults so the displayed Excel string matches
  // what the preset actually renders. Currency defaults to 2, percent to 0,
  // number to 0 — see valueFormatterFromTemplate.ts.
  if (preset === 'currency') return 2;
  return 0;
}
