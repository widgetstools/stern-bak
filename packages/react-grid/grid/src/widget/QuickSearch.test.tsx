import * as React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GridApi } from 'ag-grid-community';
import { GridPlatform } from '@wellsfargo-starui/core';
import { GridProvider, generalSettingsModule } from '@wellsfargo-starui/grid/customizer';
import { QuickSearch } from './QuickSearch';

function makePlatform(api?: Partial<GridApi>) {
  const platform = new GridPlatform({ gridId: 'g1', modules: [generalSettingsModule] });
  const setGridOption = vi.fn();
  platform.onGridReady({
    setGridOption,
    ...api,
  } as GridApi);
  return { platform, setGridOption };
}

describe('QuickSearch', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  it('debounces quick filter pushes while clearing immediately', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { platform, setGridOption } = makePlatform();

    render(
      <GridProvider platform={platform}>
        <QuickSearch />
      </GridProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Search grid' }));
    const input = screen.getByRole('textbox', { name: 'Search grid' });
    await user.type(input, 'abc');
    expect(setGridOption).not.toHaveBeenCalledWith('quickFilterText', 'abc');

    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(setGridOption).toHaveBeenCalledWith('quickFilterText', 'abc');

    await user.clear(input);
    expect(setGridOption).toHaveBeenCalledWith('quickFilterText', '');
  });

  it('clears on Escape and exposes clear button when text is present', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { platform, setGridOption } = makePlatform();

    render(
      <GridProvider platform={platform}>
        <QuickSearch />
      </GridProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Search grid' }));
    const input = screen.getByRole('textbox', { name: 'Search grid' });
    await user.type(input, 'x');
    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(screen.getByRole('button', { name: 'Clear search' })).toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(setGridOption).toHaveBeenCalledWith('quickFilterText', '');
  });
});
