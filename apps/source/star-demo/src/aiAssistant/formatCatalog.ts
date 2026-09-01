/**
 * The value-format catalogue — every pre-canned format the formatter toolbar's
 * picker offers, so the model applies a named, tested format instead of
 * inventing an Excel format string.
 *
 * MIRRORED for the same reason as `cellRenderers.ts` and
 * `generalSettingsCatalog.ts`: the real declaration lives in the grid
 * package's FormatterPicker UI. `formatCatalog.test.ts` asserts this list
 * matches it exactly.
 *
 * The four template kinds, and why the choice matters:
 *   - `excelFormat` — an Excel format string. CSP-safe. The default choice.
 *   - `preset`      — Intl-backed (currency/percent/number/date/…). CSP-safe.
 *   - `tick`        — 32nds/64ths/128ths/256ths bond pricing.
 *   - `expression`  — evaluated with `new Function`, so it is NOT CSP-safe and
 *                     degrades to an identity formatter under a strict policy.
 *                     Prefer any of the other three.
 */

export interface FormatPreset {
  /** Stable id — what `set_column_style.formatPreset` and the picker use. */
  id: string;
  category: string;
  label: string;
  /** Sample output, so the model can show the user what they'll get. */
  hint?: string;
  template: unknown;
}

export const FORMAT_PRESETS: readonly FormatPreset[] = [
  { id: 'num-integer', category: 'number', label: 'Integer', hint: '1,235', template: {"kind":"excelFormat","format":"#,##0"} },
  { id: 'num-2dp', category: 'number', label: '2 decimals', hint: '1,234.57', template: {"kind":"excelFormat","format":"#,##0.00"} },
  { id: 'num-4dp', category: 'number', label: '4 decimals', hint: '1,234.5678', template: {"kind":"excelFormat","format":"#,##0.0000"} },
  { id: 'num-no-thousands', category: 'number', label: 'No thousands', hint: '1234.57', template: {"kind":"excelFormat","format":"0.00"} },
  { id: 'num-scientific', category: 'number', label: 'Scientific', hint: '1.23E+03', template: {"kind":"excelFormat","format":"0.00E+00"} },
  { id: 'num-bps', category: 'number', label: 'Basis points', hint: '+12.3 bps', template: {"kind":"expression","expression":"(x>=0?'+':'')+x.toFixed(1)+' bp'"} },
  { id: 'num-neg-parens', category: 'negatives', label: 'Parens negative', hint: '(1,234.57)', template: {"kind":"excelFormat","format":"#,##0.00;(#,##0.00)"} },
  { id: 'num-neg-red-parens', category: 'negatives', label: 'Red parens neg', hint: '[Red](1,234.57)', template: {"kind":"excelFormat","format":"#,##0.00;[Red](#,##0.00)"} },
  { id: 'num-neg-red-only', category: 'negatives', label: 'Red negative', hint: '[Red]1,234.57', template: {"kind":"excelFormat","format":"#,##0.00;[Red]#,##0.00"} },
  { id: 'num-green-red-nosign', category: 'negatives', label: 'Green / Red (no sign)', hint: '[Green]1,234.57 · [Red]1,234.57', template: {"kind":"excelFormat","format":"[Green]#,##0.00;[Red]#,##0.00"} },
  { id: 'num-green-red-usd', category: 'negatives', label: 'Green / Red $ (no sign)', hint: '[Green]$1,234.57 · [Red]$1,234.57', template: {"kind":"excelFormat","format":"[Green]$#,##0.00;[Red]$#,##0.00"} },
  { id: 'num-cond-arrows', category: 'conditional', label: 'Green up / red down', hint: '▲ green · ▼ red', template: {"kind":"excelFormat","format":"[>0][Green]▲0.00;[<0][Red]▼0.00;0.00"} },
  { id: 'num-cond-thresholds', category: 'conditional', label: 'Thresholds (100)', hint: 'red >100 · green ≤100', template: {"kind":"excelFormat","format":"[>100][Red]0;[<=100][Green]0;0"} },
  { id: 'tick-32', category: 'tick', label: '32nds (bond price)', hint: '101-16', template: {"kind":"tick","tick":"TICK32"} },
  { id: 'tick-32-plus', category: 'tick', label: '32nds + halves', hint: '101-16+', template: {"kind":"tick","tick":"TICK32_PLUS"} },
  { id: 'tick-64', category: 'tick', label: '64ths', hint: '101-161', template: {"kind":"tick","tick":"TICK64"} },
  { id: 'tick-128', category: 'tick', label: '128ths', hint: '101-162', template: {"kind":"tick","tick":"TICK128"} },
  { id: 'tick-256', category: 'tick', label: '256ths', hint: '101-161', template: {"kind":"tick","tick":"TICK256"} },
  { id: 'cur-usd', category: 'currency', label: 'USD', hint: '$1,234.56', template: {"kind":"excelFormat","format":"$#,##0.00"} },
  { id: 'cur-usd-red-neg', category: 'currency', label: 'USD red negative', hint: '[Red]-$1,234.56', template: {"kind":"excelFormat","format":"$#,##0.00;[Red]-$#,##0.00"} },
  { id: 'cur-usd-parens', category: 'currency', label: 'USD parens neg', hint: '($1,234.56)', template: {"kind":"excelFormat","format":"$#,##0.00;($#,##0.00)"} },
  { id: 'cur-usd-green-red-nosign', category: 'currency', label: 'USD Green / Red (no sign)', hint: '[Green]$1,234.57 · [Red]$1,234.57', template: {"kind":"excelFormat","format":"[Green]$#,##0.00;[Red]$#,##0.00"} },
  { id: 'cur-eur', category: 'currency', label: 'EUR', hint: '€1,234.56', template: {"kind":"excelFormat","format":"€#,##0.00"} },
  { id: 'cur-gbp', category: 'currency', label: 'GBP', hint: '£1,234.56', template: {"kind":"excelFormat","format":"\"£\"#,##0.00"} },
  { id: 'cur-jpy', category: 'currency', label: 'JPY', hint: '¥1,235', template: {"kind":"excelFormat","format":"\"¥\"#,##0"} },
  { id: 'cur-inr', category: 'currency', label: 'INR', hint: '₹1,234.56', template: {"kind":"excelFormat","format":"\"₹\"#,##0.00"} },
  { id: 'cur-eur-green-red-nosign', category: 'currency', label: 'EUR Green / Red (no sign)', hint: '[Green]€1,234.57 · [Red]€1,234.57', template: {"kind":"excelFormat","format":"[Green]€#,##0.00;[Red]€#,##0.00"} },
  { id: 'cur-gbp-green-red-nosign', category: 'currency', label: 'GBP Green / Red (no sign)', hint: '[Green]£1,234.57 · [Red]£1,234.57', template: {"kind":"excelFormat","format":"[Green]\"£\"#,##0.00;[Red]\"£\"#,##0.00"} },
  { id: 'cur-jpy-green-red-nosign', category: 'currency', label: 'JPY Green / Red (no sign)', hint: '[Green]¥1,235 · [Red]¥1,235', template: {"kind":"excelFormat","format":"[Green]\"¥\"#,##0;[Red]\"¥\"#,##0"} },
  { id: 'cur-inr-green-red-nosign', category: 'currency', label: 'INR Green / Red (no sign)', hint: '[Green]₹1,234.57 · [Red]₹1,234.57', template: {"kind":"excelFormat","format":"[Green]\"₹\"#,##0.00;[Red]\"₹\"#,##0.00"} },
  { id: 'pct-0', category: 'percent', label: 'Percent (0dp)', hint: '12%', template: {"kind":"excelFormat","format":"0%"} },
  { id: 'pct-2', category: 'percent', label: 'Percent (2dp)', hint: '12.34%', template: {"kind":"excelFormat","format":"0.00%"} },
  { id: 'pct-bps', category: 'percent', label: 'Basis points', hint: '+12.3 bps', template: {"kind":"expression","expression":"(x>=0?'+':'')+x.toFixed(1)+' bp'"} },
  { id: 'date-iso', category: 'date', label: 'ISO (yyyy-mm-dd)', hint: '2026-04-17', template: {"kind":"excelFormat","format":"yyyy-mm-dd"} },
  { id: 'date-us', category: 'date', label: 'US (mm/dd/yyyy)', hint: '04/17/2026', template: {"kind":"excelFormat","format":"mm/dd/yyyy"} },
  { id: 'date-eu', category: 'date', label: 'EU (dd-mmm-yy)', hint: '17-Apr-26', template: {"kind":"excelFormat","format":"dd-mmm-yy"} },
  { id: 'date-long', category: 'date', label: 'Long', hint: '17 April 2026', template: {"kind":"excelFormat","format":"dd mmmm yyyy"} },
  { id: 'dt-iso', category: 'date', label: 'ISO with time', hint: '2026-04-17 09:30:00', template: {"kind":"excelFormat","format":"yyyy-mm-dd hh:mm:ss"} },
  { id: 'dt-us-short', category: 'date', label: 'US short', hint: '04/17/26 9:30 AM', template: {"kind":"excelFormat","format":"mm/dd/yy h:mm AM/PM"} },
  { id: 'str-default', category: 'text', label: 'Default (pass-through)', hint: 'value as-is', template: {"kind":"excelFormat","format":"@"} },
  { id: 'str-upper', category: 'text', label: 'UPPERCASE', hint: 'ABC', template: {"kind":"expression","expression":"String(x).toUpperCase()"} },
  { id: 'str-lower', category: 'text', label: 'lowercase', hint: 'abc', template: {"kind":"expression","expression":"String(x).toLowerCase()"} },
  { id: 'str-title', category: 'text', label: 'Title Case', hint: 'Foo Bar', template: {"kind":"expression","expression":"String(x).replace(/\\b\\w/g,c=>c.toUpperCase())"} },
  { id: 'str-camel', category: 'text', label: 'camelCase', hint: 'fooBar', template: {"kind":"expression","expression":"String(x).replace(/[-_\\s]+(.)?/g,(_,c)=>c?c.toUpperCase():'').replace(/^./,c=>c.toLowerCase())"} },
  { id: 'str-capitalize', category: 'text', label: 'Capitalize first', hint: 'Foo bar', template: {"kind":"expression","expression":"String(x).charAt(0).toUpperCase()+String(x).slice(1)"} },
  { id: 'str-trim', category: 'text', label: 'Trim whitespace', hint: 'no edges', template: {"kind":"expression","expression":"String(x).trim()"} },
  { id: 'str-prefix', category: 'text', label: 'Prefix: PX', hint: 'PX value', template: {"kind":"excelFormat","format":"\"PX \"@"} },
  { id: 'str-suffix-units', category: 'text', label: 'Suffix: units', hint: '42 units', template: {"kind":"excelFormat","format":"@\" units\""} },
  { id: 'bool-yn', category: 'boolean', label: 'Y / N', hint: 'Y / N', template: {"kind":"expression","expression":"x?'Y':'N'"} },
  { id: 'bool-yes-no', category: 'boolean', label: 'Yes / No', hint: 'Yes / No', template: {"kind":"expression","expression":"x?'Yes':'No'"} },
  { id: 'bool-check', category: 'boolean', label: 'Check / —', hint: '✓ / —', template: {"kind":"expression","expression":"x?'✓':'—'"} },];

