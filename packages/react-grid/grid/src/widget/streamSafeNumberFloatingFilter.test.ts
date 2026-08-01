import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';
import type { IFloatingFilterParams } from 'ag-grid-community';
import { StreamSafeNumberFloatingFilter } from './streamSafeNumberFloatingFilter';

describe('StreamSafeNumberFloatingFilter', () => {
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
        getColId: () => 'price',
        getColDef: () => ({
          filter: 'agMultiColumnFilter',
          filterParams: {
            filters: [{ filter: 'agNumberColumnFilter' }, { filter: 'agSetColumnFilter' }],
          },
        }),
      },
      parentFilterInstance: vi.fn((cb) => cb({ onFloatingFilterChanged: vi.fn() })),
      ...paramsOverrides,
    } as unknown as IFloatingFilterParams;

    const filter = new StreamSafeNumberFloatingFilter();
    filter.init(params);
    return { filter, setColumnFilterModel, params };
  }

  it('initialises with number placeholder', () => {
    const { filter } = mountFilter();
    const input = filter.getGui().querySelector('input') as HTMLInputElement;
    expect(input.placeholder).toContain('100-150');
  });

  it('applies greater-than through debounced input', async () => {
    const setColumnFilterModel = vi.fn(async () => {});
    const { filter } = mountFilter({ api: { setColumnFilterModel, onFilterChanged: vi.fn() } });
    const input = filter.getGui().querySelector('input') as HTMLInputElement;
    input.value = '>100';
    input.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(15);
    await Promise.resolve();
    expect(setColumnFilterModel).toHaveBeenCalled();
  });

  it('routes bare-number CSV to set sub-filter in multi envelope', async () => {
    const setColumnFilterModel = vi.fn(async () => {});
    const { filter } = mountFilter({ api: { setColumnFilterModel, onFilterChanged: vi.fn() } });
    const input = filter.getGui().querySelector('input') as HTMLInputElement;
    input.value = '1, 2, 3';
    input.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(15);
    await Promise.resolve();
    expect(setColumnFilterModel).toHaveBeenCalled();
    const model = setColumnFilterModel.mock.calls.at(-1)?.[1] as { filterModels?: unknown[] };
    expect(model.filterType).toBe('multi');
    expect((model.filterModels?.[1] as { filterType?: string }).filterType).toBe('set');
  });

  it('stringifies compound OR model for display', () => {
    const { filter } = mountFilter();
    filter.onParentModelChanged({
      filterType: 'number',
      operator: 'OR',
      conditions: [
        { filterType: 'number', type: 'equals', filter: 1 },
        { filterType: 'number', type: 'equals', filter: 2 },
      ],
    });
    const input = filter.getGui().querySelector('input') as HTMLInputElement;
    expect(input.value).toContain('1');
    expect(input.value).toContain('2');
  });

  it('clears filter when input emptied', async () => {
    const setColumnFilterModel = vi.fn(async () => {});
    const { filter } = mountFilter({ api: { setColumnFilterModel, onFilterChanged: vi.fn() } });
    const input = filter.getGui().querySelector('input') as HTMLInputElement;
    input.value = '100';
    input.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(15);
    input.value = '';
    input.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(15);
    await Promise.resolve();
    expect(setColumnFilterModel).toHaveBeenCalledWith('price', expect.objectContaining({ filterType: 'multi' }));
  });

  it('applies range expression through debounced input', async () => {
    const setColumnFilterModel = vi.fn(async () => {});
    const { filter } = mountFilter({ api: { setColumnFilterModel, onFilterChanged: vi.fn() } });
    const input = filter.getGui().querySelector('input') as HTMLInputElement;
    input.value = '100-150';
    input.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(15);
    await Promise.resolve();
    expect(setColumnFilterModel).toHaveBeenCalled();
  });

  it('applies compound AND expression', async () => {
    const setColumnFilterModel = vi.fn(async () => {});
    const { filter } = mountFilter({ api: { setColumnFilterModel, onFilterChanged: vi.fn() } });
    const input = filter.getGui().querySelector('input') as HTMLInputElement;
    input.value = '>100 and <200';
    input.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(15);
    await Promise.resolve();
    expect(setColumnFilterModel).toHaveBeenCalled();
  });

  it('applies bare equals on standalone number filter', async () => {
    const setColumnFilterModel = vi.fn(async () => {});
    const { filter } = mountFilter({
      api: { setColumnFilterModel, onFilterChanged: vi.fn() },
      column: {
        getColId: () => 'price',
        getColDef: () => ({ filter: 'agNumberColumnFilter' }),
      },
    });
    const input = filter.getGui().querySelector('input') as HTMLInputElement;
    input.value = '42';
    input.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(15);
    await Promise.resolve();
    expect(setColumnFilterModel).toHaveBeenCalledWith('price', expect.objectContaining({ type: 'equals', filter: 42 }));
  });

  it('stringifies inRange and comparator models for display', () => {
    const { filter } = mountFilter();
    filter.onParentModelChanged({ filterType: 'number', type: 'inRange', filter: 10, filterTo: 20 });
    let input = filter.getGui().querySelector('input') as HTMLInputElement;
    expect(input.value).toContain('10');

    filter.onParentModelChanged({ filterType: 'number', type: 'greaterThan', filter: 5 });
    input = filter.getGui().querySelector('input') as HTMLInputElement;
    expect(input.value).toBe('>5');
  });

  it('routes comma-operator OR to compound filter', async () => {
    const setColumnFilterModel = vi.fn(async () => {});
    const { filter } = mountFilter({ api: { setColumnFilterModel, onFilterChanged: vi.fn() } });
    const input = filter.getGui().querySelector('input') as HTMLInputElement;
    input.value = '>100, <0';
    input.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(15);
    await Promise.resolve();
    expect(setColumnFilterModel).toHaveBeenCalled();
  });

  it('ignores unparseable input without clearing existing filter', async () => {
    const setColumnFilterModel = vi.fn(async () => {});
    const { filter } = mountFilter({ api: { setColumnFilterModel, onFilterChanged: vi.fn() } });
    filter.onParentModelChanged({ filterType: 'number', type: 'equals', filter: 99 });
    const input = filter.getGui().querySelector('input') as HTMLInputElement;
    input.value = 'not-a-number!!!';
    input.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(15);
    await Promise.resolve();
    expect(setColumnFilterModel).not.toHaveBeenCalled();
  });

  it('clears standalone number filter when input emptied', async () => {
    const onFloatingFilterChanged = vi.fn();
    const { filter } = mountFilter({
      column: {
        getColId: () => 'price',
        getColDef: () => ({ filter: 'agNumberColumnFilter' }),
      },
      parentFilterInstance: vi.fn((cb) => cb({ onFloatingFilterChanged, setModel: vi.fn() })),
    });
    const input = filter.getGui().querySelector('input') as HTMLInputElement;
    input.value = '';
    input.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(15);
    await Promise.resolve();
    expect(onFloatingFilterChanged).toHaveBeenCalledWith(null, null);
  });

  it('uses compound OR equals when bare CSV has no set sub-filter', async () => {
    const setColumnFilterModel = vi.fn(async () => {});
    const { filter } = mountFilter({
      column: {
        getColId: () => 'price',
        getColDef: () => ({
          filter: 'agMultiColumnFilter',
          filterParams: { filters: [{ filter: 'agNumberColumnFilter' }] },
        }),
      },
      api: { setColumnFilterModel, onFilterChanged: vi.fn() },
    });
    const input = filter.getGui().querySelector('input') as HTMLInputElement;
    input.value = '1,2';
    input.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(15);
    await Promise.resolve();
    expect(setColumnFilterModel).toHaveBeenCalledWith(
      'price',
      expect.objectContaining({
        filterModels: [expect.objectContaining({ operator: 'OR' })],
      }),
    );
  });

  it('falls back to first parseable fragment for mixed and/or input', async () => {
    const setColumnFilterModel = vi.fn(async () => {});
    const { filter } = mountFilter({
      column: {
        getColId: () => 'price',
        getColDef: () => ({ filter: 'agNumberColumnFilter' }),
      },
      api: { setColumnFilterModel, onFilterChanged: vi.fn() },
    });
    const input = filter.getGui().querySelector('input') as HTMLInputElement;
    input.value = '>100 and <50 or =5';
    input.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(15);
    await Promise.resolve();
    expect(setColumnFilterModel).toHaveBeenCalled();
  });

  it('stringifies set and multi envelope models for display', () => {
    const { filter } = mountFilter();
    filter.onParentModelChanged({
      filterType: 'multi',
      filterModels: [null, { filterType: 'set', values: ['1', '2'] }],
    });
    expect((filter.getGui().querySelector('input') as HTMLInputElement).value).toBe('1, 2');

    filter.onParentModelChanged({ filterType: 'number', type: 'notEqual', filter: 9 });
    expect((filter.getGui().querySelector('input') as HTMLInputElement).value).toBe('!=9');
  });
});
