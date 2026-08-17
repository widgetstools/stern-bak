import { useCallback, useMemo, useState } from 'react';
import {
  assertSingleColumnSelection,
  bulkUpdateValueKind,
} from '@wellsfargo-starui/core';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@wellsfargo-starui/react';
import type { EditingToolbarSegmentProps } from '../../editing/editingToolbarLayout';
import { resolveEditRecording } from '../../editing/recordEdit';
import { useGridPlatform } from '../../hooks/GridProvider';
import { useEditingSlice } from '../editing/useEditingSlice';
import {
  editingToolbarInputClasses,
  editingToolbarFieldWidthStyle,
  editingToolbarInputColumns,
  editingToolbarNumericInputClasses,
  editingToolbarSelectContentClasses,
  editingToolbarSelectTriggerClasses,
  EDITING_TOOLBAR_POPOVER,
  EditingToolbarApplyButton,
  EditingToolbarSegment,
} from '../../../widget/editingToolbar/EditingToolbarPrimitives';
import { cellCountLabel } from '../../editing/applyAndRecord';
import { useBulkUpdateSelection } from './useBulkUpdateSelection';
import { useColumnDistinctValues } from './useColumnDistinctValues';
import { applyBulkUpdateEdits, resolveBulkUpdateTargets } from './runtime/applyBulkUpdateEdits';

function formatDistinctLabel(value: unknown): string {
  if (value == null || value === '') return '(empty)';
  return String(value);
}

