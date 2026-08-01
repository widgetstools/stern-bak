import { useCallback, useMemo, useState } from 'react';
import {
  SMART_EDIT_MODULE_ID,
  assertSingleColumnSelection,
  previewPatches,
  type CellPatch,
  type SmartEditOp,
  type SmartEditState,
} from '@wellsfargo-starui/engine';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@wellsfargo-starui/react';
import type { EditingToolbarSegmentProps } from '../../editing/editingToolbarLayout';
import { resolveEditRecording } from '../../editing/recordEdit';
import { useGridPlatform } from '../../hooks/GridProvider';
import { useModuleState } from '../../hooks/useModuleState';
import {
  editingToolbarInputClasses,
  editingToolbarFieldWidthStyle,
  editingToolbarInputColumns,
  editingToolbarNumericInputClasses,
  EditingToolbarOpButton,
  EditingToolbarOpGroup,
  EditingToolbarSegment,
} from '../../../widget/editingToolbar/EditingToolbarPrimitives';
import { useSmartEditSelection } from './useSmartEditSelection';
import {
  applyEdits,
  buildSmartEditPatches,
  resolveTargetCells,
} from './runtime/applyEdits';

const OP_LABELS: Record<SmartEditOp, string> = {
  multiply: '×',
  divide: '÷',
  add: '+',
  subtract: '−',
  set: 'Set…',
};

const OP_TITLES: Record<Exclude<SmartEditOp, 'set'>, string> = {
  multiply: 'Multiply by operand',
  divide: 'Divide by operand',
  add: 'Add operand',
  subtract: 'Subtract operand',
};

