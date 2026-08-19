import { useCallback, useEffect, useState } from 'react';
import type { GridApi } from 'ag-grid-community';
import { useGridPlatform } from '../../hooks/GridProvider';
import { resolveBulkUpdateTargets } from './runtime/applyBulkUpdateEdits';
import { createRafCoalescedCallback } from '../../../widget/coalesceGridEvent.js';

export function useBulkUpdateSelection(): {
  cells: ReturnType<typeof resolveBulkUpdateTargets>['targets'];
  count: number;
  /** Selected rows the grid holds no data for — see `BulkUpdateSelection`. */
  unreachableRows: number;
} {
  const platform = useGridPlatform();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const { schedule: bump, cancel } = createRafCoalescedCallback(() => {
      setTick((t) => t + 1);
    });
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
      cancel();
      for (const d of disposers) {
        try { d(); } catch { /* teardown */ }
      }
    };
  }, [platform]);

  const getSelection = useCallback(() => {
    const api: GridApi | null = platform.api.api;
    if (!api) return { targets: [], unreachableRows: 0 };
    return resolveBulkUpdateTargets(api);
  }, [platform, tick]);

  const selection = getSelection();
  return {
    cells: selection.targets,
    count: selection.targets.length,
    unreachableRows: selection.unreachableRows,
  };
}
