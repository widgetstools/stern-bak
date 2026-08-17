/**
 * `AppDataStore` → `AppDataLookup` adapter, shared by both grid containers.
 *
 * Plumbed into MarketsGrid as the `appData` prop so column-customization's
 * cell-editor `valuesSource` (`{{providerName.key}}`) bindings resolve at
 * edit time, and so `useMarketsGridEventBridge` can hand handlers the same
 * lookup. Stable across re-renders unless the underlying store ref flips
 * (typically only on a user-id swap).
 *
 * Extracted from {@link MarketsGridContainer} when the SSRM container
 * adopted the same surface — one adapter, two containers, so a change to
 * what `appData` means cannot land on one and not the other.
 */
import { useMemo } from 'react';
import type { AppDataLookup } from '@wellsfargo-starui/core';
import { useAppDataStore } from '@wellsfargo-starui/react/data/runtime';

export function useAppDataLookup(): AppDataLookup {
  const appData = useAppDataStore();
  return useMemo<AppDataLookup>(() => ({
    get: (name, key) => appData.store.get(name, key),
    listProviders: () => appData.store.list().map((row) => row.name),
    keysOf: (name) => {
      const row = appData.store.list().find((r) => r.name === name);
      return row ? Object.keys(row.values) : [];
    },
    subscribe: (fn) => appData.store.subscribe(fn),
    set: (name: string, key: string, value: unknown) => {
      void appData.store.set(name, key, value);
    },
  }), [appData.store]);
}
