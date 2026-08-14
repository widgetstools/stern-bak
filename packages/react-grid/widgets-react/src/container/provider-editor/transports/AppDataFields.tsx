/**
 * AppDataFields — AG-Grid table editor for AppData key/value pairs.
 *
 * AppData is a small key-value store, NOT a streaming source.
 * Other providers reference its keys via `{{name.key}}` templates.
 * Common entries:
 *   - `positions.asOfDate` — bound to the historical date picker
 *   - `positions.clientId` — the user's account scope token
 *   - `auth.token`        — bearer token shared across REST cfgs
 *
 * UI: simple form on top to add new pairs, AG-Grid table shows all
 * existing pairs with inline editing and delete action.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type { ColDef, CellValueChangedEvent, GetRowIdParams, ICellRendererParams } from 'ag-grid-community';
import { Button, Input, Label } from '@wellsfargo-starui/react';
import { Plus, Trash2 } from 'lucide-react';
import type { AppDataVariable, AppDataProviderConfig } from '@wellsfargo-starui/types/shared';
import { useAgGridTheme } from '../../../theme/useAgGridTheme.js';
import { ensureAgGridModules } from '@wellsfargo-starui/grid';

export interface AppDataFieldsProps {
  cfg: AppDataProviderConfig;
  onChange(next: Partial<AppDataProviderConfig>): void;
}

type RowData = AppDataVariable & { _rowId: string };

export function AppDataFields({ cfg, onChange }: AppDataFieldsProps) {
  ensureAgGridModules();
  const { theme: gridTheme } = useAgGridTheme();

  const defaultColDef = useMemo<ColDef>(() => ({
    sortable: true,
    resizable: true,
    filter: 'agMultiColumnFilter',
    filterParams: {
      filters: [
        {
          filter: 'agTextColumnFilter',
          filterParams: { buttons: ['reset'], debounceMs: 200 },
        },
        { filter: 'agSetColumnFilter' },
      ],
    },
    floatingFilter: true,
    suppressHeaderMenuButton: true,
  }), []);

  const statusBar = useMemo(() => ({
    statusPanels: [
      { statusPanel: 'agTotalAndFilteredRowCountComponent', align: 'left' as const },
      { statusPanel: 'agSelectedRowCountComponent', align: 'center' as const },
      { statusPanel: 'agAggregationComponent', align: 'right' as const },
    ],
  }), []);

  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');

  const variables = useMemo(() => {
    const vars = cfg.variables ?? {};
    // Clean up any old temp entries from previous editor versions
    const cleaned: Record<string, AppDataVariable> = {};
    for (const [key, v] of Object.entries(vars)) {
      if (!key.startsWith('__editing_')) {
        cleaned[key] = v;
      }
    }
    return cleaned;
  }, [cfg.variables]);

  const existingKeys = useMemo(() => new Set(Object.keys(variables)), [variables]);

  const handleAddPair = useCallback(() => {
    if (!newKey.trim() || existingKeys.has(newKey)) return;

    const newVariable: AppDataVariable = {
      key: newKey,
      value: newValue,
      type: 'string',
    };

    onChange({
      variables: {
        ...variables,
        [newKey]: newVariable,
      },
    });

    setNewKey('');
    setNewValue('');
  }, [newKey, newValue, variables, existingKeys, onChange]);

  const rowData = useMemo<RowData[]>(
    () =>
      Object.entries(variables)
        .filter(([key]) => !key.startsWith('__editing_')) // Filter out incomplete temp entries
        .map(([key, v], idx) => ({
          ...v,
          _rowId: `${key}-${idx}`,
        })),
    [variables],
  );

  const getRowId = useCallback((p: GetRowIdParams<RowData>) => p.data._rowId, []);

  const onCellValueChanged = useCallback(
    (e: CellValueChangedEvent<RowData>) => {
      const originalKey = e.data.key;
      const newKey = e.colDef.field === 'key' ? e.newValue : originalKey;
      const patchField = e.colDef.field as string;
      const patchValue =
        patchField === 'value' ? normalizeStoredValue(e.newValue) : e.newValue;

      onChange({
        variables: Object.entries(variables).reduce(
          (acc, [key, v]) => {
            // Skip temp entries
            if (key.startsWith('__editing_')) return acc;
            if (v.key === originalKey) {
              acc[newKey] = { ...v, [patchField]: patchValue };
            } else {
              acc[key] = v;
            }
            return acc;
          },
          {} as Record<string, AppDataVariable>,
        ),
      });
    },
    [variables, onChange],
  );

  const onDelete = useCallback(
    (rowId: string) => {
      const keyToDelete = rowData.find((r) => r._rowId === rowId)?.key;
      if (!keyToDelete) return;

      onChange({
        variables: Object.entries(variables).reduce(
          (acc, [key, v]) => {
            // Skip temp entries and the one being deleted
            if (key.startsWith('__editing_') || v.key === keyToDelete) return acc;
            acc[key] = v;
            return acc;
          },
          {} as Record<string, AppDataVariable>,
        ),
      });
    },
    [variables, rowData, onChange],
  );

  const onDeleteRef = useRef(onDelete);
  onDeleteRef.current = onDelete;

  const colDefs = useMemo<ColDef<RowData>[]>(
    () => [
      {
        field: 'key',
        headerName: 'Key',
        flex: 1,
        editable: true,
        cellClass: 'font-mono',
        cellDataType: 'text',
      },
      {
        field: 'value',
        headerName: 'Value',
        flex: 2,
        editable: true,
        cellClass: 'font-mono',
        // AppData values are free-form strings — disable AG Grid inference
        // that turns the whole column into a date editor when one row looks
        // like YYYY-MM-DD (e.g. position_history_date).
        cellDataType: 'text',
      },
      {
        headerName: '',
        width: 44,
        maxWidth: 44,
        resizable: false,
        sortable: false,
        editable: false,
        suppressHeaderMenuButton: true,
        suppressMovable: true,
        suppressNavigable: true,
        cellClass: 'cursor-pointer',
        cellRenderer: DeleteIconCell,
        onCellClicked: (event) => {
          const rowId = event.data?._rowId;
          if (rowId) onDeleteRef.current(rowId);
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 min-h-0 flex flex-col p-3 gap-3 overflow-hidden">
        <div className="rounded-md border border-border bg-card px-3 py-2.5 flex-shrink-0">
          <Label className="text-[11px] font-medium text-muted-foreground block mb-2">
            Add New Variable
          </Label>
          <div className="flex items-end gap-2">
            <div className="flex-1 min-w-0 space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground">Key *</label>
              <Input
                placeholder="e.g., asOfDate"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                className="h-8 text-xs"
              />
              {existingKeys.has(newKey) && newKey && (
                <p className="text-[10px] text-destructive">Key already exists</p>
              )}
            </div>

            <div className="flex-1 min-w-0 space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground">Value</label>
              <Input
                placeholder="value"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                className="h-8 text-xs"
              />
            </div>

            <Button
              size="sm"
              onClick={handleAddPair}
              disabled={!newKey.trim() || existingKeys.has(newKey)}
              className="h-8"
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add
            </Button>
          </div>
        </div>

        <div className="flex-1 min-h-0">
          <AgGridReact<RowData>
            theme={gridTheme}
            rowData={rowData}
            columnDefs={colDefs}
            getRowId={getRowId}
            singleClickEdit
            onCellValueChanged={onCellValueChanged}
            headerHeight={28}
            rowHeight={32}
            defaultColDef={defaultColDef}
            statusBar={statusBar}
            suppressContextMenu
            overlayNoRowsTemplate='<span class="text-xs text-muted-foreground">No variables yet. Add one using the form above.</span>'
          />
        </div>
      </div>
    </div>
  );
}

/** Keep AppData values as plain scalars even if AG Grid passes a Date. */
function normalizeStoredValue(raw: unknown): AppDataVariable['value'] {
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  if (raw === null || raw === undefined) return '';
  return raw as AppDataVariable['value'];
}

function DeleteIconCell(_params: ICellRendererParams<RowData>) {
  return (
    <span
      className="inline-flex h-6 w-6 items-center justify-center text-destructive"
      title="Remove variable"
    >
      <Trash2 className="h-3 w-3" />
    </span>
  );
}

