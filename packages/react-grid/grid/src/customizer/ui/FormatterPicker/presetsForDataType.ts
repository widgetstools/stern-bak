import type { ValueFormatterTemplate } from '@wellsfargo-starui/core';
import { categoriesForDataType, type FormatCategory } from './formatCategories';

/**
 * `FormatterPicker.dataType` — a semantic-level enum the picker uses to
 * filter its preset list. Deliberately richer than the existing
 * `ColumnDataType` (`'numeric' | 'date' | 'string' | 'boolean'`): the
 * picker splits 'numeric' into `number | currency | percent` so the
 * preset dropdown can surface the right sub-menu without a second
 * "what kind of number?" prompt.
 *
 * Hosts map their own column datatype to this enum — see
 * `inferPickerDataType()` in `FormatterPicker.tsx`.
 */
export type FormatterPickerDataType =
  | 'number'
  | 'currency'
  | 'percent'
  | 'date'
  | 'datetime'
  | 'string'
  | 'boolean';

export interface FormatterPreset {
  /** Stable id used for dropdown equality + as the menu key. */
  id: string;
  /** Rail-tab bucket this preset belongs to. Drives the vertical-tab grouping. */
  category: FormatCategory;
  /** Short label shown in the dropdown row. */
  label: string;
  /** Optional second-line hint (e.g. "101-16" sample output). */
  hint?: string;
  /** The template emitted when the user picks this preset. */
  template: ValueFormatterTemplate;
  /** Stable sample-value the live preview renders against. When
   *  omitted the picker uses its own default (`1234.5678`). */
  sampleValue?: unknown;
}

// ─── Number ─────────────────────────────────────────────────────────────────

const NUMBER_PRESETS: ReadonlyArray<FormatterPreset> = [
  { id: 'num-integer', category: 'number', label: 'Integer', hint: '1,235', template: { kind: 'excelFormat', format: '#,##0' } },
  { id: 'num-2dp', category: 'number', label: '2 decimals', hint: '1,234.57', template: { kind: 'excelFormat', format: '#,##0.00' } },
  { id: 'num-4dp', category: 'number', label: '4 decimals', hint: '1,234.5678', template: { kind: 'excelFormat', format: '#,##0.0000' } },
  // Promoted from the old Excel-reference popover (example-only until now).
  { id: 'num-no-thousands', category: 'number', label: 'No thousands', hint: '1234.57', template: { kind: 'excelFormat', format: '0.00' } },
  { id: 'num-scientific', category: 'number', label: 'Scientific', hint: '1.23E+03', template: { kind: 'excelFormat', format: '0.00E+00' } },
  {
    id: 'num-bps',
    category: 'number',
    label: 'Basis points',
    hint: '+12.3 bps',
    template: { kind: 'expression', expression: "(x>=0?'+':'')+x.toFixed(1)+' bp'" },
    sampleValue: 12.345,
  },
];

// ─── Negatives & P&L ────────────────────────────────────────────────────────

const NEGATIVE_PRESETS: ReadonlyArray<FormatterPreset> = [
  { id: 'num-neg-parens', category: 'negatives', label: 'Parens negative', hint: '(1,234.57)', template: { kind: 'excelFormat', format: '#,##0.00;(#,##0.00)' } },
  { id: 'num-neg-red-parens', category: 'negatives', label: 'Red parens neg', hint: '[Red](1,234.57)', template: { kind: 'excelFormat', format: '#,##0.00;[Red](#,##0.00)' } },
  // Promoted from the old Excel-reference popover.
  { id: 'num-neg-red-only', category: 'negatives', label: 'Red negative', hint: '[Red]1,234.57', template: { kind: 'excelFormat', format: '#,##0.00;[Red]#,##0.00' } },
  {
    // US desk convention — gains green, losses red, no leading minus on
    // the negative section (colour carries the sign). Bloomberg-style cue.
    id: 'num-green-red-nosign',
    category: 'negatives',
    label: 'Green / Red (no sign)',
    hint: '[Green]1,234.57 · [Red]1,234.57',
    template: { kind: 'excelFormat', format: '[Green]#,##0.00;[Red]#,##0.00' },
    sampleValue: -1234.5678,
  },
  {
    id: 'num-green-red-usd',
    category: 'negatives',
    label: 'Green / Red $ (no sign)',
    hint: '[Green]$1,234.57 · [Red]$1,234.57',
    template: { kind: 'excelFormat', format: '[Green]$#,##0.00;[Red]$#,##0.00' },
    sampleValue: -1234.5678,
  },
];

