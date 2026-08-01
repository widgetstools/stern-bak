/**
 * Field-format catalog — barrel.
 *
 * A curated repository of FI/equity field names mapped to native formatting
 * state (value formatters incl. `excelFormat` colour tags, alignment,
 * typography), plus the matcher and plan builder that the "Auto Format"
 * toolbar action uses.
 */
export { FIELD_FORMAT_CATALOG } from './fieldFormatCatalog.js';
export { matchFieldToCatalog, normalizeToken, soundex } from './matchFieldToCatalog.js';
export { buildAutoFormatPlan } from './buildAutoFormatPlan.js';
export type {
  AutoFormatAlignment,
  AutoFormatAssignment,
  AutoFormatColumn,
  AutoFormatTypography,
  FieldFormatEntry,
} from './types.js';
