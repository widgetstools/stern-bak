import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import type { DragEndEvent } from '@dnd-kit/core';
import type { ColumnItem } from './columnSelectorModel';
import type { ColumnListController } from './useColumnSelectorState';
import { ColumnList } from './ColumnList';

let capturedDragEnd: ((event: DragEndEvent) => void) | undefined;

vi.mock('@dnd-kit/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dnd-kit/core')>();
  return {
    ...actual,
    DndContext: ({
      children,
      onDragEnd,
      ...rest
    }: ComponentProps<typeof actual.DndContext>) => {
      capturedDragEnd = onDragEnd;
      return (
        <actual.DndContext onDragEnd={onDragEnd} {...rest}>
          {children}
        </actual.DndContext>
      );
    },
  };
});

const ITEMS: ColumnItem[] = [
  { colId: 'a', headerName: 'Alpha', locked: false },
  { colId: 'b', headerName: 'Bravo', locked: false },
  { colId: 'c', headerName: 'Charlie', locked: true },
];

function makeController(overrides: Partial<ColumnListController> = {}): ColumnListController {
  return {
    items: ITEMS,
    filtered: ITEMS,
    query: '',
    setQuery: vi.fn(),
    selected: new Set<string>(),
    onItemClick: vi.fn(),
    onItemDoubleClick: vi.fn(),
    canReorder: true,
    ...overrides,
  };
}

describe('ColumnList', () => {
  beforeEach(() => {
    capturedDragEnd = undefined;
  });

  afterEach(() => {
    capturedDragEnd = undefined;
  });
  it('renders title, count, and column rows', () => {
    render(
      <ColumnList
        title="Visible"
        controller={makeController()}
        searchPlaceholder="Search visible columns"
        testId="column-list-visible"
      />,
    );
    expect(screen.getByTestId('column-list-visible')).toBeInTheDocument();
    expect(screen.getByTestId('column-list-visible-count')).toHaveTextContent('3');
    expect(screen.getByTestId('column-selector-item-a')).toBeInTheDocument();
  });

  it('filters via search input', async () => {
    const user = userEvent.setup();
    const setQuery = vi.fn();
    render(
      <ColumnList
        title="Available"
        controller={makeController({ setQuery })}
        searchPlaceholder="Search available columns"
        testId="column-list-available"
      />,
    );
    await user.type(screen.getByLabelText('Search available columns'), 'cha');
    expect(setQuery).toHaveBeenCalled();
  });

  it('shows empty state when filtered list is empty', () => {
    render(
      <ColumnList
        title="Visible"
        controller={makeController({ filtered: [] })}
        searchPlaceholder="Search"
        testId="column-list-visible"
      />,
    );
    expect(screen.getByText('No columns')).toBeInTheDocument();
  });

  it('shows reorder hint when sortable but canReorder is false', () => {
    render(
      <ColumnList
        title="Visible"
        controller={makeController({ canReorder: false })}
        searchPlaceholder="Search"
        testId="column-list-visible"
        sortable
      />,
    );
    expect(screen.getByText(/Clear the search to reorder/)).toBeInTheDocument();
  });

  it('filters list when controller has query set', () => {
    render(
      <ColumnList
        title="Visible"
        controller={makeController({
          query: 'alp',
          filtered: [ITEMS[0]],
        })}
        searchPlaceholder="Search"
        testId="column-list-visible"
      />,
    );
    expect(screen.getByTestId('column-selector-item-a')).toBeInTheDocument();
    expect(screen.queryByTestId('column-selector-item-b')).toBeNull();
    expect(screen.getByTestId('column-list-visible-count')).toHaveTextContent('1');
  });

  it('invokes onReorder when sortable drag ends with different ids', () => {
    const onReorder = vi.fn();
    render(
      <ColumnList
        title="Visible"
        controller={makeController()}
        searchPlaceholder="Search"
        testId="column-list-visible"
        sortable
        onReorder={onReorder}
      />,
    );
    act(() => {
      capturedDragEnd?.({ active: { id: 'a' }, over: { id: 'b' } } as DragEndEvent);
    });
    expect(onReorder).toHaveBeenCalledWith('a', 'b');
  });

  it('does not reorder when drag ends on the same id', () => {
    const onReorder = vi.fn();
    render(
      <ColumnList
        title="Visible"
        controller={makeController()}
        searchPlaceholder="Search"
        testId="column-list-visible"
        sortable
        onReorder={onReorder}
      />,
    );
    act(() => {
      capturedDragEnd?.({ active: { id: 'a' }, over: { id: 'a' } } as DragEndEvent);
    });
    expect(onReorder).not.toHaveBeenCalled();
  });

  it('forwards item click and double-click to controller', async () => {
    const user = userEvent.setup();
    const onItemClick = vi.fn();
    const onItemDoubleClick = vi.fn();
    render(
      <ColumnList
        title="Available"
        controller={makeController({ onItemClick, onItemDoubleClick, canReorder: false })}
        searchPlaceholder="Search"
        testId="column-list-available"
      />,
    );
    await user.click(screen.getByTestId('column-selector-item-a'));
    expect(onItemClick).toHaveBeenCalledWith('a', expect.objectContaining({ metaKey: false }));
    fireEvent.doubleClick(screen.getByTestId('column-selector-item-a'));
    expect(onItemDoubleClick).toHaveBeenCalledWith('a');
  });

  it('renders non-sortable rows when sortable but canReorder is false', () => {
    render(
      <ColumnList
        title="Visible"
        controller={makeController({ canReorder: false, selected: new Set(['a']) })}
        searchPlaceholder="Search"
        testId="column-list-visible"
        sortable
      />,
    );
    expect(screen.getByTestId('column-selector-item-a')).toHaveAttribute('aria-selected', 'true');
  });
});
