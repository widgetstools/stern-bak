/**
 * Feed a Perspective Table from a provider's emit stream.
 *
 * `startStomp(cfg, emit)` (and `startMock`) already emit exactly what a Table
 * needs — `{ rows, replace: true }` for snapshot chunks and `{ rows }` for
 * live deltas — so the Table is fed by DECORATING `ProviderEmit`. No transport
 * changes, and any provider that speaks the same contract gets windowing for
 * free.
 *
 * Two ordering rules make this safe to drop in front of the hub:
 *
 *   1. `tap` forwards every event to the wrapped emit SYNCHRONOUSLY and
 *      unmodified, before doing any Table work. The existing push path must
 *      not wait on Perspective, and must not change shape because Perspective
 *      is present.
 *   2. All Table work is serialized on one promise chain. `table.update()` is
 *      async and emit is not, so without a queue a slow snapshot load would
 *      let the first live deltas overtake it and be overwritten.
 *
 * The Table cannot exist until its schema does, and the schema cannot be
 * trusted until enough rows have been seen (see `perspectiveSchema.ts` — one
 * outlier row can flip a column's inferred type). So snapshot rows are
 * buffered, and the Table is built when the provider says `ready`.
 */
import type { PerspectiveRowFieldChange } from '@wellsfargo-starui/types';
import type { ProviderEmit, ProviderEmitEvent } from '../providers/Provider.js';
import {
  observeRows,
  toPerspectiveSchema,
  validateIndexColumn,
  type ColumnObservation,
  type PerspectiveSchema,
} from './perspectiveSchema.js';

/** The slice of a Perspective `Table` this needs. */
export interface FeedTable {
  update(rows: readonly unknown[]): Promise<void>;
  /**
   * Drop every row but keep the schema, the index, and — crucially — any
   * Views already registered against it. That is what lets a restart happen
   * under attached windows without their Views dying.
   */
  clear?(): Promise<void>;
  delete?(): Promise<void>;
}

export type FeedDiagnostic =
  | { kind: 'schema'; schema: PerspectiveSchema; rows: number; nested: string[]; mixed: string[] }
  | { kind: 'index-invalid'; reason: string }
  | { kind: 'unknown-columns'; columns: string[] }
  | { kind: 'error'; stage: 'create' | 'load' | 'update'; message: string };

export interface PerspectiveTableFeedOpts {
  /** Index column, from the provider config's `keyColumn`. */
  keyColumn: string;
  /**
   * Schema declared by the provider config, built by
   * `toPerspectiveSchemaFromFields`.
   *
   * When present the Table is created IMMEDIATELY and empty, instead of
   * waiting for enough rows to infer types from. That is what lets a blotter
   * paint on open: inferring means no Table until the snapshot completes, and
   * no Table means a window has nothing to open, so the grid sits blank
   * behind a spinner. Rows then fill a Table that already exists.
   */
  declaredSchema?: PerspectiveSchema;
  /** Build the Table once the schema is known. */
  createTable(schema: PerspectiveSchema, index: string): Promise<FeedTable>;
  /** Columns to declare `integer` rather than the default `float`. */
  integerColumns?: readonly string[];
  /**
   * Build the Table after this many buffered rows even if `ready` never
   * arrives. A provider with no configured end token cannot tell snapshot from
   * live and emits everything as deltas, so without this the Table would never
   * be built at all.
   */
  buildAfterRows?: number;
  onDiagnostic?(diagnostic: FeedDiagnostic): void;
}

/**
 * Before/after values for the fields something is actually watching.
 *
 * This exists because an upsert Table cannot answer "what did this cell
 * used to be" — `update()` REPLACES the row, so by the time any View could
 * be read the previous value is gone. Alert rules of the `dataChange` /
 * `relativeChange` families need exactly that, so the feed keeps a shadow
 * of the values as they arrive and diffs against it before each write.
 *
 * Scoped to WATCHED FIELDS ONLY, deliberately: shadowing whole rows would
 * double the worker's memory for the book to serve a handful of rules, and
 * nothing here needs the columns nobody asked about. With no watchers the
 * map stays empty and the diff is one early return per batch.
 */
