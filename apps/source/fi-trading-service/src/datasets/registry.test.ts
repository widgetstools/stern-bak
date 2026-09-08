import { describe, expect, it } from 'vitest';

import { DatasetRegistry } from './registry.js';
import { StubRowSource } from './StubRowSource.js';

describe('DatasetRegistry', () => {
  it('resolves a registered live dataset', () => {
    const registry = new DatasetRegistry();
    const book = new StubRowSource({ rowCount: 5 });
    registry.register(book);
    expect(registry.has('positions')).toBe(true);
    expect(registry.resolve({ dataset: 'positions', clientId: 'a', asOfDate: null })).toBe(book);
  });

  it('returns null for an unregistered dataset', () => {
    const registry = new DatasetRegistry();
    expect(registry.resolve({ dataset: 'trades', clientId: 'a', asOfDate: null })).toBeNull();
    expect(registry.has('trades')).toBe(false);
  });

  it('refuses a historical request rather than passing off live rows as history', () => {
    const registry = new DatasetRegistry();
    registry.register(new StubRowSource({ rowCount: 5 }));
    expect(
      registry.resolve({ dataset: 'positions', clientId: 'a', asOfDate: '2026-03-15' }),
    ).toBeNull();
  });

  it('lists what it holds and replaces on re-register', () => {
    const registry = new DatasetRegistry();
    registry.register(new StubRowSource({ rowCount: 5 }));
    const replacement = new StubRowSource({ rowCount: 9 });
    registry.register(replacement);
    expect(registry.sources()).toEqual([replacement]);
  });
});
