/**
 * Shared colDef-level types + writers. Consumed by column-templates,
 * column-customization, conditional-styling, and column-groups. Keeping
 * them centralised breaks the circular dependency v2 had.
 */
export type {
  BorderSpec,
  CellStyleOverrides,
  ColumnAssignment,
  ColumnDataType,
  GridThemeMode,
  PresetId,
  ThemedCellStyleOverrides,
  TickToken,
  ValueFormatterTemplate,
} from './types';

export {
  getActiveTheme,
  mergeCellStyleOverrides,
  mergeThemedStyle,
  migrateThemedStyle,
  patchActiveStyle,
  resolveActiveStyle,
  resolveEffectiveStyle,
} from './themedStyle';

// ─── Writers / adapters ─────────────────────────────────────────────────────
export {
  cellStyleToAgStyle,
  type AgGridStyle,
} from './adapters/cellStyleToAgStyle';
export {
  valueFormatterFromTemplate,
  type Formatter,
  type FormatterParams,
} from './adapters/valueFormatterFromTemplate';
export {
  excelFormatter,
  excelFormatColorResolver,
  isValidExcelFormat,
} from './adapters/excelFormatter';
export { tickFormatter } from './adapters/tickFormatter';
export { presetToExcelFormat } from './adapters/presetToExcelFormat';
export { nestedField, defaultNullSafeComparator, type NestedFieldOptions } from './nestedField';

// ─── Field-format catalog (Auto Format) ─────────────────────────────────────
export {
  FIELD_FORMAT_CATALOG,
  matchFieldToCatalog,
  normalizeToken,
  soundex,
  buildAutoFormatPlan,
} from './fieldFormatCatalog/index.js';
export type {
  AutoFormatAlignment,
  AutoFormatAssignment,
  AutoFormatColumn,
  AutoFormatTypography,
  FieldFormatEntry,
} from './fieldFormatCatalog/index.js';