export interface PerspectiveFieldShadow {
  /**
   * Start shadowing these fields. Refcounted — two rules watching `price`
   * keep one shadow, and releasing one does not blind the other. The
   * returned function drops this watcher's claim.
   */
  watch(fields: readonly string[]): () => void;
  /** Field changes, batched per ingest. Returns an unsubscribe. */
  onChanges(cb: (changes: readonly PerspectiveRowFieldChange[]) => void): () => void;
  /** Fields currently shadowed — for diagnostics and tests. */
  readonly watchedFields: readonly string[];
  /** Rows currently shadowed — for diagnostics and tests. */
  readonly shadowedRows: number;
}

export interface PerspectiveTableFeed {
  /** Wrap a `ProviderEmit`. The returned emit forwards everything untouched. */
  tap(emit: ProviderEmit): ProviderEmit;
  /** Previous-value tracking for change rules — see {@link PerspectiveFieldShadow}. */
  readonly changes: PerspectiveFieldShadow;
  /** The Table once built, else null. */
  readonly table: FeedTable | null;
  /** The schema the Table was built with, else null. */
  readonly schema: PerspectiveSchema | null;
  /** Resolves with the Table when it has been built and loaded. */
  whenReady(): Promise<FeedTable>;
  /** Rows buffered but not yet loaded. */
  readonly buffered: number;
  /** Settle all queued Table work — for tests and shutdown. */
  drain(): Promise<void>;
  stop(): Promise<void>;
}

