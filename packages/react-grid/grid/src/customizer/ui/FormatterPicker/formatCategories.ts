/**
 * Format-category taxonomy for the FormatterPicker's vertical rail.
 *
 * Each `FormatterPreset` carries a `category` (see `presetsForDataType.ts`).
 * The picker groups presets into rail tabs by category, and shows only the
 * categories that fit the active column's data type — `categoriesForDataType`
 * returns that ordered, filtered set.
 *
 * `custom` is intentionally NOT a member of this union: the Custom tab is a
 * special always-on tab the picker appends after these categories. Its content
 * is the Excel input + reference examples, not a preset list.
 */
import type { FormatterPickerDataType } from './presetsForDataType';

export type FormatCategory =
  | 'number'
  | 'currency'
  | 'percent'
  | 'negatives'
  | 'conditional'
  | 'date'
  | 'tick'
  | 'text'
  | 'boolean';

/** Rail-tab labels. One entry per `FormatCategory`. */
export const CATEGORY_LABELS: Record<FormatCategory, string> = {
  number: 'Number',
  currency: 'Currency',
  percent: 'Percent',
  negatives: 'Negatives & P&L',
  conditional: 'Conditional',
  date: 'Date & time',
  tick: 'Tick',
  text: 'Text',
  boolean: 'Boolean',
};

/**
 * Ordered set of categories to surface for a column's data type. The first
 * entry is the primary/default tab. `custom` is appended by the UI, not here.
 */
export function categoriesForDataType(dataType: FormatterPickerDataType): FormatCategory[] {
  switch (dataType) {
    case 'number':
      return ['number', 'negatives', 'conditional', 'tick', 'percent'];
    case 'currency':
      return ['currency', 'negatives', 'conditional'];
    case 'percent':
      return ['percent', 'number'];
    case 'date':
    case 'datetime':
      return ['date'];
    case 'string':
      return ['text'];
    case 'boolean':
      return ['boolean', 'text'];
    default:
      return ['number'];
  }
}
