import { describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGridStateManager } from './useGridStateManager.js';

function makeApi() {
  return {
    getColumnState: vi.fn(() => [{ colId: 'a', sort: 'asc' }]),
    getFilterModel: vi.fn(() => ({ book: { filterType: 'text' } })),
    applyColumnState: vi.fn(),
    setFilterModel: vi.fn(),
    resetColumnState: vi.fn(),
  };
}

describe('useGridStateManager', () => {
  it('returns empty state and no-ops when gridApi is null', () => {
    const { result } = renderHook(() => useGridStateManager(null));
    expect(result.current.captureGridState()).toEqual({});
    act(() => {
      result.current.applyGridState({ columnState: [{ colId: 'x' }] });
      result.current.resetGridState();
    });
  });

  it('captures column and filter state from the grid api', () => {
    const api = makeApi();
    const { result } = renderHook(() => useGridStateManager(api as never));
    expect(result.current.captureGridState()).toEqual({
      columnState: [{ colId: 'a', sort: 'asc' }],
      filterModel: { book: { filterType: 'text' } },
      sortModel: [],
    });
  });

  it('applies saved layout state back onto the grid', () => {
    const api = makeApi();
    const { result } = renderHook(() => useGridStateManager(api as never));
    act(() => {
      result.current.applyGridState({
        columnState: [{ colId: 'b' }],
        filterModel: { status: { filterType: 'set' } },
      });
    });
    expect(api.applyColumnState).toHaveBeenCalledWith({
      state: [{ colId: 'b' }],
      applyOrder: true,
    });
    expect(api.setFilterModel).toHaveBeenCalledWith({ status: { filterType: 'set' } });
  });

  it('resets column state and clears filters', () => {
    const api = makeApi();
    const { result } = renderHook(() => useGridStateManager(api as never));
    act(() => result.current.resetGridState());
    expect(api.resetColumnState).toHaveBeenCalled();
    expect(api.setFilterModel).toHaveBeenCalledWith(null);
  });
});
