/**
 * Calculated Columns module — appends virtual derived columns after the
 * host's base columnDefs. Priority 15 — runs AFTER column-templates (5)
 * and column-customization (10) so virtual columns see the finalized
 * base defs (renames, resizes), and BEFORE conditional-styling (20) so
 * its rules can reference the new virtual colIds.
 */
import type { GridApi } from 'ag-grid-community';
import type { Module, PlatformHandle } from '@wellsfargo-starui/core';
import {
  INITIAL_CALCULATED_COLUMNS,
  type CalculatedColumnsState,
  type VirtualColumnDef,
} from './state';
import { astUsesAggregateFunctions } from '@wellsfargo-starui/core';
import {
  buildVirtualColDef,
  invalidateAllRowsCache,
  type AllRowsEntry,
} from './virtualColumn';
import {
  applyFilterConfigToColDef,
  applyRowGroupingConfigToColDef,
  cssEscapeColId,
} from '../column-customization';
import type {
  ColumnCustomizationState,
  ColumnFilterConfig,
  RowGroupingConfig,
} from '../column-customization';
import {
  CalculatedColumnsEditor,
  CalculatedColumnsList,
  CalculatedColumnsPanel,
} from './CalculatedColumnsPanel';

export const CALCULATED_COLUMNS_MODULE_ID = 'calculated-columns';
const COLUMN_CUSTOMIZATION_MODULE_ID = 'column-customization';

const ALL_ROWS_CACHE_KEY = 'calculated-columns:allRows';