// ─── Conditional (directional) ──────────────────────────────────────────────
// Promoted from the old Excel-reference popover — these had no preset home.

const CONDITIONAL_PRESETS: ReadonlyArray<FormatterPreset> = [
  {
    id: 'num-cond-arrows',
    category: 'conditional',
    label: 'Green up / red down',
    hint: '▲ green · ▼ red',
    template: { kind: 'excelFormat', format: '[>0][Green]▲0.00;[<0][Red]▼0.00;0.00' },
    sampleValue: -12.5,
  },
  {
    id: 'num-cond-thresholds',
    category: 'conditional',
    label: 'Thresholds (100)',
    hint: 'red >100 · green ≤100',
    template: { kind: 'excelFormat', format: '[>100][Red]0;[<=100][Green]0;0' },
    sampleValue: 142,
  },
];

// ─── Tick (fixed income) ────────────────────────────────────────────────────

const TICK_PRESETS: ReadonlyArray<FormatterPreset> = [
  { id: 'tick-32', category: 'tick', label: '32nds (bond price)', hint: '101-16', template: { kind: 'tick', tick: 'TICK32' }, sampleValue: 101.5 },
  { id: 'tick-32-plus', category: 'tick', label: '32nds + halves', hint: '101-16+', template: { kind: 'tick', tick: 'TICK32_PLUS' }, sampleValue: 101.515625 },
  { id: 'tick-64', category: 'tick', label: '64ths', hint: '101-161', template: { kind: 'tick', tick: 'TICK64' }, sampleValue: 101.515625 },
  { id: 'tick-128', category: 'tick', label: '128ths', hint: '101-162', template: { kind: 'tick', tick: 'TICK128' }, sampleValue: 101.515625 },
  { id: 'tick-256', category: 'tick', label: '256ths', hint: '101-161', template: { kind: 'tick', tick: 'TICK256' }, sampleValue: 101.50390625 },
];

// ─── Currency ───────────────────────────────────────────────────────────────
// SSF only treats `$` and `€` as bare currency characters; `£`, `¥`, `₹`
// must be wrapped in a quoted string literal or SSF throws at compile time.

const CURRENCY_PRESETS: ReadonlyArray<FormatterPreset> = [
  { id: 'cur-usd', category: 'currency', label: 'USD', hint: '$1,234.56', template: { kind: 'excelFormat', format: '$#,##0.00' } },
  { id: 'cur-usd-red-neg', category: 'currency', label: 'USD red negative', hint: '[Red]-$1,234.56', template: { kind: 'excelFormat', format: '$#,##0.00;[Red]-$#,##0.00' } },
  { id: 'cur-usd-parens', category: 'currency', label: 'USD parens neg', hint: '($1,234.56)', template: { kind: 'excelFormat', format: '$#,##0.00;($#,##0.00)' } },
  { id: 'cur-usd-green-red-nosign', category: 'currency', label: 'USD Green / Red (no sign)', hint: '[Green]$1,234.57 · [Red]$1,234.57', template: { kind: 'excelFormat', format: '[Green]$#,##0.00;[Red]$#,##0.00' }, sampleValue: -1234.5678 },
  { id: 'cur-eur', category: 'currency', label: 'EUR', hint: '€1,234.56', template: { kind: 'excelFormat', format: '€#,##0.00' } },
  { id: 'cur-gbp', category: 'currency', label: 'GBP', hint: '£1,234.56', template: { kind: 'excelFormat', format: '"£"#,##0.00' } },
  { id: 'cur-jpy', category: 'currency', label: 'JPY', hint: '¥1,235', template: { kind: 'excelFormat', format: '"¥"#,##0' } },
  { id: 'cur-inr', category: 'currency', label: 'INR', hint: '₹1,234.56', template: { kind: 'excelFormat', format: '"₹"#,##0.00' } },
  { id: 'cur-eur-green-red-nosign', category: 'currency', label: 'EUR Green / Red (no sign)', hint: '[Green]€1,234.57 · [Red]€1,234.57', template: { kind: 'excelFormat', format: '[Green]€#,##0.00;[Red]€#,##0.00' }, sampleValue: -1234.5678 },
  { id: 'cur-gbp-green-red-nosign', category: 'currency', label: 'GBP Green / Red (no sign)', hint: '[Green]£1,234.57 · [Red]£1,234.57', template: { kind: 'excelFormat', format: '[Green]"£"#,##0.00;[Red]"£"#,##0.00' }, sampleValue: -1234.5678 },
  { id: 'cur-jpy-green-red-nosign', category: 'currency', label: 'JPY Green / Red (no sign)', hint: '[Green]¥1,235 · [Red]¥1,235', template: { kind: 'excelFormat', format: '[Green]"¥"#,##0;[Red]"¥"#,##0' }, sampleValue: -1234.5678 },
  { id: 'cur-inr-green-red-nosign', category: 'currency', label: 'INR Green / Red (no sign)', hint: '[Green]₹1,234.57 · [Red]₹1,234.57', template: { kind: 'excelFormat', format: '[Green]"₹"#,##0.00;[Red]"₹"#,##0.00' }, sampleValue: -1234.5678 },
];

