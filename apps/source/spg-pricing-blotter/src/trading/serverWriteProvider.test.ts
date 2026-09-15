import { describe, expect, it, vi } from 'vitest';
import type { ISsrmDataProvider } from '@wellsfargo-starui/data';
import { CellStateStore } from './cellStates';
import { WRITABLE_FIELDS, withServerWrites } from './serverWriteProvider';

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
  it('skips rows with no cusip and rows whose edits are all read-only', () => {
    // A grouped/pinned row has no cusip, and a derived column (Mkt Value,
    // Px Chg %) is computed server-side — posting either would have the
    // server reject the whole row.
    const inner = fakeInner();
    const store = new CellStateStore();
    const post = vi.fn().mockResolvedValue({ results: [] });
    const provider = withServerWrites(inner, store, { post, onError: () => {} });

    return provider.applyEdits!({
      rows: [
        { cusip: '', price: 1 },
        { price: 2 },
        { cusip: 'C1', marketValue: 3 },
      ],
      editedColumns: [['price'], ['price'], ['marketValue']],
    }).then(flush).then(() => {
      expect(post).not.toHaveBeenCalled();
      expect(store.counts()).toEqual({ staged: 0, pending: 0, failed: 0 });
    });
  });

  it('treats every key of the row as edited when the grid names no columns', () => {
    // Undo/redo and some bulk paths hand back whole rows with no
    // `editedColumns`; the writable set is then the only filter there is.
    const inner = fakeInner();
    const store = new CellStateStore();
    const post = vi.fn().mockResolvedValue({ results: [{ cusip: 'C1', ok: true }] });
    const provider = withServerWrites(inner, store, { post });

    return provider.applyEdits!({ rows: [{ cusip: 'C1', price: 5, dealName: 'X' }] })
      .then(flush)
      .then(() => {
        expect(post).toHaveBeenCalledWith([{ cusip: 'C1', fields: { price: 5 } }]);
      });
  });

  it('turns a row the server never mentions red rather than assuming success', async () => {
    const inner = fakeInner();
    const store = new CellStateStore();
    // A truncated results array is not an ack; silently clearing the border
    // would tell the trader a price landed that never did.
    const post = vi.fn().mockResolvedValue({ results: [] });
    const onError = vi.fn();
    const provider = withServerWrites(inner, store, { post, onError });

    await provider.applyEdits!({ rows: [{ cusip: 'C1', price: 1 }], editedColumns: [['price']] });
    await flush();

    expect(store.stateOf('C1', 'price')).toBe('failed');
    // Nothing to quote, so nothing is reported — the red border is the signal.
    expect(onError).not.toHaveBeenCalled();
  });

  it('reports the server\'s own reason for a refusal', async () => {
    const inner = fakeInner();
    const store = new CellStateStore();
    const post = vi.fn().mockResolvedValue({
      results: [{ cusip: 'C1', ok: false, error: 'price out of band' }],
    });
    const onError = vi.fn();
    const provider = withServerWrites(inner, store, { post, onError });

    await provider.applyEdits!({ rows: [{ cusip: 'C1', price: 1 }], editedColumns: [['price']] });
    await flush();

    expect(onError).toHaveBeenCalledWith('C1: price out of band');
  });

  it('warns to the console when the host supplies no error sink', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const inner = fakeInner();
    const store = new CellStateStore();
    const post = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const provider = withServerWrites(inner, store, { post });

    await provider.applyEdits!({ rows: [{ cusip: 'C1', price: 1 }], editedColumns: [['price']] });
    await flush();

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[spg] server write failed: ECONNREFUSED'));
    warn.mockRestore();
  });

  it('reports a non-Error rejection as its string form', async () => {
    const inner = fakeInner();
    const store = new CellStateStore();
    const post = vi.fn().mockRejectedValue('gateway timeout');
    const onError = vi.fn();
    const provider = withServerWrites(inner, store, { post, onError });

    await provider.applyEdits!({ rows: [{ cusip: 'C1', price: 1 }], editedColumns: [['price']] });
    await flush();

    expect(onError).toHaveBeenCalledWith('server write failed: gateway timeout');
  });

  it('stages nothing and touches no engine when the server knows none of the cusips', async () => {
    const inner = fakeInner();
    const store = new CellStateStore();
    const lookup = vi.fn().mockResolvedValue({ found: [], missing: ['NOPE'] });
    const provider = withServerWrites(inner, store, { lookup, post: vi.fn() });

    await provider.stage([{ cusip: 'NOPE', fields: { price: 1 } }]);

    expect(inner.applyEdits).not.toHaveBeenCalled();
    expect(store.counts().staged).toBe(0);
  });

  it('saveStaged and discardStaged do nothing when nothing is staged', async () => {
    const inner = fakeInner();
    const store = new CellStateStore();
    const post = vi.fn();
    const lookup = vi.fn();
    const provider = withServerWrites(inner, store, { lookup, post });

    await provider.saveStaged();
    await provider.discardStaged();

    expect(post).not.toHaveBeenCalled();
    expect(lookup).not.toHaveBeenCalled();
  });

  it('discardStaged still clears the amber cells when the server has no row to restore', async () => {
    const inner = fakeInner();
    const store = new CellStateStore();
    const lookup = vi.fn()
      .mockResolvedValueOnce({ found: [{ cusip: 'C1', price: 100 }], missing: [] })
      .mockResolvedValueOnce({ found: [], missing: ['C1'] });
    const provider = withServerWrites(inner, store, { lookup, post: vi.fn() });

    await provider.stage([{ cusip: 'C1', fields: { price: 102 } }]);
    inner.applyEdits.mockClear();

    await provider.discardStaged();

    expect(inner.applyEdits).not.toHaveBeenCalled();
    expect(store.counts().staged).toBe(0);
  });

  it('restores a row it has no staged record for without naming edited columns', async () => {
    const inner = fakeInner();
    const store = new CellStateStore();
    const lookup = vi.fn()
      .mockResolvedValueOnce({ found: [{ cusip: 'C1', price: 100 }], missing: [] })
      .mockResolvedValueOnce({ found: [{ cusip: 'C1', price: 100 }, { cusip: 'C2', price: 50 }], missing: [] });
    const provider = withServerWrites(inner, store, { lookup, post: vi.fn() });

    await provider.stage([{ cusip: 'C1', fields: { price: 102 } }]);
    inner.applyEdits.mockClear();

    await provider.discardStaged();

    expect(inner.applyEdits).toHaveBeenCalledWith({
      rows: [{ cusip: 'C1', price: 100 }, { cusip: 'C2', price: 50 }],
      editedColumns: [['price'], []],
    });
  });

  it('delegates everything it does not override to the inner provider', () => {
    // `Object.create(inner)` is load-bearing: the grid calls getRows,
    // watchGroups and the tick subscriptions straight through.
    const inner = fakeInner();
    (inner as unknown as { id: string }).id = 'inner-provider';
    const provider = withServerWrites(inner, new CellStateStore());

    expect(provider.id).toBe('inner-provider');
    expect(provider.onSsrmTick).toBe(inner.onSsrmTick);
  });
});

describe('WRITABLE_FIELDS', () => {
  it('mirrors the server\'s writable set and excludes every derived column', () => {
    expect([...WRITABLE_FIELDS].sort()).toEqual(
      ['coupon', 'pnl', 'price', 'priorPrice', 'spreadDm', 'trader', 'yieldToMaturity'],
    );
    for (const derived of ['marketValue', 'priceChangePct', 'currentFace', 'lastUpdate']) {
      expect(WRITABLE_FIELDS.has(derived)).toBe(false);
    }
  });
});
