import { useCallback, useSyncExternalStore } from 'react';
import type { Store } from '@wellsfargo-starui/core';
import { useGridPlatform } from './GridProvider';

/**
 * Typed React binding for one module's slice.
 *
 * Two equivalent signatures:
 *
 *   const [state, setState] = useModuleState<T>('my-module');
 *   const [state, setState] = useModuleState<T>(store, 'my-module');
 *
 * The 2-arg form exists so ported v2 panels can keep their `store` plumbing
 * intact. The store passed in MUST be the same instance `useGridPlatform().store`
 * returns — mismatched stores are a caller bug. Internally we subscribe to the
 * platform's store in both cases, so the `store` arg is advisory only.
 *
 * Uses `useSyncExternalStore` so concurrent rendering never tears.
 */
export function useModuleState<T>(moduleId: string): [T, (updater: (prev: T) => T) => void];
export function useModuleState<T>(store: Store, moduleId: string): [T, (updater: (prev: T) => T) => void];
export function useModuleState<T>(
  ...args: [string] | [Store, string]
): [T, (updater: (prev: T) => T) => void] {
  const moduleId: string = typeof args[0] === 'string' ? args[0] : (args[1] as string);
  const platform = useGridPlatform();
  const store = platform.store;

  const subscribe = useCallback(
    (onChange: () => void) => store.subscribeToModule<T>(moduleId, onChange),
    [store, moduleId],
  );
  const getSnapshot = useCallback(
    () => store.getModuleState<T>(moduleId),
    [store, moduleId],
  );
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const setState = useCallback(
    (updater: (prev: T) => T) => store.setModuleState<T>(moduleId, updater),
    [store, moduleId],
  );

  return [state, setState];
}
