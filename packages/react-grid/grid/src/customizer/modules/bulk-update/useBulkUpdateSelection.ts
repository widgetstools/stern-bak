import { useCallback, useEffect, useState } from 'react';
import type { GridApi } from 'ag-grid-community';
import { useGridPlatform } from '../../hooks/GridProvider';
import { resolveBulkUpdateTargets } from './runtime/applyBulkUpdateEdits';

export function useBulkUpdateSelection(): {
  cells: ReturnType<typeof resolveBulkUpdateTargets>;
  count: number;
} {
  const platform = useGridPlatform();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    const disposers: Array<() => void> = [];
    disposers.push(
      platform.api.onReady(() => {
        disposers.push(platform.api.on('cellFocused', bump));
        disposers.push(platform.api.on('cellClicked', bump));
        disposers.push(platform.api.on('cellSelectionChanged', bump));
        bump();
      }),
    );
    return () => {
      for (const d of disposers) {
        try { d(); } catch { /* teardown */ }
      }
    };
  }, [platform]);

  const getCells = useCallback(() => {
    const api: GridApi | null = platform.api.api;
    if (!api) return [];
    return resolveBulkUpdateTargets(api);
  }, [platform, tick]);

  const cells = getCells();
  return { cells, count: cells.length };
}
