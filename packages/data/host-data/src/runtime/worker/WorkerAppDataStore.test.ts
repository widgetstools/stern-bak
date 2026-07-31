/**
 * WorkerAppDataStore unit tests — focuses on the in-memory invariants
 * (no port plumbing). Hub round-trip integration tests live in
 * SharedWorkerDataServicesHub.test.ts.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkerAppDataStore } from './WorkerAppDataStore';
import type { AppDataRow } from '../protocol';

function makeRow(configId: string, name: string, values: Record<string, unknown> = {}): AppDataRow {
  return {
    configId,
    name,
    isPublic: false,
    values,
    userId: 'alice',
  };
}

describe('WorkerAppDataStore — hydration', () => {
  let store: WorkerAppDataStore;
  beforeEach(() => { store = new WorkerAppDataStore(); });

  it('starts un-hydrated with an empty snapshot', () => {
    expect(store.isHydrated()).toBe(false);
    expect(store.snapshot()).toEqual([]);
  });

  it('first hydrate populates state and flips the flag', () => {
    store.hydrate([makeRow('a', 'positions', { asOfDate: '2026-04-01' })]);
    expect(store.isHydrated()).toBe(true);
    expect(store.snapshot()).toHaveLength(1);
    expect(store.snapshot()[0]).toMatchObject({ configId: 'a', name: 'positions' });
  });

  it('second hydrate is a no-op (first writer wins)', () => {
    store.hydrate([makeRow('a', 'positions', { asOfDate: '2026-04-01' })]);
    store.hydrate([makeRow('b', 'trades', { asOfDate: '2026-05-01' })]);
    expect(store.snapshot()).toHaveLength(1);
    expect(store.snapshot()[0].configId).toBe('a');
  });

  it('hydrate does NOT fire listeners — snapshot is delivered via attach', () => {
    const listener = vi.fn();
    store.subscribe(listener);
    store.hydrate([makeRow('a', 'positions')]);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('WorkerAppDataStore — upsert', () => {
  let store: WorkerAppDataStore;
  beforeEach(() => {
    store = new WorkerAppDataStore();
    store.hydrate([]); // empty seed → considered hydrated
  });

  it('inserts a new row and fires upsert', () => {
    const listener = vi.fn();
    store.subscribe(listener);
    const row = makeRow('a', 'positions', { asOfDate: '2026-05-01' });
    store.upsert(row);
    expect(store.snapshot()).toHaveLength(1);
    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith('upsert', row);
  });

  it('updating same configId replaces in place (LWW)', () => {
    store.upsert(makeRow('a', 'positions', { asOfDate: '2026-05-01' }));
    store.upsert(makeRow('a', 'positions', { asOfDate: '2026-05-08' }));
    expect(store.snapshot()).toHaveLength(1);
    expect(store.snapshot()[0].values).toEqual({ asOfDate: '2026-05-08' });
  });

  it('renaming a row drops the old name index', () => {
    store.upsert(makeRow('a', 'positions', { asOfDate: '2026-05-01' }));
    store.upsert(makeRow('a', 'newName', { asOfDate: '2026-05-01' }));
    // Both maps in sync — only one row in the snapshot.
    expect(store.snapshot()).toHaveLength(1);
    expect(store.snapshot()[0].name).toBe('newName');
  });

  it('two configIds with the same name — last writer wins on byName', () => {
    store.upsert(makeRow('a', 'positions', { asOfDate: '2026-04-01' }));
    store.upsert(makeRow('b', 'positions', { asOfDate: '2026-05-01' }));
    // Both rows kept by configId — name index points to the latter.
    expect(store.snapshot()).toHaveLength(2);
  });
});

describe('WorkerAppDataStore — remove', () => {
  let store: WorkerAppDataStore;
  beforeEach(() => {
    store = new WorkerAppDataStore();
    store.hydrate([makeRow('a', 'positions')]);
  });

  it('removes by configId and fires remove with the prior row', () => {
    const listener = vi.fn();
    store.subscribe(listener);
    const removed = store.remove('a');
    expect(removed).toMatchObject({ configId: 'a', name: 'positions' });
    expect(store.snapshot()).toEqual([]);
    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith('remove', expect.objectContaining({ configId: 'a' }));
  });

  it('returns null and does not fire when configId is unknown', () => {
    const listener = vi.fn();
    store.subscribe(listener);
    const removed = store.remove('unknown');
    expect(removed).toBeNull();
    expect(listener).not.toHaveBeenCalled();
  });

  it('preserves a sibling row that still claims the same name', () => {
    // Two rows ended up sharing a name (the earlier scenario);
    // removing the OLD one should not blow away the new one's
    // byName entry.
    store.upsert(makeRow('b', 'positions', { tag: 'newer' }));
    store.remove('a');
    expect(store.snapshot()).toHaveLength(1);
    expect(store.snapshot()[0]).toMatchObject({ configId: 'b' });
  });
});

describe('WorkerAppDataStore — listeners', () => {
  it('subscribe returns an unsubscribe', () => {
    const store = new WorkerAppDataStore();
    const listener = vi.fn();
    const off = store.subscribe(listener);
    store.upsert(makeRow('a', 'positions'));
    off();
    store.upsert(makeRow('b', 'trades'));
    expect(listener).toHaveBeenCalledOnce();
  });

  it('a throwing listener does not break the broadcast', () => {
    const store = new WorkerAppDataStore();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const a = vi.fn(() => { throw new Error('boom'); });
    const b = vi.fn();
    store.subscribe(a);
    store.subscribe(b);
    store.upsert(makeRow('row1', 'positions'));
    expect(a).toHaveBeenCalled();
    expect(b).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('listenerCount tracks subscribe/unsubscribe', () => {
    const store = new WorkerAppDataStore();
    expect(store.listenerCount()).toBe(0);
    const off1 = store.subscribe(() => undefined);
    const off2 = store.subscribe(() => undefined);
    expect(store.listenerCount()).toBe(2);
    off1();
    expect(store.listenerCount()).toBe(1);
    off2();
    expect(store.listenerCount()).toBe(0);
  });
});
