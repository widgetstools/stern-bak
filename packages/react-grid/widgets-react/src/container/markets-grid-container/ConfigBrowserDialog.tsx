import { useDeferredValue } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@wellsfargo-starui/ui';
import { ConfigBrowserPanel } from '@wellsfargo-starui/grid/config-browser';

export interface ConfigBrowserDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
}

/** In-browser shell for {@link ConfigBrowserPanel}. */
export function ConfigBrowserDialog({
  open,
  onOpenChange,
}: ConfigBrowserDialogProps) {
  // Two-phase open (same pattern as SettingsSheet): the dialog shell
  // commits urgently so it appears on the next frame; the panel — a
  // full AG-Grid instance plus Dexie table reads — fills in on the
  // deferred follow-up render instead of blocking first paint. The
  // `false` initial value keeps the FIRST open two-phase as well.
  const deferredOpen = useDeferredValue(open, false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="ds-sheet-v2 flex h-[85vh] max-h-[900px] w-[95vw] max-w-6xl flex-col gap-0 overflow-hidden p-0"
        data-testid="config-browser-dialog"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Config Browser</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-hidden">
          {deferredOpen ? <ConfigBrowserPanel /> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