// ─── Percent ────────────────────────────────────────────────────────────────

const PERCENT_PRESETS: ReadonlyArray<FormatterPreset> = [
  { id: 'pct-0', category: 'percent', label: 'Percent (0dp)', hint: '12%', template: { kind: 'excelFormat', format: '0%' }, sampleValue: 0.1234 },
  { id: 'pct-2', category: 'percent', label: 'Percent (2dp)', hint: '12.34%', template: { kind: 'excelFormat', format: '0.00%' }, sampleValue: 0.1234 },
  { id: 'pct-bps', category: 'percent', label: 'Basis points', hint: '+12.3 bps', template: { kind: 'expression', expression: "(x>=0?'+':'')+x.toFixed(1)+' bp'" }, sampleValue: 12.345 },
];

// ─── Date / datetime ────────────────────────────────────────────────────────

const DATE_PRESETS: ReadonlyArray<FormatterPreset> = [
  { id: 'date-iso', category: 'date', label: 'ISO (yyyy-mm-dd)', hint: '2026-04-17', template: { kind: 'excelFormat', format: 'yyyy-mm-dd' }, sampleValue: new Date('2026-04-17T00:00:00Z') },
  { id: 'date-us', category: 'date', label: 'US (mm/dd/yyyy)', hint: '04/17/2026', template: { kind: 'excelFormat', format: 'mm/dd/yyyy' }, sampleValue: new Date('2026-04-17T00:00:00Z') },
  { id: 'date-eu', category: 'date', label: 'EU (dd-mmm-yy)', hint: '17-Apr-26', template: { kind: 'excelFormat', format: 'dd-mmm-yy' }, sampleValue: new Date('2026-04-17T00:00:00Z') },
  { id: 'date-long', category: 'date', label: 'Long', hint: '17 April 2026', template: { kind: 'excelFormat', format: 'dd mmmm yyyy' }, sampleValue: new Date('2026-04-17T00:00:00Z') },
  { id: 'dt-iso', category: 'date', label: 'ISO with time', hint: '2026-04-17 09:30:00', template: { kind: 'excelFormat', format: 'yyyy-mm-dd hh:mm:ss' }, sampleValue: new Date('2026-04-17T09:30:00Z') },
  { id: 'dt-us-short', category: 'date', label: 'US short', hint: '04/17/26 9:30 AM', template: { kind: 'excelFormat', format: 'mm/dd/yy h:mm AM/PM' }, sampleValue: new Date('2026-04-17T09:30:00Z') },
];

// ─── Text ───────────────────────────────────────────────────────────────────
// Prefix/suffix use CSP-safe Excel `@` formats. Case transforms require
// `expression` templates (compiled via `new Function`) — same mechanism the
// boolean presets use; under a `strict` expression policy they fall back to
// identity. Arbitrary prefix/suffix/transforms go through the Custom tab.

const TEXT_PRESETS: ReadonlyArray<FormatterPreset> = [
  { id: 'str-default', category: 'text', label: 'Default (pass-through)', hint: 'value as-is', template: { kind: 'excelFormat', format: '@' } },
  { id: 'str-upper', category: 'text', label: 'UPPERCASE', hint: 'ABC', template: { kind: 'expression', expression: 'String(x).toUpperCase()' } },
  { id: 'str-lower', category: 'text', label: 'lowercase', hint: 'abc', template: { kind: 'expression', expression: 'String(x).toLowerCase()' } },
  { id: 'str-title', category: 'text', label: 'Title Case', hint: 'Foo Bar', template: { kind: 'expression', expression: 'String(x).replace(/\\b\\w/g,c=>c.toUpperCase())' } },
  { id: 'str-camel', category: 'text', label: 'camelCase', hint: 'fooBar', template: { kind: 'expression', expression: "String(x).replace(/[-_\\s]+(.)?/g,(_,c)=>c?c.toUpperCase():'').replace(/^./,c=>c.toLowerCase())" } },
  { id: 'str-capitalize', category: 'text', label: 'Capitalize first', hint: 'Foo bar', template: { kind: 'expression', expression: 'String(x).charAt(0).toUpperCase()+String(x).slice(1)' } },
  { id: 'str-trim', category: 'text', label: 'Trim whitespace', hint: 'no edges', template: { kind: 'expression', expression: 'String(x).trim()' } },
  { id: 'str-prefix', category: 'text', label: 'Prefix: PX', hint: 'PX value', template: { kind: 'excelFormat', format: '"PX "@' } },
  { id: 'str-suffix-units', category: 'text', label: 'Suffix: units', hint: '42 units', template: { kind: 'excelFormat', format: '@" units"' } },
];

