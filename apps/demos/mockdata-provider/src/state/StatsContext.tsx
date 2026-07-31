import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';

export type StatsSource = 'direct' | 'dataservices';

export interface SourceStats {
  rowCount: number;
  ticksPerSec: number;
  lastTickAt: number | null;
}

interface Ring {
  ts: number[];
  lastRowCount: number;
  lastTickAt: number | null;
}

interface Ctx {
  recordTick: (source: StatsSource, ts: number, rowCount: number) => void;
  read: (source: StatsSource) => SourceStats;
}

const StatsCtx = createContext<Ctx | null>(null);
const WINDOW_MS = 5_000;

export function StatsProvider({ children }: { children: ReactNode }) {
  const ringsRef = useRef<Record<StatsSource, Ring>>({
    direct:       { ts: [], lastRowCount: 0, lastTickAt: null },
    dataservices: { ts: [], lastRowCount: 0, lastTickAt: null },
  });

  const recordTick = useCallback(
    (source: StatsSource, ts: number, rowCount: number) => {
      const r = ringsRef.current[source];
      r.ts.push(ts);
      r.lastTickAt = ts;
      r.lastRowCount = rowCount;
      const cutoff = ts - WINDOW_MS;
      while (r.ts.length > 0 && r.ts[0] < cutoff) r.ts.shift();
    },
    [],
  );

  const read = useCallback((source: StatsSource): SourceStats => {
    const r = ringsRef.current[source];
    const now = Date.now();
    const cutoff = now - WINDOW_MS;
    while (r.ts.length > 0 && r.ts[0] < cutoff) r.ts.shift();
    return {
      rowCount: r.lastRowCount,
      ticksPerSec: r.ts.length / (WINDOW_MS / 1000),
      lastTickAt: r.lastTickAt,
    };
  }, []);

  const value = useMemo<Ctx>(() => ({ recordTick, read }), [recordTick, read]);

  return <StatsCtx.Provider value={value}>{children}</StatsCtx.Provider>;
}

export function useStats(): Ctx {
  const ctx = useContext(StatsCtx);
  if (!ctx) throw new Error('useStats must be used inside <StatsProvider>');
  return ctx;
}
