import { createStore, type StoreApi } from 'zustand/vanilla';
import type { AnyModule, Store } from '../platform/types';

interface Shape {
  moduleStates: Record<string, unknown>;
}

export interface CreateStoreOptions {
  gridId: string;
  modules: readonly AnyModule[];
}

/**
 * Framework-agnostic pub-sub store backing every module's state.
 *
 * `setModuleState` returns the SAME outer object reference when the updater
 * returns the same slice reference — that's what lets the PipelineRunner's
 * cache short-circuit correctly, and it's what lets React's
 * useSyncExternalStore skip re-renders.
 */
export function createGridStore(opts: CreateStoreOptions): Store {
  const initial: Record<string, unknown> = {};
  for (const m of opts.modules) initial[m.id] = m.getInitialState();

  const inner: StoreApi<Shape> = createStore(() => ({ moduleStates: initial }));

  const getModuleState = <T,>(moduleId: string): T =>
    inner.getState().moduleStates[moduleId] as T;

  const setModuleState = <T,>(moduleId: string, updater: (prev: T) => T): void => {
    inner.setState((s) => {
      const prev = s.moduleStates[moduleId] as T;
      const next = updater(prev);
      if (next === prev) return s;
      return { moduleStates: { ...s.moduleStates, [moduleId]: next } };
    });
  };

  const replaceModuleState = <T,>(moduleId: string, value: T): void => {
    inner.setState((s) => ({
      moduleStates: { ...s.moduleStates, [moduleId]: value },
    }));
  };

  return {
    gridId: opts.gridId,
    getModuleState,
    setModuleState,
    replaceModuleState,
    getAllModuleStates: () => inner.getState().moduleStates,
    subscribe: (listener) => inner.subscribe(listener),
    subscribeToModule: <T,>(
      moduleId: string,
      listener: (state: T, prev: T) => void,
    ): (() => void) => {
      let prev = inner.getState().moduleStates[moduleId] as T;
      return inner.subscribe((state) => {
        const next = state.moduleStates[moduleId] as T;
        if (next === prev) return;
        const old = prev;
        prev = next;
        listener(next, old);
      });
    },
  };
}
