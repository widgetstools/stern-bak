/**
 * Carries the container's provider-backed {@link LiveRowSource} down to the
 * summary panel without threading it through every component between them.
 *
 * Optional on purpose. A consumer mounting `MarketsGrid` directly — no
 * `MarketsGridContainer`, no data hub — has no provider to offer, and the
 * panel falls back to reading the grid. The fallback is the OLD behaviour, so
 * nothing regresses for those consumers; they simply don't get the win.
 */
import { createContext, useContext, type ReactNode } from 'react';
import type { LiveRowSource } from '../../../widget/liveRowSource.js';

const LiveRowSourceContext = createContext<LiveRowSource | null>(null);

export function LiveRowSourceProvider({
  source,
  children,
}: {
  source: LiveRowSource | null;
  children: ReactNode;
}) {
  return <LiveRowSourceContext.Provider value={source}>{children}</LiveRowSourceContext.Provider>;
}

/** The provider-backed row feed, or `null` when the grid is the only source. */
export function useLiveRowSource(): LiveRowSource | null {
  return useContext(LiveRowSourceContext);
}
