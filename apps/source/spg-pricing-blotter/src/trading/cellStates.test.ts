import { describe, expect, it, vi } from 'vitest';
import { CellStateStore } from './cellStates';

/**
 * The store is the only thing that knows where a trader's value actually is:
 * amber = typed but not sent, yellow = at the server, red = refused. Getting
 * a transition wrong shows a committed price as still pending (or worse, a
 * refused one as clean), so each transition is asserted on its own.
 */
describe('CellStateStore', () => {
  it('has nothing to say about a cell nobody has written', () => {
    const store = new CellStateStore();
    expect(store.stateOf('C1', 'price')).toBeUndefined();
    expect(store.counts()).toEqual({ staged: 0, pending: 0, failed: 0 });
    expect(store.updates('staged')).toEqual([]);
  });

  it('marks several fields of a row at once', () => {
    const store = new CellStateStore();
    store.mark('C1', { price: 99.5, spreadDm: 240 }, 'staged');
    expect(store.stateOf('C1', 'price')).toBe('staged');
    expect(store.stateOf('C1', 'spreadDm')).toBe('staged');
    expect(store.counts()).toEqual({ staged: 2, pending: 0, failed: 0 });
  });

  it('re-marking a cell replaces its state and value', () => {
    const store = new CellStateStore();
    store.mark('C1', { price: 99.5 }, 'staged');
    store.mark('C1', { price: 100.25 }, 'pending');
    expect(store.stateOf('C1', 'price')).toBe('pending');
    expect(store.updates('pending')).toEqual([{ cusip: 'C1', fields: { price: 100.25 } }]);
    expect(store.counts()).toEqual({ staged: 0, pending: 1, failed: 0 });
  });

  describe('clear', () => {
    it('drops the whole row when no columns are named', () => {
      const store = new CellStateStore();
      store.mark('C1', { price: 1, coupon: 2 }, 'pending');
      store.clear('C1');
      expect(store.counts().pending).toBe(0);
    });

    it('drops only the named columns, keeping the rest of the row', () => {
      const store = new CellStateStore();
      store.mark('C1', { price: 1, coupon: 2 }, 'pending');
      store.clear('C1', ['price']);
      expect(store.stateOf('C1', 'price')).toBeUndefined();
      expect(store.stateOf('C1', 'coupon')).toBe('pending');
    });

    it('forgets the row once its last column goes', () => {
      const store = new CellStateStore();
      store.mark('C1', { price: 1 }, 'pending');
      store.clear('C1', ['price']);
      expect(store.updates('pending')).toEqual([]);
    });

    it('ignores a row it never held', () => {
      const store = new CellStateStore();
      const listener = vi.fn();
      store.subscribe(listener);
      store.clear('nope');
      // No change means no repaint — a 500-row paste must not fan out
      // notifications for rows that were never marked.
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('transition', () => {
    it('flips the named columns and keeps the recorded value', () => {
      const store = new CellStateStore();
      store.mark('C1', { price: 99.5, coupon: 5 }, 'staged');
      store.transition('C1', ['price'], 'pending');
      expect(store.stateOf('C1', 'price')).toBe('pending');
      expect(store.stateOf('C1', 'coupon')).toBe('staged');
      expect(store.updates('pending')).toEqual([{ cusip: 'C1', fields: { price: 99.5 } }]);
    });

    it('ignores columns and rows it does not hold', () => {
      const store = new CellStateStore();
      store.mark('C1', { price: 1 }, 'staged');
      store.transition('C1', ['coupon'], 'pending');
      store.transition('OTHER', ['price'], 'pending');
      expect(store.counts()).toEqual({ staged: 1, pending: 0, failed: 0 });
    });
  });

  describe('updates', () => {
    it('groups by row and returns only cells in the asked-for state', () => {
      const store = new CellStateStore();
      store.mark('C1', { price: 1, coupon: 2 }, 'staged');
      store.mark('C1', { spreadDm: 3 }, 'pending');
      store.mark('C2', { price: 4 }, 'staged');

      expect(store.updates('staged')).toEqual([
        { cusip: 'C1', fields: { price: 1, coupon: 2 } },
        { cusip: 'C2', fields: { price: 4 } },
      ]);
      expect(store.updates('pending')).toEqual([{ cusip: 'C1', fields: { spreadDm: 3 } }]);
      expect(store.updates('failed')).toEqual([]);
    });

    it('omits a row whose cells are all in some other state', () => {
      const store = new CellStateStore();
      store.mark('C1', { price: 1 }, 'pending');
      expect(store.updates('staged')).toEqual([]);
    });
  });

  describe('clearState', () => {
    it('removes every cell in one state and leaves the others', () => {
      const store = new CellStateStore();
      store.mark('C1', { price: 1 }, 'failed');
      store.mark('C1', { coupon: 2 }, 'pending');
      store.mark('C2', { price: 3 }, 'failed');

      store.clearState('failed');

      expect(store.counts()).toEqual({ staged: 0, pending: 1, failed: 0 });
      expect(store.stateOf('C1', 'coupon')).toBe('pending');
      // C2 held nothing but a failed cell, so the row itself is gone.
      expect(store.stateOf('C2', 'price')).toBeUndefined();
    });

    it('is a no-op when nothing is in that state', () => {
      const store = new CellStateStore();
      store.mark('C1', { price: 1 }, 'pending');
      store.clearState('failed');
      expect(store.counts().pending).toBe(1);
    });
  });

  describe('subscribe', () => {
    it('notifies on every mutation', () => {
      const store = new CellStateStore();
      const listener = vi.fn();
      store.subscribe(listener);

      store.mark('C1', { price: 1 }, 'staged');
      store.transition('C1', ['price'], 'pending');
      store.clear('C1');
      store.clearState('failed');

      expect(listener).toHaveBeenCalledTimes(4);
    });

    it('stops notifying after unsubscribe', () => {
      const store = new CellStateStore();
      const listener = vi.fn();
      const off = store.subscribe(listener);
      off();
      store.mark('C1', { price: 1 }, 'staged');
      expect(listener).not.toHaveBeenCalled();
    });

    it('notifies every subscriber', () => {
      const store = new CellStateStore();
      const a = vi.fn();
      const b = vi.fn();
      store.subscribe(a);
      store.subscribe(b);
      store.mark('C1', { price: 1 }, 'staged');
      expect(a).toHaveBeenCalledTimes(1);
      expect(b).toHaveBeenCalledTimes(1);
    });
  });
});
