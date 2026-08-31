import { describe, expect, it, vi } from 'vitest';
import type { Client } from '@perspective-dev/client';
import { INDEX_COLUMN, buildSchemaFromColDefs } from './schema.js';
import { createSsrmFeedTable, type FeedTableEvent } from './feedTable.js';

type Op =
  | { kind: 'clear' }
  | { kind: 'update'; payload: unknown }
  | { kind: 'delete' };

class FakeTable {
  readonly ops: Op[] = [];
  readonly index: string;
  /** When true, update() records its op but blocks until released. */
  blocking = false;
  private releases: (() => void)[] = [];
  constructor(index: string) {
    this.index = index;
  }
  async clear(): Promise<void> {
    this.ops.push({ kind: 'clear' });
  }
  async update(payload: unknown): Promise<void> {
    this.ops.push({ kind: 'update', payload });
    if (this.blocking) await new Promise<void>((resolve) => this.releases.push(resolve));
  }
  async delete(): Promise<void> {
    this.ops.push({ kind: 'delete' });
  }
  release(): void {
    this.releases.shift()?.();
  }
  updates(): unknown[] {
    return this.ops.filter((op) => op.kind === 'update').map((op) => (op as { payload: unknown }).payload);
  }
}

function fakeClient(): { client: Promise<Client>; tables: FakeTable[] } {
  const tables: FakeTable[] = [];
  const client = {
    table: async (_schema: unknown, opts: { index: string }) => {
      const table = new FakeTable(opts.index);
      tables.push(table);
      return table;
    },
  };
  return { client: Promise.resolve(client as unknown as Client), tables };
}

const schema = buildSchemaFromColDefs([
  { field: 'cusip', cellDataType: 'text' },
  { field: 'pnl', cellDataType: 'number' },
  { field: 'rating.moody', cellDataType: 'text' },
]);

