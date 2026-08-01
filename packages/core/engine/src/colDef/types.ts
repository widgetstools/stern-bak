/**
 * Shared colDef-level types. These shapes are referenced by several modules
 * (column-templates, column-customization, conditional-styling, column-groups)
 * and by the rendering adapters under `./adapters/`. Keeping them in one
 * place stops the circular dependency v2 had where column-templates
 * imported from column-customization.
 */

// ─── Borders ────────────────────────────────────────────────────────────────

export interface BorderSpec {
  /** Pixel width. */
  width: number;
  /** Any CSS colour (hex, named, rgb[a]). */
  color: string;
  style: 'solid' | 'dashed' | 'dotted';
}

// ─── Style overrides ────────────────────────────────────────────────────────
//
// Structured, editor-facing shape — `adapters/cellStyleToAgStyle.ts` flattens
// these into the CSS object AG-Grid consumes via `cellStyle` / `headerStyle`.
// Every field is optional so a fresh override equals `{}`.

export interface CellStyleOverrides {
  typography?: {
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    /** px */
    fontSize?: number;
  };
  colors?: {
    text?: string;
    background?: string;
  };
  alignment?: {
    horizontal?: 'left' | 'center' | 'right';
    vertical?: 'top' | 'middle' | 'bottom';
  };
  borders?: {
    top?: BorderSpec;
    right?: BorderSpec;
    bottom?: BorderSpec;
    left?: BorderSpec;
  };
}

// ─── Theme-keyed wrapper ───────────────────────────────────────────────────
//
// Per-column styling that differs by host theme. Reducers write to the
// slot matching `[data-theme]` at write-time (via `patchActiveStyle`), and
// each slot persists independently in the profile — so the light slot only
// ever stores what the user explicitly diverged in light.
//
// Dark is the canonical base. At render time `resolveEffectiveStyle`
// (in `themedStyle.ts`) folds the dark slot UNDER the light slot: light
// inherits every dark leaf and overrides per-property with its own. So a
// header styled red in dark and given a blue background in light renders
// red-text + blue-bg in light. Editing dark still never touches the light
// slot, and vice versa — the inheritance is a read-time fold, not stored.
//
// Legacy profiles stored a flat `CellStyleOverrides`. `migrateThemedStyle`
// lifts those into `{ dark, light }` at load time — same colour appears in
// both modes until the user diverges them.

export type GridThemeMode = 'dark' | 'light';

export interface ThemedCellStyleOverrides {
  dark?: CellStyleOverrides;
  light?: CellStyleOverrides;
}

// ─── Value formatter template ──────────────────────────────────────────────
//
// Discriminated union covering four formatter sources:
//
//   - `preset`       — CSP-safe presets backed by Intl.*
//   - `expression`   — legacy `new Function(...)` escape hatch (CSP-unsafe;
//                      adapter falls back to identity under strict CSP)
//   - `excelFormat`  — Excel format strings parsed by SheetJS `ssf` (CSP-safe)
//   - `tick`         — fixed-income 32nds/64ths/128ths/256ths bond-price
//                      formatter (US Treasuries etc.)

export type PresetId = 'currency' | 'percent' | 'number' | 'date' | 'datetime' | 'duration';

export type TickToken = 'TICK32' | 'TICK32_PLUS' | 'TICK64' | 'TICK128' | 'TICK256';

export type ValueFormatterTemplate =
  | { kind: 'preset'; preset: PresetId; options?: Record<string, unknown> }
  | { kind: 'expression'; expression: string }
  | { kind: 'excelFormat'; format: string }
  | { kind: 'tick'; tick: TickToken };

// ─── Data-type vocabulary ──────────────────────────────────────────────────

/**
 * The four broad buckets AG-Grid's `cellDataType` covers, as used by
 * column-templates' `typeDefaults`. Custom types (`object` etc.) are
 * deliberately excluded — typeDefaults are for "every numeric column
 * right-aligns" style rules.
 */
export type ColumnDataType = 'numeric' | 'date' | 'string' | 'boolean';

// ─── Column assignment ──────────────────────────────────────────────────────
//
// Per-column override. Lives here (rather than in column-customization) so
// column-templates can describe what it merges into without a circular dep.
// Modules that need richer shapes (filter config, row-grouping config) keep
// them declared where they land — we expose them here as `unknown` because
// resolveTemplates treats them as opaque wholesale-replace slots anyway.

export interface ColumnAssignment {
  readonly colId: string;

  // Identity
  headerName?: string;
  headerTooltip?: string;
  initialWidth?: number;
  initialHide?: boolean;
  initialPinned?: 'left' | 'right' | boolean;

  // Behaviour flags
  sortable?: boolean;
  filterable?: boolean;
  resizable?: boolean;
  editable?: boolean;

  // Appearance + formatting. Themed so styling differs by host theme;
  // reducers and transforms route via `[data-theme]`.
  cellStyleOverrides?: ThemedCellStyleOverrides;
  headerStyleOverrides?: ThemedCellStyleOverrides;
  valueFormatterTemplate?: ValueFormatterTemplate;

  // Template references — later wins on resolve.
  templateIds?: string[];

  // Direct editor / renderer overrides.
  cellEditorName?: string;
  cellEditorParams?: Record<string, unknown>;
  cellRendererName?: string;
  /**
   * Registry id of a configurable cell renderer (kept as a bare string in
   * the engine — the concrete `CellRendererId` union lives in
   * `@wellsfargo-starui/design-system/cell-renderers-registry`, which the engine
   * deliberately doesn't import). When set, the column-customization
   * transform emits `colDef.cellRenderer = cellRendererId` AND
   * `colDef.cellRendererParams = cellRendererConfig.config`. Takes
   * precedence over `cellRendererName`.
   */
  cellRendererId?: string;
  /**
   * Discriminated-union config (by `kind`) for the chosen renderer.
   * Typed as `unknown` here so the engine stays decoupled from the
   * design-system catalogue; consumers cast to `CellRendererConfig`
   * at the boundary (same pattern as `filter` / `rowGrouping`).
   * JSON-serialisable so it round-trips through profile persistence.
   */
  cellRendererConfig?: unknown;

  // Rich filter config + row-grouping config — treated as opaque by the
  // template resolver (wholesale-replace, no deep merge). The concrete
  // shapes live in column-customization's own state.ts.
  filter?: unknown;
  rowGrouping?: unknown;
}
