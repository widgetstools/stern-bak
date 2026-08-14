import {
  MemoryAdapter,
  createMarketsGridLocalStorageStorage,
  type StorageAdapter,
  type StorageAdapterFactory,
} from '@wellsfargo-starui/core';
import { createGridHostContext, type GridHostContext } from './GridHostContext.js';
import type { DataPort } from './DataPort.js';
import type { RuntimePort } from './RuntimePort.js';
import type { StoragePort } from './StoragePort.js';

export interface GridHostScope {
  readonly gridId: string;
  readonly instanceId?: string;
}

function adapterAsStoragePort(adapter: StorageAdapter): StoragePort {
  return adapter as unknown as StoragePort;
}

export function storageFactoryForPersistence(
  persistence: 'memory' | 'localStorage' | 'config',
  configStorageFactory?: StorageAdapterFactory,
): StorageAdapterFactory {
  if (persistence === 'config') {
    if (!configStorageFactory) {
      throw new Error(
        '[StarGridApp] persistence="config" requires an initialized ConfigManager ' +
          'via createConfigServiceStorage().',
      );
    }
    return configStorageFactory;
  }
  if (persistence === 'localStorage') {
    return createMarketsGridLocalStorageStorage();
  }
  return () => new MemoryAdapter();
}

export function buildGridHostContext(
  runtime: RuntimePort,
  storageFactory: StorageAdapterFactory,
  scope: GridHostScope,
  opts?: { data?: DataPort },
): GridHostContext {
  const identity = runtime.resolveIdentity();
  const instanceId = scope.instanceId ?? scope.gridId;
  const storage = adapterAsStoragePort(
    storageFactory({
      gridId: scope.gridId,
      instanceId,
      appId: identity.appId,
      userId: identity.userId,
    }),
  );
  return createGridHostContext({
    runtime,
    storage,
    ...(opts?.data !== undefined ? { data: opts.data } : {}),
  });
}
