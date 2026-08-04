import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ColDef } from 'ag-grid-community';
import type { MarketsGridHandle } from '@wellsfargo-starui/grid';
import { createPerspectiveWorkerQueries } from '@wellsfargo-starui/grid';
import type { PerspectiveGridQueries } from '@wellsfargo-starui/grid';
import {
  createPerspectiveQueryClient,
  usePerspectiveTable,
  type PerspectiveQueryClient,
  type PerspectiveTableLike,
  type PerspectiveTableStatus,
} from '@wellsfargo-starui/grid/perspective';
import { useDataServices, useProviderStream } from '@wellsfargo-starui/react/data/runtime';
import type { MockPerspectiveProviderConfig } from '@wellsfargo-starui/types';
import type { LabRow } from '../data/types';
import { useDebouncedValue } from '../data/useDebouncedValue';
import { useLabDemoRegistry } from './LabDemoContext';
import type { LabStreamOptions } from './types';

/**
 * The Perspective twin of {@link useLabRows}.
 *
 * Same generated book, same columns, same demo-console controls — the book
 * just lives ONCE in the SharedWorker instead of once per window, and this
 * grid reads the blocks its viewport asks for rather than materializing all
 * of them. Everything the two hooks return with the same name means the same
 * thing, so `LabFeatureTab` can swap engines without knowing which it has.
 *
 * Three things happen here, in this order, and the order is not incidental:
 *
 *   1. `useProviderStream` attaches with an INLINE `mock-perspective` cfg.
 *      That is what starts the worker slot, and the tee builds the Table off
 *      the side of the stream it starts. It is also how the demo console's
 *      tick slider and pause switch still work — same `refresh(extra)` the
 *      client variant uses, so both engines answer the same controls.
 *   2. Nothing is done with the rows it delivers. Under a server row model
 *      they are not this grid's data; the Table is.
 *   3. Only once that slot reports `ready` does the attach run. The worker
 *      refuses `attachPerspective` for a provider that is not running, and
 *      that refusal reads as permanent — so asking early would show the user
 *      a hard failure for a condition that resolves a moment later.
 *
 * Scenarios are NOT offered here, and are reported as unsupported rather than
 * silently doing nothing: every one of them lands its patch through
 * `gridApi.applyTransactionAsync`, which is a client-side row model's write
 * path and has no meaning under a server-side one. The honest fix is a
 * worker-side scenario, which is its own change.
 */

const EMPTY_ROWS: LabRow[] = [];

export interface UsePerspectiveRowsResult {
  /** Always empty — the rows come from the Table, not from React state. */
  rowData: LabRow[];
  onReady: (handle: MarketsGridHandle) => void;
  tickMs: number;
  /** Pass straight to `MarketsGrid`. Null until the attach settles. */
  table: PerspectiveTableLike | null;
  keyColumn: string;
  queries: PerspectiveGridQueries | null;
  status: PerspectiveTableStatus;
  /** Why there is no Table — rendered, never spun on. */
  reason?: string;
}

