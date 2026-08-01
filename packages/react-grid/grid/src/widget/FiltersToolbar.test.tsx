/**
 * RTL integration tests for FiltersToolbar — mounts inside GridProvider
 * with saved-filters module state and a fake GridApi (same harness as
 * useFilterModel.test.ts).
 */
import * as React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { GridApi } from 'ag-grid-community';
import { GridPlatform } from '@wellsfargo-starui/core';
import {
  GridProvider,
  savedFiltersModule,
  toolbarVisibilityModule,
  type SavedFiltersState,
} from '@wellsfargo-starui/grid/customizer';
import { FiltersToolbar } from './FiltersToolbar';
import type { SavedFilter } from './types';

function makeFakeApi() {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  let liveModel: Record<string, unknown> | null = null;

  const api: Partial<GridApi> = {
    addEventListener: ((evt: string, fn: (...a: unknown[]) => void) => {
      if (!listeners.has(evt)) listeners.set(evt, new Set());
      listeners.get(evt)!.add(fn);
    }) as unknown as GridApi['addEventListener'],
    removeEventListener: ((evt: string, fn: (...a: unknown[]) => void) => {
      listeners.get(evt)?.delete(fn);
    }) as unknown as GridApi['removeEventListener'],
    getFilterModel: (() => liveModel) as GridApi['getFilterModel'],
    setFilterModel: ((m: Record<string, unknown> | null) => {
      liveModel = m;
    }) as GridApi['setFilterModel'],
    forEachNode: ((_fn: () => void) => {}) as GridApi['forEachNode'],
  };

  return {
    api: api as GridApi,
    fireEvent: (evt: string) => {
      for (const fn of Array.from(listeners.get(evt) ?? [])) fn();
    },
    setLiveModel: (m: Record<string, unknown> | null) => { liveModel = m; },
  };
}

function makePlatform() {
  return new GridPlatform({
    gridId: 'test-grid',
    modules: [savedFiltersModule, toolbarVisibilityModule],
  });
}

function mountToolbar(platform: GridPlatform, api: GridApi) {
  platform.onGridReady(api);
  return render(
    <GridProvider platform={platform}>
      <FiltersToolbar />
    </GridProvider>,
  );
}

function seedFilters(platform: GridPlatform, filters: SavedFilter[]) {
  platform.store.setModuleState<SavedFiltersState>('saved-filters', () => ({ filters }));
}

