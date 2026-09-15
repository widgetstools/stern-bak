/**
 * AppDataStore → the `AppDataLookup` shape the grid's cell editors read.
 *
 * The two are deliberately different: the store is a list of named rows, each
 * a flat `values` bag, while a `{{name.key}}` binding needs to ask "what
 * providers are there" and "what keys does this one have" without walking the
 * list itself. This is the adapter between them.
 *
 * It lives beside {@link BlotterHost} rather than inside it because it is the
 * one piece of that file with behaviour worth asserting on its own — an
 * unknown provider name has to answer with no keys rather than throw, since
 * bindings are typed by hand and outlive the provider they name.
 */
import { useMemo } from 'react';
import type { AppDataLookup } from '@wellsfargo-starui/core';

export interface AppDataStoreLike {
  get(name: string, key: string): unknown;
  list(): readonly { readonly name: string; readonly values: Record<string, unknown> }[];
  subscribe(fn: () => void): () => void;
  set(name: string, key: string, value: unknown): unknown;
}

/** The lookup for one store. Stable while the store is. */
export function useAppDataLookup(store: AppDataStoreLike): AppDataLookup {
  return useMemo<AppDataLookup>(() => createAppDataLookup(store), [store]);
}

export function createAppDataLookup(store: AppDataStoreLike): AppDataLookup {
  return {
    get: (name, key) => store.get(name, key),
    listProviders: () => store.list().map((row) => row.name),
    keysOf: (name) => {
      const row = store.list().find((r) => r.name === name);
      return row ? Object.keys(row.values) : [];
    },
    subscribe: (fn) => store.subscribe(fn),
    // Fire-and-forget: a binding edit must not make the cell editor await a write.
    set: (name, key, value) => { void store.set(name, key, value); },
  };
}

/** Host fallback when the consumer passes no `onError`. */
export function defaultOnError(err: Error): void {
  console.error('[BlotterHost]', err);
}
