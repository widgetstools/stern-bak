import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';
import type { IFloatingFilterParams } from 'ag-grid-community';
import { StreamSafeTextFloatingFilter } from './streamSafeFloatingFilter';

describe('StreamSafeTextFloatingFilter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function mountFilter(paramsOverrides: Record<string, unknown> = {}) {
    const setColumnFilterModel = vi.fn(async () => {});
    const onFilterChanged = vi.fn();
    const params = {
      debounceMs: 10,
      api: { setColumnFilterModel, onFilterChanged },
      column: {
        getColId: () => 'symbol',
        getColDef: () => ({ filter: 'agTextColumnFilter' }),
      },
      parentFilterInstance: vi.fn((cb) => cb({ onFloatingFilterChanged: vi.fn() })),
      ...paramsOverrides,
    } as unknown as IFloatingFilterParams;

    const filter = new StreamSafeTextFloatingFilter();
    filter.init(params);
    return { filter, setColumnFilterModel, params };
  }

  it('initialises DOM via getGui and applies parent model when unfocused', () => {
    const { filter } = mountFilter();
    const gui = filter.getGui();
    expect(gui.querySelector('input')).toBeTruthy();

    filter.onParentModelChanged({ filterType: 'text', filter: 'applied' });
    const input = gui.querySelector('input') as HTMLInputElement;
    expect(input.value).toBe('applied');
  });

  it('applies a single token through debounced input', () => {
    const onFloatingFilterChanged = vi.fn();
    const { filter } = mountFilter({
      parentFilterInstance: vi.fn((cb) => cb({ onFloatingFilterChanged, getFilterType: () => 'text' })),
    });
    const input = filter.getGui().querySelector('input') as HTMLInputElement;
    input.value = 'AAPL';
    input.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(15);
    expect(onFloatingFilterChanged).toHaveBeenCalledWith('contains', 'AAPL');
  });

  it('stringifies multi and compound models for display', () => {
    const { filter } = mountFilter();
    filter.onParentModelChanged({
      filterType: 'multi',
      filterModels: [null, { filterType: 'set', values: ['BUY', 'SELL'] }],
    });
    const input = filter.getGui().querySelector('input') as HTMLInputElement;
    expect(input.value).toBe('BUY, SELL');
  });

  it('clears via the clear button', () => {
    const onFloatingFilterChanged = vi.fn();
    const { filter } = mountFilter({
      parentFilterInstance: vi.fn((cb) => cb({ onFloatingFilterChanged, getFilterType: () => 'text' })),
    });
    const input = filter.getGui().querySelector('input') as HTMLInputElement;
    input.value = 'x';
    input.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(15);

    const clearBtn = filter.getGui().querySelector('button') as HTMLButtonElement;
    clearBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    vi.advanceTimersByTime(15);
    expect(input.value).toBe('');
  });

  it('routes multi-token input to the set sub-filter when present', () => {
    const setColumnFilterModel = vi.fn(async () => {});
    const { filter } = mountFilter({
      column: {
        getColId: () => 'side',
        getColDef: () => ({
          filter: 'agMultiColumnFilter',
          filterParams: {
            filters: [{ filter: 'agTextColumnFilter' }, { filter: 'agSetColumnFilter' }],
          },
        }),
      },
      api: { setColumnFilterModel, onFilterChanged: vi.fn() },
    });
    const input = filter.getGui().querySelector('input') as HTMLInputElement;
    input.value = 'BUY,SELL';
    input.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(15);
    expect(setColumnFilterModel).toHaveBeenCalledWith(
      'side',
      expect.objectContaining({
        filterType: 'multi',
        filterModels: expect.arrayContaining([
          null,
          { filterType: 'set', values: ['BUY', 'SELL'] },
        ]),
      }),
    );
  });

  it('uses compound OR text when multi has no set sub-filter', () => {
    const setColumnFilterModel = vi.fn(async () => {});
    const { filter } = mountFilter({
      column: {
        getColId: () => 'name',
        getColDef: () => ({
          filter: 'agMultiColumnFilter',
          filterParams: { filters: [{ filter: 'agTextColumnFilter' }] },
        }),
      },
      api: { setColumnFilterModel, onFilterChanged: vi.fn() },
    });
    const input = filter.getGui().querySelector('input') as HTMLInputElement;
    input.value = 'a,b';
    input.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(15);
    expect(setColumnFilterModel).toHaveBeenCalledWith(
      'name',
      expect.objectContaining({
        filterModels: [
          expect.objectContaining({
            filterType: 'text',
            operator: 'OR',
            conditions: [
              { filterType: 'text', type: 'equals', filter: 'a' },
              { filterType: 'text', type: 'equals', filter: 'b' },
            ],
          }),
        ],
      }),
    );
  });

  it('stringifies number and condition models', () => {
    const { filter } = mountFilter();
    filter.onParentModelChanged({ filterType: 'text', filter: 'hello' });
    expect((filter.getGui().querySelector('input') as HTMLInputElement).value).toBe('hello');

    filter.onParentModelChanged({
      filterType: 'text',
      operator: 'OR',
      conditions: [{ filter: 'x' }, { filter: 'y' }],
    });
    expect((filter.getGui().querySelector('input') as HTMLInputElement).value).toBe('x, y');

    filter.onParentModelChanged({ filterType: 'number', filter: 42 });
    expect((filter.getGui().querySelector('input') as HTMLInputElement).value).toBe('42');
  });

  it('destroy clears debounce timer and listeners', () => {
    const { filter } = mountFilter();
    const input = filter.getGui().querySelector('input') as HTMLInputElement;
    input.value = 'pending';
    input.dispatchEvent(new Event('input'));
    filter.destroy();
    vi.advanceTimersByTime(50);
    expect(filter.getGui()).toBeTruthy();
  });

  it('clears multi-filter envelope when input emptied', async () => {
    const setColumnFilterModel = vi.fn(async () => {});
    const { filter } = mountFilter({
      column: {
        getColId: () => 'side',
        getColDef: () => ({
          filter: 'agMultiColumnFilter',
          filterParams: { filters: [{ filter: 'agTextColumnFilter' }, { filter: 'agSetColumnFilter' }] },
        }),
      },
      api: { setColumnFilterModel, onFilterChanged: vi.fn() },
    });
    const input = filter.getGui().querySelector('input') as HTMLInputElement;
    input.value = 'BUY';
    input.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(15);
    input.value = '';
    input.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(15);
    expect(setColumnFilterModel).toHaveBeenLastCalledWith(
      'side',
      expect.objectContaining({ filterType: 'multi' }),
    );
  });

  it('routes single token to number sub-filter inside multi envelope', async () => {
    const setColumnFilterModel = vi.fn(async () => {});
    const { filter } = mountFilter({
      column: {
        getColId: () => 'price',
        getColDef: () => ({
          filter: 'agMultiColumnFilter',
          filterParams: { filters: [{ filter: 'agNumberColumnFilter' }, { filter: 'agSetColumnFilter' }] },
        }),
      },
      api: { setColumnFilterModel, onFilterChanged: vi.fn() },
    });
    const input = filter.getGui().querySelector('input') as HTMLInputElement;
    input.value = '42';
    input.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(15);
    expect(setColumnFilterModel).toHaveBeenCalledWith(
      'price',
      expect.objectContaining({
        filterModels: expect.arrayContaining([
          { filterType: 'number', type: 'equals', filter: 42 },
        ]),
      }),
    );
  });

  it('uses setModel fallback on standalone filter without onFloatingFilterChanged', async () => {
    const setModel = vi.fn();
    const { filter } = mountFilter({
      parentFilterInstance: vi.fn((cb) => cb({ getFilterType: () => 'text', setModel })),
    });
    const input = filter.getGui().querySelector('input') as HTMLInputElement;
    input.value = 'solo';
    input.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(15);
    expect(setModel).toHaveBeenCalledWith({ filterType: 'text', type: 'contains', filter: 'solo' });
  });

  it('applies standalone compound OR text for comma-separated tokens', async () => {
    const setColumnFilterModel = vi.fn(async () => {});
    const { filter } = mountFilter({
      column: {
        getColId: () => 'name',
        getColDef: () => ({ filter: 'agTextColumnFilter' }),
      },
      api: { setColumnFilterModel, onFilterChanged: vi.fn() },
    });
    const input = filter.getGui().querySelector('input') as HTMLInputElement;
    input.value = 'a,b';
    input.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(15);
    expect(setColumnFilterModel).toHaveBeenCalledWith(
      'name',
      expect.objectContaining({ operator: 'OR' }),
    );
  });

  it('returns empty string for multi envelope with only null slots', () => {
    const { filter } = mountFilter();
    filter.onParentModelChanged({ filterType: 'multi', filterModels: [null, null] });
    expect((filter.getGui().querySelector('input') as HTMLInputElement).value).toBe('');
  });
});
