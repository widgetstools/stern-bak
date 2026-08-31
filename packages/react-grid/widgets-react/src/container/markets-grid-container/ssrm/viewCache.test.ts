import { describe, expect, it } from 'vitest';
import type { Table, View, ViewConfigUpdate } from '@perspective-dev/client';
import { ViewCache } from './viewCache.js';

type FakeView = { deleted: boolean; delete: () => Promise<void>; num_rows: () => Promise<number> };

function fakeEngine(): { table: Promise<Table>; created: FakeView[]; failNext: { on: boolean } } {
  const created: FakeView[] = [];
  const failNext = { on: false };
  const table = {
    view: async (_config: ViewConfigUpdate): Promise<View> => {
      if (failNext.on) {
        failNext.on = false;
        throw new Error('view build failed');
      }
      const view: FakeView = {
        deleted: false,
        delete: async () => {
          view.deleted = true;
        },
        num_rows: async () => 1,
      };
      created.push(view);
      return view as unknown as View;
    },
  };
  return { table: Promise.resolve(table as unknown as Table), created, failNext };
}

describe('ViewCache', () => {
  it('reuses one live view per config', async () => {
    const { table, created } = fakeEngine();
    const cache = new ViewCache(table);
    const config: ViewConfigUpdate = { columns: ['a'] };
    await cache.withView(config, async (v) => v.num_rows());
    await cache.withView({ columns: ['a'] }, async (v) => v.num_rows());
    expect(created).toHaveLength(1);
    expect(cache.size).toBe(1);
  });

  it('evicts least-recently-used views beyond the limit and deletes them', async () => {
    const { table, created } = fakeEngine();
    const cache = new ViewCache(table, 2);
    await cache.withView({ columns: ['a'] }, async () => 0);
    await cache.withView({ columns: ['b'] }, async () => 0);
    await cache.withView({ columns: ['c'] }, async () => 0);
    expect(cache.size).toBe(2);
    // Let the deferred delete settle.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(created[0].deleted).toBe(true);
    expect(created[2].deleted).toBe(false);
  });

  it('skips a view a reader is inside when evicting, reclaiming the overflow instead', async () => {
    const { table, created } = fakeEngine();
    const cache = new ViewCache(table, 1);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const slowRead = cache.withView({ columns: ['a'] }, async (v) => {
      await gate;
      return v.num_rows();
    });
    // A second config overflows the limit while the first is held open: the
    // held view must be skipped, so the overflow itself is what gets evicted.
    await cache.withView({ columns: ['b'] }, async () => 0);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(created[0].deleted).toBe(false);
    expect(created[1].deleted).toBe(true);
    release();
    await slowRead;
    await new Promise((resolve) => setTimeout(resolve, 0));
    // The pinned view survives its release — it stays cached for reuse.
    expect(created[0].deleted).toBe(false);
    expect(cache.size).toBe(1);
  });

  it('drops a failed view from the cache so the next request rebuilds it', async () => {
    const engine = fakeEngine();
    const cache = new ViewCache(engine.table);
    engine.failNext.on = true;
    await expect(cache.withView({ columns: ['a'] }, async () => 0)).rejects.toThrow('view build failed');
    expect(cache.size).toBe(0);
    await cache.withView({ columns: ['a'] }, async () => 0);
    expect(engine.created).toHaveLength(1);
  });

  it('clear() deletes everything', async () => {
    const { table, created } = fakeEngine();
    const cache = new ViewCache(table);
    await cache.withView({ columns: ['a'] }, async () => 0);
    await cache.withView({ columns: ['b'] }, async () => 0);
    await cache.clear();
    expect(cache.size).toBe(0);
    expect(created.every((view) => view.deleted)).toBe(true);
  });
});
