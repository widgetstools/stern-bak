/**
 * Types for the field-format catalog — a curated repository of field names
 * used across fixed-income / equity trading systems, mapped to the format,
 * alignment and typography they are conventionally shown with. Consumed by
 * {@link matchFieldToCatalog} and {@link buildAutoFormatPlan} to drive the
 * toolbar's "Auto Format" action.
 *
 * Everything the catalog emits is **native formatting-system state** — value
 * formatters (including `excelFormat` strings whose `[Green]`/`[Red]` colour
 * tags resolve to design-system tokens at render time), alignment and
 * typography. Auto Format never assigns an opaque cell renderer, so every
 * auto-applied aspect stays editable from the formatter toolbar and saves to
 * the active profile. Semantic colour (e.g. P&L red/green) rides on the value
 * formatter's colour tags rather than a renderer or hard-coded hex, so the
 * catalog honours the design-system no-hex rule.
 */
import type { CellStyleOverrides, ValueFormatterTemplate } from '../types.js';

export type AutoFormatAlignment = 'left' | 'center' | 'right';

/** Typography knobs the catalog can set — mirrors `CellStyleOverrides.typography`. */
export type AutoFormatTypography = NonNullable<CellStyleOverrides['typography']>;

/**
 * A resolved bundle of formatting to apply to a single column. Produced by
 * the matcher; consumed by `applyAutoFormatPlanReducer`. Every field is
 * optional so an entry can set only what it needs (e.g. a categorical field
 * sets just `alignment`). All slots are native formatting-system state.
 */
export interface AutoFormatAssignment {
  valueFormatterTemplate?: ValueFormatterTemplate;
  alignment?: AutoFormatAlignment;
  typography?: AutoFormatTypography;
  headerName?: string;
}

/**
 * One catalog entry. A column matches an entry when its (normalised) field
 * name equals one of `aliases`, or ends with one of `suffixes` (matching the
 * "last element of the field name" — e.g. `bidPrice` → `price`). Exact alias
 * matches outrank suffix matches; among suffix matches the longest wins.
 */
export interface FieldFormatEntry {
  id: string;
  /** Grouping label (documentation only — not used for matching). */
  category: string;
  /** Exact field-name aliases (normalised, case-insensitive). */
  aliases?: readonly string[];
  /** Trailing tokens matched against the field's last element. */
  suffixes?: readonly string[];
  format?: ValueFormatterTemplate;
  alignment?: AutoFormatAlignment;
  typography?: AutoFormatTypography;
  headerName?: string;
}

/** Minimal column descriptor consumed by {@link buildAutoFormatPlan}. */
export interface AutoFormatColumn {
  colId: string;
  field?: string;
  headerName?: string;
  /** AG-Grid `cellDataType` — drives the generic fallback when unmatched. */
  cellDataType?: string;
}
