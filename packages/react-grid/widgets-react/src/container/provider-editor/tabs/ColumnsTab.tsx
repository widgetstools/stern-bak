/**
 * ColumnsTab — review + lightly edit the column definitions chosen on
 * FieldsTab.
 *
 * Uses AG-Grid for display so the list scales to hundreds
 * of columns without DOM bloat. Features:
 *   - drag-to-reorder rows
 *   - inline edit for Header Name
 *   - dropdown select for Cell Data Type
 *   - delete row
 *   - Key Column picker (single or composite)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type {
  ColDef,
  CellClickedEvent,
  CellValueChangedEvent,
  GetRowIdParams,
  ICellRendererParams,
  RowDragEndEvent,
} from 'ag-grid-community';
import {
  Button, Collapsible, CollapsibleContent, CollapsibleTrigger,
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
  Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@wellsfargo-starui/react';
import { ChevronDown, Download, Plus, SquareFunction, Trash2, Upload } from 'lucide-react';
import { ExpressionEditor } from '@wellsfargo-starui/grid/customizer';
import { ExpressionEngine } from '@wellsfargo-starui/engine';
import type { ColumnDefinition } from '@wellsfargo-starui/shared-types';
import { normalizeKeyColumns } from '@wellsfargo-starui/shared-types';
import { MultiSelect } from '../MultiSelect.js';
import { ensureProviderEditorAgGridModules } from '../ensureProviderEditorAgGridModules.js';
import { exportColumnDefs, parseColumnDefsImport } from '../columnDefsIo.js';
import { useAgGridTheme } from '../../../theme/useAgGridTheme.js';

const CELL_TYPES: ReadonlyArray<NonNullable<ColumnDefinition['cellDataType']>> = [
  'text', 'number', 'boolean', 'date', 'dateString', 'object',
];

type RowData = ColumnDefinition & { _rowId: string };

export interface ColumnsTabProps {
  columns: ColumnDefinition[];
  onChange(next: ColumnDefinition[]): void;
  /**
   * Current row-key configuration. Single string for a one-column
   * key, an array for a composite key (joined with `-` at runtime).
   */
  keyColumn: string | readonly string[] | undefined;
  /**
   * Receives the next selection. The editor wrapper decides how to
   * store it — empty → undefined, single → string, multi → array.
   */
  onKeyColumnChange(next: readonly string[]): void;
}

