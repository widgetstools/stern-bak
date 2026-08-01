/**
 * ColumnSelectorDialog — toolbar-launched dialog that lets the user choose which
 * grid columns are shown (Visible) vs hidden (Available) and reorder the visible
 * ones by dragging. On Apply the live grid is reordered to
 * `[...visible, ...available]` with available columns hidden; the customizer's
 * Column Settings list reflects the same order (it reads `api.getColumns()`).
 *
 * Styled with the grid customizer's `--ds-*` design-system tokens (fully-resolved
 * `oklch()` colours that flip correctly in light/dark, including inside the
 * dialog portal). Uses only `@wellsfargo-starui/react` shadcn primitives — no customizer-barrel
 * dependency — so the surrounding `MarketsGridHost` tests keep their light mocks.
 */

import { type ReactElement, type ReactNode } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@wellsfargo-starui/react';
import type { GridApi } from 'ag-grid-community';
import { ColumnList } from './ColumnList';
import { useColumnSelectorState } from './useColumnSelectorState';

export interface ColumnSelectorDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly api: GridApi | null;
}

/** Ghost icon button styled with `--ds-*` tokens (portal-safe in both themes). */
function TransferButton(props: {
  onClick: () => void;
  disabled: boolean;
  title: string;
  testId: string;
  children: ReactNode;
}): ReactElement {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-7 w-7 text-[var(--ds-text-primary)] hover:bg-[var(--ds-surface-secondary)] hover:text-[var(--ds-primary)] disabled:opacity-40"
      onClick={props.onClick}
      disabled={props.disabled}
      title={props.title}
      aria-label={props.title}
      data-testid={props.testId}
    >
      {props.children}
    </Button>
  );
}

export function ColumnSelectorDialog(props: ColumnSelectorDialogProps): ReactElement {
  const { open, onOpenChange, api } = props;
  const sel = useColumnSelectorState(api, open);

  const handleApply = () => {
    sel.apply();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[80vh] max-h-[80vh] min-h-[20rem] w-[min(46rem,92vw)] max-w-none flex-col gap-3 border-[var(--ds-border-primary)] bg-[var(--ds-surface-ground)] p-0 text-[var(--ds-text-primary)]"
        data-testid="column-selector-dialog"
      >
        <DialogHeader className="border-b border-[var(--ds-border-primary)] px-4 pt-4 pb-3">
          <DialogTitle className="text-sm text-[var(--ds-text-primary)]">Select columns</DialogTitle>
          <DialogDescription className="text-xs text-[var(--ds-text-muted)]">
            Move columns between Available and Visible, and drag to reorder the visible columns.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 items-stretch gap-2 px-4">
          <ColumnList
            title="Available"
            controller={sel.available}
            searchPlaceholder="Search available…"
            testId="column-selector-available"
          />

          <div className="flex flex-col justify-center gap-1.5">
            <TransferButton
              onClick={sel.addSelected}
              disabled={!sel.canAdd}
              title="Add selected to Visible"
              testId="column-selector-add"
            >
              <ChevronRight size={15} strokeWidth={2} />
            </TransferButton>
            <TransferButton
              onClick={sel.addAll}
              disabled={!sel.canAddAll}
              title="Add all to Visible"
              testId="column-selector-add-all"
            >
              <ChevronsRight size={15} strokeWidth={2} />
            </TransferButton>
            <TransferButton
              onClick={sel.removeSelected}
              disabled={!sel.canRemove}
              title="Remove selected from Visible"
              testId="column-selector-remove"
            >
              <ChevronLeft size={15} strokeWidth={2} />
            </TransferButton>
            <TransferButton
              onClick={sel.removeAll}
              disabled={!sel.canRemoveAll}
              title="Remove all from Visible"
              testId="column-selector-remove-all"
            >
              <ChevronsLeft size={15} strokeWidth={2} />
            </TransferButton>
          </div>

          <ColumnList
            title="Visible"
            controller={sel.visible}
            searchPlaceholder="Search visible…"
            testId="column-selector-visible"
            sortable
            onReorder={sel.reorder}
          />
        </div>

        <DialogFooter className="border-t border-[var(--ds-border-primary)] px-4 pt-3 pb-4">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="text-[var(--ds-text-secondary)] hover:bg-[var(--ds-surface-secondary)] hover:text-[var(--ds-text-primary)]"
            data-testid="column-selector-cancel"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleApply}
            className="bg-[var(--ds-primary)] text-white hover:bg-[var(--ds-primary)] hover:brightness-110"
            data-testid="column-selector-apply"
          >
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
