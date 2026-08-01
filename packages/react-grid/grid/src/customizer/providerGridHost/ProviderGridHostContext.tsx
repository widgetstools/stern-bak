import { createContext, useContext, type ReactNode } from 'react';
import type { DataProviderConfig } from '@wellsfargo-starui/types/shared';

export type ProviderGridHostMode = 'live' | 'historical';

/**
 * Runtime data-provider controls supplied by {@link MarketsGridContainer}.
 * Surfaced in the grid customizer → Custom Settings panel.
 */
export interface ProviderGridHostApi {
  /** False when the grid is not hosted by MarketsGridContainer. */
  available: boolean;
  liveProviders: readonly DataProviderConfig[];
  historicalProviders: readonly DataProviderConfig[];
  liveProviderId: string | null;
  historicalProviderId: string | null;
  mode: ProviderGridHostMode;
  asOfDate: string | null;
  onLiveChange(id: string | null): void;
  onHistoricalChange(id: string | null): void;
  onModeChange(mode: ProviderGridHostMode): void;
  onAsOfDateChange(date: string | null): void;
  onRefreshView(): void;
  onReloadFromSource(): void;
  onEditProvider(providerId: string): void;
}

const ProviderGridHostContext = createContext<ProviderGridHostApi | null>(null);

export function ProviderGridHostProvider({
  value,
  children,
}: {
  value: ProviderGridHostApi | null;
  children: ReactNode;
}): ReactNode {
  return (
    <ProviderGridHostContext.Provider value={value}>
      {children}
    </ProviderGridHostContext.Provider>
  );
}

/** Returns host API when MarketsGridContainer wired `providerGridHost`. */
export function useProviderGridHost(): ProviderGridHostApi | null {
  return useContext(ProviderGridHostContext);
}
