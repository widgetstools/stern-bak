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
  // One adapter instance per grid key — a container + grid pair over the
  // same bundle key share the parse cache instead of racing last-write-wins
  // through two instances (localStorage has no OCC).
  const instances = new Map<string, StorageAdapter>();
  function factory(opts: StorageAdapterFactoryOpts): StorageAdapter {
    const gridId = opts.gridId ?? opts.instanceId;
    let adapter = instances.get(gridId);
    if (!adapter) {
      adapter = new LocalStorageBundleAdapter(gridId);
      instances.set(gridId, adapter);
    }
    return adapter;
  }
  (factory as unknown as Record<symbol, boolean>)[MARKETS_GRID_LOCAL_STORAGE_FACTORY_BRAND] = true;
  return factory as StorageAdapterFactory;
}

export type { StorageAdapterFactory, StorageAdapterFactoryOpts };
