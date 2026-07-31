import type { GridHostContext, StoragePort, DataPort } from '@wellsfargo-starui/host';
import type { AppDataLookup, StorageAdapter } from '@wellsfargo-starui/engine';

/**
 * Bridge GridHostContext.storage (StoragePort) to engine StorageAdapter.
 * Shapes are intentionally aligned — pass-through with explicit typing.
 */
export function storagePortAsAdapter(port: StoragePort): StorageAdapter {
  return port as unknown as StorageAdapter;
}

/** Wrap a host DataPort as the engine's AppDataLookup object shape. */
export function dataPortAsAppDataLookup(data: DataPort): AppDataLookup {
  return {
    get(name: string, key: string) {
      return data.getSnapshot()?.lookup(name, key);
    },
    subscribe(fn: () => void) {
      return data.subscribe(() => fn());
    },
  };
}

export interface ResolvedHostProps {
  appId?: string;
  userId?: string;
  instanceId?: string;
  storageAdapter?: StorageAdapter;
  appData?: AppDataLookup;
}

/**
 * Merge explicit MarketsGrid props with an optional GridHostContext.
 * Explicit props win over host-derived defaults.
 */
export function resolveMarketsGridHost(
  host: GridHostContext | undefined,
  props: {
    appId?: string;
    userId?: string;
    instanceId?: string;
    gridId: string;
    storageAdapter?: StorageAdapter;
    storageFromFactory?: StorageAdapter;
    appData?: AppDataLookup;
  },
): ResolvedHostProps {
  const identity = host?.runtime.resolveIdentity();
  const effectiveInstanceId = props.instanceId ?? identity?.instanceId ?? props.gridId;

  return {
    appId: props.appId ?? identity?.appId,
    userId: props.userId ?? identity?.userId,
    instanceId: effectiveInstanceId,
    storageAdapter:
      props.storageFromFactory ??
      props.storageAdapter ??
      (host ? storagePortAsAdapter(host.storage) : undefined),
    appData:
      props.appData ??
      (host?.data ? dataPortAsAppDataLookup(host.data) : undefined),
  };
}
