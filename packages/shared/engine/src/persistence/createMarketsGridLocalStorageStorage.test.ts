import { describe, expect, it } from 'vitest';
import {
  createMarketsGridLocalStorageStorage,
  isMarketsGridLocalStorageStorageFactory,
} from './createMarketsGridLocalStorageStorage';
import { LocalStorageBundleAdapter } from './LocalStorageBundleAdapter';

describe('createMarketsGridLocalStorageStorage', () => {
  it('creates a branded factory that yields LocalStorageBundleAdapter instances', () => {
    const factory = createMarketsGridLocalStorageStorage();
    expect(isMarketsGridLocalStorageStorageFactory(factory)).toBe(true);
    expect(isMarketsGridLocalStorageStorageFactory(() => null as never)).toBe(false);

    const adapter = factory({ gridId: 'grid-a', instanceId: 'ignored' });
    expect(adapter).toBeInstanceOf(LocalStorageBundleAdapter);
  });
});
