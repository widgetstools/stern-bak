/**
 * @vitest-environment jsdom
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GridPlatform, type SmartEditState } from '@wellsfargo-starui/core';
import { GridProvider } from '../../hooks/GridProvider';
import { SmartEditToolbarBody } from './SmartEditToolbarBody';
import { smartEditModule } from './index';

function makeMockApi() {
  const applyTransactionAsync = vi.fn().mockResolvedValue(undefined);
  return {
    applyTransactionAsync,
    getRowNode: (id: string) => ({
      data: { id, qty: 100, ticker: 'ABC' },
    }),
    getCellRanges: () => [{
      columns: [{ getColId: () => 'qty' }],
      startRow: { rowIndex: 0 },
      endRow: { rowIndex: 0 },
    }],
    getFocusedCell: () => null,
    getDisplayedRowAtIndex: () => ({ id: 'r1', data: { id: 'r1', qty: 100 } }),
    getColumn: () => ({
      getColId: () => 'qty',
      getColDef: () => ({ editable: true, field: 'qty', cellDataType: 'number' }),
    }),
    getCellValue: () => 100,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
}

function makePlatform(settings?: Partial<SmartEditState['settings']>): GridPlatform {
  const platform = new GridPlatform({ gridId: 'test-grid', modules: [smartEditModule] });
  if (settings) {
    platform.store.setModuleState<SmartEditState>('smart-edit', (s) => ({
      ...s,
      settings: { ...s.settings, ...settings },
    }));
  }
  return platform;
}

function mount(platform: GridPlatform, api = makeMockApi()) {
  platform.onGridReady(api as never);
  return { api, ...render(
    <GridProvider platform={platform}>
      <SmartEditToolbarBody />
    </GridProvider>,
  ) };
}

describe('SmartEditToolbarBody', () => {
  beforeEach(() => {
    if (!globalThis.ResizeObserver) {
      globalThis.ResizeObserver = class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
      };
    }
  });

  it('returns null when smart edit disabled', () => {
    const platform = makePlatform({ enabled: false });
    const { container } = mount(platform);
    expect(container.querySelector('[data-testid="smart-edit-toolbar"]')).toBeNull();
  });

  it('renders toolbar with op buttons when enabled', () => {
    mount(makePlatform());
    expect(screen.getByTestId('smart-edit-toolbar')).toBeTruthy();
    expect(screen.getByTestId('smart-edit-op-multiply')).toBeTruthy();
    expect(screen.getByText(/1 cell\b/)).toBeTruthy();
  });

  it('disables op buttons when no cells selected', () => {
    const platform = makePlatform();
    const api = makeMockApi();
    api.getCellRanges = () => [];
    api.getFocusedCell = () => null;
    mount(platform, api);
    expect((screen.getByTestId('smart-edit-op-multiply') as HTMLButtonElement).disabled).toBe(true);
  });

  it('multiply op applies transaction', async () => {
    const { api } = mount(makePlatform({ confirmThreshold: 0 }));
    act(() => {
      fireEvent.click(screen.getByTestId('smart-edit-op-multiply'));
    });
    await waitFor(() => {
      expect(api.applyTransactionAsync).toHaveBeenCalledWith({
        update: [{ id: 'r1', qty: 100, ticker: 'ABC' }],
      });
    });
  });

  it('opens confirm dialog when selection exceeds threshold', async () => {
    const platform = makePlatform({ confirmThreshold: 1 });
    const api = makeMockApi();
    api.getCellRanges = () => [
      {
        columns: [{ getColId: () => 'qty' }],
        startRow: { rowIndex: 0 },
        endRow: { rowIndex: 1 },
      },
    ];
    api.getDisplayedRowAtIndex = (i: number) => ({
      id: `r${i + 1}`,
      data: { id: `r${i + 1}`, qty: 10 },
    });
    mount(platform, api);

    act(() => {
      fireEvent.click(screen.getByTestId('smart-edit-op-multiply'));
    });
    expect(screen.getByText(/Apply to \d+ cells\?/)).toBeTruthy();
    expect(api.applyTransactionAsync).not.toHaveBeenCalled();
  });

  it('set dialog applies bulk set value', async () => {
    const { api } = mount(makePlatform({ confirmThreshold: 0 }));
    act(() => {
      fireEvent.click(screen.getByTestId('smart-edit-op-set'));
    });
    act(() => {
      fireEvent.change(screen.getByTestId('smart-edit-set-input'), { target: { value: '42' } });
    });
    act(() => {
      fireEvent.click(screen.getByTestId('smart-edit-set-apply'));
    });
    await waitFor(() => {
      expect(api.applyTransactionAsync).toHaveBeenCalledWith({
        update: [{ id: 'r1', qty: 42, ticker: 'ABC' }],
      });
    });
  });

  it('confirm dialog Apply executes the pending op', async () => {
    const platform = makePlatform({ confirmThreshold: 1 });
    const api = makeMockApi();
    api.getCellRanges = () => [
      {
        columns: [{ getColId: () => 'qty' }],
        startRow: { rowIndex: 0 },
        endRow: { rowIndex: 1 },
      },
    ];
    api.getDisplayedRowAtIndex = (i: number) => ({
      id: `r${i + 1}`,
      data: { id: `r${i + 1}`, qty: 10 },
    });
    mount(platform, api);

    act(() => fireEvent.click(screen.getByTestId('smart-edit-op-add')));
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Apply' })));
    await waitFor(() => {
      expect(api.applyTransactionAsync).toHaveBeenCalled();
    });
  });

  it('preview-before-apply opens preview table and applies valid patches', async () => {
    const platform = makePlatform({ confirmThreshold: 0, previewBeforeApply: true });
    const { api } = mount(platform);
    act(() => fireEvent.click(screen.getByTestId('smart-edit-op-divide')));
    expect(screen.getByTestId('smart-edit-preview-table')).toBeTruthy();
    act(() => fireEvent.click(screen.getByTestId('smart-edit-preview-apply')));
    await waitFor(() => {
      expect(api.applyTransactionAsync).toHaveBeenCalled();
    });
  });

  it('disables ops when enforceSingleColumn guard fails', () => {
    const platform = makePlatform({ enforceSingleColumn: true });
    const api = makeMockApi();
    api.getCellRanges = () => [
      {
        columns: [{ getColId: () => 'qty' }, { getColId: () => 'ticker' }],
        startRow: { rowIndex: 0 },
        endRow: { rowIndex: 0 },
      },
    ];
    mount(platform, api);
    expect((screen.getByTestId('smart-edit-op-multiply') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/1 col/)).toBeTruthy();
  });
});
