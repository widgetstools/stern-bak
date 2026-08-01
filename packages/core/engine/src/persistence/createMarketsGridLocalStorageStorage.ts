import { LocalStorageBundleAdapter } from './LocalStorageBundleAdapter.js';
import type { StorageAdapter, StorageAdapterFactory, StorageAdapterFactoryOpts } from './StorageAdapter.js';

const MARKETS_GRID_LOCAL_STORAGE_FACTORY_BRAND = Symbol.for(
  'starui.marketsGrid.localStorageBundleFactory',
);

export function isMarketsGridLocalStorageStorageFactory(
  storage: StorageAdapterFactory | undefined,
): boolean {
  return (
    typeof storage === 'function' &&
    MARKETS_GRID_LOCAL_STORAGE_FACTORY_BRAND in storage &&
    (storage as unknown as Record<symbol, boolean>)[MARKETS_GRID_LOCAL_STORAGE_FACTORY_BRAND] === true
  );
}

/**
 * Factory for `<MarketsGrid storage={...} />` that persists the full profile
 * set and grid-level data under one localStorage key per grid, without
 * ConfigService. Requires neither `appId` nor `userId`.
 */
export function createMarketsGridLocalStorageStorage(): StorageAdapterFactory {
  function factory(opts: StorageAdapterFactoryOpts): StorageAdapter {
    const gridId = opts.gridId ?? opts.instanceId;
    return new LocalStorageBundleAdapter(gridId);
  }
  (factory as unknown as Record<symbol, boolean>)[MARKETS_GRID_LOCAL_STORAGE_FACTORY_BRAND] = true;
  return factory as StorageAdapterFactory;
}

export type { StorageAdapterFactory, StorageAdapterFactoryOpts };
