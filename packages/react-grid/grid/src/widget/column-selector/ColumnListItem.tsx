/**
 * ColumnListItem — one selectable row in a Column Selector list. Presentational
 * only. Styled with the design-system `--ds-*` tokens (the same approach the grid
 * customizer panels use) so selection, hover, drag and locked states render
 * correctly in both light and dark themes — including inside the dialog portal.
 */

import { forwardRef, type CSSProperties, type HTMLAttributes, type MouseEvent } from 'react';
import { GripVertical, Lock } from 'lucide-react';
import { cn } from '@wellsfargo-starui/react';
import type { SelectModifiers } from './useColumnSelectorState';

export interface ColumnListItemProps {
  readonly headerName: string;
  readonly colId: string;
  readonly selected: boolean;
  readonly locked: boolean;
  readonly onSelect: (mods: SelectModifiers) => void;
  readonly onActivate: () => void;
  /** When set, a drag handle is shown and these props bind it to dnd-kit. */
  readonly dragHandleProps?: HTMLAttributes<HTMLButtonElement>;
  readonly dragging?: boolean;
  readonly style?: CSSProperties;
}

export const ColumnListItem = forwardRef<HTMLDivElement, ColumnListItemProps>(
  function ColumnListItem(props, ref) {
    const {
      headerName,
      colId,
      selected,
      locked,
      onSelect,
      onActivate,
      dragHandleProps,
      dragging,
      style,
    } = props;

    const handleClick = (e: MouseEvent) => {
      onSelect({ metaKey: e.metaKey, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey });
    };

    return (
      <div
        ref={ref}
        style={style}
        role="option"
        aria-selected={selected}
        title={colId}
        data-testid={`column-selector-item-${colId}`}
        onClick={handleClick}
        onDoubleClick={onActivate}
        className={cn(
          'flex items-center gap-1.5 rounded-sm border px-1.5 py-1 text-xs select-none cursor-pointer',
          'text-[var(--ds-text-primary)]',
          selected
            ? 'border-[var(--ds-border-secondary)] bg-[var(--ds-primary-soft)]'
            : 'border-transparent hover:bg-[var(--ds-surface-secondary)]',
          dragging && 'opacity-60',
        )}
      >
        {dragHandleProps ? (
          <button
            type="button"
            aria-label="Drag to reorder"
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
            className="shrink-0 cursor-grab text-[var(--ds-text-muted)] hover:text-[var(--ds-text-primary)] active:cursor-grabbing"
            {...dragHandleProps}
          >
            <GripVertical size={13} strokeWidth={2} />
          </button>
        ) : null}
        <span className="truncate flex-1">{headerName}</span>
        {locked ? (
          <Lock
            size={11}
            strokeWidth={2}
            className="shrink-0 text-[var(--ds-text-muted)]"
            aria-label="Locked"
          />
        ) : null}
      </div>
    );
  },
);
