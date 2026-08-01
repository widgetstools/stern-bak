/**
 * @vitest-environment jsdom
 */
import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GridPlatform } from '@wellsfargo-starui/engine';
import { GridProvider } from '../../hooks/GridProvider';
import { smartEditModule } from './index';
import { useSmartEditSelection } from './useSmartEditSelection';

function makeMockApi() {
  const listeners = new Map<string, Set<() => void>>();
  return {
    getCellRanges: () => [],
    getFocusedCell: () => ({
      rowIndex: 0,
      column: { getColId: () => 'qty' },
    }),
    getDisplayedRowAtIndex: () => ({ id: 'r1', data: { id: 'r1', qty: 10 } }),
    getColumn: () => ({
      getColId: () => 'qty',
      getColDef: () => ({ editable: true, field: 'qty', cellDataType: 'number' }),
    }),
    getCellValue: () => 10,
    addEventListener: (evt: string, fn: () => void) => {
      if (!listeners.has(evt)) listeners.set(evt, new Set());
      listeners.get(evt)!.add(fn);
    },
    removeEventListener: (evt: string, fn: () => void) => {
      listeners.get(evt)?.delete(fn);
    },
    emit(evt: string) {
      listeners.get(evt)?.forEach((fn) => fn());
    },
  };
}

describe('useSmartEditSelection', () => {
  it('returns cell count from focused cell', () => {
    const platform = new GridPlatform({ gridId: 'test-grid', modules: [smartEditModule] });
    const api = makeMockApi();
    platform.onGridReady(api as never);

    const { result } = renderHook(() => useSmartEditSelection(), {
      wrapper: ({ children }) => (
        <GridProvider platform={platform}>{children}</GridProvider>
      ),
    });

    expect(result.current.count).toBe(1);
    expect(result.current.cells).toHaveLength(1);
  });

  it('recomputes when cellFocused fires', () => {
    const platform = new GridPlatform({ gridId: 'test-grid', modules: [smartEditModule] });
    const api = makeMockApi();
    platform.onGridReady(api as never);

    const { result } = renderHook(() => useSmartEditSelection(), {
      wrapper: ({ children }) => (
        <GridProvider platform={platform}>{children}</GridProvider>
      ),
    });

    api.getFocusedCell = () => null;
    act(() => {
      api.emit('cellFocused');
    });
    expect(result.current.count).toBe(0);
  });

  it('returns empty selection before grid api is ready', () => {
    const platform = new GridPlatform({ gridId: 'test-grid', modules: [smartEditModule] });
    const { result } = renderHook(() => useSmartEditSelection(), {
      wrapper: ({ children }) => (
        <GridProvider platform={platform}>{children}</GridProvider>
      ),
    });
    expect(result.current.count).toBe(0);
  });

  it('counts cells from a range selection', () => {
    const platform = new GridPlatform({ gridId: 'test-grid', modules: [smartEditModule] });
    const api = makeMockApi();
    api.getCellRanges = () => [{
      columns: [{ getColId: () => 'qty' }, { getColId: () => 'price' }],
      startRow: { rowIndex: 0 },
      endRow: { rowIndex: 1 },
    }];
    api.getDisplayedRowAtIndex = (i: number) => ({
      id: `r${i + 1}`,
      data: { id: `r${i + 1}`, qty: 1, price: 2 },
    });
    api.getFocusedCell = () => null;
    platform.onGridReady(api as never);

    const { result } = renderHook(() => useSmartEditSelection(), {
      wrapper: ({ children }) => (
        <GridProvider platform={platform}>{children}</GridProvider>
      ),
    });
    expect(result.current.count).toBe(4);
  });
});
