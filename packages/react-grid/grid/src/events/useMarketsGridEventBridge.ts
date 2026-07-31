import { useEffect } from 'react';
import type { AppDataLookup, ApiEventName, PlatformEventMap } from '@wellsfargo-starui/engine';
import type { MarketsGridHandle } from '../widget/types.js';
import { isMarketsGridEventId, type MarketsGridEventId } from './marketsGridEventCatalog.js';
import type {
  MarketsGridContainerEventBus,
  MarketsGridContainerEventMap,
} from './containerEventBus.js';
import type {
  MarketsGridEventContext,
  MarketsGridEventHandlerRegistry,
} from './marketsGridEventHandlers.js';

const AG_GRID_EVENT_MAP: Partial<Record<MarketsGridEventId, ApiEventName>> = {
  'grid:firstDataRendered': 'firstDataRendered',
  'grid:rowDataUpdated': 'rowDataUpdated',
  'grid:cellClicked': 'cellClicked',
  'grid:cellValueChanged': 'cellValueChanged',
  'grid:filterChanged': 'filterChanged',
};

const PLATFORM_EVENT_IDS: MarketsGridEventId[] = [
  'grid:ready',
  'grid:destroyed',
  'profile:loaded',
  'profile:saved',
  'profile:deleted',
];

const CONTAINER_EVENT_IDS: MarketsGridEventId[] = [
  'provider:status',
  'provider:switched',
  'provider:dataStale',
  'toolbar:dateChanged',
];

export interface UseMarketsGridEventBridgeOpts {
  handle: MarketsGridHandle | null;
  gridId: string;
  instanceId?: string;
  appId?: string;
  userId?: string;
  appData: AppDataLookup;
  eventBindings: Record<string, string[]>;
  handlers?: MarketsGridEventHandlerRegistry;
  containerBus: MarketsGridContainerEventBus;
}

async function invokeHandlers(
  handlerIds: string[],
  registry: MarketsGridEventHandlerRegistry,
  payload: unknown,
  ctx: MarketsGridEventContext,
): Promise<void> {
  for (const id of handlerIds) {
    const fn = registry[id];
    if (!fn) continue;
    try {
      await fn(payload, ctx);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[@wellsfargo-starui/grid eventBridge] handler "${id}" failed`, err);
    }
  }
}

export function useMarketsGridEventBridge(opts: UseMarketsGridEventBridgeOpts): void {
  const {
    handle,
    gridId,
    instanceId,
    appId,
    userId,
    appData,
    eventBindings,
    handlers,
    containerBus,
  } = opts;

  useEffect(() => {
    if (!handle || !handlers) return;

    const ctx: MarketsGridEventContext = {
      gridId,
      instanceId,
      appId,
      userId,
      handle,
      appData,
    };

    const disposers: Array<() => void> = [];

    for (const [rawEventId, handlerIds] of Object.entries(eventBindings)) {
      if (!isMarketsGridEventId(rawEventId) || handlerIds.length === 0) continue;
      const eventId = rawEventId;

      if (PLATFORM_EVENT_IDS.includes(eventId)) {
        const platformEvent = eventId as keyof PlatformEventMap;
        disposers.push(
          handle.platform.events.on(platformEvent, (payload) => {
            void invokeHandlers(handlerIds, handlers, payload, ctx);
          }),
        );
        continue;
      }

      const agEvent = AG_GRID_EVENT_MAP[eventId];
      if (agEvent) {
        disposers.push(
          handle.platform.api.on(agEvent, () => {
            void invokeHandlers(handlerIds, handlers, {}, ctx);
          }),
        );
        continue;
      }

      if (CONTAINER_EVENT_IDS.includes(eventId)) {
        disposers.push(
          containerBus.on(eventId as keyof MarketsGridContainerEventMap, (payload) => {
            void invokeHandlers(handlerIds, handlers, payload, ctx);
          }),
        );
      }
    }

    return () => {
      for (const off of disposers) off();
    };
  }, [handle, gridId, instanceId, appId, userId, appData, eventBindings, handlers, containerBus]);
}
