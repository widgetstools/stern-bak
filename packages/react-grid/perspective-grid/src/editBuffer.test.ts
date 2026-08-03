import { describe, expect, it, vi } from 'vitest';
import { createEditBuffer } from './editBuffer.js';
import type { PerspectiveTableLike } from './viewManager.js';

const KEY = 'positionId';

function makeTable(update?: PerspectiveTableLike['update']) {
  const writes: Record<string, unknown>[][] = [];
  const table: PerspectiveTableLike = {
    view: vi.fn(),
    update:
      update ??
      (async (rows: Record<string, unknown>[]) => {
        writes.push(rows);
      }),
  };
  return { table, writes };
}

const noSchema = () => Promise.resolve(null);

describe('createEditBuffer', () => {
  it('writes the edited cell plus the index column, and nothing else', async () => {
    // A sparse row upserts by index and leaves every omitted column alone —
    // which is what makes a single-cell write legal against a live book.
    const { table, writes } = makeTable();
    const edits = createEditBuffer({ table, keyColumn: KEY, schema: noSchema });

    edits.add('p7', 'trader', 'AR');
    await edits.flush();

    expect(writes).toEqual([[{ positionId: 'p7', trader: 'AR' }]]);
  });

  it('coalesces a bulk update into ONE write', async () => {
    // Smart edit and bulk update commit cell by cell; one proxied round trip
    // per cell would be hundreds of worker calls for one user action.
    const { table, writes } = makeTable();
    const edits = createEditBuffer({ table, keyColumn: KEY, schema: noSchema });

    edits.add('p1', 'trader', 'AR');
    edits.add('p1', 'book', 'FI-GOVT');
    edits.add('p2', 'trader', 'BK');
    await edits.flush();

    expect(writes).toHaveLength(1);
    expect(writes[0]).toEqual([
      { positionId: 'p1', trader: 'AR', book: 'FI-GOVT' },
      { positionId: 'p2', trader: 'BK' },
    ]);
  });

  it('coerces against the declared type before writing', async () => {
    const { table, writes } = makeTable();
    const edits = createEditBuffer({
      table,
      keyColumn: KEY,
      schema: async () => ({ positionId: 'string', quantity: 'float' }),
    });

    edits.add('p1', 'quantity', '1250.5');
    await edits.flush();

    expect(writes[0]).toEqual([{ positionId: 'p1', quantity: 1250.5 }]);
  });

  it('refuses a row it cannot coerce rather than writing part of it', async () => {
    const errors: unknown[] = [];
    const { table, writes } = makeTable();
    const edits = createEditBuffer({
      table,
      keyColumn: KEY,
      schema: async () => ({ positionId: 'string', quantity: 'float' }),
      onError: (e) => errors.push(e),
    });

    edits.add('p1', 'quantity', 'not a number');
    edits.add('p2', 'quantity', 10);
    await edits.flush();

    // The good row still lands; the bad one is reported, not half-applied.
    expect(writes[0]).toEqual([{ positionId: 'p2', quantity: 10 }]);
    expect(errors).toHaveLength(1);
  });

  it('refuses to edit the index column — an upsert would duplicate the row', async () => {
    const errors: unknown[] = [];
    const { table, writes } = makeTable();
    const edits = createEditBuffer({
      table,
      keyColumn: KEY,
      schema: noSchema,
      onError: (e) => errors.push(e),
    });

    edits.add('p1', KEY, 'p999');
    await edits.flush();

    expect(writes).toHaveLength(0);
    expect(errors).toHaveLength(1);
  });

  it('reports a read-only Table instead of dropping the edit silently', async () => {
    const errors: unknown[] = [];
    const edits = createEditBuffer({
      table: { view: vi.fn() },
      keyColumn: KEY,
      schema: noSchema,
      onError: (e) => errors.push(e),
    });

    edits.add('p1', 'trader', 'AR');
    await edits.flush();

    expect(errors).toHaveLength(1);
  });

  it('reports a rejected write without throwing at the caller', async () => {
    const errors: unknown[] = [];
    const { table } = makeTable(async () => {
      throw new Error('engine busy');
    });
    const edits = createEditBuffer({
      table,
      keyColumn: KEY,
      schema: noSchema,
      onError: (e) => errors.push(e),
    });

    edits.add('p1', 'trader', 'AR');
    await expect(edits.flush()).resolves.toBeUndefined();
    expect(errors).toHaveLength(1);
  });

  it('ignores an edit with no index value and one with no field', async () => {
    const { table, writes } = makeTable();
    const edits = createEditBuffer({ table, keyColumn: KEY, schema: noSchema });

    edits.add(undefined, 'trader', 'AR');
    edits.add(null, 'trader', 'AR');
    edits.add('p1', '', 'AR');
    await edits.flush();

    expect(writes).toHaveLength(0);
  });

  it('flushes on close — a Table swap must not eat the last edit', async () => {
    const { table, writes } = makeTable();
    const edits = createEditBuffer({ table, keyColumn: KEY, schema: noSchema });

    edits.add('p1', 'trader', 'AR');
    await edits.close();

    expect(writes).toEqual([[{ positionId: 'p1', trader: 'AR' }]]);
  });

  it('refuses edits made after close rather than buffering them forever', async () => {
    const { table, writes } = makeTable();
    const edits = createEditBuffer({ table, keyColumn: KEY, schema: noSchema });

    await edits.close();
    edits.add('p1', 'trader', 'AR');
    await edits.flush();

    expect(writes).toHaveLength(0);
  });

  it('writes nothing when there is nothing staged', async () => {
    const { table, writes } = makeTable();
    const edits = createEditBuffer({ table, keyColumn: KEY, schema: noSchema });

    await edits.flush();
    expect(writes).toHaveLength(0);
  });

  it('lets the debounce write on its own, without a flush', async () => {
    const { table, writes } = makeTable();
    const edits = createEditBuffer({ table, keyColumn: KEY, schema: noSchema, flushMs: 1 });

    edits.add('p1', 'trader', 'AR');
    await vi.waitFor(() => expect(writes).toHaveLength(1));
  });
});