export function ColumnsTab({ columns, onChange, keyColumn, onKeyColumnChange }: ColumnsTabProps) {
  ensureProviderEditorAgGridModules();
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

  // Form state for adding new columns
  const [newFieldName, setNewFieldName] = useState('');
  const [newHeaderName, setNewHeaderName] = useState('');
  const [newDataType, setNewDataType] = useState<NonNullable<ColumnDefinition['cellDataType']>>('text');

  const fieldNames = useMemo(() => new Set(columns.map((c) => c.field)), [columns]);

  // Clear all columns — wipes the column list AND the (now-stale) key
  // column. Confirmed via dialog since it's a full reset (recoverable by
  // re-picking fields on the Fields tab).
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const handleClearAll = useCallback(() => {
    onChange([]);
    onKeyColumnChange([]);
    setConfirmClearOpen(false);
  }, [onChange, onKeyColumnChange]);

  // ── Export / Import column defs (JSON) ────────────────────────────
  // Export writes a plain JSON array at full fidelity — including each
  // column's `valueGetter` DSL expression. Import replaces the column list
  // and prunes the key column to fields that survive the import.
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const importErrorTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(
    () => () => {
      if (importErrorTimer.current) clearTimeout(importErrorTimer.current);
    },
    [],
  );

  const flashImportError = useCallback((message: string) => {
    setImportError(message);
    if (importErrorTimer.current) clearTimeout(importErrorTimer.current);
    importErrorTimer.current = setTimeout(() => setImportError(null), 6000);
  }, []);

  const handleExport = useCallback(() => exportColumnDefs(columns), [columns]);

  const handleImportClick = useCallback(() => {
    setImportError(null);
    fileInputRef.current?.click();
  }, []);

  const handleImportFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      // Reset so re-importing the same file fires `change` again.
      e.target.value = '';
      if (!file) return;
      try {
        const imported = parseColumnDefsImport(await file.text());
        onChange(imported);
        // Drop any key-column entries whose field no longer exists.
        const present = new Set(imported.map((c) => c.field));
        const prunedKey = (normalizeKeyColumns(keyColumn) ?? []).filter((k) => present.has(k));
        onKeyColumnChange(prunedKey);
      } catch (err) {
        flashImportError(err instanceof Error ? err.message : 'Import failed.');
      }
    },
    [onChange, onKeyColumnChange, keyColumn, flashImportError],
  );

  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept="application/json,.json"
      className="hidden"
      data-testid="columns-tab-import-input"
      onChange={handleImportFile}
    />
  );

  const handleAddColumn = useCallback(() => {
    if (!newFieldName.trim()) return;
    if (fieldNames.has(newFieldName)) return;

    const newColumn: ColumnDefinition = {
      field: newFieldName,
      headerName: newHeaderName || newFieldName,
      cellDataType: newDataType,
    };

    onChange([...columns, newColumn]);
    setNewFieldName('');
    setNewHeaderName('');
    setNewDataType('text');
  }, [newFieldName, newHeaderName, newDataType, columns, onChange, fieldNames]);

  // Enrich with a stable row id so AG-Grid tracks rows across
  // parent-driven re-renders. field+idx handles duplicate field names.
  const rowData = useMemo<RowData[]>(
    () => columns.map((col, idx) => ({ ...col, _rowId: `${col.field}-${idx}` })),
    [columns],
  );

  const getRowId = useCallback((p: GetRowIdParams<RowData>) => p.data._rowId, []);

  const onCellValueChanged = useCallback(
    (e: CellValueChangedEvent<RowData>) => {
      const id = e.data._rowId;
      const next = columns.map((col, idx) =>
        `${col.field}-${idx}` === id
          ? { ...col, [e.colDef.field as string]: e.newValue }
          : col,
      );
      onChange(next);
    },
    [columns, onChange],
  );

  // After managed drag completes, read the new visual order from the grid.
  const onRowDragEnd = useCallback(
    (e: RowDragEndEvent<RowData>) => {
      const next: ColumnDefinition[] = [];
      e.api.forEachNode((node) => {
        if (!node.data) return;
        const { _rowId: _id, ...col } = node.data;
        next.push(col as ColumnDefinition);
      });
      onChange(next);
    },
    [onChange],
  );

  // Stable ref so colDefs (empty-dep memo) always call the latest
  // delete handler without needing to be recreated on each columns change.
  const onDelete = useCallback(
    (field: string) => onChange(removeColumnDefinition(columns, field)),
    [columns, onChange],
  );
  const onDeleteRef = useRef(onDelete);
  onDeleteRef.current = onDelete;

  // ── Value-expression editing ─────────────────────────────────────
  // Which column's `valueGetter` expression is open in the editor
  // dialog (by field). null = closed.
  const [editingField, setEditingField] = useState<string | null>(null);

  const onEditExpression = useCallback((field: string) => setEditingField(field), []);
  const onEditExpressionRef = useRef(onEditExpression);
  onEditExpressionRef.current = onEditExpression;

  const editingColumn = useMemo(
    () => (editingField ? columns.find((c) => c.field === editingField) ?? null : null),
    [editingField, columns],
  );

  // Commit an expression onto a column. Empty string clears the override
  // (drops the field) so the column reverts to its plain field binding.
  const setColumnExpression = useCallback(
    (field: string, expr: string) => {
      const trimmed = expr.trim();
      const next = columns.map((col) => {
        if (col.field !== field) return col;
        const { valueGetter: _drop, ...rest } = col;
        return trimmed ? { ...rest, valueGetter: trimmed } : rest;
      });
      onChange(next);
    },
    [columns, onChange],
  );

  const colDefs = useMemo<ColDef<RowData>[]>(
    () => [
      {
        rowDrag: true,
        width: 36,
        maxWidth: 36,
        resizable: false,
        sortable: false,
        filter: false,
        floatingFilter: false,
        suppressHeaderMenuButton: true,
        suppressMovable: true,
        headerName: '',
      },
      {
        field: 'field',
        headerName: 'Field',
        flex: 2,
        editable: false,
        cellClass: 'font-mono',
      },
      {
        field: 'headerName',
        headerName: 'Header',
        flex: 2,
        editable: true,
      },
      {
        field: 'cellDataType',
        headerName: 'Type',
        width: 140,
        editable: true,
        cellEditor: 'agSelectCellEditor',
        cellEditorParams: { values: [...CELL_TYPES] },
        // Default absent cellDataType to 'text' (matches AG-Grid's own default).
        valueGetter: (p) => p.data?.cellDataType ?? 'text',
      },
      {
        headerName: '',
        width: 44,
        maxWidth: 44,
        resizable: false,
        sortable: false,
        filter: false,
        floatingFilter: false,
        editable: false,
        suppressHeaderMenuButton: true,
        suppressMovable: true,
        suppressNavigable: true,
        cellClass: 'cursor-pointer flex items-center justify-center !px-0',
        headerTooltip: 'Value expression',
        cellRenderer: ExpressionIconCell,
        onCellClicked: (event: CellClickedEvent<RowData>) => {
          const field = event.data?.field;
          if (field) onEditExpressionRef.current(field);
        },
      },
      {
        headerName: '',
        width: 44,
        maxWidth: 44,
        resizable: false,
        sortable: false,
        filter: false,
        floatingFilter: false,
        editable: false,
        suppressHeaderMenuButton: true,
        suppressMovable: true,
        suppressNavigable: true,
        cellClass: 'cursor-pointer flex items-center justify-center !px-0',
        cellRenderer: DeleteIconCell,
        onCellClicked: (event: CellClickedEvent<RowData>) => {
          const field = event.data?.field;
          if (field) onDeleteRef.current(field);
        },
      },
    ],
    // Empty deps: delete + edit-expression route through grid context +
    // refs (onDeleteRef / onEditExpressionRef).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  if (columns.length === 0) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <div className="text-center max-w-sm">
          <h3 className="text-sm font-semibold mb-1">No columns selected</h3>
          <p className="text-xs text-muted-foreground">
            Pick fields on the <strong>Fields</strong> tab and they'll appear here as
            grid columns. You can rename headers and adjust the cell type after.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Or import column definitions from a JSON file.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs mt-3"
            onClick={handleImportClick}
            data-testid="columns-tab-import-empty"
          >
            <Upload className="h-3.5 w-3.5 mr-1" />
            Import JSON
          </Button>
          {importError && (
            <p className="text-[11px] text-destructive mt-2" data-testid="columns-tab-import-error">
              {importError}
            </p>
          )}
        </div>
        {fileInput}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/*
        Body scrolls when the editor gets short: the two config panels keep
        their natural height and the grid keeps a usable floor (min-h), so the
        columns table never collapses to nothing in a small container. Users
        can also collapse either panel to hand more space back to the grid.
      */}
      <div className="flex-1 min-h-0 flex flex-col p-3 gap-3 overflow-y-auto scrollbar-thin">
        <KeyColumnPicker
          columns={columns}
          keyColumn={keyColumn}
          onChange={onKeyColumnChange}
        />

        <AddColumnForm
          newFieldName={newFieldName}
          newHeaderName={newHeaderName}
          newDataType={newDataType}
          onFieldNameChange={setNewFieldName}
          onHeaderNameChange={setNewHeaderName}
          onDataTypeChange={setNewDataType}
          onAddColumn={handleAddColumn}
          fieldNameExists={fieldNames.has(newFieldName)}
          fieldNameEmpty={!newFieldName.trim()}
        />

        <div className="flex items-center justify-between flex-shrink-0">
          <span className="text-[11px] font-medium text-muted-foreground">
            Columns ({columns.length})
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={handleExport}
              data-testid="columns-tab-export"
              title="Export column definitions as JSON (includes value expressions)"
            >
              <Download className="h-3.5 w-3.5 mr-1" />
              Export JSON
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={handleImportClick}
              data-testid="columns-tab-import"
              title="Import column definitions from a JSON file"
            >
              <Upload className="h-3.5 w-3.5 mr-1" />
              Import JSON
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-destructive hover:text-destructive"
              onClick={() => setConfirmClearOpen(true)}
              data-testid="columns-tab-clear-all"
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              Clear all columns
            </Button>
          </div>
        </div>

        {importError && (
          <p
            className="text-[11px] text-destructive flex-shrink-0 -mt-1"
            data-testid="columns-tab-import-error"
          >
            {importError}
          </p>
        )}
        {fileInput}

        <div className="flex-1 min-h-[220px]">
          <AgGridReact<RowData>
            theme={gridTheme}
            rowData={rowData}
            columnDefs={colDefs}
            getRowId={getRowId}
            rowDragManaged
            singleClickEdit
            onCellValueChanged={onCellValueChanged}
            onRowDragEnd={onRowDragEnd}
            headerHeight={28}
            rowHeight={32}
            defaultColDef={defaultColDef}
            statusBar={statusBar}
            suppressContextMenu
          />
        </div>
      </div>

      <Dialog open={confirmClearOpen} onOpenChange={setConfirmClearOpen}>
        <DialogContent className="max-w-sm" data-testid="columns-tab-clear-all-dialog">
          <DialogHeader>
            <DialogTitle className="text-sm">Clear all columns?</DialogTitle>
            <DialogDescription className="text-xs">
              Removes all {columns.length} column{columns.length === 1 ? '' : 's'} and the
              key column. You can re-add columns from the <strong>Fields</strong> tab.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={() => setConfirmClearOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="h-8 text-xs"
              onClick={handleClearAll}
              data-testid="columns-tab-clear-all-confirm"
            >
              Clear all
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {editingColumn && (
        <ExpressionEditorDialog
          column={editingColumn}
          columns={columns}
          onClose={() => setEditingField(null)}
          onSave={(expr) => {
            setColumnExpression(editingColumn.field, expr);
            setEditingField(null);
          }}
        />
      )}
    </div>
  );
}

