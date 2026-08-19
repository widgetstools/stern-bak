import { useCallback, useEffect, useRef, useState } from 'react';
import type { GridApi } from 'ag-grid-community';
import type { MarketsGridHandle } from '@wellsfargo-starui/grid/core';
import {
  applyLabRowUpdates,
  diffRowUpdates,
} from '../data/applyLabStreamDelta';
import { labRowFieldPatch } from '../data/rowDiff';
import { useMockStream } from '../data/useMockStream';
import type { LabRow } from '../data/types';
import { getScenarioById } from './scenarios';
import { useLabDemoRegistry } from './LabDemoContext';
import type { LabStreamOptions } from './types';

/** Sparse per-row field patches applied on top of each incoming tick delta. */
type ScenarioOverlay = Map<string, Partial<LabRow>>;

function applyOverlayToIncoming(
  incoming: readonly LabRow[],
  overlay: ScenarioOverlay,
): readonly LabRow[] {
  if (overlay.size === 0) return incoming;
  return incoming.map((row) => {
    const patch = overlay.get(String(row.id));
    return patch ? ({ ...row, ...patch } as LabRow) : row;
  });
}

function buildScenarioOverlay(
  before: readonly LabRow[],
  after: readonly LabRow[],
): ScenarioOverlay {
  const overlay: ScenarioOverlay = new Map();
  const afterById = new Map(after.map((r) => [String(r.id), r]));
  for (const prev of before) {
    const next = afterById.get(String(prev.id));
    if (!next) continue;
    const patch = labRowFieldPatch(prev, next);
    if (patch) overlay.set(String(prev.id), patch);
  }
  return overlay;
}

/**
 * Mock stream + optional scenario overlay + registration with the
 * right-hand Demo Console rail.
 *
 * Tick deltas use `applyTransactionAsync`; `rowData` only changes on
 * full snapshots (and before the grid API is ready).
 */
export function useLabRows(
  tabId: string,
  providerId: string,
  opts: LabStreamOptions = {},
  onGridMount?: (handle: MarketsGridHandle) => void,
) {
  const { register } = useLabDemoRegistry();
  const gridApiRef = useRef<GridApi | null>(null);
  const scenarioIdRef = useRef<string | null>(null);
  const scenarioOverlayRef = useRef<ScenarioOverlay>(new Map());

  const [tickMs, setTickMs] = useState(opts.updateIntervalMs ?? 500);
  const [paused, setPaused] = useState(false);
  const [scenarioId, setScenarioId] = useState<string | null>(null);
  scenarioIdRef.current = scenarioId;

  const transformDelta = useCallback(
    (incoming: readonly LabRow[]) =>
      applyOverlayToIncoming(incoming, scenarioOverlayRef.current),
    [],
  );

  const { rows, rowsRef, snapshotRowCount, refresh } = useMockStream(
    providerId,
    {
      ...opts,
      updateIntervalMs: tickMs,
      enableUpdates: paused ? false : (opts.enableUpdates ?? true),
    },
    { gridApiRef, transformDelta },
  );

  const pushScenarioOverlay = useCallback((id: string | null) => {
    const api = gridApiRef.current;
    if (!api || rowsRef.current.length === 0 || !id) return;

    const scenario = getScenarioById(id);
    if (!scenario) return;

    const before = rowsRef.current;
    const after = scenario.apply(before);
    scenarioOverlayRef.current = buildScenarioOverlay(before, after);
    rowsRef.current = after;
    const updates = diffRowUpdates(before, after);
    applyLabRowUpdates(api, updates);
  }, [rowsRef]);

  const applyScenario = useCallback(
    (id: string) => {
      setScenarioId(id);
      pushScenarioOverlay(id);
    },
    [pushScenarioOverlay],
  );

  const clearScenario = useCallback(() => {
    if (!scenarioIdRef.current && scenarioOverlayRef.current.size === 0) return;

    setScenarioId(null);
    scenarioIdRef.current = null;
    scenarioOverlayRef.current = new Map();

    refresh({ __scenarioClear: Date.now() });
  }, [refresh]);

  const onReady = useCallback(
    (handle: MarketsGridHandle) => {
      gridApiRef.current = handle.gridApi;
      onGridMount?.(handle);
      if (import.meta.env?.DEV) {
        (globalThis as Record<string, unknown>).__labGrid = handle;
      }
      if (scenarioIdRef.current) {
        pushScenarioOverlay(scenarioIdRef.current);
      }
    },
    [onGridMount, pushScenarioOverlay],
  );

  useEffect(() => {
    register({
      tabId,
      getRowCount: () => rowsRef.current.length,
      snapshotRowCount,
      paused,
      setPaused,
      tickMs,
      setTickMs,
      activeScenarioId: scenarioId,
      applyScenario,
      clearScenario,
    });
    return () => register(null);
  }, [
    tabId,
    snapshotRowCount,
    paused,
    tickMs,
    scenarioId,
    applyScenario,
    clearScenario,
    register,
    rowsRef,
  ]);

  return {
    rowData: rows,
    onReady,
    tickMs,
    setTickMs,
    paused,
    setPaused,
    scenarioId,
    applyScenario,
    clearScenario,
  };
}
