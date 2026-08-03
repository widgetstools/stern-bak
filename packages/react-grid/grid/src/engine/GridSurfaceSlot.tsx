/**
 * The ONE place a grid surface is chosen and mounted.
 *
 * This component exists to make a specific bug unrepresentable rather than
 * merely absent. Exactly one grid may mount per `GridPlatform`, ever — a
 * stand-in that mounts and unmounts during the async Perspective attach fires
 * `onGridReady` (activating every module), then `onGridPreDestroyed`, which
 * destroys the platform PERMANENTLY. The real grid's later `onGridReady` then
 * lands on a dead platform, and every platform-driven feature goes silently
 * dead while AG's own features keep working. See `resolveGridSurface`.
 *
 * Because the host renders this and never a surface directly, there is no
 * code path in the host that can produce a client grid while a Perspective
 * attach is in flight. That is the structural part: the invariant is enforced
 * by there being nowhere else to put the branch, not by remembering a rule.
 */

import { type RefObject } from 'react';
import type { AgGridReact } from 'ag-grid-react';
import type { GetContextMenuItems, GridReadyEvent } from 'ag-grid-community';
import type { PerspectiveTableLike } from '@wellsfargo-starui/grid/perspective';
import { MarketsGridSurface } from '../widget/MarketsGridSurface.js';
import { PerspectiveMarketsGridSurface } from './PerspectiveMarketsGridSurface.js';
import { resolveGridSurface } from './resolveGridSurface.js';
import type { MarketsGridRowModel, PerspectiveGridQueries } from './types.js';

export interface GridSurfaceSlotProps<TData> {
  rowModel?: MarketsGridRowModel;
  /** `null` while attaching, `undefined` when unwired — both mount nothing. */
  perspectiveTable?: PerspectiveTableLike | null;
  /** Index column of the worker-held Table. Required for the Perspective path. */
  perspectiveKeyColumn?: string;
  /** Whole-book questions answered in the worker. */
  perspectiveQueries?: PerspectiveGridQueries | null;
  /** Calculated columns compiled to Perspective expression source. */
  perspectiveCalcExpressions?: Record<string, string>;
  /** Tree hierarchy fields, outermost first. */
  perspectiveTreeFields?: readonly string[];

  gridRef: RefObject<AgGridReact<TData> | null>;
  gridOptions: Record<string, unknown>;
  hostOverrideKeys: ReadonlySet<string>;
  theme: unknown;
  rowData: TData[];
  columnDefs: unknown[];
  rowHeight?: number;
  headerHeight?: number;
  animateRows?: boolean;
  sideBar?: unknown;
  statusBar?: unknown;
  defaultColDef?: unknown;
  getContextMenuItems?: GetContextMenuItems;
  onGridReady: (event: GridReadyEvent) => void;
  onGridPreDestroyed: () => void;
  includeAllStreamSafeFilters?: boolean;
}

/**
 * What `'pending'` renders. Deliberately a sized, empty box rather than
 * `null`: the flex layout above it must not collapse while the attach runs,
 * or the toolbar jumps and then jumps back.
 */
function PendingSurface() {
  return (
    <div
      style={{ flex: 1, minHeight: 0 }}
      data-testid="grid-surface-pending"
      data-grid-surface="pending"
    />
  );
}

export function GridSurfaceSlot<TData>(props: GridSurfaceSlotProps<TData>) {
  const choice = resolveGridSurface({
    rowModel: props.rowModel,
    perspectiveTable: props.perspectiveTable,
  });

  if (choice === 'pending') return <PendingSurface />;

  if (choice === 'perspective') {
    return (
      <PerspectiveMarketsGridSurface
        table={props.perspectiveTable as PerspectiveTableLike}
        keyColumn={props.perspectiveKeyColumn ?? 'id'}
        gridRef={props.gridRef as RefObject<AgGridReact | null>}
        gridOptions={props.gridOptions}
        hostOverrideKeys={props.hostOverrideKeys}
        theme={props.theme as never}
        columnDefs={props.columnDefs}
        rowHeight={props.rowHeight}
        headerHeight={props.headerHeight}
        sideBar={props.sideBar}
        statusBar={props.statusBar}
        defaultColDef={props.defaultColDef}
        getContextMenuItems={props.getContextMenuItems}
        onGridReady={props.onGridReady}
        onGridPreDestroyed={props.onGridPreDestroyed}
        includeAllStreamSafeFilters={props.includeAllStreamSafeFilters}
        queries={props.perspectiveQueries ?? null}
        calcExpressions={props.perspectiveCalcExpressions}
        treeFields={props.perspectiveTreeFields}
      />
    );
  }

  return (
    <MarketsGridSurface
      gridRef={props.gridRef}
      gridOptions={props.gridOptions}
      hostOverrideKeys={props.hostOverrideKeys}
      theme={props.theme as never}
      rowData={props.rowData}
      columnDefs={props.columnDefs}
      rowHeight={props.rowHeight}
      headerHeight={props.headerHeight}
      animateRows={props.animateRows}
      sideBar={props.sideBar as never}
      statusBar={props.statusBar as never}
      defaultColDef={props.defaultColDef as never}
      getContextMenuItems={props.getContextMenuItems}
      onGridReady={props.onGridReady}
      onGridPreDestroyed={props.onGridPreDestroyed}
      includeAllStreamSafeFilters={props.includeAllStreamSafeFilters}
    />
  );
}
