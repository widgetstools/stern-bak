import type {
  ProviderDataStaleEventPayload,
  ProviderStatusEventPayload,
  ProviderSwitchedEventPayload,
  ToolbarDateChangedEventPayload,
} from './marketsGridEventHandlers.js';

export interface MarketsGridContainerEventMap {
  'provider:status': ProviderStatusEventPayload;
  'provider:switched': ProviderSwitchedEventPayload;
  'provider:dataStale': ProviderDataStaleEventPayload;
  'toolbar:dateChanged': ToolbarDateChangedEventPayload;
}

export interface MarketsGridContainerEventBus {
  emit<K extends keyof MarketsGridContainerEventMap>(
    event: K,
    payload: MarketsGridContainerEventMap[K],
  ): void;
  on<K extends keyof MarketsGridContainerEventMap>(
    event: K,
    handler: (payload: MarketsGridContainerEventMap[K]) => void,
  ): () => void;
}

export function createMarketsGridContainerEventBus(): MarketsGridContainerEventBus {
  const listeners = new Map<string, Set<(payload: unknown) => void>>();

  return {
    emit(event, payload) {
      const set = listeners.get(event);
      if (!set) return;
      for (const fn of set) fn(payload);
    },
    on(event, handler) {
      let set = listeners.get(event);
      if (!set) {
        set = new Set();
        listeners.set(event, set);
      }
      set.add(handler as (payload: unknown) => void);
      return () => {
        set?.delete(handler as (payload: unknown) => void);
      };
    },
  };
}
