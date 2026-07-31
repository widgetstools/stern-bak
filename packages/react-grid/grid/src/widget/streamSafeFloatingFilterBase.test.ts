import { describe, expect, it, vi } from 'vitest';
import type { IFloatingFilterParams } from 'ag-grid-community';
import {
  buildMultiEnvelope,
  pushColumnModel,
  pushStandaloneClear,
  readColumnContext,
  readParamField,
} from './streamSafeFloatingFilterBase';

function makeParams(overrides: Partial<IFloatingFilterParams> & Record<string, unknown> = {}) {
  return {
    parentFilterInstance: vi.fn((cb) => cb({ setModel: vi.fn() })),
    ...overrides,
  } as unknown as IFloatingFilterParams;
}

describe('streamSafeFloatingFilterBase helpers', () => {
  it('readParamField reads arbitrary params keys', () => {
    const params = makeParams({ debounceMs: 100, column: { getColId: () => 'price' } });
    expect(readParamField<number>(params, 'debounceMs')).toBe(100);
    expect(readParamField(params, 'missing')).toBeUndefined();
  });

  it('readColumnContext detects multi-filter columns', () => {
    const params = makeParams({
      column: {
        getColId: () => 'side',
        getColDef: () => ({
          filter: 'agMultiColumnFilter',
          filterParams: {
            filters: [{ filter: 'agTextColumnFilter' }, { filter: 'agSetColumnFilter' }],
          },
        }),
      },
    });
    const ctx = readColumnContext(params);
    expect(ctx.colId).toBe('side');
    expect(ctx.isInsideMulti).toBe(true);
    expect(ctx.setIdx).toBe(1);
    expect(ctx.primaryIdx('agTextColumnFilter')).toBe(0);
  });

  it('buildMultiEnvelope preserves slot positions with null defaults', () => {
    expect(buildMultiEnvelope([{}, {}], { 1: { filterType: 'text' } })).toEqual({
      filterType: 'multi',
      filterModels: [null, { filterType: 'text' }],
    });
  });

  it('pushColumnModel uses api.setColumnFilterModel when available', async () => {
    const onFilterChanged = vi.fn();
    const setColumnFilterModel = vi.fn(async () => {});
    const params = makeParams({
      api: { setColumnFilterModel, onFilterChanged },
    });

    pushColumnModel(params, 'price', { filterType: 'text' });
    await Promise.resolve();
    expect(setColumnFilterModel).toHaveBeenCalledWith('price', { filterType: 'text' });
    expect(onFilterChanged).toHaveBeenCalled();
  });

  it('pushColumnModel falls back to parent.setModel when api is missing', () => {
    const setModel = vi.fn();
    const params = makeParams({
      parentFilterInstance: vi.fn((cb) => cb({ setModel })),
    });
    pushColumnModel(params, 'price', { filterType: 'text' });
    expect(setModel).toHaveBeenCalledWith({ filterType: 'text' });
  });

  it('pushStandaloneClear prefers onFloatingFilterChanged', () => {
    const onFloatingFilterChanged = vi.fn();
    const setModel = vi.fn();
    const params = makeParams({
      parentFilterInstance: vi.fn((cb) => cb({ onFloatingFilterChanged, setModel })),
    });
    pushStandaloneClear(params);
    expect(onFloatingFilterChanged).toHaveBeenCalledWith(null, null);
    expect(setModel).not.toHaveBeenCalled();
  });
});
