import { describe, expect, it, vi } from 'vitest';
import { createPerspectiveHost, type HostClientLike, type PerspectiveModuleLike } from './perspectiveHost.js';
import { createPerspectiveTableFeed } from './perspectiveTableFeed.js';
import { toPerspectiveSchemaFromFields } from './perspectiveSchema.js';

/**
 * A fake `@perspective-dev/client` — no wasm, no worker. Proves the
 * host/feed/schema plumbing (create -> update -> read -> delete, and the
 * "two owners, idempotent delete" rule) without a real engine, the same way
 * most of the upstream port's own test suite runs.
 */
function fakePerspectiveModule(): { module: PerspectiveModuleLike; deletes: number } {
  const state = { deletes: 0 };
  const rows: Record<string, unknown>[] = [];

  const client: HostClientLike = {
    async table(schema, { index }) {
      return {
        async update(incoming: unknown) {
          for (const row of incoming as Record<string, unknown>[]) {
            const key = row[index as string];
            const existingIdx = rows.findIndex((r) => r[index as string] === key);
            if (existingIdx >= 0) rows[existingIdx] = { ...rows[existingIdx], ...row };
            else rows.push({ ...row });
          }
        },
        async delete() {
          state.deletes += 1;
        },
        async size() {
          return rows.length;
        },
        async clear() {
          rows.length = 0;
        },
      };
    },
    new_proxy_session: () => ({ handle_request: async () => {} }),
  };

  return {
    module: { worker: async () => client },
    deletes: state.deletes,
  };
}

describe('createPerspectiveHost — wasm/worker plumbing smoke test', () => {
  it('creates, updates, reads and deletes a Table with zero unhandled rejections', async () => {
    const onUnhandled = vi.fn();
    process.on('unhandledRejection', onUnhandled);

    const { module } = fakePerspectiveModule();
    const onError = vi.fn();
    const host = createPerspectiveHost({ loadPerspective: async () => module, onError });

    const { schema } = toPerspectiveSchemaFromFields([
      { path: 'positionId', type: 'string' },
      { path: 'quantity', type: 'number' },
    ]);
    const createTable = host.tableFactoryFor('positions');
    const table = await createTable(schema, 'positionId');

    await table.update([{ positionId: 'POS-1', quantity: 100 }]);
    expect(await table.size?.()).toBe(1);

    await table.update([{ positionId: 'POS-1', quantity: 150 }]);
    expect(await table.size?.()).toBe(1);

    await table.clear?.();
    expect(await table.size?.()).toBe(0);

    await table.delete();
    // Second delete on the same handle must be a no-op, not a throw — the
    // "two owners" rule this host exists to enforce.
    await expect(table.delete()).resolves.toBeUndefined();

    expect(onError).not.toHaveBeenCalled();

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onUnhandled).not.toHaveBeenCalled();
    process.off('unhandledRejection', onUnhandled);
  });

  it('feeds a Table from a provider emit stream end to end', async () => {
    const { module } = fakePerspectiveModule();
    const host = createPerspectiveHost({ loadPerspective: async () => module });
    const createTable = host.tableFactoryFor('positions');

    const { schema } = toPerspectiveSchemaFromFields([
      { path: 'positionId', type: 'string' },
      { path: 'quantity', type: 'number' },
    ]);

    const feed = createPerspectiveTableFeed({
      keyColumn: 'positionId',
      declaredSchema: schema,
      createTable: (s, index) => createTable(s, index),
    });

    const seen: unknown[] = [];
    const tappedEmit = feed.tap((event) => seen.push(event));

    tappedEmit({ rows: [], replace: true });
    tappedEmit({ rows: [{ positionId: 'POS-1', quantity: 100 }], replace: true });
    tappedEmit({ status: 'ready' });
    tappedEmit({ rows: [{ positionId: 'POS-1', quantity: 105 }] });

    const table = await feed.whenReady();
    await feed.drain();
    expect(await table.size?.()).toBe(1);

    // The push path saw every event, untouched.
    expect(seen).toHaveLength(4);

    await feed.stop();
  });
});
