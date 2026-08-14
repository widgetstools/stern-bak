/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo } from "react";
import { AgGridReact } from "ag-grid-react";
import type { CellStyle, ColDef, GridOptions, RowClickedEvent } from "ag-grid-community";
import { AllCommunityModule, ModuleRegistry } from "ag-grid-community";
import { StatusBarModule } from "ag-grid-enterprise";
import { configBrowserGridTheme } from "../agGridTheme";

ModuleRegistry.registerModules([AllCommunityModule, StatusBarModule]);

interface DataGridProps {
  rows: any[];
  quickFilter: string;
  primaryKey: string;
  onRowClick: (row: any) => void;
}

/**
 * Budgeted JSON preview — serializes only as much of `v` as fits the
 * cell. `JSON.stringify(wholeObject)` here was the Config Browser's
 * dominant open/scroll cost: appConfig rows carry multi-hundred-KB
 * config payloads (a seeded workspace doc alone is ~5000 lines), and
 * the formatter stringified EVERY one of them per rendered cell per
 * repaint just to show 80 characters. This walk is O(budget), not
 * O(object size).
 */
export function previewJson(v: unknown, budget: number): string {
  let out = "";
  const push = (s: string): boolean => {
    out += s;
    return out.length < budget;
  };
  const walk = (x: unknown): boolean => {
    if (x === null || x === undefined) return push("null");
    switch (typeof x) {
      case "string":
        return push(JSON.stringify(x));
      case "number":
      case "boolean":
        return push(String(x));
      case "object": {
        if (Array.isArray(x)) {
          if (!push("[")) return false;
          for (let i = 0; i < x.length; i++) {
            if (i > 0 && !push(",")) return false;
            if (!walk(x[i])) return false;
          }
          return push("]");
        }
        if (!push("{")) return false;
        let first = true;
        for (const k of Object.keys(x)) {
          if (!first && !push(",")) return false;
          first = false;
          if (!push(`${JSON.stringify(k)}:`)) return false;
          if (!walk((x as Record<string, unknown>)[k])) return false;
        }
        return push("}");
      }
      default:
        return push('""');
    }
  };
  walk(v);
  return out.length >= budget ? out.slice(0, budget) + "…" : out;
}

/**
 * Generic AG-Grid wrapper. Auto-derives columns from the first row's
 * keys; object/array values are rendered as truncated JSON so you
 * always see *something* in the cell. Click a row to open the JSON
 * editor drawer.
 */
export function DataGrid({
  rows,
  quickFilter,
  primaryKey,
  onRowClick,
}: DataGridProps) {
  const columnDefs = useMemo<ColDef[]>((): ColDef[] => {
    if (rows.length === 0) return [];
    const keys = Object.keys(rows[0]);
    // PK column first
    const ordered = [primaryKey, ...keys.filter((k) => k !== primaryKey)];
    return ordered.map((key) => ({
      field: key,
      headerName: key,
      pinned: key === primaryKey ? "left" : undefined,
      width: key === primaryKey ? 220 : undefined,
      valueFormatter: (params) => {
        const v = params.value;
        if (v === undefined || v === null) return "";
        if (typeof v === "object") return previewJson(v, 80);
        if (typeof v === "boolean") return v ? "true" : "false";
        return String(v);
      },
      // Quick filter otherwise stringifies whole object values per row
      // — same O(size) trap as the formatter. Match on the preview.
      getQuickFilterText: (params) => {
        const v = params.value;
        if (v === undefined || v === null) return "";
        if (typeof v === "object") return previewJson(v, 200);
        return String(v);
      },
      cellStyle: (params: any): CellStyle | null => {
        if (params.value === undefined || params.value === null) {
          return { color: "var(--de-text-ghost)", fontStyle: "italic" } as CellStyle;
        }
        if (typeof params.value === "object") {
          return { fontFamily: "var(--ds-font-mono)", color: "var(--de-text-secondary)" } as CellStyle;
        }
        if (key === primaryKey) {
          return { fontFamily: "var(--ds-font-mono)", fontWeight: "600" } as CellStyle;
        }
        return null;
      },
    }));
  }, [rows, primaryKey]);

  // Plain text filter, no floating filter row. The multi-filter
  // (text + set) with per-column floating filters initialised filter
  // UI for EVERY column at mount — a large share of the dialog's open
  // cost — and a set filter over huge JSON payload columns was never
  // useful. The toolbar quick filter + header-menu text filter cover
  // this internal tool's real usage.
  const defaultColDef = useMemo<ColDef>(() => ({
    sortable: true,
    resizable: true,
    filter: "agTextColumnFilter",
    filterParams: { buttons: ["reset"], debounceMs: 200 },
    minWidth: 80,
    flex: 1,
  }), []);

  const statusBar = useMemo(() => ({
    statusPanels: [
      { statusPanel: "agTotalAndFilteredRowCountComponent", align: "left" as const },
      { statusPanel: "agSelectedRowCountComponent", align: "center" as const },
      { statusPanel: "agAggregationComponent", align: "right" as const },
    ],
  }), []);

  const gridOptions = useMemo<GridOptions>(
    () => ({
      rowHeight: 32,
      headerHeight: 34,
      suppressCellFocus: true,
      animateRows: false,
    }),
    [],
  );

  const handleRowClick = (e: RowClickedEvent) => {
    if (e.data) onRowClick(e.data);
  };

  // Key rows by their primary key so AG Grid diffs an updated `rows` array
  // (single-row optimistic save/delete) and mutates only the changed row,
  // instead of re-rendering the whole table on every mutation.
  const getRowId = useMemo(
    () => (params: { data: any }) => String(params.data?.[primaryKey]),
    [primaryKey],
  );

  return (
    <div style={{ flex: 1, minHeight: 0, width: "100%", position: "relative" }}>
      <AgGridReact
        theme={configBrowserGridTheme}
        rowData={rows}
        getRowId={getRowId}
        columnDefs={columnDefs}
        defaultColDef={defaultColDef}
        statusBar={statusBar}
        gridOptions={gridOptions}
        quickFilterText={quickFilter}
        onRowClicked={handleRowClick}
      />
    </div>
  );
}
