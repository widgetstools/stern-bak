/**
 * @vitest-environment jsdom
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GridPlatform, type BulkUpdateState } from '@wellsfargo-starui/core';
import { GridProvider } from '../../hooks/GridProvider';
import { BulkUpdateToolbarBody } from './BulkUpdateToolbarBody';
import { bulkUpdateModule } from './index';

function makeMockApi() {
  const applyTransactionAsync = vi.fn().mockResolvedValue(undefined);
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
    getFocusedCell: () => null,
    getRowNode: () => ({ data: { id: 'r1', currency: 'USD' } }),
    getDisplayedRowCount: () => 1,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
}

function makePlatform(settings?: Partial<BulkUpdateState['settings']>): GridPlatform {
  const platform = new GridPlatform({ gridId: 'test-grid', modules: [bulkUpdateModule] });
  platform.store.setModuleState<BulkUpdateState>('bulk-update', (s) => ({
    ...s,
    settings: { ...s.settings, showDistinctValues: false, ...settings },
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
      });
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

  it('shows distinct value picker when enabled and values exist', () => {
    const platform = makePlatform({ showDistinctValues: true });
    mount(platform);
    expect(screen.getByTestId('bulk-update-value-select')).toBeTruthy();
  });
});
