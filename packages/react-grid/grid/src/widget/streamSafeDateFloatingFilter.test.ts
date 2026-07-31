import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';
import type { IFloatingFilterParams } from 'ag-grid-community';
import { StreamSafeDateFloatingFilter, parseDateExpression } from './streamSafeDateFloatingFilter';

describe('StreamSafeDateFloatingFilter', () => {
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
      dateLocale: 'us',
      api: { setColumnFilterModel, onFilterChanged },
      column: {
        getColId: () => 'asOf',
        getColDef: () => ({
          filter: 'agMultiColumnFilter',
          filterParams: {
            filters: [{ filter: 'agDateColumnFilter' }, { filter: 'agSetColumnFilter' }],
          },
        }),
      },
      parentFilterInstance: vi.fn((cb) => cb({ onFloatingFilterChanged: vi.fn() })),
      ...paramsOverrides,
    } as unknown as IFloatingFilterParams;

    const filter = new StreamSafeDateFloatingFilter();
    filter.init(params);
    return { filter, setColumnFilterModel, params };
  }

  it('uses EU placeholder when dateLocale is eu', () => {
    const { filter } = mountFilter({ dateLocale: 'eu' });
    const input = filter.getGui().querySelector('input') as HTMLInputElement;
    expect(input.placeholder).toContain('12/06/2025');
  });

  it('applies ISO date through debounced input', async () => {
    const setColumnFilterModel = vi.fn(async () => {});
    const { filter } = mountFilter({ api: { setColumnFilterModel, onFilterChanged: vi.fn() } });
    const input = filter.getGui().querySelector('input') as HTMLInputElement;
    input.value = '2025-01-15';
    input.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(15);
    await Promise.resolve();
    expect(setColumnFilterModel).toHaveBeenCalled();
  });

  it('routes bare-date CSV to set sub-filter', async () => {
    const setColumnFilterModel = vi.fn(async () => {});
    const { filter } = mountFilter({ api: { setColumnFilterModel, onFilterChanged: vi.fn() } });
    const input = filter.getGui().querySelector('input') as HTMLInputElement;
    input.value = '2025-01-15, 2025-02-15';
    input.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(15);
    await Promise.resolve();
    const model = setColumnFilterModel.mock.calls.at(-1)?.[1] as { filterModels?: unknown[] };
    expect((model.filterModels?.[1] as { filterType?: string }).filterType).toBe('set');
  });

  it('stringifies inRange model for display', () => {
    const { filter } = mountFilter();
    filter.onParentModelChanged({
      filterType: 'date',
      type: 'inRange',
      dateFrom: '2025-01-01 00:00:00',
      dateTo: '2025-12-31 23:59:59',
    });
    const input = filter.getGui().querySelector('input') as HTMLInputElement;
    expect(input.value).toContain('2025-01-01');
  });

  it('parseDateExpression expands year-only to inRange', () => {
    const model = parseDateExpression('2025', 'us');
    expect(model).toMatchObject({ filterType: 'date', type: 'inRange' });
  });

  it('applies year period expression', async () => {
    const setColumnFilterModel = vi.fn(async () => {});
    const { filter } = mountFilter({ api: { setColumnFilterModel, onFilterChanged: vi.fn() } });
    const input = filter.getGui().querySelector('input') as HTMLInputElement;
    input.value = '2025';
    input.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(15);
    await Promise.resolve();
    expect(setColumnFilterModel).toHaveBeenCalled();
  });

  it('applies relative trailing window expression', async () => {
    const setColumnFilterModel = vi.fn(async () => {});
    const { filter } = mountFilter({ api: { setColumnFilterModel, onFilterChanged: vi.fn() } });
    const input = filter.getGui().querySelector('input') as HTMLInputElement;
    input.value = 'last 7 days';
    input.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(15);
    await Promise.resolve();
    expect(setColumnFilterModel).toHaveBeenCalled();
  });

  it('applies comparator range with "to" keyword', async () => {
    const setColumnFilterModel = vi.fn(async () => {});
    const { filter } = mountFilter({ api: { setColumnFilterModel, onFilterChanged: vi.fn() } });
    const input = filter.getGui().querySelector('input') as HTMLInputElement;
    input.value = '2025-01-01 to 2025-12-31';
    input.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(15);
    await Promise.resolve();
    expect(setColumnFilterModel).toHaveBeenCalled();
  });

  it('applies month period expression', async () => {
    const setColumnFilterModel = vi.fn(async () => {});
    const { filter } = mountFilter({ api: { setColumnFilterModel, onFilterChanged: vi.fn() } });
    const input = filter.getGui().querySelector('input') as HTMLInputElement;
    input.value = 'Jan 2025';
    input.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(15);
    await Promise.resolve();
    expect(setColumnFilterModel).toHaveBeenCalled();
  });

  it('applies quarter period expression', async () => {
    const setColumnFilterModel = vi.fn(async () => {});
    const { filter } = mountFilter({ api: { setColumnFilterModel, onFilterChanged: vi.fn() } });
    const input = filter.getGui().querySelector('input') as HTMLInputElement;
    input.value = 'Q1 2025';
    input.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(15);
    await Promise.resolve();
    expect(setColumnFilterModel).toHaveBeenCalled();
  });

  it('applies today keyword', async () => {
    const setColumnFilterModel = vi.fn(async () => {});
    const { filter } = mountFilter({ api: { setColumnFilterModel, onFilterChanged: vi.fn() } });
    const input = filter.getGui().querySelector('input') as HTMLInputElement;
    input.value = 'today';
    input.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(15);
    await Promise.resolve();
    expect(setColumnFilterModel).toHaveBeenCalled();
  });

  it('applies compound AND date expression', async () => {
    const setColumnFilterModel = vi.fn(async () => {});
    const { filter } = mountFilter({ api: { setColumnFilterModel, onFilterChanged: vi.fn() } });
    const input = filter.getGui().querySelector('input') as HTMLInputElement;
    input.value = '>=2025-01-01 and <=2025-06-30';
    input.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(15);
    await Promise.resolve();
    expect(setColumnFilterModel).toHaveBeenCalled();
  });

  it('stringifies compound OR date model for display', () => {
    const { filter } = mountFilter();
    filter.onParentModelChanged({
      filterType: 'date',
      operator: 'OR',
      conditions: [
        { filterType: 'date', type: 'equals', dateFrom: '2025-01-15 00:00:00' },
        { filterType: 'date', type: 'equals', dateFrom: '2025-02-15 00:00:00' },
      ],
    });
    const input = filter.getGui().querySelector('input') as HTMLInputElement;
    expect(input.value).toContain('2025-01-15');
    expect(input.value).toContain('2025-02-15');
  });

  it('applies EU slash date with eu locale', async () => {
    const setColumnFilterModel = vi.fn(async () => {});
    const { filter } = mountFilter({
      dateLocale: 'eu',
      api: { setColumnFilterModel, onFilterChanged: vi.fn() },
    });
    const input = filter.getGui().querySelector('input') as HTMLInputElement;
    input.value = '15/01/2025';
    input.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(15);
    await Promise.resolve();
    expect(setColumnFilterModel).toHaveBeenCalled();
  });
});
