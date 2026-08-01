import { describe, expect, it } from 'vitest';
import { createPreviousValuesStore } from './previousValues.js';

describe('createPreviousValuesStore', () => {
  it('get/set round-trips per row and column', () => {
    const store = createPreviousValuesStore();
    expect(store.get('r1', 'price')).toBeUndefined();
    store.set('r1', 'price', 100);
    expect(store.get('r1', 'price')).toBe(100);
    store.set('r1', 'qty', 5);
    expect(store.get('r1', 'qty')).toBe(5);
  });

  it('deleteRow drops all columns for a row', () => {
    const store = createPreviousValuesStore();
    store.set('r1', 'price', 1);
    store.set('r1', 'qty', 2);
    store.deleteRow('r1');
    expect(store.get('r1', 'price')).toBeUndefined();
    expect(store.get('r1', 'qty')).toBeUndefined();
  });

  it('clear removes everything', () => {
    const store = createPreviousValuesStore();
    store.set('r1', 'price', 1);
    store.set('r2', 'price', 2);
    store.clear();
    expect(store.get('r1', 'price')).toBeUndefined();
    expect(store.get('r2', 'price')).toBeUndefined();
  });
});
