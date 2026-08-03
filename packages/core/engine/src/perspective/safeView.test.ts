import { describe, expect, it, vi } from 'vitest';
import { createSafeView, type DeletableView } from './safeView.js';

/** A view whose reads resolve only when the test releases them. */
function makeControlledView() {
  const releases: (() => void)[] = [];
  const order: string[] = [];
  const view: DeletableView = {
    to_columns: vi.fn(
      () =>
        new Promise<Record<string, unknown[]>>((resolve) => {
          releases.push(() => {
            order.push('read-done');
            resolve({ positionId: ['p0'] });
          });
        }),
    ),
    num_rows: vi.fn(async () => 1),
    delete: vi.fn(async () => {
      order.push('delete');
    }),
  };
  return { view, releases, order };
}

describe('createSafeView', () => {
  it('reads through to the underlying view', async () => {
    const view: DeletableView = {
      to_columns: vi.fn(async () => ({ a: [1, 2] })),
      num_rows: vi.fn(async () => 2),
      delete: vi.fn(async () => {}),
    };
    const safe = createSafeView(view);

    await expect(safe.read({ start_row: 0, end_row: 2 })).resolves.toEqual({ a: [1, 2] });
    expect(view.to_columns).toHaveBeenCalledWith({ start_row: 0, end_row: 2 });
  });

  // The whole point: delete must not overlap an in-flight read, because the
  // resulting wasm throw is uncatchable and can kill the SharedWorker.
  it('defers delete until in-flight reads drain', async () => {
    const { view, releases, order } = makeControlledView();
    const safe = createSafeView(view);

    const read = safe.read({ start_row: 0, end_row: 100 });
    expect(safe.pending).toBe(1);

    const closed = safe.close();
    // Delete MUST NOT have happened yet — the read is still borrowing.
    await Promise.resolve();
    expect(view.delete).not.toHaveBeenCalled();

    releases[0]();
    await read;
    await closed;

    expect(view.delete).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['read-done', 'delete']);
  });

  it('waits for ALL concurrent reads before deleting', async () => {
    const { view, releases } = makeControlledView();
    const safe = createSafeView(view);

    const r1 = safe.read({ start_row: 0, end_row: 100 });
    const r2 = safe.read({ start_row: 100, end_row: 200 });
    const r3 = safe.read({ start_row: 200, end_row: 300 });
    expect(safe.pending).toBe(3);

    const closed = safe.close();

    releases[0]();
    await r1;
    await Promise.resolve();
    expect(view.delete).not.toHaveBeenCalled();

    releases[1]();
    releases[2]();
    await Promise.all([r2, r3]);
    await closed;

    expect(safe.pending).toBe(0);
    expect(view.delete).toHaveBeenCalledTimes(1);
  });

  it('deletes immediately when nothing is in flight', async () => {
    const view: DeletableView = {
      to_columns: vi.fn(async () => ({})),
      num_rows: vi.fn(async () => 0),
      delete: vi.fn(async () => {}),
    };
    const safe = createSafeView(view);

    await safe.close();
    expect(view.delete).toHaveBeenCalledTimes(1);
  });

  it('refuses reads once closing, resolving null so the caller can settle empty', async () => {
    const view: DeletableView = {
      to_columns: vi.fn(async () => ({ a: [1] })),
      num_rows: vi.fn(async () => 1),
      delete: vi.fn(async () => {}),
    };
    const safe = createSafeView(view);

    await safe.close();
    await expect(safe.read({ start_row: 0, end_row: 10 })).resolves.toBeNull();
    // Critically, no read was issued against a deleted view.
    expect(view.to_columns).not.toHaveBeenCalled();
  });

  it('is idempotent — many close() calls delete exactly once', async () => {
    const view: DeletableView = {
      to_columns: vi.fn(async () => ({})),
      num_rows: vi.fn(async () => 0),
      delete: vi.fn(async () => {}),
    };
    const safe = createSafeView(view);

    await Promise.all([safe.close(), safe.close(), safe.close()]);
    expect(view.delete).toHaveBeenCalledTimes(1);
  });

  it('still drains and deletes when a read rejects', async () => {
    const view: DeletableView = {
      to_columns: vi.fn(async () => {
        throw new Error('read blew up');
      }),
      num_rows: vi.fn(async () => 0),
      delete: vi.fn(async () => {}),
    };
    const safe = createSafeView(view);

    await expect(safe.read({ start_row: 0, end_row: 10 })).rejects.toThrow('read blew up');
    expect(safe.pending).toBe(0); // decremented in `finally`

    await safe.close();
    expect(view.delete).toHaveBeenCalledTimes(1);
  });

  it('exposes closed state', async () => {
    const view: DeletableView = {
      to_columns: vi.fn(async () => ({})),
      num_rows: vi.fn(async () => 0),
      delete: vi.fn(async () => {}),
    };
    const safe = createSafeView(view);

    expect(safe.closed).toBe(false);
    const p = safe.close();
    expect(safe.closed).toBe(true);
    await p;
  });
});

/**
 * `rows()` exists because the row count has to be re-read on a live View — the
 * book grows under it while the snapshot streams. It borrows the same Rust
 * value a concurrent `delete()` would take ownership of, so it is refcounted
 * exactly like a read.
 */
describe('createSafeView — rows()', () => {
  it('reads the count through to the underlying view', async () => {
    const view: DeletableView = {
      to_columns: vi.fn(async () => ({})),
      num_rows: vi.fn(async () => 20_000),
      delete: vi.fn(async () => {}),
    };
    await expect(createSafeView(view).rows()).resolves.toBe(20_000);
  });

  it('resolves null once closing, rather than starting a borrow mid-delete', async () => {
    const view: DeletableView = {
      to_columns: vi.fn(async () => ({})),
      num_rows: vi.fn(async () => 5),
      delete: vi.fn(async () => {}),
    };
    const safe = createSafeView(view);
    const closing = safe.close();

    await expect(safe.rows()).resolves.toBeNull();
    expect(view.num_rows).not.toHaveBeenCalled();
    await closing;
  });

  it('holds the delete until an in-flight count has drained', async () => {
    const order: string[] = [];
    let release: (() => void) | null = null;
    const view: DeletableView = {
      to_columns: vi.fn(async () => ({})),
      num_rows: vi.fn(
        () => new Promise<number>((resolve) => {
          release = () => { order.push('rows-done'); resolve(1); };
        }),
      ),
      delete: vi.fn(async () => { order.push('delete'); }),
    };
    const safe = createSafeView(view);

    const counting = safe.rows();
    const closing = safe.close();
    expect(safe.pending).toBe(1);

    release!();
    await counting;
    await closing;

    // Deleting first is the uncatchable wasm borrow error.
    expect(order).toEqual(['rows-done', 'delete']);
  });
});
