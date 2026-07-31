import { createContext, useContext, type ReactNode } from 'react';
import type { MarketsGridEventCatalogEntry } from '../../events/marketsGridEventCatalog.js';
import type { MarketsGridHandlerMeta } from '../../events/marketsGridEventHandlers.js';

/** eventId → at most one handler id (stored as single-element arrays in gridLevelData). */
export type GridEventBindingsMap = Record<string, string[]>;

export interface GridEventBindingsHostApi {
  available: boolean;
  bindings: GridEventBindingsMap;
  catalog: readonly MarketsGridEventCatalogEntry[];
  handlerIds: readonly string[];
  handlerMeta?: MarketsGridHandlerMeta;
  /** Replace the full bindings map (advanced / programmatic use). */
  setBindings(next: GridEventBindingsMap): void;
  /** One handler per event — pass `null` to clear. */
  setEventHandler(eventId: string, handlerId: string | null): void;
}

const GridEventBindingsHostContext = createContext<GridEventBindingsHostApi | null>(null);

export function GridEventBindingsHostProvider({
  value,
  children,
}: {
  value: GridEventBindingsHostApi | null;
  children: ReactNode;
}): ReactNode {
  return (
    <GridEventBindingsHostContext.Provider value={value}>
      {children}
    </GridEventBindingsHostContext.Provider>
  );
}

export function useGridEventBindingsHost(): GridEventBindingsHostApi | null {
  return useContext(GridEventBindingsHostContext);
}

export function boundHandlerForEvent(
  bindings: GridEventBindingsMap,
  eventId: string,
): string | null {
  const ids = bindings[eventId];
  return ids?.[0] ?? null;
}
