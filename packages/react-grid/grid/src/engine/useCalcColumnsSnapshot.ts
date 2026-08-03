/**
 * Subscribe to the calculated-columns module slice.
 *
 * Under Perspective those columns must be published to the worker as Table
 * expression columns, so the surface needs them reactively rather than at
 * mount: a column added in the customizer panel has to reach the worker
 * without a remount, or it renders as a client-side value the book does not
 * have (see `usePerspectiveCalcColumns` for why that is a correctness gap).
 */

import { useCallback, useSyncExternalStore } from 'react';
import type { CalculatedColumnsState, GridPlatform } from '@wellsfargo-starui/core';
import { CALCULATED_COLUMNS_MODULE_ID } from '../customizer/modules/calculated-columns/index.js';

export function useCalcColumnsSnapshot(
  platform: GridPlatform | null | undefined,
): CalculatedColumnsState | undefined {
  const store = platform?.store;
  const subscribe = useCallback(
    (onChange: () => void) =>
      typeof store?.subscribeToModule === 'function'
        ? store.subscribeToModule<CalculatedColumnsState>(CALCULATED_COLUMNS_MODULE_ID, onChange)
        : () => {},
    [store],
  );
  const getSnapshot = useCallback(() => {
    if (typeof store?.getModuleState !== 'function') return undefined;
    return store.getModuleState<CalculatedColumnsState>(CALCULATED_COLUMNS_MODULE_ID);
  }, [store]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
