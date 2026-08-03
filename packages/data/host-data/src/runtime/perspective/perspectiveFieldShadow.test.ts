/**
 * The table feed's field shadow — the one thing a Perspective Table cannot
 * tell you.
 *
 * `table.update()` REPLACES a row, so after a write the previous cell value
 * is unrecoverable; `dataChange` / `relativeChange` alert rules need exactly
 * that. The shadow holds it, and the two properties that make it safe to
 * carry in a SharedWorker serving a whole desk are what this file pins:
 *
 *   - it holds ONLY the fields something is actively watching
 *   - it diffs BEFORE the write lands, not after
 */

import { describe, expect, it, vi } from 'vitest';
import type { PerspectiveRowFieldChange } from '@wellsfargo-starui/types';
import { createPerspectiveTableFeed, type FeedTable } from './perspectiveTableFeed';
import type { ProviderEmit } from '../providers/Provider.js';

const SCHEMA = { id: 'string', price: 'float', quantity: 'integer' } as const;

interface Harness {
  emit: ProviderEmit;
  feed: ReturnType<typeof createPerspectiveTableFeed>;
  /** Rows the Table was actually written with, in order. */
  written: unknown[][];
  drain(): Promise<void>;
}

function harness(): Harness {
  const written: unknown[][] = [];
  const table: FeedTable = {
    update: async (rows) => {
      written.push([...rows]);
    },
    clear: async () => {},
    delete: async () => {},
  };
  const feed = createPerspectiveTableFeed({
    keyColumn: 'id',
    declaredSchema: { ...SCHEMA },
    createTable: async () => table,
  });
  return { emit: feed.tap(() => {}), feed, written, drain: () => feed.drain() };
}

function watchAll(h: Harness, fields: string[]) {
  const seen: PerspectiveRowFieldChange[] = [];
  const release = h.feed.changes.watch(fields);
  const off = h.feed.changes.onChanges((batch) => seen.push(...batch));
  return { seen, release, off };
}

describe('field shadow — scope', () => {
  it('holds nothing at all until something watches', async () => {
    const h = harness();
    await h.drain();
    h.emit({ rows: [{ id: 'p1', price: 100, quantity: 5 }] });
    await h.drain();

    expect(h.feed.changes.watchedFields).toEqual([]);
    expect(h.feed.changes.shadowedRows).toBe(0);
  });

  it('holds ONLY the watched field, never the whole row', async () => {
    const h = harness();
    await h.drain();
    watchAll(h, ['price']);

    h.emit({ rows: [{ id: 'p1', price: 100, quantity: 5, notional: 500 }] });
    await h.drain();

    expect(h.feed.changes.watchedFields).toEqual(['price']);
    expect(h.feed.changes.shadowedRows).toBe(1);
  });

  it('refcounts two watchers of the same field', async () => {
    const h = harness();
    await h.drain();
    const first = h.feed.changes.watch(['price']);
    const second = h.feed.changes.watch(['price']);

    first();
    expect(h.feed.changes.watchedFields).toEqual(['price']);
    second();
    expect(h.feed.changes.watchedFields).toEqual([]);
  });

  it('drops a field from every shadowed row when its last watcher leaves', async () => {
    const h = harness();
    await h.drain();
    const release = h.feed.changes.watch(['price']);
    h.emit({ rows: [{ id: 'p1', price: 100 }, { id: 'p2', price: 200 }] });
    await h.drain();
    expect(h.feed.changes.shadowedRows).toBe(2);

    release();

    expect(h.feed.changes.watchedFields).toEqual([]);
    // Nothing is watched, so nothing is retained — the map does not keep
    // paying for a rule that was turned off.
    expect(h.feed.changes.shadowedRows).toBe(0);
  });
});