export function BulkUpdateToolbarBody({ layout = 'standalone' }: EditingToolbarSegmentProps) {
  const platform = useGridPlatform();
  const [settings] = useEditingSlice('bulkUpdate');
  const { count, cells, unreachableRows } = useBulkUpdateSelection();
  const [value, setValue] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  // The port's own copy for "rows outside the loaded range can't be reached" —
  // one reason string, written once, rendered verbatim wherever the limit
  // bites. A capability read, not a row-model branch.
  const unreachableReason = unreachableRows > 0
    ? platform.data.capabilities.canAddressUnloadedRows.reason
    : '';

  const columnGuard = useMemo(() => {
    if (!settings.settings.enforceSingleColumn) return { ok: true as const };
    return assertSingleColumnSelection(cells);
  }, [cells, settings.settings.enforceSingleColumn]);

  const journalRecording = useMemo(
    () => resolveEditRecording(platform, 'bulk-update', settings.settings.recordHistory),
    [platform, settings.settings.recordHistory],
  );

  const valueKind = useMemo(
    () => bulkUpdateValueKind(cells[0]?.cellDataType),
    [cells],
  );

  const { values: distinctValues } = useColumnDistinctValues(
    platform.data,
    cells[0]?.colId,
    settings.settings.maxDropdownValues,
    settings.settings.showDistinctValues,
  );

  const executeApply = useCallback(async () => {
    const api = platform.api.api;
    if (!api || !settings.settings.enabled || !value.trim()) return;

    const { targets } = resolveBulkUpdateTargets(api);
    if (targets.length === 0) return;

    if (settings.settings.enforceSingleColumn) {
      const guard = assertSingleColumnSelection(targets);
      if (!guard.ok) return;
    }

    const colLabel = targets[0]?.field ?? 'cells';
    await applyBulkUpdateEdits(platform, targets, value, {
      journal: journalRecording.record ? journalRecording.journal : null,
      journalLabel: (applied) =>
        `Bulk set ${colLabel} → ${value.trim()} · ${cellCountLabel(applied)}`,
    });
  }, [platform, settings.settings.enabled, settings.settings.enforceSingleColumn, value, journalRecording]);

  const beginApply = useCallback(() => {
    const api = platform.api.api;
    if (!api || !settings.settings.enabled || !value.trim()) return;

    const { targets, unreachableRows: unreachable } = resolveBulkUpdateTargets(api);
    if (targets.length === 0) return;

    if (settings.settings.enforceSingleColumn) {
      const guard = assertSingleColumnSelection(targets);
      if (!guard.ok) return;
    }

    // Confirm whenever the selection reaches past what the grid holds, however
    // small it is: the user is about to change fewer rows than they selected,
    // and that is exactly the outcome they cannot see for themselves.
    if (
      unreachable > 0
      || (settings.settings.confirmThreshold > 0
        && targets.length > settings.settings.confirmThreshold)
    ) {
      setConfirmOpen(true);
      return;
    }

    void executeApply();
  }, [platform, settings.settings, value, executeApply]);

  const disabled = !settings.settings.enabled || count === 0 || !columnGuard.ok || !value.trim();

  const showDistinctPicker =
    settings.settings.showDistinctValues && distinctValues.length > 0;

  const bulkFieldCols =
    valueKind === 'number'
      ? editingToolbarInputColumns(value, { min: 4, max: 8 })
      : editingToolbarInputColumns(value || 'New…', { min: 5, max: 12 });

  const valueInput = (
    <Input
      className={
        valueKind === 'number'
          ? editingToolbarNumericInputClasses()
          : editingToolbarInputClasses('ex-field-grow')
      }
      style={editingToolbarFieldWidthStyle(bulkFieldCols)}
      data-testid="bulk-update-value-input"
      type={valueKind === 'number' ? 'number' : valueKind === 'date' ? 'date' : 'text'}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      placeholder={valueKind === 'date' ? 'YYYY-MM-DD' : 'New value…'}
      aria-label="Bulk update value"
      inputMode={valueKind === 'number' ? 'decimal' : undefined}
    />
  );

  const distinctPicker = showDistinctPicker ? (
    <Select
      onValueChange={(picked) => setValue(picked === '__empty__' ? '' : picked)}
    >
      <SelectTrigger
        className={editingToolbarSelectTriggerClasses()}
        data-testid="bulk-update-value-select"
        aria-label="Pick existing column value"
      >
        <SelectValue placeholder="Existing…" />
      </SelectTrigger>
      <SelectContent className={editingToolbarSelectContentClasses(EDITING_TOOLBAR_POPOVER)}>
        {distinctValues.map((v) => {
          const label = formatDistinctLabel(v);
          const pickValue = label === '(empty)' ? '__empty__' : label;
          return (
            <SelectItem key={label} value={pickValue} className="text-xs">
              {label}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  ) : null;

  if (!settings.settings.enabled) return null;

  return (
    <>
      <EditingToolbarSegment
        layout={layout}
        label="Bulk"
        data-testid="bulk-update-toolbar"
        meta={(
          <span data-testid="bulk-update-count">
            {count} selected
            {unreachableRows > 0 && (
              <span data-testid="bulk-update-unreachable">
                {' · '}{unreachableRows} not loaded
              </span>
            )}
          </span>
        )}
      >
        {valueInput}
        {distinctPicker}
        <Tooltip>
          <TooltipTrigger asChild>
            <EditingToolbarApplyButton
              data-testid="bulk-update-apply"
              disabled={disabled}
              onClick={beginApply}
            />
          </TooltipTrigger>
          {!columnGuard.ok ? (
            <TooltipContent>Select cells in a single column only</TooltipContent>
          ) : unreachableReason ? (
            <TooltipContent>{unreachableReason}</TooltipContent>
          ) : (
            <TooltipContent>Apply bulk update</TooltipContent>
          )}
        </Tooltip>
      </EditingToolbarSegment>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apply bulk update?</AlertDialogTitle>
            <AlertDialogDescription data-testid="bulk-update-confirm-description">
              This will update {count} cells. Continue?
              {unreachableReason && (
                <>
                  {' '}
                  {unreachableRows} selected {unreachableRows === 1 ? 'row is' : 'rows are'} not
                  loaded and will not change. {unreachableReason}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              data-testid="bulk-update-confirm-apply"
              onClick={() => {
                setConfirmOpen(false);
                void executeApply();
              }}
            >
              Apply
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
