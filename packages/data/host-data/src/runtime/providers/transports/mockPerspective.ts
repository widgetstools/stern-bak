/**
 * The mock book delivered through a Perspective Table.
 *
 * Stands to `startMock` exactly as `stompPerspective` stands to `startStomp`,
 * and for the same reason: the generator, the tick behaviour and the restart
 * semantics all stay in ONE place, and the Table is a side effect of the emit
 * stream rather than a replacement for it. The classic push path is forwarded
 * synchronously and unmodified, so anything already subscribed to this
 * provider keeps working exactly as before.
 *
 * It exists so the Perspective row engine can be driven against a book an app
 * already understands, with no broker to stand up. That is what makes a
 * Perspective app and its client-side twin a real A/B pair — same columns,
 * same profiles, same scenarios — so a difference between them is the engine
 * and nothing else. Without it the only Table-holding provider is
 * `stomp-perspective`, which brings its own dataset and makes every comparison
 * ambiguous between the engine and the data.
 *
 * **`rowShape` defaults to `'flat'` here, unlike `mock`.** A Perspective schema
 * is a flat map of typed columns, and the mock positions row is deeply nested
 * (ratings, key-rate durations, exposure breakdowns). Emitting it unflattened
 * would hand the feed nested objects, which `observeRows` reports as `nested`
 * and drops — a Table with a fraction of its columns and no error anywhere.
 * The flatten needs `columnDefinitions`, so a config without them is refused
 * loudly rather than served short.
 */
import type { MockPerspectiveProviderConfig } from '@wellsfargo-starui/types';
import type { ProviderEmit } from '../Provider.js';
import { startMock, type MockProviderOpts } from './mock.js';
import {
  createPerspectiveTableFeed,
  type PerspectiveTableFeed,
} from '../../perspective/perspectiveTableFeed.js';
import {
  toPerspectiveSchemaFromFields,
  type DeclaredField,
} from '../../perspective/perspectiveSchema.js';
import type { PerspectiveTeeHandle, PerspectiveTeeOpts } from './perspectiveTee.js';

export interface MockPerspectiveOpts extends MockProviderOpts, PerspectiveTeeOpts {}

export type MockPerspectiveHandle = PerspectiveTeeHandle;

export function startMockPerspective(
  cfg: MockPerspectiveProviderConfig,
  emit: ProviderEmit,
  opts: MockPerspectiveOpts = {},
): MockPerspectiveHandle {
  const tableName = opts.tableName ?? cfg.tableName ?? 'positions';
  const host = opts.perspectiveHost;

  // Perspective indexes by a single scalar. A composite `keyColumn` keys the
  // hub's cache by joined values, which has no Table equivalent — so rather
  // than silently indexing on the first column (making rows collide and
  // overwrite each other), the Table is skipped and the push path carries on.
  const keyColumn = typeof cfg.keyColumn === 'string' ? cfg.keyColumn : undefined;

  // Flat rows or no Table. See the module note — nested columns are dropped by
  // the schema observer, so serving them would mean a quietly narrow Table.
  const rowShape = cfg.rowShape ?? 'flat';
  const canFlatten = rowShape === 'flat' && (cfg.columnDefinitions?.length ?? 0) > 0;

  let feed: PerspectiveTableFeed | null = null;
  let taps: ProviderEmit = emit;

  if (host && keyColumn && canFlatten) {
    // Columns the config already declares. With them the Table is created
    // EMPTY and immediately, so a blotter paints on open instead of waiting
    // for the first snapshot to arrive before there is anything to attach to.
    // `inferredFields` is preferred over `columnDefinitions`: it carries real
    // types, where a column def carries a cell renderer hint.
    const declared = cfg.inferredFields?.length
      ? cfg.inferredFields
      : cfg.columnDefinitions ?? [];
    const declaredSchema = declared.length
      ? toPerspectiveSchemaFromFields(declared as DeclaredField[], {
          integerColumns: cfg.integerColumns,
          inferDates: cfg.inferDates,
          // The flat row shape this transport requires lifts `rating.moody`
          // onto the literal key `"rating.moody"`, so a dotted declaration
          // names a real flat column here rather than a nested value.
          flatDottedPaths: true,
        }).schema
      : undefined;

    feed = createPerspectiveTableFeed({
      keyColumn,
      createTable: host.tableFactoryFor(tableName),
      // Only usable when the declaration actually covers the index; otherwise
      // fall back to inferring from rows rather than build an unindexable
      // Table, whose `update()` would append instead of upsert and grow the
      // book on every tick.
      declaredSchema:
        declaredSchema && keyColumn in declaredSchema ? declaredSchema : undefined,
      integerColumns: cfg.integerColumns,
      buildAfterRows: cfg.buildAfterRows,
      onDiagnostic: (diagnostic) => opts.onDiagnostic?.(diagnostic),
    });
    taps = feed.tap(emit);
  } else if (host) {
    opts.onDiagnostic?.({
      kind: 'index-invalid',
      reason: !keyColumn
        ? Array.isArray(cfg.keyColumn)
          ? `composite keyColumn [${cfg.keyColumn.join(', ')}] cannot index a Perspective Table`
          : 'keyColumn is required to index a Perspective Table'
        : `mock-perspective needs flat rows: set rowShape 'flat' and supply `
          + `columnDefinitions (rowShape='${rowShape}', `
          + `${cfg.columnDefinitions?.length ?? 0} columnDefinitions)`,
    });
  }

  // `providerType` is narrowed away: to `startMock` this is a mock config,
  // which is exactly what it is. `rowShape` is resolved here rather than left
  // to `startMock`'s default, which is `'nested'`.
  const inner = startMock({ ...cfg, providerType: 'mock', rowShape }, taps, opts);

  return {
    get feed() {
      return feed;
    },
    get tableName() {
      return tableName;
    },
    async stop() {
      await inner.stop();
      // After the transport, so nothing can arrive for a Table already gone.
      await feed?.stop();
    },
    async restart(extra?: Record<string, unknown>) {
      // The Table is NOT torn down here. A restart re-sends the book and the
      // feed's own `replace` handling rebuilds it — dropping it now would
      // leave every attached window looking at a missing table for the length
      // of a snapshot.
      await inner.restart(extra);
    },
  };
}