// ─── Value-expression editor dialog ────────────────────────────────
//
// Hosts the shared Monaco `ExpressionEditor` (lazy-loaded) so users can
// author a DSL `valueGetter` for a single column. Column refs use
// bracket syntax (`[cusip]`, `[a.b.c]` for nested optional-chaining
// paths); the live column list feeds autocomplete. Empty clears the
// override.

function ExpressionEditorDialog({
  column,
  columns,
  onClose,
  onSave,
}: {
  column: ColumnDefinition;
  columns: ColumnDefinition[];
  onClose(): void;
  onSave(expr: string): void;
}) {
  const engine = useMemo(() => new ExpressionEngine(), []);
  const initial = column.valueGetter ?? '';
  const [draft, setDraft] = useState(initial);

  // Stable reference so Monaco's completion provider isn't re-registered
  // every keystroke.
  const columnsProvider = useCallback(
    () =>
      columns.map((c) => ({
        colId: c.field,
        headerName: c.headerName || c.field,
        dataType: c.cellDataType,
      })),
    [columns],
  );

  const trimmed = draft.trim();
  const validation = trimmed ? engine.validate(trimmed) : { valid: true, errors: [] };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl" data-testid="columns-tab-expression-dialog">
        <DialogHeader>
          <DialogTitle className="text-sm">
            Value expression — <span className="font-mono">{column.field}</span>
          </DialogTitle>
          <DialogDescription className="text-xs">
            Computes this column's value per row. Reference columns with{' '}
            <code className="text-foreground">[field]</code>; nested,
            optional-chaining paths like{' '}
            <code className="text-foreground">[a.b.c]</code> are supported and
            never throw. Leave empty to use the raw field value.
          </DialogDescription>
        </DialogHeader>

        <ExpressionEditor
          key={column.field}
          value={initial}
          multiline
          lines={6}
          onChange={setDraft}
          onCommit={setDraft}
          columnsProvider={columnsProvider}
          className="rounded-md border border-border"
          data-testid="columns-tab-expression-editor"
        />

        {!validation.valid && (
          <p className="text-[11px] text-destructive" data-testid="columns-tab-expression-error">
            {validation.errors[0]?.message}
          </p>
        )}

        <DialogFooter className="gap-2 sm:justify-end">
          {initial && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs mr-auto"
              onClick={() => onSave('')}
            >
              Clear
            </Button>
          )}
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="h-8 text-xs"
            disabled={!validation.valid}
            onClick={() => onSave(draft)}
          >
            Save expression
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add column form ───────────────────────────────────────────────
//
// Compact form to add custom columns to the grid. Field name is
// required and must be unique. Header name defaults to field name.

