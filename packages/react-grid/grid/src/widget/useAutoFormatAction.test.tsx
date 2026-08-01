import * as React from 'react';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Column, GridApi } from 'ag-grid-community';
import { GridPlatform } from '@wellsfargo-starui/core';
import {
  GridProvider,
  columnCustomizationModule,
  columnTemplatesModule,
  generalSettingsModule,
  type ColumnCustomizationState,
} from '@wellsfargo-starui/grid/customizer';
import { useAutoFormatAction } from './useAutoFormatAction';
import { AutoFormatButton } from './AutoFormatButton';

function makeFakeApi() {
  const col = {
    getColId: () => 'price',
    getColDef: () => ({ field: 'price', headerName: 'Price', cellDataType: 'number' }),
  } as Column;
  return {
    getColumns: () => [col],
  } as GridApi;
}

function makePlatform() {
  return new GridPlatform({
    gridId: 'test-grid',
    modules: [generalSettingsModule, columnTemplatesModule, columnCustomizationModule],
  });
}

describe('useAutoFormatAction', () => {
  it('no-ops outside a GridProvider', () => {
    const { result } = renderHook(() => useAutoFormatAction());
    expect(result.current.available).toBe(false);
    act(() => result.current.run());
  });

  it('applies auto format plan when api is ready', async () => {
    const platform = makePlatform();

    const { result } = renderHook(() => useAutoFormatAction(), {
      wrapper: ({ children }) => <GridProvider platform={platform}>{children}</GridProvider>,
    });

    act(() => {
      platform.onGridReady(makeFakeApi());
    });

    await waitFor(() => expect(result.current.available).toBe(true));
    act(() => result.current.run());

    const state = platform.store.getModuleState<ColumnCustomizationState>('column-customization');
    expect(state?.assignments?.price).toBeTruthy();
  });
});

describe('AutoFormatButton', () => {
  it('renders idle state and toggles to saved after run', async () => {
    const platform = makePlatform();

    render(
      <GridProvider platform={platform}>
        <AutoFormatButton />
      </GridProvider>,
    );

    act(() => {
      platform.onGridReady(makeFakeApi());
    });

    const btn = screen.getByRole('button', { name: 'Auto-format all columns' });
    await waitFor(() => expect(btn).not.toBeDisabled());
    fireEvent.click(btn);
    await waitFor(() => expect(btn).toHaveAttribute('data-state', 'saved'));
  });
});
