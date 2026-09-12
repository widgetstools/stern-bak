import { describe, expect, it, vi } from 'vitest';
import type { ISsrmDataProvider } from '@wellsfargo-starui/data';
import { CellStateStore } from './cellStates';
import { withServerWrites } from './serverWriteProvider';

function fakeInner() {
  return {
    applyEdits: vi.fn().mockResolvedValue({ applied: 1 }),
    onSsrmTick: vi.fn(),
  } as unknown as ISsrmDataProvider & { applyEdits: ReturnType<typeof vi.fn> };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('withServerWrites', () => {
  it('marks edited cells pending, posts ONLY writable edited fields, clears on ack', async () => {
    const inner = fakeInner();
    const store = new CellStateStore();
    const post = vi.fn().mockResolvedValue({ results: [{ cusip: 'C1', ok: true }] });
    const provider = withServerWrites(inner, store, { post });

    await provider.applyEdits!({
      rows: [{ cusip: 'C1', price: 99.5, marketValue: 123, dealName: 'X' }],
      editedColumns: [['price', 'marketValue']],
    });
    // Pending was visible synchronously for the edited+writable cell only.
    expect(inner.applyEdits).toHaveBeenCalledOnce();
    await flush();
    expect(post).toHaveBeenCalledWith([{ cusip: 'C1', fields: { price: 99.5 } }]);
    // Ack clears the pending border.
    expect(store.stateOf('C1', 'price')).toBeUndefined();
  });

  it('turns refused rows red without stranding the rest of the batch', async () => {
    const inner = fakeInner();
    const store = new CellStateStore();
    const post = vi.fn().mockResolvedValue({
      results: [
        { cusip: 'GOOD1', ok: true },
        { cusip: 'BAD01', ok: false, error: 'unknown cusip' },
      ],
    });
    const provider = withServerWrites(inner, store, { post, onError: () => {} });

    await provider.applyEdits!({
      rows: [
        { cusip: 'GOOD1', price: 100 },
        { cusip: 'BAD01', price: 90 },
      ],
      editedColumns: [['price'], ['price']],
    });
    await flush();
    expect(store.stateOf('GOOD1', 'price')).toBeUndefined();
    expect(store.stateOf('BAD01', 'price')).toBe('failed');
  });

  it('a network failure marks every carried cell failed', async () => {
    const inner = fakeInner();
    const store = new CellStateStore();
    const post = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const provider = withServerWrites(inner, store, { post, onError: () => {} });

    await provider.applyEdits!({ rows: [{ cusip: 'C1', price: 1 }], editedColumns: [['price']] });
    await flush();
    expect(store.stateOf('C1', 'price')).toBe('failed');
  });

  it('stage merges import lines over server rows (whole-row engine upserts) and marks amber', async () => {
    const inner = fakeInner();
    const store = new CellStateStore();
    const lookup = vi.fn().mockResolvedValue({
      found: [{ cusip: 'C1', price: 100, priorPrice: 99, dealName: 'DEAL 1' }],
      missing: ['NOPE'],
    });
    const provider = withServerWrites(inner, store, { lookup, post: vi.fn() });

    await provider.stage([
      { cusip: 'C1', fields: { price: 101.5 } },
      { cusip: 'NOPE', fields: { price: 50 } },
    ]);
    // The engine received the WHOLE server row with the staged price merged
    // in — never a partial row that would null the other columns — and the
    // unknown cusip never reached the engine at all.
    expect(inner.applyEdits).toHaveBeenCalledWith({
      rows: [{ cusip: 'C1', price: 101.5, priorPrice: 99, dealName: 'DEAL 1' }],
      editedColumns: [['price']],
    });
    expect(store.stateOf('C1', 'price')).toBe('staged');
    expect(store.stateOf('NOPE', 'price')).toBeUndefined();
  });

  it('saveStaged promotes staged → pending → cleared through the same POST path', async () => {
    const inner = fakeInner();
    const store = new CellStateStore();
    const lookup = vi.fn().mockResolvedValue({ found: [{ cusip: 'C1', price: 100 }], missing: [] });
    const post = vi.fn().mockResolvedValue({ results: [{ cusip: 'C1', ok: true }] });
    const provider = withServerWrites(inner, store, { lookup, post });

    await provider.stage([{ cusip: 'C1', fields: { price: 102 } }]);
    expect(store.counts().staged).toBe(1);
    await provider.saveStaged();
    expect(post).toHaveBeenCalledWith([{ cusip: 'C1', fields: { price: 102 } }]);
    expect(store.counts()).toEqual({ staged: 0, pending: 0, failed: 0 });
  });

  it('discardStaged restores the server rows and clears the amber cells', async () => {
    const inner = fakeInner();
    const store = new CellStateStore();
    const serverRow = { cusip: 'C1', price: 100, priorPrice: 99 };
    const lookup = vi.fn().mockResolvedValue({ found: [serverRow], missing: [] });
    const provider = withServerWrites(inner, store, { lookup, post: vi.fn() });

    await provider.stage([{ cusip: 'C1', fields: { price: 102 } }]);
    inner.applyEdits.mockClear();
    await provider.discardStaged();
    expect(inner.applyEdits).toHaveBeenCalledWith({
      rows: [serverRow],
      editedColumns: [['price']],
    });
    expect(store.counts().staged).toBe(0);
  });
});
