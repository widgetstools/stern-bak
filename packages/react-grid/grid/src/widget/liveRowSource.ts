/**
 * Where the summary panel's widgets get their rows.
 *
 * They used to read the GRID: `api.forEachNode` into a fresh array on every
 * `platform.rows` tick. Three things were wrong with that on a busy blotter,
 * and together they made the dock sluggish to drag on Windows:
 *
 *  1. `platform.rows` is a GRID-event bus — `modelUpdated`, `sortChanged` and
 *     `filterChanged` are in it. Sorting or filtering changes no data at all,
 *     yet re-ran every widget's aggregation.
 *  2. Every tick allocated a new N-element array and pushed it through React
 *     state, so every widget re-rendered even when its own numbers hadn't
 *     moved.
 *  3. `forEachNode` walks the grid's row model on the main thread, competing
 *     with the very interaction (a drag) that is trying to hit 60fps.
 *
 * A `LiveRowSource` is the data feed instead of the grid. It owns ONE array,
 * mutates it in place as ticks arrive, and reports change through a counter
 * rather than a new identity — so a re-render caused by anything other than
 * data (a drag, a resize, a theme flip) costs nothing, and a widget recomputes
 * only when `version` actually moves.
 *
 * The array is handed out by reference and mutated in place, which is safe
 * precisely because nothing keys off its identity: readers pair it with
 * `version`, and the mutation happens outside render.
 */

export interface LiveRowSource {
  /**
   * The current rows. STABLE BY REFERENCE across ticks — mutated in place, so
   * never use its identity as a change signal. Pair it with {@link version}.
   */
  getRows(): Record<string, unknown>[];
  /** Increments whenever `getRows()` content changed. The change signal. */
  getVersion(): number;
  /** Notified after a batch of changes lands. Returns unsubscribe. */
  subscribe(fn: () => void): () => void;
}

/**
 * Builds a `LiveRowSource` from a provider's snapshot + tick callbacks.
 *
 * Kept transport-agnostic (it takes two `on*` registrars rather than an
 * `IDataProvider`) so the grid package does not depend on the data package's
 * provider type, and so tests can drive it with two plain functions.
 *
 * `keyOf` decides row identity for the in-place upsert. Without one, a tick is
 * treated as a full replace — correct, just not incremental.
 */
export function createLiveRowSource(options: {
  onSnapshot: (handler: (rows: readonly Record<string, unknown>[]) => void) => () => void;
  onTick: (handler: (rows: readonly Record<string, unknown>[]) => void) => () => void;
  keyOf?: (row: Record<string, unknown>) => string | null;
  /** Rows already received before this source was created. */
  initial?: readonly Record<string, unknown>[];
}): LiveRowSource & { dispose(): void } {
  const { onSnapshot, onTick, keyOf, initial } = options;

  const rows: Record<string, unknown>[] = initial ? [...initial] : [];
  const indexByKey = new Map<string, number>();
  let version = 0;
  const listeners = new Set<() => void>();

  const reindex = (): void => {
    indexByKey.clear();
    if (!keyOf) return;
    for (let i = 0; i < rows.length; i += 1) {
      const k = keyOf(rows[i]);
      if (k !== null) indexByKey.set(k, i);
    }
  };
  reindex();

  const emit = (): void => {
    version += 1;
    for (const fn of [...listeners]) {
      try {
        fn();
      } catch {
        // One bad subscriber must not stop the others, and must never
        // propagate into the provider's emit loop.
      }
    }
  };

  const replaceAll = (next: readonly Record<string, unknown>[]): void => {
    // Length-then-fill rather than `rows = [...]`: the array identity is part
    // of the contract, so it is truncated and refilled in place.
    rows.length = 0;
    for (const r of next) rows.push(r);
    reindex();
    emit();
  };

  const applyTick = (incoming: readonly Record<string, unknown>[]): void => {
    if (incoming.length === 0) return;
    if (!keyOf) {
      // No row identity — the only correct interpretation of a tick is a
      // replace. Slower, but never silently wrong about which row moved.
      replaceAll(incoming);
      return;
    }
    for (const row of incoming) {
      const k = keyOf(row);
      if (k === null) continue;
      const at = indexByKey.get(k);
      if (at === undefined) {
        indexByKey.set(k, rows.length);
        rows.push(row);
      } else {
        rows[at] = row;
      }
    }
    emit();
  };

  const offSnapshot = onSnapshot((next) => replaceAll(next));
  const offTick = onTick((next) => applyTick(next));

  return {
    getRows: () => rows,
    getVersion: () => version,
    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    dispose() {
      offSnapshot();
      offTick();
      listeners.clear();
      // Drop row references so a closed panel doesn't pin a 20k-row snapshot
      // for as long as something still holds the source object.
      rows.length = 0;
      indexByKey.clear();
    },
  };
}
