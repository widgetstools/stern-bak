import { useMemo, type CSSProperties } from 'react';
import type { ColDef, GridReadyEvent } from 'ag-grid-community';
import type { ISsrmDataProvider } from '@wellsfargo-starui/data';
import { useGridTheme } from './theme/useGridTheme.js';
import { SsrmAgGrid } from '../ssrm/SsrmAgGrid.js';
import {
  ssrmCellStyle,
  ssrmEditable,
} from '../ssrm/expressionBindings.js';

export interface SsrmMarketsGridProps {
  provider: ISsrmDataProvider;
  columnDefs?: ColDef[];
  keyColumn?: string;
  getQuickFilterText?: () => string;
  style?: CSSProperties;
  className?: string;
  onGridReady?: (event: GridReadyEvent) => void;
  /** Optional caption above the grid. */
  title?: string;
}

/**
 * SSRM MarketsGrid — Quartz-themed shell over {@link SsrmAgGrid}.
 * Full CSRM MarketsGrid module chrome is intentionally not forked here;
 * formatting / calculated columns that need the worker plane are pushed
 * via `provider.configureExpressions` from the container.
 */
export function SsrmMarketsGrid(props: SsrmMarketsGridProps) {
  const {
    provider,
    columnDefs: columnDefsProp,
    keyColumn = 'id',
    getQuickFilterText,
    style,
    className,
    onGridReady,
    title,
  } = props;

  const theme = useGridTheme();

  const columnDefs = useMemo(() => {
    let fromProvider: ColDef[] = [];
    try {
      fromProvider = provider.getColumnDefs().map((c) => ({
        field: c.field,
        headerName: c.headerName ?? c.field,
        width: c.width,
        hide: c.hide,
        enableRowGroup: true,
        enablePivot: true,
        enableValue: true,
      })) as ColDef[];
    } catch {
      fromProvider = [];
    }
    const base = columnDefsProp?.length ? columnDefsProp : fromProvider;
    return base.map((col) => {
      if (col.field === 'pnl' || col.field === 'currentPrice') {
        return {
          ...col,
          cellStyle: ssrmCellStyle,
          editable:
            col.field === 'currentPrice'
              ? ssrmEditable('currentPrice')
              : col.editable,
        };
      }
      return col;
    });
  }, [columnDefsProp, provider]);

  return (
    <div
      className={className}
      style={{
        height: '100%',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        ...style,
      }}
    >
      {title ? (
        <div
          style={{
            flex: '0 0 auto',
            padding: '8px 12px',
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          {title}
        </div>
      ) : null}
      <div style={{ flex: 1, minHeight: 0 }}>
        <SsrmAgGrid
          provider={provider}
          columnDefs={columnDefs}
          keyColumn={keyColumn}
          getQuickFilterText={getQuickFilterText}
          theme={theme}
          sideBar
          onGridReady={onGridReady}
          gridOptions={{
            rowGroupPanelShow: 'always',
            groupDisplayType: 'singleColumn',
            // grandTotalRow requires CSRM hierarchy modules in AG Grid 35.1
            // validation when used with SSRM — omit for v1; status bar covers totals.
            serverSidePivotResultFieldSeparator: '_',
          }}
        />
      </div>
    </div>
  );
}