export function createPerspectiveTableFeed(
  opts: PerspectiveTableFeedOpts,
): PerspectiveTableFeed {
  const {
    keyColumn,
    createTable,
    declaredSchema,
    integerColumns,
    buildAfterRows = 2_000,
    onDiagnostic = () => {},
  } = opts;

  let table: FeedTable | null = null;
  let schema: PerspectiveSchema | null = null;
  let known: Set<string> | null = null;
  let buffer: unknown[] = [];
  let observations = new Map<string, ColumnObservation>();
  let stopped = false;
  /** Set once any `replace` arrives — i.e. this provider has a snapshot phase. */
  let sawReplace = false;
  /** Serializes every Table operation; see rule 2 in the header. */
  let queue: Promise<void> = Promise.resolve();
  let resolveReady: ((t: FeedTable) => void) | null = null;
  const ready = new Promise<FeedTable>((resolve) => {
    resolveReady = resolve;
  });

  /** Field -> number of watchers. Empty means the shadow costs nothing. */
  const watchCounts = new Map<string, number>();
  /** key -> watched field -> last seen value. */
  let shadow = new Map<string, Map<string, unknown>>();
  const changeListeners = new Set<(changes: readonly PerspectiveRowFieldChange[]) => void>();

  /**
   * Diff the incoming rows against the shadow, then advance it.
   *
   * Runs BEFORE the rows are handed to `table.update()` — after the write
   * the old value is unrecoverable, which is the entire reason this map
   * exists. A key seen for the FIRST time only seeds: a row appearing is
   * not a row changing, and treating it as one would fire every enabled
   * rule against the whole book on load.
   */
  function trackChanges(rows: readonly unknown[]): void {
    // `watch()` alone decides what is retained, not whether anyone is
    // listening yet: a listener registering after the first rows landed
    // would otherwise see its first tick as a fresh row rather than a change.
    if (watchCounts.size === 0) return;
    const batch: PerspectiveRowFieldChange[] = [];
    for (const raw of rows) {
      if (raw === null || typeof raw !== 'object') continue;
      const row = raw as Record<string, unknown>;
      const keyValue = row[keyColumn];
      if (keyValue === null || keyValue === undefined) continue;
      const key = String(keyValue);
      let previous = shadow.get(key);
      if (previous === undefined) {
        previous = new Map();
        shadow.set(key, previous);
      }
      for (const field of watchCounts.keys()) {
        if (!(field in row)) continue;
        const newValue = row[field];
        const had = previous.has(field);
        const oldValue = previous.get(field);
        previous.set(field, newValue);
        if (!had || Object.is(oldValue, newValue)) continue;
        batch.push({ key, field, oldValue, newValue, row });
      }
    }
    if (batch.length === 0 || changeListeners.size === 0) return;
    for (const listener of [...changeListeners]) {
      try {
        listener(batch);
      } catch (err) {
        onDiagnostic({
          kind: 'error',
          stage: 'update',
          message: String((err as Error)?.message ?? err),
        });
      }
    }
  }

  const enqueue = (work: () => Promise<void>): void => {
    queue = queue.then(work).catch((err) => {
      onDiagnostic({
        kind: 'error',
        stage: 'update',
        message: String((err as Error)?.message ?? err),
      });
    });
  };

  /**
   * Create the Table from the config's declared schema, before any rows.
   *
   * The whole point is that this can run at construction: a window can open
   * the Table and the grid can paint while the snapshot is still arriving.
   */
  async function buildDeclaredTable(): Promise<void> {
    if (stopped || table !== null || !declaredSchema) return;
    if (!(keyColumn in declaredSchema)) {
      onDiagnostic({
        kind: 'index-invalid',
        reason: `declared schema has no index column "${keyColumn}"`,
      });
      return;
    }

    onDiagnostic({
      kind: 'schema',
      schema: declaredSchema,
      rows: 0,
      nested: [],
      mixed: [],
    });

    try {
      table = await createTable(declaredSchema, keyColumn);
    } catch (err) {
      onDiagnostic({
        kind: 'error',
        stage: 'create',
        message: String((err as Error)?.message ?? err),
      });
      return;
    }

    schema = declaredSchema;
    known = new Set(Object.keys(declaredSchema));

    // Anything buffered while the Table was being created still has to land.
    const staged = buffer;
    buffer = [];
    if (staged.length > 0) await table.update(staged);
    resolveReady?.(table);
    resolveReady = null;
  }

  async function buildTable(): Promise<void> {
    if (stopped || table !== null || buffer.length === 0) return;

    const derived = toPerspectiveSchema(observations, { integerColumns });
    const indexProblem = validateIndexColumn(
      derived.schema,
      keyColumn,
      observations,
      buffer.length,
    );
    if (indexProblem !== null) {
      // Without a valid index `update()` appends instead of upserting, so
      // every tick would grow the book. Refuse rather than corrupt it.
      onDiagnostic({ kind: 'index-invalid', reason: indexProblem });
      buffer = [];
      observations = new Map();
      return;
    }

    onDiagnostic({
      kind: 'schema',
      schema: derived.schema,
      rows: buffer.length,
      nested: derived.nested,
      mixed: derived.mixed.map((m) => m.column),
    });

    try {
      table = await createTable(derived.schema, keyColumn);
    } catch (err) {
      onDiagnostic({
        kind: 'error',
        stage: 'create',
        message: String((err as Error)?.message ?? err),
      });
      return;
    }

    schema = derived.schema;
    known = new Set(Object.keys(derived.schema));

    const rows = buffer;
    buffer = [];
    try {
      await table.update(rows);
    } catch (err) {
      onDiagnostic({
        kind: 'error',
        stage: 'load',
        message: String((err as Error)?.message ?? err),
      });
      return;
    }
    resolveReady?.(table);
    resolveReady = null;
  }

  /** Columns absent from the schema are silently IGNORED by `update()`, so a
   *  drifting feed would quietly stop delivering a column. Report once. */
  let reportedUnknown = false;
  function checkColumns(rows: readonly unknown[]): void {
    if (reportedUnknown || known === null || rows.length === 0) return;
    const first = rows[0];
    if (first === null || typeof first !== 'object') return;
    const unknownColumns = Object.keys(first as Record<string, unknown>).filter(
      (k) => !known!.has(k),
    );
    if (unknownColumns.length > 0) {
      reportedUnknown = true;
      onDiagnostic({ kind: 'unknown-columns', columns: unknownColumns });
    }
  }

  function ingest(rows: readonly unknown[], replace: boolean): void {
    if (stopped) return;

    if (replace) {
      // A snapshot opens with an EMPTY `replace: true` clear, then the first
      // chunk carries `replace: true` and every chunk after it rides as a
      // plain `{rows}` delta (`stomp.ts`: `emit({ rows: chunk, replace:
      // offset === 0 })`). So an empty replace is not a no-op — it is the
      // signal that a fresh book is coming, and it is the ONLY signal when
      // the new book is empty.
      sawReplace = true;

      // `replace` means "a fresh book starts here", so anything staged for
      // the previous one is discarded — unconditionally, NOT just when a
      // Table already exists. A restart landing while an earlier snapshot is
      // still buffering leaves no Table to check, and merging the abandoned
      // rows into the new book is silent corruption.
      buffer = [];
      observations = new Map();
      // A fresh book has no history: diffing the new snapshot against the
      // old one would report every row as changed, which is the opposite of
      // what a change rule means.
      shadow = new Map();

      if (table !== null && declaredSchema && typeof table.clear === 'function') {
        // The schema is known independently of the data, so the Table itself
        // survives a restart: CLEAR it instead of deleting it. `clear()` keeps
        // the schema, the index and every registered View, so attached
        // windows keep reading across the restart rather than watching their
        // table disappear for the length of a snapshot.
        const live = table;
        enqueue(async () => {
          await live.clear!();
        });
      } else if (table !== null) {
        // Inferred schema: the new book may not have the same shape, so the
        // Table has to go. Dropping it beats upserting into it — rows deleted
        // upstream would otherwise linger in the book forever.
        const old = table;
        table = null;
        schema = null;
        known = null;
        reportedUnknown = false;
        enqueue(async () => {
          await old.delete?.();
        });
      }
    }

    if (rows.length === 0) return;

    // Before anything is buffered or written. `enqueue` defers the actual
    // `table.update()`, so doing this later would race the write.
    trackChanges(rows);

    if (table === null) {
      // Everything before the Table exists is buffered, whether it was
      // flagged `replace` or not: after the first chunk the rest of the
      // snapshot arrives unflagged, and buffering it is what lets the schema
      // be derived from the whole book.
      buffer.push(...rows);
      observeRows(rows, observations);
      // The row threshold is ONLY for providers with no snapshot phase at all
      // (no end token — every frame is a delta and `ready` never comes).
      // Once a `replace` has been seen a snapshot IS in progress, and
      // building early would derive the schema from a partial book.
      if (!sawReplace && buffer.length >= buildAfterRows) enqueue(buildTable);
      return;
    }

    checkColumns(rows);
    enqueue(async () => {
      // Whole frame in one call rather than per-row.
      await table!.update(rows);
    });
  }

  // Create the Table NOW when the config declared its columns — not on the
  // first rows, and not on `ready`. This is what a window opens while the
  // snapshot is still streaming.
  if (declaredSchema) enqueue(buildDeclaredTable);

  return {
    get table() {
      return table;
    },
    get schema() {
      return schema;
    },
    get buffered() {
      return buffer.length;
    },
    whenReady: () => ready,

    changes: {
      get watchedFields() {
        return [...watchCounts.keys()];
      },
      get shadowedRows() {
        return shadow.size;
      },
      watch(fields: readonly string[]): () => void {
        const claimed = [...new Set(fields)];
        for (const field of claimed) {
          watchCounts.set(field, (watchCounts.get(field) ?? 0) + 1);
        }
        let released = false;
        return () => {
          if (released) return;
          released = true;
          for (const field of claimed) {
            const next = (watchCounts.get(field) ?? 1) - 1;
            if (next > 0) {
              watchCounts.set(field, next);
              continue;
            }
            watchCounts.delete(field);
            // Drop the column from every shadowed row, so an unwatched
            // field stops costing memory the moment nothing reads it.
            for (const [key, values] of shadow) {
              values.delete(field);
              if (values.size === 0) shadow.delete(key);
            }
          }
        };
      },
      onChanges(cb): () => void {
        changeListeners.add(cb);
        return () => {
          changeListeners.delete(cb);
        };
      },
    },

    tap(emit: ProviderEmit): ProviderEmit {
      return (event: ProviderEmitEvent) => {
        // Forward FIRST and synchronously — the push path must not wait on,
        // or be reshaped by, the Table.
        emit(event);

        if ('rows' in event) {
          ingest(event.rows, event.replace === true);
          return;
        }
        if ('status' in event && event.status === 'ready') {
          enqueue(buildTable);
        }
      };
    },

    async drain() {
      await queue;
    },

    async stop() {
      stopped = true;
      const old = table;
      table = null;
      schema = null;
      buffer = [];
      shadow = new Map();
      changeListeners.clear();
      watchCounts.clear();
      await queue;
      await old?.delete?.();
    },
  };
}
