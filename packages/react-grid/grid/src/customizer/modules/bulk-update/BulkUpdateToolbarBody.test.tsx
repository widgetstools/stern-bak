/**
 * @vitest-environment jsdom
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GridPlatform, type BulkUpdateState, type EditingState } from '@wellsfargo-starui/core';
import { GridProvider } from '../../hooks/GridProvider';
import { BulkUpdateToolbarBody } from './BulkUpdateToolbarBody';
import { editingModule } from '../editing';

function makeMockApi() {
  // Settles on AG-Grid's flush CALLBACK, which is what the port waits for —
  // `applyTransactionAsync` itself returns void, and awaiting that is what let
  // an unlanded edit be recorded as one that landed.
  const applyTransactionAsync = vi.fn(
    (_tx: unknown, onFlush?: () => void) => { onFlush?.(); },
  );
  return {
    applyTransactionAsync,
    getCellRanges: () => [{
      columns: [{ getColId: () => 'currency' }],
      startRow: { rowIndex: 0 },
      endRow: { rowIndex: 0 },
    }],
    getDisplayedRowAtIndex: () => ({
      id: 'r1',
      data: { id: 'r1', currency: 'USD' },
    }),
    getColumn: () => ({
      getColId: () => 'currency',
      getColDef: () => ({ field: 'currency', editable: true, cellDataType: 'text' }),
    }),
    getCellValue: () => 'USD',
    // The distinct dropdown reads through `platform.data` now, and the
    // client-side adapter walks the FILTERED nodes for `scope: 'filtered'`.
    forEachNodeAfterFilter: (fn: (n: unknown) => void) =>
      fn({ id: 'r1', data: { id: 'r1', currency: 'USD' } }),
    getFocusedCell: () => null,
    getRowNode: () => ({ data: { id: 'r1', currency: 'USD' } }),
    getDisplayedRowCount: () => 1,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
}

function makePlatform(settings?: Partial<BulkUpdateState['settings']>): GridPlatform {
  const platform = new GridPlatform({ gridId: 'test-grid', modules: [editingModule] });
  platform.store.setModuleState<EditingState>('editing', (s) => ({
    ...s,
    bulkUpdate: {
      ...s.bulkUpdate,
      settings: { ...s.bulkUpdate.settings, showDistinctValues: false, ...settings },
    },
  }));
  return platform;
}

function mount(platform: GridPlatform, api = makeMockApi()) {
  platform.onGridReady(api as never);
  return { api, ...render(
    <GridProvider platform={platform}>
      <BulkUpdateToolbarBody />
    </GridProvider>,
  ) };
}

describe('BulkUpdateToolbarBody', () => {
  /** A platform whose port reports that unloaded rows cannot be addressed. */
  function ssrmPlatform(settings?: Partial<BulkUpdateState['settings']>): GridPlatform {
    const platform = makePlatform(settings);
    platform.data.bindSsrm({
      source: {
        getRows: async () => ({ rowData: [], rowCount: 100_000 }),
        getSetFilterValues: async () => [],
        getStatusBar: async () => ({ totalRows: 0, filteredRows: 0, aggregations: [] }),
      },
    } as never);
    return platform;
  }

  beforeEach(() => {
    if (!globalThis.ResizeObserver) {
      globalThis.ResizeObserver = class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
      };
    }
  });

  it('returns null when bulk update disabled', () => {
    const { container } = mount(makePlatform({ enabled: false }));
    expect(container.querySelector('[data-testid="bulk-update-toolbar"]')).toBeNull();
  });

  it('renders value input and selection count', () => {
    mount(makePlatform());
    expect(screen.getByTestId('bulk-update-toolbar')).toBeTruthy();
    expect(screen.getByTestId('bulk-update-count').textContent).toMatch(/1 selected/);
    expect(screen.getByRole('textbox', { name: 'Bulk update value' })).toBeTruthy();
  });

  it('apply is disabled until a value is entered', () => {
    mount(makePlatform());
    expect((screen.getByTestId('bulk-update-apply') as HTMLButtonElement).disabled).toBe(true);
  });

  it('apply writes bulk value to selected cells', async () => {
    const { api } = mount(makePlatform({ confirmThreshold: 0 }));
    act(() => {
      fireEvent.change(screen.getByTestId('bulk-update-value-input'), { target: { value: 'EUR' } });
    });
    act(() => fireEvent.click(screen.getByTestId('bulk-update-apply')));
    await waitFor(() => {
      expect(api.applyTransactionAsync).toHaveBeenCalledWith({
        update: [{ id: 'r1', currency: 'EUR' }],
      }, expect.any(Function));
    });
  });

  it('opens confirm dialog when selection exceeds threshold', () => {
    const platform = makePlatform({ confirmThreshold: 1 });
    const api = makeMockApi();
    api.getCellRanges = () => [
      {
        columns: [{ getColId: () => 'currency' }],
        startRow: { rowIndex: 0 },
        endRow: { rowIndex: 2 },
      },
    ];
    api.getDisplayedRowAtIndex = (i: number) => ({
      id: `r${i + 1}`,
      data: { id: `r${i + 1}`, currency: 'USD' },
    });
    mount(platform, api);

    act(() => {
      fireEvent.change(screen.getByTestId('bulk-update-value-input'), { target: { value: 'EUR' } });
    });
    act(() => fireEvent.click(screen.getByTestId('bulk-update-apply')));
    expect(screen.getByText(/This will update \d+ cells/)).toBeTruthy();
    expect(api.applyTransactionAsync).not.toHaveBeenCalled();
  });

  it('confirm dialog apply proceeds with bulk update', async () => {
    const platform = makePlatform({ confirmThreshold: 1 });
    const api = makeMockApi();
    api.getCellRanges = () => [
      {
        columns: [{ getColId: () => 'currency' }],
        startRow: { rowIndex: 0 },
        endRow: { rowIndex: 2 },
      },
    ];
    api.getDisplayedRowAtIndex = (i: number) => ({
      id: `r${i + 1}`,
      data: { id: `r${i + 1}`, currency: 'USD' },
    });
    mount(platform, api);

    act(() => {
      fireEvent.change(screen.getByTestId('bulk-update-value-input'), { target: { value: 'EUR' } });
    });
    act(() => fireEvent.click(screen.getByTestId('bulk-update-apply')));
    act(() => fireEvent.click(screen.getByTestId('bulk-update-confirm-apply')));
    await waitFor(() => {
      expect(api.applyTransactionAsync).toHaveBeenCalled();
    });
  });

  it('shows distinct value picker when enabled and values exist', async () => {
    const platform = makePlatform({ showDistinctValues: true });
    mount(platform);
    // Asynchronous now: the values come through `platform.data.distinct()`,
    // which may cross `postMessage` to the worker.
    await waitFor(() => {
      expect(screen.getByTestId('bulk-update-value-select')).toBeTruthy();
    });
  });

  it('reads distinct values from the source, not from whatever block is scrolled in', async () => {
    // The old reader looped `getDisplayedRowCount()` against
    // `getDisplayedRowAtIndex`. Under the server-side row model the count is
    // the SERVER's total and the indices outside the loaded window resolve to
    // loading stubs — so the dropdown listed whatever the current block held.
    // Here the grid holds one row and the source holds three; the dropdown
    // must show the source's.
    const platform = makePlatform({ showDistinctValues: true });
    platform.data.bindSsrm({
      source: {
        getRows: async () => ({ rowData: [], rowCount: 100_000 }),
        getSetFilterValues: async () => ['USD', 'EUR', 'JPY'],
        getStatusBar: async () => ({ totalRows: 0, filteredRows: 0, aggregations: [] }),
      },
    } as never);
    mount(platform);

    await waitFor(() => {
      expect(screen.getByTestId('bulk-update-value-select')).toBeTruthy();
    });
    act(() => fireEvent.click(screen.getByTestId('bulk-update-value-select')));
    await waitFor(() => {
      expect(screen.getByText('EUR')).toBeTruthy();
      expect(screen.getByText('JPY')).toBeTruthy();
    });
  });

  it('names the unreachable rows in the count', () => {
    const api = makeMockApi();
    // A range spanning two rows where the grid holds only the first — the
    // shape a server-side selection past the loaded window takes.
    api.getCellRanges = () => [{
      columns: [{ getColId: () => 'currency' }],
      startRow: { rowIndex: 0 },
      endRow: { rowIndex: 1 },
    }];
    api.getDisplayedRowAtIndex = ((i: number) =>
      i === 0 ? { id: 'r1', data: { id: 'r1', currency: 'USD' } } : undefined) as never;
    mount(makePlatform(), api);

    expect(screen.getByTestId('bulk-update-unreachable').textContent).toMatch(/1 not loaded/);
  });

  it('says nothing about unreachable rows when every row is loaded', () => {
    mount(makePlatform());
    expect(screen.queryByTestId('bulk-update-unreachable')).toBeNull();
  });

  it('confirms an unreachable selection however small it is', () => {
    const api = makeMockApi();
    api.getCellRanges = () => [{
      columns: [{ getColId: () => 'currency' }],
      startRow: { rowIndex: 0 },
      endRow: { rowIndex: 1 },
    }];
    api.getDisplayedRowAtIndex = ((i: number) =>
      i === 0 ? { id: 'r1', data: { id: 'r1', currency: 'USD' } } : undefined) as never;
    // Threshold off: the confirm is owed to the partial apply, not the size.
    mount(ssrmPlatform({ confirmThreshold: 0 }), api);

    act(() => {
      fireEvent.change(screen.getByTestId('bulk-update-value-input'), { target: { value: 'EUR' } });
    });
    act(() => fireEvent.click(screen.getByTestId('bulk-update-apply')));

    const description = screen.getByTestId('bulk-update-confirm-description').textContent ?? '';
    expect(description).toMatch(/1 selected row is not loaded/);
    expect(api.applyTransactionAsync).not.toHaveBeenCalled();
  });

  it('pluralises the unreachable-row sentence', () => {
    const api = makeMockApi();
    api.getCellRanges = () => [{
      columns: [{ getColId: () => 'currency' }],
      startRow: { rowIndex: 0 },
      endRow: { rowIndex: 2 },
    }];
    api.getDisplayedRowAtIndex = ((i: number) =>
      i === 0 ? { id: 'r1', data: { id: 'r1', currency: 'USD' } } : undefined) as never;
    mount(ssrmPlatform({ confirmThreshold: 0 }), api);

    act(() => {
      fireEvent.change(screen.getByTestId('bulk-update-value-input'), { target: { value: 'EUR' } });
    });
    act(() => fireEvent.click(screen.getByTestId('bulk-update-apply')));

    expect(screen.getByTestId('bulk-update-confirm-description').textContent)
      .toMatch(/2 selected rows are not loaded/);
  });

  it('does nothing when the grid is not ready', () => {
    const platform = makePlatform({ confirmThreshold: 0 });
    render(
      <GridProvider platform={platform}>
        <BulkUpdateToolbarBody />
      </GridProvider>,
    );

    expect((screen.getByTestId('bulk-update-apply') as HTMLButtonElement).disabled).toBe(true);
  });

  it('refuses a selection spanning columns when single-column is enforced', () => {
    const api = makeMockApi();
    api.getCellRanges = () => [
      {
        columns: [{ getColId: () => 'currency' }, { getColId: () => 'ticker' }],
        startRow: { rowIndex: 0 },
        endRow: { rowIndex: 0 },
      },
    ];
    api.getColumn = ((colId: string) => ({
      getColId: () => colId,
      getColDef: () => ({ field: colId, editable: true, cellDataType: 'text' }),
    })) as never;
    api.getCellValue = () => 'USD';
    mount(makePlatform({ enforceSingleColumn: true, confirmThreshold: 0 }), api);

    act(() => {
      fireEvent.change(screen.getByTestId('bulk-update-value-input'), { target: { value: 'EUR' } });
    });
    expect((screen.getByTestId('bulk-update-apply') as HTMLButtonElement).disabled).toBe(true);
  });

  it('allows a multi-column selection when the guard is off', () => {
    const api = makeMockApi();
    api.getCellRanges = () => [
      {
        columns: [{ getColId: () => 'currency' }, { getColId: () => 'ticker' }],
        startRow: { rowIndex: 0 },
        endRow: { rowIndex: 0 },
      },
    ];
    api.getColumn = ((colId: string) => ({
      getColId: () => colId,
      getColDef: () => ({ field: colId, editable: true, cellDataType: 'text' }),
    })) as never;
    mount(makePlatform({ enforceSingleColumn: false, confirmThreshold: 0 }), api);

    act(() => {
      fireEvent.change(screen.getByTestId('bulk-update-value-input'), { target: { value: 'EUR' } });
    });
    expect((screen.getByTestId('bulk-update-apply') as HTMLButtonElement).disabled).toBe(false);
  });

  it('renders a number field for a numeric column', () => {
    const api = makeMockApi();
    api.getColumn = () => ({
      getColId: () => 'qty',
      getColDef: () => ({ field: 'qty', editable: true, cellDataType: 'number' }),
    });
    api.getCellRanges = () => [{
      columns: [{ getColId: () => 'qty' }],
      startRow: { rowIndex: 0 },
      endRow: { rowIndex: 0 },
    }];
    mount(makePlatform(), api);

    expect(screen.getByTestId('bulk-update-value-input')).toHaveAttribute('type', 'number');
    expect(screen.getByTestId('bulk-update-value-input')).toHaveAttribute('inputmode', 'decimal');
  });

  it('renders a date field with an explicit format hint', () => {
    const api = makeMockApi();
    api.getColumn = () => ({
      getColId: () => 'tradeDate',
      getColDef: () => ({ field: 'tradeDate', editable: true, cellDataType: 'dateString' }),
    });
    api.getCellRanges = () => [{
      columns: [{ getColId: () => 'tradeDate' }],
      startRow: { rowIndex: 0 },
      endRow: { rowIndex: 0 },
    }];
    mount(makePlatform(), api);

    const input = screen.getByTestId('bulk-update-value-input');
    expect(input).toHaveAttribute('type', 'date');
    expect(input).toHaveAttribute('placeholder', 'YYYY-MM-DD');
  });

  it('renders a text field by default', () => {
    mount(makePlatform());
    const input = screen.getByTestId('bulk-update-value-input');

    expect(input).toHaveAttribute('type', 'text');
    expect(input).toHaveAttribute('placeholder', 'New value…');
  });

  it('hides the distinct picker when the source has no values to offer', async () => {
    const platform = makePlatform({ showDistinctValues: true });
    platform.data.bindSsrm({
      source: {
        getRows: async () => ({ rowData: [], rowCount: 0 }),
        getSetFilterValues: async () => [],
        getStatusBar: async () => ({ totalRows: 0, filteredRows: 0, aggregations: [] }),
      },
    } as never);
    mount(platform);

    await waitFor(() => expect(screen.getByTestId('bulk-update-toolbar')).toBeTruthy());
    expect(screen.queryByTestId('bulk-update-value-select')).toBeNull();
  });

  it('picking a blank distinct value clears the field rather than writing a token', async () => {
    const platform = makePlatform({ showDistinctValues: true });
    platform.data.bindSsrm({
      source: {
        getRows: async () => ({ rowData: [], rowCount: 1 }),
        getSetFilterValues: async () => ['', 'USD'],
        getStatusBar: async () => ({ totalRows: 0, filteredRows: 0, aggregations: [] }),
      },
    } as never);
    mount(platform);

    await waitFor(() => expect(screen.getByTestId('bulk-update-value-select')).toBeTruthy());
    act(() => fireEvent.click(screen.getByTestId('bulk-update-value-select')));
    await waitFor(() => expect(screen.getByText('(empty)')).toBeTruthy());
    act(() => fireEvent.click(screen.getByText('(empty)')));

    expect(screen.getByTestId('bulk-update-value-input')).toHaveValue('');
  });

  it('picking a distinct value fills the field', async () => {
    const platform = makePlatform({ showDistinctValues: true });
    platform.data.bindSsrm({
      source: {
        getRows: async () => ({ rowData: [], rowCount: 1 }),
        getSetFilterValues: async () => ['USD', 'EUR'],
        getStatusBar: async () => ({ totalRows: 0, filteredRows: 0, aggregations: [] }),
      },
    } as never);
    mount(platform);

    await waitFor(() => expect(screen.getByTestId('bulk-update-value-select')).toBeTruthy());
    act(() => fireEvent.click(screen.getByTestId('bulk-update-value-select')));
    await waitFor(() => expect(screen.getByText('EUR')).toBeTruthy());
    act(() => fireEvent.click(screen.getByText('EUR')));

    expect(screen.getByTestId('bulk-update-value-input')).toHaveValue('EUR');
  });

  it('ignores a whitespace-only value', () => {
    const { api } = mount(makePlatform({ confirmThreshold: 0 }));
    act(() => {
      fireEvent.change(screen.getByTestId('bulk-update-value-input'), { target: { value: '   ' } });
    });

    expect((screen.getByTestId('bulk-update-apply') as HTMLButtonElement).disabled).toBe(true);
    expect(api.applyTransactionAsync).not.toHaveBeenCalled();
  });
});