/** Drains the feed table's internal write queue (promise chain + table awaits). */
async function flush(times = 8): Promise<void> {
  for (let i = 0; i < times; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('createSsrmFeedTable', () => {
  it('creates the table indexed on the synthetic index column', async () => {
    const { client, tables } = fakeClient();
    const feed = createSsrmFeedTable({ client, schema, rowIdField: 'cusip' });
    await feed.table;
    expect(tables[0].index).toBe(INDEX_COLUMN);
  });

  it('loads a snapshot as clear + columnar chunks with composed index values, announcing each chunk', async () => {
    const { client, tables } = fakeClient();
    const feed = createSsrmFeedTable({ client, schema, rowIdField: 'cusip' });
    const events: FeedTableEvent[] = [];
    feed.subscribe((event) => events.push(event));
    feed.applySnapshot([
      { cusip: 'A', pnl: 1, rating: { moody: 'Aa1' } },
      { cusip: 'B', pnl: 2 },
    ]);
    await flush();
    const [clearOp, updateOp] = tables[0].ops;
    expect(clearOp).toEqual({ kind: 'clear' });
    const columnar = (updateOp as { payload: Record<string, unknown[]> }).payload;
    expect(columnar[INDEX_COLUMN]).toEqual(['A', 'B']);
    expect(columnar.cusip).toEqual(['A', 'B']);
    expect(columnar['rating.moody']).toEqual(['Aa1', null]);
    expect(events).toEqual([{ type: 'snapshot' }]);
  });

  it('drops rows whose key column is missing', async () => {
    const { client, tables } = fakeClient();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const feed = createSsrmFeedTable({ client, schema, rowIdField: 'cusip' });
      feed.applySnapshot([{ pnl: 1 }, { cusip: 'B', pnl: 2 }]);
      await flush();
      const update = tables[0].updates()[0] as Record<string, unknown[]>;
      expect(update[INDEX_COLUMN]).toEqual(['B']);
    } finally {
      warn.mockRestore();
    }
  });

  it('drains whole-row ticks COLUMNAR and names the ids that changed', async () => {
    const { client, tables } = fakeClient();
    const feed = createSsrmFeedTable({ client, schema, rowIdField: 'cusip' });
    const events: FeedTableEvent[] = [];
    feed.subscribe((event) => events.push(event));
    feed.applyTicks([{ cusip: 'A', pnl: 7, rating: { moody: 'Baa1' } }]);
    await flush();
    expect(tables[0].updates()).toEqual([
      { cusip: ['A'], pnl: [7], 'rating.moody': ['Baa1'], [INDEX_COLUMN]: ['A'] },
    ]);
    expect(events).toHaveLength(1);
    const event = events[0] as { type: 'update'; ids: ReadonlySet<string> };
    expect(event.type).toBe('update');
    expect([...event.ids]).toEqual(['A']);
    // Grid-ready values materialise lazily from the raw latest row.
    expect(feed.getRow('A')).toEqual({
      cusip: 'A',
      pnl: 7,
      'rating.moody': 'Baa1',
      [INDEX_COLUMN]: 'A',
    });
  });

  it('leaves a column no drained row carries out of the write entirely', async () => {
    const { client, tables } = fakeClient();
    const feed = createSsrmFeedTable({ client, schema, rowIdField: 'cusip' });
    feed.applyTicks([{ cusip: 'A', pnl: 9 }]);
    await flush();
    const payload = tables[0].updates()[0] as Record<string, unknown>;
    // No 'rating.moody' key at all — emitting it would null a field the
    // batch never mentioned.
    expect(payload).toEqual({ cusip: ['A'], pnl: [9], [INDEX_COLUMN]: ['A'] });
  });

  it('stays row-oriented under sparseTicks so sparse rows cannot erase fields', async () => {
    const { client, tables } = fakeClient();
    const feed = createSsrmFeedTable({ client, schema, rowIdField: 'cusip', sparseTicks: true });
    feed.applyTicks([{ cusip: 'A', pnl: 9 }, { cusip: 'B', rating: { moody: 'Aa2' } }]);
    await flush();
    expect(tables[0].updates()).toEqual([
      [
        { cusip: 'A', pnl: 9, [INDEX_COLUMN]: 'A' },
        { cusip: 'B', 'rating.moody': 'Aa2', [INDEX_COLUMN]: 'B' },
      ],
    ]);
  });

  it('conflates ticks behind a slow engine — one write in flight, last value wins, bounded backlog', async () => {
    const { client, tables } = fakeClient();
    const feed = createSsrmFeedTable({ client, schema, rowIdField: 'cusip' });
    const events: FeedTableEvent[] = [];
    feed.subscribe((event) => events.push(event));
    await feed.table;
    tables[0].blocking = true;

    feed.applyTicks([{ cusip: 'A', pnl: 1 }]);
    await flush();
    // Drain 1 is in flight (blocked). Everything arriving now conflates.
    feed.applyTicks([{ cusip: 'A', pnl: 2 }]);
    feed.applyTicks([{ cusip: 'A', pnl: 3 }]);
    feed.applyTicks([{ cusip: 'B', pnl: 4 }]);
    await flush();
    expect(tables[0].updates()).toHaveLength(1);

    tables[0].release();
    await flush();
    tables[0].release();
    await flush();

    const updates = tables[0].updates() as Record<string, unknown[]>[];
    // Exactly two writes: the in-flight one, then ONE conflated drain.
    expect(updates).toHaveLength(2);
    expect(updates[0].pnl).toEqual([1]);
    expect(updates[1][INDEX_COLUMN]).toEqual(['A', 'B']);
    expect(updates[1].pnl).toEqual([3, 4]);
    expect(events.map((e) => (e.type === 'update' ? [...e.ids].join(',') : 's'))).toEqual(['A', 'A,B']);
    expect(feed.getRow('A')?.pnl).toBe(3);
  });

  it('a snapshot supersedes ticks still waiting to drain', async () => {
    const { client, tables } = fakeClient();
    const feed = createSsrmFeedTable({ client, schema, rowIdField: 'cusip' });
    await feed.table;
    tables[0].blocking = true;

    feed.applyTicks([{ cusip: 'A', pnl: 1 }]);
    await flush();
    // 'B' conflates behind the in-flight drain — then a snapshot arrives.
    feed.applyTicks([{ cusip: 'B', pnl: 2 }]);
    feed.applySnapshot([{ cusip: 'C', pnl: 3 }]);
    tables[0].blocking = false;
    tables[0].release();
    await flush();

    const stale = tables[0]
      .updates()
      .some((payload) => JSON.stringify(payload).includes('"B"'));
    expect(stale).toBe(false);
    // The snapshot itself landed.
    const snap = tables[0].updates().at(-1) as Record<string, unknown[]>;
    expect(snap[INDEX_COLUMN]).toEqual(['C']);
  });

  it('composes composite keys the same way getRowId does', async () => {
    const { client, tables } = fakeClient();
    const feed = createSsrmFeedTable({ client, schema, rowIdField: ['cusip', 'pnl'] });
    feed.applyTicks([{ cusip: 'A', pnl: 2 }]);
    await flush();
    const payload = tables[0].updates()[0] as Record<string, unknown[]>;
    expect(payload[INDEX_COLUMN]).toEqual(['A-2']);
  });

  it('forgets ticked rows once a snapshot replaces the table', async () => {
    const { client } = fakeClient();
    const feed = createSsrmFeedTable({ client, schema, rowIdField: 'cusip' });
    feed.applyTicks([{ cusip: 'A', pnl: 7 }]);
    await flush();
    expect(feed.getRow('A')).toBeDefined();
    feed.applySnapshot([{ cusip: 'A', pnl: 8 }]);
    await flush();
    expect(feed.getRow('A')).toBeUndefined();
  });

  it('dispose deletes the table and drops later writes', async () => {
    const { client, tables } = fakeClient();
    const feed = createSsrmFeedTable({ client, schema, rowIdField: 'cusip' });
    await feed.table;
    feed.dispose();
    feed.applyTicks([{ cusip: 'A', pnl: 1 }]);
    await flush();
    expect(tables[0].ops).toEqual([{ kind: 'delete' }]);
    feed.dispose(); // idempotent
    await flush();
    expect(tables[0].ops).toEqual([{ kind: 'delete' }]);
  });
});