// ─── Boolean ────────────────────────────────────────────────────────────────

const BOOLEAN_PRESETS: ReadonlyArray<FormatterPreset> = [
  { id: 'bool-yn', category: 'boolean', label: 'Y / N', hint: 'Y / N', template: { kind: 'expression', expression: "x?'Y':'N'" } },
  { id: 'bool-yes-no', category: 'boolean', label: 'Yes / No', hint: 'Yes / No', template: { kind: 'expression', expression: "x?'Yes':'No'" } },
  { id: 'bool-check', category: 'boolean', label: 'Check / —', hint: '✓ / —', template: { kind: 'expression', expression: "x?'✓':'—'" } },
];

// ─── Master catalog ─────────────────────────────────────────────────────────

/** Every preset, tagged with its category. The picker derives both
 *  per-category and per-dataType views from this single source. */
export const ALL_PRESETS: ReadonlyArray<FormatterPreset> = [
  ...NUMBER_PRESETS,
  ...NEGATIVE_PRESETS,
  ...CONDITIONAL_PRESETS,
  ...TICK_PRESETS,
  ...CURRENCY_PRESETS,
  ...PERCENT_PRESETS,
  ...DATE_PRESETS,
  ...TEXT_PRESETS,
  ...BOOLEAN_PRESETS,
];

/** Presets in a single rail category (master-catalog order preserved). */
export function presetsForCategory(category: FormatCategory): ReadonlyArray<FormatterPreset> {
  return ALL_PRESETS.filter((p) => p.category === category);
}

// ─── Public entry ───────────────────────────────────────────────────────────

/**
 * All presets a column of `dataType` can pick from — the union of its
 * visible categories (see `categoriesForDataType`), in category order.
 * Keeps the historical single-list shape consumed by InlineFormatterPicker.
 */
export function presetsForDataType(dataType: FormatterPickerDataType): ReadonlyArray<FormatterPreset> {
  return categoriesForDataType(dataType).flatMap((c) => presetsForCategory(c));
}

/** Default "live preview" sample for each dataType when the host
 *  doesn't pass an explicit `sampleValue`. Picked to show off the
 *  format (e.g. negative with 4 decimals for numbers; a real date
 *  object for dates). */
export function defaultSampleValue(dataType: FormatterPickerDataType): unknown {
  switch (dataType) {
    case 'number':
    case 'currency':
      return 1234.5678;
    case 'percent':
      return 0.1234;
    case 'date':
    case 'datetime':
      return new Date('2026-04-17T09:30:00Z');
    case 'string':
      return 'sample';
    case 'boolean':
      return true;
    default:
      return 0;
  }
}

/**
 * Given a template, find the preset whose template matches (stable id).
 * Used by the dropdown to highlight the currently-applied preset when the
 * user re-opens it. Returns `undefined` if the template is a custom Excel
 * format that doesn't match any preset — in that case the picker's custom
 * input is the source of truth.
 */
export function findMatchingPreset(
  dataType: FormatterPickerDataType,
  template: ValueFormatterTemplate | undefined,
): FormatterPreset | undefined {
  if (!template) return undefined;
  const list = presetsForDataType(dataType);
  return list.find((p) => templatesEqual(p.template, template));
}

function templatesEqual(a: ValueFormatterTemplate, b: ValueFormatterTemplate): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'preset' && b.kind === 'preset') {
    return a.preset === b.preset && JSON.stringify(a.options ?? {}) === JSON.stringify(b.options ?? {});
  }
  if (a.kind === 'expression' && b.kind === 'expression') return a.expression === b.expression;
  if (a.kind === 'excelFormat' && b.kind === 'excelFormat') return a.format === b.format;
  if (a.kind === 'tick' && b.kind === 'tick') return a.tick === b.tick;
  return false;
}
