/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Column, GridApi } from 'ag-grid-community';
import { GridPlatform } from '@wellsfargo-starui/core';
import { GridProvider } from '../../../hooks/GridProvider';
import { ColumnPickerMulti } from './ColumnPickerMulti';

function makeFakeApi(cols: { id: string; headerName: string }[]): GridApi {
  const listeners = new Map<string, Set<() => void>>();
  const api: Partial<GridApi> = {
    getColumns: () =>
      cols.map((c) => ({
        getColId: () => c.id,
        getColDef: () => ({ headerName: c.headerName }),
      }) as Column),
    addEventListener: ((evt: string, fn: () => void) => {
      if (!listeners.has(evt)) listeners.set(evt, new Set());
      listeners.get(evt)!.add(fn);
    }) as GridApi['addEventListener'],
    removeEventListener: ((evt: string, fn: () => void) => {
      listeners.get(evt)?.delete(fn);
    }) as GridApi['removeEventListener'],
  };
  return api as GridApi;
}

function wrap(onChange: (next: string[]) => void, value: string[]) {
  const platform = new GridPlatform({ gridId: 'g', modules: [] });
  platform.onGridReady(makeFakeApi([
    { id: 'price', headerName: 'Price' },
    { id: 'qty', headerName: 'Qty' },
  ]));
  return render(
    <GridProvider platform={platform}>
      <ColumnPickerMulti value={value} onChange={onChange} />
    </GridProvider>,
  );
}

describe('ColumnPickerMulti', () => {
  beforeEach(() => {
    if (!globalThis.ResizeObserver) {
      globalThis.ResizeObserver = class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
      };
    }
  });

  it('shows warning when no columns selected', () => {
    wrap(() => {}, []);
    expect(screen.getByTestId('cs-no-columns-warning')).toBeTruthy();
  });

  it('adds a column through the native select', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    wrap(onChange, []);
    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Qty' }));
    expect(onChange).toHaveBeenCalledWith(['qty']);
  });

  it('removes a selected column chip', () => {
    const onChange = vi.fn();
    wrap(onChange, ['price']);
    expect(screen.getByText('Price')).toBeTruthy();
    fireEvent.click(screen.getByTitle('Remove'));
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
