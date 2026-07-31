import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { GridApi } from 'ag-grid-community';
import { ColumnSelectorDialog } from './ColumnSelectorDialog';

interface FakeCol {
  colId: string;
  headerName: string;
  visible: boolean;
  lockVisible?: boolean;
}

function makeApi(cols: FakeCol[]): { api: GridApi; applied: () => unknown } {
  const applyColumnState = vi.fn();
  const columns = cols.map((c) => ({
    getColId: () => c.colId,
    isVisible: () => c.visible,
    getColDef: () => ({ headerName: c.headerName, lockVisible: c.lockVisible }),
  }));
  const api = {
    getColumns: () => columns,
    applyColumnState,
  } as unknown as GridApi;
  return { api, applied: () => applyColumnState.mock.calls[0]?.[0] };
}

const COLS: FakeCol[] = [
  { colId: 'a', headerName: 'Alpha', visible: true },
  { colId: 'b', headerName: 'Bravo', visible: true },
  { colId: 'c', headerName: 'Charlie', visible: false },
];

describe('ColumnSelectorDialog', () => {
  it('seeds available (hidden) and visible (shown) lists from the grid', () => {
    const { api } = makeApi(COLS);
    render(<ColumnSelectorDialog open onOpenChange={() => {}} api={api} />);

    const available = screen.getByTestId('column-selector-available');
    const visible = screen.getByTestId('column-selector-visible');
    expect(available).toHaveTextContent('Charlie');
    expect(visible).toHaveTextContent('Alpha');
    expect(visible).toHaveTextContent('Bravo');
  });

  it('applies order with available columns hidden, visible first', () => {
    const { api, applied } = makeApi(COLS);
    const onOpenChange = vi.fn();
    render(<ColumnSelectorDialog open onOpenChange={onOpenChange} api={api} />);

    fireEvent.click(screen.getByTestId('column-selector-apply'));

    expect(applied()).toEqual({
      state: [
        { colId: 'a', hide: false },
        { colId: 'b', hide: false },
        { colId: 'c', hide: true },
      ],
      applyOrder: true,
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('moves a selected available column into visible before applying', () => {
    const { api, applied } = makeApi(COLS);
    render(<ColumnSelectorDialog open onOpenChange={() => {}} api={api} />);

    fireEvent.click(screen.getByTestId('column-selector-item-c'));
    fireEvent.click(screen.getByTestId('column-selector-add'));
    fireEvent.click(screen.getByTestId('column-selector-apply'));

    expect(applied()).toEqual({
      state: [
        { colId: 'a', hide: false },
        { colId: 'b', hide: false },
        { colId: 'c', hide: false },
      ],
      applyOrder: true,
    });
  });
});
