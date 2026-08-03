/**
 * Status bar for the Perspective path.
 *
 * AG Grid's stock panels are written for a row model that HOLDS its rows.
 * `agTotalRowCountComponent` and `agFilteredRowCountComponent` count what the
 * client has, which here is the ~100 rows of the loaded blocks — a plausible,
 * confidently wrong number over a 50,000-row book. Every figure below comes
 * from the worker instead. Selection is the one genuinely client-side number,
 * so it is the one read from the grid.
 *
 * The row count is `leafRows`, never `filteredRows`. `filteredRows` is the
 * ROOT LEVEL size, which under grouping is the number of top-level GROUPS —
 * reading it here is what produced "Rows: 9 of 50,000" over an unfiltered book
 * grouped into nine asset classes. The row engine refuses to substitute one
 * for the other and answers `null` while grouped, and this panel fills that
 * gap the only way it honestly can: with a worker-side `count` subscription
 * over the same filter model, computed once for every window that asked.
 */

import { useEffect, useMemo, useState } from 'react';
import type {
  PerspectiveGridStatus,
  PerspectiveRowEngine,
} from '@wellsfargo-starui/grid/perspective';
import type { PerspectiveGridContext } from './types.js';

/** The slice of the grid api this panel reads. */
export interface PerspectiveStatusPanelApiLike {
  getSelectedNodes?(): unknown[];
  getFilterModel?(): Record<string, unknown>;
  addEventListener?(type: string, listener: () => void): void;
  removeEventListener?(type: string, listener: () => void): void;
}

/** What AG Grid passes a custom status panel. `context` is our own option. */
export interface PerspectiveStatusPanelParams {
  api?: PerspectiveStatusPanelApiLike;
  context?: Partial<PerspectiveGridContext>;
}

const fmt = (n: number): string => n.toLocaleString();

const ROOT_STYLE = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.75rem',
  padding: '0 0.5rem',
  color: 'var(--ds-text-primary)',
} as const;

const MUTED_STYLE = { color: 'var(--ds-text-muted)' } as const;
const WARN_STYLE = { color: 'var(--ds-accent-warning)' } as const;

export function PerspectiveStatusPanel(params: PerspectiveStatusPanelParams) {
  const holder = params.context?.perspectiveEngineHolder;
  const queries = params.context?.perspectiveQueries ?? null;

  // Held as state, not read once. AG hands this panel the context object the
  // grid was CREATED with, and the engine behind it is swapped on a provider
  // restart — reading it once left the bar reporting a closed engine forever.
  const [engine, setEngine] = useState<PerspectiveRowEngine | null>(() => holder?.get() ?? null);
  const [status, setStatus] = useState<PerspectiveGridStatus | null>(
    () => holder?.get()?.status ?? null,
  );
  const [selected, setSelected] = useState(0);
  const [groupedLeafRows, setGroupedLeafRows] = useState<number | null>(null);
  const [filterModel, setFilterModel] = useState<Record<string, unknown>>({});

  useEffect(() => {
    if (!holder) return;
    return holder.subscribe(setEngine);
  }, [holder]);

  useEffect(() => {
    if (!engine) {
      setStatus(null);
      return;
    }
    setStatus(engine.status);
    return engine.subscribe(setStatus);
  }, [engine]);

  useEffect(() => {
    const api = params.api;
    if (!api?.addEventListener) return;
    const update = () => setSelected(api.getSelectedNodes?.().length ?? 0);
    update();
    api.addEventListener('selectionChanged', update);
    return () => api.removeEventListener?.('selectionChanged', update);
  }, [params.api]);

  // The filter model drives the worker count, and AG reports it only by event.
  useEffect(() => {
    const api = params.api;
    if (!api?.addEventListener) return;
    const update = () => setFilterModel(api.getFilterModel?.() ?? {});
    update();
    api.addEventListener('filterChanged', update);
    return () => api.removeEventListener?.('filterChanged', update);
  }, [params.api]);

  const leafRows = status?.leafRows ?? null;
  // Only while grouped: ungrouped, the engine already knows the leaf count
  // from the View the grid is scrolling, and a second subscription would be a
  // second answer to a question already answered.
  const needsWorkerCount = status !== null && leafRows === null;
  const filterKey = useMemo(() => JSON.stringify(filterModel), [filterModel]);

  useEffect(() => {
    if (!queries || !needsWorkerCount) {
      setGroupedLeafRows(null);
      return;
    }
    return queries.watchCount(JSON.parse(filterKey) as Record<string, unknown>, setGroupedLeafRows);
  }, [queries, needsWorkerCount, filterKey]);

  if (!status) return null;

  const { bookRows, filtered, live, failedBlocks } = status;
  const rows = leafRows ?? groupedLeafRows;

  return (
    <div
      className="ag-status-panel ag-status-panel-total-row-count"
      style={ROOT_STYLE}
      data-testid="perspective-status-panel"
    >
      <span>
        {rows === null ? (
          // No honest count yet — before the first View, or while a grouped
          // count is in flight, or because the filter cannot be expressed
          // exactly. A number here would be a guess.
          <span style={MUTED_STYLE}>counting…</span>
        ) : filtered && bookRows !== null ? (
          <>
            <strong>{fmt(rows)}</strong> of {fmt(bookRows)} rows
          </>
        ) : (
          <>
            <strong>{fmt(rows)}</strong> rows
          </>
        )}
      </span>

      {selected > 0 && <span>{fmt(selected)} selected</span>}

      {/* A stalled feed looks identical to a quiet one, so say which it is. */}
      <span style={MUTED_STYLE}>{live ? 'live' : 'paused'}</span>

      {failedBlocks > 0 && (
        // AG never retries a failed block on its own, so silence here leaves a
        // permanently empty patch of grid with no explanation for it.
        <span style={WARN_STYLE}>
          {fmt(failedBlocks)} failed {failedBlocks === 1 ? 'block' : 'blocks'}
        </span>
      )}
    </div>
  );
}
