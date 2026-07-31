/**
 * ColumnList — one pane of the Column Selector: a search box over a scrollable
 * list of columns. The visible pane is a dnd-kit sortable list (reorder by
 * dragging single or multiple selected rows); the available pane is a plain
 * selectable list. All chrome is shadcn + design-system tokens (light/dark safe).
 */

import { type ReactElement } from 'react';
import { Search } from 'lucide-react';
import { Input, ScrollArea, cn } from '@wellsfargo-starui/ui';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ColumnListItem } from './ColumnListItem';
import type { ColumnListController } from './useColumnSelectorState';

export interface ColumnListProps {
  readonly title: string;
  readonly controller: ColumnListController;
  readonly searchPlaceholder: string;
  readonly testId: string;
  /** Enable dnd-kit reordering (the visible pane). */
  readonly sortable?: boolean;
  /** Called with (activeColId, overColId) after a drag ends. */
  readonly onReorder?: (activeColId: string, overColId: string) => void;
}

function SortableRow({
  colId,
  headerName,
  locked,
  selected,
  onSelect,
  onActivate,
}: {
  colId: string;
  headerName: string;
  locked: boolean;
  selected: boolean;
  onSelect: ColumnListController['onItemClick'];
  onActivate: ColumnListController['onItemDoubleClick'];
}): ReactElement {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: colId,
    disabled: locked,
  });
  return (
    <ColumnListItem
      ref={setNodeRef}
      colId={colId}
      headerName={headerName}
      selected={selected}
      locked={locked}
      onSelect={(mods) => onSelect(colId, mods)}
      onActivate={() => onActivate(colId)}
      dragging={isDragging}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      dragHandleProps={locked ? undefined : { ...attributes, ...listeners }}
    />
  );
}

export function ColumnList(props: ColumnListProps): ReactElement {
  const { title, controller, searchPlaceholder, testId, sortable, onReorder } = props;
  const { filtered, query, setQuery, selected, onItemClick, onItemDoubleClick, canReorder } =
    controller;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (e: DragEndEvent) => {
    const overId = e.over?.id;
    if (overId && e.active.id !== overId) {
      onReorder?.(String(e.active.id), String(overId));
    }
  };

  const rows = filtered.map((item) =>
    sortable && canReorder ? (
      <SortableRow
        key={item.colId}
        colId={item.colId}
        headerName={item.headerName}
        locked={item.locked}
        selected={selected.has(item.colId)}
        onSelect={onItemClick}
        onActivate={onItemDoubleClick}
      />
    ) : (
      <ColumnListItem
        key={item.colId}
        colId={item.colId}
        headerName={item.headerName}
        selected={selected.has(item.colId)}
        locked={item.locked}
        onSelect={(mods) => onItemClick(item.colId, mods)}
        onActivate={() => onItemDoubleClick(item.colId)}
      />
    ),
  );

  const list =
    sortable && canReorder ? (
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={filtered.map((c) => c.colId)} strategy={verticalListSortingStrategy}>
          {rows}
        </SortableContext>
      </DndContext>
    ) : (
      rows
    );

  return (
    <div
      className="flex min-h-0 min-w-0 flex-1 flex-col rounded-md border border-[var(--ds-border-primary)] bg-[var(--ds-surface-primary)]"
      data-testid={testId}
    >
      <div className="flex items-center justify-between border-b border-[var(--ds-border-primary)] px-2.5 py-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--ds-text-muted)]">
          {title}
        </span>
        <span
          className="text-[11px] tabular-nums text-[var(--ds-text-muted)]"
          data-testid={`${testId}-count`}
        >
          {filtered.length}
        </span>
      </div>
      <div className="relative px-2 py-1.5">
        <Search
          size={13}
          strokeWidth={2}
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--ds-text-muted)]"
        />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          data-testid={`${testId}-search`}
          className="h-7 border-[var(--ds-border-primary)] bg-[var(--ds-surface-ground)] pl-7 text-xs text-[var(--ds-text-primary)] placeholder:text-[var(--ds-text-muted)]"
        />
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className={cn('flex flex-col gap-0.5 px-1.5 pb-2')}>
          {filtered.length === 0 ? (
            <p className="px-1.5 py-4 text-center text-xs text-[var(--ds-text-muted)]">No columns</p>
          ) : (
            list
          )}
        </div>
      </ScrollArea>
      {sortable && !canReorder ? (
        <p className="border-t border-[var(--ds-border-primary)] px-2.5 py-1 text-[10px] text-[var(--ds-text-faint)]">
          Clear the search to reorder by dragging.
        </p>
      ) : null}
    </div>
  );
}
