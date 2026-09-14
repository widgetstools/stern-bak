import type { CellValueChangedEvent, GridApi, IRowNode } from 'ag-grid-community';
import type { ISsrmDataProvider } from '@wellsfargo-starui/data';

export interface BindSsrmEditsOptions {
  /** Coalescing window — a pasted range fires one `cellValueChanged` per cell. Default 16 ms. */
  flushMs?: number;
  onError?: (error: Error) => void;
}

type Row = Record<string, unknown>;
type RowIdFn = (params: { data: unknown; level: number; parentKeys: string[] }) => string;
type GridEvt = Parameters<GridApi['addEventListener']>[0];

type EditsApi = Partial<Pick<GridApi, 'addEventListener' | 'removeEventListener' | 'getGridOption'>>
  & { isDestroyed?: () => boolean };

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

/**
 * Persist grid edits — cell editor, clipboard paste, fill handle — into the
 * engine so they survive the next tick and block refresh and reach every
 * other grid on the provider.
 *
 * Under SSRM an edit only changes the local row node. The next tick or
 * refresh for that row would silently put the engine's value back, and a
 * second window would never see the edit at all. Writing the edited row
 * back through `applyEdits` makes the engine cache the source of truth the
 * grid already treats it as. Edits are coalesced per row id within
 * `flushMs`, and flushed at once on `pasteEnd`, so a 200-cell paste is one
 * RPC carrying each row once.
 *
 * A provider without `applyEdits` leaves edits local — the pre-existing
 * behaviour, unchanged.
 */
export function bindSsrmEdits(
  provider: ISsrmDataProvider,
  api: EditsApi,
  options: BindSsrmEditsOptions = {},
): () => void {
  const applyEdits = provider.applyEdits?.bind(provider);
  if (!applyEdits) return () => undefined;

  const flushMs = options.flushMs ?? 16;
  const pending = new Map<string, Row>();
  /** Columns the user actually touched, per pending row — the engine-side
   *  overlay holds ONLY these over the feed (see ISsrmDataProvider.applyEdits). */
  const pendingCols = new Map<string, Set<string>>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let unbound = false;

  const rowIdFn = safe(() => api.getGridOption?.('getRowId') as RowIdFn | undefined, undefined);
  const idOf = (node: IRowNode): string | undefined => {
    if (typeof node.id === 'string' && node.id) return node.id;
    if (rowIdFn && node.data) return safe(() => String(rowIdFn({ data: node.data, level: 0, parentKeys: [] })), undefined);
    return undefined;
  };

  const flush = (): void => {
    if (timer != null) clearTimeout(timer);
    timer = null;
    if (unbound || pending.size === 0) return;
    const ids = [...pending.keys()];
    const rows = ids.map((id) => ({ ...pending.get(id)! }));
    const editedColumns = ids.map((id) => [...(pendingCols.get(id) ?? [])]);
    pending.clear();
    pendingCols.clear();
    void applyEdits({ rows, editedColumns }).catch((err: unknown) => {
      const error = err instanceof Error ? err : new Error(String(err));
      if (options.onError) options.onError(error);
      else {
        // eslint-disable-next-line no-console
        console.warn('[ssrm] edit did not reach the engine — the next tick may revert it', error);
      }
    });
  };

  const onCellValueChanged = (event: CellValueChangedEvent): void => {
    if (unbound || api.isDestroyed?.() === true) return;
    const node = event.node;
    if (!node || node.group || node.data == null) return;
    if (Object.is(event.oldValue, event.newValue)) return;
    const id = idOf(node);
    if (id === undefined) return;
    // The node's data already carries the new value; send the whole row so
    // the engine's upsert does not blank the columns it did not receive.
    pending.set(id, node.data as Row);
    // Column method through the column object — a detached getColId is the
    // AG Grid 36 paste-abort trap (see timedActivations regression test).
    const colId = safe(() => event.column?.getColId(), undefined);
    if (colId) {
      const cols = pendingCols.get(id) ?? new Set<string>();
      cols.add(colId);
      pendingCols.set(id, cols);
    }
    if (timer == null) timer = setTimeout(flush, flushMs);
  };

  const onPasteEnd = (): void => { flush(); };

  safe(() => api.addEventListener?.('cellValueChanged' as GridEvt, onCellValueChanged as never), undefined);
  safe(() => api.addEventListener?.('pasteEnd' as GridEvt, onPasteEnd), undefined);

  return () => {
    flush();
    unbound = true;
    safe(() => api.removeEventListener?.('cellValueChanged' as GridEvt, onCellValueChanged as never), undefined);
    safe(() => api.removeEventListener?.('pasteEnd' as GridEvt, onPasteEnd), undefined);
  };
}

type PasteApi = Partial<Pick<GridApi, 'getCellRanges' | 'getFocusedCell' | 'getDisplayedRowAtIndex'>>;

export interface SsrmPasteTarget {
  /** Rows the paste would write into. */
  rows: number;
  /** Rows that are still block placeholders (or group rows) — a paste into them is lost. */
  unloaded: number;
}

/**
 * Where a paste would land, and whether every target row is a loaded leaf.
 *
 * AG Grid pastes over the selected cell range, or downward from the focused
 * cell when nothing is selected. Under SSRM some of those rows can be block
 * stubs — scrolled into view but not yet fetched — and a paste into a stub
 * writes nothing while reporting nothing. Refusing the paste is the honest
 * outcome; a partial paste that looks complete is not.
 */
export function ssrmPasteTarget(api: PasteApi, pastedRows: number): SsrmPasteTarget {
  const indices = new Set<number>();
  const ranges = safe(() => api.getCellRanges?.() ?? [], []);
  for (const range of ranges) {
    const a = range.startRow?.rowIndex;
    const b = range.endRow?.rowIndex;
    if (a == null || b == null) continue;
    for (let i = Math.min(a, b); i <= Math.max(a, b); i += 1) indices.add(i);
  }
  if (indices.size === 0) {
    const focused = safe(() => api.getFocusedCell?.(), null);
    if (focused) {
      for (let i = 0; i < Math.max(1, pastedRows); i += 1) indices.add(focused.rowIndex + i);
    }
  }
  let unloaded = 0;
  for (const index of indices) {
    const node = safe(() => api.getDisplayedRowAtIndex?.(index), undefined);
    if (!node || node.stub || node.group || node.data == null) unloaded += 1;
  }
  return { rows: indices.size, unloaded };
}