describe('field shadow — diffing', () => {
  it('seeds on first sight and reports nothing', async () => {
    const h = harness();
    await h.drain();
    const { seen } = watchAll(h, ['price']);

    h.emit({ rows: [{ id: 'p1', price: 100 }] });
    await h.drain();

    // A row APPEARING is not a row changing. Reporting it would fire every
    // enabled rule against the whole book on load.
    expect(seen).toEqual([]);
  });

  it('reports the before and after once a value moves', async () => {
    const h = harness();
    await h.drain();
    const { seen } = watchAll(h, ['price']);

    h.emit({ rows: [{ id: 'p1', price: 100 }] });
    h.emit({ rows: [{ id: 'p1', price: 110 }] });
    await h.drain();

    expect(seen).toEqual([
      {
        key: 'p1',
        field: 'price',
        oldValue: 100,
        newValue: 110,
        row: { id: 'p1', price: 110 },
      },
    ]);
  });

  it('diffs BEFORE the write lands', async () => {
    const h = harness();
    await h.drain();
    const order: string[] = [];
    h.feed.changes.watch(['price']);
    h.feed.changes.onChanges(() => order.push('diff'));
    const originalUpdate = h.written;
    void originalUpdate;

    h.emit({ rows: [{ id: 'p1', price: 100 }] });
    await h.drain();
    const writesBefore = h.written.length;

    h.emit({ rows: [{ id: 'p1', price: 110 }] });
    // The diff is synchronous inside `ingest`; the write is queued behind it.
    expect(order).toEqual(['diff']);
    expect(h.written.length).toBe(writesBefore);

    await h.drain();
    expect(h.written.length).toBe(writesBefore + 1);
  });

  it('says nothing when the value is unchanged', async () => {
    const h = harness();
    await h.drain();
    const { seen } = watchAll(h, ['price']);

    h.emit({ rows: [{ id: 'p1', price: 100 }] });
    h.emit({ rows: [{ id: 'p1', price: 100 }] });
    await h.drain();

    expect(seen).toEqual([]);
  });

  it('ignores a field absent from the incoming row', async () => {
    const h = harness();
    await h.drain();
    const { seen } = watchAll(h, ['price']);

    h.emit({ rows: [{ id: 'p1', price: 100 }] });
    // A sparse tick touching only `quantity` leaves `price` alone — this is
    // the shape a single-cell edit arrives in.
    h.emit({ rows: [{ id: 'p1', quantity: 9 }] });
    await h.drain();

    expect(seen).toEqual([]);
  });

  it('forgets its history on a replace, so a fresh book is not all-changed', async () => {
    const h = harness();
    await h.drain();
    const { seen } = watchAll(h, ['price']);

    h.emit({ rows: [{ id: 'p1', price: 100 }] });
    await h.drain();

    h.emit({ rows: [], replace: true });
    h.emit({ rows: [{ id: 'p1', price: 999 }] });
    await h.drain();

    // 100 -> 999 across a restart is not a tick, it is a different book.
    expect(seen).toEqual([]);
  });

  it('drops a row with no key rather than shadowing it under "undefined"', async () => {
    const h = harness();
    await h.drain();
    const { seen } = watchAll(h, ['price']);

    h.emit({ rows: [{ price: 100 }, { price: 200 }] });
    await h.drain();

    expect(h.feed.changes.shadowedRows).toBe(0);
    expect(seen).toEqual([]);
  });

  it('keeps feeding the rest when one listener throws', async () => {
    const h = harness();
    await h.drain();
    h.feed.changes.watch(['price']);
    const good = vi.fn();
    h.feed.changes.onChanges(() => {
      throw new Error('one window is broken');
    });
    h.feed.changes.onChanges(good);

    h.emit({ rows: [{ id: 'p1', price: 100 }] });
    h.emit({ rows: [{ id: 'p1', price: 110 }] });
    await h.drain();

    expect(good).toHaveBeenCalledTimes(1);
  });

  it('batches every changed field across a whole tick', async () => {
    const h = harness();
    await h.drain();
    const { seen } = watchAll(h, ['price', 'quantity']);

    h.emit({ rows: [{ id: 'p1', price: 100, quantity: 5 }] });
    h.emit({ rows: [{ id: 'p1', price: 110, quantity: 6 }] });
    await h.drain();

    expect(seen.map((c) => [c.key, c.field, c.oldValue, c.newValue])).toEqual([
      ['p1', 'price', 100, 110],
      ['p1', 'quantity', 5, 6],
    ]);
  });
});