describe('FiltersToolbar', () => {
  let platform: GridPlatform;
  beforeEach(() => { platform = makePlatform(); });
  afterEach(() => { cleanup(); });

  it('renders empty toolbar with add disabled', () => {
    const fake = makeFakeApi();
    mountToolbar(platform, fake.api);
    expect(screen.getByTestId('filters-toolbar')).toHaveAttribute('data-expanded', 'true');
    expect(screen.getByTestId('filters-add-btn')).toHaveAttribute('data-enabled', 'false');
  });

  it('toggles a pill active state on click', async () => {
    seedFilters(platform, [
      { id: 'a', label: 'Side BUY', active: true, filterModel: { side: { filterType: 'text', filter: 'BUY' } } },
    ]);
    const fake = makeFakeApi();
    mountToolbar(platform, fake.api);

    await waitFor(() => expect(screen.getByTestId('filter-pill-a')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Side BUY'));
    expect(screen.getByTestId('filter-pill-a')).toHaveAttribute('data-active', 'false');
  });

  it('removes a pill via the trash action', async () => {
    seedFilters(platform, [
      { id: 'a', label: 'A', active: false, filterModel: {} },
    ]);
    const fake = makeFakeApi();
    mountToolbar(platform, fake.api);

    await waitFor(() => expect(screen.getByTestId('filter-pill-a')).toBeInTheDocument());
    fireEvent.click(screen.getByTitle('Remove'));
    expect(screen.queryByTestId('filter-pill-a')).toBeNull();
  });

  it('deactivates all active pills via clear button', async () => {
    seedFilters(platform, [
      { id: 'a', label: 'A', active: true, filterModel: {} },
      { id: 'b', label: 'B', active: true, filterModel: {} },
    ]);
    const fake = makeFakeApi();
    mountToolbar(platform, fake.api);

    await waitFor(() => expect(screen.getByTestId('filters-clear-btn')).toBeEnabled());
    fireEvent.click(screen.getByTestId('filters-clear-btn'));
    expect(screen.getByTestId('filter-pill-a')).toHaveAttribute('data-active', 'false');
    expect(screen.getByTestId('filter-pill-b')).toHaveAttribute('data-active', 'false');
  });

  it('captures live filter via add button when hasNewFilter', async () => {
    const fake = makeFakeApi();
    mountToolbar(platform, fake.api);
    fake.setLiveModel({ price: { filterType: 'number', type: 'greaterThan', filter: 100 } });

    act(() => fake.fireEvent('filterChanged'));
    await waitFor(() =>
      expect(screen.getByTestId('filters-add-btn')).toHaveAttribute('data-enabled', 'true'),
    );
    fireEvent.click(screen.getByTestId('filters-add-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('filters-add-btn')).toHaveAttribute('data-enabled', 'false');
    });
  });

  it('collapses and expands the pill row', async () => {
    seedFilters(platform, [
      { id: 'a', label: 'A', active: false, filterModel: {} },
    ]);
    const fake = makeFakeApi();
    mountToolbar(platform, fake.api);

    await waitFor(() => expect(screen.getByTestId('filter-pill-a')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('filters-collapse-toggle'));
    expect(screen.getByTestId('filters-toolbar')).toHaveAttribute('data-expanded', 'false');
    expect(screen.getByTestId('filters-summary-chip')).toHaveTextContent('1');

    fireEvent.click(screen.getByTestId('filters-summary-chip'));
    expect(screen.getByTestId('filters-toolbar')).toHaveAttribute('data-expanded', 'true');
  });

  it('renames a pill inline', async () => {
    const user = userEvent.setup();
    seedFilters(platform, [
      { id: 'a', label: 'Old', active: false, filterModel: {} },
    ]);
    const fake = makeFakeApi();
    mountToolbar(platform, fake.api);

    await waitFor(() => expect(screen.getByTestId('filter-pill-a')).toBeInTheDocument());
    fireEvent.click(screen.getByTitle('Rename'));
    const input = screen.getByDisplayValue('Old');
    await user.clear(input);
    await user.type(input, 'Renamed{Enter}');
    await waitFor(() => expect(screen.getByText('Renamed')).toBeInTheDocument());
  });

  it('opens details popover and saves edited filter model', async () => {
    const user = userEvent.setup();
    seedFilters(platform, [
      { id: 'a', label: 'A', active: false, filterModel: { side: { filterType: 'text', filter: 'BUY' } } },
    ]);
    const fake = makeFakeApi();
    mountToolbar(platform, fake.api);

    await waitFor(() => expect(screen.getByTestId('filter-pill-menu-a')).toBeInTheDocument());
    await user.click(screen.getByTestId('filter-pill-menu-a'));
    const textarea = await screen.findByTestId('filter-pill-details-textarea');
    fireEvent.change(textarea, {
      target: {
        value: JSON.stringify({ side: { filterType: 'text', filter: 'SELL' } }, null, 2),
      },
    });
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByTestId('filter-pill-details-textarea')).toBeNull());
  });

  it('shows JSON error for invalid filter model draft', async () => {
    const user = userEvent.setup();
    seedFilters(platform, [
      { id: 'a', label: 'A', active: false, filterModel: {} },
    ]);
    const fake = makeFakeApi();
    mountToolbar(platform, fake.api);

    await user.click(await screen.findByTestId('filter-pill-menu-a'));
    const textarea = await screen.findByTestId('filter-pill-details-textarea');
    await user.clear(textarea);
    await user.type(textarea, 'not-json');
    expect(screen.getByTestId('filter-pill-details-error')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('repairs malformed set-filter values from saved state without crashing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    platform.store.setModuleState<SavedFiltersState>('saved-filters', () => ({
      filters: [{
        id: 'bad',
        label: 'Bad set',
        active: false,
        filterModel: {
          side: { filterType: 'set', values: { 0: 'BUY', 1: 'SELL' } as unknown as string[] },
        },
      }],
    }));
    const fake = makeFakeApi();
    mountToolbar(platform, fake.api);

    await waitFor(() => expect(screen.getByTestId('filter-pill-bad')).toBeInTheDocument());
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