export function SmartEditToolbarBody({ layout = 'standalone' }: EditingToolbarSegmentProps) {
  const platform = useGridPlatform();
  const [settings] = useModuleState<SmartEditState>(SMART_EDIT_MODULE_ID);
  const { count, cells } = useSmartEditSelection();
  const [operand, setOperand] = useState('1');
  const [setDialogOpen, setSetDialogOpen] = useState(false);
  const [setValue, setSetValue] = useState('');
  const [confirmOp, setConfirmOp] = useState<SmartEditOp | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [pendingOp, setPendingOp] = useState<{ op: SmartEditOp; value: number } | null>(null);
  const [pendingPatches, setPendingPatches] = useState<CellPatch[]>([]);

  const columnGuard = useMemo(() => {
    if (!settings.settings.enforceSingleColumn) return { ok: true as const };
    return assertSingleColumnSelection(cells);
  }, [cells, settings.settings.enforceSingleColumn]);

  const journalRecording = useMemo(
    () => resolveEditRecording(platform, 'smart-edit', settings.settings.recordHistory),
    [platform, settings.settings.recordHistory],
  );

  const executeApply = useCallback(async (
    op: SmartEditOp,
    value: number,
    patches?: readonly CellPatch[],
  ) => {
    const api = platform.api.api;
    if (!api || !settings.settings.enabled) return;

    const targets = resolveTargetCells(api);
    if (targets.length === 0) return;

    if (settings.settings.enforceSingleColumn) {
      const guard = assertSingleColumnSelection(targets);
      if (!guard.ok) return;
    }

    await applyEdits(api, targets, op, value, {
      journal: journalRecording.record ? journalRecording.journal : null,
      patches,
      journalApplyGridId: platform.gridId,
    });
  }, [platform, settings.settings.enabled, settings.settings.enforceSingleColumn, journalRecording]);

  const beginOp = useCallback((op: SmartEditOp, value: number) => {
    const api = platform.api.api;
    if (!api || !settings.settings.enabled) return;

    const targets = resolveTargetCells(api);
    if (targets.length === 0) return;

    if (settings.settings.enforceSingleColumn) {
      const guard = assertSingleColumnSelection(targets);
      if (!guard.ok) return;
    }

    if (
      settings.settings.confirmThreshold > 0 &&
      targets.length > settings.settings.confirmThreshold
    ) {
      setConfirmOp(op);
      return;
    }

    const patches = buildSmartEditPatches(targets, op, value);
    if (patches.length === 0) return;

    if (settings.settings.previewBeforeApply) {
      setPendingOp({ op, value });
      setPendingPatches(patches);
      setPreviewOpen(true);
      return;
    }

    void executeApply(op, value, patches);
  }, [
    platform,
    settings.settings.enabled,
    settings.settings.enforceSingleColumn,
    settings.settings.confirmThreshold,
    settings.settings.previewBeforeApply,
    executeApply,
  ]);

  const handleConfirm = async () => {
    const api = platform.api.api;
    if (!api || !confirmOp) return;
    const value = Number(operand);
    if (!Number.isFinite(value)) return;
    const targets = resolveTargetCells(api);
    const patches = buildSmartEditPatches(targets, confirmOp, value);
    await executeApply(confirmOp, value, patches);
    setConfirmOp(null);
  };

  const handleSet = async () => {
    const parsed = Number(setValue);
    if (!Number.isFinite(parsed)) return;
    beginOp('set', parsed);
    setSetDialogOpen(false);
    setSetValue('');
  };

  const handlePreviewApply = async () => {
    if (!pendingOp) return;
    const preview = previewPatches(pendingPatches);
    const patches = preview.validPatches;
    if (patches.length === 0) {
      setPreviewOpen(false);
      return;
    }
    await executeApply(pendingOp.op, pendingOp.value, patches);
    setPreviewOpen(false);
    setPendingOp(null);
    setPendingPatches([]);
  };

  if (!settings.settings.enabled) return null;

  const disabled = count === 0 || !columnGuard.ok;
  const ops = settings.settings.enabledOps;
  const preview = pendingPatches.length > 0 ? previewPatches(pendingPatches) : null;

  const guardTip = !columnGuard.ok && columnGuard.reason === 'multi-column'
    ? 'Select cells in one column only'
    : undefined;

  return (
    <>
      <EditingToolbarSegment
        layout={layout}
        label={layout === 'segment' ? 'Smart' : 'Smart edit'}
        data-testid="smart-edit-toolbar"
        meta={
          <>
            {count} cell{count === 1 ? '' : 's'}
            {!columnGuard.ok && columnGuard.reason === 'multi-column' && ' · 1 col'}
          </>
        }
      >
        <Input
          className={editingToolbarNumericInputClasses()}
          style={editingToolbarFieldWidthStyle(editingToolbarInputColumns(operand, { min: 3, max: 8 }))}
          value={operand}
          onChange={(e) => setOperand(e.target.value)}
          data-testid="smart-edit-operand"
          aria-label="Operand"
          title="Operand value for arithmetic operations"
          inputMode="decimal"
        />
        <EditingToolbarOpGroup>
          {ops.filter((op) => op !== 'set').map((op) => (
            <Tooltip key={op}>
              <TooltipTrigger asChild>
                <EditingToolbarOpButton
                  opVariant="symbol"
                  disabled={disabled}
                  data-testid={`smart-edit-op-${op}`}
                  title={guardTip ?? OP_TITLES[op]}
                  aria-label={OP_TITLES[op]}
                  onClick={() => {
                    const v = Number(operand);
                    if (Number.isFinite(v)) beginOp(op, v);
                  }}
                >
                  {OP_LABELS[op]}
                </EditingToolbarOpButton>
              </TooltipTrigger>
              {guardTip && <TooltipContent>{guardTip}</TooltipContent>}
            </Tooltip>
          ))}
        </EditingToolbarOpGroup>
        {ops.includes('set') && (
          <EditingToolbarOpButton
            opVariant="label"
            disabled={disabled}
            data-testid="smart-edit-op-set"
            title={guardTip ?? 'Set absolute value'}
            aria-label="Set absolute value"
            onClick={() => setSetDialogOpen(true)}
          >
            {OP_LABELS.set}
          </EditingToolbarOpButton>
        )}
      </EditingToolbarSegment>

      <Dialog open={setDialogOpen} onOpenChange={setSetDialogOpen}>
        <DialogContent className="ds-sheet-v2">
          <DialogHeader>
            <DialogTitle>Bulk set value</DialogTitle>
          </DialogHeader>
          <Input
            value={setValue}
            onChange={(e) => setSetValue(e.target.value)}
            placeholder="e.g. 1000000 or 1.5M"
            data-testid="smart-edit-set-input"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setSetDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => void handleSet()} data-testid="smart-edit-set-apply">Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="ds-sheet-v2 max-w-lg">
          <DialogHeader>
            <DialogTitle>Preview smart edit</DialogTitle>
          </DialogHeader>
          {preview && (
            <div className="max-h-[240px] overflow-y-auto">
              <Table data-testid="smart-edit-preview-table">
                <TableHeader>
                  <TableRow>
                    <TableHead>Row</TableHead>
                    <TableHead>Field</TableHead>
                    <TableHead>Current</TableHead>
                    <TableHead>New</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.results.map(({ patch, status }) => (
                    <TableRow key={`${patch.rowId}:${patch.field}`}>
                      <TableCell>{patch.rowId}</TableCell>
                      <TableCell>{patch.field}</TableCell>
                      <TableCell>{String(patch.oldValue)}</TableCell>
                      <TableCell>{String(patch.newValue)}</TableCell>
                      <TableCell>
                        <Badge variant={status === 'invalid' ? 'destructive' : 'secondary'}>
                          {status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>Cancel</Button>
            <Button
              onClick={() => void handlePreviewApply()}
              disabled={preview?.allInvalid}
              data-testid="smart-edit-preview-apply"
            >
              Apply{preview?.someInvalid ? ' valid only' : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOp !== null} onOpenChange={(o) => !o && setConfirmOp(null)}>
        <AlertDialogContent className="ds-sheet-v2">
          <AlertDialogHeader>
            <AlertDialogTitle>Apply to {count} cells?</AlertDialogTitle>
            <AlertDialogDescription>
              This exceeds your confirm threshold ({settings.settings.confirmThreshold} cells).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleConfirm()}>Apply</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
