import { useEffect, useState } from 'react';
import type { GridApi } from 'ag-grid-community';
import type { ApiEventName } from '@wellsfargo-starui/core';
import { useGridPlatform } from './GridProvider';

/**
 * Returns the live `GridApi` once ready, or `null` while we're waiting for
 * AG-Grid's `onGridReady`. Null-safe by design — consumers either render a
 * spinner or short-circuit.
 */
export function useGridApi(): GridApi | null {
  const platform = useGridPlatform();
  const [api, setApi] = useState<GridApi | null>(platform.api.api);
  useEffect(() => platform.api.onReady((a) => setApi(a)), [platform]);
  return api;
}

/**
 * Subscribe to an AG-Grid event; fires `fn` every time the event lands.
 * Cleans up automatically on unmount.
 */
export function useGridEvent(evt: ApiEventName, fn: () => void): void {
  const platform = useGridPlatform();
  useEffect(() => platform.api.on(evt, fn), [platform, evt, fn]);
}
