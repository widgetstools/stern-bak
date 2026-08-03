/**
 * STOMP delivered through a Perspective Table.
 *
 * Same broker, same destinations, same snapshot handshake as `startStomp` —
 * this transport IS `startStomp`, with the emit stream teed into a Table that
 * lives once in the worker. Every window then opens a View against that Table
 * instead of receiving its own copy of the book, which is what makes a second
 * and third blotter cost a View rather than a full replay.
 *
 * Deliberately a thin composition rather than a fork: the wire handling,
 * reconnects, snapshot buffering, template resolution and diagnostics all stay
 * in one place. If STOMP behaviour changes, both providers get it.
 *
 * The classic push path is untouched — `emit` is forwarded synchronously and
 * unmodified — so anything already subscribed to this provider keeps working
 * exactly as before, and the Table is a side effect rather than a replacement.
 */
import type { StompPerspectiveProviderConfig } from '@wellsfargo-starui/types';
import type { ProviderEmit } from '../Provider.js';
import { startStomp, type StompOpts } from './stomp.js';
import {
  createPerspectiveTableFeed,
  type PerspectiveTableFeed,
} from '../../perspective/perspectiveTableFeed.js';
import type { PerspectiveHost } from '../../perspective/perspectiveHost.js';
import {
  toPerspectiveSchemaFromFields,
  type DeclaredField,
} from '../../perspective/perspectiveSchema.js';
import type { PerspectiveTeeHandle, PerspectiveTeeOpts } from './perspectiveTee.js';

export interface StompPerspectiveOpts extends StompOpts, PerspectiveTeeOpts {}

export type StompPerspectiveHandle = PerspectiveTeeHandle;

export function startStompPerspective(
  cfg: StompPerspectiveProviderConfig,
  emit: ProviderEmit,
  opts: StompPerspectiveOpts = {},
): StompPerspectiveHandle {
  const tableName = opts.tableName ?? cfg.tableName ?? 'positions';
  const host = opts.perspectiveHost;

  // Perspective indexes by a single scalar. A composite `keyColumn` keys the
  // hub's cache by joined values, which has no Table equivalent — so rather
  // than silently indexing on the first column (making rows collide and
  // overwrite each other), the Table is skipped and the push path carries on.
  const keyColumn = typeof cfg.keyColumn === 'string' ? cfg.keyColumn : undefined;

  let feed: PerspectiveTableFeed | null = null;
  let taps: ProviderEmit = emit;

  if (host && keyColumn) {
    // Columns the config already declares. With them the Table is created
    // EMPTY and immediately, so a blotter paints on open instead of waiting
    // for the whole snapshot to arrive before there is anything to attach to.
    // `inferredFields` is preferred over `columnDefinitions`: it carries real
    // types, where a column def carries a cell renderer hint.
    const declared = cfg.inferredFields?.length
      ? cfg.inferredFields
      : cfg.columnDefinitions ?? [];
    const declaredSchema = declared.length
      ? toPerspectiveSchemaFromFields(declared as DeclaredField[], {
          integerColumns: cfg.integerColumns,
          inferDates: cfg.inferDates,
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
      reason: Array.isArray(cfg.keyColumn)
        ? `composite keyColumn [${cfg.keyColumn.join(', ')}] cannot index a Perspective Table`
        : 'keyColumn is required to index a Perspective Table',
    });
  }

  // `providerType` is narrowed away: to `startStomp` this is a STOMP config,
  // which is exactly what it is.
  const inner = startStomp({ ...cfg, providerType: 'stomp' }, taps, opts);

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
      // The Table is NOT torn down here. A restart re-sends the book, and the
      // feed's own `replace` handling rebuilds it — dropping it now would
      // leave every attached window looking at a missing table for the length
      // of a snapshot.
      await inner.restart(extra);
    },
  };
}