export const calculatedColumnsModule: Module<CalculatedColumnsState> = {
  id: CALCULATED_COLUMNS_MODULE_ID,
  name: 'Calculated Columns',
  code: '03',
  schemaVersion: 1,
  priority: 15,

  getInitialState: () => ({
    // No seed by default — production grids ship with zero virtual
    // columns; the user adds them through the Calculated Columns
    // panel. (Earlier the module shipped a `grossPnl` demo seed; that
    // surfaced as an unwanted "Gross P&L" column in every grid that
    // didn't explicitly override it. Apps that want a fixture demo
    // column should seed it through their showcase profile, not via
    // this module's initial state.)
    virtualColumns: [],
  }),

  /**
   * Wires the cross-row invalidation — when a source column's value
   * changes, every OTHER row's virtual columns may need re-evaluation
   * (column-wide aggregates like `SUM([price])` depend on the full row
   * snapshot). AG-Grid only re-runs the edited cell's row by default.
   *
   * Two throttles keep this off the live-tick hot path:
   * - The forced `refreshCells` only runs when at least one virtual
   *   column actually CALLS an aggregate function. Row-local columns
   *   (`[price] * [qty]`) re-run through AG-Grid's own change detection
   *   for exactly the rows a transaction touched — force-refreshing
   *   every rendered virtual cell per flush repainted the whole
   *   viewport 10-40×/sec for nothing.
   * - The refresh is rAF-coalesced: many flushes per frame collapse to
   *   one repaint. Snapshot INVALIDATION stays synchronous so any
   *   read between flush and repaint (sort, filter, export) sees fresh
   *   data; only the repaint is deferred. rAF suspending on hidden
   *   windows is fine here — a hidden grid repaints on reveal.
   */
  activate(platform: PlatformHandle<CalculatedColumnsState>): () => void {
    const cache = platform.resources.cache<GridApi, AllRowsEntry>(ALL_ROWS_CACHE_KEY);
    const engine = platform.resources.expression();

    // Memoized by the virtualColumns array reference — state is
    // immutable, so a same-reference array cannot have new expressions.
    let aggMemoFor: VirtualColumnDef[] | null = null;
    let anyAggregate = false;
    const hasAggregateColumns = (): boolean => {
      const cols = platform.getState().virtualColumns;
      if (cols !== aggMemoFor) {
        aggMemoFor = cols;
        anyAggregate = cols.some((v) => {
          try { return astUsesAggregateFunctions(engine.parse(v.expression)); }
          catch { return false; }
        });
      }
      return anyAggregate;
    };

    let rafHandle: number | null = null;
    const flushRefresh = () => {
      rafHandle = null;
      const api = platform.api.api;
      if (!api) return;
      const ids = platform.getState().virtualColumns.map((v) => v.colId);
      if (ids.length === 0) return;
      // suppressFlash: force:true alone makes AG-Grid skip its own
      // value-equality check, so with enableCellChangeFlash on, every
      // virtual column cell would animate the native "changed" flash
      // on every recompute — even ones whose computed value is unchanged.
      try { api.refreshCells({ columns: ids, force: true, suppressFlash: true }); }
      catch { /* teardown window */ }
    };

    const onDataEvent = () => {
      const api = platform.api.api;
      if (!api) return;
      invalidateAllRowsCache(api, cache);
      if (platform.getState().virtualColumns.length === 0) return;
      if (!hasAggregateColumns()) return;
      if (rafHandle !== null) return;
      rafHandle = typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame(flushRefresh)
        : (setTimeout(flushRefresh, 16) as unknown as number);
    };

    const disposers = [
      platform.api.on('cellValueChanged', onDataEvent),
      platform.api.on('rowValueChanged', onDataEvent),
      platform.api.on('rowDataUpdated', onDataEvent),
    ];
    return () => {
      if (rafHandle !== null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(rafHandle);
        rafHandle = null;
      }
      disposers.forEach((d) => { try { d(); } catch { /* */ } });
    };
  },

  transformColumnDefs(defs, state, ctx) {
    if (state.virtualColumns.length === 0) return defs;
    const engine = ctx.resources.expression();
    const cache = ctx.resources.cache<GridApi, AllRowsEntry>(ALL_ROWS_CACHE_KEY);

    // Sort by `position` so users can control relative ordering
    // without fighting AG-Grid's column-state machinery.
    const sorted = state.virtualColumns
      .slice()
      .sort((a, b) => (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER));

    // Cross-module read: column-customization may carry a
    // `ColumnAssignment` for a virtual column if the user applied any
    // toolbar style / formatter while a calculated column was selected.
    // Toolbar-applied picks win (last write wins — matches every other
    // toolbar control).
    let assignments: ColumnCustomizationState['assignments'] = {};
    try {
      const cust = ctx.getModuleState<ColumnCustomizationState>(COLUMN_CUSTOMIZATION_MODULE_ID);
      assignments = cust?.assignments ?? {};
    } catch {
      /* column-customization not mounted — fall back to virtual defaults */
    }

    const virtualDefs = sorted.map((v) => {
      const assignment = assignments[v.colId];
      // Merge valueFormatterTemplate FIRST so the format is baked into
      // the base colDef (needed for the color resolver + SSF formatter).
      const merged: VirtualColumnDef =
        assignment?.valueFormatterTemplate !== undefined
          ? { ...v, valueFormatterTemplate: assignment.valueFormatterTemplate }
          : v;
      const base = buildVirtualColDef(merged, engine, cache);

      if (!assignment) return base;

      const layered = { ...base };
      if (assignment.headerName !== undefined) layered.headerName = assignment.headerName;
      if (assignment.headerTooltip !== undefined) layered.headerTooltip = assignment.headerTooltip;
      if (assignment.initialWidth !== undefined) layered.initialWidth = assignment.initialWidth;
      if (assignment.initialHide !== undefined) layered.initialHide = assignment.initialHide;
      if (assignment.initialPinned !== undefined) layered.initialPinned = assignment.initialPinned;

      // Attach cellClass / headerClass so column-customization's injected
      // CSS reaches virtual cells too. The colId is encoded with the
      // shared `cssEscapeColId` so dotted/bracketed virtual col ids
      // produce class names that survive the CSS-selector parser.
      const safeId = cssEscapeColId(v.colId);
      if (assignment?.cellStyleOverrides !== undefined) {
        const cls = `ds-col-c-${safeId}`;
        const existing = base.cellClass;
        layered.cellClass = Array.isArray(existing) ? [...existing, cls]
          : typeof existing === 'string' ? [existing, cls] : cls;
      }

      // Header class when the user either set header styling OR set cell
      // alignment in EITHER theme slot (headers inherit the cell's
      // alignment by default).
      const cellAlignmentAny =
        assignment?.cellStyleOverrides?.dark?.alignment?.horizontal !== undefined ||
        assignment?.cellStyleOverrides?.light?.alignment?.horizontal !== undefined;
      const needsHeaderClass =
        assignment?.headerStyleOverrides !== undefined || cellAlignmentAny;
      if (needsHeaderClass) {
        const cls = `ds-hdr-c-${safeId}`;
        const existing = base.headerClass;
        layered.headerClass = Array.isArray(existing) ? [...existing, cls]
          : typeof existing === 'string' ? [existing, cls] : cls;
      }

      if (assignment.filter !== undefined) {
        applyFilterConfigToColDef(layered, assignment.filter as ColumnFilterConfig);
      }
      if (assignment.rowGrouping !== undefined) {
        applyRowGroupingConfigToColDef(
          layered,
          assignment.rowGrouping as RowGroupingConfig,
          ctx.resources.expression(),
        );
      }

      return layered;
    });

    return [...defs, ...virtualDefs];
  },

  serialize: (state) => state,

  deserialize: (raw) => {
    if (!raw || typeof raw !== 'object') {
      return { virtualColumns: [...INITIAL_CALCULATED_COLUMNS.virtualColumns] };
    }
    const d = raw as Partial<CalculatedColumnsState>;
    const rawCols = Array.isArray(d.virtualColumns) ? d.virtualColumns : [];
    // Back-compat: pre-discriminated-union builds stored
    // `valueFormatterTemplate` as a bare expression string. Coerce
    // into `{kind:'expression'}` so downstream code only ever sees the
    // union. Note: this path emits an expression-kind template that
    // the security policy (`configureExpressionPolicy`) may then reject
    // under strict mode at compile time.
    const virtualColumns = rawCols.map((v) => {
      const t = (v as unknown as { valueFormatterTemplate?: unknown }).valueFormatterTemplate;
      if (typeof t === 'string') {
        return {
          ...v,
          valueFormatterTemplate: t.length > 0
            ? { kind: 'expression' as const, expression: t }
            : undefined,
        };
      }
      return v;
    });
    return { virtualColumns };
  },

  // v4: expose master-detail panes natively so the settings sheet
  // renders the proper two-column layout instead of the legacy flat
  // fallback. `SettingsPanel` is still wired for host apps that mount
  // a single panel (simple embeds, tests).
  ListPane: CalculatedColumnsList,
  EditorPane: CalculatedColumnsEditor,
  SettingsPanel: CalculatedColumnsPanel,
};

export { INITIAL_CALCULATED_COLUMNS };
export type { CalculatedColumnsState, VirtualColumnDef };
