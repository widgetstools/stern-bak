/**
 * A reusable bundle of per-column overrides. Templates are referenced from
 * `ColumnAssignment.templateIds[]`; `resolveTemplates` folds the chain into
 * a composite assignment the column-customization walker emits.
 *
 * Field semantics:
 *  - `cellStyleOverrides` / `headerStyleOverrides` merge per-field across the chain.
 *  - Every other field is last-writer-wins.
 *  - `cellEditorParams` / `filter` / `rowGrouping` are opaque — a later
 *    template's value replaces the earlier one wholesale (no deep merge).
 *  - `cellEditorName` / `cellRendererName` are AG-Grid component-registry keys.
 *
 * Excluded by design:
 *  - Identity (`colId`, `headerName`, `headerTooltip`) — column-unique.
 *  - Per-column layout state (`initialWidth`, `initialPinned`, `initialHide`)
 *    — see "settings unique to a column" rule.
 *  - Self-referential `templateIds` — would create circular template-on-
 *    template chains.
 *  - Live row-grouping state (`rowGroup` / `rowGroupIndex` / `pivot` /
 *    `pivotIndex`) — represents "this column is currently the 3rd group",
 *    not a portable trait. Capability flags (`enableRowGroup`, `aggFunc`,
 *    …) are kept; see `RowGroupingTemplate`.
 */
// Relative on purpose — package self-imports create a barrel cycle.
import type {
  ColumnDataType,
  ThemedCellStyleOverrides,
  ValueFormatterTemplate,
} from '../../../colDef';
import type {
  ColumnCellEditorConfig,
  ColumnFilterConfig,
  RowGroupingConfig,
} from '../column-customization/state';

/** Capability-only subset of `RowGroupingConfig` — drops the live-state
 *  fields that name a specific column instance ("currently grouped at
 *  index 2", "actively pivoting") so a template applied to another column
 *  doesn't try to claim a spot in the grid's group/pivot layout. */
export type RowGroupingTemplate = Omit<
  RowGroupingConfig,
  'rowGroup' | 'rowGroupIndex' | 'pivot' | 'pivotIndex'
>;

export interface ColumnTemplate {
  readonly id: string;
  name: string;
  description?: string;
  // Styling — themed so a template can describe different colours for
  // dark vs light hosts and `resolveTemplates` merges per-theme.
  cellStyleOverrides?: ThemedCellStyleOverrides;
  headerStyleOverrides?: ThemedCellStyleOverrides;
  // Formatting
  valueFormatterTemplate?: ValueFormatterTemplate;
  // Behavior flags
  sortable?: boolean;
  filterable?: boolean;
  resizable?: boolean;
  editable?: boolean;
  // Cell editor + renderer (component registry keys)
  cellEditorName?: string;
  cellEditorParams?: Record<string, unknown>;
  cellRendererName?: string;
  // Structured cell-editor config — when set, overrides the registry
  // keys above (the column-customization transform resolves it into
  // `cellEditor` + `cellEditorParams` on the colDef). Captures kind,
  // values, valuesSource ({{provider.key}}), and editor-specific
  // params so a "Status code" template authored once via the
  // formatter's quick-pick reproduces the dropdown across columns.
  cellEditor?: ColumnCellEditorConfig;
  // Filter + grouping configuration (opaque last-writer-wins blobs)
  filter?: ColumnFilterConfig;
  rowGrouping?: RowGroupingTemplate;
  // Audit
  createdAt: number;
  updatedAt: number;
}

export interface ColumnTemplatesState {
  /** templateId → ColumnTemplate. */
  templates: Record<string, ColumnTemplate>;
  /** dataType → templateId. Applied as the bottom-of-chain fallback when the
   *  assignment has NO explicit `templateIds` field. An empty `templateIds: []`
   *  opts the column out of this fallback. */
  typeDefaults: Partial<Record<ColumnDataType, string>>;
}

// Deep-frozen so accidental mutation of the shared reference throws in strict
// mode instead of silently corrupting subsequent reads. Callers that need a
// mutable copy must replace nested objects, not just spread the outer.
export const INITIAL_COLUMN_TEMPLATES: ColumnTemplatesState = Object.freeze({
  templates: Object.freeze({}) as Record<string, ColumnTemplate>,
  typeDefaults: Object.freeze({}) as Partial<Record<ColumnDataType, string>>,
}) as ColumnTemplatesState;

export type { ColumnDataType } from '../../../colDef';