function AddColumnForm({
  newFieldName,
  newHeaderName,
  newDataType,
  onFieldNameChange,
  onHeaderNameChange,
  onDataTypeChange,
  onAddColumn,
  fieldNameExists,
  fieldNameEmpty,
}: {
  newFieldName: string;
  newHeaderName: string;
  newDataType: NonNullable<ColumnDefinition['cellDataType']>;
  onFieldNameChange(v: string): void;
  onHeaderNameChange(v: string): void;
  onDataTypeChange(v: NonNullable<ColumnDefinition['cellDataType']>): void;
  onAddColumn(): void;
  fieldNameExists: boolean;
  fieldNameEmpty: boolean;
}) {
  const canAdd = !fieldNameEmpty && !fieldNameExists;
  const [open, setOpen] = useState(true);

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="rounded-md border border-border bg-card flex-shrink-0"
    >
      <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 px-3 py-2 text-left">
        <span className="text-[11px] font-medium text-muted-foreground">
          Add Custom Column
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90" />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-3 pb-2.5">
      <div className="flex items-end gap-2">
        <div className="flex-1 min-w-0 space-y-1">
          <label className="text-[10px] font-medium text-muted-foreground">
            Field Name *
          </label>
          <Input
            placeholder="e.g., trade_id"
            value={newFieldName}
            onChange={(e) => onFieldNameChange(e.target.value)}
            className="h-8 text-xs"
          />
          {fieldNameExists && (
            <p className="text-[10px] text-destructive">Field already exists</p>
          )}
        </div>

        <div className="flex-1 min-w-0 space-y-1">
          <label className="text-[10px] font-medium text-muted-foreground">Header</label>
          <Input
            placeholder="(defaults to field name)"
            value={newHeaderName}
            onChange={(e) => onHeaderNameChange(e.target.value)}
            className="h-8 text-xs"
          />
        </div>

        <div className="w-32 space-y-1">
          <label className="text-[10px] font-medium text-muted-foreground">Type</label>
          <Select value={newDataType} onValueChange={onDataTypeChange}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CELL_TYPES.map((type) => (
                <SelectItem key={type} value={type} className="text-xs">
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          size="sm"
          onClick={onAddColumn}
          disabled={!canAdd}
          className="h-8"
          title={fieldNameEmpty ? 'Enter a field name' : fieldNameExists ? 'Field already exists' : 'Add column'}
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          Add
        </Button>
      </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ─── Value-expression cell renderer ───────────────────────────────
//
// ƒx affordance per row. Highlighted (primary) when the column already
// carries a `valueGetter` expression, muted otherwise. Click handling
// lives on the colDef (`onCellClicked`) so the empty-dep colDef memo
// stays stable.

function ExpressionIconCell(params: ICellRendererParams<RowData>) {
  const active =
    typeof params.data?.valueGetter === 'string' && params.data.valueGetter.trim().length > 0;
  return (
    <span
      className={`inline-flex h-6 w-6 items-center justify-center ${
        active ? 'text-primary' : 'text-muted-foreground'
      }`}
      data-testid="columns-tab-expression-cell"
      data-active={active}
      title={active ? 'Edit value expression' : 'Add value expression'}
    >
      <SquareFunction className="h-3.5 w-3.5" />
    </span>
  );
}

// ─── Delete cell renderer ──────────────────────────────────────────

export function removeColumnDefinition(
  columns: ColumnDefinition[],
  field: string,
): ColumnDefinition[] {
  return columns.filter((col) => col.field !== field);
}

function DeleteIconCell(_params: ICellRendererParams<RowData>) {
  return (
    <span
      className="inline-flex h-6 w-6 items-center justify-center text-destructive"
      data-testid="columns-tab-delete-row"
      title="Remove column"
    >
      <Trash2 className="h-3 w-3" />
    </span>
  );
}

// ─── Key column picker ─────────────────────────────────────────────
//
// One-column key OR composite key: picking N columns produces a row
// id that joins each column's value with `-` at runtime. Empty
// selection unsets the key (the editor will need to populate it
// before downstream consumers can stream rows correctly).

function KeyColumnPicker({
  columns,
  keyColumn,
  onChange,
}: {
  columns: ColumnDefinition[];
  keyColumn: string | readonly string[] | undefined;
  onChange(next: readonly string[]): void;
}) {
  const options = useMemo(
    () =>
      columns.map((c) => ({
        value: c.field,
        label: c.field,
        hint: c.cellDataType,
      })),
    [columns],
  );

  const value = useMemo(() => normalizeKeyColumns(keyColumn) ?? [], [keyColumn]);
  const composite = value.length > 1;
  const [open, setOpen] = useState(true);

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="rounded-md border border-border bg-card flex-shrink-0"
      data-testid="columns-tab-keycolumn"
    >
      <CollapsibleTrigger className="group flex w-full items-baseline justify-between gap-2 px-3 py-2 text-left">
        <span className="text-[11px] font-medium text-muted-foreground shrink-0">
          Key Column{value.length > 1 ? 's' : ''} <span className="text-destructive">*</span>
        </span>
        <span className="flex min-w-0 items-baseline gap-2">
          {/* When collapsed, surface the current key so it stays at a glance. */}
          {!open && value.length > 0 && (
            <span className="truncate text-[10px] font-mono text-muted-foreground">
              {value.join(', ')}
            </span>
          )}
          {open && composite && (
            <span className="truncate text-[10px] font-mono text-muted-foreground">
              id = {value.map((v) => `[${v}]`).join(' + "-" + ')}
            </span>
          )}
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90" />
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className="px-3 pb-2.5 space-y-1.5">
        <MultiSelect
          options={options}
          value={value}
          onChange={onChange}
          placeholder={columns.length === 0 ? 'Pick fields first…' : 'Select column(s)…'}
          emptyMessage="No columns — add fields on the Fields tab"
          disabled={columns.length === 0}
        />
        <p className="text-[11px] text-muted-foreground">
          Drives AG-Grid <code className="text-foreground">getRowId</code> + the worker-side
          cache key. Pick a single column for a simple key, or two or more for a composite key
          (values joined with <code className="text-foreground">-</code>).
        </p>
      </CollapsibleContent>
    </Collapsible>
  );
}
