import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { GridApi } from 'ag-grid-community';
import { useProviderStream } from '@wellsfargo-starui/host-data-react/runtime';
import type { MockProviderConfig } from '@wellsfargo-starui/types';
import { applyLabStreamDelta } from './applyLabStreamDelta';
import { applyDelta } from './applyDelta';
import { useDebouncedValue } from './useDebouncedValue';
import type { LabRow, StreamOptions } from './types';

export type StreamDeltaTransform = (
  incoming: readonly LabRow[],
) => readonly LabRow[];

export interface MockStreamBindings {
  /** Set from MarketsGrid `onReady` — ticks route through transactions once set. */
  gridApiRef: RefObject<GridApi | null>;
  /** Optional per-tick overlay (e.g. active demo scenario). */
  transformDelta?: StreamDeltaTransform;
}

export interface MockStreamResult {
  /** Initial / full-replace snapshot for `rowData` — stable between ticks. */
  rows: LabRow[];
  /** Live keyed snapshot for scenarios and the demo console. */
  rowsRef: RefObject<LabRow[]>;
  /** Row count after the last full snapshot (for demo-console display). */
  snapshotRowCount: number;
  /** Re-attach / restart the mock provider (e.g. after clearing a scenario). */
  refresh: (extra?: Record<string, unknown>) => void;
}

/**
 * Subscribes to the canonical MockDataProvider hosted in the
 * data-services SharedWorker, identified by a tab-scoped `providerId`.
 *
 * Full snapshots (`replace: true`) update React `rowData` once. Tick
 * deltas go through `gridApi.applyTransactionAsync` so AG-Grid only
 * repaints changed rows (cell flash, conditional styling, alerts).
 */
export function useMockStream(
  providerId: string,
  opts: StreamOptions = {},
  bindings: MockStreamBindings,
): MockStreamResult {
  const { rowCount = 500, updateIntervalMs = 500, enableUpdates = true } = opts;
  const { gridApiRef, transformDelta } = bindings;

  const cfg = useMemo<MockProviderConfig>(
    () => ({
      providerType: 'mock',
      dataType: 'positions',
      rowCount,
      updateIntervalMs,
      enableUpdates,
      keyColumn: 'id',
    }),
    // Hub ignores cfg on re-attach for an already-running providerId — only
    // the first attach per providerId uses cfg. Runtime interval/pause/count
    // changes are pushed via refresh() below.
    [providerId],
  );

  const [rows, setRows] = useState<LabRow[]>([]);
  const [snapshotRowCount, setSnapshotRowCount] = useState(0);
  const rowsRef = useRef<LabRow[]>([]);
  const transformRef = useRef(transformDelta);
  transformRef.current = transformDelta;

  const runtimeRef = useRef({ rowCount, updateIntervalMs, enableUpdates });
  runtimeRef.current = { rowCount, updateIntervalMs, enableUpdates };

  const applyIncoming = useCallback(
    (incoming: readonly LabRow[], replace: boolean) => {
      const transform = transformRef.current;
      const outbound = transform ? transform(incoming) : incoming;

      const api = gridApiRef.current;
      const next = applyLabStreamDelta(api, rowsRef.current, outbound, replace);
      rowsRef.current = next;

      if (replace || !api) {
        setRows(next);
        setSnapshotRowCount(next.length);
      }
    },
    [gridApiRef],
  );

  const { refresh, status } = useProviderStream<LabRow>(providerId, cfg, {
    onDelta: applyIncoming,
    onStatus: () => {},
  });

  // Debounce interval changes while the slider is dragged — each step used to
  // call provider.restart() and replace all rowData (full grid reload).
  const debouncedIntervalMs = useDebouncedValue(updateIntervalMs, 300);

  // SharedWorker hub: subsequent attaches for the same providerId ignore cfg.
  // Runtime interval / pause / row-count changes go through provider.restart(extra).
  // Interval-only restarts are soft (no snapshot rebuild) in mock.ts.
  useEffect(() => {
    if (status !== 'ready') return;
    const { rowCount: rc, enableUpdates: on } = runtimeRef.current;
    refresh({ updateIntervalMs: debouncedIntervalMs, enableUpdates: on, rowCount: rc });
  }, [status, debouncedIntervalMs, enableUpdates, rowCount, refresh]);

  useEffect(() => {
    rowsRef.current = [];
    setRows([]);
    setSnapshotRowCount(0);
    const api = gridApiRef.current;
    if (api) {
      try {
        api.setGridOption('rowData', []);
      } catch {
        /* tearing down */
      }
    }
  }, [providerId, gridApiRef]);

  return { rows, rowsRef, snapshotRowCount, refresh };
}
