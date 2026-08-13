/**
 * Bridges the SSRM provider to the filters-toolbar count path.
 *
 * `useFilterCounts` lives deep in MarketsGrid chrome with no knowledge of
 * the row model; under SSRM its `forEachNode` scan sees only loaded blocks.
 * MarketsGrid provides this context whenever `ssrm` is active so the pills
 * can count against the whole worker cache instead (`computeSsrmFilterCounts`).
 * `null` (the default) means CSRM — the client-side scan stays in charge.
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { MarketsGridSsrmProps } from './types';
import type { SsrmFilterCountsDeps } from './ssrmFilterCounts.js';

const SsrmFilterCountsContext = createContext<SsrmFilterCountsDeps | null>(null);

export function SsrmFilterCountsProvider({
  ssrm,
  children,
}: {
  ssrm: MarketsGridSsrmProps | undefined;
  children: ReactNode;
}) {
  const value = useMemo<SsrmFilterCountsDeps | null>(() => {
    if (!ssrm) return null;
    return {
      getRows: (req) =>
        ssrm.provider.getRows(req as Parameters<typeof ssrm.provider.getRows>[0]),
      getQuickFilterText: ssrm.getQuickFilterText,
    };
  }, [ssrm]);
  return (
    <SsrmFilterCountsContext.Provider value={value}>
      {children}
    </SsrmFilterCountsContext.Provider>
  );
}

export function useSsrmFilterCountsDeps(): SsrmFilterCountsDeps | null {
  return useContext(SsrmFilterCountsContext);
}