export const FORMAT_PRESET_IDS: readonly string[] = FORMAT_PRESETS.map((p) => p.id);

export function findFormatPreset(id: string): FormatPreset | undefined {
  return FORMAT_PRESETS.find((p) => p.id === id);
}

/** Generated so the guide cannot drift from the catalogue. */
export function buildFormatCatalogGuide(): string {
  const byCategory = new Map<string, FormatPreset[]>();
  for (const p of FORMAT_PRESETS) {
    const list = byCategory.get(p.category) ?? [];
    list.push(p);
    byCategory.set(p.category, list);
  }

  const sections = [...byCategory.entries()]
    .map(([category, presets]) => {
      const rows = presets
        .map((p) => {
          const t = p.template as { kind?: string; format?: string; preset?: string; tick?: string };
          const shown =
            t.kind === 'excelFormat' ? `\`${t.format}\`` :
            t.kind === 'tick' ? `tick ${t.tick}` :
            t.kind === 'preset' ? `preset "${t.preset}"` :
            'expression (not CSP-safe)';
          return `| \`${p.id}\` | ${p.label} | ${p.hint ?? ''} | ${shown} |`;
        })
        .join('\n');
      return `### ${category}\n\n| id | label | example | template |\n|---|---|---|---|\n${rows}`;
    })
    .join('\n\n');

  return `## Value formats — the pre-canned catalogue

Apply one with set_column_style. Prefer a catalogue entry over hand-writing an
Excel format string: these are the same formats the formatter toolbar offers,
so what you set is what the user can then edit by hand.

\`\`\`json
{ "targetGridId": "grid-axe-blotter", "colId": "dailyPnL",
  "formatter": { "kind": "excelFormat", "format": "[Green]#,##0.00;[Red](#,##0.00)" } }
\`\`\`

Excel format-string grammar, since most of the catalogue is built on it:

- Sections are \`positive;negative;zero;text\` — \`#,##0.00;[Red](#,##0.00)\`
  shows negatives red and in parentheses.
- Colour tags \`[Red] [Green] [Blue] [Yellow] [Cyan] [Magenta] [Black] [White]\`
  resolve to design-system tokens, so they stay correct in both themes.
- A trailing comma scales by a thousand: \`#,##0.0,"K"\` shows 12,345 as 12.3K;
  \`#,##0.00,,"M"\` divides by a million.
- Literal text goes in double quotes: \`"▲ "#,##0.00\`.
- Currency symbols other than \`$\` and \`€\` must be quoted — \`"£"#,##0.00\` —
  or the format fails to compile.

${sections}
`;
}
