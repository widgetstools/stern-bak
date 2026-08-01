import { useCallback } from 'react';
import type { GridApi } from 'ag-grid-community';
import type { LayoutState } from '../types.js';

export interface GridStateManagerResult {
  captureGridState: () => LayoutState;
  applyGridState: (state: LayoutState) => void;
  resetGridState: () => void;
}

/**
 * useGridStateManager — captures and applies AG Grid state for layout persistence.
 */
export function useGridStateManager(gridApi: GridApi | null): GridStateManagerResult {
  const captureGridState = useCallback((): LayoutState => {
    if (!gridApi) return {};

    return {
      columnState: gridApi.getColumnState() as unknown as Record<string, unknown>[],
      filterModel: gridApi.getFilterModel() as Record<string, unknown>,
      sortModel: [] // Captured in columnState
    };
  }, [gridApi]);

  const applyGridState = useCallback((state: LayoutState) => {
    if (!gridApi) return;

    if (state.columnState) {
      gridApi.applyColumnState({
        state: state.columnState as any,
        applyOrder: true
      });
    }

    if (state.filterModel) {
      gridApi.setFilterModel(state.filterModel);
    }
  }, [gridApi]);

  const resetGridState = useCallback(() => {
    if (!gridApi) return;
    gridApi.resetColumnState();
    gridApi.setFilterModel(null);
  }, [gridApi]);

  return { captureGridState, applyGridState, resetGridState };
}
