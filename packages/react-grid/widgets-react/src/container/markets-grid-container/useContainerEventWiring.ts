/**
 * The grid-event subsystem, shared by both grid containers.
 *
 * One hook owns the three pieces that only make sense together:
 *
 *   1. `useMarketsGridEventBridge` — binds the persisted event→handler map
 *      onto the platform bus, AG-Grid's api, and the container bus;
 *   2. `GridEventBindingsHostApi` — the Custom Settings UI that edits that
 *      map, plus the two setters it drives;
 *   3. the two emits derivable from container state alone —
 *      `provider:switched` (selection changed after the first load) and
 *      `provider:dataStale`.
 *
 * The bus itself is created by the CALLER and passed in, because both
 * containers emit onto it from callbacks declared long before the stale /
 * selection state this hook needs exists — a bus created here would be in
 * TDZ for those callbacks' dependency arrays.
 *
 * `provider:status` also stays at the call site: the two containers
 * subscribe to different status streams (`useProviderDataWiring`'s snapshot
 * wiring vs the SSRM provider's raw `onStatus`).
 *
 * Extracted from {@link MarketsGridContainer} when the SSRM container
 * adopted the same surface. Splitting it would have meant two copies of the
 * bindings-host memo and two chances for the bridge's dep list to drift.
 */
import { useCallback, useEffect, useMemo, useRef, type Dispatch, type SetStateAction } from 'react';
import type { AppDataLookup } from '@wellsfargo-starui/core';
import {
  MARKETS_GRID_EVENT_CATALOG,
  useMarketsGridEventBridge,
} from '@wellsfargo-starui/grid/core';
import type {
  GridEventBindingsHostApi,
  MarketsGridContainerEventBus,
  MarketsGridEventHandlerRegistry,
  MarketsGridHandle,
  MarketsGridHandlerMeta,
} from '@wellsfargo-starui/grid/core';
import type { ProviderSelection } from './gridLevelState.js';

export interface UseContainerEventWiringParams {
  /** Created once per container (`createMarketsGridContainerEventBus()`). */
  containerEventBus: MarketsGridContainerEventBus;
  handle: MarketsGridHandle | null;
  gridId: string;
  /** Already resolved (`props.instanceId ?? props.gridId`). */
  instanceId?: string;
  appId?: string;
  userId?: string;
  appData: AppDataLookup;
  eventBindings: Record<string, string[]>;
  setEventBindings: Dispatch<SetStateAction<Record<string, string[]>>>;
  /** App registry of handler functions keyed by stable id. */
  gridEventHandlers?: MarketsGridEventHandlerRegistry;
  handlerMeta?: MarketsGridHandlerMeta;
  /** Grid-level provider selection — drives the `provider:switched` emit. */
  selection: ProviderSelection;
  /** False while grid-level data is still loading; gates both emits. */
  loaded: boolean;
  dataStale: boolean;
  dataStaleMessage?: string;
}

export interface ContainerEventWiring {
  gridEventBindingsHost: GridEventBindingsHostApi;
}

/** Custom Settings' event-binding editor over the persisted bindings map. */
function useGridEventBindingsHost(
  eventBindings: Record<string, string[]>,
  setEventBindings: Dispatch<SetStateAction<Record<string, string[]>>>,
  gridEventHandlers: MarketsGridEventHandlerRegistry | undefined,
  handlerMeta: MarketsGridHandlerMeta | undefined,
): GridEventBindingsHostApi {
  const setEventBindingsAll = useCallback((next: Record<string, string[]>) => {
    setEventBindings(next);
  }, [setEventBindings]);

  const setEventHandler = useCallback((eventId: string, handlerId: string | null) => {
    setEventBindings((prev) => {
      const next = { ...prev };
      if (!handlerId) delete next[eventId];
      else next[eventId] = [handlerId];
      return next;
    });
  }, [setEventBindings]);

  return useMemo<GridEventBindingsHostApi>(() => ({
    available: Boolean(gridEventHandlers),
    bindings: eventBindings,
    catalog: MARKETS_GRID_EVENT_CATALOG,
    handlerIds: gridEventHandlers ? Object.keys(gridEventHandlers) : [],
    handlerMeta,
    setBindings: setEventBindingsAll,
    setEventHandler,
  }), [
    gridEventHandlers,
    eventBindings,
    handlerMeta,
    setEventBindingsAll,
    setEventHandler,
  ]);
}

/** The two container events derivable from container state alone. */
function useContainerStateEvents(
  containerEventBus: MarketsGridContainerEventBus,
  selection: ProviderSelection,
  loaded: boolean,
  dataStale: boolean,
  dataStaleMessage: string | undefined,
): void {
  // The first post-load selection is RECORDED, not emitted — restoring a
  // persisted provider is not the user switching provider.
  const prevSelectionRef = useRef<ProviderSelection | null>(null);
  useEffect(() => {
    if (!loaded) return;
    const prev = prevSelectionRef.current;
    if (prev === null) {
      prevSelectionRef.current = selection;
      return;
    }
    if (
      prev.liveProviderId === selection.liveProviderId
      && prev.historicalProviderId === selection.historicalProviderId
      && prev.mode === selection.mode
    ) {
      return;
    }
    prevSelectionRef.current = selection;
    containerEventBus.emit('provider:switched', {
      liveProviderId: selection.liveProviderId,
      historicalProviderId: selection.historicalProviderId,
      mode: selection.mode,
    });
  }, [loaded, selection, containerEventBus]);

  useEffect(() => {
    if (!loaded) return;
    containerEventBus.emit('provider:dataStale', {
      stale: dataStale,
      message: dataStaleMessage,
    });
  }, [loaded, dataStale, dataStaleMessage, containerEventBus]);
}

export function useContainerEventWiring(
  params: UseContainerEventWiringParams,
): ContainerEventWiring {
  const {
    containerEventBus,
    handle,
    gridId,
    instanceId,
    appId,
    userId,
    appData,
    eventBindings,
    setEventBindings,
    gridEventHandlers,
    handlerMeta,
    selection,
    loaded,
    dataStale,
    dataStaleMessage,
  } = params;

  useMarketsGridEventBridge({
    handle,
    gridId,
    instanceId,
    appId,
    userId,
    appData,
    eventBindings,
    handlers: gridEventHandlers,
    containerBus: containerEventBus,
  });

  const gridEventBindingsHost = useGridEventBindingsHost(
    eventBindings,
    setEventBindings,
    gridEventHandlers,
    handlerMeta,
  );

  useContainerStateEvents(containerEventBus, selection, loaded, dataStale, dataStaleMessage);

  return { gridEventBindingsHost };
}
