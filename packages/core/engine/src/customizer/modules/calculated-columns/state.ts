/**
 * Calculated Columns — virtual, expression-driven columns appended to the
 * grid. Values computed from the row's base columns via the CSP-safe
 * `ExpressionEngine`. Syntax: `[price] * [quantity]`. Read-only.
 *
 * Out of scope: AG-Grid's native `allowFormula` + `formulaFuncs` — AG-Grid
 * 35 doesn't expose a reliable post-init path to refresh its formula
 * registry, so custom functions don't propagate without a remount. Revisit
 * when either (a) `IFormulaService.refreshFormulas` goes public, or (b)
 * we adopt a grid-remount-on-state-change policy.
 */
import type { ValueFormatterTemplate } from '../../../colDef/types.js';

export interface VirtualColumnDef {
  /** Unique column id. Must not collide with an existing data field. */
  colId: string;
  /** Header label. */
  headerName: string;
  /** Expression in our DSL — e.g. `[price] * [quantity] / 1000`. Parsed
   *  at transform time, not per-cell; errors fall back to `null`. */
  expression: string;
  /** Optional structured value formatter. Accepts the full
   *  `ValueFormatterTemplate` union (preset | excelFormat | expression |
   *  tick). Legacy snapshots may carry a bare string here; the module's
   *  `deserialize` coerces those into `{kind:'expression', expression}`. */
  valueFormatterTemplate?: ValueFormatterTemplate;
  /** Optional cell-dataType hint — drives FormatterPicker's preset filter. */
  cellDataType?: 'number' | 'currency' | 'percent' | 'date' | 'datetime' | 'string' | 'boolean';
  /** Insertion hint — virtual columns are appended in declaration order.
   *  Actual positioning stays driven by AG-Grid's column-state APIs;
   *  `position` is persisted for UI sorting. */
  position?: number;
  initialWidth?: number;
  initialHide?: boolean;
  initialPinned?: 'left' | 'right';
}

export interface CalculatedColumnsState {
  virtualColumns: VirtualColumnDef[];
}

export const INITIAL_CALCULATED_COLUMNS: CalculatedColumnsState = {
  virtualColumns: [],
};
