import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@wellsfargo-starui/react';
import { DataProviderEditor } from '../provider-editor/DataProviderEditor.js';

export interface ProviderEditorDialogProps {
  open: boolean;
  providerId: string | null;
  userId: string;
  onOpenChange(open: boolean): void;
}

/** In-browser shell for {@link DataProviderEditor} (non-OpenFin pencil edit). */
export function ProviderEditorDialog({
  open,
  providerId,
  userId,
  onOpenChange,
}: ProviderEditorDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="ds-sheet-v2 flex h-[85vh] max-h-[900px] w-[95vw] max-w-6xl flex-col gap-0 overflow-hidden p-0"
        data-testid="provider-editor-dialog"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Data Provider Editor</DialogTitle>
        </DialogHeader>
        <DataProviderEditor
          userId={userId}
          initialProviderId={providerId}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
