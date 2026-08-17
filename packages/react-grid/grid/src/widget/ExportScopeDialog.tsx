/**
 * ExportScopeDialog — the confirmation shown when an Excel export cannot
 * cover the whole dataset.
 *
 * WHY A DIALOG AND NOT A DISABLED BUTTON. AG-Grid's `exportDataAsExcel` walks
 * the rows the grid holds. Under the client-side row model that is the
 * dataset; under the server-side one it is the loaded block window — so the
 * same button produced a file with two thousand rows out of a hundred
 * thousand, named the same, with nothing to say it had. Disabling it would
 * take a working feature away (the roadmap's binding constraint 1 forbids
 * lowering CSRM to meet SSRM, and the reverse would be lowering SSRM below
 * where it is): exporting the loaded rows is a legitimate thing to want. What
 * was missing is the user knowing which of the two they were getting.
 *
 * The copy comes from `platform.data.capabilities.exportCoversFullDataset`
 * verbatim — one reason string, written once, rendered wherever the limit
 * bites.
 *
 * View-only. The controller owns the decision and the handlers.
 */

import type { ReactElement } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../customizer/internal.js'; // relative on purpose (self-reference breaks the dist build + risks barrel cycles)

export interface ExportScopeDialogProps {
  /** The capability's reason copy — non-empty exactly when the dialog is up. */
  readonly reason: string;
  readonly onCancel: () => void;
  readonly onExportAnyway: () => void;
}

export function ExportScopeDialog({
  reason,
  onCancel,
  onExportAnyway,
}: ExportScopeDialogProps): ReactElement {
  return (
    <AlertDialog
      open={reason.length > 0}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <AlertDialogContent data-testid="export-scope-confirm">
        <AlertDialogHeader>
          <AlertDialogTitle>Export the loaded rows?</AlertDialogTitle>
          <AlertDialogDescription data-testid="export-scope-reason">
            {reason}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            data-testid="export-scope-confirm-export"
            onClick={onExportAnyway}
          >
            Export loaded rows
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
