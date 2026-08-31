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
  constructor(index: string) {
    this.index = index;
  }
  async clear(): Promise<void> {
    this.ops.push({ kind: 'clear' });
  }
  async update(payload: unknown): Promise<void> {
    this.ops.push({ kind: 'update', payload });
  }
  async delete(): Promise<void> {
    this.ops.push({ kind: 'delete' });
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
async function flush(times = 6): Promise<void> {
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
      const update = tables[0].ops.find((op) => op.kind === 'update') as { payload: Record<string, unknown[]> };
      expect(update.payload[INDEX_COLUMN]).toEqual(['B']);
    } finally {
      warn.mockRestore();
    }
  });

  it('applies ticks row-oriented (sparse-safe) and publishes grid-ready rows', async () => {
    const { client, tables } = fakeClient();
    const feed = createSsrmFeedTable({ client, schema, rowIdField: 'cusip' });
    const events: FeedTableEvent[] = [];
    feed.subscribe((event) => events.push(event));
    feed.applyTicks([{ cusip: 'A', pnl: 7, rating: { moody: 'Baa1' } }]);
    await flush();
    const update = tables[0].ops.find((op) => op.kind === 'update') as { payload: Record<string, unknown>[] };
    expect(update.payload).toEqual([
      { cusip: 'A', pnl: 7, 'rating.moody': 'Baa1', [INDEX_COLUMN]: 'A' },
    ]);
    expect(events).toHaveLength(1);
    const event = events[0] as { type: 'update'; rows: Map<string, Record<string, unknown>> };
    expect(event.type).toBe('update');
    expect(event.rows.get('A')?.pnl).toBe(7);
    expect(feed.getRow('A')?.pnl).toBe(7);
  });

  it('composes composite keys the same way getRowId does', async () => {
    const { client, tables } = fakeClient();
    const feed = createSsrmFeedTable({ client, schema, rowIdField: ['cusip', 'pnl'] });
    feed.applyTicks([{ cusip: 'A', pnl: 2 }]);
    await flush();
    const update = tables[0].ops.find((op) => op.kind === 'update') as { payload: Record<string, unknown>[] };
    expect(update.payload[0][INDEX_COLUMN]).toBe('A-2');
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
