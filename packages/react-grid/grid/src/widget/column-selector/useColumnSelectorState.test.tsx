/**
 * @vitest-environment jsdom
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Column, GridApi } from 'ag-grid-community';
import { useColumnSelectorState } from './useColumnSelectorState.js';

function makeApi(cols: Array<{ id: string; headerName?: string; hidden?: boolean; locked?: boolean }>): GridApi {
  const toColumn = (c: { id: string; headerName?: string; hidden?: boolean; locked?: boolean }): Column =>
    ({
      getColId: () => c.id,
      getColDef: () => ({ headerName: c.headerName ?? c.id, lockVisible: c.locked === true }),
      isVisible: () => c.hidden !== true,
    }) as Column;

  return {
    getColumns: () => cols.map(toColumn),
    applyColumnState: vi.fn(),
  } as unknown as GridApi;
}

describe('useColumnSelectorState', () => {
  it('seeds draft state when dialog opens', () => {
    const api = makeApi([
      { id: 'a', headerName: 'A' },
      { id: 'b', headerName: 'B', hidden: true },
    ]);

    const { result, rerender } = renderHook(
      ({ open }) => useColumnSelectorState(api, open),
      { initialProps: { open: false } },
    );

    expect(result.current.visible.items).toHaveLength(0);

    rerender({ open: true });
    expect(result.current.visible.items.map((c) => c.colId)).toEqual(['a']);
    expect(result.current.available.items.map((c) => c.colId)).toEqual(['b']);
  });

  it('moves columns between lists and applies to grid', () => {
    const api = makeApi([
      { id: 'a' },
      { id: 'b', hidden: true },
    ]);
    const { result } = renderHook(() => useColumnSelectorState(api, true));

    act(() => {
      result.current.available.onItemClick('b', { metaKey: false, ctrlKey: false, shiftKey: false });
    });
    act(() => {
      result.current.addSelected();
    });
    expect(result.current.visible.items.some((c) => c.colId === 'b')).toBe(true);

    act(() => {
      result.current.visible.onItemClick('b', { metaKey: false, ctrlKey: false, shiftKey: false });
    });
    act(() => {
      result.current.removeSelected();
    });
    expect(result.current.available.items.some((c) => c.colId === 'b')).toBe(true);

    act(() => {
      result.current.apply();
    });
    expect(api.applyColumnState).toHaveBeenCalled();
  });

  it('toggles ctrl multi-select and double-click transfer', () => {
    const api = makeApi([
      { id: 'a' },
      { id: 'b', hidden: true },
    ]);
    const { result } = renderHook(() => useColumnSelectorState(api, true));

    act(() => {
      result.current.available.onItemClick('b', { metaKey: false, ctrlKey: true, shiftKey: false });
    });
    expect(result.current.available.selected.has('b')).toBe(true);

    act(() => {
      result.current.available.onItemDoubleClick('b');
    });
    expect(result.current.visible.items.some((c) => c.colId === 'b')).toBe(true);
  });

  it('reorders visible columns when search is empty', () => {
    const api = makeApi([{ id: 'a' }, { id: 'b' }]);
    const { result } = renderHook(() => useColumnSelectorState(api, true));

    act(() => {
      result.current.reorder('b', 'a');
    });
    expect(result.current.visible.items.map((c) => c.colId)).toEqual(['b', 'a']);
  });

  it('filters available list by search query', () => {
    const api = makeApi([
      { id: 'a', headerName: 'Alpha' },
      { id: 'b', headerName: 'Beta', hidden: true },
      { id: 'c', headerName: 'Gamma', hidden: true },
    ]);
    const { result } = renderHook(() => useColumnSelectorState(api, true));

    act(() => {
      result.current.available.setQuery('bet');
    });
    expect(result.current.available.filtered.map((c) => c.colId)).toEqual(['b']);

    act(() => {
      result.current.available.setQuery('');
    });
    expect(result.current.available.filtered.map((c) => c.colId)).toEqual(['b', 'c']);
  });

  it('no-ops addSelected and removeSelected when nothing is selected', async () => {
    const api = makeApi([{ id: 'a' }, { id: 'b', hidden: true }]);
    const { result } = renderHook(() => useColumnSelectorState(api, true));
    await waitFor(() => expect(result.current.available.items).toHaveLength(1));

    act(() => {
      result.current.addSelected();
      result.current.removeSelected();
    });
    expect(result.current.visible.items.map((c) => c.colId)).toEqual(['a']);
  });

  it('toggles ctrl multi-select off on second click', async () => {
    const api = makeApi([
      { id: 'a' },
      { id: 'b', hidden: true },
      { id: 'c', hidden: true },
    ]);
    const { result } = renderHook(() => useColumnSelectorState(api, true));
    await waitFor(() => expect(result.current.available.items).toHaveLength(2));

    act(() => {
      result.current.available.onItemClick('b', { metaKey: false, ctrlKey: true, shiftKey: false });
    });
    expect(result.current.available.selected).toEqual(new Set(['b']));

    act(() => {
      result.current.available.onItemClick('b', { metaKey: false, ctrlKey: true, shiftKey: false });
    });
    expect(result.current.available.selected).toEqual(new Set());
  });

  it('addAll and removeAll move every filtered column', () => {
    const api = makeApi([
      { id: 'a' },
      { id: 'b', hidden: true },
      { id: 'c', hidden: true },
    ]);
    const { result } = renderHook(() => useColumnSelectorState(api, true));

    act(() => {
      result.current.addAll();
    });
    expect(result.current.visible.items.map((c) => c.colId)).toEqual(['a', 'b', 'c']);

    act(() => {
      result.current.removeAll();
    });
    expect(result.current.visible.items).toEqual([]);
  });

  it('reorders a multi-selection block together', () => {
    const api = makeApi([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    const { result } = renderHook(() => useColumnSelectorState(api, true));

    act(() => {
      result.current.visible.onItemClick('b', { metaKey: false, ctrlKey: true, shiftKey: false });
      result.current.visible.onItemClick('c', { metaKey: false, ctrlKey: true, shiftKey: false });
    });
    act(() => {
      result.current.reorder('c', 'a');
    });
    expect(result.current.visible.items.map((c) => c.colId)).toEqual(['b', 'c', 'a']);
  });

  it('disables remove actions for locked visible columns', () => {
    const api = makeApi([{ id: 'a', locked: true }]);
    const { result } = renderHook(() => useColumnSelectorState(api, true));

    act(() => {
      result.current.visible.onItemClick('a', { metaKey: false, ctrlKey: false, shiftKey: false });
    });
    expect(result.current.canRemove).toBe(false);
    expect(result.current.canRemoveAll).toBe(false);
  });

  it('seeds empty state when dialog opens without grid api', () => {
    const { result, rerender } = renderHook(
      ({ open }) => useColumnSelectorState(null, open),
      { initialProps: { open: false } },
    );
    rerender({ open: true });
    expect(result.current.visible.items).toEqual([]);
    expect(result.current.available.items).toEqual([]);
  });
});