export function usePerspectiveRows(
  tabId: string,
  providerId: string,
  columnDefs: readonly ColDef<LabRow>[],
  opts: LabStreamOptions = {},
  onGridMount?: (handle: MarketsGridHandle) => void,
): UsePerspectiveRowsResult {
  const { register } = useLabDemoRegistry();
  const { client } = useDataServices();

  const [tickMs, setTickMs] = useState(opts.updateIntervalMs ?? 500);
  const [paused, setPaused] = useState(false);

  const rowCount = opts.rowCount ?? 500;

  // Rebuilt only when the provider changes: the hub ignores cfg on re-attach
  // for a slot that is already running, so runtime changes go through
  // `refresh(extra)` below exactly as they do on the client variant.
  const cfg = useMemo<MockPerspectiveProviderConfig>(
    () => ({
      providerType: 'mock-perspective',
      dataType: 'positions',
      rowCount,
      updateIntervalMs: opts.updateIntervalMs ?? 500,
      enableUpdates: opts.enableUpdates ?? true,
      keyColumn: 'id',
      // A Perspective schema is a flat map of typed columns and the generated
      // positions row is deeply nested, so the flatten is not optional. It
      // derives its paths from the column definitions, which is why they are
      // passed rather than left to the tab.
      rowShape: 'flat',
      columnDefinitions: columnDefs
        .map((c) => ({
          field: String(c.field ?? ''),
          headerName: c.headerName ?? String(c.field ?? ''),
          cellDataType: toCellDataType(c),
        }))
        .filter((c) => c.field.length > 0),
      // Declared up front so the Table is created EMPTY and IMMEDIATELY —
      // the grid paints on open instead of waiting out the first snapshot.
      inferDates: true,
      // Every numeric column stays float; `integer` silently truncates.
      integerColumns: [],
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [providerId],
  );

  const noopListener = useMemo(
    () => ({ onDelta: () => {}, onStatus: () => {} }),
    [],
  );
  const { refresh, status: providerStatus } = useProviderStream<LabRow>(
    providerId,
    cfg,
    noopListener,
  );

  const attach = usePerspectiveTable(client, providerId, {
    enabled: providerStatus === 'ready',
  });

  // One query client per hub client. Held in a ref and closed on unmount:
  // `close()` is permanent, so a value that survived StrictMode's
  // cleanup-then-setup would come back closed and answer every whole-book
  // question with silence.
  const queryClientRef = useRef<PerspectiveQueryClient | null>(null);
  useEffect(() => {
    if (!client) return;
    const created = createPerspectiveQueryClient(client);
    queryClientRef.current = created;
    return () => {
      created.close();
      if (queryClientRef.current === created) queryClientRef.current = null;
    };
  }, [client]);

  const queries = useMemo(
    () =>
      queryClientRef.current && attach.table
        ? createPerspectiveWorkerQueries({ client: queryClientRef.current, providerId })
        : null,
    [providerId, attach.table],
  );

  // Same debounce the client variant uses — each slider step would otherwise
  // restart the provider, and a restart re-sends the whole book.
  const debouncedTickMs = useDebouncedValue(tickMs, 300);
  useEffect(() => {
    if (providerStatus !== 'ready') return;
    refresh({ updateIntervalMs: debouncedTickMs, enableUpdates: !paused, rowCount });
  }, [providerStatus, debouncedTickMs, paused, rowCount, refresh]);

  const onReady = useCallback(
    (handle: MarketsGridHandle) => {
      onGridMount?.(handle);
      if (import.meta.env?.DEV) {
        (globalThis as Record<string, unknown>).__labGrid = handle;
      }
    },
    [onGridMount],
  );

  useEffect(() => {
    register({
      tabId,
      // The book is not in this window, so there is no local array to measure.
      // The row count the console shows is the one the provider was asked for.
      getRowCount: () => rowCount,
      snapshotRowCount: attach.status === 'ready' ? rowCount : 0,
      paused,
      setPaused,
      tickMs,
      setTickMs,
      activeScenarioId: null,
      applyScenario: () => {},
      clearScenario: () => {},
      scenariosSupported: false,
    });
    return () => register(null);
  }, [tabId, rowCount, attach.status, paused, tickMs, register]);

  return {
    rowData: EMPTY_ROWS,
    onReady,
    tickMs,
    table: attach.table,
    keyColumn: 'id',
    queries,
    status: attach.status,
    reason: attach.reason,
  };
}

/**
 * A lab column carries an AG `type` rather than a `cellDataType`, so the
 * declared schema has to read the type off whichever the column used. Getting
 * this wrong costs a column its server-side sorting and filtering, not just
 * its formatting.
 */
function toCellDataType(col: ColDef<LabRow>): 'text' | 'number' | 'boolean' | 'date' {
  if (col.cellDataType === 'number' || col.type === 'numericColumn') return 'number';
  if (col.cellDataType === 'boolean') return 'boolean';
  if (col.cellDataType === 'date' || col.cellDataType === 'dateString') return 'date';
  if (col.filter === 'agNumberColumnFilter') return 'number';
  if (col.filter === 'agDateColumnFilter') return 'date';
  return 'text';
}
